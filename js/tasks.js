/* =========================================================
   tasks.js — Telecom Analysis
   All Tasks section: search, filters, paginated table.
   Exposes: window.TasksModule.render() / goToPage(n)
   ========================================================= */

window.TasksModule = (function () {

  /* ── State ── */
  var state = {
    query:       '',
    taskYear:    '', taskMonth:    '', taskDay:    '',
    facYear:     '', facMonth:     '', facDay:     '',
    poStatus:    '',
    contractor:  '',
    page:        1,
    pageSize:    50
  };

  var _data     = [];
  var _filtered = [];

  /* ── Helpers ── */
  function fmt(n) {
    var v = Number(n || 0);
    return v ? v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '-';
  }

  function escHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function statusBadge(s) {
    var map = { Done: 'badge-success', Assigned: 'badge-primary', Cancelled: 'badge-danger', Duplicated: 'badge-muted', Other: 'badge-warning' };
    return '<span class="badge ' + (map[s] || 'badge-muted') + '">' + (s || '-') + '</span>';
  }

  function accBadge(s) {
    if (!s) return '-';
    var map = { FAC: 'badge-primary', TOC: 'badge-warning', PAC: 'badge-purple' };
    return '<span class="badge ' + (map[s] || 'badge-muted') + '">' + s + '</span>';
  }

  function uniq(arr) {
    var seen = {}, out = [];
    arr.forEach(function (v) { if (v && !seen[v]) { seen[v] = 1; out.push(v); } });
    return out.sort();
  }

  /* ── Date helpers (DD/MM/YYYY format from parser) ── */
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

  function getYears(data, field) {
    var seen = {};
    data.forEach(function (r) { var p = parseDateParts(r[field]); if (p) seen[p.year] = 1; });
    return Object.keys(seen).map(Number).sort();
  }

  function getMonths(data, field, year) {
    var seen = {};
    data.forEach(function (r) {
      var p = parseDateParts(r[field]);
      if (p && (!year || p.year === +year)) seen[p.month] = 1;
    });
    return Object.keys(seen).map(Number).sort(function (a, b) { return a - b; });
  }

  function getDays(data, field, year, month) {
    var seen = {};
    data.forEach(function (r) {
      var p = parseDateParts(r[field]);
      if (p && (!year || p.year === +year) && (!month || p.month === +month)) seen[p.day] = 1;
    });
    return Object.keys(seen).map(Number).sort(function (a, b) { return a - b; });
  }

  var MONTHS = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

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

  function buildDropdown(id, options, selected, placeholder) {
    var html = '<select id="' + id + '" class="filter-select"><option value="">' + placeholder + '</option>';
    options.forEach(function (o) {
      html += '<option value="' + escHtml(o) + '"' + (selected === o ? ' selected' : '') + '>' + escHtml(o) + '</option>';
    });
    return html + '</select>';
  }

  /* ── Inline select updaters (no full re-render) ── */
  function refreshMonthSelect(id, field, year) {
    var sel = document.getElementById(id);
    if (!sel) return;
    var months = getMonths(_data, field, year);
    var html = '<option value="">Month</option>';
    months.forEach(function (m) { html += '<option value="' + m + '">' + MONTHS[m] + '</option>'; });
    sel.innerHTML = html;
    sel.disabled  = !year;
  }

  function refreshDaySelect(id, field, year, month) {
    var sel = document.getElementById(id);
    if (!sel) return;
    var days = getDays(_data, field, year, month);
    var html = '<option value="">Day</option>';
    days.forEach(function (d) { html += '<option value="' + d + '">' + (d < 10 ? '0' : '') + d + '</option>'; });
    sel.innerHTML = html;
    sel.disabled  = !(year && month);
  }

  /* ── Filter logic ── */
  function applyFilters() {
    var q = state.query.toLowerCase();
    return _data.filter(function (r) {
      if (q && !(
        (r.jobCode        || '').toLowerCase().indexOf(q) !== -1 ||
        (r.logicalSiteId  || '').toLowerCase().indexOf(q) !== -1 ||
        (r.contractor     || '').toLowerCase().indexOf(q) !== -1 ||
        (r.lineItem       || '').toLowerCase().indexOf(q) !== -1 ||
        (r.id             || '').toLowerCase().indexOf(q) !== -1
      )) return false;
      if (!dateMatchesFilter(r.taskDate, state.taskYear,  state.taskMonth,  state.taskDay))  return false;
      if (!dateMatchesFilter(r.facDate,  state.facYear,   state.facMonth,   state.facDay))   return false;
      if (state.poStatus   && r.poStatus   !== state.poStatus)   return false;
      if (state.contractor && r.contractor !== state.contractor) return false;
      return true;
    });
  }

  /* ═══════════════════════════════════════
     Partial render — table + pagination only
     Called on every filter/page change so
     the search input is never destroyed.
  ═══════════════════════════════════════ */
  function renderResults() {
    var container = document.getElementById('tasks-results');
    if (!container) return;

    _filtered = applyFilters();
    var total      = _filtered.length;
    var totalPages = Math.max(1, Math.ceil(total / state.pageSize));
    state.page     = Math.max(1, Math.min(state.page, totalPages));
    var start      = (state.page - 1) * state.pageSize;
    var pageData   = _filtered.slice(start, start + state.pageSize);
    var end        = Math.min(start + state.pageSize, total);

    /* Update count in-place */
    var countEl = document.getElementById('tasks-count');
    if (countEl) countEl.textContent = 'Showing ' + (total ? (start + 1) : 0) + '–' + end + ' of ' + total.toLocaleString() + ' tasks';

    var html =
      '<div class="table-container">' +
        '<table class="data-table">' +
          '<thead><tr>' +
            '<th>Job Code</th>' +
            '<th>Logical Site ID</th>' +
            '<th>Contractor</th>' +
            '<th>Line Item</th>' +
            '<th class="col-num">New Total Price (EGP)</th>' +
            '<th>Status</th>' +
            '<th>Acceptance</th>' +
          '</tr></thead>' +
          '<tbody>';

    pageData.forEach(function (r) {
      html +=
        '<tr>' +
          '<td class="mono">' + escHtml(r.jobCode || '-') + '</td>' +
          '<td>' + escHtml(r.logicalSiteId || '-') + '</td>' +
          '<td>' + escHtml(r.contractor || '-') + '</td>' +
          '<td class="task-name">' + escHtml(r.lineItem || '-') + '</td>' +
          '<td class="currency">' + fmt(r.newTotalPrice) + '</td>' +
          '<td>' + statusBadge(r.status) + '</td>' +
          '<td>' + accBadge(r.acceptanceStatus) + '</td>' +
        '</tr>';
    });

    html += '</tbody></table></div>';

    if (totalPages > 1) {
      html +=
        '<div class="pagination">' +
          '<button class="btn btn-outline" onclick="window.TasksModule.goToPage(' + (state.page - 1) + ')"' + (state.page <= 1 ? ' disabled' : '') + '>&#8249; Prev</button>' +
          '<span class="page-info">Page ' + state.page + ' of ' + totalPages + '</span>' +
          '<button class="btn btn-outline" onclick="window.TasksModule.goToPage(' + (state.page + 1) + ')"' + (state.page >= totalPages ? ' disabled' : '') + '>Next &#8250;</button>' +
        '</div>';
    }

    container.innerHTML = html;
  }

  /* ═══════════════════════════════════════
     Full render — section switch / data reload
  ═══════════════════════════════════════ */
  function render() {
    var el = document.getElementById('tasks-content');
    if (!el) return;
    _data = window.AppData || [];

    if (!_data.length) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div>' +
        '<p>No data yet &mdash; tap <strong>Sync</strong> to load</p></div>';
      return;
    }

    var taskYears  = getYears(_data,  'taskDate');
    var taskMonths = getMonths(_data, 'taskDate', state.taskYear);
    var taskDays   = getDays(_data,   'taskDate', state.taskYear, state.taskMonth);

    var facYears   = getYears(_data,  'facDate');
    var facMonths  = getMonths(_data, 'facDate',  state.facYear);
    var facDays    = getDays(_data,   'facDate',  state.facYear,  state.facMonth);

    var poStatuses  = uniq(_data.map(function (r) { return r.poStatus; }));
    var contractors = uniq(_data.map(function (r) { return r.contractor; }));

    el.innerHTML =
      '<div class="section-header"><h2>📋 All Tasks</h2></div>' +

      /* Filter card — built once */
      '<div class="card" style="margin-bottom:1rem">' +
        '<div class="tasks-filter-grid">' +

          /* Search */
          '<div class="tasks-filter-full">' +
            '<input type="text" id="task-search" class="search-input" placeholder="Search Job Code, Site ID, Contractor, Line Item…" value="' + escHtml(state.query) + '">' +
          '</div>' +

          /* Task Date */
          '<div class="fin-filter-group">' +
            '<label class="field-label">Task Date</label>' +
            '<div class="date-group">' +
              buildYearOpts( 'tk-td-year',  taskYears,  state.taskYear)  +
              buildMonthOpts('tk-td-month', taskMonths, state.taskYear,  state.taskMonth) +
              buildDayOpts(  'tk-td-day',   taskDays,   state.taskYear,  state.taskMonth, state.taskDay) +
            '</div>' +
          '</div>' +

          /* FAC Date */
          '<div class="fin-filter-group">' +
            '<label class="field-label">FAC Date</label>' +
            '<div class="date-group">' +
              buildYearOpts( 'tk-fd-year',  facYears,  state.facYear)  +
              buildMonthOpts('tk-fd-month', facMonths, state.facYear,  state.facMonth) +
              buildDayOpts(  'tk-fd-day',   facDays,   state.facYear,  state.facMonth, state.facDay) +
            '</div>' +
          '</div>' +

          /* PO Status */
          '<div class="fin-filter-group">' +
            '<label class="field-label">PO Status</label>' +
            buildDropdown('tk-po-status', poStatuses, state.poStatus, 'All PO Status') +
          '</div>' +

          /* Contractor */
          '<div class="fin-filter-group">' +
            '<label class="field-label">Contractor</label>' +
            buildDropdown('tk-contractor', contractors, state.contractor, 'All Contractors') +
          '</div>' +

        '</div>' +
        '<p id="tasks-count" class="results-count" style="margin-top:.75rem"></p>' +
      '</div>' +

      /* Results container */
      '<div id="tasks-results"></div>';

    renderResults();
    bindFilterEvents();
  }

  /* ── Event binding ── */
  function bindFilterEvents() {

    /* Search — partial render only → no focus loss */
    var searchEl = document.getElementById('task-search');
    if (searchEl) searchEl.addEventListener('input', function (e) {
      state.query = e.target.value;
      state.page  = 1;
      renderResults();
    });

    /* Task Date */
    var tdYear  = document.getElementById('tk-td-year');
    var tdMonth = document.getElementById('tk-td-month');
    var tdDay   = document.getElementById('tk-td-day');

    if (tdYear) tdYear.addEventListener('change', function (e) {
      state.taskYear  = e.target.value;
      state.taskMonth = '';
      state.taskDay   = '';
      refreshMonthSelect('tk-td-month', 'taskDate', state.taskYear);
      refreshDaySelect(  'tk-td-day',   'taskDate', state.taskYear, '');
      state.page = 1; renderResults();
    });
    if (tdMonth) tdMonth.addEventListener('change', function (e) {
      state.taskMonth = e.target.value;
      state.taskDay   = '';
      refreshDaySelect('tk-td-day', 'taskDate', state.taskYear, state.taskMonth);
      state.page = 1; renderResults();
    });
    if (tdDay) tdDay.addEventListener('change', function (e) {
      state.taskDay = e.target.value;
      state.page = 1; renderResults();
    });

    /* FAC Date */
    var fdYear  = document.getElementById('tk-fd-year');
    var fdMonth = document.getElementById('tk-fd-month');
    var fdDay   = document.getElementById('tk-fd-day');

    if (fdYear) fdYear.addEventListener('change', function (e) {
      state.facYear  = e.target.value;
      state.facMonth = '';
      state.facDay   = '';
      refreshMonthSelect('tk-fd-month', 'facDate', state.facYear);
      refreshDaySelect(  'tk-fd-day',   'facDate', state.facYear, '');
      state.page = 1; renderResults();
    });
    if (fdMonth) fdMonth.addEventListener('change', function (e) {
      state.facMonth = e.target.value;
      state.facDay   = '';
      refreshDaySelect('tk-fd-day', 'facDate', state.facYear, state.facMonth);
      state.page = 1; renderResults();
    });
    if (fdDay) fdDay.addEventListener('change', function (e) {
      state.facDay = e.target.value;
      state.page = 1; renderResults();
    });

    /* PO Status */
    var poSel = document.getElementById('tk-po-status');
    if (poSel) poSel.addEventListener('change', function (e) {
      state.poStatus = e.target.value;
      state.page = 1; renderResults();
    });

    /* Contractor */
    var ctrSel = document.getElementById('tk-contractor');
    if (ctrSel) ctrSel.addEventListener('change', function (e) {
      state.contractor = e.target.value;
      state.page = 1; renderResults();
    });
  }

  function goToPage(n) {
    var totalPages = Math.max(1, Math.ceil(_filtered.length / state.pageSize));
    state.page = Math.max(1, Math.min(n, totalPages));
    renderResults();
  }

  return { render: render, goToPage: goToPage };

})();
