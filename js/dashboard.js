/* =========================================================
   dashboard.js — Telecom Analysis
   Renders filter bar + KPI cards + 3 charts on Dashboard.
   Exposes: window.Dashboard.render()
   ========================================================= */

window.Dashboard = (function () {

  /* ── Filter state ── */
  var state = {
    taskYear:  '', taskMonth:  '', taskDay:  '',
    period:           '',          /* '' | 'old' | 'new' — by taskDate year vs 2026 */
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

  /* Chart card heading with the chart's grand total on the right */
  function chartHead(title, total) {
    return '<h3 class="chart-head">' + title +
      '<span class="chart-total">' + fmt(total) + '</span></h3>';
  }

  /* Two-line axis label: category name on top, its own total below */
  function catLabel(name, total) {
    return [name, fmt(total)];
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

  /* Old = taskDate year < 2026, New = 2026+. Rows with no usable taskDate
     belong to neither — same rule the Old vs New chart uses. */
  function isNewTask(r) {
    var p = parseDateParts(r.taskDate);
    return p ? p.year >= 2026 : null;
  }

  /* ── Filter logic ── */
  function applyFilters() {
    return _data.filter(function (r) {
      if (r.status !== 'Done') return false;
      if (state.period) {
        var isNew = isNewTask(r);
        if (isNew === null) return false;
        if (state.period === 'new' && !isNew) return false;
        if (state.period === 'old' &&  isNew) return false;
      }
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
    data.forEach(function (r) {
      totalAmount       += r.newTotalPrice || 0;
      lmpPortion        += r.lmp         || 0;
      contractorPortion += r.contractor2 || 0;
    });

    /* ── Chart 1: Old vs New Amount (cutoff 1-Jan-2026) ── */
    var oldLmp = 0, oldCtr = 0, newLmp = 0, newCtr = 0;
    data.forEach(function (r) {
      var p = parseDateParts(r.taskDate);
      if (!p) return;
      if (p.year >= 2026) {
        newLmp += r.lmp        || 0;
        newCtr += r.contractor2 || 0;
      } else {
        oldLmp += r.lmp        || 0;
        oldCtr += r.contractor2 || 0;
      }
    });

    /* ── Chart 2: FAC Invoicing Status ──
       Three mutually exclusive buckets keyed on PO status, so the bars
       partition the whole FAC'd amount (no row counted twice, none dropped). */
    var facNotInv_lmp = 0, facNotInv_ctr = 0;
    var facSent_lmp   = 0, facSent_ctr   = 0;
    var facRecv_lmp   = 0, facRecv_ctr   = 0;
    data.forEach(function (r) {
      if (!filled(r.facDate)) return;
      var po  = String(r.poStatus || '').trim().toLowerCase();
      var lmp = r.lmp || 0, ctr = r.contractor2 || 0;
      if (po === 'received') {
        facRecv_lmp   += lmp; facRecv_ctr   += ctr;
      } else if (po === 'sent') {
        facSent_lmp   += lmp; facSent_ctr   += ctr;
      } else {
        facNotInv_lmp += lmp; facNotInv_ctr += ctr;
      }
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
      return 'rgba(220,38,38,' + opacity + ')';
    });

    /* ── Per-chart totals (title) and per-category totals (axis / legend) ── */
    var oldTotal = oldLmp + oldCtr, newTotal = newLmp + newCtr;
    var facNotInvTotal = facNotInv_lmp + facNotInv_ctr;
    var facSentTotal   = facSent_lmp   + facSent_ctr;
    var facRecvTotal   = facRecv_lmp   + facRecv_ctr;
    var contractorsTotal = top10.reduce(function (a, e) { return a + e[1]; }, 0);

    container.innerHTML =
      '<div class="kpi-grid kpi-grid-3">' +
        kpiCard('Total Amount',       fmt(totalAmount),       'green') +
        kpiCard('LMP Portion',        fmt(lmpPortion),        'blue') +
        kpiCard('Contractor Portion', fmt(contractorPortion), 'red') +
      '</div>' +
      '<div class="charts-grid">' +
        '<div class="chart-card">' + chartHead('Old vs New Amount', oldTotal + newTotal) +
          '<div class="chart-wrap"><canvas id="ch-old-new"></canvas></div></div>' +
        '<div class="chart-card">' + chartHead('FAC Invoicing Status', facNotInvTotal + facSentTotal + facRecvTotal) +
          '<div class="chart-wrap"><canvas id="ch-fac-invoice"></canvas></div></div>' +
        '<div class="chart-card chart-full">' + chartHead('Contractors Amount', contractorsTotal) +
          '<div class="chart-wrap chart-tall"><canvas id="ch-contractors"></canvas></div></div>' +
      '</div>';

    setTimeout(function () {
      var C = window.ChartsModule;

      C.createBar('d-old-new', 'ch-old-new',
        [catLabel('Old Tasks (Pre-2026)', oldTotal), catLabel('New Tasks (2026+)', newTotal)],
        [
          {
            label: 'LMP Portion',
            data: [oldLmp, newLmp],
            backgroundColor: '#2563eb',
            borderRadius: 4
          },
          {
            label: 'Contractor Portion',
            data: [oldCtr, newCtr],
            backgroundColor: '#dc2626',
            borderRadius: 4
          }
        ],
        { egp: true }
      );

      C.createBar('d-fac-invoice', 'ch-fac-invoice',
        [
          catLabel('FAC Not Invoiced',    facNotInvTotal),
          catLabel('FAC Sent to Invoice', facSentTotal),
          catLabel('PO Received',         facRecvTotal)
        ],
        [
          {
            label: 'LMP Portion',
            data: [facNotInv_lmp, facSent_lmp, facRecv_lmp],
            backgroundColor: '#2563eb',
            borderRadius: 4
          },
          {
            label: 'Contractor Portion',
            data: [facNotInv_ctr, facSent_ctr, facRecv_ctr],
            backgroundColor: '#dc2626',
            borderRadius: 4
          }
        ],
        { egp: true }
      );

      C.createHBar('d-contractors', 'ch-contractors',
        top10.map(function (e) { return catLabel(e[0], e[1]); }),
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

    var contractors = uniq(_data.map(function (r) { return r.contractor; }));
    var accStatuses = uniq(_data.map(function (r) { return r.acceptanceStatus; }));

    el.innerHTML =
      '<div class="section-header"><h2>📊 Dashboard</h2></div>' +

      '<div class="card" style="margin-bottom:1.25rem">' +

        /* Mobile toggle header */
        '<button id="db-filter-toggle" class="dash-filter-toggle">' +
          '<span class="dash-filter-toggle-label">Filters' +
            '<span id="db-filter-badge" class="dash-filter-count" style="display:none"></span>' +
          '</span>' +
          '<span class="dash-filter-chevron" id="db-filter-chevron">&#9660;</span>' +
        '</button>' +

        /* Filter body — hidden on mobile until toggled */
        '<div id="db-filters-body" class="dash-filters-body">' +
          '<div class="fin-filters">' +

            '<div class="fin-filter-group">' +
              '<label class="field-label">Task Date</label>' +
              '<div class="date-group">' +
                buildYearOpts( 'db-td-year',  'taskDate', state.taskYear) +
                buildMonthOpts('db-td-month', 'taskDate', state.taskYear,  state.taskMonth) +
                buildDayOpts(  'db-td-day',   'taskDate', state.taskYear,  state.taskMonth, state.taskDay) +
              '</div>' +
            '</div>' +

            '<div class="fin-filter-group">' +
              '<label class="field-label">Old / New</label>' +
              '<select id="db-period" class="filter-select">' +
                '<option value=""'    + (state.period === ''    ? ' selected' : '') + '>All Tasks</option>' +
                '<option value="old"' + (state.period === 'old' ? ' selected' : '') + '>Old (Pre-2026)</option>' +
                '<option value="new"' + (state.period === 'new' ? ' selected' : '') + '>New (2026+)</option>' +
              '</select>' +
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

      '</div>' +

      '<div id="dash-results"></div>';

    renderResults();
    bindEvents();
  }

  /* ── Active filter count badge ── */
  function updateFilterBadge() {
    var badge   = document.getElementById('db-filter-badge');
    if (!badge) return;
    var count = 0;
    if (state.taskYear || state.taskMonth || state.taskDay)  count++;
    if (state.period)                                        count++;
    if (state.contractor)                                    count++;
    if (state.acceptanceStatus)                              count++;
    if (state.facYear || state.facMonth || state.facDay)     count++;
    if (count) {
      badge.textContent = count;
      badge.style.display = 'inline-flex';
    } else {
      badge.style.display = 'none';
    }
  }

  /* ── Event binding ── */
  function bindEvents() {

    /* Mobile toggle */
    var toggleBtn = document.getElementById('db-filter-toggle');
    if (toggleBtn) toggleBtn.addEventListener('click', function () {
      var body    = document.getElementById('db-filters-body');
      var chevron = document.getElementById('db-filter-chevron');
      if (!body) return;
      var open = body.classList.toggle('open');
      if (chevron) chevron.classList.toggle('open', open);
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
      updateFilterBadge(); renderResults();
    });
    if (tdMonth) tdMonth.addEventListener('change', function (e) {
      state.taskMonth = e.target.value;
      state.taskDay   = '';
      refreshDaySelect('db-td-day', 'taskDate', state.taskYear, state.taskMonth);
      updateFilterBadge(); renderResults();
    });
    if (tdDay) tdDay.addEventListener('change', function (e) {
      state.taskDay = e.target.value; updateFilterBadge(); renderResults();
    });

    /* Old / New */
    var periodSel = document.getElementById('db-period');
    if (periodSel) periodSel.addEventListener('change', function (e) {
      state.period = e.target.value; updateFilterBadge(); renderResults();
    });

    /* Contractor */
    var ctrSel = document.getElementById('db-contractor');
    if (ctrSel) ctrSel.addEventListener('change', function (e) {
      state.contractor = e.target.value; updateFilterBadge(); renderResults();
    });

    /* Acceptance Status */
    var accSel = document.getElementById('db-acc-status');
    if (accSel) accSel.addEventListener('change', function (e) {
      state.acceptanceStatus = e.target.value; updateFilterBadge(); renderResults();
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
      updateFilterBadge(); renderResults();
    });
    if (fdMonth) fdMonth.addEventListener('change', function (e) {
      state.facMonth = e.target.value;
      state.facDay   = '';
      refreshDaySelect('db-fd-day', 'facDate', state.facYear, state.facMonth);
      updateFilterBadge(); renderResults();
    });
    if (fdDay) fdDay.addEventListener('change', function (e) {
      state.facDay = e.target.value; updateFilterBadge(); renderResults();
    });

    /* Clear — full re-render to reset all selects */
    var clearBtn = document.getElementById('db-clear-btn');
    if (clearBtn) clearBtn.addEventListener('click', function () {
      state.taskYear  = ''; state.taskMonth  = ''; state.taskDay  = '';
      state.period     = '';
      state.contractor = '';
      state.acceptanceStatus = '';
      state.facYear   = ''; state.facMonth   = ''; state.facDay   = '';
      render();
    });
  }

  return { render: render };

})();
