import { useEffect, useMemo, useState } from 'react'
import UploadDesk from './components/UploadDesk'
import PdfReader from './components/PdfReader'
import NotebookCreator from './components/NotebookCreator'
import NotebookEditor from './components/NotebookEditor'
import { db } from './db/indexedDb'
import './styles/theme.css'
import './styles/animations.css'
import './styles/notebook.css'

export default function App() {
  const [active, setActive] = useState(null)
  const [activeNotebookId, setActiveNotebookId] = useState(null)
  const [recent, setRecent] = useState([])
  const [notebooks, setNotebooks] = useState([])
  const [refresh, setRefresh] = useState(0)
  const [openingId, setOpeningId] = useState(null)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [notebookCreatorOpen, setNotebookCreatorOpen] = useState(false)
  const [editNotebookTarget, setEditNotebookTarget] = useState(null)
  const [libraryView, setLibraryView] = useState('all')
  const [librarySort, setLibrarySort] = useState('updated-desc')

  useEffect(() => {
    loadLibrary()
  }, [active, activeNotebookId, refresh])

  async function loadLibrary() {
    const books = await db.books.orderBy('updatedAt').reverse().limit(12).toArray()
    setRecent(books)

    if (db.notebooks) {
      const notebookRows = await db.notebooks.orderBy('updatedAt').reverse().toArray()
      setNotebooks(notebookRows)
    }
  }

  function sortLibraryItems(items) {
    const sorted = [...items]

    sorted.sort((a, b) => {
      if (librarySort === 'title-asc') return String(a.title || a.name || '').localeCompare(String(b.title || b.name || ''))
      if (librarySort === 'title-desc') return String(b.title || b.name || '').localeCompare(String(a.title || a.name || ''))
      if (librarySort === 'created-desc') return (b.createdAt || 0) - (a.createdAt || 0)
      if (librarySort === 'created-asc') return (a.createdAt || 0) - (b.createdAt || 0)
      return (b.updatedAt || 0) - (a.updatedAt || 0)
    })

    return sorted
  }

  const visibleBooks = useMemo(() => {
    if (libraryView === 'notebooks') return []
    return sortLibraryItems(recent.map((book) => ({ ...book, itemType: 'book' })))
  }, [recent, libraryView, librarySort])

  const visibleNotebooks = useMemo(() => {
    if (libraryView === 'books') return []
    return sortLibraryItems(notebooks.map((notebook) => ({ ...notebook, itemType: 'notebook' })))
  }, [notebooks, libraryView, librarySort])

  const summary = useMemo(() => {
    const booksAdded = recent.length
    const notebooksAdded = notebooks.length

    return {
      added: booksAdded + notebooksAdded,
      booksAdded,
      notebooksAdded,
      inProgress: recent.filter((book) => !book.finishedAt && (book.lastPage || 1) > 1).length,
      finished: recent.filter((book) => book.finishedAt).length,
    }
  }, [recent, notebooks])

  async function openRecentBook(book) {
    const f = await db.files.get(book.id)
    if (!f?.blob) return
    setOpeningId(`book-${book.id}`)
    window.setTimeout(() => {
      setActiveNotebookId(null)
      setActive({ bookId: book.id, file: f.blob })
    }, 520)
  }

  function openNotebook(notebook) {
    setOpeningId(`notebook-${notebook.id}`)
    window.setTimeout(() => {
      setActive(null)
      setActiveNotebookId(notebook.id)
    }, 420)
  }

  async function renameBook(book) {
    const nextName = window.prompt('Rename book:', book.name || '')
    if (!nextName?.trim()) return

    await db.books.update(book.id, {
      name: nextName.trim(),
      updatedAt: Date.now(),
    })

    setRefresh((x) => x + 1)
  }

  function editNotebookFromLibrary(notebook) {
    setEditNotebookTarget(notebook)
    setNotebookCreatorOpen(true)
  }

  async function removeBook(book) {
    const ok = window.confirm(`Remove “${book.name}” from Kaagaz?\n\nThis will wipe its local annotations, highlights, underlines, notes, bookmarks, custom bookmark images, and reading progress from this browser. The original PDF file on your computer will not be deleted.`)
    if (!ok) return

    const bookmarks = await db.bookmarks.where('bookId').equals(book.id).toArray()
    const notes = await db.notes.where('bookId').equals(book.id).toArray()
    const marks = await db.highlights.where('bookId').equals(book.id).toArray()
    const assets = await db.assets.where('bookId').equals(book.id).toArray()

    await Promise.all([
      ...bookmarks.map((b) => db.bookmarks.delete(b.id)),
      ...notes.map((n) => db.notes.delete(n.id)),
      ...marks.map((m) => db.highlights.delete(m.id)),
      ...assets.map((a) => db.assets.delete(a.id)),
      db.files.delete(book.id),
      db.bookSettings.delete(book.id),
      db.books.delete(book.id),
    ])

    setRefresh((x) => x + 1)
  }

  async function removeNotebook(notebook) {
    const ok = window.confirm(`Delete “${notebook.title}”?\n\nThis will remove the notebook, all pages, and local notebook assets from this browser.`)
    if (!ok) return

    const pages = await db.notebookPages.where('notebookId').equals(notebook.id).toArray()
    const assets = await db.notebookAssets.where('notebookId').equals(notebook.id).toArray()

    await Promise.all([
      ...pages.map((page) => db.notebookPages.delete(page.id)),
      ...assets.map((asset) => db.notebookAssets.delete(asset.id)),
      db.notebooks.delete(notebook.id),
    ])

    setRefresh((x) => x + 1)
  }

  async function markBookFinished(book) {
    const now = Date.now()
    await db.books.update(book.id, { finishedAt: now, updatedAt: now })
    setRefresh((x) => x + 1)
  }

  async function removeFinishedStamp(book) {
    const ok = window.confirm(`Remove the finished stamp from “${book.name}”?`)
    if (!ok) return
    await db.books.update(book.id, { finishedAt: null, updatedAt: Date.now() })
    setRefresh((x) => x + 1)
  }

  function handleNotebookCreated(notebookId) {
    const wasEditing = !!editNotebookTarget
    setNotebookCreatorOpen(false)
    setEditNotebookTarget(null)
    setRefresh((x) => x + 1)

    if (!wasEditing && notebookId) {
      setActive(null)
      setActiveNotebookId(notebookId)
    }
  }

  if (active) {
    return <PdfReader bookId={active.bookId} file={active.file} onHome={() => setActive(null)} />
  }

  if (activeNotebookId) {
    return <NotebookEditor notebookId={activeNotebookId} onHome={() => setActiveNotebookId(null)} />
  }

  return (
    <>
      <UploadDesk onOpenBook={(bookId, file) => setActive({ bookId, file })} />

      <div className="home-action-row">
        <button className="notebook-add-button" onClick={() => { setEditNotebookTarget(null); setNotebookCreatorOpen(true) }}>
          <span>＋</span>
          Add Notebook
        </button>
      </div>

      <NotebookCreator
        open={notebookCreatorOpen}
        editNotebook={editNotebookTarget}
        onClose={() => {
          setNotebookCreatorOpen(false)
          setEditNotebookTarget(null)
        }}
        onCreated={(notebookId, meta = {}) => {
          const wasEditing = Boolean(meta.edited || editNotebookTarget)
          setNotebookCreatorOpen(false)
          setEditNotebookTarget(null)
          setRefresh((x) => x + 1)

          if (!wasEditing && notebookId) {
            setActive(null)
            setActiveNotebookId(notebookId)
          }
        }}
      />

      {(recent.length > 0 || notebooks.length > 0) && (
        <section className="library-strip">
          <div className="library-heading-row">
            <div>
              <p className="eyebrow">Local library</p>
              <h2>Find a new read or pick where you left.</h2>
              <div className="library-controls-row">
                <div className="library-segmented-filter" aria-label="Library view">
                  <button className={libraryView === 'all' ? 'active' : ''} onClick={() => setLibraryView('all')}>All</button>
                  <button className={libraryView === 'books' ? 'active' : ''} onClick={() => setLibraryView('books')}>Books</button>
                  <button className={libraryView === 'notebooks' ? 'active' : ''} onClick={() => setLibraryView('notebooks')}>Notebooks</button>
                </div>

                <label className="library-sort-select">
                  <span>Sort</span>
                  <select value={librarySort} onChange={(event) => setLibrarySort(event.target.value)}>
                    <option value="updated-desc">Recently updated</option>
                    <option value="created-desc">Recently added</option>
                    <option value="created-asc">Oldest added</option>
                    <option value="title-asc">Title A–Z</option>
                    <option value="title-desc">Title Z–A</option>
                  </select>
                </label>
              </div>
            </div>

            <div className={`summary-widget ${summaryOpen ? 'open' : ''}`}>
              <button className="summary-bubble" onClick={() => setSummaryOpen((v) => !v)} title="Show library summary">
                Summary
              </button>
              {summaryOpen && (
                <div className="summary-card">
                  <span><strong>{summary.added}</strong><small>library items</small></span>
                  <span><strong>{summary.booksAdded}</strong><small>PDF books</small></span>
                  <span><strong>{summary.notebooksAdded}</strong><small>notebooks</small></span>
                  <span><strong>{summary.inProgress}</strong><small>books in progress</small></span>
                  <span><strong>{summary.finished}</strong><small>books finished</small></span>
                </div>
              )}
            </div>
          </div>

          <div className="library-cards">
            {(visibleBooks.length === 0 && visibleNotebooks.length === 0) && (
              <div className="filtered-library-empty">
                No items in this view yet.
              </div>
            )}

            {visibleBooks.map((b) => (
              <article key={`book-${b.id}`} className="library-card-wrap">
                <button className={`library-card ${openingId === `book-${b.id}` ? 'opening' : ''}`} onClick={() => openRecentBook(b)}>
                  <span className="book-spine" />
                  <span className="library-cover">
                    {b.thumbnail ? <img src={b.thumbnail} alt={`Front page of ${b.name}`} /> : <span>Kaagaz</span>}
                  </span>
                  <span className="library-meta">
                    <strong
                      className="library-title-editable"
                      title="Double-click to rename"
                      onDoubleClick={(event) => {
                        event.stopPropagation()
                        renameBook(b)
                      }}
                    >
                      {b.name}
                    </strong>
                    <small>PDF Book · Page {b.lastPage || 1}{b.totalPages ? ` / ${b.totalPages}` : ''}</small>
                    <em>{b.totalPages ? `${Math.round(((b.lastPage || 1) / b.totalPages) * 100)}% read` : 'Ready locally'}</em>
                  </span>
                </button>

                {b.finishedAt && <span className="finished-book">Finished</span>}

                <button className="finish-book" title={b.finishedAt ? 'Remove finished stamp' : 'Mark this book as finished'} onClick={() => b.finishedAt ? removeFinishedStamp(b) : markBookFinished(b)}>
                  {b.finishedAt ? 'Unfinish' : 'Mark finished'}
                </button>

                <button className="remove-book" title="Remove book and local reading layer" onClick={() => removeBook(b)}>
                  Remove
                </button>
              </article>
            ))}

            {visibleNotebooks.map((notebook) => (
              <article key={`notebook-${notebook.id}`} className="library-card-wrap notebook-card-wrap">
                <button className={`library-card notebook-library-card ${openingId === `notebook-${notebook.id}` ? 'opening' : ''}`} onClick={() => openNotebook(notebook)}>
                  <span className="book-spine notebook-spine" />
                  <span className={`library-cover notebook-cover ${notebook.coverType || 'walnut'}`}>
                    <span>{notebook.title?.slice(0, 1) || 'N'}</span>
                  </span>
                  <span className="library-meta">
                    <strong
                      className="library-title-editable"
                      title="Double-click to edit notebook"
                      onDoubleClick={(event) => {
                        event.stopPropagation()
                        editNotebookFromLibrary(notebook)
                      }}
                    >
                      {notebook.title}
                    </strong>
                    <small>Notebook · {notebook.pageCount || 0} pages</small>
                    <em>{notebook.defaultPageType || 'plain'} · {notebook.defaultPageShade || 'cream'}</em>
                  </span>
                </button>

                <button className="notebook-edit-chip" title="Edit notebook settings" onClick={() => editNotebookFromLibrary(notebook)}>
                  Edit
                </button>

                <button className="remove-book" title="Delete notebook" onClick={() => removeNotebook(notebook)}>
                  Delete
                </button>
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  )
}
