/**
 * Play Uno — Download Handler
 * Reads DOWNLOAD_URL from config.js and triggers a direct file download.
 * Works with Dropbox (use ?dl=1), Google Drive direct links, or any direct URL.
 *
 * To set your download link:
 *   Open js/config.js and set DOWNLOAD_URL to your Dropbox link.
 *   Make sure the Dropbox link ends with ?dl=1 (not ?dl=0) for direct download.
 *   Example: "https://www.dropbox.com/s/YOURFILEID/PlayUno-Setup.exe?dl=1"
 */
(function () {
  'use strict';

  function getDownloadUrl() {
    var url = String(
      (window.PLAY_UNO_CONFIG && window.PLAY_UNO_CONFIG.DOWNLOAD_URL) || ''
    ).trim();
    return url;
  }

  function triggerDownload() {
    var url = getDownloadUrl();

    if (!url || url === '/download.php' || url.indexOf('YOUR') !== -1 || url === '') {
      // No URL configured yet — show a friendly message
      var msg = 'The download link is not configured yet. Please check back soon.';
      if (window.toast) { window.toast(msg); }
      else { alert(msg); }
      return;
    }

    // Ensure Dropbox links use dl=1 for direct download
    if (url.indexOf('dropbox.com') !== -1) {
      url = url.replace(/[?&]dl=0/gi, '').replace(/[?&]dl=1/gi, '');
      url += (url.indexOf('?') === -1 ? '?' : '&') + 'dl=1';
    }

    // Trigger download
    var a = document.createElement('a');
    a.href    = url;
    a.rel     = 'noopener noreferrer';
    // Try to set a filename (works for same-origin or Content-Disposition header)
    a.download = 'PlayUno-Setup.exe';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { document.body.removeChild(a); }, 500);
  }

  // Expose globally — both names so all pages can call it
  window.downloadDesktopGame         = triggerDownload;
  window.downloadDesktopGame_handler = triggerDownload;


  // Also bind any element with data-download="app" on DOMContentLoaded
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-download="app"]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        triggerDownload();
      });
    });
  });

})();
