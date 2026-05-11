import { useState } from 'react'

export const markColors = [
  ['Tea', '#d8b65d88'],
  ['Ochre', '#c9953f88'],
  ['Rose', '#b77a7888'],
  ['Sage', '#9aaa7188'],
  ['Lavender', '#8b7bae88'],
  ['Blue', '#8fa3b788'],
]

export const underlineStyles = [
  ['solid', 'Straight'],
  ['curly', 'Curly'],
  ['dashed', 'Dash'],
  ['dotted', 'Dotted'],
  ['squiggly', 'Squiggly'],
]

export default function MarkToolbar({
  activeMarkTool,
  setActiveMarkTool,
  activeMarkColor,
  setActiveMarkColor,
  activeUnderlineStyle,
  setActiveUnderlineStyle,
}) {
  const [open, setOpen] = useState(null)

  function chooseHighlight(color) {
    setActiveMarkColor(color)
    setActiveMarkTool('highlight')
    setOpen(null)
  }

  function chooseUnderline(style) {
    setActiveUnderlineStyle(style)
    setActiveMarkColor(activeMarkColor || '#6b4a2ecc')
    setActiveMarkTool('underline')
    setOpen(null)
  }

  function toggle(tool) {
    setOpen((current) => (current === tool ? null : tool))
    if (tool === 'highlight') setActiveMarkTool(activeMarkTool === 'highlight' ? null : 'highlight')
    if (tool === 'underline') setActiveMarkTool(activeMarkTool === 'underline' ? null : 'underline')
  }

  return (
    <div className="mark-tools compact-mark-tools" aria-label="Annotation tools">
      <div className={`mark-menu ${open === 'highlight' ? 'open' : ''}`}>
        <button
          className={`bubble-btn compact ${activeMarkTool === 'highlight' ? 'active' : ''}`}
          title="Highlight"
          data-tooltip="Highlight"
          aria-label="Highlight"
          onClick={() => toggle('highlight')}
        >H</button>
        {open === 'highlight' && (
          <div className="mark-popover highlight-popover">
            {markColors.map(([name, color]) => (
              <button
                key={name}
                className={`tool-dot ${activeMarkTool === 'highlight' && activeMarkColor === color ? 'active' : ''}`}
                title={`Highlight ${name}`}
                data-tooltip={`Highlight ${name}`}
                aria-label={`Highlight ${name}`}
                style={{ background: color }}
                onClick={() => chooseHighlight(color)}
              />
            ))}
          </div>
        )}
      </div>

      <div className={`mark-menu ${open === 'underline' ? 'open' : ''}`}>
        <button
          className={`bubble-btn compact ${activeMarkTool === 'underline' ? 'active' : ''}`}
          title="Underline"
          data-tooltip="Underline"
          aria-label="Underline"
          onClick={() => toggle('underline')}
        >U</button>
        {open === 'underline' && (
          <div className="mark-popover underline-popover">
            <div className="underline-colors">
              {markColors.map(([name, color]) => (
                <button
                  key={name}
                  className={`tool-dot ${activeMarkColor === color ? 'active' : ''}`}
                  title={`Underline ${name}`}
                  data-tooltip={name}
                  aria-label={`Underline ${name}`}
                  style={{ background: color }}
                  onClick={() => setActiveMarkColor(color)}
                />
              ))}
            </div>
            <div className="underline-styles">
              {underlineStyles.map(([style, name]) => (
                <button
                  key={style}
                  className={`line-style-btn ${activeUnderlineStyle === style ? 'active' : ''}`}
                  title={`${name} underline`}
                  data-tooltip={name}
                  onClick={() => chooseUnderline(style)}
                >{name}</button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
