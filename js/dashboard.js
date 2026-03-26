/* =========================================================
   dashboard.js — Telecom Analysis
   Renders filter bar + KPI cards + 3 charts on Dashboard.
   Exposes: window.Dashboard.render()
   ========================================================= */

window.Dashboard = (function () {

  /* ── Filter state ── */
  var state = {
    status:           '',
    taskYear:  '', taskMonth:  '', taskDay:  '',
    contractor:       '',
    acceptanceStatus: '',
    facYear:   '', facMonth:   '', facDay:   ''
  };

  var _data = [];

  /* ── Helpers ── */
  function fmt(n) {
    return 'EGP ' + Math.round(Number(n || 0)).toLocaleString('en-US');
  }

  function kpiCard(label, value, cls) {
    return '<div class="kpi-card ' + cls + '">' +
      '<div class="kpi-label">' + label + '</div>' +
      '<div class="kpi-value">' + value + '</div>' +
      '</div>';
  }

  function filled(val) {
    return val !== null && val !== undefined && String(val) !== '';
  }

  function uniq(arr) {
    var seen = {}, out = [];
    arr.forEach(function (v) { if (v && !seen[v]) { seen[v] = 1; out.push(v); } });
    return out.sort();
  }

  /* ── Date helpers ── */
  var MONTHS = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function parseDateParts(s) {
    if (!s) return null;
    var m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    var y = +m[3];
    if (y < 2000) return null;
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

  function getYears(field) {
    var seen = {};
    _data.forEach(function (r) { var p = parseDateParts(r[field]); if (p) seen[p.year] = 1; });
    return Object.keys(seen).map(Number).sort();
  }

  function getMonths(field, year) {
    var seen = {};
    _data.forEach(function (r) {
      var p = parseDateParts(r[field]);
      if (p && (!year || p.year === +year)) seen[p.month] = 1;
    });
    return Object.keys(seen).map(Number).sort(function (a, b) { return a - b; });
  }

  function getDays(field, year, month) {
    var seen = {};
    _data.forEach(function (r) {
      var p = parseDateParts(r[field]);
      if (p && (!year || p.year === +year) && (!month || p.month === +month)) seen[p.day] = 1;
    });
    return Object.keys(seen).map(Number).sort(function (a, b) { return a - b; });
  }

  function buildYearOpts(id, field, selected) {
    var years = getYears(field);
    var opts = '<option value="">Year</option>';
    years.forEach(function (y) {
      opts += '<option value="' + y + '"' + (selected == y ? ' selected' : '') + '>' + y + '</option>';
    });
    return '<select id="' + id + '" class="date-select">' + opts + '</select>';
  }

  function buildMonthOpts(id, field, year, selected) {
    var months = getMonths(field, year);
    var disabled = year ? '' : ' disabled';
    var opts = '<option value="">Month</option>';
    months.forEach(function (m) {
      opts += '<option value="' + m + '"' + (selected == m ? ' selected' : '') + '>' + MONTHS[m] + '</option>';
    });
    return '<select id="' + id + '" class="date-select"' + disabled + '>' + opts + '</select>';
  }

  function buildDayOpts(id, field, year, month, selected) {
    var days = getDays(field, year, month);
    var disabled = (year && month) ? '' : ' disabled';
    var opts = '<option value="">Day</option>';
    days.forEach(function (d) {
      opts += '<option value="' + d + '"' + (selected == d ? ' selected' : '') + '>' + (d < 10 ? '0' : '') + d + '</option>';
    });
    return '<select id="' + id + '" class="date-select"' + disabled + '>' + opts + '</select>';
  }

  function buildDropdown(id, options, selected, placeholder) {
    var html = '<select id="' + id + '" class="filter-select"><option value="">' + placeholder + '</option>';
    options.forEach(function (o) {
      html += '<option value="' + o + '"' + (selected === o ? ' selected' : '') + '>' + o + '</option>';
    });
    return html + '</select>';
  }

  function refreshMonthSelect(id, field, year) {
    var sel = document.getElementById(id);
    if (!sel) return;
    var months = getMonths(field, year);
    var html = '<option value="">Month</option>';
    months.forEach(function (m) { html += '<option value="' + m + '">' + MONTHS[m] + '</option>'; });
    sel.innerHTML = html;
    sel.disabled  = !year;
  }

  function refreshDaySelect(id, field, year, month) {
    var sel = document.getElementById(id);
    if (!sel) return;
    var days = getDays(field, year, month);
    var html = '<option value="">Day</option>';
    days.forEach(function (d) { html += '<option value="' + d + '">' + (d < 10 ? '0' : '') + d + '</option>'; });
    sel.innerHTML = html;
    sel.disabled  = !(year && month);
  }

  /* ── Filter logic ── */
  function applyFilters() {
    return _data.filter(function (r) {
      if (state.status           && r.status           !== state.status)           return false;
      if (state.contractor       && r.contractor       !== state.contractor)       return false;
      if (state.acceptanceStatus && r.acceptanceStatus !== state.acceptanceStatus) return false;
      if (!dateMatchesFilter(r.taskDate, state.taskYear,  state.taskMonth,  state.taskDay))  return false;
      if (!dateMatchesFilter(r.facDate,  state.facYear,   state.facMonth,   state.facDay))   return false;
      return true;
    });
  }

  /* ── Results render — KPIs + charts only, no filter bar ── */
  function renderResults() {
    var container = document.getElementById('dash-results');
    if (!container) return;

    var data = applyFilters();

    if (!data.length) {
      container.innerHTML = '<div class="empty-state" style="padding:2rem 1rem"><p>No data matches the selected filters.</p></div>';
      return;
    }

    /* ── KPI sums ── */
    var totalAmount = 0, lmpPortion = 0, contractorPortion = 0;
    var doneAmount  = 0, facAmount  = 0, nfacAmount = 0;
    data.forEach(function (r) {
      var price = r.newTotalPrice || 0;
      totalAmount       += price;
      lmpPortion        += r.lmp || 0;
      contractorPortion += r.contractor2 || 0;
      if (filled(r.taskDate)) doneAmount += price;
      if (filled(r.facDate))  facAmount  += price;
      else                    nfacAmount += price;
    });

    /* ── Chart 2: FAC Invoicing Status ── */
    var facNotInvoiced = 0, facSentInvoice = 0;
    data.forEach(function (r) {
      if (!filled(r.facDate)) return;
      var price = r.newTotalPrice || 0;
      var po = String(r.poStatus || '').trim().toLowerCase();
      if (po !== 'received') facNotInvoiced += price;
      if (po === 'sent')     facSentInvoice += price;
    });

    /* ── Chart 3: Contractors Amount (top 10) ── */
    var cMap = {};
    data.forEach(function (r) {
      var name = String(r.contractor || '').trim();
      if (!name) return;
      cMap[name] = (cMap[name] || 0) + (r.contractor2 || 0);
    });
    var cArr = Object.keys(cMap).map(function (k) { return [k, cMap[k]]; });
    cArr.sort(function (a, b) { return b[1] - a[1]; });
    var top10 = cArr.slice(0, 10);
    var top10Colors = top10.map(function (e, i) {
      var opacity = parseFloat((1 - (i / Math.max(top10.length, 1)) * 0.45).toFixed(2));
      return 'rgba(37,99,235,' + opacity + ')';
    });

    container.innerHTML =
      '<div class="kpi-grid">' +
        kpiCard('Total Amount',       fmt(totalAmount),       'amber') +
        kpiCard('LMP Portion',        fmt(lmpPortion),        'purple') +
        kpiCard('Contractor Portion', fmt(contractorPortion), 'blue') +
        kpiCard('Done Amount',        fmt(doneAmount),        'green') +
        kpiCard('FAC Amount',         fmt(facAmount),         'teal') +
        kpiCard('NFAC Amount',        fmt(nfacAmount),        'red') +
      '</div>' +
      '<div class="charts-grid">' +
        '<div class="chart-card"><h3>Done vs NFAC Amount</h3>' +
          '<div class="chart-wrap"><canvas id="ch-done-nfac"></canvas></div></div>' +
        '<div class="chart-card"><h3>FAC Invoicing Status</h3>' +
          '<div class="chart-wrap"><canvas id="ch-fac-invoice"></canvas></div></div>' +
        '<div class="chart-card"><h3>Contractors Amount</h3>' +
          '<div class="chart-wrap chart-tall"><canvas id="ch-contractors"></canvas></div></div>' +
      '</div>';

    setTimeout(function () {
      var C = window.ChartsModule;

      C.createPie('d-done-nfac', 'ch-done-nfac',
        ['Done', 'NFAC'],
        [doneAmount, nfacAmount],
        ['#16a34a', '#dc2626']
      );

      C.createBar('d-fac-invoice', 'ch-fac-invoice',
        ['FAC Not Invoiced', 'FAC Sent to Invoice'],
        [{
          label: 'Amount',
          data: [facNotInvoiced, facSentInvoice],
          backgroundColor: ['#d97706', '#2563eb'],
          borderRadius: 4
        }],
        { egp: true }
      );

      C.createHBar('d-contractors', 'ch-contractors',
        top10.map(function (e) { return e[0]; }),
        top10.map(function (e) { return e[1]; }),
        top10Colors,
        { egp: true }
      );
    }, 60);
  }

  /* ── Full render — filter bar + results container ── */
  function render() {
    var el = document.getElementById('dashboard-content');
    if (!el) return;
    _data = window.AppData || [];

    if (!_data.length) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div>' +
        '<p>No data yet &mdash; tap <strong>Sync</strong> to load</p></div>';
      return;
    }

    var statuses    = uniq(_data.map(function (r) { return r.status; }));
    var contractors = uniq(_data.map(function (r) { return r.contractor; }));
    var accStatuses = uniq(_data.map(function (r) { return r.acceptanceStatus; }));

    el.innerHTML =
      '<div class="section-header"><h2>Dashboard</h2></div>' +

      '<div class="card" style="margin-bottom:1.25rem">' +
        '<div class="fin-filters">' +

          '<div class="fin-filter-group">' +
            '<label class="field-label">Status</label>' +
            buildDropdown('db-status', statuses, state.status, 'All Status') +
          '</div>' +

          '<div class="fin-filter-group">' +
            '<label class="field-label">Task Date</label>' +
            '<div class="date-group">' +
              buildYearOpts( 'db-td-year',  'taskDate', state.taskYear) +
              buildMonthOpts('db-td-month', 'taskDate', state.taskYear,  state.taskMonth) +
              buildDayOpts(  'db-td-day',   'taskDate', state.taskYear,  state.taskMonth, state.taskDay) +
            '</div>' +
          '</div>' +

          '<div class="fin-filter-group">' +
            '<label class="field-label">Contractor</label>' +
            buildDropdown('db-contractor', contractors, state.contractor, 'All Contractors') +
          '</div>' +

          '<div class="fin-filter-group">' +
            '<label class="field-label">Acceptance Status</label>' +
            buildDropdown('db-acc-status', accStatuses, state.acceptanceStatus, 'All') +
          '</div>' +

          '<div class="fin-filter-group">' +
            '<label class="field-label">FAC Date</label>' +
            '<div class="date-group">' +
              buildYearOpts( 'db-fd-year',  'facDate', state.facYear) +
              buildMonthOpts('db-fd-month', 'facDate', state.facYear,  state.facMonth) +
              buildDayOpts(  'db-fd-day',   'facDate', state.facYear,  state.facMonth, state.facDay) +
            '</div>' +
          '</div>' +

          '<div class="fin-filter-group" style="display:flex;align-items:flex-end">' +
            '<button id="db-clear-btn" class="btn btn-outline" style="width:100%">Clear</button>' +
          '</div>' +

        '</div>' +
      '</div>' +

      '<div id="dash-results"></div>';

    renderResults();
    bindEvents();
  }

  /* ── Event binding ── */
  function bindEvents() {

    var statusSel = document.getElementById('db-status');
    if (statusSel) statusSel.addEventListener('change', function (e) {
      state.status = e.target.value; renderResults();
    });

    /* Task Date */
    var tdYear  = document.getElementById('db-td-year');
    var tdMonth = document.getElementById('db-td-month');
    var tdDay   = document.getElementById('db-td-day');
    if (tdYear) tdYear.addEventListener('change', function (e) {
      state.taskYear  = e.target.value;
      state.taskMonth = '';
      state.taskDay   = '';
      refreshMonthSelect('db-td-month', 'taskDate', state.taskYear);
      refreshDaySelect(  'db-td-day',   'taskDate', state.taskYear, '');
      renderResults();
    });
    if (tdMonth) tdMonth.addEventListener('change', function (e) {
      state.taskMonth = e.target.value;
      state.taskDay   = '';
      refreshDaySelect('db-td-day', 'taskDate', state.taskYear, state.taskMonth);
      renderResults();
    });
    if (tdDay) tdDay.addEventListener('change', function (e) {
      state.taskDay = e.target.value; renderResults();
    });

    /* Contractor */
    var ctrSel = document.getElementById('db-contractor');
    if (ctrSel) ctrSel.addEventListener('change', function (e) {
      state.contractor = e.target.value; renderResults();
    });

    /* Acceptance Status */
    var accSel = document.getElementById('db-acc-status');
    if (accSel) accSel.addEventListener('change', function (e) {
      state.acceptanceStatus = e.target.value; renderResults();
    });

    /* FAC Date */
    var fdYear  = document.getElementById('db-fd-year');
    var fdMonth = document.getElementById('db-fd-month');
    var fdDay   = document.getElementById('db-fd-day');
    if (fdYear) fdYear.addEventListener('change', function (e) {
      state.facYear  = e.target.value;
      state.facMonth = '';
      state.facDay   = '';
      refreshMonthSelect('db-fd-month', 'facDate', state.facYear);
      refreshDaySelect(  'db-fd-day',   'facDate', state.facYear, '');
      renderResults();
    });
    if (fdMonth) fdMonth.addEventListener('change', function (e) {
      state.facMonth = e.target.value;
      state.facDay   = '';
      refreshDaySelect('db-fd-day', 'facDate', state.facYear, state.facMonth);
      renderResults();
    });
    if (fdDay) fdDay.addEventListener('change', function (e) {
      state.facDay = e.target.value; renderResults();
    });

    /* Clear — full re-render to reset all selects */
    var clearBtn = document.getElementById('db-clear-btn');
    if (clearBtn) clearBtn.addEventListener('click', function () {
      state.status = '';
      state.taskYear  = ''; state.taskMonth  = ''; state.taskDay  = '';
      state.contractor = '';
      state.acceptanceStatus = '';
      state.facYear   = ''; state.facMonth   = ''; state.facDay   = '';
      render();
    });
  }

  return { render: render };

})();
