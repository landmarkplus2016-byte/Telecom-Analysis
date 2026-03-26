/* =========================================================
   dashboard.js — Telecom Analysis
   Renders KPI cards + 4 charts on the Dashboard section.
   Exposes: window.Dashboard.render()
   ========================================================= */

window.Dashboard = (function () {

  function fmt(n) {
    return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  function kpiCard(label, value, cls) {
    return '<div class="kpi-card ' + cls + '">' +
      '<div class="kpi-label">' + label + '</div>' +
      '<div class="kpi-value">' + value + '</div>' +
      '</div>';
  }

  function render() {
    var el = document.getElementById('dashboard-content');
    if (!el) return;
    var data = window.AppData || [];

    if (!data.length) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">📊</div>' +
        '<p>No data yet &mdash; tap <strong>Sync</strong> to load</p></div>';
      return;
    }

    // --- Status counts ---
    var sc = { Done: 0, Assigned: 0, Cancelled: 0, Duplicated: 0, Other: 0 };
    data.forEach(function (r) {
      if (sc.hasOwnProperty(r.status)) sc[r.status]++;
      else sc.Other++;
    });

    // --- Financial sums ---
    var totalValue = 0, totalLMP = 0, totalReceived = 0, totalRemaining = 0;
    data.forEach(function (r) {
      totalValue     += r.newTotalPrice    || 0;
      totalLMP       += r.lmp             || 0;
      totalReceived  += (r.receiving1Amount || 0) + (r.receiving2Amount || 0);
      totalRemaining += r.remainingAmounts || 0;
    });

    // --- Stream counts (top 10) ---
    var streamMap = {};
    data.forEach(function (r) { if (r.generalStream) streamMap[r.generalStream] = (streamMap[r.generalStream] || 0) + 1; });
    var streamArr = Object.keys(streamMap).map(function (k) { return [k, streamMap[k]]; });
    streamArr.sort(function (a, b) { return b[1] - a[1]; });
    var top10 = streamArr.slice(0, 10);

    // --- Region counts ---
    var regionMap = {};
    data.forEach(function (r) { if (r.region) regionMap[r.region] = (regionMap[r.region] || 0) + 1; });
    var regionArr = Object.keys(regionMap).map(function (k) { return [k, regionMap[k]]; });
    regionArr.sort(function (a, b) { return b[1] - a[1]; });

    // --- Acceptance counts ---
    var ac = { FAC: 0, TOC: 0, PAC: 0, Other: 0 };
    data.forEach(function (r) {
      if (r.acceptanceStatus && ac.hasOwnProperty(r.acceptanceStatus)) ac[r.acceptanceStatus]++;
      else if (r.acceptanceStatus) ac.Other++;
    });

    el.innerHTML =
      '<div class="section-header"><h2>Dashboard</h2></div>' +
      '<div class="kpi-grid">' +
        kpiCard('Total Tasks',          data.length.toLocaleString(), 'blue') +
        kpiCard('Done',                 sc.Done.toLocaleString(),     'green') +
        kpiCard('Assigned',             sc.Assigned.toLocaleString(), 'blue') +
        kpiCard('Cancelled',            sc.Cancelled.toLocaleString(),'red') +
        kpiCard('Total Contract Value', fmt(totalValue)    + ' EGP',  'amber') +
        kpiCard('Total LMP',            fmt(totalLMP)      + ' EGP',  'purple') +
        kpiCard('Total Received',       fmt(totalReceived) + ' EGP',  'teal') +
        kpiCard('Total Remaining',      fmt(totalRemaining)+ ' EGP',  'red') +
      '</div>' +
      '<div class="charts-grid">' +
        '<div class="chart-card"><h3>Status Distribution</h3><div class="chart-wrap"><canvas id="ch-status"></canvas></div></div>' +
        '<div class="chart-card"><h3>Tasks by General Stream (Top 10)</h3><div class="chart-wrap chart-tall"><canvas id="ch-stream"></canvas></div></div>' +
        '<div class="chart-card"><h3>Tasks by Region</h3><div class="chart-wrap"><canvas id="ch-region"></canvas></div></div>' +
        '<div class="chart-card"><h3>Acceptance Status</h3><div class="chart-wrap"><canvas id="ch-acceptance"></canvas></div></div>' +
      '</div>';

    setTimeout(function () {
      var C = ChartsModule;

      C.createDoughnut('d-status', 'ch-status',
        ['Done', 'Assigned', 'Cancelled', 'Duplicated', 'Other'],
        [sc.Done, sc.Assigned, sc.Cancelled, sc.Duplicated, sc.Other],
        ['#16a34a', '#2563eb', '#dc2626', '#6b7280', '#d97706']
      );

      C.createHBar('d-stream', 'ch-stream',
        top10.map(function (e) { return e[0]; }),
        top10.map(function (e) { return e[1]; }),
        '#2563eb'
      );

      C.createBar('d-region', 'ch-region',
        regionArr.map(function (e) { return e[0]; }),
        [{
          label: 'Tasks',
          data: regionArr.map(function (e) { return e[1]; }),
          backgroundColor: '#0891b2',
          borderRadius: 4
        }]
      );

      C.createDoughnut('d-acceptance', 'ch-acceptance',
        ['FAC', 'TOC', 'PAC', 'Other'],
        [ac.FAC, ac.TOC, ac.PAC, ac.Other],
        ['#2563eb', '#d97706', '#7c3aed', '#6b7280']
      );
    }, 60);
  }

  return { render: render };

})();
