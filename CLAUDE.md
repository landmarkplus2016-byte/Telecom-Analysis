# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this app is

**Telecom Analysis** — a static, zero-build web app for the Telecom Department. It pulls **two separate Excel files** from Dropbox, parses their respective sheets, and renders dashboards, task tables, and financial summaries. No server, no npm, no framework — open `index.html` directly in a browser or deploy to GitHub Pages.

| Source | File | Sheet | Global |
|---|---|---|---|
| Invoicing Track | `Total_Task_Tracking_New_2026.xlsm` | `Invoicing Track` | `window.AppData` |
| BH Sites | `BH Sites-Invoice Tracking` workbook | `POC3 Tracking` | `window.AppData2` |

## Running the app

Open `index.html` directly in a browser (double-click or `File → Open`). On first launch go to **Admin** (5-click logo or `#admin` hash), enter each Dropbox URL, then hit **Sync**.

There is no build step, no dev server, and no package manager.

## Script load order (enforced in index.html)

Scripts must stay in this exact order — each file depends on globals defined by earlier ones:

```
config.js → parser.js → parser2.js → charts.js → dashboard.js →
tasks.js → excel-export.js → financials.js → poc.js → admin.js → dropbox.js → pwa.js → app.js
```

> `category.js` was removed — the By Category section no longer exists.

### CDN dependencies (loaded before app modules)

| Library | Version | Purpose |
|---|---|---|
| SheetJS (`xlsx.full.min.js`) | 0.18.5 | **Reading** Excel files from Dropbox (parsing only) |
| Chart.js | 4.4.0 | Charts on the Dashboard |
| ExcelJS | 4.4.0 | **Writing** styled Excel exports — SheetJS community edition does not support cell styling |

> **Architecture decision:** SheetJS is used only for reading. ExcelJS is used only for writing. They coexist because they use different globals (`XLSX` vs `ExcelJS`) and serve different purposes. Do not use SheetJS `XLSX.writeFile` for export — styles are silently dropped in the community edition.

## Global namespace conventions

Every JS file exposes exactly one `window.*` object. Never use ES modules (`import`/`export`) — the app must work without a bundler.

| Global | Defined in | Purpose |
|---|---|---|
| `window.AppData` | `app.js` (init) | Parsed Invoicing Track rows — source of truth for Dashboard, All Tasks, TX-RF Invoice |
| `window.AppData2` | `app.js` (init) | Parsed POC3 Tracking rows (raw, keyed by header name) — source of truth for POC Invoices |
| `window.SettingsModule` | `settings.js` | localStorage R/W for token, path, cache, last-sync |
| `window.Parser` | `parser.js` | `parseSheet(workbook)` → normalized AppData array |
| `window.Parser2` | `parser2.js` | `parseSheet(workbook)` → raw AppData2 array |
| `window.Charts` | `charts.js` | Live Chart.js instances keyed by string |
| `window.ChartsModule` | `charts.js` | `createPie / createDoughnut / createBar / createHBar / destroyAll` |
| `window.Dashboard` | `dashboard.js` | `render()` |
| `window.TasksModule` | `tasks.js` | `render()`, `applyFilters()`, `goToPage(n)` |
| `window.FinancialsModule` | `financials.js` | `render()` |
| `window.POCModule` | `poc.js` | `render()` |
| `window.ExcelExport` | `excel-export.js` | `generate(selectedNos, allData, opts)` — builds and downloads a styled `.xlsx` |
| `window.DropboxModule` | `dropbox.js` | `fetchFile()` → workbook 1; `fetchFile2()` → workbook 2 |
| `window.showToast` | `app.js` | `showToast(msg, 'success'|'error'|'info')` |

## Data flow

### File 1 — Invoicing Track

```
Dropbox URL (telecom_file_url)  →  DropboxModule.fetchFile()   →  XLSX workbook
                                →  Parser.parseSheet()          →  window.AppData[]
                                →  localStorage (cacheKey)
                                →  renderSection()              →  Dashboard / Tasks / TX-RF Invoice
```

### File 2 — BH Sites

```
Dropbox URL (telecom_file_url_2)  →  DropboxModule.fetchFile2()  →  XLSX workbook
                                  →  Parser2.parseSheet()         →  window.AppData2[]  (raw rows)
                                  →  localStorage (cacheKey2)
                                  →  renderSection()              →  POC Invoices
```

