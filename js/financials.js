/* =========================================================
   financials.js — Telecom Analysis
   Financials section: 8 KPI cards + 3 charts.
   Exposes: window.FinancialsModule.render()
   ========================================================= */

window.FinancialsModule = (function () {

  function fmt(n) {
    return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' EGP';
  }

  function kpiCard(label, value, cls) {
    return '<div class="kpi-card ' + (cls || '') + '">' +
      '<div class="kpi-label">' + label + '</div>' +
      '<div class="kpi-value kpi-value-sm">' + value + '</div>' +
      '</div>';
  }

  function render() {
    var el = document.getElementById('financials-content');
    if (!el) return;
    var data = window.AppData || [];

    if (!data.length) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">💰</div>' +
        '<p>No data yet &mdash; tap <strong>Sync</strong> to load</p></div>';
      return;
    }

    var totals = { value: 0, lmp: 0, r1: 0, r2: 0, remaining: 0, lmpPortion: 0, contractorPortion: 0 };
    data.forEach(function (r) {
      totals.value            += r.newTotalPrice    || 0;
      totals.lmp              += r.lmp              || 0;
      totals.r1               += r.receiving1Amount || 0;
      totals.r2               += r.receiving2Amount || 0;
      totals.remaining        += r.remainingAmounts || 0;
      totals.lmpPortion       += r.lmpPortion       || 0;
      totals.contractorPortion += r.contractorPortion || 0;
    });
    totals.received = totals.r1 + totals.r2;

    // Top 10 contractors by total value
    var cmap = {};
    data.forEach(function (r) {
      if (r.contractor) cmap[r.contractor] = (cmap[r.contractor] || 0) + (r.newTotalPrice || 0);
    });
    var topContractors = Object.keys(cmap).map(function (k) { return [k, cmap[k]]; });
    topContractors.sort(function (a, b) { return b[1] - a[1]; });
    topContractors = topContractors.slice(0, 10);

    el.innerHTML =
      '<div class="section-header"><h2>Financials</h2></div>' +
      '<div class="kpi-grid">' +
        kpiCard('Total Contract Value',  fmt(totals.value),            'amber') +
        kpiCard('Total LMP',             fmt(totals.lmp),              'purple') +
        kpiCard('Total 1st Receiving',   fmt(totals.r1),               'teal') +
        kpiCard('Total 2nd Receiving',   fmt(totals.r2),               'teal') +
        kpiCard('Total Received',        fmt(totals.received),         'green') +
        kpiCard('Total Remaining',       fmt(totals.remaining),        'red') +
        kpiCard('LMP Portion',           fmt(totals.lmpPortion),       'purple') +
        kpiCard('Contractor Portion',    fmt(totals.contractorPortion),'blue') +
      '</div>' +
      '<div class="charts-grid">' +
        '<div class="chart-card"><h3>LMP vs Contractor Portion</h3><div class="chart-wrap"><canvas id="ch-fin-split"></canvas></div></div>' +
        '<div class="chart-card"><h3>Received vs Remaining</h3><div class="chart-wrap"><canvas id="ch-fin-rcv"></canvas></div></div>' +
        '<div class="chart-card chart-full"><h3>Top 10 Contractors by Value</h3><div class="chart-wrap chart-tall"><canvas id="ch-fin-contractors"></canvas></div></div>' +
      '</div>';

    setTimeout(function () {
      var C = ChartsModule;

      C.createDoughnut('fin-split', 'ch-fin-split',
        ['LMP Portion', 'Contractor Portion'],
        [totals.lmpPortion, totals.contractorPortion],
        ['#7c3aed', '#2563eb']
      );

      C.createBar('fin-rcv', 'ch-fin-rcv',
        ['Financial Summary'],
        [
          { label: 'Total Received',  data: [totals.received],  backgroundColor: '#16a34a', borderRadius: 4 },
          { label: 'Total Remaining', data: [totals.remaining], backgroundColor: '#dc2626', borderRadius: 4 }
        ]
      );

      C.createHBar('fin-contractors', 'ch-fin-contractors',
        topContractors.map(function (e) { return e[0]; }),
        topContractors.map(function (e) { return e[1]; }),
        '#d97706'
      );
    }, 60);
  }

  return { render: render };

})();
