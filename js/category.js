/* =========================================================
   category.js — Telecom Analysis
   By Category section: progress-bar cards + stacked bar chart.
   Exposes: window.CategoryModule.render()
   ========================================================= */

window.CategoryModule = (function () {

  function countBy(data, field) {
    var map = {};
    data.forEach(function (r) {
      var v = r[field];
      if (v) map[v] = (map[v] || 0) + 1;
    });
    return Object.keys(map).map(function (k) { return { label: k, count: map[k] }; })
      .sort(function (a, b) { return b.count - a.count; });
  }

  function progressCard(title, entries, total) {
    var rows = entries.map(function (e) {
      var pct = total ? Math.round(e.count / total * 100) : 0;
      return '<div class="progress-item">' +
        '<div class="progress-label"><span>' + escHtml(e.label) + '</span><span class="progress-count">' + e.count.toLocaleString() + ' (' + pct + '%)</span></div>' +
        '<div class="progress-track"><div class="progress-fill" style="width:' + pct + '%"></div></div>' +
        '</div>';
    }).join('');

    return '<div class="card progress-card">' +
      '<h3>' + title + '</h3>' +
      '<div class="progress-list">' + rows + '</div>' +
      '</div>';
  }

  function escHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function render() {
    var el = document.getElementById('category-content');
    if (!el) return;
    var data = window.AppData || [];

    if (!data.length) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">📁</div>' +
        '<p>No data yet &mdash; tap <strong>Sync</strong> to load</p></div>';
      return;
    }

    var streams     = countBy(data, 'generalStream');
    var regions     = countBy(data, 'region');
    var contractors = countBy(data, 'contractor');
    var total       = data.length;

    el.innerHTML =
      '<div class="section-header"><h2>By Category</h2></div>' +
      '<div class="category-grid">' +
        progressCard('By General Stream', streams,     total) +
        progressCard('By Region',         regions,     total) +
        progressCard('By Contractor',     contractors, total) +
      '</div>' +
      '<div class="card chart-card" style="margin-top:1.5rem">' +
        '<h3>Done vs Assigned vs Cancelled per General Stream</h3>' +
        '<div class="chart-wrap chart-tall"><canvas id="ch-stream-status"></canvas></div>' +
      '</div>';

    setTimeout(function () {
      // Build stacked data per stream
      var topStreams = streams.slice(0, 12); // cap to avoid chart overflow
      var labels = topStreams.map(function (s) { return s.label; });
      var done = [], assigned = [], cancelled = [];

      labels.forEach(function (stream) {
        var rows = data.filter(function (r) { return r.generalStream === stream; });
        done.push(rows.filter(function (r) { return r.status === 'Done'; }).length);
        assigned.push(rows.filter(function (r) { return r.status === 'Assigned'; }).length);
        cancelled.push(rows.filter(function (r) { return r.status === 'Cancelled'; }).length);
      });

      ChartsModule.createHBar('cat-stream-status', 'ch-stream-status',
        labels,
        [
          { label: 'Done',      data: done,      color: '#16a34a' },
          { label: 'Assigned',  data: assigned,  color: '#2563eb' },
          { label: 'Cancelled', data: cancelled, color: '#dc2626' }
        ]
      );
    }, 60);
  }

  return { render: render };

})();
