/*!
 * adblocker.js
 * ------------------------------------------------------------------
 * Some video embed providers (e.g. ad-supported free streaming
 * servers) require popup/ad permissions to be enabled on the iframe
 * before they will play. By default every iframe on the site stays
 * locked down with a strict sandbox (no ads/popups can escape).
 *
 * This file lets you whitelist SPECIFIC domains that are known to
 * need the relaxed sandbox to function. For those domains only, the
 * user is asked for explicit permission first ("this source needs
 * ads/popups allowed to play — continue?"). If they say yes, the
 * sandbox is relaxed only for that iframe load. Every other domain
 * keeps the strict, ad-blocking sandbox as normal.
 * ------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  // Sandbox used for normal/trusted sources (ads & popups blocked)
  var STRICT_SANDBOX = 'allow-scripts allow-same-origin allow-forms';

  // Sandbox applied ONLY after the user agrees, for whitelisted domains
  var RELAXED_SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation allow-presentation';

  // Add any embed domain here that requires ads/popups to be allowed
  // in order to play. Match is done against the URL's hostname.
  var RESTRICTED_DOMAINS = [
    'abyssplayer.com',
    'gogoanime.me.uk',
    'vidtube.site'
  ];

  function getHostname(url) {
    try { return new URL(url, window.location.href).hostname.replace(/^www\./, ''); }
    catch (e) { return ''; }
  }

  function isRestricted(url) {
    var host = getHostname(url);
    if (!host) return false;
    return RESTRICTED_DOMAINS.some(function (d) { return host === d || host.endsWith('.' + d); });
  }

  var ALLOWED_KEY = 'aw_adblock_allowed';

  function getAllowedAnimeIds() {
    try {
      var raw = (typeof USDSS !== 'undefined') ? USDSS.getItem(ALLOWED_KEY) : localStorage.getItem(ALLOWED_KEY);
      var arr = JSON.parse(raw || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function isAnimeAllowed(animeId) {
    if (!animeId) return false;
    return getAllowedAnimeIds().indexOf(String(animeId)) !== -1;
  }

  function rememberAnimeAllowed(animeId) {
    if (!animeId) return;
    var list = getAllowedAnimeIds();
    var id = String(animeId);
    if (list.indexOf(id) === -1) {
      list.push(id);
      var value = JSON.stringify(list);
      try {
        if (typeof USDSS !== 'undefined') USDSS.setItem(ALLOWED_KEY, value);
        else localStorage.setItem(ALLOWED_KEY, value);
      } catch (e) {}
    }
  }

  /* ---------------------------------------------------------------
     Confirm modal (built once, reused for every prompt)
  --------------------------------------------------------------- */
  var modalEl = null;

  function ensureModal() {
    if (modalEl) return modalEl;

    var style = document.createElement('style');
    style.textContent =
      '.adb-backdrop{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.75);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;transition:opacity 0.25s ease}' +
      '.adb-backdrop.open{opacity:1;pointer-events:auto}' +
      '.adb-box{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:1rem;padding:2rem;max-width:420px;width:90%;text-align:center;transform:scale(0.9);transition:transform 0.25s ease;box-shadow:0 25px 60px rgba(0,0,0,0.5);font-family:inherit}' +
      '.adb-backdrop.open .adb-box{transform:scale(1)}' +
      '.adb-icon{width:56px;height:56px;border-radius:1rem;background:rgba(230,57,70,0.1);display:flex;align-items:center;justify-content:center;margin:0 auto 1rem;font-size:1.4rem;color:#e63946}' +
      '.adb-title{font-size:1.1rem;font-weight:700;color:#f5f5f5;margin-bottom:0.5rem}' +
      '.adb-text{font-size:0.875rem;color:#9a9a9a;line-height:1.6;margin-bottom:1.5rem}' +
      '.adb-btns{display:flex;gap:0.75rem;justify-content:center}' +
      '.adb-btn{padding:0.65rem 1.25rem;border-radius:0.5rem;font-size:0.875rem;font-weight:600;border:none;cursor:pointer;transition:opacity 0.15s}' +
      '.adb-btn:hover{opacity:0.85}' +
      '.adb-btn-no{background:#2a2a2a;color:#f5f5f5;border:1px solid #333}' +
      '.adb-btn-yes{background:#e63946;color:#fff}';
    document.head.appendChild(style);

    modalEl = document.createElement('div');
    modalEl.className = 'adb-backdrop';
    modalEl.innerHTML =
      '<div class="adb-box">' +
        '<div class="adb-icon">&#9888;</div>' +
        '<div class="adb-title">This source needs ads allowed</div>' +
        '<div class="adb-text">This video server requires disabling this player\'s ad-blocking protection (popups/ads) in order to play. Do you want to allow it just for this source and continue watching?</div>' +
        '<div class="adb-btns">' +
          '<button type="button" class="adb-btn adb-btn-no" data-adb="no">No, cancel</button>' +
          '<button type="button" class="adb-btn adb-btn-yes" data-adb="yes">Yes, allow &amp; play</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modalEl);
    return modalEl;
  }

  function askUser(callback) {
    var modal = ensureModal();
    modal.classList.add('open');

    function cleanup(result) {
      modal.classList.remove('open');
      modal.removeEventListener('click', onBackdropClick);
      yesBtn.removeEventListener('click', onYes);
      noBtn.removeEventListener('click', onNo);
      callback(result);
    }
    function onYes() { cleanup(true); }
    function onNo() { cleanup(false); }
    function onBackdropClick(e) { if (e.target === modal) cleanup(false); }

    var yesBtn = modal.querySelector('[data-adb="yes"]');
    var noBtn = modal.querySelector('[data-adb="no"]');
    yesBtn.addEventListener('click', onYes);
    noBtn.addEventListener('click', onNo);
    modal.addEventListener('click', onBackdropClick);
  }

  /* ---------------------------------------------------------------
     Public API
  --------------------------------------------------------------- */
  var AdBlocker = {};

  /**
   * Call this right before setting iframe.src.
   * - animeId: the current anime's id, used to remember the user's
   *   choice for every episode of this anime (persisted — survives
   *   reloads and future visits).
   * - onProceed(): called once it's safe to set iframe.src = url
   * - onCancel(): called if the user declines (for restricted domains)
   */
  AdBlocker.requestPlayback = function (iframe, url, animeId, onProceed, onCancel) {
    if (!isRestricted(url)) {
      iframe.setAttribute('sandbox', STRICT_SANDBOX);
      onProceed();
      return;
    }

    if (isAnimeAllowed(animeId)) {
      iframe.removeAttribute('sandbox');
      onProceed();
      return;
    }

    askUser(function (allowed) {
      if (allowed) {
        rememberAnimeAllowed(animeId);
        iframe.removeAttribute('sandbox'); // fully remove — some players detect the attribute's mere presence, not just its permissions
        onProceed();
      } else {
        iframe.setAttribute('sandbox', STRICT_SANDBOX);
        if (onCancel) onCancel();
      }
    });
  };

  AdBlocker.isRestricted = isRestricted;

  global.AdBlocker = AdBlocker;
})(window);
