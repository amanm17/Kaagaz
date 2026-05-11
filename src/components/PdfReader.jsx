import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { db, getSetting, saveSetting } from '../db/indexedDb'
import BookmarkPanel from './BookmarkPanel'
import NotesPanel from './NotesPanel'
import MarkToolbar, { markColors, underlineStyles } from './MarkToolbar'
import BookPage from './BookPage'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker

export default function PdfReader({ bookId, file, onHome }) {
  const [book, setBook] = useState(null)
  const [pdf, setPdf] = useState(null)
  const [page, setPage] = useState(1)
  const [pendingPageTurn, setPendingPageTurn] = useState(null)
  const [totalPages, setTotalPages] = useState(0)
  const [viewMode, setViewMode] = useState('single')
  const [flipMode, setFlipMode] = useState(false)
  const [showProgress, setShowProgress] = useState(true)
  const [showArrows, setShowArrows] = useState(false)
  const [toolbarPosition, setToolbarPosition] = useState('left')
  const [brightness, setBrightness] = useState(0)
  const [brightnessOpen, setBrightnessOpen] = useState(false)
  const [brightnessAnchorStyle, setBrightnessAnchorStyle] = useState(null)
  const [jacket, setJacket] = useState({ type: 'walnut', value: '' })
  const [jacketOpen, setJacketOpen] = useState(false)
  const [activeMarkTool, setActiveMarkTool] = useState(null)
  const [stickyNoteMode, setStickyNoteMode] = useState(false)
  const [activeMarkColor, setActiveMarkColor] = useState('#d8b65d88')
  const [activeUnderlineStyle, setActiveUnderlineStyle] = useState('solid')
  const [selectedMark, setSelectedMark] = useState(null)
  const [undoStack, setUndoStack] = useState([])
  const [redoStack, setRedoStack] = useState([])
  const [zoom, setZoom] = useState(1)
  const [fitToScreen, setFitToScreen] = useState(true)
  const [readerPresenterMode, setReaderPresenterMode] = useState(false)
  const [toolbarHidden, setToolbarHidden] = useState(false)
  const [pomodoroOpen, setPomodoroOpen] = useState(false)
  const [timeMode, setTimeMode] = useState('spent')
  const [timeSpent, setTimeSpent] = useState(0)
  const [timerInput, setTimerInput] = useState('25')
  const [timerRemaining, setTimerRemaining] = useState(25 * 60)
  const [timerRunning, setTimerRunning] = useState(false)
  const [autoStartTimer, setAutoStartTimer] = useState(false)
  const [bookmarksOpen, setBookmarksOpen] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const [notePlacementMode, setNotePlacementMode] = useState(false)
  const [pendingInPageNote, setPendingInPageNote] = useState('')
  const [bookmarks, setBookmarks] = useState([])
  const [marks, setMarks] = useState([])
  const [refresh, setRefresh] = useState(0)
  const [turning, setTurning] = useState('')
  const [toast, setToast] = useState('')
  const [openingBookmarkSlip, setOpeningBookmarkSlip] = useState(false)
  const shellRef = useRef(null)
  const activePageRefs = useRef(new Map())
  const swipeRef = useRef({ x: 0, y: 0, t: 0 })
  const wheelLockRef = useRef(0)
  const wheelAccumRef = useRef({ x: 0, y: 0, t: 0 })
  const toolbarTimerRef = useRef(null)
  const timerRef = useRef(null)
  const hydratedRef = useRef(false)
  const latestRef = useRef({})

  useEffect(() => {
    latestRef.current = { jacket, timeSpent, timeMode, timerInput, timerRemaining, autoStartTimer }
  }, [jacket, timeSpent, timeMode, timerInput, timerRemaining, autoStartTimer])

  async function persistBookSettings(patch = {}) {
    if (!bookId || !hydratedRef.current) return
    const current = await db.bookSettings.get(bookId) || { bookId }
    const latest = latestRef.current
    await db.bookSettings.put({
      ...current,
      bookId,
      jacket: patch.jacket ?? latest.jacket ?? current.jacket ?? { type: 'walnut', value: '' },
      timeSpent: patch.timeSpent ?? latest.timeSpent ?? current.timeSpent ?? 0,
      timeMode: patch.timeMode ?? latest.timeMode ?? current.timeMode ?? 'spent',
      timerMinutes: patch.timerMinutes ?? Math.max(1, Number(latest.timerInput) || current.timerMinutes || 25),
      timerRemaining: patch.timerRemaining ?? latest.timerRemaining ?? current.timerRemaining ?? ((current.timerMinutes || 25) * 60),
      autoStartTimer: patch.autoStartTimer ?? latest.autoStartTimer ?? current.autoStartTimer ?? false,
      updatedAt: Date.now(),
    })
  }

  useEffect(() => {
    boot()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, file])

  useEffect(() => {
    loadBookBits()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, refresh])

  useEffect(() => {
    saveSetting('showProgress', showProgress)
    saveSetting('flipMode', flipMode)
    saveSetting('viewMode', viewMode)
    saveSetting('showArrows', showArrows)
    saveSetting('toolbarPosition', toolbarPosition)
    saveSetting('brightness', brightness)
    // Jacket is persisted per book below; keep this only as a fallback for very old records.
    saveSetting('zoom', zoom)
    saveSetting('fitToScreen', fitToScreen)
  }, [showProgress, flipMode, viewMode, showArrows, toolbarPosition, brightness, jacket, zoom, fitToScreen])




  useEffect(() => {
    persistBookSettings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, jacket, timeSpent, timeMode, timerInput, timerRemaining, autoStartTimer])

  useEffect(() => {
    window.clearInterval(timerRef.current)
    if (!timerRunning) return
    timerRef.current = window.setInterval(() => {
      if (timeMode === 'spent') {
        setTimeSpent((v) => v + 1)
      } else {
        setTimerRemaining((v) => {
          if (v <= 1) {
            window.clearInterval(timerRef.current)
            setTimerRunning(false)
            showToast('Timer complete.')
            return 0
          }
          return v - 1
        })
      }
    }, 1000)
    return () => window.clearInterval(timerRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerRunning, timeMode])

  function fmtTime(seconds) {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
  }

  async function handleHomeClick() {
    setTimerRunning(false)
    await persistBookSettings()
    onHome?.()
  }

  function resetClock() {
    setTimerRunning(false)
    if (timeMode === 'spent') setTimeSpent(0)
    else setTimerRemaining(Math.max(1, Number(timerInput) || 25) * 60)
  }

  useEffect(() => {
    function handleVisibilityTimer() {
      if (document.hidden) {
        setTimerRunning(false)
        persistBookSettings()
        return
      }
      // If the reader was meant to auto-start, restart when the user returns
      // from another tab/window/desktop. This does not alter in-app page navigation.
      if (autoStartTimer) {
        setTimerRunning(true)
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityTimer)
    window.addEventListener('focus', handleVisibilityTimer)
    window.addEventListener('blur', handleVisibilityTimer)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityTimer)
      window.removeEventListener('focus', handleVisibilityTimer)
      window.removeEventListener('blur', handleVisibilityTimer)
    }
  }, [bookId, jacket, timeSpent, timeMode, timerInput, timerRemaining, autoStartTimer])

  useEffect(() => {
    return () => {
      persistBookSettings()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId])

  useEffect(() => {
    function revealTemporarily() {
      setToolbarHidden(false)
      window.clearTimeout(toolbarTimerRef.current)
      toolbarTimerRef.current = window.setTimeout(() => setToolbarHidden(true), 3600)
    }
    revealTemporarily()
    window.addEventListener('mousemove', revealTemporarily)
    window.addEventListener('keydown', revealTemporarily)
    window.addEventListener('touchstart', revealTemporarily, { passive: true })
    return () => {
      window.clearTimeout(toolbarTimerRef.current)
      window.removeEventListener('mousemove', revealTemporarily)
      window.removeEventListener('keydown', revealTemporarily)
      window.removeEventListener('touchstart', revealTemporarily)
    }
  }, [])

  async function boot() {
    hydratedRef.current = false
    try {
      const b = await db.books.get(bookId)
      setBook(b)
      setShowProgress(await getSetting('showProgress', true))
      setFlipMode(await getSetting('flipMode', false))
      setViewMode(await getSetting('viewMode', 'single'))
      setShowArrows(await getSetting('showArrows', false))
      setToolbarPosition(await getSetting('toolbarPosition', 'left'))
      setBrightness(await getSetting('brightness', 0))
      const bookSpecificSettings = await db.bookSettings.get(bookId)
      setJacket(bookSpecificSettings?.jacket || b?.jacket || { type: 'walnut', value: '' })
      setTimeSpent(bookSpecificSettings?.timeSpent || 0)
      setTimerInput(bookSpecificSettings?.timerMinutes ? String(bookSpecificSettings.timerMinutes) : '25')
      setTimeMode(bookSpecificSettings?.timeMode || 'spent')
      setTimerRemaining(bookSpecificSettings?.timerRemaining ?? ((bookSpecificSettings?.timerMinutes || 25) * 60))
      setAutoStartTimer(Boolean(bookSpecificSettings?.autoStartTimer))
      setTimerRunning(Boolean(bookSpecificSettings?.autoStartTimer))
      setZoom(await getSetting('zoom', 1))
      setFitToScreen(await getSetting('fitToScreen', true))

      const sourceFile = file || (await db.files.get(bookId))?.blob
      if (!sourceFile) throw new Error('The local PDF file could not be found. Please upload it again.')
      const buffer = await sourceFile.arrayBuffer()
      const doc = await pdfjsLib.getDocument({ data: buffer }).promise
      setPdf(doc)
      setTotalPages(doc.numPages)
      ensureThumbnail(doc, b)
      const lastBookmark = b?.lastBookmarkId ? await db.bookmarks.get(b.lastBookmarkId) : null
      const start = b?.lastPage || 1
      setPage(normalizeStart(Math.min(Math.max(start, 1), doc.numPages), await getSetting('viewMode', 'single')))
      await db.books.update(bookId, { totalPages: doc.numPages, updatedAt: Date.now() })
      hydratedRef.current = true
      showToast('Opened where you left off.')
    } catch (error) {
      console.error(error)
      showToast(error?.message || 'Could not open this PDF.')
    }
  }

  async function loadBookBits() {
    if (!bookId) return
    const bm = await db.bookmarks.where('bookId').equals(bookId).toArray()
    const assets = await db.assets.where('bookId').equals(bookId).toArray()
    const withImages = bm.map((b) => {
      const asset = assets.find((a) => a.bookmarkId === b.id && a.kind === 'bookmark-image')
      return asset ? { ...b, imageUrl: URL.createObjectURL(asset.blob) } : b
    })
    setBookmarks(withImages)
    setMarks(await db.highlights.where('bookId').equals(bookId).toArray())
  }


  async function ensureThumbnail(doc, b) {
    if (b?.thumbnail) return
    try {
      const first = await doc.getPage(1)
      const vp0 = first.getViewport({ scale: 1 })
      const scale = 190 / vp0.width
      const viewport = first.getViewport({ scale })
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d', { alpha: false })
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      ctx.fillStyle = '#F3E6C8'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await first.render({ canvasContext: ctx, viewport }).promise
      await db.books.update(bookId, { thumbnail: canvas.toDataURL('image/jpeg', 0.72), updatedAt: Date.now() })
    } catch (err) {
      console.warn('Thumbnail generation skipped', err)
    }
  }

  function normalizeStart(p, mode = viewMode) {
    if (mode !== 'spread') return p
    return p % 2 === 0 ? p - 1 : p
  }

  const pages = useMemo(() => {
    if (!totalPages) return []
    if (viewMode === 'spread') return [page, page + 1].filter((p) => p >= 1 && p <= totalPages)
    return [page]
  }, [page, totalPages, viewMode])

  const registerPage = useCallback((pageNo, node) => {
    if (!node) activePageRefs.current.delete(pageNo)
    else activePageRefs.current.set(pageNo, node)
  }, [])

  async function persistPage(next) {
    await db.books.update(bookId, { lastPage: next, updatedAt: Date.now() })
  }

  function go(delta) {
    const step = viewMode === 'spread' ? 2 : 1
    const next = Math.min(Math.max(page + delta * step, 1), totalPages || 1)
    const normalized = normalizeStart(next)
    if (normalized === page) return
    setTurning(delta > 0 ? 'turn-next' : 'turn-prev')
    setPage(normalized)
    persistPage(normalized)
    setTimeout(() => setTurning(''), 520)
  }

  function jump(p) {
    const next = normalizeStart(Math.min(Math.max(p, 1), totalPages || 1))
    setPage(next)
    persistPage(next)
    setRefresh((x) => x + 1)
  }

  function triggerOpeningBookmarkSlip() {
    setOpeningBookmarkSlip(true)
    window.setTimeout(() => setOpeningBookmarkSlip(false), 1450)
  }

  function showToast(message) {
    if (!message) return
    setToast(message)
    window.clearTimeout(showToast.timer)
    showToast.timer = window.setTimeout(() => setToast(''), 2600)
  }

  function togglePanel(panel) {
    if (panel === 'bookmarks') {
      setBookmarksOpen((open) => !open)
      setNotesOpen(false)
    } else {
      setNotesOpen((open) => !open)
      setBookmarksOpen(false)
    }
  }

  function handleWheelGesture(event) {
    const now = Date.now()
    const e = event.nativeEvent || event
    if (now - wheelLockRef.current < 520) return

    // Trackpads often emit many small horizontal deltas rather than one large event.
    const acc = wheelAccumRef.current
    if (now - acc.t > 420) {
      acc.x = 0
      acc.y = 0
    }
    acc.t = now
    acc.x += e.deltaX || 0
    acc.y += e.deltaY || 0

    const strongHorizontal = Math.abs(acc.x) > 78 && Math.abs(acc.x) > Math.abs(acc.y) * 1.18
    const fastHorizontal = Math.abs(e.deltaX || 0) > 34 && Math.abs(e.deltaX || 0) > Math.abs(e.deltaY || 0) * 1.1
    if (strongHorizontal || fastHorizontal) {
      e.preventDefault?.()
      wheelLockRef.current = now
      const dir = acc.x > 0 || e.deltaX > 0 ? 1 : -1
      wheelAccumRef.current = { x: 0, y: 0, t: now }
      go(dir)
    }
  }

  function onWheel(e) {
    handleWheelGesture(e)
  }

  function onTouchStart(e) {
    const t = e.touches?.[0]
    if (!t) return
    swipeRef.current = { x: t.clientX, y: t.clientY, t: Date.now() }
  }

  function onTouchEnd(e) {
    const t = e.changedTouches?.[0]
    if (!t) return
    const dx = t.clientX - swipeRef.current.x
    const dy = t.clientY - swipeRef.current.y
    if (Math.abs(dx) > 54 && Math.abs(dx) > Math.abs(dy) * 1.35) go(dx < 0 ? 1 : -1)
  }



  useEffect(() => {
    const node = shellRef.current
    if (!node) return
    const listener = (e) => handleWheelGesture(e)
    node.addEventListener('wheel', listener, { passive: false })
    return () => node.removeEventListener('wheel', listener)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, totalPages, viewMode])

  useEffect(() => {
    function onKey(e) {
      const tag = document.activeElement?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable) return
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault()
        go(1)
      }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault()
        go(-1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [page, totalPages, viewMode])

  function setBookJacket(next) {
    setJacket(next)
    if (bookId) {
      persistBookSettings({ jacket: next })
      db.books.update(bookId, { jacket: next, updatedAt: Date.now() })
    }
  }

  function jacketStyle() {
    if (jacket?.type === 'custom' && jacket.value) return { backgroundImage: `linear-gradient(rgba(22,11,7,.32), rgba(22,11,7,.52)), url(${jacket.value})` }
    if (jacket?.type === 'oxblood') return { background: 'radial-gradient(circle at 22% 12%, rgba(176,138,71,.18), transparent 28%), linear-gradient(135deg, #2b0f0e, #5b1d18 48%, #1b0f0a)' }
    if (jacket?.type === 'forest') return { background: 'radial-gradient(circle at 70% 20%, rgba(176,138,71,.14), transparent 28%), linear-gradient(135deg, #10180f, #2e4326 48%, #130f0a)' }
    if (jacket?.type === 'midnight') return { background: 'radial-gradient(circle at 30% 20%, rgba(176,138,71,.16), transparent 28%), linear-gradient(135deg, #10131f, #232942 48%, #0d0b10)' }
    return {}
  }

  async function pickJacketImage(file) {
    if (!file) return
    const url = await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.readAsDataURL(file)
    })
    setBookJacket({ type: 'custom', value: url })
    showToast('Custom book jacket applied.')
  }

  async function markCurrentBookFinished() {
    if (!bookId) return
    const now = Date.now()
    await db.books.update(bookId, { finishedAt: now, updatedAt: now })
    setBook((b) => ({ ...b, finishedAt: now, updatedAt: now }))
    showToast('Marked as finished.')
  }

  async function removeCurrentFinishedStamp() {
    if (!book?.finishedAt) return
    const ok = window.confirm('Remove the finished stamp from this PDF?')
    if (!ok) return
    await db.books.update(bookId, { finishedAt: null, updatedAt: Date.now() })
    setBook((b) => ({ ...b, finishedAt: null, updatedAt: Date.now() }))
    showToast('Finished stamp removed.')
  }

  function requestPageChange(targetPage, direction = 'next') {
    const safeTarget = Math.max(1, Math.min(totalPages || targetPage, targetPage))

    if (!flipMode || safeTarget === page) {
      jump(safeTarget)
      return
    }

    setPendingPageTurn(direction)

    window.setTimeout(() => {
      jump(safeTarget)
      setPendingPageTurn(null)
    }, 560)
  }

  function scrubToProgress(clientX) {
    if (!totalPages) return

    const bar = document.querySelector('.floating-progress')
    if (!bar) return

    const rect = bar.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))

    let targetPage = Math.round(ratio * totalPages)
    targetPage = Math.max(1, Math.min(totalPages, targetPage || 1))

    // In two-page view, snap to the beginning of the nearest spread.
    if (viewMode === 2) {
      targetPage = targetPage % 2 === 0 ? targetPage - 1 : targetPage
      targetPage = Math.max(1, Math.min(totalPages, targetPage))
    }

    requestPageChange(targetPage, targetPage >= page ? 'next' : 'prev')
  }

  function handleProgressPointerDown(event) {
    event.preventDefault()
    event.stopPropagation()

    scrubToProgress(event.clientX)

    const handleMove = (moveEvent) => {
      moveEvent.preventDefault()
      scrubToProgress(moveEvent.clientX)
    }

    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleUp)
    }

    window.addEventListener('pointermove', handleMove, { passive: false })
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleUp)
  }

  async function placeInPageNote(event, pageNo = page) {
    if (!notePlacementMode || !bookId) return

    event.preventDefault?.()
    event.stopPropagation?.()

    const pageEl = event.currentTarget?.closest?.('.pdf-page') || event.target?.closest?.('.pdf-page')
    if (!pageEl) return

    const content = (pendingInPageNote || '').trim()
    if (!content) {
      showToast('Write an in-page note first.')
      return
    }

    const rect = pageEl.getBoundingClientRect()
    if (!rect.width || !rect.height) return

    const x = Math.max(0.025, Math.min(0.975, (event.clientX - rect.left) / rect.width))
    const y = Math.max(0.025, Math.min(0.975, (event.clientY - rect.top) / rect.height))

    await db.notes.add({
      bookId,
      page: pageNo,
      kind: 'inpage',
      content,
      x,
      y,
      color: 'pastel-amber',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })

    setPendingInPageNote('')
    setNotePlacementMode(false)
    setRefresh((value) => value + 1)
    showToast('In-page note pinned.')
  }

  async function capturePages() {
    const nodes = pages.map((p) => activePageRefs.current.get(p)).filter(Boolean)
    if (!nodes.length) return
    const bitmaps = nodes.map((node) => {
      const canvas = node.querySelector('canvas')
      return { node, canvas, rect: node.getBoundingClientRect(), pageNo: Number(node.dataset.page) }
    }).filter((x) => x.canvas)
    if (!bitmaps.length) return

    const gap = viewMode === 'spread' && bitmaps.length > 1 ? 28 : 0
    const width = Math.round(bitmaps.reduce((s, b) => s + b.canvas.width, 0) + gap * Math.max(0, bitmaps.length - 1))
    const height = Math.round(Math.max(...bitmaps.map((b) => b.canvas.height)))
    const out = document.createElement('canvas')
    out.width = width
    out.height = height
    const ctx = out.getContext('2d')
    ctx.fillStyle = '#F3E6C8'
    ctx.fillRect(0, 0, width, height)

    let x = 0
    for (const b of bitmaps) {
      const ratio = b.canvas.width / b.rect.width
      ctx.drawImage(b.canvas, x, 0)
      const pageMarks = marks.filter((m) => m.page === b.pageNo)
      const markRect = (m, r) => m.normalized
        ? { left: r.left * b.rect.width, top: r.top * b.rect.height, width: r.width * b.rect.width, height: r.height * b.rect.height }
        : r
      for (const m of pageMarks) {
        ctx.save()
        if (m.kind === 'underline') {
          ctx.strokeStyle = m.color || '#6b4a2ecc'
          ctx.lineWidth = Math.max(2, 3 * ratio)
          if (m.style === 'dashed') ctx.setLineDash([8 * ratio, 5 * ratio])
          if (m.style === 'dotted') ctx.setLineDash([1 * ratio, 5 * ratio])
          for (const raw of m.rects) {
            const r = markRect(m, raw)
            const y = (r.top + r.height - 2) * ratio
            ctx.beginPath()
            if (m.style === 'squiggly' || m.style === 'squiggly') {
              const amp = (m.style === 'squiggly' ? 4 : 2.8) * ratio
              const step = 8 * ratio
              for (let xx = 0; xx <= r.width * ratio; xx += step) {
                const yy = y + Math.sin(xx / step * Math.PI * 2) * amp
                if (xx === 0) ctx.moveTo(x + r.left * ratio + xx, yy)
                else ctx.lineTo(x + r.left * ratio + xx, yy)
              }
            } else {
              ctx.moveTo(x + r.left * ratio, y)
              ctx.lineTo(x + (r.left + r.width) * ratio, y)
            }
            ctx.stroke()
          }
        } else {
          ctx.fillStyle = m.color || '#d8b65d88'
          ctx.globalCompositeOperation = 'multiply'
          for (const raw of m.rects) {
            const r = markRect(m, raw)
            ctx.fillRect(x + r.left * ratio, r.top * ratio, r.width * ratio, r.height * ratio)
          }
        }
        ctx.restore()
      }
      if (book?.finishedAt && b.pageNo === totalPages) {
        ctx.save()
        const stampText = `FINISHED · ${new Date(book.finishedAt).toLocaleDateString()}`
        ctx.translate(x + b.canvas.width - 158, 92)
        ctx.rotate(-0.16)
        ctx.strokeStyle = 'rgba(126,53,42,.78)'
        ctx.fillStyle = 'rgba(126,53,42,.78)'
        ctx.lineWidth = 5
        ctx.beginPath()
        ctx.arc(0, 0, 72, 0, Math.PI * 2)
        ctx.stroke()
        ctx.font = '700 18px Georgia, serif'
        ctx.textAlign = 'center'
        ctx.fillText('FINISHED', 0, -6)
        ctx.font = '600 10px ui-sans-serif'
        ctx.fillText(new Date(book.finishedAt).toLocaleString(), 0, 18)
        ctx.restore()
      }
      x += b.canvas.width + gap
    }
    const url = out.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = url
    a.download = `${book?.name || 'kaagaz-page'}-page-${page}.png`
    a.click()
    showToast('Captured the edited page view as an image.')
  }


  function remember(action) {
    setUndoStack((stack) => [...stack.slice(-24), action])
    setRedoStack([])
  }

  async function handleMarkSaved(action) {
    if (action) remember(action)
    setSelectedMark(action?.mark || null)
    setRefresh((x) => x + 1)
  }

  async function undoMark() {
    const action = undoStack[undoStack.length - 1]
    if (!action) return
    setUndoStack((stack) => stack.slice(0, -1))
    if (action.type === 'add') {
      await db.highlights.delete(action.mark.id)
      setRedoStack((stack) => [...stack, action])
      if (selectedMark?.id === action.mark.id) setSelectedMark(null)
    } else if (action.type === 'delete') {
      const { id, ...payload } = action.mark
      const newId = await db.highlights.add(payload)
      setRedoStack((stack) => [...stack, { ...action, mark: { ...action.mark, id: newId } }])
    } else if (action.type === 'update') {
      await db.highlights.update(action.mark.id, action.before)
      setRedoStack((stack) => [...stack, action])
    }
    setRefresh((x) => x + 1)
  }

  async function redoMark() {
    const action = redoStack[redoStack.length - 1]
    if (!action) return
    setRedoStack((stack) => stack.slice(0, -1))
    if (action.type === 'add') {
      const { id, ...payload } = action.mark
      const newId = await db.highlights.add(payload)
      setUndoStack((stack) => [...stack, { ...action, mark: { ...action.mark, id: newId } }])
    } else if (action.type === 'delete') {
      await db.highlights.delete(action.mark.id)
      setUndoStack((stack) => [...stack, action])
    } else if (action.type === 'update') {
      await db.highlights.update(action.mark.id, action.after)
      setUndoStack((stack) => [...stack, action])
    }
    setRefresh((x) => x + 1)
  }

  async function updateSelectedMark(patch) {
    if (!selectedMark) return
    const before = { color: selectedMark.color, style: selectedMark.style, rects: selectedMark.rects, updatedAt: selectedMark.updatedAt }
    const after = { ...patch, updatedAt: Date.now() }
    await db.highlights.update(selectedMark.id, after)
    remember({ type: 'update', mark: selectedMark, before, after })
    setSelectedMark((m) => ({ ...m, ...after }))
    setRefresh((x) => x + 1)
  }

  async function resizeSelectedMark(scale) {
    if (!selectedMark?.rects?.length) return
    const before = { rects: selectedMark.rects, updatedAt: selectedMark.updatedAt }
    const rects = selectedMark.rects.map((r) => {
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      const width = Math.max(0.006, Math.min(1, r.width * scale))
      const height = Math.max(0.004, Math.min(1, r.height * scale))
      return {
        left: Math.max(0, Math.min(1 - width, cx - width / 2)),
        top: Math.max(0, Math.min(1 - height, cy - height / 2)),
        width,
        height,
      }
    })
    const after = { rects, updatedAt: Date.now() }
    await db.highlights.update(selectedMark.id, after)
    remember({ type: 'update', mark: selectedMark, before, after })
    setSelectedMark((m) => ({ ...m, ...after }))
    setRefresh((x) => x + 1)
  }

  async function deleteSelectedMark() {
    if (!selectedMark) return
    await db.highlights.delete(selectedMark.id)
    remember({ type: 'delete', mark: selectedMark })
    setSelectedMark(null)
    setRefresh((x) => x + 1)
    showToast('Annotation removed.')
  }

  // BRIGHTNESS_BUBBLE_ANCHOR_PATCH
  useEffect(() => {
    if (!brightnessOpen) return

    function updateBrightnessAnchor() {
      const bubble = document.querySelector('.brightness-tool-bubble')
      if (!bubble) return

      const rect = bubble.getBoundingClientRect()
      const gap = 12

      if (toolbarPosition === 'bottom') {
        const sliderWidth = Math.min(360, window.innerWidth - 96)
        const left = Math.max(
          48 + sliderWidth / 2,
          Math.min(window.innerWidth - 48 - sliderWidth / 2, rect.left + rect.width / 2)
        )

        setBrightnessAnchorStyle({
          left: `${left}px`,
          bottom: `${Math.max(76, window.innerHeight - rect.top + gap)}px`,
          top: 'auto',
          right: 'auto',
          transform: 'translateX(-50%)',
        })
      } else {
        const sliderHeight = 174
        const top = Math.max(
          24 + sliderHeight / 2,
          Math.min(window.innerHeight - 24 - sliderHeight / 2, rect.top + rect.height / 2)
        )

        setBrightnessAnchorStyle({
          left: `${rect.right + gap}px`,
          top: `${top}px`,
          right: 'auto',
          bottom: 'auto',
          transform: 'translateY(-50%)',
        })
      }
    }

    updateBrightnessAnchor()
    window.addEventListener('resize', updateBrightnessAnchor)
    window.addEventListener('scroll', updateBrightnessAnchor, true)
    const id = window.setInterval(updateBrightnessAnchor, 250)

    return () => {
      window.removeEventListener('resize', updateBrightnessAnchor)
      window.removeEventListener('scroll', updateBrightnessAnchor, true)
      window.clearInterval(id)
    }
  }, [brightnessOpen, toolbarPosition])

  const pct = totalPages ? Math.round((Math.min(page + (viewMode === 'spread' ? 1 : 0), totalPages) / totalPages) * 100) : 0
  const toolbarClass = `reader-toolbar ${toolbarPosition === 'bottom' ? 'bottom' : 'left'} ${toolbarHidden ? 'is-hidden' : ''}`
  const shellClass = `reader-shell toolbar-${toolbarPosition} ${readerPresenterMode ? 'presenter-focus' : ''} ${showArrows ? 'arrows-visible' : ''} ${activeMarkTool ? 'mark-tool-active' : ''}`

  return (
    <div ref={shellRef} className={shellClass} style={jacketStyle()} onWheel={onWheel} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {toolbarHidden && <button className={`toolbar-peek ${toolbarPosition}`} onClick={() => setToolbarHidden(false)} title="Show tools">Tools</button>}
      <header className="minimal-header">
        <button className="kaagaz-logo" onClick={handleHomeClick} aria-label="Return home">Kaagaz</button>
        <div className="book-title compact-title"><span>{book?.name || 'Opening book'}</span><small>{totalPages ? `Page ${page}${viewMode === 'spread' && page + 1 <= totalPages ? `–${page + 1}` : ''} / ${totalPages}` : 'Preparing pages'}</small></div>


      {showProgress && <span className="progress-pill">{pct}%</span>}
      </header>
      {brightnessOpen && (
        <div className={`brightness-toolbar-popover ${toolbarPosition === 'bottom' ? 'bottom' : 'left'}`} style={brightnessAnchorStyle || undefined}>
          <input
            type="range"
            min="-40"
            max="40"
            value={brightness}
            onChange={(e) => setBrightness(Number(e.target.value))}
            aria-label="PDF brightness"
          />
        </div>
      )}

      <aside className={toolbarClass}>
        <button className={`bubble-btn ${viewMode === 'spread' ? 'active' : ''}`} title={viewMode === 'spread' ? 'Switch to one page view' : 'Switch to two page view'} data-tooltip={viewMode === 'spread' ? 'Two-page view' : 'One-page view'} aria-label="Toggle one or two page view" onClick={() => {
          if (viewMode === 'spread') { setViewMode('single'); setPage((p) => Math.min(p, totalPages || p)) }
          else { setViewMode('spread'); setPage((p) => normalizeStart(p, 'spread')) }
        }}>{viewMode === 'spread' ? '2p' : '1p'}</button>
        <button className={`bubble-btn ${showProgress ? 'active' : ''}`} title="Show reading percentage" data-tooltip="Progress" aria-label="Show reading percentage" onClick={() => setShowProgress((v) => !v)}>%</button>
        <button className="bubble-btn" title="Undo annotation" data-tooltip="Undo" aria-label="Undo annotation" onClick={undoMark} disabled={!undoStack.length}>↶</button>
        <button className="bubble-btn" title="Redo annotation" data-tooltip="Redo" aria-label="Redo annotation" onClick={redoMark} disabled={!redoStack.length}>◫</button>
        <button className="bubble-btn" title="Bookmarks" data-tooltip="Bookmarks" aria-label="Bookmarks" onClick={() => togglePanel('bookmarks')}>✿</button>
        <button className="bubble-btn" title="Notes" data-tooltip="Notes" aria-label="Notes" onClick={() => togglePanel('notes')}>✎</button>
        <div className={`jacket-menu ${jacketOpen ? 'open' : ''}`}>
          <button className="bubble-btn" title="Book jacket" data-tooltip="Book jacket" aria-label="Book jacket" onClick={() => setJacketOpen((v) => !v)}>▧</button>
          {jacketOpen && <div className="jacket-popover">
            <button className={`jacket-dot walnut ${jacket?.type === 'walnut' ? 'active' : ''}`} title="Walnut book jacket" data-tooltip="Walnut" onClick={() => { setBookJacket({ type: 'walnut', value: '' }); setJacketOpen(false) }} />
            <button className={`jacket-dot oxblood ${jacket?.type === 'oxblood' ? 'active' : ''}`} title="Oxblood book jacket" data-tooltip="Oxblood" onClick={() => { setBookJacket({ type: 'oxblood', value: '' }); setJacketOpen(false) }} />
            <button className={`jacket-dot forest ${jacket?.type === 'forest' ? 'active' : ''}`} title="Forest book jacket" data-tooltip="Forest" onClick={() => { setBookJacket({ type: 'forest', value: '' }); setJacketOpen(false) }} />
            <button className={`jacket-dot midnight ${jacket?.type === 'midnight' ? 'active' : ''}`} title="Midnight book jacket" data-tooltip="Midnight" onClick={() => { setBookJacket({ type: 'midnight', value: '' }); setJacketOpen(false) }} />
            <label className="bubble-btn file-bubble" title="Custom book jacket" data-tooltip="Custom">＋<input type="file" accept="image/*" hidden onChange={(e) => { pickJacketImage(e.target.files?.[0]); setJacketOpen(false) }} /></label>
          </div>}
        </div>
        <MarkToolbar activeMarkTool={activeMarkTool} setActiveMarkTool={setActiveMarkTool} activeMarkColor={activeMarkColor} setActiveMarkColor={setActiveMarkColor} activeUnderlineStyle={activeUnderlineStyle} setActiveUnderlineStyle={setActiveUnderlineStyle} />
        <button
          className={`bubble-btn brightness-tool-bubble ${brightnessOpen ? 'active' : ''}`}
          title="Brightness"
          data-tooltip="Brightness"
          aria-label="Brightness"
          onClick={() => setBrightnessOpen((v) => !v)}
        >
          ☼
        </button>
        <button className="bubble-btn capture-after-mark" title="Capture edited page as image" data-tooltip="Capture page" aria-label="Capture edited page as image" onClick={capturePages}>▣</button>
        <div className="toolbar-end">
          <button className={`bubble-btn ${showArrows ? 'active' : ''}`} title="Show navigation arrows" data-tooltip="Navigation arrows" aria-label="Show navigation arrows" onClick={() => setShowArrows((v) => !v)}>‹›</button>
          <button className="bubble-btn" title="Move toolbar" data-tooltip="Move toolbar" aria-label="Move toolbar" onClick={() => setToolbarPosition((p) => (p === 'left' ? 'bottom' : 'left'))}>◫</button>
          <button className="bubble-btn" title="Hide toolbar" data-tooltip="Hide tools" aria-label="Hide toolbar" onClick={() => setToolbarHidden(true)}>—</button>
        </div>
      </aside>

      
        {page >= totalPages && (
          <button
            className={`viewer-finish-bubble ${book?.finishedAt ? 'is-finished' : ''}`}
            title={book?.finishedAt ? 'Remove finished stamp' : 'Mark finished'}
            data-tooltip={book?.finishedAt ? 'Remove finished stamp' : 'Mark finished'}
            onClick={book?.finishedAt ? removeCurrentFinishedStamp : markCurrentBookFinished}
          >
            {book?.finishedAt ? '✓' : 'Finished'}
          </button>
        )}
<button className={`page-turn-corner ${flipMode ? 'active' : ''}`} title="Page effect" data-tooltip="Page effect" aria-label="Page effect" onClick={() => setFlipMode((v) => !v)}>◫</button>

      <aside className={`pomodoro-widget ${pomodoroOpen ? 'open' : ''}`}>
        <button className={`pomodoro-bubble ${timerRunning ? "timer-active" : ""} ${timerRunning ? "timer-active" : ""}`} title="Reading timer" data-tooltip="Reading timer" onClick={() => setPomodoroOpen((v) => !v)}>{timeMode === 'spent' ? fmtTime(timeSpent) : fmtTime(timerRemaining)}</button>
        {pomodoroOpen && <div className="pomodoro-card">
          <div className="pomodoro-top"><strong>Reading timer</strong><button onClick={() => setPomodoroOpen(false)}>×</button></div>
          <div className="timer-tabs">
            <button className={timeMode === 'spent' ? 'active' : ''} onClick={() => { setTimeMode('spent'); setTimerRunning(false) }}>Time spent</button>
            <button className={timeMode === 'timer' ? 'active' : ''} onClick={() => { setTimeMode('timer'); setTimerRemaining(Math.max(1, Number(timerInput) || 25) * 60); setTimerRunning(false) }}>Timer</button>
          </div>
          <div className="timer-display">{timeMode === 'spent' ? fmtTime(timeSpent) : fmtTime(timerRemaining)}</div>
          {timeMode === 'timer' && <label className="timer-input">Minutes<input type="number" min="1" max="240" value={timerInput} onChange={(e) => { setTimerInput(e.target.value); setTimerRemaining(Math.max(1, Number(e.target.value) || 25) * 60) }} /></label>}
          <label className="auto-start"><input type="checkbox" checked={autoStartTimer} onChange={(e) => setAutoStartTimer(e.target.checked)} /> Start upon opening</label>
          <div className="timer-actions"><button onClick={() => setTimerRunning((v) => !v)}>{timerRunning ? 'Pause' : 'Start'}</button><button onClick={resetClock}>Reset</button></div>
        </div>}
      </aside>

      <aside className="zoom-rail" aria-label="Zoom controls">
        <button
          className={`zoom-fit reader-presenter-bubble ${readerPresenterMode ? 'active' : ''}`}
          title={readerPresenterMode ? 'Exit presenter mode' : 'Presenter mode'}
          data-tooltip={readerPresenterMode ? 'Exit presenter' : 'Presenter'}
          aria-label="Presenter mode"
          onClick={() => {
            setReaderPresenterMode((value) => !value)
            setFitToScreen(false)
            setZoom((value) => value < 1.12 ? 1.15 : value)
          }}
        >
          Pres
        </button>
        <button className={`zoom-fit ${fitToScreen ? 'active' : ''}`} title="Fit page to screen" onClick={() => setFitToScreen((v) => !v)}>Fit</button>
        <input type="range" min="0.65" max="1.85" step="0.05" value={zoom} onChange={(e) => { setFitToScreen(false); setZoom(Number(e.target.value)) }} aria-label="Zoom PDF" />
        <span>{Math.round((fitToScreen ? 1 : zoom) * 100)}%</span>
      </aside>

      <main className={`reader-stage ${viewMode} ${flipMode ? 'flip-enabled' : ''} ${turning}`}>
        {showArrows && <button className="page-nav left" onClick={() => go(-1)}>‹</button>}
        <section className="book-plane">
          {viewMode === 'spread' && <div className="book-gutter" />}
          {pdf && pages.map((p) => (
            <BookPage
              key={p}
              pdf={pdf}
              pageNo={p}
              viewMode={viewMode}
              bookId={bookId}
              marks={marks.filter((h) => h.page === p)}
              bookmarks={bookmarks.filter((b) => b.page === p)}
              registerPage={registerPage}
              brightness={brightness}
              zoom={zoom}
              fitToScreen={fitToScreen}
              onRefresh={() => setRefresh((x) => x + 1)}
              onOpenBookmarks={() => togglePanel('bookmarks')}
              activeMarkTool={activeMarkTool}
              activeMarkColor={activeMarkColor}
              activeUnderlineStyle={activeUnderlineStyle}
              selectedMarkId={selectedMark?.id}
              onMarkSelect={setSelectedMark}
              onMarkSaved={handleMarkSaved}
              onToast={showToast}
              notePlacementMode={notePlacementMode}
              onPlaceInPageNote={placeInPageNote}
              refresh={refresh}
              stickyNoteMode={stickyNoteMode}
              refresh={refresh}
              finishedStamp={book?.finishedAt}
              totalPages={totalPages}
            />
          ))}
        </section>
        {showArrows && <button className="page-nav right" onClick={() => go(1)}>›</button>}
      </main>

      {showProgress && (
        <div
          className={`floating-progress ${toolbarPosition === 'bottom' ? 'above-bottom-toolbar' : ''}`}
          role="slider"
          aria-label="Scrub through PDF"
          aria-valuemin="1"
          aria-valuemax={totalPages || 1}
          aria-valuenow={page}
          title="Drag to move through the PDF"
          onPointerDown={handleProgressPointerDown}
        >
          <span style={{ width: `${pct}%` }} />
          <em>{page} / {totalPages}</em>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}


      {selectedMark && (
        <aside className="mark-edit-popover">
          <div className="mark-edit-top">
            <strong>{selectedMark.kind === 'underline' ? 'Edit underline' : 'Edit highlight'}</strong>
            <button title="Close" data-tooltip="Close" onClick={() => setSelectedMark(null)}>×</button>
          </div>
          <div className="mark-edit-colors">
            {markColors.map(([name, color]) => (
              <button key={name} className={`tool-dot ${selectedMark.color === color ? 'active' : ''}`} title={name} data-tooltip={name} style={{ background: color }} onClick={() => updateSelectedMark({ color })} />
            ))}
          </div>
          {selectedMark.kind === 'underline' && (
            <div className="underline-styles inline">
              {underlineStyles.map(([style, name]) => (
                <button key={style} className={`line-style-btn ${selectedMark.style === style ? 'active' : ''}`} title={name} data-tooltip={name} onClick={() => updateSelectedMark({ style })}>{name}</button>
              ))}
            </div>
          )}
          <div className="mark-resize-row" aria-label="Resize mark">
            <button onClick={() => resizeSelectedMark(0.92)} title="Reduce annotation size" data-tooltip="Shrink">−</button>
            <span>Resize mark</span>
            <button onClick={() => resizeSelectedMark(1.08)} title="Increase annotation size" data-tooltip="Grow">＋</button>
          </div>
          <button className="danger-soft" onClick={deleteSelectedMark}>Remove</button>
        </aside>
      )}

      <BookmarkPanel
        open={bookmarksOpen}
        onClose={() => { setBookmarksOpen(false); setRefresh((x) => x + 1) }}
        bookId={bookId}
        page={page}
        onJump={jump}
        refreshKey={refresh}
        onChanged={() => setRefresh((x) => x + 1)}
      />
      <NotesPanel
        open={notesOpen}
        onClose={() => setNotesOpen(false)}
        bookId={bookId}
        page={page}
        refreshKey={refresh}
        notePlacementMode={notePlacementMode}
        setNotePlacementMode={setNotePlacementMode}
        pendingInPageNote={pendingInPageNote}
        setPendingInPageNote={setPendingInPageNote}
        onNotesChanged={() => setRefresh((value) => value + 1)}
      />
    </div>
  )
}
