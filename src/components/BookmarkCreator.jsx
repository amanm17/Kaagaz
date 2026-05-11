import { useMemo, useState } from 'react'
import { db } from '../db/indexedDb'
import { BookmarkArt, bookmarkPresets } from '../data/botanicals.jsx'
import { compressImage } from '../utils/imageCompress'

export default function BookmarkCreator({ bookId, page, onSaved }) {
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [preset, setPreset] = useState('rose-petal')
  const [image, setImage] = useState(null)
  const [preview, setPreview] = useState('')

  const groups = useMemo(() => {
    return bookmarkPresets.reduce((acc, item) => {
      const key = item.category || 'Bookmarks'
      acc[key] = acc[key] || []
      acc[key].push(item)
      return acc
    }, {})
  }, [])

  async function save() {
    const now = Date.now()
    const chosen = bookmarkPresets.find((p) => p.id === preset)
    const id = await db.bookmarks.add({
      bookId,
      page,
      type: image ? 'custom-image' : chosen?.category || 'bookmark',
      title: title || `Bookmark on page ${page}`,
      note,
      flowerPreset: preset,
      category: chosen?.category || 'Custom',
      createdAt: now,
      updatedAt: now,
      isLastActive: true,
    })
    if (image) await db.assets.add({ bookId, bookmarkId: id, kind: 'bookmark-image', blob: image, createdAt: now })
    const all = await db.bookmarks.where('bookId').equals(bookId).toArray()
    await Promise.all(all.map((b) => db.bookmarks.update(b.id, { isLastActive: b.id === id })))
    await db.books.update(bookId, { lastBookmarkId: id, lastPage: page, updatedAt: now })
    setTitle('')
    setNote('')
    setImage(null)
    setPreview('')
    onSaved?.()
  }

  async function pickImage(file) {
    if (!file) return
    const blob = await compressImage(file)
    setImage(blob)
    if (preview) URL.revokeObjectURL(preview)
    setPreview(URL.createObjectURL(blob))
  }

  return (
    <div className="creator-card">
      <div className="panel-heading"><span>Add page bookmark</span><small>Page {page}</small></div>
      <input className="kaagaz-input" placeholder="Bookmark title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea className="kaagaz-input" rows="3" placeholder="Private bookmark note" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="preset-groups">
        {Object.entries(groups).map(([category, items]) => (
          <section className="preset-category" key={category}>
            <h3>{category}</h3>
            <div className="preset-grid">
              {items.map((p) => (
                <button key={p.id} className={`preset ${preset === p.id ? 'active' : ''}`} onClick={() => setPreset(p.id)} title={p.name}>
                  <BookmarkArt preset={p} size={48} />
                  <span>{p.name}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
      <div className="bookmark-creator-actions">
        <label className="image-upload as-button">Add custom image<input type="file" accept="image/*" hidden onChange={(e) => pickImage(e.target.files?.[0])} /></label>
        <button className="primary-btn small" onClick={save}>Keep this page</button>
      </div>
      {preview && <div className="custom-preview"><img src={preview} alt="Custom bookmark preview" /><span>Custom image will appear as the page bookmark.</span></div>}
    </div>
  )
}
