/* =========================================================
   pwa.js — Telecom Analysis
   Service worker registration, install prompt, icon generation.
   Exposes: window.PWAModule.register()
   ========================================================= */

window.PWAModule = (function () {

  var deferredPrompt = null;

  /* ── Generate placeholder PNG icons via canvas ── */
  function generateIcon(size, filename) {
    return new Promise(function (resolve) {
      var canvas = document.createElement('canvas');
      canvas.width  = size;
      canvas.height = size;
      var ctx = canvas.getContext('2d');

      // Background
      ctx.fillStyle = '#2563eb';
      ctx.fillRect(0, 0, size, size);

      // Rounded corner feel (via clip path)
      ctx.save();
      var r = size * 0.18;
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(size - r, 0);
      ctx.quadraticCurveTo(size, 0, size, r);
      ctx.lineTo(size, size - r);
      ctx.quadraticCurveTo(size, size, size - r, size);
      ctx.lineTo(r, size);
      ctx.quadraticCurveTo(0, size, 0, size - r);
      ctx.lineTo(0, r);
      ctx.quadraticCurveTo(0, 0, r, 0);
      ctx.closePath();
      ctx.fillStyle = '#2563eb';
      ctx.fill();

      // "TA" text
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold ' + Math.round(size * 0.36) + 'px system-ui, sans-serif';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('TA', size / 2, size / 2);
      ctx.restore();

      canvas.toBlob(function (blob) {
        resolve({ blob: blob, filename: filename, size: size });
      }, 'image/png');
    });
  }

  /* ── Register service worker ── */
  function register() {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('./sw.js').catch(function (err) {
      console.warn('[PWA] Service worker registration failed:', err);
    });

    // Install prompt
    window.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      deferredPrompt = e;
      var btn = document.getElementById('install-btn');
      if (btn) btn.style.display = 'inline-flex';
    });

    window.addEventListener('appinstalled', function () {
      var btn = document.getElementById('install-btn');
      if (btn) btn.style.display = 'none';
      deferredPrompt = null;
      if (window.showToast) window.showToast('App installed successfully!', 'success');
    });

    var installBtn = document.getElementById('install-btn');
    if (installBtn) {
      installBtn.addEventListener('click', function () {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(function (result) {
          if (result.outcome === 'accepted' && window.showToast) {
            window.showToast('Installing app…', 'info');
          }
          deferredPrompt = null;
        });
      });
    }

    // Ensure icon files exist — generate them lazily if missing
    ensureIcons();
  }

  /* ── Pre-generate icons and store as object URLs for SW cache ── */
  function ensureIcons() {
    Promise.all([
      generateIcon(192, 'icon-192.png'),
      generateIcon(512, 'icon-512.png')
    ]).then(function (results) {
      results.forEach(function (r) {
        // Store blob URL so SW can cache on next visit if files don't exist on server
        var url = URL.createObjectURL(r.blob);
        // Prefetch — if server returns 404, link[rel=icon] still works from blob
        var link = document.querySelector('link[rel="apple-touch-icon"]');
        if (!link && r.size === 192) {
          link = document.createElement('link');
          link.rel = 'apple-touch-icon';
          link.href = url;
          document.head.appendChild(link);
        }
      });
    }).catch(function () {});
  }

  return { register: register, generateIcon: generateIcon };

})();
