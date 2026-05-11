# Kaagaz

Kaagaz is a static, local-first PDF book reader that turns user-uploaded PDFs into personal books. PDFs remain on the user’s device. Notes, highlights, underlines, bookmarks, custom bookmark images, reading progress, PDF brightness, and interface settings are stored locally in IndexedDB through Dexie.

## What is included

- React + Vite static app
- PDF.js browser rendering
- IndexedDB/Dexie local persistence
- Local PDF fingerprinting
- Local PDF file storage for reopening from the same browser
- One-page and two-page reading views
- Toggleable natural page-turn effect
- Trackpad two-finger horizontal swipe support
- Touchscreen swipe support
- Optional page navigation arrows, hidden by default
- Progress percentage with toggle
- Left or bottom toolbar position
- Minimal bubble-style toolbar controls
- PDF brightness/dimming overlay slider
- Text highlights
- Text underlines
- Page-level notes
- Capture edited page/spread as PNG with highlights and underlines included
- Multiple bookmarks
- Botanical bookmark presets
- Custom image bookmarks
- Bookmark add/remove flow
- Local library deletion with confirmation that wipes the reading layer
- Dark-academia walnut/chestnut visual identity

## Install locally

```bash
npm install
npm run dev
```

Open the local Vite URL shown in the terminal, usually:

```text
http://localhost:5173/
```

## Build

```bash
npm run build
```

The production output is generated in:

```text
dist
```

## Cloudflare Pages deployment

1. Push this project to a GitHub repository.
2. In Cloudflare Pages, create a new project and connect the repository.
3. Use these settings:

```text
Framework preset: Vite
Build command: npm run build
Output directory: dist
```

4. Deploy.

## Local-first privacy model

Kaagaz deliberately does not export annotated PDFs in this pilot. Annotations remain as a private overlay on the user’s device. The original PDF remains clean and shareable.

When a book is removed from the welcome page, Kaagaz asks for confirmation and then deletes the local reading layer for that PDF from IndexedDB: annotations, highlights, underlines, notes, bookmarks, custom bookmark images, and progress. It does not delete the original file from the user’s computer.

## Usage notes

- For best highlighting and underlining, use Reader Mode / one-page view.
- Two-page view is designed for book-like reading and still supports annotations.
- Trackpad navigation works through horizontal two-finger swipes.
- Touch navigation works through left/right swipes.
- Navigation arrows are hidden by default and can be enabled from the toolbar.
- The capture button downloads a PNG of the current page or spread with visible highlights and underlines.

## Interaction notes

This build includes:

- Floating Kaagaz/logo/document/page/progress elements instead of a fixed top bar.
- Hover labels for the minimal bubble toolbar tools.
- One-page and two-page reading views.
- Keyboard page navigation using Arrow Left / Arrow Right, Page Up / Page Down, and Space.
- Trackpad horizontal swipe and touchscreen swipe navigation.
- Improved private overlay highlighting and underlining using the PDF text layer.
- Book jacket backgrounds: walnut, oxblood, forest, midnight, and a custom image upload.
- Library front-page thumbnails generated locally after a PDF is opened.
- Animated book-opening transition from the welcome library into the reader.

Annotations remain private local overlay data in IndexedDB. The original PDF is not altered or uploaded.

## Latest interaction patch

This package includes the latest reader/editor patch:

- reliable canvas rendering even when the text layer is unavailable
- selectable invisible text layer for highlight and underline overlays
- highlight and underline buttons preserve selection on click
- keyboard page navigation: Right/PageDown/Space and Left/PageUp
- trackpad horizontal swipe and touchscreen swipe page navigation
- right-side vertical zoom control with Fit toggle
- single compact Book Jacket button that expands to Walnut, Oxblood, Forest, Midnight, and custom image
- toolbar auto-hide after inactivity plus manual hide/show

For highlighting or underlining: select text directly on the PDF page, then click a colour dot or the underlined U tool. The marks are stored locally as overlays and do not modify the source PDF.
