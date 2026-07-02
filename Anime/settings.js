/*!
 * settings.js — AnimeWave shared settings (single source of truth)
 * Owns every localStorage-backed preference used across pages:
 *   theme, nav-search visibility, notif position, random-button visibility, sidebar expanded.
 * Fires a single 'aw:settingchange' CustomEvent on window for every change,
 * so any page (current or future) can react without knowing about the others.
 *
 * Load this BEFORE ui.js and before any page-specific script that reads settings.
 */
(function (global) {
  'use strict';

  function isDesktop() { return window.innerWidth >= 1024; }

  function readRaw(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function writeRaw(key, val) {
    try { localStorage.setItem(key, val); } catch (e) { /* storage unavailable, fail silently */ }
  }
  function readBool(key, def) {
    var v = readRaw(key);
    if (v === null) return def;
    return v === 'true';
  }

  function emit(key, value) {
    global.dispatchEvent(new CustomEvent('aw:settingchange', { detail: { key: key, value: value } }));
  }

  /* ---------- theme ---------- */
  var THEME_KEY = 'aw_theme';
  function getTheme() {
    var s = readRaw(THEME_KEY);
    return (s === 'light' || s === 'dark' || s === 'default') ? s : 'default';
  }
  function setTheme(t) {
    writeRaw(THEME_KEY, t);
    emit('theme', t);
  }

  /* ---------- nav search button (desktop vs mobile keys, like the original) ---------- */
  function navSearchKey() { return isDesktop() ? 'aw_nav_search_d' : 'aw_nav_search_m'; }
  function navSearchDefault() { return isDesktop() ? false : true; }
  function getNavSearch() { return readBool(navSearchKey(), navSearchDefault()); }
  function setNavSearch(show) {
    writeRaw(navSearchKey(), show ? 'true' : 'false');
    emit('navSearch', show);
  }

  /* ---------- notification icon position ---------- */
  var NOTIF_KEY = 'aw_notif_top';
  function getNotifPos() { return readBool(NOTIF_KEY, true); }
  function setNotifPos(onTop) {
    writeRaw(NOTIF_KEY, onTop ? 'true' : 'false');
    emit('notifPos', onTop);
  }

  /* ---------- random button shortcut ---------- */
  var RANDOM_KEY = 'aw_nav_random';
  function getRandomBtn() { return readBool(RANDOM_KEY, false); }
  function setRandomBtn(show) {
    if (show) writeRaw(RANDOM_KEY, 'true');
    else { try { localStorage.removeItem(RANDOM_KEY); } catch (e) {} }
    emit('randomBtn', show);
  }

  /* ---------- sidebar expanded ---------- */
  var SIDEBAR_KEY = 'aw_sb_expanded';
  function getSidebarExpanded() { return readBool(SIDEBAR_KEY, false); }
  function setSidebarExpanded(v) {
    writeRaw(SIDEBAR_KEY, v ? 'true' : 'false');
    emit('sidebar', v);
  }

  var AWSettings = {
    isDesktop: isDesktop,
    on: function (fn) { global.addEventListener('aw:settingchange', fn); },
    off: function (fn) { global.removeEventListener('aw:settingchange', fn); },

    theme: { get: getTheme, set: setTheme },
    navSearch: { get: getNavSearch, set: setNavSearch, key: navSearchKey },
    notifPos: { get: getNotifPos, set: setNotifPos },
    randomBtn: { get: getRandomBtn, set: setRandomBtn },
    sidebar: { get: getSidebarExpanded, set: setSidebarExpanded }
  };

  global.AWSettings = AWSettings;

  /* ---------- legacy global names kept intact ----------
     The existing HTML in index.html / notification.html / save.html calls these
     function names directly from onclick="" attributes. Keeping them means the
     markup does not need to change, only the <script> includes. */
  global.setTheme = function (t) { AWSettings.theme.set(t); };
  global.toggleNavSearch = function () { AWSettings.navSearch.set(!AWSettings.navSearch.get()); };
  global.toggleNotifPos = function () { AWSettings.notifPos.set(!AWSettings.notifPos.get()); };
  global.toggleSidebar = function () { AWSettings.sidebar.set(!AWSettings.sidebar.get()); };
  global.rKey = function () { return RANDOM_KEY; };
  global.isRandomAdded = function () { return AWSettings.randomBtn.get(); };

})(window);