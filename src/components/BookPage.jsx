import { useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { db } from '../db/indexedDb'
import { BookmarkArt, bookmarkPresets } from '../data/botanicals.jsx'

export default function BookPage({ pdf, pageNo, viewMode, bookId, marks, bookmarks, registerPage, brightness, zoom, fitToScreen, activeMarkTool, activeMarkColor, activeUnderlineStyle, selectedMarkId, onMarkSaved, onMarkSelect, onToast, onOpenBookmarks, notePlacementMode, onPlaceInPageNote, refresh, finishedStamp, totalPages }) {
  const [inPageNotes, setInPageNotes] = useState([])
  const [expandedInPageNoteId, setExpandedInPageNoteId] = useState(null)

  function handleInPageNotePlacement(event) {
    if (!notePlacementMode) return
    onPlaceInPageNote?.(event, pageNo)
  }

  const [stickyNotes, setStickyNotes] = useState([])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  // load sticky notes
  useEffect(() => {
    if (!bookId || !pageNo) return

    db.notes
      .where('[bookId+page]')
      .equals([bookId, pageNo])
      .toArray()
      .then((items) => setStickyNotes(items.filter((note) => note.kind === 'sticky')))
      .catch(() => setStickyNotes([]))
  }, [bookId, pageNo, refresh])

  // load in-page notes
  useEffect(() => {
    if (!bookId || !pageNo) return

    db.notes
      .where('bookId')
      .equals(bookId)
      .toArray()
      .then((items) => {
        setInPageNotes(
          items.filter((note) => note.kind === 'inpage' && Number(note.page) === Number(pageNo))
        )
      })
      .catch(() => setInPageNotes([]))
  }, [bookId, pageNo, refresh])

  const canvasRef = useRef(null)
  const textRef = useRef(null)
  const pageRef = useRef(null)
  const taskRef = useRef(null)
  const runRef = useRef(0)
  const dragRef = useRef(null)
  const [draftMark, setDraftMark] = useState(null)

  useEffect(() => {
    registerPage(pageNo, pageRef.current)
    return () => registerPage(pageNo, null)
  }, [pageNo, registerPage])

  useEffect(() => {
    if (!pdf || !pageNo) return
    render()
    return () => taskRef.current?.cancel?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, pageNo, viewMode, zoom, fitToScreen])

  async function render() {
    const run = ++runRef.current
    setReady(false)
    setError('')
    try {
      taskRef.current?.cancel?.()
      const pdfPage = await pdf.getPage(pageNo)
      if (run !== runRef.current) return

      const base = pdfPage.getViewport({ scale: 1 })
      const w = window.innerWidth || 1200
      const h = window.innerHeight || 800
      const horizontalAllowance = viewMode === 'spread' ? w * 0.405 : w * 0.76
      const verticalAllowance = h * 0.78
      const fitScale = Math.min(horizontalAllowance / base.width, verticalAllowance / base.height)
      const manualScale = fitToScreen ? fitScale : fitScale * zoom
      const scale = Math.max(0.45, Math.min(2.8, manualScale))
      const viewport = pdfPage.getViewport({ scale })

      const canvas = canvasRef.current
      const textLayer = textRef.current
      const pageNode = pageRef.current
      if (!canvas || !textLayer || !pageNode) return

      const dpr = window.devicePixelRatio || 1
      const ctx = canvas.getContext('2d', { alpha: false })
      canvas.width = Math.floor(viewport.width * dpr)
      canvas.height = Math.floor(viewport.height * dpr)
      canvas.style.width = `${Math.floor(viewport.width)}px`
      canvas.style.height = `${Math.floor(viewport.height)}px`
      pageNode.style.width = canvas.style.width
      pageNode.style.height = canvas.style.height
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = '#F3E6C8'
      ctx.fillRect(0, 0, viewport.width, viewport.height)

      const task = pdfPage.render({ canvasContext: ctx, viewport })
      taskRef.current = task
      await task.promise
      if (run !== runRef.current) return

      try {
        await renderTextLayer(pdfPage, viewport)
      } catch (textErr) {
        console.warn('Text layer unavailable; coordinate marks still work.', textErr)
      }
      if (run !== runRef.current) return
      setReady(true)
    } catch (err) {
      if (err?.name === 'RenderingCancelledException') return
      console.error(err)
      setReady(true)
      setError('This page could not be prepared. Try zooming, changing page, or reopening the PDF.')
    }
  }

  async function renderTextLayer(pdfPage, viewport) {
    const textLayer = textRef.current
    if (!textLayer) return
    textLayer.innerHTML = ''
    textLayer.style.width = `${viewport.width}px`
    textLayer.style.height = `${viewport.height}px`
    const textContent = await pdfPage.getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false })

    textContent.items.forEach((item, index) => {
      if (!item.str) return
      const tx = pdfjsLib.Util.transform(viewport.transform, item.transform)
      const angle = Math.atan2(tx[1], tx[0])
      const fontHeight = Math.hypot(tx[2], tx[3]) || Math.abs(tx[0]) || 10
      const width = Math.max(1, (item.width || item.str.length * 5) * viewport.scale)
      const span = document.createElement('span')
      span.textContent = item.str
      span.dataset.page = String(pageNo)
      span.dataset.index = String(index)
      span.style.left = `${tx[4]}px`
      span.style.top = `${tx[5] - fontHeight}px`
      span.style.fontSize = `${Math.max(5, fontHeight)}px`
      span.style.fontFamily = item.fontName || 'serif'
      span.style.width = `${width}px`
      span.style.height = `${fontHeight * 1.24}px`
      span.style.transform = `rotate(${angle}rad)`
      span.style.transformOrigin = '0 0'
      textLayer.appendChild(span)
    })
  }

  function pointerPoint(event) {
    const source = event.touches?.[0] || event.changedTouches?.[0] || event
    const box = pageRef.current?.getBoundingClientRect()
    if (!box || !source) return null
    return {
      x: Math.max(0, Math.min(source.clientX - box.left, box.width)),
      y: Math.max(0, Math.min(source.clientY - box.top, box.height)),
      box,
    }
  }

  function rectFromPoints(a, b) {
    if (!a || !b) return null
    const left = Math.min(a.x, b.x)
    const top = Math.min(a.y, b.y)
    const width = Math.abs(a.x - b.x)
    const height = Math.abs(a.y - b.y)
    if (width < 5 || height < 5) return null
    return { left, top, width, height }
  }

  function normalizeRect(rect) {
    const box = pageRef.current?.getBoundingClientRect()
    if (!box || !rect) return rect
    return {
      left: rect.left / box.width,
      top: rect.top / box.height,
      width: rect.width / box.width,
      height: rect.height / box.height,
    }
  }

  function displayRect(mark, rect) {
    const box = pageRef.current?.getBoundingClientRect()
    if (!box || !rect) return rect
    if (mark?.normalized) {
      return {
        left: rect.left * box.width,
        top: rect.top * box.height,
        width: rect.width * box.width,
        height: rect.height * box.height,
      }
    }
    return rect
  }

  function getTextWithinRect(rect) {
    const layer = textRef.current
    const pageNode = pageRef.current
    if (!layer || !pageNode || !rect) return ''
    const pageBox = pageNode.getBoundingClientRect()
    const target = {
      left: pageBox.left + rect.left,
      right: pageBox.left + rect.left + rect.width,
      top: pageBox.top + rect.top,
      bottom: pageBox.top + rect.top + rect.height,
    }
    const words = []
    layer.querySelectorAll('span').forEach((span) => {
      const r = span.getBoundingClientRect()
      const overlaps = r.right >= target.left && r.left <= target.right && r.bottom >= target.top && r.top <= target.bottom
      if (overlaps && span.textContent) words.push(span.textContent)
    })
    return words.join(' ').replace(/\s+/g, ' ').trim().slice(0, 1200)
  }

  function startMark(event) {
    if (!activeMarkTool) return
    event.preventDefault()
    event.stopPropagation()
    const p = pointerPoint(event)
    if (!p) return
    dragRef.current = { start: p, current: p }
    setDraftMark({ left: p.x, top: p.y, width: 0, height: 0 })
  }

  function moveMark(event) {
    if (!activeMarkTool || !dragRef.current) return
    event.preventDefault()
    const p = pointerPoint(event)
    if (!p) return
    dragRef.current.current = p
    const rect = rectFromPoints(dragRef.current.start, p)
    if (rect) setDraftMark(rect)
  }

  async function finishMark(event) {
    if (!activeMarkTool || !dragRef.current) return
    event.preventDefault()
    event.stopPropagation()
    const p = pointerPoint(event)
    const rect = rectFromPoints(dragRef.current.start, p || dragRef.current.current)
    dragRef.current = null
    setDraftMark(null)
    if (!rect) return
    const now = Date.now()
    const payload = {
      bookId,
      page: pageNo,
      text: getTextWithinRect(rect) || (activeMarkTool === 'underline' ? 'Underline' : 'Highlight'),
      color: activeMarkColor || (activeMarkTool === 'underline' ? '#6b4a2ecc' : '#d8b65d88'),
      kind: activeMarkTool,
      style: activeMarkTool === 'underline' ? activeUnderlineStyle || 'solid' : 'soft',
      rects: [normalizeRect(rect)],
      normalized: true,
      pageWidth: pageRef.current?.getBoundingClientRect()?.width || null,
      pageHeight: pageRef.current?.getBoundingClientRect()?.height || null,
      createdAt: now,
      updatedAt: now,
    }
    const id = await db.highlights.add(payload)
    onMarkSaved?.({ type: 'add', mark: { ...payload, id } })
    onToast?.(activeMarkTool === 'underline' ? 'Underline added.' : 'Highlight added.')
  }

  function selectMark(event, mark) {
    if (activeMarkTool) return
    event.preventDefault()
    event.stopPropagation()
    onMarkSelect?.(mark)
  }

  const dim = brightness < 0 ? Math.abs(brightness) / 100 : 0
  const glow = brightness > 0 ? brightness / 100 : 0
  const presetFor = (b) => bookmarkPresets.find((p) => p.id === b.flowerPreset)

  return (
    <article onClick={handleInPageNotePlacement} onDoubleClick={handleInPageNotePlacement} className={`pdf-page ${ready ? 'is-ready' : 'is-loading'} ${activeMarkTool ? 'marking-active' : ''} ${notePlacementMode ? 'inpage-placement-active' : ''}`} ref={pageRef} data-page={pageNo} onMouseDown={startMark} onMouseMove={moveMark} onMouseUp={finishMark} onMouseLeave={finishMark} onTouchStart={startMark} onTouchMove={moveMark} onTouchEnd={finishMark}>
      <canvas ref={canvasRef} />
      <div className="mark-layer" aria-label="Private annotation overlay">
        {draftMark && <span className={activeMarkTool === 'underline' ? `underline-rect draft style-${activeUnderlineStyle || 'solid'}` : 'highlight-rect draft'} style={{ '--kaagaz-brightness-pos': Math.max(0, brightness || 0), '--kaagaz-brightness-neg': Math.max(0, -(brightness || 0)), '--kaagaz-brightness': brightness || 0, '--kaagaz-dim': Math.max(0, -(brightness || 0)), left: draftMark.left, top: draftMark.top, width: draftMark.width, height: draftMark.height, background: activeMarkTool === 'underline' ? undefined : activeMarkColor, borderColor: activeMarkTool === 'underline' ? activeMarkColor : undefined, color: activeMarkTool === 'underline' ? activeMarkColor : undefined }} />}
        {marks.map((h) =>
          h.rects.map((raw, i) => {
            const r = displayRect(h, raw)
            return (
            <button
              key={`${h.id}-${i}`}
              className={`${h.kind === 'underline' ? `underline-rect style-${h.style || 'solid'}` : 'highlight-rect'} ${selectedMarkId === h.id ? 'selected' : ''}`}
              title={h.kind === 'underline' ? 'Click to edit underline' : 'Click to edit highlight'}
              data-tooltip={h.kind === 'underline' ? 'Edit underline' : 'Edit highlight'}
              style={{
                left: r.left,
                top: r.top,
                width: r.width,
                height: r.height,
                background: h.kind === 'underline' ? undefined : h.color,
                borderColor: h.kind === 'underline' ? h.color : undefined,
                color: h.kind === 'underline' ? h.color : undefined,
              }}
              onClick={(event) => selectMark(event, h)}
            />
          )}),
        )}
      </div>
      <div className="text-layer" ref={textRef} />
      <div className="brightness-layer dark" style={{ opacity: dim }} />
      <div className="brightness-layer light" style={{ opacity: glow }} />
      <div className="page-corner-bookmarks">
        {bookmarks.slice(0, 3).map((b, i) => (
          <button key={b.id} className={`corner-bookmark corner-${i}`} onClick={onOpenBookmarks} title={b.title || `Bookmark on page ${b.page}`}>
            {b.imageUrl ? <img src={b.imageUrl} alt="Custom bookmark" /> : <BookmarkArt preset={presetFor(b)} size={64} />}
          </button>
        ))}
      </div>
      {!ready && <div className="page-loading">Preparing page…</div>}
      {error && <div className="page-error">{error}</div>}
      {finishedStamp && pageNo === totalPages && (
        <div className="finished-page-stamp" title="Finished reading stamp">
          <strong>Finished</strong>
          <span>{new Date(finishedStamp).toLocaleDateString()}</span>
          <small>{new Date(finishedStamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
        </div>
      )}
      {stickyNotes.map((note) => (
        <div
          key={note.id}
          className={`sticky-note-card ${note.color || 'pastel-amber'}`}
          style={{ left: `${note.x * 100}%`, top: `${note.y * 100}%` }}
          title="Sticky note"
        >
          {note.content}
        </div>
      ))}
      {inPageNotes.map((note) => {
        const expanded = expandedInPageNoteId === note.id
        return (
          <button
            key={note.id}
            type="button"
            className={`inpage-note-pin ${expanded ? 'expanded' : ''} ${note.color || 'pastel-amber'}`}
            style={{ left: `${note.x * 100}%`, top: `${note.y * 100}%` }}
            title={expanded ? 'Collapse in-page note' : 'Open in-page note'}
            onClick={(event) => {
              event.stopPropagation()
              setExpandedInPageNoteId(expanded ? null : note.id)
            }}
          >
            <span className="inpage-note-dot">✦</span>
            {expanded && <span className="inpage-note-content">{note.content}</span>}
          </button>
        )
      })}
      <span className="page-number-chip">{pageNo}</span>
    </article>
  )
}
