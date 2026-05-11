import { useEffect, useMemo, useRef, useState } from 'react'
import { db } from '../db/indexedDb'

const COVER_OPTIONS = [
  { key: 'walnut', label: 'Walnut Desk' },
  { key: 'oxblood', label: 'Oxblood Cloth' },
  { key: 'forest', label: 'Forest Linen' },
  { key: 'midnight', label: 'Midnight Leather' },
  { key: 'kraft', label: 'Aged Kraft' },
  { key: 'indigo', label: 'Indigo Ikat' },
  { key: 'pattachitra', label: 'Pattachitra Border' },
  { key: 'cream', label: 'Minimal Cream' },
]

const PAGE_TYPES = [
  { key: 'plain', label: 'Plain' },
  { key: 'ruled', label: 'Ruled' },
  { key: 'dotted', label: 'Dotted' },
  { key: 'square', label: 'Square' },
]

const PAGE_SHADES = [
  { key: 'clean-white', label: 'Clean White' },
  { key: 'cream', label: 'Creamy White' },
  { key: 'aged', label: 'Aged Paper' },
  { key: 'kraft', label: 'Warm Kraft' },
  { key: 'black', label: 'Soft Black' },
]

const FONT_OPTIONS = [
  { key: 'Georgia, serif', label: 'Serif' },
  { key: 'Inter, ui-sans-serif, system-ui, sans-serif', label: 'Sans' },
  { key: 'ui-monospace, SFMono-Regular, Menlo, monospace', label: 'Mono' },
  { key: 'cursive', label: 'Journal' },
]

const COLOURS = [
  { key: '#2a1a12', label: 'Ink' },
  { key: '#6b3f1f', label: 'Walnut' },
  { key: '#8b1e2d', label: 'Oxblood' },
  { key: '#1f5b3a', label: 'Forest' },
  { key: '#243b75', label: 'Indigo' },
  { key: '#b8892d', label: 'Brass' },
  { key: '#f5dfb4', label: 'Cream' },
]

const HIGHLIGHTS = [
  { key: '#ffe89a', label: 'Amber' },
  { key: '#ffc2cf', label: 'Rose' },
  { key: '#d8caff', label: 'Lavender' },
  { key: '#c5f1d8', label: 'Mint' },
  { key: '#bee3ff', label: 'Sky' },
  { key: '#ffd0aa', label: 'Peach' },
]

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function clampPage(value, max) {
  return clamp(Number(value) || 1, 1, max || 1)
}

function getSpreadLeftPage(page, totalPages, mode = 'odd-left') {
  const total = Math.max(1, Number(totalPages) || 1)
  const safe = clampPage(page, total)

  if (total <= 1) return 1

  if (mode === 'even-left') {
    // In this mode: 2|3, 4|5, 6|7 ...
    // Page 1 remains a special opening page with 1|2.
    if (safe <= 1) return 1
    return safe % 2 === 0 ? safe : Math.max(1, safe - 1)
  }

  // Default book-like mode: 1|2, 3|4, 5|6 ...
  return safe % 2 === 1 ? safe : Math.max(1, safe - 1)
}

function makeTableHtml(rows, cols) {
  const safeRows = clamp(Number(rows) || 3, 1, 12)
  const safeCols = clamp(Number(cols) || 3, 1, 8)

  return `<table class="notebook-table-block-table"><tbody>${Array.from({ length: safeRows }, () => (
    `<tr>${Array.from({ length: safeCols }, () => '<td><br></td>').join('')}</tr>`
  )).join('')}</tbody></table>`
}

function execCommand(command, value = null) {
  document.execCommand(command, false, value)
}

function placeCaretAtEnd(element) {
  if (!element) return
  element.focus()

  const range = document.createRange()
  range.selectNodeContents(element)
  range.collapse(false)

  const selection = window.getSelection()
  selection.removeAllRanges()
  selection.addRange(range)
}

