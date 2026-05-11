import { useEffect, useState } from 'react'
import { db } from '../db/indexedDb'

const INPAGE_NOTE_COLOURS = [
  { key: 'pastel-amber', label: 'Amber' },
  { key: 'pastel-rose', label: 'Rose' },
  { key: 'pastel-lavender', label: 'Lavender' },
  { key: 'pastel-mint', label: 'Mint' },
  { key: 'pastel-sky', label: 'Sky' },
  { key: 'pastel-peach', label: 'Peach' },
]

export default function NotesPanel({
  open,
  onClose,
  bookId,
  page,
  refreshKey,
  notePlacementMode,
  setNotePlacementMode,
  pendingInPageNote,
  setPendingInPageNote,
  onNotesChanged,
}) {
  const [content, setContent] = useState('')
  const [notes, setNotes] = useState([])
  const [mode, setMode] = useState('page')
  const [openColourNoteId, setOpenColourNoteId] = useState(null)
  const [localInPageNote, setLocalInPageNote] = useState('')

  const inPageText = pendingInPageNote ?? localInPageNote

  useEffect(() => {
    if (open) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, open, refreshKey])

  function updateInPageText(value) {
    if (setPendingInPageNote) setPendingInPageNote(value)
    else setLocalInPageNote(value)
  }

  async function load() {
    if (!bookId) return
    const rows = await db.notes.where('bookId').equals(bookId).sortBy('page')
    setNotes(rows)
  }

  async function addPageNote() {
    if (!content.trim()) return

    const now = Date.now()
    await db.notes.add({
      bookId,
      page,
      kind: 'page',
      bookmarkId: null,
      highlightId: null,
      content: content.trim(),
      createdAt: now,
      updatedAt: now,
    })

    setContent('')
    await load()
  }

  async function updateInPageNoteColour(id, color) {
    await db.notes.update(id, {
      color,
      updatedAt: Date.now(),
    })
    setOpenColourNoteId(null)
    await load()
    onNotesChanged?.()
  }

  async function remove(id) {
    await db.notes.delete(id)
    await load()
    onNotesChanged?.()
  }

  function switchMode(nextMode) {
    setMode(nextMode)
    if (nextMode === 'page') {
      setNotePlacementMode?.(false)
    }
  }

  function beginPlacement() {
    if (!String(inPageText || '').trim()) return
    setMode('inpage')
    setNotePlacementMode?.(true)
  }

  function cancelPlacement() {
    setNotePlacementMode?.(false)
    updateInPageText('')
  }

  return (
    <aside className={`side-panel notes ${open ? 'open' : ''}`}>
      <div className="panel-top">
        <h2>Private marginalia</h2>
        <button onClick={onClose}>×</button>
      </div>

      <div className="notes-segmented-control" role="tablist" aria-label="Note type">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'page'}
          className={mode === 'page' ? 'active' : ''}
          onClick={() => switchMode('page')}
        >
          <span>Page</span>
          <small>Margin note</small>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'inpage'}
          className={mode === 'inpage' ? 'active' : ''}
          onClick={() => switchMode('inpage')}
        >
          <span>In-page</span>
          <small>Pinned note</small>
        </button>
      </div>

      {mode === 'page' && (
        <div className="creator-card">
          <div className="panel-heading">
            <span>Add page note</span>
            <small>Page {page}</small>
          </div>
          <textarea
            className="kaagaz-input note-paper"
            rows="5"
            placeholder="Write a private margin note…"
            value={content}
            onChange={(event) => setContent(event.target.value)}
          />
          <button className="primary-btn small" onClick={addPageNote}>
            Save note
          </button>
        </div>
      )}

      {mode === 'inpage' && (
        <div className="creator-card inpage-note-composer">
          <div className="panel-heading">
            <span>Add pinned in-page note</span>
            <small>Page {page}</small>
          </div>
          <textarea
            className="kaagaz-input note-paper inpage-note-textarea"
            rows="5"
            placeholder="Write the note, then place it on the PDF page…"
            value={inPageText}
            onChange={(event) => updateInPageText(event.target.value)}
          />
          <div className="inpage-note-actions">
            <button
              className="primary-btn small"
              type="button"
              onClick={beginPlacement}
              disabled={!String(inPageText || '').trim()}
            >
              Place on page
            </button>
            <button
              className="primary-btn small ghost"
              type="button"
              onClick={cancelPlacement}
            >
              Cancel
            </button>
          </div>
          <p className="placement-hint">
            {notePlacementMode
              ? 'Placement active. Double-click the exact point on the PDF page.'
              : 'The note will become a small pinned mark on the page.'}
          </p>
        </div>
      )}

      <div className="panel-list">
        {notes.length === 0 && (
          <p className="empty">No notes yet. Marginalia stays on this device only.</p>
        )}

        {notes.map((note) => (
          <article className={`note-row ${note.kind === 'inpage' ? 'is-inpage-note' : ''}`} key={note.id}>
            <small>
              Page {note.page}
              {note.kind === 'inpage' ? ' · in-page note' : ''}
              {note.highlightId ? ' · highlight note' : ''}
            </small>
            <p>{note.content}</p>
            {note.kind === 'inpage' && (
              <div className="inpage-colour-control">
                <button
                  type="button"
                  className={`inpage-current-colour ${note.color || 'pastel-amber'}`}
                  title="Change pinned note colour"
                  aria-label="Change pinned note colour"
                  onClick={() => setOpenColourNoteId(openColourNoteId === note.id ? null : note.id)}
                />
                {openColourNoteId === note.id && (
                  <div className="inpage-colour-popover" aria-label="Choose pinned note colour">
                    {INPAGE_NOTE_COLOURS.map((colour) => (
                      <button
                        key={colour.key}
                        type="button"
                        className={`inpage-colour-dot ${colour.key} ${(note.color || 'pastel-amber') === colour.key ? 'active' : ''}`}
                        title={colour.label}
                        aria-label={`Set colour to ${colour.label}`}
                        onClick={() => updateInPageNoteColour(note.id, colour.key)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            <button onClick={() => remove(note.id)}>Remove</button>
          </article>
        ))}
      </div>
    </aside>
  )
}
