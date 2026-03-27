/* =========================================================
   admin.js — Telecom Analysis
   Admin panel (hidden from normal users).
   Exposes: window.AdminModule.render()
   ========================================================= */

window.AdminModule = (function () {

  function escHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function render() {
    var el = document.getElementById('admin-content');
    if (!el) return;

    var cfg         = window.Config || {};
    var currentUrl  = cfg.fileUrl || '';
    var cacheKey    = cfg.cacheKey    || 'telecom_data_cache';
    var lastSyncKey = cfg.lastSyncKey || 'telecom_last_sync';

    var cachedRaw  = localStorage.getItem(cacheKey);
    var recordCount = 0;
    try { if (cachedRaw) recordCount = JSON.parse(cachedRaw).length; } catch (e) {}
    var lastSync = localStorage.getItem(lastSyncKey) || '';
    var syncDisplay = lastSync ? new Date(lastSync).toLocaleString() : 'Never';

    el.innerHTML =
      '<div class="section-header"><h2>⚙️ Admin Panel</h2><p class="section-sub">Hidden from normal users</p></div>' +

      // Card 1 — Dropbox URL
      '<div class="card admin-card">' +
        '<h3>Dropbox Configuration</h3>' +
        '<label class="field-label" for="admin-url-input">Dropbox File URL (dl=1 link)</label>' +
        '<input type="text" id="admin-url-input" class="text-input" placeholder="https://www.dropbox.com/…?dl=1" value="' + escHtml(currentUrl) + '">' +
        '<div class="admin-status">' +
          (currentUrl
            ? '<span class="badge badge-success">&#10003; Configured</span>'
            : '<span class="badge badge-danger">&#10007; Not configured</span>') +
        '</div>' +
        '<button id="admin-save-url" class="btn btn-primary" style="margin-top:0.75rem">Save URL</button>' +
      '</div>' +

      // Card 2 — Generate Config URL
      '<div class="card admin-card">' +
        '<h3>Generate Config URL</h3>' +
        '<p class="admin-hint">Share this URL with your team. They open it once and the app configures automatically on their device.</p>' +
        '<button id="admin-gen-url" class="btn btn-primary">Generate Config URL</button>' +
        '<div id="admin-cfg-output" style="display:none;margin-top:1rem">' +
          '<div class="copy-row">' +
            '<input type="text" id="admin-cfg-url" class="text-input" readonly>' +
            '<button id="admin-copy-url" class="btn btn-outline">Copy</button>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // Card 3 — Cache
      '<div class="card admin-card">' +
        '<h3>Cache Management</h3>' +
        '<p>Records in cache: <strong>' + recordCount.toLocaleString() + '</strong></p>' +
        '<p>Last sync: <strong>' + escHtml(syncDisplay) + '</strong></p>' +
        '<div class="btn-row">' +
          '<button id="admin-clear-cache" class="btn btn-outline">Clear Cache</button>' +
          '<button id="admin-force-sync"  class="btn btn-primary">Force Sync Now</button>' +
        '</div>' +
      '</div>' +

      // Card 4 — App Info
      '<div class="card admin-card">' +
        '<h3>App Info</h3>' +
        '<p>Version: <strong>' + escHtml((cfg.version || '1.0.0')) + '</strong></p>' +
        '<p>Platform: PWA / Static HTML</p>' +
      '</div>';

    // --- Event bindings ---

    document.getElementById('admin-save-url').addEventListener('click', function () {
      var url = document.getElementById('admin-url-input').value.trim();
      if (!url) { window.showToast('Please enter a URL.', 'error'); return; }
      localStorage.setItem('telecom_file_url', url);
      window.Config.refresh();
      window.showToast('URL saved successfully!', 'success');
      render(); // re-render to update status badge
      if (typeof updateConnectionStatus === 'function') updateConnectionStatus();
    });

    document.getElementById('admin-gen-url').addEventListener('click', function () {
      var url = (window.Config && window.Config.fileUrl) || '';
      if (!url) { window.showToast('Save a URL first before generating a config link.', 'error'); return; }
      var encoded  = btoa(url);
      var cfgUrl   = window.location.origin + window.location.pathname + '?cfg=' + encoded;
      var output   = document.getElementById('admin-cfg-output');
      var urlInput = document.getElementById('admin-cfg-url');
      output.style.display   = 'block';
      urlInput.value         = cfgUrl;
    });

    document.getElementById('admin-copy-url').addEventListener('click', function () {
      var input = document.getElementById('admin-cfg-url');
      if (!input || !input.value) return;
      navigator.clipboard.writeText(input.value)
        .then(function () { window.showToast('Config URL copied to clipboard!', 'success'); })
        .catch(function () {
          input.select();
          document.execCommand('copy');
          window.showToast('Copied!', 'success');
        });
    });

    document.getElementById('admin-clear-cache').addEventListener('click', function () {
      localStorage.removeItem(cacheKey);
      localStorage.removeItem(lastSyncKey);
      window.AppData = [];
      window.showToast('Cache cleared.', 'info');
      render();
    });

    document.getElementById('admin-force-sync').addEventListener('click', function () {
      var syncBtn = document.getElementById('sync-btn');
      if (syncBtn) syncBtn.click();
    });
  }

  return { render: render };

})();
