/* =========================================================
   app.js — Telecom Analysis
   Main controller: cfg param, drawer, navigation, sync, toasts.
   ========================================================= */

(function () {
  'use strict';

  /* ── Global app data ── */
  window.AppData = [];

  /* ── All sections ── */
  var ALL_SECTIONS = ['dashboard', 'tasks', 'financials', 'admin'];
  var currentSection = 'dashboard';

  /* ── Admin reveal state ── */
  var logoClickCount = 0;
  var logoClickTimer = null;
  var adminRevealed  = false;

  /* ==========================================================
     Toast System
  ========================================================== */
  window.showToast = function (msg, type) {
    type = type || 'info';
    var container = document.getElementById('toast-container');
    if (!container) return;
    var toast = document.createElement('div');
    toast.className   = 'toast toast-' + type;
    toast.textContent = msg;
    container.appendChild(toast);
    // Trigger animation
    requestAnimationFrame(function () { toast.classList.add('show'); });
    setTimeout(function () {
      toast.classList.remove('show');
      setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 350);
    }, 3200);
  };

  /* ==========================================================
     Loading Overlay
  ========================================================== */
  window.showLoading = function () {
    var el = document.getElementById('loading-overlay');
    if (el) el.classList.remove('hidden');
  };

  window.hideLoading = function () {
    var el = document.getElementById('loading-overlay');
    if (el) el.classList.add('hidden');
  };

  /* ==========================================================
     Section Navigation
  ========================================================== */
  window.showSection = function (name) {
    if (ALL_SECTIONS.indexOf(name) === -1) return;
    currentSection = name;

    ALL_SECTIONS.forEach(function (s) {
      var sec = document.getElementById('section-' + s);
      if (sec) sec.classList.toggle('active', s === name);
    });

    document.querySelectorAll('.nav-item[data-section]').forEach(function (item) {
      item.classList.toggle('active', item.dataset.section === name);
    });

    renderSection(name);
  };

  function renderSection(name) {
    switch (name) {
      case 'dashboard':  window.Dashboard       && window.Dashboard.render();       break;
      case 'tasks':      window.TasksModule      && window.TasksModule.render();     break;
      case 'financials': window.FinancialsModule && window.FinancialsModule.render(); break;
      case 'admin':      window.AdminModule      && window.AdminModule.render();     break;
    }
  }

  window.renderAll = function () {
    renderSection(currentSection);
    var badge = document.getElementById('tasks-badge');
    if (badge && window.AppData && window.AppData.length) {
      badge.textContent = window.AppData.length.toLocaleString();
    } else if (badge) {
      badge.textContent = '';
    }
  };

  /* ==========================================================
     Connection Status & Sync Time
  ========================================================== */
  function updateConnectionStatus() {
    var dot    = document.querySelector('.status-dot');
    var text   = document.getElementById('status-text');
    var banner = document.getElementById('not-configured-banner');
    var configured = !!(window.Config && window.Config.fileUrl);

    if (dot)    dot.classList.toggle('connected', configured);
    if (text)   text.textContent = configured ? 'Configured' : 'Not configured';
    if (banner) banner.classList.toggle('hidden', configured);
  }

  function updateSyncTime() {
    var el = document.getElementById('last-sync-time');
    if (!el) return;
    var t = localStorage.getItem(window.Config.lastSyncKey);
    el.textContent = t ? 'Synced ' + new Date(t).toLocaleTimeString() : '';
  }

  /* ==========================================================
     Magic ?cfg= URL Handler
  ========================================================== */
  function handleConfigParam() {
    var params = new URLSearchParams(window.location.search);
    var cfg    = params.get('cfg');
    if (!cfg) return;

    try {
      var url = atob(cfg);
      if (!url) throw new Error('Empty URL');
      localStorage.setItem('telecom_file_url', url);
      window.Config.refresh();
      // Remove from URL — no history entry
      history.replaceState(null, '', window.location.pathname + window.location.hash);
      window.showToast('✅ App configured successfully! You can now Sync.', 'success');
      updateConnectionStatus();
    } catch (e) {
      window.showToast('Invalid configuration link.', 'error');
    }
  }

  /* ==========================================================
     Load Cached Data
  ========================================================== */
  function loadCache() {
    try {
      var raw = localStorage.getItem(window.Config.cacheKey);
      if (raw) {
        window.AppData = JSON.parse(raw);
        return true;
      }
    } catch (e) {}
    return false;
  }

  /* ==========================================================
     Drawer
  ========================================================== */
  function initDrawer() {
    var hamburger = document.getElementById('hamburger-btn');
    var overlay   = document.getElementById('drawer-overlay');
    var drawer    = document.getElementById('side-drawer');

    function openDrawer() {
      if (drawer) drawer.classList.add('open');
      if (overlay) overlay.classList.add('show');
    }

    function closeDrawer() {
      if (drawer) drawer.classList.remove('open');
      if (overlay) overlay.classList.remove('show');
    }

    if (hamburger) hamburger.addEventListener('click', openDrawer);
    if (overlay)   overlay.addEventListener('click',   closeDrawer);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeDrawer();
    });

    document.querySelectorAll('.nav-item[data-section]').forEach(function (item) {
      item.addEventListener('click', function (e) {
        e.preventDefault();
        window.showSection(item.dataset.section);
        closeDrawer();
      });
    });

    // 5-click logo → reveal admin
    var logo = document.getElementById('drawer-logo');
    if (logo) {
      logo.addEventListener('click', function () {
        logoClickCount++;
        clearTimeout(logoClickTimer);
        logoClickTimer = setTimeout(function () { logoClickCount = 0; }, 2000);
        if (logoClickCount >= 5 && !adminRevealed) {
          revealAdmin();
        }
      });
    }

    // #admin hash
    if (window.location.hash === '#admin') revealAdmin();
  }

  function revealAdmin() {
    adminRevealed = true;
    var nav = document.getElementById('admin-nav-item');
    if (nav) nav.classList.remove('hidden');
    window.showToast('Admin panel unlocked', 'info');
  }

  /* ==========================================================
     Sync Button
  ========================================================== */
  function initSync() {
    var btn = document.getElementById('sync-btn');
    if (!btn) return;

    btn.addEventListener('click', async function () {
      if (!window.Config || !window.Config.fileUrl) {
        window.showToast('App not configured. Contact your administrator.', 'error');
        return;
      }

      btn.disabled = true;
      btn.classList.add('spinning');
      window.showLoading();

      try {
        await window.DropboxModule.fetchFile();
        window.renderAll();
        updateSyncTime();
        window.showToast('Synced ' + window.AppData.length.toLocaleString() + ' tasks successfully!', 'success');
      } catch (err) {
        console.error('[TA Sync]', err);
        window.showToast('Sync failed: ' + (err.message || 'Network error'), 'error');
        // Fall back to cache if available
        if (!window.AppData.length) loadCache();
        if (window.AppData.length) {
          window.renderAll();
          window.showToast('Showing cached data.', 'info');
        }
      } finally {
        btn.disabled = false;
        btn.classList.remove('spinning');
        window.hideLoading();
      }
    });
  }

  /* ==========================================================
     Init
  ========================================================== */
  document.addEventListener('DOMContentLoaded', function () {
    handleConfigParam();
    loadCache();
    initDrawer();
    initSync();
    updateConnectionStatus();
    updateSyncTime();
    window.renderAll();
    if (window.PWAModule) window.PWAModule.register();
  });

})();