On page load, `app.js` calls `loadCache()` and `loadCache2()` from localStorage before any render — so both sections are functional offline after the first sync.

### Sync button behavior

The single Sync button handles both files. If only one URL is configured, it syncs that file and silently skips the other. Toast shows combined result, e.g. `"1,234 tasks + 567 BH records"`. Each file's sync error is reported independently — a failure on one does not block the other.

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

## Parser2 details (parser2.js)

- Target sheet: `"POC3 Tracking"` (case-insensitive fallback)
- **Header row: auto-detected** — scans the first 30 rows for a row containing the exact string `"Inst Contractor"` (case-insensitive). No fixed row index assumption.
- Returns raw objects keyed by the header column names as they appear in the sheet.
- Fully blank rows are skipped.
- Does **not** normalize or type-cast values — all column detection and business logic is handled in `poc.js`.

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

## TX-RF Invoice section (financials.js)

Previously named "Financials", then "Invoices". The nav item, section `aria-label`, and `<h2>` heading are now **TX-RF Invoice**. The module filename and global (`window.FinancialsModule`) are unchanged.

### KPI Cards (3)

Each card shows the total value as the main figure, with an **Old / New breakdown subtitle** below it.

| Card | Tax note | Color |
|---|---|---|
| Total Amount | +14% | green |
| LMP Portion | total − contractor | blue |
| Contractor Portion | +11% / 13% | red |

`kpiCard(label, value, cls, subtitle)` — the 4th `subtitle` parameter is optional; renders as `.kpi-subtitle` (small muted text below the value).

### Contractor table

Groups by **contractor** (one row per contractor). **In-House is excluded from the table** — its contractor portion is always zero and it clutters the view. In-House amounts are still included in KPI card totals.

| Column | Notes |
|---|---|
| Contractor | — |
| Tax | Contractor-only rate: `11%` / `13%` / `14%` (In-House). Not the combined "14%/11%" format. |
| Contractor Portion taxed (EGP) | 3-level header → Old / New → Invoice # / Amount |

**3-level thead structure:**
- Row 1: `Contractor` (rowspan=3) · `Tax` (rowspan=3) · `Contractor Portion taxed (EGP)` (colspan=4)
- Row 2: `Old` (colspan=2) · `New` (colspan=2)
- Row 3: `Invoice #` · `Amount` · `Invoice #` · `Amount`

**Architecture decision:** LMP Portion was removed from the table — it is already visible in the KPI cards with Old/New breakdowns. The table focuses solely on Contractor Portion with per-period invoice numbers.

Invoice numbers (`ctrInvoiceNo`) are collected per contractor per period into `invOld` / `invNew` sets and displayed as comma-separated strings (or `—` if none).

### Filters (5)

VF Invoice # · VF Invoice Submission Date · Cash Received Date · **Contractor Invoice #** · **Contractor Invoice Subm Date**

### Invoice filter behavior

**Exact match** — both VF Invoice # and Contractor Invoice # use strict equality (`===`), not partial match. Users select from a datalist so partial search is not needed, and partial match caused false positives (e.g. searching "22" would show "122", "227").

### Contractor Invoice # datalist filtering

When a VF Invoice # is active, the Contractor Invoice # datalist shows **only the contractor invoices linked to that VF invoice**. This is enforced in two places:

1. **`buildFilterHTML()`** — filters `_data` by exact `vfInvoiceNo` match when building the contractor datalist.
2. **`renderResults()`** — also refreshes the contractor datalist `innerHTML` on every filter change, so the datalist stays in sync.

### Auto-fill behavior

Two invoice auto-fill chains exist. Both use `syncDateSelects()` instead of `render()` to update the date dropdowns in-place — this preserves focus on the invoice input (calling `render()` would destroy and recreate the input element, losing the cursor).

**VF Invoice # selected (exact match):**
- Auto-fills VF Invoice Submission Date
- Auto-fills Cash Received Date
- Filters Contractor Invoice # datalist to only related invoices

**Contractor Invoice # selected (exact match):**
- Auto-fills Contractor Invoice Subm Date
- Auto-fills VF Invoice # (linked from same row) — also updates the VF Invoice # input value in the DOM
- Auto-fills VF Invoice Submission Date
- Auto-fills Cash Received Date