export default function NotebookEditor({ notebookId, onHome }) {
  const [notebook, setNotebook] = useState(null)
  const [pageNumber, setPageNumber] = useState(1)
  const [pageRows, setPageRows] = useState({})
  const [contents, setContents] = useState({})
  const [blocks, setBlocks] = useState([])
  const [pageTypeOpen, setPageTypeOpen] = useState(false)
  const [formatOpen, setFormatOpen] = useState(true)
  const [insertOpen, setInsertOpen] = useState(false)
  const [viewMode, setViewMode] = useState('single')
  const [spreadPairMode, setSpreadPairMode] = useState('odd-left')
  const [saving, setSaving] = useState(false)
  const [tableRows, setTableRows] = useState(3)
  const [tableCols, setTableCols] = useState(3)
  const [notebookZoom, setNotebookZoom] = useState(1)
  const [fitNotebook, setFitNotebook] = useState(true)
  const [notebookPresenter, setNotebookPresenter] = useState(false)
  const [zoomRailHidden, setZoomRailHidden] = useState(false)
  const [activeBlockId, setActiveBlockId] = useState(null)
  const [dragState, setDragState] = useState(null)

  const saveTimers = useRef({})
  const blockTimers = useRef({})
  const pageEditorRefs = useRef({})
  const imageInputRef = useRef(null)
  const activeEditorRef = useRef(null)
  const activeBlockIdRef = useRef(null)

  useEffect(() => { hydrate() }, [notebookId])
  useEffect(() => { loadVisiblePagesAndBlocks() }, [notebookId, pageNumber, viewMode, notebook?.pageCount])
  useEffect(() => { activeBlockIdRef.current = activeBlockId }, [activeBlockId])

  const visiblePageNumbers = useMemo(() => {
    if (!notebook) return [1]

    const total = notebook.pageCount || 1
    const active = clampPage(pageNumber, total)

    if (viewMode !== 'spread') return [active]

    const left = getSpreadLeftPage(active, total, spreadPairMode)
    const right = left + 1 <= total ? left + 1 : null

    return right ? [left, right] : [left]
  }, [pageNumber, viewMode, notebook, spreadPairMode])

  async function hydrate() {
    const row = await db.notebooks.get(Number(notebookId))
    if (!row) return

    setNotebook(row)
    setPageNumber(clampPage(row.lastOpenedPage || 1, row.pageCount || 1))
  }

  async function loadVisiblePagesAndBlocks() {
    if (!notebookId || !notebook) return

    const nextRows = {}
    const nextContents = {}

    for (const pageNo of visiblePageNumbers) {
      const row = await db.notebookPages
        .where('[notebookId+pageNumber]')
        .equals([Number(notebookId), Number(pageNo)])
        .first()

      if (row) {
        nextRows[pageNo] = row
        nextContents[pageNo] = row.content || ''
      }
    }

    setPageRows((old) => ({ ...old, ...nextRows }))
    setContents((old) => ({ ...old, ...nextContents }))

    if (db.notebookAssets) {
      const rows = await db.notebookAssets.where('notebookId').equals(Number(notebookId)).toArray()
      setBlocks(rows.filter((row) => ['text-box', 'text-block', 'table-block', 'image'].includes(row.type)))
    }
  }

  function selectPageEditor(pageNo, editor) {
    activeEditorRef.current = editor
    activeBlockIdRef.current = null
    setActiveBlockId(null)
    if (pageNo !== pageNumber) setPageNumber(pageNo)
  }

  function selectBlock(block, editor = null) {
    activeBlockIdRef.current = block.id
    setActiveBlockId(block.id)
    if (editor) activeEditorRef.current = editor
  }

  function schedulePageSave(pageNo, html) {
    const row = pageRows[pageNo]
    if (!row?.id) return

    window.clearTimeout(saveTimers.current[pageNo])
    setSaving(true)

    saveTimers.current[pageNo] = window.setTimeout(async () => {
      await db.notebookPages.update(row.id, { content: html, updatedAt: Date.now() })
      await db.notebooks.update(Number(notebookId), { lastOpenedPage: pageNo, updatedAt: Date.now() })
      setSaving(false)
    }, 450)
  }

  function updatePageContent(pageNo, html) {
    setContents((old) => ({ ...old, [pageNo]: html }))
    schedulePageSave(pageNo, html)
  }

  function scheduleBlockSave(blockId, patch) {
    window.clearTimeout(blockTimers.current[blockId])

    blockTimers.current[blockId] = window.setTimeout(async () => {
      await db.notebookAssets.update(Number(blockId), { ...patch, updatedAt: Date.now() })
    }, 280)
  }

  function updateBlockLocal(blockId, patch) {
    setBlocks((old) => old.map((block) => Number(block.id) === Number(blockId) ? { ...block, ...patch } : block))
    scheduleBlockSave(blockId, patch)
  }

  async function removeBlock(blockId) {
    if (!blockId) return

    await db.notebookAssets.delete(Number(blockId))
    setBlocks((old) => old.filter((block) => Number(block.id) !== Number(blockId)))

    if (Number(activeBlockIdRef.current) === Number(blockId) || Number(activeBlockId) === Number(blockId)) {
      activeBlockIdRef.current = null
      activeEditorRef.current = null
      setActiveBlockId(null)
    }
  }

  function runCommand(command, value = null) {
    const target =
      document.activeElement?.closest?.('.notebook-page-editor, .text-box-editor, .table-editor') ||
      activeEditorRef.current

    if (!target) return

    target.focus()
    execCommand(command, value)

    if (target.classList.contains('notebook-page-editor')) {
      const pageNo = Number(target.dataset.page)
      updatePageContent(pageNo, target.innerHTML)
      return
    }

    const blockEl = target.closest('.notebook-free-block')
    const blockId = blockEl?.dataset.blockId || activeBlockIdRef.current

    if (blockId) updateBlockLocal(blockId, { content: target.innerHTML })
  }

  function addLink() {
    const url = window.prompt('Paste link URL:')
    if (!url) return
    runCommand('createLink', url)
  }

  function addChecklist() {
    runCommand('insertHTML', '<ul class="notebook-checklist"><li><label><input type="checkbox"> <span>Task</span></label></li><li><label><input type="checkbox"> <span>Task</span></label></li><li><label><input type="checkbox"> <span>Task</span></label></li></ul><div><br></div>')
  }

  function persistChecklist(event, pageNo) {
    const checkbox = event.target?.closest?.('input[type="checkbox"]')
    if (!checkbox) return

    if (checkbox.checked) checkbox.setAttribute('checked', 'checked')
    else checkbox.removeAttribute('checked')

    const editor = pageEditorRefs.current[pageNo]
    if (!editor) return

    updatePageContent(pageNo, editor.innerHTML)
  }

  async function renameNotebook() {
    if (!notebook) return

    const title = window.prompt('Rename notebook:', notebook.title || '')
    if (!title?.trim()) return

    const patch = { title: title.trim(), updatedAt: Date.now() }
    await db.notebooks.update(notebook.id, patch)
    setNotebook({ ...notebook, ...patch })
  }

  async function updateNotebookCover(nextCover) {
    if (!notebook) return

    const patch = { coverType: nextCover, updatedAt: Date.now() }
    await db.notebooks.update(notebook.id, patch)
    setNotebook({ ...notebook, ...patch })
  }

  async function updateCurrentPageType(nextType) {
    const row = pageRows[pageNumber]
    if (!row?.id) return

    await db.notebookPages.update(row.id, { pageType: nextType, updatedAt: Date.now() })
    setPageRows((old) => ({ ...old, [pageNumber]: { ...old[pageNumber], pageType: nextType } }))
  }

  async function updateCurrentPageShade(nextShade) {
    const row = pageRows[pageNumber]
    if (!row?.id) return

    await db.notebookPages.update(row.id, { pageShade: nextShade, updatedAt: Date.now() })
    setPageRows((old) => ({ ...old, [pageNumber]: { ...old[pageNumber], pageShade: nextShade } }))
  }

  async function setDefaultFromCurrent() {
    if (!notebook) return

    const row = pageRows[pageNumber]
    if (!row) return

    const patch = {
      defaultPageType: row.pageType || 'ruled',
      defaultPageShade: row.pageShade || 'cream',
      updatedAt: Date.now(),
    }

    await db.notebooks.update(notebook.id, patch)
    setNotebook({ ...notebook, ...patch })
  }

  async function addPage() {
    if (!notebook) return

    const now = Date.now()
    const next = (notebook.pageCount || 0) + 1

    await db.notebookPages.add({
      notebookId: notebook.id,
      pageNumber: next,
      pageType: notebook.defaultPageType || 'ruled',
      pageShade: notebook.defaultPageShade || 'cream',
      content: '',
      createdAt: now,
      updatedAt: now,
    })

    const patch = { pageCount: next, lastOpenedPage: next, updatedAt: now }
    await db.notebooks.update(notebook.id, patch)
    setNotebook({ ...notebook, ...patch })
    setPageNumber(next)
  }

  async function deleteCurrentPage() {
    if (!notebook || notebook.pageCount <= 1) {
      window.alert('A notebook must have at least one page.')
      return
    }

    const ok = window.confirm(`Delete page ${pageNumber}? This removes its writing and inserted content.`)
    if (!ok) return

    const row = await db.notebookPages.where('[notebookId+pageNumber]').equals([notebook.id, pageNumber]).first()
    if (row?.id) await db.notebookPages.delete(row.id)

    const allPages = await db.notebookPages.where('notebookId').equals(notebook.id).toArray()
    await Promise.all(
      allPages
        .filter((page) => page.pageNumber > pageNumber)
        .map((page) => db.notebookPages.update(page.id, { pageNumber: page.pageNumber - 1, updatedAt: Date.now() }))
    )

    const assets = await db.notebookAssets.where('notebookId').equals(notebook.id).toArray()
    await Promise.all([
      ...assets.filter((asset) => asset.pageNumber === pageNumber).map((asset) => db.notebookAssets.delete(asset.id)),
      ...assets.filter((asset) => asset.pageNumber > pageNumber).map((asset) => db.notebookAssets.update(asset.id, { pageNumber: asset.pageNumber - 1, updatedAt: Date.now() })),
    ])

    const nextCount = notebook.pageCount - 1
    const nextPage = clampPage(pageNumber, nextCount)
    const patch = { pageCount: nextCount, lastOpenedPage: nextPage, updatedAt: Date.now() }

    await db.notebooks.update(notebook.id, patch)
    setNotebook({ ...notebook, ...patch })
    setBlocks([])
    setPageRows({})
    setContents({})
    setPageNumber(nextPage)
  }

  function toggleNotebookViewMode() {
    setViewMode((current) => {
      const next = current === 'spread' ? 'single' : 'spread'

      if (next === 'spread') {
        setFitNotebook(true)
        setNotebookZoom(0.83)
      } else if (fitNotebook) {
        setNotebookZoom(1)
      }

      return next
    })
  }

  function toggleSpreadPairMode() {
    setSpreadPairMode((current) => current === 'odd-left' ? 'even-left' : 'odd-left')
  }

  async function goToPage(next) {
    if (!notebook) return

    const safe = clampPage(next, notebook.pageCount || 1)
    setPageNumber(safe)
    await db.notebooks.update(notebook.id, { lastOpenedPage: safe, updatedAt: Date.now() })
  }

  function nextPage() {
    if (viewMode === 'spread' && notebook) {
      const left = getSpreadLeftPage(pageNumber, notebook.pageCount || 1, spreadPairMode)
      goToPage(left + 2)
      return
    }

    goToPage(pageNumber + 1)
  }

  function prevPage() {
    if (viewMode === 'spread' && notebook) {
      const left = getSpreadLeftPage(pageNumber, notebook.pageCount || 1, spreadPairMode)
      goToPage(left - 2)
      return
    }

    goToPage(pageNumber - 1)
  }

  async function createBlock(pageNo, type, x, y, extra = {}) {
    const now = Date.now()
    const width = extra.width ?? (type === 'image' ? 0.32 : type === 'table-block' ? 0.54 : 0.34)
    const height = extra.height ?? (type === 'image' ? 0.22 : type === 'table-block' ? 0.24 : 0.12)

    const row = {
      notebookId: Number(notebookId),
      pageNumber: Number(pageNo),
      type,
      x: clamp(x, 0.01, 0.96 - width),
      y: clamp(y, 0.01, 0.96 - height),
      width,
      height,
      content: extra.content || '',
      dataUrl: extra.dataUrl || '',
      createdAt: now,
      updatedAt: now,
    }

    const id = await db.notebookAssets.add(row)
    const block = { ...row, id }
    setBlocks((old) => [...old, block])
    selectBlock(block)
    return id
  }

  function insertTextBox() {
    createBlock(pageNumber, 'text-box', 0.055, 0.10, { content: '', width: 0.36, height: 0.14 })
  }

  function insertTableBlock() {
    createBlock(pageNumber, 'table-block', 0.055, 0.12, { content: makeTableHtml(tableRows, tableCols), width: 0.58, height: 0.28 })
  }

  function addImageFile(file) {
    if (!file) return

    if (!file.type?.startsWith?.('image/')) {
      window.alert('Please choose an image file.')
      return
    }

    const reader = new FileReader()

    reader.onerror = () => {
      window.alert('Could not read this image.')
      if (imageInputRef.current) imageInputRef.current.value = ''
    }

    reader.onload = () => {
      const dataUrl = String(reader.result || '')
      if (!dataUrl.startsWith('data:image/')) return

      createBlock(pageNumber, 'image', 0.055, 0.12, { dataUrl, content: dataUrl, width: 0.34, height: 0.24 })

      if (imageInputRef.current) imageInputRef.current.value = ''
    }

    reader.readAsDataURL(file)
  }

  function startBlockDrag(event, block, mode) {
    event.preventDefault()
    event.stopPropagation()

    const pageEl = event.currentTarget.closest('.notebook-page') || document.querySelector(`[data-notebook-page="${block.pageNumber}"]`)
    if (!pageEl) return

    selectBlock(block)

    setDragState({
      blockId: block.id,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      pageRect: pageEl.getBoundingClientRect(),
      startBlock: { ...block },
    })
  }

  function handlePointerMove(event) {
    if (!dragState) return

    const dx = (event.clientX - dragState.startX) / dragState.pageRect.width
    const dy = (event.clientY - dragState.startY) / dragState.pageRect.height

    const start = dragState.startBlock

    if (dragState.mode === 'move') {
      updateBlockLocal(dragState.blockId, {
        x: clamp((start.x || 0) + dx, 0.01, 0.98 - (start.width || 0.2)),
        y: clamp((start.y || 0) + dy, 0.01, 0.98 - (start.height || 0.1)),
      })
      return
    }

    const width = clamp((start.width || 0.2) + dx, 0.12, 0.98 - (start.x || 0.01))
    const height = clamp((start.height || 0.1) + dy, 0.06, 0.98 - (start.y || 0.01))

    updateBlockLocal(dragState.blockId, { width, height })
  }

  function handlePointerUp() {
    setDragState(null)
  }

  function handlePageClick(event, pageNo) {
    if (
      event.target.closest('.notebook-free-block') ||
      event.target.closest('.notebook-page-chip')
    ) return

    if (pageNo !== pageNumber) setPageNumber(pageNo)

    const editor = pageEditorRefs.current[pageNo]
    if (!editor) return

    // If the user is clicking directly on existing text/children, do not interfere.
    // This preserves native caret movement, text selection, copy, cut, delete, etc.
    if (event.target !== editor) {
      selectPageEditor(pageNo, editor)
      return
    }

    selectPageEditor(pageNo, editor)

    const selection = window.getSelection()
    if (selection && !selection.isCollapsed) return

    const editorRect = editor.getBoundingClientRect()
    const lineHeight = 32
    const targetLine = Math.max(0, Math.floor(Math.max(0, event.clientY - editorRect.top) / lineHeight))

    let lines = Array.from(editor.children).filter((child) => child.nodeType === 1)

    if (!lines.length && editor.innerHTML.trim()) {
      editor.innerHTML = `<div>${editor.innerHTML}</div>`
      lines = Array.from(editor.children).filter((child) => child.nodeType === 1)
    }

    while (lines.length <= targetLine) {
      const line = document.createElement('div')
      line.innerHTML = '<br>'
      editor.appendChild(line)
      lines.push(line)
    }

    placeCaretAtEnd(lines[targetLine])
    updatePageContent(pageNo, editor.innerHTML)
  }

  function handlePageEditorMouseUp(event, pageNo) {
    const editor = event.currentTarget
    selectPageEditor(pageNo, editor)

    // Let browser selection do its job. This function only records active editor.
  }

  function handleShellKeyDownCapture(event) {
    if (event.key === 'Escape') {
      setActiveBlockId(null)
      activeBlockIdRef.current = null
      return
    }

    const selectedId = activeBlockIdRef.current || activeBlockId
    if (!selectedId) return
    if (event.key !== 'Delete' && event.key !== 'Backspace') return

    const activeEl = document.activeElement

    if (activeEl?.closest?.('.text-box-editor, .table-editor, .notebook-page-editor, input, select, textarea')) return

    event.preventDefault()
    event.stopPropagation()
    removeBlock(selectedId)
  }

  const currentRow = pageRows[pageNumber]

  const notebookShellStyle = notebook?.coverType === 'custom' && notebook?.coverValue
    ? {
        backgroundImage: `radial-gradient(circle at 20% 10%, rgba(255,231,188,.10), transparent 32%), linear-gradient(rgba(14,8,5,.58), rgba(14,8,5,.72)), url(${notebook.coverValue})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : undefined

  if (!notebook) {
    return (
      <div className="notebook-editor-shell">
        <button className="notebook-home-btn" onClick={onHome}>← Library</button>
        <p className="notebook-loading">Opening notebook…</p>
      </div>
    )
  }

  return (
    <div
      className={`notebook-editor-shell cover-${notebook.coverType || 'walnut'}`}
      style={notebookShellStyle}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onKeyDownCapture={handleShellKeyDownCapture}
      tabIndex={0}
    >
      <div className="notebook-floating-head">
        <button className="notebook-home-btn" onClick={onHome}>Kaagaz</button>
        <div>
          <strong
            className="notebook-title-inline-edit"
            title="Double-click to rename notebook"
            onDoubleClick={(event) => {
              event.stopPropagation()
              renameNotebook()
            }}
          >
            {notebook.title}
          </strong>
          <small>
            Notebook · Page {pageNumber} / {notebook.pageCount || 1}
            {viewMode === 'spread' && visiblePageNumbers.length > 1 ? `–${visiblePageNumbers[1]}` : ''}
            {saving ? ' · saving…' : ''}
          </small>
        </div>
      </div>

      <aside className="notebook-rail">
        <button title="Previous page" data-tooltip="Previous page" onClick={prevPage} disabled={pageNumber <= 1}>‹</button>
        <button title="Next page" data-tooltip="Next page" onClick={nextPage} disabled={pageNumber >= (notebook.pageCount || 1)}>›</button>
        <button title="Toggle one/two page view" data-tooltip="One / two page view" className={viewMode === 'spread' ? 'active' : ''} onClick={toggleNotebookViewMode}>{viewMode === 'spread' ? '2p' : '1p'}</button>
        {viewMode === 'spread' && (
          <button
            title="Spread pairing"
            data-tooltip={spreadPairMode === 'odd-left' ? 'Odd left: 1|2, 3|4' : 'Even left: 2|3, 4|5'}
            className="active"
            onClick={toggleSpreadPairMode}
          >
            {spreadPairMode === 'odd-left' ? 'O|E' : 'E|O'}
          </button>
        )}
        <button title="Add page" data-tooltip="Add page" onClick={addPage}>＋</button>
        <button title="Delete current page" data-tooltip="Delete page" onClick={deleteCurrentPage}>−</button>
        <button title="Page setup" data-tooltip="Page setup" className={pageTypeOpen ? 'active' : ''} onClick={() => setPageTypeOpen((value) => !value)}>□</button>
        <button title="Formatting" data-tooltip="Text formatting" className={formatOpen ? 'active' : ''} onClick={() => setFormatOpen((value) => !value)}>T</button>
        <button title="Insert" data-tooltip="Insert" className={insertOpen ? 'active' : ''} onClick={() => setInsertOpen((value) => !value)}>⊕</button>
      </aside>

      {pageTypeOpen && (
        <div className="notebook-page-setup">
          <h3>Page setup</h3>
          <label>
            <span>Notebook jacket</span>
            <select value={notebook.coverType || 'walnut'} onChange={(event) => updateNotebookCover(event.target.value)}>
              {COVER_OPTIONS.map((cover) => <option key={cover.key} value={cover.key}>{cover.label}</option>)}
            </select>
          </label>
          <label>
            <span>Page type</span>
            <select value={currentRow?.pageType || notebook.defaultPageType || 'ruled'} onChange={(event) => updateCurrentPageType(event.target.value)}>
              {PAGE_TYPES.map((type) => <option key={type.key} value={type.key}>{type.label}</option>)}
            </select>
          </label>
          <label>
            <span>Page shade</span>
            <select value={currentRow?.pageShade || notebook.defaultPageShade || 'cream'} onChange={(event) => updateCurrentPageShade(event.target.value)}>
              {PAGE_SHADES.map((shade) => <option key={shade.key} value={shade.key}>{shade.label}</option>)}
            </select>
          </label>
          <button className="primary-btn small" onClick={setDefaultFromCurrent}>Use for new pages</button>
        </div>
      )}

      {formatOpen && (
        <div className="notebook-format-bar">
          <button title="Bold" data-tooltip="Bold" onMouseDown={(e) => { e.preventDefault(); runCommand('bold') }}>B</button>
          <button title="Italic" data-tooltip="Italic" onMouseDown={(e) => { e.preventDefault(); runCommand('italic') }}><i>I</i></button>
          <button title="Underline" data-tooltip="Underline" onMouseDown={(e) => { e.preventDefault(); runCommand('underline') }}><u>U</u></button>
          <select title="Font family" data-tooltip="Font family" onChange={(event) => runCommand('fontName', event.target.value)} defaultValue="">
            <option value="" disabled>Font</option>
            {FONT_OPTIONS.map((font) => <option key={font.key} value={font.key}>{font.label}</option>)}
          </select>
          <select title="Text size" data-tooltip="Text size" onChange={(event) => runCommand('fontSize', event.target.value)} defaultValue="">
            <option value="" disabled>Size</option>
            <option value="2">Small</option>
            <option value="3">Normal</option>
            <option value="4">Large</option>
            <option value="5">Title</option>
          </select>
          <select title="Text colour" data-tooltip="Text colour" onChange={(event) => runCommand('foreColor', event.target.value)} defaultValue="">
            <option value="" disabled>Text</option>
            {COLOURS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <select title="Highlight colour" data-tooltip="Highlight colour" onChange={(event) => runCommand('hiliteColor', event.target.value)} defaultValue="">
            <option value="" disabled>Highlight</option>
            {HIGHLIGHTS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <select
            title="Text alignment"
            data-tooltip="Text alignment"
            defaultValue=""
            onChange={(event) => {
              if (event.target.value) runCommand(event.target.value)
              event.target.value = ''
            }}
          >
            <option value="" disabled>Align</option>
            <option value="justifyLeft">Left</option>
            <option value="justifyCenter">Centre</option>
            <option value="justifyRight">Right</option>
            <option value="justifyFull">Justify</option>
          </select>
          <button title="Bulleted list" data-tooltip="Bullets" onMouseDown={(e) => { e.preventDefault(); runCommand('insertUnorderedList') }}>•</button>
          <button title="Numbered list" data-tooltip="Numbered list" onMouseDown={(e) => { e.preventDefault(); runCommand('insertOrderedList') }}>1.</button>
          <button title="Checklist" data-tooltip="Checklist" onMouseDown={(e) => { e.preventDefault(); addChecklist() }}>☑</button>
          <button title="Add link" data-tooltip="Add link" onMouseDown={(e) => { e.preventDefault(); addLink() }}>Link</button>
        </div>
      )}

      {insertOpen && (
        <div className="notebook-insert-bar">
          <label title="Table rows" data-tooltip="Rows">
            <span>Rows</span>
            <input type="number" min="1" max="12" value={tableRows} onChange={(event) => setTableRows(Number(event.target.value))} />
          </label>
          <label title="Table columns" data-tooltip="Columns">
            <span>Cols</span>
            <input type="number" min="1" max="8" value={tableCols} onChange={(event) => setTableCols(Number(event.target.value))} />
          </label>
          <button title="Text box" data-tooltip="Text box" onMouseDown={(e) => { e.preventDefault(); insertTextBox() }}>Text box</button>
          <button title="Insert table" data-tooltip="Insert table" onMouseDown={(e) => { e.preventDefault(); insertTableBlock() }}>Insert table</button>
          <button title="Insert image" data-tooltip="Insert image" onMouseDown={(event) => { event.preventDefault(); imageInputRef.current?.click() }}>Image</button>
          <input ref={imageInputRef} type="file" hidden accept="image/*" onChange={(event) => addImageFile(event.target.files?.[0])} />
        </div>
      )}

      {!notebookPresenter && (
        <aside className={`notebook-zoom-rail ${zoomRailHidden ? 'is-hidden' : ''}`}>
          {!zoomRailHidden && (
            <>
              <button
                title="Fullscreen view"
                data-tooltip="Fullscreen view"
                onClick={() => {
                  setNotebookPresenter(true)
                  setFitNotebook(false)
                  setNotebookZoom(viewMode === 'spread' ? 0.90 : 1.15)
                }}
              >
                Fsc
              </button>
              <button title="Fit notebook" data-tooltip="Fit notebook" className={fitNotebook ? 'active' : ''} onClick={() => { setFitNotebook((value) => { const next = !value; if (next) setNotebookZoom(1); return next }) }}>Fit</button>
              <input title="Notebook zoom" aria-label="Notebook zoom" type="range" min="70" max="140" value={Math.round(notebookZoom * 100)} onChange={(event) => { setFitNotebook(false); setNotebookZoom(Number(event.target.value) / 100) }} />
              <small>{Math.round(notebookZoom * 100)}%</small>
              <button title="Hide magnification" data-tooltip="Hide magnification" onClick={() => setZoomRailHidden(true)}>‹</button>
            </>
          )}
          {zoomRailHidden && (
            <button title="Show magnification" data-tooltip="Show magnification" className="notebook-zoom-peek" onClick={() => setZoomRailHidden(false)}>Zoom</button>
          )}
        </aside>
      )}

      {notebookPresenter && (
        <button className="notebook-exit-presenter" title="Exit fullscreen" data-tooltip="Exit fullscreen" onClick={() => {
            setNotebookPresenter(false)
            setFitNotebook(true)
            setNotebookZoom(viewMode === 'spread' ? 0.83 : 1)
          }}>
          Exit fullscreen
        </button>
      )}

      <main className={`notebook-desk ${viewMode === 'spread' ? 'spread' : 'single'} ${notebookPresenter ? 'presenter' : ''} ${fitNotebook ? 'fit' : ''}`} style={{ '--notebook-zoom': notebookZoom }}>
        <div className="notebook-page-stack">
          {visiblePageNumbers.map((pageNo) => {
            const row = pageRows[pageNo]
            const classes = `notebook-page ${row?.pageType || notebook.defaultPageType || 'ruled'} ${row?.pageShade || notebook.defaultPageShade || 'cream'}`
            const pageBlocks = blocks.filter((block) => Number(block.pageNumber) === Number(pageNo))

            return (
              <section
                className={classes}
                key={pageNo}
                data-notebook-page={pageNo}
                onPointerDown={() => {
                  if (pageNo !== pageNumber) setPageNumber(pageNo)
                }}
                onClick={(event) => handlePageClick(event, pageNo)}
              >
                <span className="notebook-page-chip">{pageNo}</span>

                <div
                  ref={(el) => {
                    if (!el) return
                    pageEditorRefs.current[pageNo] = el
                    const saved = contents[pageNo] || ''
                    const isFocused = document.activeElement === el || el.contains(document.activeElement)

                    if (!isFocused && el.dataset.loadedContent !== saved) {
                      el.innerHTML = saved
                      el.dataset.loadedContent = saved
                    }
                  }}
                  className="notebook-page-editor"
                  data-page={pageNo}
                  contentEditable
                  suppressContentEditableWarning
                  spellCheck
                  dir="ltr"
                  data-placeholder="Click any line and start writing…"
                  onFocus={(event) => selectPageEditor(pageNo, event.currentTarget)}
                  onMouseUp={(event) => handlePageEditorMouseUp(event, pageNo)}
                  onClick={(event) => persistChecklist(event, pageNo)}
                  onKeyUp={(event) => {
                    const html = event.currentTarget.innerHTML
                    event.currentTarget.dataset.loadedContent = html
                    updatePageContent(pageNo, html)
                  }}
                  onInput={(event) => {
                    const html = event.currentTarget.innerHTML
                    event.currentTarget.dataset.loadedContent = html
                    updatePageContent(pageNo, html)
                  }}
                />

                {pageBlocks.map((block) => {
                  const selected = Number(activeBlockId) === Number(block.id)
                  const style = {
                    left: `${(block.x || 0.05) * 100}%`,
                    top: `${(block.y || 0.1) * 100}%`,
                    width: `${(block.width || 0.3) * 100}%`,
                    minHeight: `${(block.height || 0.12) * 100}%`,
                  }

                  return (
                    <div
                      key={block.id}
                      className={`notebook-free-block ${block.type === 'text-block' ? 'text-box' : block.type} ${selected ? 'selected' : ''}`}
                      data-block-id={block.id}
                      style={style}
                      onPointerDown={(event) => {
                        if (event.target.closest('.block-drag-handle') || event.target.closest('.block-resize')) return

                        if (event.target.closest('.text-box-editor')) {
                          selectBlock(block, event.target.closest('.text-box-editor'))
                          return
                        }

                        if (event.target.closest('.table-editor')) {
                          selectBlock(block, event.target.closest('.table-editor'))
                          return
                        }

                        selectBlock(block)
                      }}
                      onClick={(event) => {
                        event.stopPropagation()
                        selectBlock(block)
                      }}
                    >
                      <button
                        type="button"
                        className="block-drag-handle"
                        title="Drag to reposition"
                        onPointerDown={(event) => startBlockDrag(event, block, 'move')}
                      >
                        ⋮⋮
                      </button>

                      {(block.type === 'text-box' || block.type === 'text-block') && (
                        <div
                          className="text-box-editor"
                          contentEditable
                          suppressContentEditableWarning
                          spellCheck
                          dir="ltr"
                          data-placeholder="Write here…"
                          ref={(el) => {
                            if (!el) return
                            const saved = String(block.content || '')
                            const isFocused = document.activeElement === el

                            if (!isFocused && el.dataset.loadedContent !== saved) {
                              el.innerHTML = saved
                              el.dataset.loadedContent = saved
                            }
                          }}
                          onFocus={(event) => selectBlock(block, event.currentTarget)}
                          onClick={(event) => {
                            event.stopPropagation()
                            selectBlock(block, event.currentTarget)
                          }}
                          onInput={(event) => {
                            const html = event.currentTarget.innerHTML
                            event.currentTarget.dataset.loadedContent = html
                            activeEditorRef.current = event.currentTarget
                            activeBlockIdRef.current = block.id
                            updateBlockLocal(block.id, { content: html })
                          }}
                        />
                      )}

                      {block.type === 'table-block' && (
                        <div
                          className="table-editor"
                          contentEditable
                          suppressContentEditableWarning
                          dir="ltr"
                          ref={(el) => {
                            if (!el) return
                            const saved = String(block.content || '')
                            const isFocused = document.activeElement === el || el.contains(document.activeElement)

                            if (!isFocused && el.dataset.loadedContent !== saved) {
                              el.innerHTML = saved
                              el.dataset.loadedContent = saved
                            }
                          }}
                          onFocus={(event) => selectBlock(block, event.currentTarget)}
                          onClick={(event) => {
                            event.stopPropagation()
                            selectBlock(block, event.currentTarget)
                          }}
                          onInput={(event) => {
                            const html = event.currentTarget.innerHTML
                            event.currentTarget.dataset.loadedContent = html
                            activeEditorRef.current = event.currentTarget
                            activeBlockIdRef.current = block.id
                            updateBlockLocal(block.id, { content: html })
                          }}
                        />
                      )}

                      {block.type === 'image' && (
                        <img className="notebook-image-block" src={block.dataUrl || block.content || ''} alt="" draggable={false} />
                      )}

                      {selected && (
                        <div className="block-mini-tools" onPointerDown={(event) => event.stopPropagation()}>
                          <button
                            type="button"
                            title="Delete inserted content"
                            onClick={(event) => {
                              event.preventDefault()
                              event.stopPropagation()
                              removeBlock(block.id)
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      )}

                      <span
                        className="block-resize"
                        title="Drag to resize"
                        onPointerDown={(event) => startBlockDrag(event, block, 'resize')}
                      />
                    </div>
                  )
                })}
              </section>
            )
          })}
        </div>
      </main>
    </div>
  )
}
