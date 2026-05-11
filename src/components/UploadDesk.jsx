import { useRef, useState } from 'react'
import { db } from '../db/indexedDb'
import { hashFile } from '../utils/hashPdf'
import { BotanicalMark, botanicalPresets } from '../data/botanicals.jsx'

export default function UploadDesk({ onOpenBook }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)

  async function handleFile(file) {
    if (!file || file.type !== 'application/pdf') return
    setBusy(true)
    const fileHash = await hashFile(file)
    const id = fileHash
    const existing = await db.books.get(id)
    const now = Date.now()
    await db.books.put({
      id,
      name: file.name.replace(/\.pdf$/i, ''),
      fileHash,
      lastPage: existing?.lastPage || 1,
      lastBookmarkId: existing?.lastBookmarkId || null,
      totalPages: existing?.totalPages || 0,
      thumbnail: existing?.thumbnail || null,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    })
    await db.files.put({ bookId: id, blob: file, updatedAt: now })
    setBusy(false)
    onOpenBook(id, file)
  }

  return (
    <main
      className="upload-desk welcome-hero"
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        handleFile(e.dataTransfer.files?.[0])
      }}
    >
      <div className="ambient botanical-left"><BotanicalMark preset={botanicalPresets[12]} size={160} /></div>
      <div className="ambient botanical-right"><BotanicalMark preset={botanicalPresets[1]} size={118} /></div>

      <section className={`upload-card kaagaz-welcome-card ${dragging ? 'is-dragging' : ''}`}>
        <p className="welcome-kicker">digital reading desk</p>
        <h1 className="kaagaz-wordmark">Kaagaz</h1>
        <p className="kaagaz-subtitle">Turn PDFs into personal books.</p>
        <p className="lead welcome-lead">Place a PDF on the desk. Keep highlights, underlines, notes, bookmarks, and progress on this device.</p>
        <button className="primary-btn" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? 'Opening your book…' : 'Place a PDF on the desk'}
        </button>
        <input ref={inputRef} type="file" accept="application/pdf" hidden onChange={(e) => handleFile(e.target.files?.[0])} />
      </section>
    </main>
  )
}