**`syncDateSelects()`** — updates all six date `<select>` elements (year/month/day for each date filter) from the current `state` object, calling `refreshMonthSelect` / `refreshDaySelect` to repopulate options, then setting `.value` to match state. Defined in both `financials.js` and `poc.js` with their respective element ID prefixes (`fin-` / `poc-`).

### Parser fields for Contractor Invoice

| Field | Excel column | Type |
|---|---|---|
| `ctrInvoiceNo` | `Contractor Invoice #` | string |
| `ctrInvoiceSubmitDate` | `Contractor Invoice Subm Date` | formatted date string |

## POC Invoices section (poc.js)

Reads `window.AppData2` (raw POC3 Tracking rows), expands each source row into two output rows (Installation + Migration), then renders the same KPI + filter + contractor table structure as the TX-RF Invoice section.

### Column detection

`poc.js` does **pattern matching** on the raw object key names from `AppData2`. No fixed column indices. Key patterns:

| Logical field | Match rule |
|---|---|
| `jobCode` | `=== 'job code'` |
| `siteId` | `=== 'site id'` |
| `lineItem` | `=== 'line item'` |
| `total` | `includes('total amount')` |
| `instContractor` | `=== 'inst contractor'` |
| `lmpIns` | `includes('lmp') && includes('ins') && !includes('mig')` |
| `conIns` | `includes('contractor') && includes('portion') && includes('ins')` |
| `installDate` | `includes('installation') && includes('date')` |
| `invoiceIns` | `includes('invoice') && includes('ins') && !includes('contractor')` |
| `poIns` | `startsWith('po') && !includes('portion') && includes('ins') && !includes('mig')` |
| `instConInvoice` | `includes('inst') && includes('contractor') && includes('invoice')` |
| `migrContractor` | `includes('migr') && includes('contractor') && !includes('invoice')` |
| `lmpMig` | `includes('lmp') && includes('mig')` |
| `conMig` | `includes('contractor') && includes('portion') && includes('mig')` |
| `migrDate` | `includes('migration') && includes('date')` |
| `invoiceMig` | `includes('invoice') && includes('mig') && !includes('contractor')` |
| `poMig` | `startsWith('po') && !includes('portion') && includes('mig')` |
| `migrConInvoice` | `includes('migr') && includes('contractor') && includes('invoice')` |
| `vfSubmitDate` | `includes('vf') && (includes('submit') \|\| includes('submission'))` |
| `cashReceived` | `includes('cash') && includes('receiv')` |
| `ctrSubmitDate` | `includes('contractor') && includes('invoice') && (includes('subm') \|\| includes('submit'))` |

Date columns (`vfSubmitDate`, `cashReceived`, `ctrSubmitDate`) may not exist in all sheet versions — if not found, those filters render empty and do nothing.

### Row splitting

Each source row produces **two output rows** with these rules:

- `newTotalPrice = Total Amount / 2` for both rows
- `taskType` (`"New"` / `"Old"`) is **always derived from `installDate`** — year ≥ 2026 → New — even for the Migration row
- Both rows carry both `installDate` and `migrDate`
- Rows with empty `jobCode` AND empty `siteId` are skipped

Output row fields use the same names as `AppData` rows (`contractor`, `newTotalPrice`, `lmp`, `contractor2`, `vfInvoiceNo`, `ctrInvoiceNo`, etc.) so the same tax logic and filter functions work unchanged.

### Tax logic

Identical to TX-RF Invoice tab:
- `totalTaxed = newTotalPrice × 1.14`
- `contractorTaxed = contractor2 × 1.13` (Upper Telecom) / `× 1.11` (others) / `0` (In-House)
- `lmpTaxed = totalTaxed − contractorTaxed`

### Contractor table

Same 3-level header structure as TX-RF Invoice. **In-House excluded from the table** (same rule as TX-RF Invoice — zero contractor portion, excluded for clarity; still counted in KPI totals).

### Filters (5)

VF Invoice # · VF Invoice Submission Date · Cash Received Date · Contractor Invoice # · Contractor Invoice Subm Date

Same exact-match and auto-fill behavior as TX-RF Invoice. `syncDateSelects()` is used (not `render()`) to avoid focus loss.

### Export card render pattern (both sections)

`render()` writes three containers into the section content div:

```
<div class="card fin-filter-card">  ← filter controls, built once
<div id="[fin|poc]-export-card">    ← export card, filled by renderExportCard()
<div id="[fin|poc]-results">        ← KPIs + table, filled by renderResults()
```

