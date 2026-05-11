import { useEffect, useMemo, useState } from 'react'
import { db, markLastBookmark } from '../db/indexedDb'
import BookmarkCreator from './BookmarkCreator'
import { BookmarkArt, bookmarkPresets } from '../data/botanicals.jsx'

export default function BookmarkPanel({ open, onClose, bookId, page, onJump, refreshKey, onChanged }) {
  const [bookmarks, setBookmarks] = useState([])

  useEffect(() => { load() }, [bookId, open, refreshKey])

  async function load() {
    if (!bookId) return
    const rows = await db.bookmarks.where('bookId').equals(bookId).sortBy('page')
    const assets = await db.assets.where('bookId').equals(bookId).toArray()
    setBookmarks(rows.map((b) => {
      const preset = bookmarkPresets.find((p) => p.id === b.flowerPreset)
      const asset = assets.find((a) => a.bookmarkId === b.id && a.kind === 'bookmark-image')
      return { ...b, category: b.category || preset?.category || (asset ? 'Custom images' : 'Bookmarks'), imageUrl: asset ? URL.createObjectURL(asset.blob) : '' }
    }))
  }

  const grouped = useMemo(() => {
    return bookmarks.reduce((acc, item) => {
      const key = item.category || 'Bookmarks'
      acc[key] = acc[key] || []
      acc[key].push(item)
      return acc
    }, {})
  }, [bookmarks])

  async function remove(id) {
    await db.bookmarks.delete(id)
    const linked = await db.assets.where('bookmarkId').equals(id).toArray()
    await Promise.all(linked.map((a) => db.assets.delete(a.id)))
    const book = await db.books.get(bookId)
    if (book?.lastBookmarkId === id) await db.books.update(bookId, { lastBookmarkId: null, updatedAt: Date.now() })
    await load()
    onChanged?.()
  }

  async function jump(b) {
    await markLastBookmark(bookId, b.id, b.page)
    onJump(b.page)
    onClose()
  }

  function art(b, size = 62) {
    if (b.imageUrl) return <img className="bookmark-thumb-img" src={b.imageUrl} alt="Custom bookmark" />
    return <BookmarkArt preset={bookmarkPresets.find((p) => p.id === b.flowerPreset)} size={size} />
  }

  return (
    <aside className={`side-panel ${open ? 'open' : ''}`}>
      <div className="panel-top"><h2>Bookmarks</h2><button onClick={onClose}>×</button></div>
      <BookmarkCreator bookId={bookId} page={page} onSaved={async () => { await load(); onChanged?.() }} />
      <div className="panel-list">
        {bookmarks.length === 0 && <p className="empty">No bookmarks yet. Keep a page with a flower, leaf, animal, ethnic mark, or your own image.</p>}
        {Object.entries(grouped).map(([category, items]) => (
          <section className="bookmark-category" key={category}>
            <h3>{category}</h3>
            {items.map((b) => (
              <article className="bookmark-row" key={b.id}>
                <button className="bookmark-art" onClick={() => jump(b)}>{art(b)}</button>
                <div>
                  <strong>{b.title}</strong>
                  <small>Page {b.page}{b.isLastActive ? ' · last bookmark' : ''}</small>
                  <p>{b.note}</p>
                  <div className="row-actions"><button onClick={() => jump(b)}>Open</button><button onClick={() => remove(b.id)}>Remove</button></div>
                </div>
              </article>
            ))}
          </section>
        ))}
      </div>
    </aside>
  )
}
