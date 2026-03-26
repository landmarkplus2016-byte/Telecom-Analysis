/* =========================================================
   charts.js — Telecom Analysis
   Chart.js helpers. All instances stored in window.Charts.
   Always destroy before recreating to avoid canvas reuse errors.
   ========================================================= */

window.Charts = {};

window.ChartsModule = (function () {

  var COLORS = [
    '#2563eb', '#16a34a', '#dc2626', '#d97706',
    '#7c3aed', '#0891b2', '#db2777', '#ea580c'
  ];

  function destroy(key) {
    if (window.Charts[key]) {
      try { window.Charts[key].destroy(); } catch (e) {}
      delete window.Charts[key];
    }
  }

  function destroyAll() {
    Object.keys(window.Charts).forEach(function (k) {
      try { window.Charts[k].destroy(); } catch (e) {}
    });
    window.Charts = {};
  }

  /* ── Doughnut ── */
  function createDoughnut(key, canvasId, labels, data, colors) {
    destroy(key);
    var ctx = document.getElementById(canvasId);
    if (!ctx) return;
    window.Charts[key] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: colors || COLORS.slice(0, data.length),
          borderWidth: 2,
          borderColor: '#fff',
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { padding: 14, font: { size: 12 }, boxWidth: 14 } },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                var total = ctx.dataset.data.reduce(function (a, b) { return a + b; }, 0);
                var pct = total ? Math.round(ctx.parsed / total * 100) : 0;
                return '  ' + ctx.label + ': ' + ctx.parsed.toLocaleString() + ' (' + pct + '%)';
              }
            }
          }
        }
      }
    });
  }

  /* ── Vertical Bar (supports stacked + multiple datasets) ── */
  function createBar(key, canvasId, labels, datasets, opts) {
    opts = opts || {};
    destroy(key);
    var ctx = document.getElementById(canvasId);
    if (!ctx) return;
    window.Charts[key] = new Chart(ctx, {
      type: 'bar',
      data: { labels: labels, datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: datasets.length > 1
            ? { position: 'bottom', labels: { padding: 12, font: { size: 12 }, boxWidth: 12 } }
            : { display: false },
          tooltip: { mode: 'index', intersect: false }
        },
        scales: {
          x: { stacked: !!opts.stacked, grid: { display: false }, ticks: { font: { size: 11 }, maxRotation: 45 } },
          y: { stacked: !!opts.stacked, grid: { color: '#f1f5f9' }, ticks: { font: { size: 11 } }, beginAtZero: true }
        }
      }
    });
  }

  /* ── Horizontal Bar ── */
  function createHBar(key, canvasId, labels, data, color) {
    destroy(key);
    var ctx = document.getElementById(canvasId);
    if (!ctx) return;

    // data can be a flat array (single series) or array of series objects {label, data, color}
    var datasets;
    if (Array.isArray(data) && data.length && typeof data[0] === 'object' && data[0].data) {
      datasets = data.map(function (s, i) {
        return {
          label: s.label || ('Series ' + (i + 1)),
          data: s.data,
          backgroundColor: s.color || COLORS[i % COLORS.length],
          borderRadius: 4
        };
      });
    } else {
      datasets = [{
        label: 'Value',
        data: data,
        backgroundColor: color || COLORS,
        borderRadius: 4
      }];
    }

    window.Charts[key] = new Chart(ctx, {
      type: 'bar',
      data: { labels: labels, datasets: datasets },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: datasets.length > 1
            ? { position: 'bottom', labels: { padding: 12, font: { size: 12 }, boxWidth: 12 } }
            : { display: false },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                return '  ' + (ctx.dataset.label ? ctx.dataset.label + ': ' : '') + ctx.parsed.x.toLocaleString();
              }
            }
          }
        },
        scales: {
          x: { beginAtZero: true, grid: { color: '#f1f5f9' }, ticks: { font: { size: 11 } } },
          y: { grid: { display: false }, ticks: { font: { size: 11 } } }
        }
      }
    });
  }

  return {
    COLORS: COLORS,
    destroy: destroy,
    destroyAll: destroyAll,
    createDoughnut: createDoughnut,
    createBar: createBar,
    createHBar: createHBar
  };

})();
