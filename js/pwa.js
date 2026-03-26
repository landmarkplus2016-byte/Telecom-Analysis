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

  /* ── Ensure icon link tags exist — use real file, fall back to canvas blob ── */
  function ensureIcons() {
    var icons = [
      { size: 192, src: 'assets/icon-192.png', rel: 'icon',             type: 'image/png' },
      { size: 512, src: 'assets/icon-512.png', rel: 'apple-touch-icon', type: null }
    ];

    icons.forEach(function (ic) {
      var img = new Image();
      img.onload = function () {
        /* Real file loaded — make sure the link tag points to it */
        var link = document.querySelector('link[rel="' + ic.rel + '"]');
        if (!link) {
          link = document.createElement('link');
          link.rel  = ic.rel;
          if (ic.type) link.type = ic.type;
          link.href = ic.src;
          document.head.appendChild(link);
        }
      };
      img.onerror = function () {
        /* Real file missing — generate canvas fallback */
        generateIcon(ic.size, ic.src).then(function (r) {
          var url  = URL.createObjectURL(r.blob);
          var link = document.querySelector('link[rel="' + ic.rel + '"]');
          if (!link) {
            link = document.createElement('link');
            link.rel  = ic.rel;
            if (ic.type) link.type = ic.type;
            document.head.appendChild(link);
          }
          link.href = url;
        });
      };
      img.src = ic.src + '?_=' + Date.now();
    });
  }

  return { register: register, generateIcon: generateIcon };

})();
