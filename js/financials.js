/* =========================================================
   financials.js — Telecom Analysis
   Financials section: filters, 3 KPI cards, contractor table.
   Exposes: window.FinancialsModule.render()
   ========================================================= */

window.FinancialsModule = (function () {

  /* ── State ── */
  var state = {
    vfInvoiceNo:   '',
    vfSubmitYear:  '', vfSubmitMonth:  '', vfSubmitDay:  '',
    cashRcvYear:   '', cashRcvMonth:   '', cashRcvDay:   '',
    contractor:    '',   // narrows results + the contractor invoice list
    ctrInvoiceNos: [],   // multi-select — empty means all
    ctrSubmitYear: '', ctrSubmitMonth: '', ctrSubmitDay: '',
    tsrSubNo:      ''
  };

  var _data = []; // module-level data cache
  var _exportInput = ''; // space-separated VF invoice numbers typed by user
  var _ctrAutoFilled = false; // VF # + dates were filled from a single contractor invoice pick
  var _docClickBound = false; // outside-click closer for the multi-select, bound once

  /* ── Helpers ── */
  function fmt(n) {
    return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  function escHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ── Tax calculation per row ──────────────────────────────
     Rules:
       totalTaxed       = newTotalPrice × 1.14  (always 14%)
       contractorTaxed  = contractor2 × 1.13    (Upper Telecom)
                        = contractor2 × 1.14    (El-Khayal)
                        = contractor2 × 1.10    (all other non In-House)
                        = 0                     (In-House)
       lmpTaxed         = totalTaxed             (In-House)
                        = totalTaxed − contractorTaxed  (everyone else)
  ─────────────────────────────────────────────────────────── */
  function calcTax(r) {
    var c            = String(r.contractor || '').trim().toLowerCase();
    var totalTaxed   = (r.newTotalPrice || 0) * 1.14;
    var contractorTaxed, lmpTaxed;

    if (c === 'in-house') {
      contractorTaxed = 0;
      lmpTaxed        = totalTaxed;
    } else {
      var cRate       = (c === 'upper telecom') ? 1.13 : (c === 'el-khayal') ? 1.14 : 1.10;
      contractorTaxed = (r.contractor2 || 0) * cRate;
      lmpTaxed        = totalTaxed - contractorTaxed;
    }

    return { totalTaxed: totalTaxed, lmpTaxed: lmpTaxed, contractorTaxed: contractorTaxed };
  }

  /* Contractor-only tax rate for table (just the contractor portion rate) */
  function contractorTaxLabel(contractor) {
    var c = String(contractor || '').trim().toLowerCase();
    if (c === 'in-house')      return '14%';
    if (c === 'upper telecom') return '13%';
    if (c === 'el-khayal')     return '14%';
    return '10%';
  }

  /* Parse "DD/MM/YYYY" → {day, month, year} or null */
  function parseDateParts(s) {
    if (!s) return null;
    var m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    var y = +m[3];
    if (y < 2000) return null;   // discard Excel-epoch garbage (serial 0 → 1900)
    return { day: +m[1], month: +m[2], year: y };
  }

  function dateMatchesFilter(dateStr, y, mo, d) {
    if (!y && !mo && !d) return true;
    var p = parseDateParts(dateStr);
    if (!p) return false;
    if (y  && p.year  !== +y)  return false;
    if (mo && p.month !== +mo) return false;
    if (d  && p.day   !== +d)  return false;
    return true;
  }

  /* Returns true if taskDate year === 2026 → "New", else "Old" */
  function isNewTask(r) {
    var p = parseDateParts(r.taskDate);
    return p && p.year === 2026;
  }

  /* Unique sorted years (≥ 2000) in a date field */
  function getYears(data, field) {
    var seen = {};
    data.forEach(function (r) { var p = parseDateParts(r[field]); if (p) seen[p.year] = 1; });
    return Object.keys(seen).map(Number).sort();
  }

  /* Months present for a selected year */
  function getMonths(data, field, year) {
    var seen = {};
    data.forEach(function (r) {
      var p = parseDateParts(r[field]);
      if (p && (!year || p.year === +year)) seen[p.month] = 1;
    });
    return Object.keys(seen).map(Number).sort(function (a, b) { return a - b; });
  }

  /* Days present for selected year + month */
  function getDays(data, field, year, month) {
    var seen = {};
    data.forEach(function (r) {
      var p = parseDateParts(r[field]);
      if (p && (!year || p.year === +year) && (!month || p.month === +month)) seen[p.day] = 1;
    });
    return Object.keys(seen).map(Number).sort(function (a, b) { return a - b; });
  }

  /* Unique sorted VF Invoice numbers for datalist */
  function getInvoiceNumbers(data) {
    var seen = {};
    data.forEach(function (r) {
      var v = String(r.vfInvoiceNo || '').trim();
      if (v) seen[v] = 1;
    });
    return Object.keys(seen).sort();
  }

  /* When an exact VF invoice number is selected, auto-fill its dates into state.
     Returns true if a match was found. */
  function autoFillDates(invoiceNo) {
    var trimmed = String(invoiceNo || '').trim();
    if (!trimmed) return false;
    var match = null;
    for (var i = 0; i < _data.length; i++) {
      if (String(_data[i].vfInvoiceNo || '').trim() === trimmed) { match = _data[i]; break; }
    }
    if (!match) return false;

    var sp = parseDateParts(match.vfInvoiceSubmissionDate);
    if (sp) {
      state.vfSubmitYear  = String(sp.year);
      state.vfSubmitMonth = String(sp.month);
      state.vfSubmitDay   = String(sp.day);
    } else {
      state.vfSubmitYear = state.vfSubmitMonth = state.vfSubmitDay = '';
    }

    var cp = parseDateParts(match.cashReceivedDate);
    if (cp) {
      state.cashRcvYear  = String(cp.year);
      state.cashRcvMonth = String(cp.month);
      state.cashRcvDay   = String(cp.day);
    } else {
      state.cashRcvYear = state.cashRcvMonth = state.cashRcvDay = '';
    }

    return true;
  }

  /* When an exact Contractor invoice number is selected, auto-fill its submission date,
     plus the linked VF Invoice # and its submission + cash received dates. */
  function autoFillCtrDates(invoiceNo) {
    var trimmed = String(invoiceNo || '').trim();
    if (!trimmed) return false;
    var match = null;
    for (var i = 0; i < _data.length; i++) {
      if (String(_data[i].ctrInvoiceNo || '').trim() === trimmed) { match = _data[i]; break; }
    }
    if (!match) return false;

    /* Contractor invoice submission date */
    var sp = parseDateParts(match.ctrInvoiceSubmitDate);
    if (sp) {
      state.ctrSubmitYear  = String(sp.year);
      state.ctrSubmitMonth = String(sp.month);
      state.ctrSubmitDay   = String(sp.day);
    } else {
      state.ctrSubmitYear = state.ctrSubmitMonth = state.ctrSubmitDay = '';
    }

    /* Linked VF Invoice # */
    state.vfInvoiceNo = String(match.vfInvoiceNo || '').trim();

    /* VF Invoice submission date */
    var vsp = parseDateParts(match.vfInvoiceSubmissionDate);
    if (vsp) {
      state.vfSubmitYear  = String(vsp.year);
      state.vfSubmitMonth = String(vsp.month);
      state.vfSubmitDay   = String(vsp.day);
    } else {
      state.vfSubmitYear = state.vfSubmitMonth = state.vfSubmitDay = '';
    }

    /* Cash received date */
    var cp = parseDateParts(match.cashReceivedDate);
    if (cp) {
      state.cashRcvYear  = String(cp.year);
      state.cashRcvMonth = String(cp.month);
      state.cashRcvDay   = String(cp.day);
    } else {
      state.cashRcvYear = state.cashRcvMonth = state.cashRcvDay = '';
    }

    return true;
  }

  /* Unique sorted TSR Sub# values */
  function getTsrSubNos(data) {
    var seen = {};
    data.forEach(function (r) {
      var v = String(r.tsrSubNo || '').trim();
      if (v) seen[v] = 1;
    });
    return Object.keys(seen).sort();
  }

  /* Unique Contractor Invoice numbers, numeric-aware sort (2 before 10) */
  function getCtrInvoiceNumbers(data) {
    var seen = {};
    data.forEach(function (r) {
      var v = String(r.ctrInvoiceNo || '').trim();
      if (v) seen[v] = 1;
    });
    return Object.keys(seen).sort(function (a, b) {
      return a.localeCompare(b, undefined, { numeric: true });
    });
  }

  /* Unique sorted contractor names for the Contractor dropdown */
  function getContractors(data) {
    var seen = {};
    data.forEach(function (r) { var v = String(r.contractor || '').trim(); if (v) seen[v] = 1; });
    return Object.keys(seen).sort(function (a, b) { return a.localeCompare(b); });
  }

  /* Contractor invoices offered in the multi-select: narrowed to the chosen
     contractor, and to the VF invoice only when the user typed it — an
     auto-filled VF # would hide the other picks. */
  function ctrInvoiceSource() {
    var vf  = _ctrAutoFilled ? '' : state.vfInvoiceNo.trim();
    var ctr = state.contractor;
    if (!vf && !ctr) return _data;
    return _data.filter(function (r) {
      if (vf  && String(r.vfInvoiceNo || '').trim() !== vf)  return false;
      if (ctr && String(r.contractor  || '').trim() !== ctr) return false;
      return true;
    });
  }

  function ctrButtonText() {
    var sel = state.ctrInvoiceNos;
    if (!sel.length)      return 'All contractor invoices';
    if (sel.length <= 3)  return sel.join(', ');
    return sel.length + ' invoices selected';
  }

  function buildCtrListHTML(search) {
    var q      = String(search || '').trim().toLowerCase();
    var chosen = {};
    state.ctrInvoiceNos.forEach(function (v) { chosen[v] = 1; });
    var opts = getCtrInvoiceNumbers(ctrInvoiceSource());
    /* keep picked values visible even if the source list no longer has them */
    state.ctrInvoiceNos.forEach(function (v) { if (opts.indexOf(v) === -1) opts.push(v); });
    var html = opts.filter(function (v) {
      return !q || v.toLowerCase().indexOf(q) !== -1;
    }).map(function (v) {
      var on = chosen[v] ? ' checked' : '';
      return '<label class="multi-select-option' + on + '">' +
        '<input type="checkbox" value="' + escHtml(v) + '"' + on + '>' +
        '<span>' + escHtml(v) + '</span>' +
      '</label>';
    }).join('');
    return html || '<p class="multi-select-empty">No matching invoices</p>';
  }

  /* Rebuild the checkbox list + button text in place (keeps search text and scroll) */
  function refreshCtrMultiSelect() {
    var list   = document.getElementById('fin-ctr-ms-list');
    var search = document.getElementById('fin-ctr-ms-search');
    if (list) {
      var top = list.scrollTop;
      list.innerHTML = buildCtrListHTML(search ? search.value : '');
      list.scrollTop = top;
    }
    var btn   = document.getElementById('fin-ctr-ms-btn');
    var label = document.getElementById('fin-ctr-ms-label');
    if (label) label.textContent = ctrButtonText();
    if (btn)   btn.classList.toggle('empty', !state.ctrInvoiceNos.length);
  }

  var MONTHS = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  /* ── Filter logic (exact match on invoice numbers) ── */
  function applyFilters() {
    var ctrSet = null;
    if (state.ctrInvoiceNos.length) {
      ctrSet = {};
      state.ctrInvoiceNos.forEach(function (v) { ctrSet[v] = 1; });
    }
    return _data.filter(function (r) {
      if (state.vfInvoiceNo  && String(r.vfInvoiceNo  || '').trim() !== state.vfInvoiceNo.trim())  return false;
      if (!dateMatchesFilter(r.vfInvoiceSubmissionDate, state.vfSubmitYear,  state.vfSubmitMonth,  state.vfSubmitDay))  return false;
      if (!dateMatchesFilter(r.cashReceivedDate,        state.cashRcvYear,   state.cashRcvMonth,   state.cashRcvDay))   return false;
      if (state.contractor && String(r.contractor || '').trim() !== state.contractor) return false;
      if (ctrSet && !ctrSet[String(r.ctrInvoiceNo || '').trim()]) return false;
      if (!dateMatchesFilter(r.ctrInvoiceSubmitDate,    state.ctrSubmitYear, state.ctrSubmitMonth, state.ctrSubmitDay)) return false;
      if (state.tsrSubNo && !String(r.tsrSubNo || '').trim().toLowerCase().startsWith(state.tsrSubNo.trim().toLowerCase())) return false;
      return true;
    });
  }

  /* ═══════════════════════════════════════
     Partial render — KPI cards + table only
     Called on every filter change so the
     filter inputs are never destroyed.
  ═══════════════════════════════════════ */
  function renderResults() {
    var container = document.getElementById('fin-results');
    if (!container) return;

    var filtered = applyFilters();

    /* Update record count in-place */
    var countEl = document.getElementById('fin-record-count');
    if (countEl) countEl.textContent = 'Showing ' + filtered.length.toLocaleString() + ' of ' + _data.length.toLocaleString() + ' records';

    /* KPI totals — apply tax rules per row.
       Old/New splits are summed from `filtered` (In-House included) so each
       subtitle reconciles with the headline directly above it. The contractor
       table below uses its own In-House-free totals for the tfoot. */
    var totalAmount = 0, totalLMP = 0, totalC2 = 0;
    var kpiAmtOld = 0, kpiAmtNew = 0, kpiLmpOld = 0, kpiLmpNew = 0, kpiC2Old = 0, kpiC2New = 0;
    filtered.forEach(function (r) {
      var t = calcTax(r);
      totalAmount += t.totalTaxed;
      totalLMP    += t.lmpTaxed;
      totalC2     += t.contractorTaxed;
      if (isNewTask(r)) {
        kpiAmtNew += t.totalTaxed; kpiLmpNew += t.lmpTaxed; kpiC2New += t.contractorTaxed;
      } else {
        kpiAmtOld += t.totalTaxed; kpiLmpOld += t.lmpTaxed; kpiC2Old += t.contractorTaxed;
      }
    });

    /* Group by contractor — track Old/New splits + invoice numbers per period */
    var cmap = {};
    filtered.forEach(function (r) {
      var key = r.contractor || '(Unknown)';
      if (!cmap[key]) cmap[key] = {
        name: key,
        amount: 0, lmp: 0, c2: 0,
        amountOld: 0, lmpOld: 0, c2Old: 0,
        amountNew: 0, lmpNew: 0, c2New: 0,
        invOld: {}, invNew: {}
      };
      var t   = calcTax(r);
      var neo = isNewTask(r);
      var inv = String(r.ctrInvoiceNo || '').trim();
      cmap[key].amount += t.totalTaxed;
      cmap[key].lmp    += t.lmpTaxed;
      cmap[key].c2     += t.contractorTaxed;
      if (neo) {
        cmap[key].amountNew += t.totalTaxed;
        cmap[key].lmpNew    += t.lmpTaxed;
        cmap[key].c2New     += t.contractorTaxed;
        if (inv) cmap[key].invNew[inv] = 1;
      } else {
        cmap[key].amountOld += t.totalTaxed;
        cmap[key].lmpOld    += t.lmpTaxed;
        cmap[key].c2Old     += t.contractorTaxed;
        if (inv) cmap[key].invOld[inv] = 1;
      }
    });

    var rows = Object.keys(cmap)
      .map(function (k) { return cmap[k]; })
      .filter(function (r) { return r.name.trim().toLowerCase() !== 'in-house'; })
      .sort(function (a, b) { return b.amount - a.amount; });

    /* Grand old/new totals for tfoot — In-House excluded, matching the rows above */
    var totC2Old = 0, totC2New = 0;
    rows.forEach(function (r) {
      totC2Old += r.c2Old;
      totC2New += r.c2New;
    });

    /* Also refresh the contractor invoice list to match current VF invoice filter */
    refreshCtrMultiSelect();

    container.innerHTML =
      /* 3 KPI cards — value shows total, subtitle shows Old / New breakdown */
      '<div class="kpi-grid kpi-grid-3">' +
        kpiCard('Total Amount <span class="kpi-tax-note">+14% tax</span>',
                fmt(totalAmount) + ' EGP',
                'green',
                'Old: ' + fmt(kpiAmtOld) + ' &nbsp;|&nbsp; New: ' + fmt(kpiAmtNew)) +
        kpiCard('LMP Portion <span class="kpi-tax-note">total − contractor</span>',
                fmt(totalLMP) + ' EGP',
                'blue',
                'Old: ' + fmt(kpiLmpOld) + ' &nbsp;|&nbsp; New: ' + fmt(kpiLmpNew)) +
        kpiCard('Contractor Portion <span class="kpi-tax-note">+10% / 13% tax</span>',
                fmt(totalC2) + ' EGP',
                'red',
                'Old: ' + fmt(kpiC2Old) + ' &nbsp;|&nbsp; New: ' + fmt(kpiC2New)) +
      '</div>' +

      /* Contractor table — 3-level header, Contractor Portion only */
      '<div class="table-container table-bordered">' +
        '<table class="data-table fin-table-responsive">' +
          '<thead>' +
            '<tr>' +
              '<th rowspan="3">Contractor</th>' +
              '<th rowspan="3" class="col-center">Tax</th>' +
              '<th colspan="4" class="col-center">Contractor Portion taxed (EGP)</th>' +
            '</tr>' +
            '<tr>' +
              '<th colspan="2" class="col-center fin-sub-head fin-sub-old">Old</th>' +
              '<th colspan="2" class="col-center fin-sub-head fin-sub-new">New</th>' +
            '</tr>' +
            '<tr>' +
              '<th class="col-center fin-sub-head fin-sub-old fin-sub-inv">Invoice #</th>' +
              '<th class="col-num fin-sub-head fin-sub-old">Amount</th>' +
              '<th class="col-center fin-sub-head fin-sub-new fin-sub-inv">Invoice #</th>' +
              '<th class="col-num fin-sub-head fin-sub-new">Amount</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody>' +
            rows.map(function (r) {
              var taxBadge  = contractorTaxLabel(r.name);
              var isInHouse = String(r.name).trim().toLowerCase() === 'in-house';
              var invOldStr = Object.keys(r.invOld).sort().join(', ') || '—';
              var invNewStr = Object.keys(r.invNew).sort().join(', ') || '—';
              var dash      = '<span class="text-muted">—</span>';
              return '<tr>' +
                '<td data-label="Contractor">' + escHtml(r.name) + '</td>' +
                '<td class="col-center" data-label="Tax"><span class="badge badge-muted">' + taxBadge + '</span></td>' +
                '<td class="col-center fin-inv-no fin-col-old" data-label="Old Inv#">'             + (isInHouse ? dash : escHtml(invOldStr)) + '</td>' +
                '<td class="currency fin-col-old" data-label="Old Amount">'                        + (isInHouse ? dash : fmt(r.c2Old))       + '</td>' +
                '<td class="col-center fin-inv-no fin-col-new" data-label="New Inv#">' + (isInHouse ? dash : escHtml(invNewStr)) + '</td>' +
                '<td class="currency fin-col-new" data-label="New Amount">'            + (isInHouse ? dash : fmt(r.c2New))       + '</td>' +
              '</tr>';
            }).join('') +
          '</tbody>' +
          '<tfoot>' +
            '<tr class="table-total-row">' +
              '<td><strong>Total</strong></td>' +
              '<td></td>' +
              '<td></td>' +
              '<td class="currency fin-col-old"><strong>' + fmt(totC2Old) + '</strong></td>' +
              '<td></td>' +
              '<td class="currency fin-col-new"><strong>' + fmt(totC2New) + '</strong></td>' +
            '</tr>' +
          '</tfoot>' +
        '</table>' +
      '</div>';
  }

  /* ═══════════════════════════════════════
     Full render — called on section switch
     or data reload. Builds filter card once,
     then calls renderResults().
  ═══════════════════════════════════════ */
  function render() {
    var el = document.getElementById('financials-content');
    if (!el) return;
    _data = window.AppData || [];

    if (!_data.length) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">💰</div>' +
        '<p>No TX-RF data yet &mdash; tap <strong>Sync</strong> to load</p></div>';
      return;
    }

    el.innerHTML =
      '<div class="section-header"><h2>💰 TX-RF Invoice</h2></div>' +

      /* Filter card — built once, never rebuilt on filter changes */
      '<div class="card fin-filter-card">' +
        buildFilterHTML() +
      '</div>' +

      /* Excel export card */
      '<div id="fin-export-card" style="margin-bottom:1.25rem"></div>' +

      /* Results container — updated by renderResults() */
      '<div id="fin-results"></div>';

    renderResults();
    bindFilterEvents();
    renderExportCard();
  }

  /* ── Excel Export Card ── */
  function buildExportCardHTML() {
    var invoiceNums = getInvoiceNumbers(_data);
    var allSet = {};
    invoiceNums.forEach(function (v) { allSet[v] = 1; });

    var typed = _exportInput.split(/\s+/).map(function (s) { return s.trim(); }).filter(Boolean);
    var typedSet = {};
    typed.forEach(function (v) { typedSet[v] = 1; });
    var validCount = typed.filter(function (v) { return allSet[v]; }).length;

    var btnLabel  = validCount ? '&#8659; Download Excel (' + validCount + ')' : '&#8659; Download Excel';
    var invalid   = typed.length - validCount;
    var statusHtml = '';
    if (typed.length > 0) {
      statusHtml = '<p id="fin-export-status" class="invoice-export-status">' +
        validCount + ' invoice' + (validCount !== 1 ? 's' : '') + ' selected' +
        (invalid > 0 ? ' &nbsp;&bull;&nbsp; <span style="color:var(--danger)">' + invalid + ' not found</span>' : '') +
        '</p>';
    } else {
      statusHtml = '<p id="fin-export-status" class="invoice-export-status" style="display:none"></p>';
    }

    return (
      '<div class="invoice-export-card">' +
        '<div class="invoice-export-header">' +
          '<span class="invoice-export-title">Export to Excel</span>' +
          '<div class="invoice-export-actions">' +
            '<button id="fin-export-clear-btn" class="btn btn-outline btn-sm">Clear</button>' +
            '<button id="fin-export-dl-btn" class="btn btn-primary btn-sm"' + (!validCount ? ' disabled' : '') + '>' + btnLabel + '</button>' +
          '</div>' +
        '</div>' +
        '<input type="text" id="fin-export-input" class="search-input invoice-export-input"' +
          ' placeholder="Type VF invoice numbers separated by spaces…"' +
          ' value="' + escHtml(_exportInput) + '">' +
        statusHtml +
      '</div>'
    );
  }

  function renderExportCard() {
    var el = document.getElementById('fin-export-card');
    if (!el) return;
    el.innerHTML = buildExportCardHTML();
    bindExportEvents();
  }

  /* Update chips, status, and button without touching the input element */
  function updateExportUI() {
    var inputEl = document.getElementById('fin-export-input');
    if (inputEl) _exportInput = inputEl.value;

    var invoiceNums = getInvoiceNumbers(_data);
    var allSet = {};
    invoiceNums.forEach(function (v) { allSet[v] = 1; });

    var typed = _exportInput.split(/\s+/).map(function (s) { return s.trim(); }).filter(Boolean);
    var typedSet = {};
    typed.forEach(function (v) { typedSet[v] = 1; });
    var validCount = typed.filter(function (v) { return allSet[v]; }).length;
    var invalid    = typed.length - validCount;

    var statusEl = document.getElementById('fin-export-status');
    if (statusEl) {
      if (typed.length === 0) {
        statusEl.innerHTML = '';
        statusEl.style.display = 'none';
      } else {
        statusEl.innerHTML = validCount + ' invoice' + (validCount !== 1 ? 's' : '') + ' selected' +
          (invalid > 0 ? ' &nbsp;&bull;&nbsp; <span style="color:var(--danger)">' + invalid + ' not found</span>' : '');
        statusEl.style.display = '';
      }
    }

    var btn = document.getElementById('fin-export-dl-btn');
    if (btn) {
      btn.disabled = !validCount;
      btn.innerHTML = validCount ? '&#8659; Download Excel (' + validCount + ')' : '&#8659; Download Excel';
    }
  }

  function bindExportEvents() {
    /* Text input */
    var inputEl = document.getElementById('fin-export-input');
    if (inputEl) inputEl.addEventListener('input', updateExportUI);

    /* Clear */
    var clearBtn = document.getElementById('fin-export-clear-btn');
    if (clearBtn) clearBtn.addEventListener('click', function () {
      var inp = document.getElementById('fin-export-input');
      if (inp) inp.value = '';
      _exportInput = '';
      updateExportUI();
    });

    /* Download */
    var dlBtn = document.getElementById('fin-export-dl-btn');
    if (dlBtn) dlBtn.addEventListener('click', function () {
      var invoiceNums = getInvoiceNumbers(_data);
      var allSet = {};
      invoiceNums.forEach(function (v) { allSet[v] = 1; });
      var typed   = _exportInput.split(/\s+/).map(function (s) { return s.trim(); }).filter(Boolean);
      var seen    = {};
      var valid   = typed.filter(function (v) { return allSet[v] && !seen[v] && (seen[v] = 1); });
      if (!valid.length) return;
      window.ExcelExport.generate(valid, _data, {
        filename: 'TX-RF-Invoices.xlsx',
        isNew: function (r) { var p = parseDateParts(r.taskDate); return !!(p && p.year === 2026); },
        calcTax: calcTax,
        contractorTaxLabel: contractorTaxLabel,
        dateLabel: '1st Receiving'
      });
    });
  }

  /* Build TSR Sub# datalist options filtered to values starting with typed text */
  function buildTsrDatalistOpts(typed) {
    var lower = (typed || '').trim().toLowerCase();
    return getTsrSubNos(_data).filter(function (v) {
      return !lower || v.toLowerCase().startsWith(lower);
    }).map(function (v) {
      return '<option value="' + escHtml(v) + '">';
    }).join('');
  }

  /* Build the filter card HTML from current state */
  function buildFilterHTML() {
    var vsYears  = getYears(_data, 'vfInvoiceSubmissionDate');
    var vsMonths = getMonths(_data, 'vfInvoiceSubmissionDate', state.vfSubmitYear);
    var vsDays   = getDays(_data,   'vfInvoiceSubmissionDate', state.vfSubmitYear, state.vfSubmitMonth);

    var crYears  = getYears(_data, 'cashReceivedDate');
    var crMonths = getMonths(_data, 'cashReceivedDate', state.cashRcvYear);
    var crDays   = getDays(_data,   'cashReceivedDate', state.cashRcvYear, state.cashRcvMonth);

    var csYears  = getYears(_data, 'ctrInvoiceSubmitDate');
    var csMonths = getMonths(_data, 'ctrInvoiceSubmitDate', state.ctrSubmitYear);
    var csDays   = getDays(_data,   'ctrInvoiceSubmitDate', state.ctrSubmitYear, state.ctrSubmitMonth);

    var invoiceNums    = getInvoiceNumbers(_data);
    var datalistOpts   = invoiceNums.map(function (v) {
      return '<option value="' + escHtml(v) + '">';
    }).join('');


    return (
      /* Mobile toggle header */
      '<button id="fin-filter-toggle" class="dash-filter-toggle">' +
        '<span class="dash-filter-toggle-label">Filters' +
          '<span id="fin-filter-badge" class="dash-filter-count" style="display:none"></span>' +
        '</span>' +
        '<span class="dash-filter-chevron" id="fin-filter-chevron">&#9660;</span>' +
      '</button>' +

      /* Filter body — hidden on mobile until toggled */
      '<div id="fin-filters-body" class="dash-filters-body">' +
        '<div class="fin-filters">' +

          /* VF Invoice # — combo: type or select */
          '<div class="fin-filter-group">' +
            '<label class="field-label">VF Invoice #</label>' +
            '<datalist id="fin-invoice-datalist">' + datalistOpts + '</datalist>' +
            '<input type="text" id="fin-vf-invoice" class="search-input" list="fin-invoice-datalist" placeholder="Search or select invoice #…" value="' + escHtml(state.vfInvoiceNo) + '">' +
          '</div>' +

          /* 1st Receiving Date (stored as vfInvoiceSubmissionDate) */
          '<div class="fin-filter-group">' +
            '<label class="field-label">1st Receiving Date</label>' +
            '<div class="date-group">' +
              buildYearOpts('fin-vs-year',  vsYears,  state.vfSubmitYear)  +
              buildMonthOpts('fin-vs-month', vsMonths, state.vfSubmitYear,  state.vfSubmitMonth) +
              buildDayOpts('fin-vs-day',   vsDays,   state.vfSubmitYear,  state.vfSubmitMonth, state.vfSubmitDay) +
            '</div>' +
          '</div>' +

          /* Cash Received Date */
          '<div class="fin-filter-group">' +
            '<label class="field-label">Cash Received Date</label>' +
            '<div class="date-group">' +
              buildYearOpts('fin-cr-year',  crYears,  state.cashRcvYear)   +
              buildMonthOpts('fin-cr-month', crMonths, state.cashRcvYear,   state.cashRcvMonth) +
              buildDayOpts('fin-cr-day',   crDays,   state.cashRcvYear,   state.cashRcvMonth, state.cashRcvDay) +
            '</div>' +
          '</div>' +

          /* Contractor — narrows the invoice checklist below to their invoices */
          '<div class="fin-filter-group">' +
            '<label class="field-label">Contractor</label>' +
            '<select id="fin-contractor" class="filter-select" style="width:100%">' +
              '<option value="">All Contractors</option>' +
              getContractors(_data).map(function (c) {
                return '<option value="' + escHtml(c) + '"' + (state.contractor === c ? ' selected' : '') + '>' + escHtml(c) + '</option>';
              }).join('') +
            '</select>' +
          '</div>' +

          /* Contractor Invoice # — multi-select checklist */
          '<div class="fin-filter-group">' +
            '<label class="field-label">Contractor Invoice #</label>' +
            '<div class="multi-select" id="fin-ctr-ms">' +
              '<button type="button" id="fin-ctr-ms-btn" class="search-input multi-select-btn' + (state.ctrInvoiceNos.length ? '' : ' empty') + '">' +
                '<span id="fin-ctr-ms-label">' + escHtml(ctrButtonText()) + '</span>' +
                '<span class="multi-select-caret">&#9662;</span>' +
              '</button>' +
              '<div class="multi-select-panel" id="fin-ctr-ms-panel" hidden>' +
                '<input type="text" id="fin-ctr-ms-search" class="search-input" placeholder="Search invoice #…">' +
                '<div class="multi-select-actions">' +
                  '<button type="button" id="fin-ctr-ms-all">Select shown</button>' +
                  '<button type="button" id="fin-ctr-ms-none">Clear</button>' +
                '</div>' +
                '<div class="multi-select-list" id="fin-ctr-ms-list">' + buildCtrListHTML('') + '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +

          /* Contractor Invoice Subm Date */
          '<div class="fin-filter-group">' +
            '<label class="field-label">Contractor Invoice Subm Date</label>' +
            '<div class="date-group">' +
              buildYearOpts('fin-cs-year',  csYears,  state.ctrSubmitYear)  +
              buildMonthOpts('fin-cs-month', csMonths, state.ctrSubmitYear,  state.ctrSubmitMonth) +
              buildDayOpts('fin-cs-day',   csDays,   state.ctrSubmitYear,  state.ctrSubmitMonth, state.ctrSubmitDay) +
            '</div>' +
          '</div>' +

          /* TSR Sub # */
          '<div class="fin-filter-group">' +
            '<label class="field-label">TSR Sub #</label>' +
            '<datalist id="fin-tsr-datalist">' + buildTsrDatalistOpts(state.tsrSubNo) + '</datalist>' +
            '<input type="text" id="fin-tsr-input" class="search-input" list="fin-tsr-datalist" placeholder="Type to search TSR sub #…" value="' + escHtml(state.tsrSubNo) + '">' +
          '</div>' +

          /* Clear */
          '<div class="fin-filter-group" style="display:flex;align-items:flex-end">' +
            '<button id="fin-clear-btn" class="btn btn-outline" style="width:100%">Clear</button>' +
          '</div>' +

        '</div>' +
        '<p id="fin-record-count" class="results-count" style="margin-top:.75rem"></p>' +
      '</div>'
    );
  }

  /* ── Select builders ── */
  function buildYearOpts(id, years, selected) {
    var opts = '<option value="">Year</option>';
    years.forEach(function (y) {
      opts += '<option value="' + y + '"' + (selected == y ? ' selected' : '') + '>' + y + '</option>';
    });
    return '<select id="' + id + '" class="date-select">' + opts + '</select>';
  }

  function buildMonthOpts(id, months, year, selected) {
    var disabled = year ? '' : ' disabled';
    var opts = '<option value="">Month</option>';
    months.forEach(function (m) {
      opts += '<option value="' + m + '"' + (selected == m ? ' selected' : '') + '>' + MONTHS[m] + '</option>';
    });
    return '<select id="' + id + '" class="date-select"' + disabled + '>' + opts + '</select>';
  }

  function buildDayOpts(id, days, year, month, selected) {
    var disabled = (year && month) ? '' : ' disabled';
    var opts = '<option value="">Day</option>';
    days.forEach(function (d) {
      opts += '<option value="' + d + '"' + (selected == d ? ' selected' : '') + '>' + (d < 10 ? '0' : '') + d + '</option>';
    });
    return '<select id="' + id + '" class="date-select"' + disabled + '>' + opts + '</select>';
  }

  /* ── Inline select updaters (no full render) ── */
  function refreshMonthSelect(id, field, year) {
    var sel = document.getElementById(id);
    if (!sel) return;
    var months = getMonths(_data, field, year);
    var html   = '<option value="">Month</option>';
    months.forEach(function (m) {
      html += '<option value="' + m + '">' + MONTHS[m] + '</option>';
    });
    sel.innerHTML = html;
    sel.disabled  = !year;
  }

  function refreshDaySelect(id, field, year, month) {
    var sel = document.getElementById(id);
    if (!sel) return;
    var days = getDays(_data, field, year, month);
    var html = '<option value="">Day</option>';
    days.forEach(function (d) {
      html += '<option value="' + d + '">' + (d < 10 ? '0' : '') + d + '</option>';
    });
    sel.innerHTML = html;
    sel.disabled  = !(year && month);
  }

  /* Update date select elements in-place from current state — avoids
     calling render() which would rebuild the filter bar and lose focus. */
  function syncDateSelects() {
    var el;
    el = document.getElementById('fin-vs-year');  if (el) el.value = state.vfSubmitYear;
    refreshMonthSelect('fin-vs-month', 'vfInvoiceSubmissionDate', state.vfSubmitYear);
    el = document.getElementById('fin-vs-month'); if (el) el.value = state.vfSubmitMonth;
    refreshDaySelect('fin-vs-day', 'vfInvoiceSubmissionDate', state.vfSubmitYear, state.vfSubmitMonth);
    el = document.getElementById('fin-vs-day');   if (el) el.value = state.vfSubmitDay;

    el = document.getElementById('fin-cr-year');  if (el) el.value = state.cashRcvYear;
    refreshMonthSelect('fin-cr-month', 'cashReceivedDate', state.cashRcvYear);
    el = document.getElementById('fin-cr-month'); if (el) el.value = state.cashRcvMonth;
    refreshDaySelect('fin-cr-day', 'cashReceivedDate', state.cashRcvYear, state.cashRcvMonth);
    el = document.getElementById('fin-cr-day');   if (el) el.value = state.cashRcvDay;

    el = document.getElementById('fin-cs-year');  if (el) el.value = state.ctrSubmitYear;
    refreshMonthSelect('fin-cs-month', 'ctrInvoiceSubmitDate', state.ctrSubmitYear);
    el = document.getElementById('fin-cs-month'); if (el) el.value = state.ctrSubmitMonth;
    refreshDaySelect('fin-cs-day', 'ctrInvoiceSubmitDate', state.ctrSubmitYear, state.ctrSubmitMonth);
    el = document.getElementById('fin-cs-day');   if (el) el.value = state.ctrSubmitDay;
  }

  /* ── Active filter count badge ── */
  function updateFilterBadge() {
    var badge = document.getElementById('fin-filter-badge');
    if (!badge) return;
    var count = 0;
    if (state.vfInvoiceNo)                                                count++;
    if (state.vfSubmitYear  || state.vfSubmitMonth  || state.vfSubmitDay) count++;
    if (state.cashRcvYear   || state.cashRcvMonth   || state.cashRcvDay)  count++;
    if (state.contractor)                                                 count++;
    if (state.ctrInvoiceNos.length)                                       count++;
    if (state.ctrSubmitYear || state.ctrSubmitMonth || state.ctrSubmitDay) count++;
    if (state.tsrSubNo)                                                    count++;
    if (count) {
      badge.textContent   = count;
      badge.style.display = 'inline-flex';
    } else {
      badge.style.display = 'none';
    }
  }

  /* ── Bind events — text input only calls renderResults(), never render() ── */
  function bindFilterEvents() {

    /* Mobile toggle */
    var toggleBtn = document.getElementById('fin-filter-toggle');
    if (toggleBtn) toggleBtn.addEventListener('click', function () {
      var body    = document.getElementById('fin-filters-body');
      var chevron = document.getElementById('fin-filter-chevron');
      if (!body) return;
      var open = body.classList.toggle('open');
      if (chevron) chevron.classList.toggle('open', open);
    });

    /* VF Invoice # — if value exactly matches a known invoice, auto-fill its
       dates and do a full render (to update the date selects); otherwise just
       filter in-place so typing doesn't lose focus. */
    var inv = document.getElementById('fin-vf-invoice');
    if (inv) inv.addEventListener('input', function (e) {
      state.vfInvoiceNo = e.target.value;
      _ctrAutoFilled = false; // the VF # is now the user's own
      if (autoFillDates(state.vfInvoiceNo)) syncDateSelects();
      updateFilterBadge();
      renderResults();
    });

    /* VF Invoice Submission Date */
    var vsYear  = document.getElementById('fin-vs-year');
    var vsMonth = document.getElementById('fin-vs-month');
    var vsDay   = document.getElementById('fin-vs-day');

    if (vsYear) vsYear.addEventListener('change', function (e) {
      state.vfSubmitYear  = e.target.value;
      state.vfSubmitMonth = '';
      state.vfSubmitDay   = '';
      refreshMonthSelect('fin-vs-month', 'vfInvoiceSubmissionDate', state.vfSubmitYear);
      refreshDaySelect('fin-vs-day',   'vfInvoiceSubmissionDate', state.vfSubmitYear, '');
      updateFilterBadge(); renderResults();
    });
    if (vsMonth) vsMonth.addEventListener('change', function (e) {
      state.vfSubmitMonth = e.target.value;
      state.vfSubmitDay   = '';
      refreshDaySelect('fin-vs-day', 'vfInvoiceSubmissionDate', state.vfSubmitYear, state.vfSubmitMonth);
      updateFilterBadge(); renderResults();
    });
    if (vsDay) vsDay.addEventListener('change', function (e) {
      state.vfSubmitDay = e.target.value;
      updateFilterBadge(); renderResults();
    });

    /* Cash Received Date */
    var crYear  = document.getElementById('fin-cr-year');
    var crMonth = document.getElementById('fin-cr-month');
    var crDay   = document.getElementById('fin-cr-day');

    if (crYear) crYear.addEventListener('change', function (e) {
      state.cashRcvYear  = e.target.value;
      state.cashRcvMonth = '';
      state.cashRcvDay   = '';
      refreshMonthSelect('fin-cr-month', 'cashReceivedDate', state.cashRcvYear);
      refreshDaySelect('fin-cr-day',   'cashReceivedDate', state.cashRcvYear, '');
      updateFilterBadge(); renderResults();
    });
    if (crMonth) crMonth.addEventListener('change', function (e) {
      state.cashRcvMonth = e.target.value;
      state.cashRcvDay   = '';
      refreshDaySelect('fin-cr-day', 'cashReceivedDate', state.cashRcvYear, state.cashRcvMonth);
      updateFilterBadge(); renderResults();
    });
    if (crDay) crDay.addEventListener('change', function (e) {
      state.cashRcvDay = e.target.value;
      updateFilterBadge(); renderResults();
    });

    /* Contractor Invoice # — multi-select.
       One pick auto-fills its VF # and dates (as before). Two or more picks
       clear those auto-filled values, since they belong to a single invoice
       and would hide every other pick. */
    function onCtrSelectionChange() {
      var sel = state.ctrInvoiceNos;
      var changed = false;
      if (sel.length === 1) {
        if (autoFillCtrDates(sel[0])) { _ctrAutoFilled = true; changed = true; }
      } else if (_ctrAutoFilled) {
        state.vfInvoiceNo   = '';
        state.vfSubmitYear  = ''; state.vfSubmitMonth  = ''; state.vfSubmitDay  = '';
        state.cashRcvYear   = ''; state.cashRcvMonth   = ''; state.cashRcvDay   = '';
        state.ctrSubmitYear = ''; state.ctrSubmitMonth = ''; state.ctrSubmitDay = '';
        _ctrAutoFilled = false;
        changed = true;
      }
      if (changed) {
        var vfEl = document.getElementById('fin-vf-invoice');
        if (vfEl) vfEl.value = state.vfInvoiceNo;
        syncDateSelects();
      }
      updateFilterBadge();
      renderResults();
    }

    /* Contractor — drop picked invoices that aren't theirs, then refresh */
    var ctrSel = document.getElementById('fin-contractor');
    if (ctrSel) ctrSel.addEventListener('change', function (e) {
      state.contractor = e.target.value;
      if (state.contractor) {
        var valid = {};
        getCtrInvoiceNumbers(ctrInvoiceSource()).forEach(function (v) { valid[v] = 1; });
        state.ctrInvoiceNos = state.ctrInvoiceNos.filter(function (v) { return valid[v]; });
      }
      onCtrSelectionChange();
    });

    var msBox    = document.getElementById('fin-ctr-ms');
    var msBtn    = document.getElementById('fin-ctr-ms-btn');
    var msPanel  = document.getElementById('fin-ctr-ms-panel');
    var msSearch = document.getElementById('fin-ctr-ms-search');
    var msList   = document.getElementById('fin-ctr-ms-list');

    if (msBtn && msPanel) msBtn.addEventListener('click', function () {
      msPanel.hidden = !msPanel.hidden;
      if (!msPanel.hidden && msSearch) msSearch.focus();
    });
    if (msBox && msPanel) msBox.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { msPanel.hidden = true; if (msBtn) msBtn.focus(); }
    });
    if (msSearch) msSearch.addEventListener('input', refreshCtrMultiSelect);

    if (msList) msList.addEventListener('change', function (e) {
      var cb = e.target;
      if (!cb || cb.type !== 'checkbox') return;
      var v = cb.value;
      state.ctrInvoiceNos = state.ctrInvoiceNos.filter(function (x) { return x !== v; });
      if (cb.checked) state.ctrInvoiceNos.push(v);
      onCtrSelectionChange();
    });

    var msAll = document.getElementById('fin-ctr-ms-all');
    if (msAll && msList) msAll.addEventListener('click', function () {
      msList.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
        if (state.ctrInvoiceNos.indexOf(cb.value) === -1) state.ctrInvoiceNos.push(cb.value);
      });
      onCtrSelectionChange();
    });
    var msNone = document.getElementById('fin-ctr-ms-none');
    if (msNone) msNone.addEventListener('click', function () {
      state.ctrInvoiceNos = [];
      onCtrSelectionChange();
    });

    /* Close the panel on any click outside it — bound once, looks the box up fresh */
    if (!_docClickBound) {
      _docClickBound = true;
      document.addEventListener('click', function (e) {
        var box   = document.getElementById('fin-ctr-ms');
        var panel = document.getElementById('fin-ctr-ms-panel');
        if (box && panel && !panel.hidden && !box.contains(e.target)) panel.hidden = true;
      });
    }

    /* Contractor Invoice Subm Date */
    var csYear  = document.getElementById('fin-cs-year');
    var csMonth = document.getElementById('fin-cs-month');
    var csDay   = document.getElementById('fin-cs-day');

    if (csYear) csYear.addEventListener('change', function (e) {
      state.ctrSubmitYear  = e.target.value;
      state.ctrSubmitMonth = '';
      state.ctrSubmitDay   = '';
      refreshMonthSelect('fin-cs-month', 'ctrInvoiceSubmitDate', state.ctrSubmitYear);
      refreshDaySelect('fin-cs-day',   'ctrInvoiceSubmitDate', state.ctrSubmitYear, '');
      updateFilterBadge(); renderResults();
    });
    if (csMonth) csMonth.addEventListener('change', function (e) {
      state.ctrSubmitMonth = e.target.value;
      state.ctrSubmitDay   = '';
      refreshDaySelect('fin-cs-day', 'ctrInvoiceSubmitDate', state.ctrSubmitYear, state.ctrSubmitMonth);
      updateFilterBadge(); renderResults();
    });
    if (csDay) csDay.addEventListener('change', function (e) {
      state.ctrSubmitDay = e.target.value;
      updateFilterBadge(); renderResults();
    });

    /* TSR Sub # — type-ahead with starts-with datalist */
    var tsrInp = document.getElementById('fin-tsr-input');
    var tsrDL  = document.getElementById('fin-tsr-datalist');
    if (tsrInp) tsrInp.addEventListener('input', function (e) {
      state.tsrSubNo = e.target.value;
      if (tsrDL) tsrDL.innerHTML = buildTsrDatalistOpts(state.tsrSubNo);
      updateFilterBadge();
      renderResults();
    });

    /* Clear */
    var clearBtn = document.getElementById('fin-clear-btn');
    if (clearBtn) clearBtn.addEventListener('click', function () {
      state.vfInvoiceNo   = '';
      state.vfSubmitYear  = ''; state.vfSubmitMonth  = ''; state.vfSubmitDay  = '';
      state.cashRcvYear   = ''; state.cashRcvMonth   = ''; state.cashRcvDay   = '';
      state.contractor    = '';
      state.ctrInvoiceNos = [];
      state.ctrSubmitYear = ''; state.ctrSubmitMonth = ''; state.ctrSubmitDay = '';
      state.tsrSubNo      = '';
      _ctrAutoFilled      = false;
      render();
    });
  }

  function kpiCard(label, value, cls, subtitle) {
    return '<div class="kpi-card ' + (cls || '') + '">' +
      '<div class="kpi-label">' + label + '</div>' +
      '<div class="kpi-value">' + value + '</div>' +
      (subtitle ? '<div class="kpi-subtitle">' + subtitle + '</div>' : '') +
      '</div>';
  }

  return { render: render };

})();
