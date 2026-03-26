/* =========================================================
   settings.js — Telecom Analysis
   Manages localStorage persistence for credentials & cache.
   ========================================================= */

window.SettingsModule = (function () {

  var KEYS = {
    token:      'ta_dropbox_token',
    filePath:   'ta_dropbox_path',
    lastSync:   'ta_last_sync',
    cachedData: 'ta_cached_data'
  };

  /* ── Public API ── */

  function load() {
    return {
      token:    localStorage.getItem(KEYS.token)    || '',
      filePath: localStorage.getItem(KEYS.filePath) || '',
      lastSync: localStorage.getItem(KEYS.lastSync) || null
    };
  }

  function save(token, filePath) {
    localStorage.setItem(KEYS.token,    token);
    localStorage.setItem(KEYS.filePath, filePath);
  }

  function setLastSync(isoString) {
    localStorage.setItem(KEYS.lastSync, isoString);
  }

  function getCachedData() {
    var raw = localStorage.getItem(KEYS.cachedData);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function setCachedData(data) {
    try {
      localStorage.setItem(KEYS.cachedData, JSON.stringify(data));
    } catch (e) {
      console.warn('[TA] Cache write failed (storage quota exceeded):', e);
    }
  }

  function clearCache() {
    localStorage.removeItem(KEYS.cachedData);
    localStorage.removeItem(KEYS.lastSync);
  }

  /* ── Render Settings Section ── */

  function render() {
    var s          = load();
    var cached     = getCachedData();
    var recordCount = cached ? cached.length : 0;
    var lastSyncStr = s.lastSync
      ? new Date(s.lastSync).toLocaleString()
      : 'Never';

    document.getElementById('settings-content').innerHTML =
      '<h2 class="section-title">Settings</h2>' +

      '<div class="info-box">' +
        '<strong>How to get a Dropbox Access Token</strong><br>' +
        'Visit <a href="https://www.dropbox.com/developers/apps" target="_blank" rel="noopener">' +
        'dropbox.com/developers/apps</a>, create an app, choose ' +
        '"Full Dropbox" access, then click <em>Generate Access Token</em>. ' +
        'Paste it below along with the full path to your .xlsm file.' +
      '</div>' +

      '<div class="settings-card">' +
        '<div class="settings-card-title">Dropbox Connection</div>' +

        '<div class="form-group">' +
          '<label class="form-label" for="ta-token">Dropbox Access Token</label>' +
          '<div class="input-wrapper">' +
            '<input type="password" id="ta-token" class="form-input with-toggle"' +
            '  placeholder="sl.Abcdef..." value="' + escHtml(s.token) + '">' +
            '<button class="toggle-password" onclick="SettingsModule.togglePwd()" title="Show / hide token">&#128065;</button>' +
          '</div>' +
          '<p class="form-hint">Stored locally in your browser only — never sent anywhere except Dropbox.</p>' +
        '</div>' +

        '<div class="form-group">' +
          '<label class="form-label" for="ta-path">Dropbox File Path</label>' +
          '<input type="text" id="ta-path" class="form-input"' +
          '  placeholder="/Reports/Total_Task_Tracking_New_2026.xlsm"' +
          '  value="' + escHtml(s.filePath) + '">' +
          '<p class="form-hint">Must start with / and include the filename with extension.</p>' +
        '</div>' +

        '<div class="form-buttons">' +
          '<button class="btn btn-primary" onclick="SettingsModule.saveSettings()">Save Settings</button>' +
          '<button class="btn btn-secondary" onclick="SettingsModule.testConnection()">Test Connection</button>' +
          '<button class="btn btn-danger" onclick="SettingsModule.clearCachePrompt()">Clear Cache</button>' +
        '</div>' +

        '<div class="settings-meta">' +
          '<div>Last sync: <strong id="s-last-sync">' + lastSyncStr + '</strong></div>' +
          '<div>Records in cache: <strong id="s-record-count">' + recordCount.toLocaleString() + '</strong></div>' +
        '</div>' +
      '</div>';
  }

  function togglePwd() {
    var inp = document.getElementById('ta-token');
    if (inp) inp.type = inp.type === 'password' ? 'text' : 'password';
  }

  function saveSettings() {
    var token    = (document.getElementById('ta-token')?.value || '').trim();
    var filePath = (document.getElementById('ta-path')?.value || '').trim();
    save(token, filePath);
    window.showToast && window.showToast('Settings saved!', 'success');
  }

  async function testConnection() {
    var s = load();
    if (!s.token) {
      window.showToast && window.showToast('Enter a Dropbox Access Token first.', 'error');
      return;
    }
    window.showToast && window.showToast('Testing connection…', 'info');
    try {
      var path = s.filePath || '/';
      var res = await fetch('https://api.dropboxapi.com/2/files/get_metadata', {
        method: 'POST',
        headers: {
          'Authorization':  'Bearer ' + s.token,
          'Content-Type':   'application/json'
        },
        body: JSON.stringify({ path: path })
      });

      if (res.ok) {
        var data = await res.json();
        document.getElementById('statusDot')  && document.getElementById('statusDot').classList.add('connected');
        document.getElementById('statusText') && (document.getElementById('statusText').textContent = 'Connected');
        window.showToast && window.showToast('Connection OK! File: ' + (data.name || path), 'success');
      } else {
        var err = {};
        try { err = await res.json(); } catch(e2) {}
        window.showToast && window.showToast('Failed: ' + (err.error_summary || 'HTTP ' + res.status), 'error');
      }
    } catch (e) {
      window.showToast && window.showToast('Network error: ' + e.message, 'error');
    }
  }

  function clearCachePrompt() {
    if (!confirm('Clear all cached data? You will need to Sync again to reload.')) return;
    clearCache();
    window.AppData = [];
    var badge = document.getElementById('taskBadge');
    if (badge) badge.textContent = '0';
    var dot  = document.getElementById('statusDot');
    var txt  = document.getElementById('statusText');
    var time = document.getElementById('syncTime');
    if (dot)  dot.classList.remove('connected');
    if (txt)  txt.textContent = 'Not Connected';
    if (time) time.textContent = '';
    render();
    window.showToast && window.showToast('Cache cleared.', 'info');
  }

  /* ── Helpers ── */

  function escHtml(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  return {
    load, save, setLastSync,
    getCachedData, setCachedData, clearCache,
    render, togglePwd, saveSettings, testConnection, clearCachePrompt
  };

})();
