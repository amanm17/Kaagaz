import { useEffect, useMemo, useState } from 'react'
import UploadDesk from './components/UploadDesk'
import PdfReader from './components/PdfReader'
import { db } from './db/indexedDb'
import './styles/theme.css'
import './styles/animations.css'

export default function App() {
  const [active, setActive] = useState(null)
  const [recent, setRecent] = useState([])
  const [refresh, setRefresh] = useState(0)
  const [openingId, setOpeningId] = useState(null)
  const [summaryOpen, setSummaryOpen] = useState(false)

  useEffect(() => { db.books.orderBy('updatedAt').reverse().limit(12).toArray().then(setRecent) }, [active, refresh])

  const summary = useMemo(() => {
    const added = recent.length
    const finished = recent.filter((b) => b.finishedAt).length
    const inProgress = recent.filter((b) => !b.finishedAt && (b.lastPage || 1) > 1).length
    return { added, inProgress, finished }
  }, [recent])


  async function openRecentBook(book) {
    const f = await db.files.get(book.id)
    if (!f?.blob) return
    setOpeningId(book.id)
    window.setTimeout(() => setActive({ bookId: book.id, file: f.blob }), 520)
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

  if (active) return <PdfReader bookId={active.bookId} file={active.file} onHome={() => setActive(null)} />

  return (
    <>
      <UploadDesk onOpenBook={(bookId, file) => setActive({ bookId, file })} />
      {recent.length > 0 && (
        <section className="library-strip">
          <div className="library-heading-row">
            <div><p className="eyebrow">Local library</p><h2>Return to a reading layer</h2></div>
            <div className={`summary-widget ${summaryOpen ? 'open' : ''}`}>
              <button className="summary-bubble" onClick={() => setSummaryOpen((v) => !v)} title="Show reading summary">Summary</button>
              {summaryOpen && (
                <div className="summary-card">
                  <span><strong>{summary.added}</strong><small>books added</small></span>
                  <span><strong>{summary.inProgress}</strong><small>in progress</small></span>
                  <span><strong>{summary.finished}</strong><small>finished</small></span>
                </div>
              )}
            </div>
          </div>
          <div className="library-cards">
            {recent.map((b) => (
              <article key={b.id} className="library-card-wrap">
                <button className={`library-card ${openingId === b.id ? 'opening' : ''}`} onClick={() => openRecentBook(b)}>
                  <span className="book-spine" />
                  <span className="library-cover">{b.thumbnail ? <img src={b.thumbnail} alt={`Front page of ${b.name}`} /> : <span>Kaagaz</span>}</span>
                  <span className="library-meta">
                    <strong>{b.name}</strong>
                    <small>Page {b.lastPage || 1}{b.totalPages ? ` / ${b.totalPages}` : ''}</small>
                    <em>{b.totalPages ? `${Math.round(((b.lastPage || 1) / b.totalPages) * 100)}% read` : 'Ready locally'}</em>
                  </span>
                </button>
                {b.finishedAt && <span className="finished-book">Finished</span>}
                <button className="finish-book" title={b.finishedAt ? 'Remove finished stamp' : 'Mark this book as finished'} onClick={() => b.finishedAt ? removeFinishedStamp(b) : markBookFinished(b)}>
                  {b.finishedAt ? 'Unfinish' : 'Mark finished'}
                </button>
                <button className="remove-book" title="Remove book and local reading layer" onClick={() => removeBook(b)}>Remove</button>
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  )
}
