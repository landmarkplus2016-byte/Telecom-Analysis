# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this app is

**Telecom Analysis** — a static, zero-build web app for the Telecom Department. It pulls a macro-enabled Excel file (`Total_Task_Tracking_New_2026.xlsm`) from Dropbox, parses the **"Invoicing Track"** sheet, and renders dashboards, task tables, and financial summaries. No server, no npm, no framework — open `index.html` directly in a browser or deploy to GitHub Pages.

## Running the app

Open `index.html` directly in a browser (double-click or `File → Open`). On first launch go to **Settings**, enter a Dropbox Access Token and file path, then hit **Sync**.

There is no build step, no dev server, and no package manager.

## Script load order (enforced in index.html)

Scripts must stay in this exact order — each file depends on globals defined by earlier ones:

```
config.js → parser.js → charts.js → dashboard.js →
tasks.js → financials.js → admin.js → dropbox.js → pwa.js → app.js
```

> `category.js` was removed — the By Category section no longer exists.

## Global namespace conventions

Every JS file exposes exactly one `window.*` object. Never use ES modules (`import`/`export`) — the app must work without a bundler.

| Global | Defined in | Purpose |
|---|---|---|
| `window.AppData` | `app.js` (init) | The parsed task array — single source of truth for all sections |
| `window.SettingsModule` | `settings.js` | localStorage R/W for token, path, cache, last-sync |
| `window.Parser` | `parser.js` | `parseSheet(workbook)` → normalized array |
| `window.Charts` | `charts.js` | Live Chart.js instances keyed by string |
| `window.ChartsModule` | `charts.js` | `createPie / createDoughnut / createBar / createHBar / destroyAll` |
| `window.Dashboard` | `dashboard.js` | `render()` |
| `window.TasksModule` | `tasks.js` | `render()`, `applyFilters()`, `goToPage(n)` |
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
- `contractor2` is parsed as a **number** (`getNum`) — it holds the contractor's EGP portion, not a name
- `ctrInvoiceNo` is parsed as a string — the contractor's own invoice reference number
- `ctrInvoiceSubmitDate` is parsed as a formatted date string via `formatDate`

## Chart pattern

Always call `ChartsModule.createXxx(key, canvasId, ...)` — never construct `new Chart()` directly. The helpers call `destroy(key)` first, preventing the "Canvas already in use" Chart.js error. All instances live in `window.Charts[key]`.

Charts are rendered inside `setTimeout(..., 60)` so the DOM has settled after `innerHTML` assignment.

### Available chart helpers

| Helper | Signature | Notes |
|---|---|---|
| `createPie` | `(key, canvasId, labels, data, colors)` | Pie chart; tooltip shows `label: EGP X (pct%)` |
| `createDoughnut` | `(key, canvasId, labels, data, colors)` | Doughnut; tooltip shows value + percentage |
| `createBar` | `(key, canvasId, labels, datasets, opts)` | Vertical bar; `opts.egp=true` formats tooltip and y-axis as EGP |
| `createHBar` | `(key, canvasId, labels, data, color, opts)` | Horizontal bar; `opts.egp=true` formats tooltip and x-axis as EGP |

## Dashboard section (dashboard.js)

**Architecture decision:** Dashboard always pre-filters to `status === 'Done'` tasks only. This is hardcoded in `applyFilters()` — there is no Status filter UI. All KPIs and charts reflect Done tasks only.

### KPI Cards (3)

Uses `kpi-grid kpi-grid-3` — stacks to a single column on mobile (≤480px).

| Card | Source field | Color |
|---|---|---|
| Total Amount | sum `newTotalPrice` | green |
| LMP Portion | sum `lmp` | blue |
| Contractor Portion | sum `contractor2` | red |

> FAC Amount and NFAC Amount cards were removed — redundant given the chart coverage.

### Charts (4)

| Chart | Type | Logic |
|---|---|---|
| Old vs New Amount | Grouped Column | Splits tasks by `taskDate` year: **Old** = pre-2026, **New** = 2026+; datasets are LMP Portion (blue `#2563eb`) and Contractor Portion (red `#dc2626`); tasks with no `taskDate` excluded |
| Done vs NFAC Amount | Pie | Done = `taskDate` filled; NFAC = `facDate` empty |
| FAC Invoicing Status | Grouped Column | LMP Portion (blue `#2563eb`) and Contractor Portion (red `#dc2626`); categories are FAC Not Invoiced and FAC Sent to Invoice |
| Contractors Amount | HBar | Group by `contractor` name, sum `contractor2` amounts, top 10 desc; bars use red shades (`rgba(220,38,38,...)`) with opacity gradient |

Chart order: Old vs New → Done vs NFAC → FAC Invoicing Status → Contractors Amount.

### Filters (4)

Task Date · Contractor · Acceptance Status · FAC Date

> Status filter removed — dashboard is locked to Done tasks.

All EGP values formatted as `EGP X,XXX,XXX` (prefix, no decimals).

