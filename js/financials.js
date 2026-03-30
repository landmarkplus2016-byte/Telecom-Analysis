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
    cashRcvYear:   '', cashRcvMonth:   '', cashRcvDay:   ''
  };

  var _data = []; // module-level data cache

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
                        = contractor2 × 1.11    (all other non In-House)
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
      var cRate       = (c === 'upper telecom') ? 1.13 : 1.11;
      contractorTaxed = (r.contractor2 || 0) * cRate;
      lmpTaxed        = totalTaxed - contractorTaxed;
    }

    return { totalTaxed: totalTaxed, lmpTaxed: lmpTaxed, contractorTaxed: contractorTaxed };
  }

  /* Badge label: contractor tax rate shown in table */
  function contractorTaxLabel(contractor) {
    var c = String(contractor || '').trim().toLowerCase();
    if (c === 'in-house')      return '14% / —';
    if (c === 'upper telecom') return '14% / 13%';
    return '14% / 11%';
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

  /* When an exact invoice number is selected, auto-fill its dates into state.
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

  var MONTHS = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  /* ── Filter logic ── */
  function applyFilters() {
    return _data.filter(function (r) {
      if (state.vfInvoiceNo) {
        if ((r.vfInvoiceNo || '').toLowerCase().indexOf(state.vfInvoiceNo.toLowerCase()) === -1) return false;
      }
      if (!dateMatchesFilter(r.vfInvoiceSubmissionDate, state.vfSubmitYear, state.vfSubmitMonth, state.vfSubmitDay)) return false;
      if (!dateMatchesFilter(r.cashReceivedDate,        state.cashRcvYear,  state.cashRcvMonth,  state.cashRcvDay))  return false;
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

    /* KPI totals — apply tax rules per row */
    var totalAmount = 0, totalLMP = 0, totalC2 = 0;
    filtered.forEach(function (r) {
      var t = calcTax(r);
      totalAmount += t.totalTaxed;
      totalLMP    += t.lmpTaxed;
      totalC2     += t.contractorTaxed;
    });

    /* Group by contractor — track Old/New splits */
    var cmap = {};
    filtered.forEach(function (r) {
      var key = r.contractor || '(Unknown)';
      if (!cmap[key]) cmap[key] = {
        amount: 0, lmp: 0, c2: 0,
        amountOld: 0, lmpOld: 0, c2Old: 0,
        amountNew: 0, lmpNew: 0, c2New: 0
      };
      var t   = calcTax(r);
      var neo = isNewTask(r);
      cmap[key].amount += t.totalTaxed;
      cmap[key].lmp    += t.lmpTaxed;
      cmap[key].c2     += t.contractorTaxed;
      if (neo) {
        cmap[key].amountNew += t.totalTaxed;
        cmap[key].lmpNew    += t.lmpTaxed;
        cmap[key].c2New     += t.contractorTaxed;
      } else {
        cmap[key].amountOld += t.totalTaxed;
        cmap[key].lmpOld    += t.lmpTaxed;
        cmap[key].c2Old     += t.contractorTaxed;
      }
    });

    var rows = Object.keys(cmap)
      .map(function (k) { return Object.assign({ name: k }, cmap[k]); })
      .sort(function (a, b) { return b.amount - a.amount; });

    /* Grand old/new totals for tfoot */
    var totAmtOld = 0, totAmtNew = 0, totLmpOld = 0, totLmpNew = 0, totC2Old = 0, totC2New = 0;
    rows.forEach(function (r) {
      totAmtOld += r.amountOld; totAmtNew += r.amountNew;
      totLmpOld += r.lmpOld;   totLmpNew += r.lmpNew;
      totC2Old  += r.c2Old;    totC2New  += r.c2New;
    });

    container.innerHTML =
      /* 3 KPI cards */
      '<div class="kpi-grid kpi-grid-3">' +
        kpiCard('Total Amount <span class="kpi-tax-note">+14% tax</span>',             fmt(totalAmount) + ' EGP', 'green') +
        kpiCard('LMP Portion <span class="kpi-tax-note">total − contractor</span>',    fmt(totalLMP)    + ' EGP', 'blue')  +
        kpiCard('Contractor Portion <span class="kpi-tax-note">+11% / 13% tax</span>', fmt(totalC2)     + ' EGP', 'red')   +
      '</div>' +

      /* Contractor table — two-row header with Old/New splits */
      '<div class="table-container table-bordered">' +
        '<table class="data-table fin-table-responsive">' +
          '<thead>' +
            '<tr>' +
              '<th rowspan="2">Contractor</th>' +
              '<th rowspan="2" class="col-center">Tax (Total / Contractor)</th>' +
              '<th colspan="2" class="col-center">Total Amount taxed (EGP)</th>' +
              '<th colspan="2" class="col-center">LMP Portion taxed (EGP)</th>' +
              '<th colspan="2" class="col-center">Contractor Portion taxed (EGP)</th>' +
            '</tr>' +
            '<tr>' +
              '<th class="col-num fin-sub-head">Old</th>' +
              '<th class="col-num fin-sub-head fin-sub-new">New</th>' +
              '<th class="col-num fin-sub-head">Old</th>' +
              '<th class="col-num fin-sub-head fin-sub-new">New</th>' +
              '<th class="col-num fin-sub-head">Old</th>' +
              '<th class="col-num fin-sub-head fin-sub-new">New</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody>' +
            rows.map(function (r) {
              var taxBadge  = contractorTaxLabel(r.name);
              var isInHouse = String(r.name).trim().toLowerCase() === 'in-house';
              return '<tr>' +
                '<td data-label="Contractor">' + escHtml(r.name) + '</td>' +
                '<td class="col-center" data-label="Tax"><span class="badge badge-muted">' + taxBadge + '</span></td>' +
                '<td class="currency" data-label="Total Old">'        + fmt(r.amountOld) + '</td>' +
                '<td class="currency fin-col-new" data-label="Total New">'        + fmt(r.amountNew) + '</td>' +
                '<td class="currency" data-label="LMP Old">'          + fmt(r.lmpOld)    + '</td>' +
                '<td class="currency fin-col-new" data-label="LMP New">'          + fmt(r.lmpNew)    + '</td>' +
                '<td class="currency" data-label="Contractor Old">'   + (isInHouse ? '<span class="text-muted">—</span>' : fmt(r.c2Old))  + '</td>' +
                '<td class="currency fin-col-new" data-label="Contractor New">'   + (isInHouse ? '<span class="text-muted">—</span>' : fmt(r.c2New))  + '</td>' +
              '</tr>';
            }).join('') +
          '</tbody>' +
          '<tfoot>' +
            '<tr class="table-total-row">' +
              '<td><strong>Total</strong></td>' +
              '<td></td>' +
              '<td class="currency"><strong>' + fmt(totAmtOld) + '</strong></td>' +
              '<td class="currency fin-col-new"><strong>' + fmt(totAmtNew) + '</strong></td>' +
              '<td class="currency"><strong>' + fmt(totLmpOld) + '</strong></td>' +
              '<td class="currency fin-col-new"><strong>' + fmt(totLmpNew) + '</strong></td>' +
              '<td class="currency"><strong>' + fmt(totC2Old)  + '</strong></td>' +
              '<td class="currency fin-col-new"><strong>' + fmt(totC2New)  + '</strong></td>' +
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
        '<p>No data yet &mdash; tap <strong>Sync</strong> to load</p></div>';
      return;
    }

    el.innerHTML =
      '<div class="section-header"><h2>💰 Invoices</h2></div>' +

      /* Filter card — built once, never rebuilt on filter changes */
      '<div class="card fin-filter-card">' +
        buildFilterHTML() +
      '</div>' +

      /* Results container — updated by renderResults() */
      '<div id="fin-results"></div>';

    renderResults();
    bindFilterEvents();
  }

  /* Build the filter card HTML from current state */
  function buildFilterHTML() {
    var vsYears  = getYears(_data, 'vfInvoiceSubmissionDate');
    var vsMonths = getMonths(_data, 'vfInvoiceSubmissionDate', state.vfSubmitYear);
    var vsDays   = getDays(_data,   'vfInvoiceSubmissionDate', state.vfSubmitYear, state.vfSubmitMonth);

    var crYears  = getYears(_data, 'cashReceivedDate');
    var crMonths = getMonths(_data, 'cashReceivedDate', state.cashRcvYear);
    var crDays   = getDays(_data,   'cashReceivedDate', state.cashRcvYear, state.cashRcvMonth);

    var invoiceNums = getInvoiceNumbers(_data);
    var datalistOpts = invoiceNums.map(function (v) {
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

          /* VF Invoice Submission Date */
          '<div class="fin-filter-group">' +
            '<label class="field-label">VF Invoice Submission Date</label>' +
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

  /* ── Active filter count badge ── */
  function updateFilterBadge() {
    var badge = document.getElementById('fin-filter-badge');
    if (!badge) return;
    var count = 0;
    if (state.vfInvoiceNo)                                              count++;
    if (state.vfSubmitYear || state.vfSubmitMonth || state.vfSubmitDay) count++;
    if (state.cashRcvYear  || state.cashRcvMonth  || state.cashRcvDay)  count++;
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
      var exactMatch = autoFillDates(state.vfInvoiceNo);
      if (exactMatch) {
        render(); // full rebuild so year/month/day selects reflect auto-filled dates
      } else {
        updateFilterBadge(); renderResults();
      }
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

    /* Clear */
    var clearBtn = document.getElementById('fin-clear-btn');
    if (clearBtn) clearBtn.addEventListener('click', function () {
      state.vfInvoiceNo  = '';
      state.vfSubmitYear  = ''; state.vfSubmitMonth  = ''; state.vfSubmitDay  = '';
      state.cashRcvYear   = ''; state.cashRcvMonth   = ''; state.cashRcvDay   = '';
      render();
    });
  }

  function kpiCard(label, value, cls) {
    return '<div class="kpi-card ' + (cls || '') + '">' +
      '<div class="kpi-label">' + label + '</div>' +
      '<div class="kpi-value">' + value + '</div>' +
      '</div>';
  }

  return { render: render };

})();
