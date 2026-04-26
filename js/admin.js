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

    var cfg = window.Config || {};

    var currentUrl  = cfg.fileUrl  || '';
    var currentUrl2 = cfg.fileUrl2 || '';

    var cacheKey     = cfg.cacheKey     || 'telecom_data_cache';
    var lastSyncKey  = cfg.lastSyncKey  || 'telecom_last_sync';
    var cacheKey2    = cfg.cacheKey2    || 'telecom_data_cache_2';
    var lastSyncKey2 = cfg.lastSyncKey2 || 'telecom_last_sync_2';

    var recordCount = 0;
    try { var r1 = localStorage.getItem(cacheKey);  if (r1) recordCount  = JSON.parse(r1).length; } catch (e) {}

    var recordCount2 = 0;
    try { var r2 = localStorage.getItem(cacheKey2); if (r2) recordCount2 = JSON.parse(r2).length; } catch (e) {}

    var lastSync  = localStorage.getItem(lastSyncKey)  || '';
    var lastSync2 = localStorage.getItem(lastSyncKey2) || '';
    var syncDisplay  = lastSync  ? new Date(lastSync).toLocaleString()  : 'Never';
    var syncDisplay2 = lastSync2 ? new Date(lastSync2).toLocaleString() : 'Never';

    el.innerHTML =
      '<div class="section-header"><h2>⚙️ Admin Panel</h2><p class="section-sub">Hidden from normal users</p></div>' +

      // Card 1 — Invoicing Track
      '<div class="card admin-card">' +
        '<h3>Dropbox Configuration — Invoicing Track</h3>' +
        '<label class="field-label" for="admin-url-input">Dropbox File URL (dl=1 link)</label>' +
        '<input type="text" id="admin-url-input" class="text-input" placeholder="https://www.dropbox.com/…?dl=1" value="' + escHtml(currentUrl) + '">' +
        '<div class="admin-status">' +
          (currentUrl
            ? '<span class="badge badge-success">&#10003; Configured</span>'
            : '<span class="badge badge-danger">&#10007; Not configured</span>') +
        '</div>' +
        '<button id="admin-save-url" class="btn btn-primary" style="margin-top:0.75rem">Save URL</button>' +
        '<hr style="margin:1rem 0;border:none;border-top:1px solid var(--border)">' +
        '<p class="admin-hint">Share this URL with your team. They open it once and the app configures automatically on their device.</p>' +
        '<button id="admin-gen-url" class="btn btn-primary">Generate Config URL</button>' +
        '<div id="admin-cfg-output" style="display:none;margin-top:1rem">' +
          '<div class="copy-row">' +
            '<input type="text" id="admin-cfg-url" class="text-input" readonly>' +
            '<button id="admin-copy-url" class="btn btn-outline">Copy</button>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // Card 2 — BH Sites
      '<div class="card admin-card">' +
        '<h3>Dropbox Configuration — BH Sites</h3>' +
        '<label class="field-label" for="admin-url2-input">Dropbox File URL (dl=1 link)</label>' +
        '<input type="text" id="admin-url2-input" class="text-input" placeholder="https://www.dropbox.com/…?dl=1" value="' + escHtml(currentUrl2) + '">' +
        '<div class="admin-status">' +
          (currentUrl2
            ? '<span class="badge badge-success">&#10003; Configured</span>'
            : '<span class="badge badge-danger">&#10007; Not configured</span>') +
        '</div>' +
        '<button id="admin-save-url2" class="btn btn-primary" style="margin-top:0.75rem">Save URL</button>' +
        '<hr style="margin:1rem 0;border:none;border-top:1px solid var(--border)">' +
        '<p class="admin-hint">Share this URL with your team. They open it once and the app configures automatically on their device.</p>' +
        '<button id="admin-gen-url2" class="btn btn-primary">Generate Config URL</button>' +
        '<div id="admin-cfg-output2" style="display:none;margin-top:1rem">' +
          '<div class="copy-row">' +
            '<input type="text" id="admin-cfg-url2" class="text-input" readonly>' +
            '<button id="admin-copy-url2" class="btn btn-outline">Copy</button>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // Card 3 — Cache Management
      '<div class="card admin-card">' +
        '<h3>Cache Management</h3>' +
        '<p style="font-weight:600;margin-bottom:0.25rem">Invoicing Track</p>' +
        '<p style="margin:0 0 0.25rem">Records in cache: <strong>' + recordCount.toLocaleString() + '</strong></p>' +
        '<p style="margin:0 0 1rem">Last sync: <strong>' + escHtml(syncDisplay) + '</strong></p>' +
        '<p style="font-weight:600;margin-bottom:0.25rem">BH Sites</p>' +
        '<p style="margin:0 0 0.25rem">Records in cache: <strong>' + recordCount2.toLocaleString() + '</strong></p>' +
        '<p style="margin:0 0 1rem">Last sync: <strong>' + escHtml(syncDisplay2) + '</strong></p>' +
        '<div class="btn-row">' +
          '<button id="admin-clear-cache" class="btn btn-outline">Clear All Cache</button>' +
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

    // Invoicing Track — save
    document.getElementById('admin-save-url').addEventListener('click', function () {
      var url = document.getElementById('admin-url-input').value.trim();
      if (!url) { window.showToast('Please enter a URL.', 'error'); return; }
      localStorage.setItem('telecom_file_url', url);
      window.Config.refresh();
      window.showToast('Invoicing Track URL saved!', 'success');
      render();
    });

    // Invoicing Track — generate config URL
    document.getElementById('admin-gen-url').addEventListener('click', function () {
      var url = (window.Config && window.Config.fileUrl) || '';
      if (!url) { window.showToast('Save an Invoicing Track URL first.', 'error'); return; }
      var cfgUrl   = window.location.origin + window.location.pathname + '?cfg=' + btoa(url);
      var output   = document.getElementById('admin-cfg-output');
      output.style.display = 'block';
      document.getElementById('admin-cfg-url').value = cfgUrl;
    });

    document.getElementById('admin-copy-url').addEventListener('click', function () {
      var input = document.getElementById('admin-cfg-url');
      if (!input || !input.value) return;
      navigator.clipboard.writeText(input.value)
        .then(function () { window.showToast('Config URL copied!', 'success'); })
        .catch(function () { input.select(); document.execCommand('copy'); window.showToast('Copied!', 'success'); });
    });

    // BH Sites — save
    document.getElementById('admin-save-url2').addEventListener('click', function () {
      var url = document.getElementById('admin-url2-input').value.trim();
      if (!url) { window.showToast('Please enter a URL.', 'error'); return; }
      localStorage.setItem('telecom_file_url_2', url);
      window.Config.refresh();
      window.showToast('BH Sites URL saved!', 'success');
      render();
    });

    // BH Sites — generate config URL
    document.getElementById('admin-gen-url2').addEventListener('click', function () {
      var url = (window.Config && window.Config.fileUrl2) || '';
      if (!url) { window.showToast('Save a BH Sites URL first.', 'error'); return; }
      var cfgUrl   = window.location.origin + window.location.pathname + '?cfg2=' + btoa(url);
      var output   = document.getElementById('admin-cfg-output2');
      output.style.display = 'block';
      document.getElementById('admin-cfg-url2').value = cfgUrl;
    });

    document.getElementById('admin-copy-url2').addEventListener('click', function () {
      var input = document.getElementById('admin-cfg-url2');
      if (!input || !input.value) return;
      navigator.clipboard.writeText(input.value)
        .then(function () { window.showToast('BH Sites config URL copied!', 'success'); })
        .catch(function () { input.select(); document.execCommand('copy'); window.showToast('Copied!', 'success'); });
    });

    // Cache — clear all
    document.getElementById('admin-clear-cache').addEventListener('click', function () {
      localStorage.removeItem(cacheKey);
      localStorage.removeItem(lastSyncKey);
      localStorage.removeItem(cacheKey2);
      localStorage.removeItem(lastSyncKey2);
      window.AppData  = [];
      window.AppData2 = [];
      window.showToast('All cache cleared.', 'info');
      render();
    });

    document.getElementById('admin-force-sync').addEventListener('click', function () {
      var syncBtn = document.getElementById('sync-btn');
      if (syncBtn) syncBtn.click();
    });
  }

  return { render: render };

})();