### Render architecture

`render()` builds the filter bar once and writes a `#dash-results` div. Filter changes call `renderResults()` which recomputes KPIs and charts from the filtered subset — filter controls never lose their state or focus.

## Invoices section (financials.js)

Previously named "Financials". The nav item, section `aria-label`, and `<h2>` heading were all renamed to **Invoices**. The module filename and global (`window.FinancialsModule`) are unchanged.

### Filters (5)

VF Invoice # · VF Invoice Submission Date · Cash Received Date · **Contractor Invoice #** · **Contractor Invoice Subm Date**

### Auto-fill behavior

Two invoice auto-fill chains exist:

**VF Invoice # selected (exact match):**
- Auto-fills VF Invoice Submission Date
- Auto-fills Cash Received Date
- Triggers full `render()` to rebuild date selects

**Contractor Invoice # selected (exact match):**
- Auto-fills Contractor Invoice Subm Date
- Auto-fills VF Invoice # (linked from same row)
- Auto-fills VF Invoice Submission Date
- Auto-fills Cash Received Date
- Triggers full `render()` to rebuild all date selects

Partial/typed values (no exact match) filter in-place via `renderResults()` without rebuilding the filter bar.

### Parser fields for Contractor Invoice

| Field | Excel column | Type |
|---|---|---|
| `ctrInvoiceNo` | `Contractor Invoice #` | string |
| `ctrInvoiceSubmitDate` | `Contractor Invoice Subm Date` | formatted date string |

## All Tasks section (tasks.js)

### Table columns (8)

Job Code · Logical Site ID · Contractor · Line Item · New Total Price (EGP) · Status · Acceptance · **PO Status**

> PO Status column was added as the rightmost column.

### Total amount row

A highlighted row (`.table-total-row`, light blue background) sits above the column headers showing the sum of `newTotalPrice` for **all filtered rows** (not just the current page). Updates on every filter change via `renderResults()`.

### Filters

Task Date · FAC Date · PO Status · Contractor · Search (Job Code, Site ID, Contractor, Line Item)

All filters share the collapsible panel pattern (see below). Clear button resets all state and calls `render()`.

## Collapsible filter pattern (mobile UX)

Used in **Dashboard**, **Invoices**, and **All Tasks**. CSS classes live in `styles.css`:

- `.dash-filter-toggle` — the toggle button, hidden on desktop (`≥768px`)
- `.dash-filter-chevron` — rotates 180° when open (`.open` class)
- `.dash-filters-body` — hidden on mobile by default; `.open` makes it visible; always visible on desktop via `!important`
- `.dash-filter-count` — blue pill badge showing the count of active filters; hidden when count is 0

**Pattern rules:**
- Filter body is collapsed on mobile by default
- A blue badge on the toggle button shows how many filters are active, even when the panel is closed
- Clear button resets all state and calls `render()` (full re-render to reset all select elements)
- `updateFilterBadge()` must be called alongside `renderResults()` on every filter change

## Section title convention

Every section `<h2>` heading includes the same emoji used in the nav drawer:

| Section | Icon | Nav label |
|---|---|---|
| Dashboard | 📊 | Dashboard |
| All Tasks | 📋 | All Tasks |
| Invoices | 💰 | Invoices |
| Admin | ⚙️ | Admin |

## Sidebar branding (drawer-brand-frame)

The Landmark Plus logo is displayed in the side drawer above the footer, placed in a `<div class="drawer-brand-frame">`. The logo image (`assets/landmark-plus-logo.png`) has a black border with rounded corners applied directly via CSS — no background fill:

```css
.drawer-brand-logo {
  border: 2.5px solid #000;
  border-radius: 12px;
  max-width: 140px;
}
```

The logo file must be placed at `assets/landmark-plus-logo.png` and is included in the SW cache list.

## Adding a new section

1. Add a `<section id="section-NAME">` + inner `<div id="NAME-content">` in `index.html`
2. Add a nav item with `data-section="NAME"` in the drawer (include an emoji icon)
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

### Table total row

`.table-total-row th` — used in the All Tasks table to show the filtered total above the column headers. Styled with `var(--primary-light)` background and `var(--primary-dark)` text.

## PWA & icons (pwa.js / sw.js)

- Icon files expected at `assets/icon-192.png` and `assets/icon-512.png`
- `sw.js` intercepts requests for those paths: **tries the real file first**, falls back to generating a canvas "TA" icon only if the file returns a non-OK response
- `pwa.js` `ensureIcons()` does the same on the client: loads each image, updates the `<link>` tag href if it loads, generates a canvas blob fallback if it fails
- To use a custom icon: place the PNG files in `assets/` at the correct sizes — both the SW and `ensureIcons()` will automatically prefer them over the generated fallback
- SW cache is versioned (`CACHE_NAME` in `sw.js`) — **bump the version string whenever cached files change** to force clients to pick up the new SW
- Current cache version: `telecom-analysis-v8`
