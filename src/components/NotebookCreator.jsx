import { useEffect, useState } from 'react'
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
  { key: 'custom', label: 'Custom Cover' },
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

export default function NotebookCreator({ open, onClose, onCreated, editNotebook = null }) {
  const [title, setTitle] = useState('')
  const [coverType, setCoverType] = useState('walnut')
  const [coverValue, setCoverValue] = useState('')
  const [defaultPageType, setDefaultPageType] = useState('ruled')
  const [defaultPageShade, setDefaultPageShade] = useState('cream')
  const [creating, setCreating] = useState(false)

  const isEditing = Boolean(editNotebook?.id)

  useEffect(() => {
    if (!open) return

    if (editNotebook?.id) {
      setTitle(editNotebook.title || '')
      setCoverType(editNotebook.coverType || 'walnut')
      setCoverValue(editNotebook.coverValue || '')
      setDefaultPageType(editNotebook.defaultPageType || 'ruled')
      setDefaultPageShade(editNotebook.defaultPageShade || 'cream')
      return
    }

    setTitle('')
    setCoverType('walnut')
    setCoverValue('')
    setDefaultPageType('ruled')
    setDefaultPageShade('cream')
  }, [open, editNotebook?.id])

  if (!open) return null

  function pickCustomCover(file) {
    if (!file) return

    if (!file.type?.startsWith?.('image/')) {
      window.alert('Please choose an image file.')
      return
    }

    const reader = new FileReader()

    reader.onload = () => {
      const dataUrl = String(reader.result || '')
      if (!dataUrl.startsWith('data:image/')) return

      setCoverType('custom')
      setCoverValue(dataUrl)
    }

    reader.readAsDataURL(file)
  }

  async function saveNotebook() {
    const cleanTitle = title.trim()
    if (!cleanTitle || creating) return

    setCreating(true)
    const now = Date.now()

    try {
      const safeCoverType = coverType === 'custom' && !coverValue ? 'walnut' : coverType
      const safeCoverValue = safeCoverType === 'custom' ? coverValue : ''

      if (isEditing) {
        await db.notebooks.update(Number(editNotebook.id), {
          title: cleanTitle,
          coverType: safeCoverType,
          coverValue: safeCoverValue,
          defaultPageType,
          defaultPageShade,
          updatedAt: now,
        })

        onCreated?.(editNotebook.id, { edited: true })
        onClose?.()
        return
      }

      const notebookId = await db.notebooks.add({
        type: 'notebook',
        title: cleanTitle,
        coverType: safeCoverType,
        coverValue: safeCoverValue,
        defaultPageType,
        defaultPageShade,
        pageCount: 1,
        lastOpenedPage: 1,
        createdAt: now,
        updatedAt: now,
      })

      await db.notebookPages.add({
        notebookId,
        pageNumber: 1,
        pageType: defaultPageType,
        pageShade: defaultPageShade,
        content: '',
        createdAt: now,
        updatedAt: now,
      })

      onCreated?.(notebookId, { edited: false })
      onClose?.()
    } catch (error) {
      console.error('Notebook save failed:', error)
      window.alert('Could not save notebook settings. Please check the console for details.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="notebook-modal-backdrop" role="dialog" aria-modal="true">
      <div className="notebook-creator-modal">
        <div className="notebook-creator-head">
          <div>
            <span className="notebook-kicker">{isEditing ? 'Edit handmade book' : 'New handmade book'}</span>
            <h2>{isEditing ? 'Edit Notebook' : 'Add Notebook'}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">×</button>
        </div>

        <label className="notebook-field">
          <span>Notebook title</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Studio notes, site diary, ideas…"
            autoFocus
          />
        </label>

        <div className="notebook-field">
          <span>Cover design</span>
          <div className="notebook-cover-grid">
            {COVER_OPTIONS.map((cover) => (
              <button
                key={cover.key}
                type="button"
                className={`notebook-cover-swatch ${cover.key} ${coverType === cover.key ? 'active' : ''}`}
                onClick={() => {
                  if (cover.key === 'custom' && !coverValue) return
                  setCoverType(cover.key)
                }}
              >
                {cover.key === 'custom' && coverValue ? (
                  <span className="custom-cover-thumb" style={{ backgroundImage: `url(${coverValue})` }} />
                ) : (
                  cover.label
                )}
              </button>
            ))}
          </div>

          <div className="notebook-custom-cover-row">
            <label className="notebook-custom-cover-button">
              ＋ Upload custom cover
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => pickCustomCover(event.target.files?.[0])}
              />
            </label>

            {coverType === 'custom' && coverValue && (
              <button
                type="button"
                className="notebook-clear-cover-button"
                onClick={() => {
                  setCoverType('walnut')
                  setCoverValue('')
                }}
              >
                Remove custom
              </button>
            )}
          </div>
        </div>

        <div className="notebook-creator-row">
          <label className="notebook-field">
            <span>Default page type</span>
            <select value={defaultPageType} onChange={(event) => setDefaultPageType(event.target.value)}>
              {PAGE_TYPES.map((type) => <option key={type.key} value={type.key}>{type.label}</option>)}
            </select>
          </label>

          <label className="notebook-field">
            <span>Default page shade</span>
            <select value={defaultPageShade} onChange={(event) => setDefaultPageShade(event.target.value)}>
              {PAGE_SHADES.map((shade) => <option key={shade.key} value={shade.key}>{shade.label}</option>)}
            </select>
          </label>
        </div>

        <p className="notebook-edit-note">
          {isEditing
            ? 'Changes affect the notebook cover and defaults for new pages. Existing pages keep their own page type and shade.'
            : 'Notebooks begin with one page. Use Add page whenever you need more.'}
        </p>

        <div className="notebook-creator-actions">
          <button type="button" className="ghost-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="primary-btn" onClick={saveNotebook} disabled={!title.trim() || creating}>
            {creating ? (isEditing ? 'Saving…' : 'Creating…') : (isEditing ? 'Save Changes' : 'Create Notebook')}
          </button>
        </div>
      </div>
    </div>
  )
}