`renderExportCard()` is called from `render()` (not on every filter change). It rebuilds the export card HTML from `_exportInput` (the persisted input string) and re-binds events. `updateExportUI()` is the lightweight updater called on every keystroke and chip click — it syncs chips, status text, and the download button without touching the input element.

## Excel Export feature (excel-export.js)

Both **TX-RF Invoice** and **POC Invoices** sections expose an "Export to Excel" card that appears between the filter card and the results. The export is driven by `window.ExcelExport.generate()`.

### Selector UI

- A single text input where the user types space-separated VF invoice numbers.
- Below the input: all available VF invoice numbers rendered as clickable **chips**. Clicking a chip toggles it into/out of the text input. Active chips show a ✓ and blue highlight (`.invoice-chip-active`).
- A live status line shows `"N invoices selected"` and warns about any typed values that don't exist in `_data`.
- The **Download Excel** button shows the count and is disabled until at least one valid invoice is in the input.
- **Clear** resets the input and chips.
- Selection state is stored in `_exportInput` (a module-level string), so it persists across filter changes but resets on page reload.

### Excel generation (`ExcelExport.generate`)

```javascript
ExcelExport.generate(selectedNos, allData, {
  filename: 'TX-RF-Invoices.xlsx',   // or 'POC-Invoices.xlsx'
  isNew: function(row) { ... },       // returns true if row is "New" (2026+)
  calcTax: function(row) { ... },     // returns { totalTaxed, lmpTaxed, contractorTaxed }
  contractorTaxLabel: function(name)  // returns '11%' / '13%' / '14%'
});
```

- All selected invoices are written to a **single sheet** named `Invoices`.
- Each invoice is an independent block stacked vertically, separated by 2 blank rows.
- In-House is excluded from each block's contractor rows (same rule as the on-screen table).
- Amount cells use `#,##0` number format so Excel renders commas with no decimals.

### Per-block layout (rows relative to block start)

| Offset | Content | Columns |
|---|---|---|
| 0 | Title row: `"Invoice: X  VF Submit: …  Cash Received: …"` | A–F merged |
| 1 | Blank row | — |
| 2 (H1) | `Contractor` / `Tax` / `Contractor Portion taxed (EGP)` | A–B / C–F merged |
| 3 (H2) | *(blank)* / `Old` / `New` | A–B / C–D merged / E–F merged |
| 4 (H3) | *(blank)* / `Invoice #` / `Amount (EGP)` / `Invoice #` / `Amount (EGP)` | A–B / C / D / E / F |
| 5..N | Contractor data rows | — |
| N+1 | Total row | — |

Contractor and Tax header cells span H1–H3 (rows 2–4) via Excel merge.

### Cell colour scheme

| Area | Fill | Text |
|---|---|---|
| Title row | `#00B050` green | White bold |
| Contractor + Tax header (spans H1–H3) | `#C00000` red | White bold |
| "Contractor Portion taxed (EGP)" (H1 cols C–F) | `#2563EB` blue | White bold |
| Old / Invoice # / Amount **headers** (H2–H3 cols C–D) | `#DCFCE7` light green | Black bold |
| Old Invoice # + Amount **data cells** | `#F0FDF4` very light green | Black |
| New / Invoice # / Amount **headers** (H2–H3 cols E–F) | `#DBEAFE` light blue | Black bold |
| New Invoice # + Amount **data cells** | `#EFF6FF` very light blue | Black |
| Total row | `#808080` gray | White bold |
| Contractor name + Tax% data cells | No fill | Black |

Invoice # and Amount cells are **center-aligned** in both headers and data rows.

### CSS classes added for the export card

| Class | Purpose |
|---|---|
| `.invoice-export-card` | Card wrapper (border, padding, background) |
| `.invoice-export-header` | Flex row: title left, action buttons right |
| `.invoice-export-title` | Bold section label |
| `.invoice-export-actions` | Button group (Clear + Download) |
| `.invoice-export-input` | Full-width text input (`width:100%`) |
| `.invoice-export-chips` | Scrollable flex wrap of chip pills (max-height 130px) |
| `.invoice-chip` | Individual pill — border, rounded, hover effect |
| `.invoice-chip-active` | Selected state — blue border/bg, ✓ prefix |
| `.invoice-export-status` | Small status line below chips |
| `.btn-sm` | Small button variant (`padding .28rem .65rem; font-size .8rem`) |

