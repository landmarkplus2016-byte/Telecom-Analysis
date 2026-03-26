/* =========================================================
   tasks.js — Telecom Analysis
   All Tasks section: search, filter dropdowns, paginated table.
   Exposes: window.TasksModule.render() / goToPage(n)
   ========================================================= */

window.TasksModule = (function () {

  var state = {
    query: '',
    status: '',
    region: '',
    stream: '',
    contractor: '',
    page: 1,
    pageSize: 50,
    filtered: []
  };

  function fmt(n) {
    var v = Number(n || 0);
    return v ? v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '-';
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

  function buildSelect(id, options, selected, placeholder) {
    var html = '<select id="' + id + '" class="filter-select"><option value="">' + placeholder + '</option>';
    options.forEach(function (o) {
      html += '<option value="' + escHtml(o) + '"' + (selected === o ? ' selected' : '') + '>' + escHtml(o) + '</option>';
    });
    return html + '</select>';
  }

  function escHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function applyFilters() {
    var data = window.AppData || [];
    var q = state.query.toLowerCase();
    return data.filter(function (r) {
      if (q && !(
        r.id.toLowerCase().includes(q) ||
        r.physicalSiteId.toLowerCase().includes(q) ||
        r.taskName.toLowerCase().includes(q) ||
        r.contractor.toLowerCase().includes(q) ||
        r.lineItem.toLowerCase().includes(q)
      )) return false;
      if (state.status     && r.status        !== state.status)     return false;
      if (state.region     && r.region        !== state.region)     return false;
      if (state.stream     && r.generalStream !== state.stream)     return false;
      if (state.contractor && r.contractor    !== state.contractor) return false;
      return true;
    });
  }

  function render() {
    var el = document.getElementById('tasks-content');
    if (!el) return;
    var data = window.AppData || [];

    if (!data.length) {
      el.innerHTML = '<div class="empty-state"><div class="empty-icon">📋</div>' +
        '<p>No data yet &mdash; tap <strong>Sync</strong> to load</p></div>';
      return;
    }

    state.filtered = applyFilters();
    var total      = state.filtered.length;
    var totalPages = Math.max(1, Math.ceil(total / state.pageSize));
    state.page     = Math.max(1, Math.min(state.page, totalPages));
    var start      = (state.page - 1) * state.pageSize;
    var pageData   = state.filtered.slice(start, start + state.pageSize);
    var end        = Math.min(start + state.pageSize, total);

    var html =
      '<div class="section-header"><h2>All Tasks</h2></div>' +
      '<div class="filter-bar">' +
        '<input type="text" id="task-search" class="search-input" placeholder="Search ID, Site, Task, Contractor, Line Item…" value="' + escHtml(state.query) + '">' +
        '<div class="filter-row">' +
          buildSelect('filter-status',     uniq(data.map(function(r){return r.status;})),        state.status,     'All Status') +
          buildSelect('filter-region',     uniq(data.map(function(r){return r.region;})),        state.region,     'All Regions') +
          buildSelect('filter-stream',     uniq(data.map(function(r){return r.generalStream;})), state.stream,     'All Streams') +
          buildSelect('filter-contractor', uniq(data.map(function(r){return r.contractor;})),    state.contractor, 'All Contractors') +
        '</div>' +
        '<div class="results-count">Showing ' + (total ? (start + 1) : 0) + '&ndash;' + end + ' of ' + total.toLocaleString() + ' tasks</div>' +
      '</div>' +
      '<div class="table-container">' +
        '<table class="data-table">' +
          '<thead><tr>' +
            '<th>ID#</th><th>Site ID</th><th>Region</th><th>Stream</th>' +
            '<th>Task Name</th><th>Contractor</th><th>Status</th>' +
            '<th>Acceptance</th><th>Value (EGP)</th>' +
          '</tr></thead>' +
          '<tbody>';

    pageData.forEach(function (r) {
      html +=
        '<tr>' +
          '<td class="mono">' + escHtml(r.id) + '</td>' +
          '<td>' + escHtml(r.physicalSiteId || '-') + '</td>' +
          '<td>' + escHtml(r.region || '-') + '</td>' +
          '<td>' + escHtml(r.generalStream || '-') + '</td>' +
          '<td class="task-name">' + escHtml(r.taskName || '-') + '</td>' +
          '<td>' + escHtml(r.contractor || '-') + '</td>' +
          '<td>' + statusBadge(r.status) + '</td>' +
          '<td>' + accBadge(r.acceptanceStatus) + '</td>' +
          '<td class="currency">' + fmt(r.newTotalPrice) + '</td>' +
        '</tr>';
    });

    html += '</tbody></table></div>';

    if (totalPages > 1) {
      html += '<div class="pagination">' +
        '<button class="btn btn-outline" onclick="window.TasksModule.goToPage(' + (state.page - 1) + ')"' + (state.page <= 1 ? ' disabled' : '') + '>&#8249; Prev</button>' +
        '<span class="page-info">Page ' + state.page + ' of ' + totalPages + '</span>' +
        '<button class="btn btn-outline" onclick="window.TasksModule.goToPage(' + (state.page + 1) + ')"' + (state.page >= totalPages ? ' disabled' : '') + '>Next &#8250;</button>' +
      '</div>';
    }

    el.innerHTML = html;

    // Bind live filter events
    var searchEl = document.getElementById('task-search');
    if (searchEl) searchEl.addEventListener('input', function (e) {
      state.query = e.target.value;
      state.page  = 1;
      render();
    });

    ['status', 'region', 'stream', 'contractor'].forEach(function (key) {
      var sel = document.getElementById('filter-' + key);
      if (sel) sel.addEventListener('change', function (e) {
        state[key] = e.target.value;
        state.page = 1;
        render();
      });
    });
  }

  function goToPage(n) {
    var totalPages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
    state.page = Math.max(1, Math.min(n, totalPages));
    render();
  }

  return { render: render, goToPage: goToPage };

})();
