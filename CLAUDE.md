# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this app is

**Telecom Analysis** — a static, zero-build web app for the Telecom Department. It pulls a macro-enabled Excel file (`Total_Task_Tracking_New_2026.xlsm`) from Dropbox, parses the **"Invoicing Track"** sheet, and renders dashboards, task tables, category breakdowns, and financial summaries. No server, no npm, no framework — open `index.html` directly in a browser or deploy to GitHub Pages.

## Running the app

Open `index.html` directly in a browser (double-click or `File → Open`). On first launch go to **Settings**, enter a Dropbox Access Token and file path, then hit **Sync**.

There is no build step, no dev server, and no package manager.

## Script load order (enforced in index.html)

Scripts must stay in this exact order — each file depends on globals defined by earlier ones:

```
settings.js → parser.js → charts.js → dashboard.js →
tasks.js → category.js → financials.js → dropbox.js → app.js
```

## Global namespace conventions

Every JS file exposes exactly one `window.*` object. Never use ES modules (`import`/`export`) — the app must work without a bundler.

| Global | Defined in | Purpose |
|---|---|---|
| `window.AppData` | `app.js` (init) | The parsed task array — single source of truth for all sections |
| `window.SettingsModule` | `settings.js` | localStorage R/W for token, path, cache, last-sync |
| `window.Parser` | `parser.js` | `parseSheet(workbook)` → normalized array |
| `window.Charts` | `charts.js` | Live Chart.js instances keyed by string |
| `window.ChartsModule` | `charts.js` | `createDoughnut / createBar / createHBar / destroyAll` |
| `window.Dashboard` | `dashboard.js` | `render()` |
| `window.TasksModule` | `tasks.js` | `render()`, `applyFilters()`, `goToPage(n)` |
| `window.CategoryModule` | `category.js` | `render()` |
| `window.FinancialsModule` | `financials.js` | `render()` |
| `window.DropboxModule` | `dropbox.js` | `fetchFile()` → XLSX workbook |
| `window.showToast` | `app.js` | `showToast(msg, 'success'|'error'|'info')` |

## Data flow

```
Dropbox API v2  →  DropboxModule.fetchFile()  →  XLSX workbook
                →  Parser.parseSheet()         →  window.AppData[]
                →  SettingsModule.setCachedData()  (localStorage)
                →  renderSection()             →  section modules read AppData
```

On page load, `app.js` reads `localStorage` and populates `window.AppData` before calling `Dashboard.render()` — so the app is fully functional offline after the first sync.

## Parser details (parser.js)

- Target sheet: `"Invoicing Track"` (case-insensitive fallback)
- **Header row: index 3** (the 4th row; rows 0–2 are title/metadata rows)
- **Data rows: index 4 onwards**
- Column lookup: exact match first, then case-insensitive partial match — tolerates minor header drift
- Row skip rules: blank ID, ID matching `/^(id#?|total|subtotal|grand)/i`, or ID with no digit
- Status normalized to: `Done | Assigned | Cancelled | Duplicated | Other`
- Region normalized to Title Case (first char upper, rest lower)
- Acceptance Status normalized to uppercase: `FAC | TOC | PAC`
- Excel serial dates converted via `(val - 25569) * 86400000` ms offset

## Chart pattern

Always call `ChartsModule.createXxx(key, canvasId, ...)` — never construct `new Chart()` directly. The helpers call `destroy(key)` first, preventing the "Canvas already in use" Chart.js error. All instances live in `window.Charts[key]`.

Charts are rendered inside `setTimeout(..., 60)` so the DOM has settled after `innerHTML` assignment.

## Adding a new section

1. Add a `<section id="section-NAME">` + inner `<div id="NAME-content">` in `index.html`
2. Add a nav item with `data-section="NAME"` in the drawer
3. Create `js/NAME.js` exposing `window.NAMEModule = { render }`
4. Add `NAME` to `ALL_SECTIONS` in `app.js` and a `renderSection` branch
5. Add the `<script>` tag before `dropbox.js` in `index.html`

## localStorage keys

| Key | Content |
|---|---|
| `ta_dropbox_token` | Dropbox Bearer token |
| `ta_dropbox_path` | File path (e.g. `/Reports/file.xlsm`) |
| `ta_last_sync` | ISO timestamp of last successful sync |
| `ta_cached_data` | JSON-serialized `AppData` array |

Cache writes are wrapped in try/catch — large datasets may hit the ~5 MB quota silently.

## CSS conventions

All colors and spacing use CSS variables defined in `:root` in `css/styles.css`. Use the named color variables (`--primary`, `--success`, `--danger`, etc.) rather than hex values. KPI card accent colors are set via modifier classes (`.kpi-card.green`, `.kpi-card.red`, etc.).
