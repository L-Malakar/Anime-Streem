/*!
 * usdss.js — User Specific Data Save System
 * ------------------------------------------------------------------
 * A single, centralized, page-agnostic store for every piece of
 * per-user data on AnimeWave (saved list, watch history, watch
 * progress, notification read-state, sort/filter preferences, etc).
 *
 * WHY THIS EXISTS
 * Previously every page talked to localStorage directly with its own
 * copy-pasted get/set/try-catch logic. That meant the same key
 * ("aw_saved", "aw_history", ...) was read and written slightly
 * differently in different files, with no single source of truth.
 *
 * WHAT THIS DOES
 * - Stores data in cookies (so it's the single real source of truth
 *   and — unlike plain localStorage — is available anywhere the
 *   cookie is sent), while also mirroring every write into
 *   localStorage as a silent backup.
 * - Exposes the exact same method names as the native localStorage
 *   object (getItem / setItem / removeItem), so existing code needs
 *   nothing more than `localStorage.` -> `USDSS.` to switch over.
 * - On first use on a given browser, automatically migrates any
 *   pre-existing localStorage values for known AnimeWave keys into
 *   cookie storage, so no existing user's saved list, history, or
 *   settings are ever lost when this file is introduced.
 *
 * USAGE (identical to localStorage)
 *   USDSS.getItem('aw_saved')
 *   USDSS.setItem('aw_saved', JSON.stringify(arr))
 *   USDSS.removeItem('aw_prog_123')
 *
 * Optional JSON helpers are also provided:
 *   USDSS.getJSON('aw_saved', [])
 *   USDSS.setJSON('aw_saved', arr)
 * ------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  var COOKIE_DAYS = 365;

  /* ---------------------------------------------------------------
     Low-level cookie helpers
  --------------------------------------------------------------- */
  function setCookie(name, value, days) {
    try {
      var expires = '';
      if (days) {
        var date = new Date();
        date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
        expires = '; expires=' + date.toUTCString();
      }
      document.cookie = name + '=' + encodeURIComponent(value) + expires + '; path=/; SameSite=Lax';
    } catch (e) {
      console.warn('USDSS: cookie write failed for "' + name + '"', e);
    }
  }

  function getCookie(name) {
    try {
      var escaped = name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1');
      var match = document.cookie.match(new RegExp('(?:^|; )' + escaped + '=([^;]*)'));
      return match ? decodeURIComponent(match[1]) : null;
    } catch (e) {
      return null;
    }
  }

  function deleteCookie(name) {
    try {
      document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax';
    } catch (e) {}
  }

  /* ---------------------------------------------------------------
     Safe localStorage passthrough (used only as a silent backup
     mirror + as the source for one-time migration)
  --------------------------------------------------------------- */
  function safeLSGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function safeLSSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* storage unavailable/full — ignore */ }
  }
  function safeLSRemove(key) {
    try { localStorage.removeItem(key); } catch (e) {}
  }

  /* ---------------------------------------------------------------
     Core API — same shape as window.localStorage
  --------------------------------------------------------------- */
  var USDSS = {};

  USDSS.getItem = function (key) {
    var val = getCookie(key);
    if (val !== null) return val;

    // Nothing in cookie storage yet — fall back to (and migrate from)
    // any older localStorage-only value, so returning users never see
    // their saved/history/settings data disappear.
    var old = safeLSGet(key);
    if (old !== null) {
      setCookie(key, old, COOKIE_DAYS);
      return old;
    }
    return null;
  };

  USDSS.setItem = function (key, value) {
    setCookie(key, value, COOKIE_DAYS);
    safeLSSet(key, value); // keep mirrored backup in case cookies are ever cleared/blocked
  };

  USDSS.removeItem = function (key) {
    // Only clear the cookie copy. The original localStorage value is
    // intentionally left untouched as a permanent backup/history —
    // it must never be deleted, only ever copied from.
    deleteCookie(key);
  };

  /* ---------------------------------------------------------------
     Convenience JSON helpers (optional — plain get/setItem still work
     exactly like localStorage for code that manually JSON.parse/stringify)
  --------------------------------------------------------------- */
  USDSS.getJSON = function (key, fallback) {
    var raw = USDSS.getItem(key);
    if (raw === null) return fallback !== undefined ? fallback : null;
    try { return JSON.parse(raw); }
    catch (e) { return fallback !== undefined ? fallback : null; }
  };

  USDSS.setJSON = function (key, value) {
    USDSS.setItem(key, JSON.stringify(value));
  };

  /* ---------------------------------------------------------------
     One-time migration pass for every known AnimeWave key.
     Runs immediately on load so any page that includes usdss.js
     instantly has its existing data available under the new system —
     nothing the user previously saved is lost.

     Note: per-anime watch-progress keys are "aw_prog_<id>" (dynamic),
     so those are migrated lazily the first time USDSS.getItem() is
     called for that specific id (handled automatically above) rather
     than needing to be listed here individually.
  --------------------------------------------------------------- */
  var KNOWN_KEYS = [
    'aw_saved',
    'aw_history',
    'aw_notif_read',
    'aw_notif_times',
    'aw_sort',
    'aw_freshdrop_period',
    'aw_theme',
    'aw_sidebar_expanded',
    'aw_nav_search',
    'aw_notif_pos',
    'aw_random_btn'
  ];

  function migrateKnownKeys() {
    for (var i = 0; i < KNOWN_KEYS.length; i++) {
      var key = KNOWN_KEYS[i];
      if (getCookie(key) === null) {
        var old = safeLSGet(key);
        if (old !== null) setCookie(key, old, COOKIE_DAYS);
      }
    }
  }
  migrateKnownKeys();

  global.USDSS = USDSS;
})(window);
