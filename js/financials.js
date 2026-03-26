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

    /* Group by contractor */
    var cmap = {};
    filtered.forEach(function (r) {
      var key = r.contractor || '(Unknown)';
      if (!cmap[key]) cmap[key] = { amount: 0, lmp: 0, c2: 0 };
      var t = calcTax(r);
      cmap[key].amount += t.totalTaxed;
      cmap[key].lmp    += t.lmpTaxed;
      cmap[key].c2     += t.contractorTaxed;
    });
    var rows = Object.keys(cmap)
      .map(function (k) { return { name: k, amount: cmap[k].amount, lmp: cmap[k].lmp, c2: cmap[k].c2 }; })
      .sort(function (a, b) { return b.amount - a.amount; });

    container.innerHTML =
      /* 3 KPI cards */
      '<div class="kpi-grid kpi-grid-3">' +
        kpiCard('Total Amount <span class="kpi-tax-note">+14% tax</span>',             fmt(totalAmount) + ' EGP', 'green') +
        kpiCard('LMP Portion <span class="kpi-tax-note">total − contractor</span>',    fmt(totalLMP)    + ' EGP', 'blue')  +
        kpiCard('Contractor Portion <span class="kpi-tax-note">+11% / 13% tax</span>', fmt(totalC2)     + ' EGP', 'red')   +
      '</div>' +

      /* Contractor table */
      '<div class="table-container table-bordered">' +
        '<table class="data-table fin-table-responsive">' +
          '<thead><tr>' +
            '<th>Contractor</th>' +
            '<th class="col-center">Tax (Total / Contractor)</th>' +
            '<th class="col-num">Total Amount taxed (EGP)</th>' +
            '<th class="col-num">LMP Portion taxed (EGP)</th>' +
            '<th class="col-num">Contractor Portion taxed (EGP)</th>' +
          '</tr></thead>' +
          '<tbody>' +
            rows.map(function (r) {
              var taxBadge  = contractorTaxLabel(r.name);
              var isInHouse = String(r.name).trim().toLowerCase() === 'in-house';
              return '<tr>' +
                '<td data-label="Contractor">' + escHtml(r.name) + '</td>' +
                '<td class="col-center" data-label="Tax"><span class="badge badge-muted">' + taxBadge + '</span></td>' +
                '<td class="currency" data-label="Total Amount">' + fmt(r.amount) + '</td>' +
                '<td class="currency" data-label="LMP Portion">' + fmt(r.lmp)    + '</td>' +
                '<td class="currency" data-label="Contractor Portion">' + (isInHouse ? '<span class="text-muted">—</span>' : fmt(r.c2)) + '</td>' +
              '</tr>';
            }).join('') +
          '</tbody>' +
          '<tfoot>' +
            '<tr class="table-total-row">' +
              '<td data-label=""><strong>Total</strong></td>' +
              '<td data-label=""></td>' +
              '<td class="currency" data-label="Total Amount"><strong>' + fmt(totalAmount) + '</strong></td>' +
              '<td class="currency" data-label="LMP Portion"><strong>' + fmt(totalLMP)    + '</strong></td>' +
              '<td class="currency" data-label="Contractor Portion"><strong>' + fmt(totalC2)     + '</strong></td>' +
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
      '<div class="section-header"><h2>Financials</h2></div>' +

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

    return '<div class="fin-filters">' +

      /* VF Invoice # */
      '<div class="fin-filter-group">' +
        '<label class="field-label">VF Invoice #</label>' +
        '<input type="text" id="fin-vf-invoice" class="search-input" placeholder="Search invoice #…" value="' + escHtml(state.vfInvoiceNo) + '">' +
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

    '</div>' +
    '<p id="fin-record-count" class="results-count" style="margin-top:.75rem"></p>';
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

  /* ── Bind events — text input only calls renderResults(), never render() ── */
  function bindFilterEvents() {

    /* VF Invoice # — partial render only → no focus loss */
    var inv = document.getElementById('fin-vf-invoice');
    if (inv) inv.addEventListener('input', function (e) {
      state.vfInvoiceNo = e.target.value;
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
      renderResults();
    });
    if (vsMonth) vsMonth.addEventListener('change', function (e) {
      state.vfSubmitMonth = e.target.value;
      state.vfSubmitDay   = '';
      refreshDaySelect('fin-vs-day', 'vfInvoiceSubmissionDate', state.vfSubmitYear, state.vfSubmitMonth);
      renderResults();
    });
    if (vsDay) vsDay.addEventListener('change', function (e) {
      state.vfSubmitDay = e.target.value;
      renderResults();
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
      renderResults();
    });
    if (crMonth) crMonth.addEventListener('change', function (e) {
      state.cashRcvMonth = e.target.value;
      state.cashRcvDay   = '';
      refreshDaySelect('fin-cr-day', 'cashReceivedDate', state.cashRcvYear, state.cashRcvMonth);
      renderResults();
    });
    if (crDay) crDay.addEventListener('change', function (e) {
      state.cashRcvDay = e.target.value;
      renderResults();
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