## All Tasks section (tasks.js)

### Table columns (8)

Job Code · Logical Site ID · Contractor · Line Item · New Total Price (EGP) · Status · Acceptance · **PO Status**

> PO Status column was added as the rightmost column.

### Total amount row

A highlighted row (`.table-total-row`, light blue background) sits above the column headers showing the sum of `newTotalPrice` for **all filtered rows** (not just the current page). Updates on every filter change via `renderResults()`.

### Filters

Task Date · FAC Date · PO Status · Contractor · Search (Job Code, Site ID, Contractor, Line Item)

All filters share the collapsible panel pattern (see below). Clear button resets all state and calls `render()`.

## Admin panel (admin.js)

The Admin panel is hidden by default — revealed by clicking the drawer logo 5 times within 2 seconds, or by navigating to `#admin`.

### Dropbox Configuration cards (2)

One card per data source, each self-contained:

| Card | localStorage key | Config URL param |
|---|---|---|
| Invoicing Track | `telecom_file_url` | `?cfg=<base64>` |
| BH Sites | `telecom_file_url_2` | `?cfg2=<base64>` |

Each card has: URL input → Save button → status badge → divider → Generate Config URL button + copy output.

**`handleConfigParam()` in `app.js`** reads both `?cfg=` and `?cfg2=` on page load — so a single shared link can configure either or both files at once.

### Cache Management card

Shows record count and last sync time for **both** files separately. "Clear All Cache" removes all four localStorage keys (`cacheKey`, `lastSyncKey`, `cacheKey2`, `lastSyncKey2`) and resets both `AppData` and `AppData2`.

## Collapsible filter pattern (mobile UX)

Used in **Dashboard**, **TX-RF Invoice**, **POC Invoices**, and **All Tasks**. CSS classes live in `styles.css`:

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
| TX-RF Invoice | 💰 | TX-RF Invoice |
| POC Invoices | 🗄️ | POC Invoices |
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
| `telecom_file_url` | Dropbox direct-download URL for File 1 (Invoicing Track) |
| `telecom_file_url_2` | Dropbox direct-download URL for File 2 (BH Sites) |
| `telecom_data_cache` | JSON-serialized `AppData` array (File 1) |
| `telecom_last_sync` | ISO timestamp of last successful File 1 sync |
| `telecom_data_cache_2` | JSON-serialized `AppData2` array (File 2) |
| `telecom_last_sync_2` | ISO timestamp of last successful File 2 sync |
| `ta_dropbox_token` | Legacy Dropbox Bearer token (settings.js) |
| `ta_dropbox_path` | Legacy file path (settings.js) |

Cache writes are wrapped in try/catch — large datasets may hit the ~5 MB quota silently.

## CSS conventions

All colors and spacing use CSS variables defined in `:root` in `css/styles.css`. Use the named color variables (`--primary`, `--success`, `--danger`, etc.) rather than hex values. KPI card accent colors are set via modifier classes (`.kpi-card.green`, `.kpi-card.red`, etc.).

### Table total row

`.table-total-row th` — used in the All Tasks table to show the filtered total above the column headers. Styled with `var(--primary-light)` background and `var(--primary-dark)` text.

### KPI subtitle

`.kpi-subtitle` — small muted line rendered below `.kpi-value` inside a KPI card. Used in the TX-RF Invoice and POC Invoices sections to show the Old / New breakdown beneath each card's total. Pass as the 4th argument to `kpiCard()`.

## PWA & icons (pwa.js / sw.js)

- Icon files expected at `assets/icon-192.png` and `assets/icon-512.png`
- `sw.js` intercepts requests for those paths: **tries the real file first**, falls back to generating a canvas "TA" icon only if the file returns a non-OK response
- `pwa.js` `ensureIcons()` does the same on the client: loads each image, updates the `<link>` tag href if it loads, generates a canvas blob fallback if it fails
- To use a custom icon: place the PNG files in `assets/` at the correct sizes — both the SW and `ensureIcons()` will automatically prefer them over the generated fallback
- SW cache is versioned (`CACHE_NAME` in `sw.js`) — **bump the version string whenever cached files change** to force clients to pick up the new SW
- Current cache version: `telecom-analysis-v9`
