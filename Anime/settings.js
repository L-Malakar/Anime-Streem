/*!
 * settings.js — AnimeWave shared settings (single source of truth)
 * Owns every localStorage-backed preference used across pages:
 *   theme, nav-search visibility, notif position, random-button visibility, sidebar expanded.
 * Fires a single 'aw:settingchange' CustomEvent on window for every change,
 * so any page (current or future) can react without knowing about the others.
 *
 * Also owns live presence (Firebase Realtime Database), if the Firebase SDK
 * and a window.FIREBASE_CONFIG (from firebase-config.js) are loaded first.
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
  function navSearchDefault() { return true; }
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
  function getRandomBtn() { return readBool(RANDOM_KEY, true); }
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

  /* ---------- live presence (Firebase Realtime Database) ----------
     Requires, loaded BEFORE this file:
       <script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js"></script>
       <script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js"></script>
       <script src="firebase-config.js"></script>   (defines window.FIREBASE_CONFIG, gitignored)
     If any of those aren't present, presence silently no-ops. */
  var presenceListeners = [];
  var currentActiveCount = 0;

  function initPresence() {
    var cfg = global.FIREBASE_CONFIG;
    if (!cfg || !global.firebase || !global.firebase.database) return; // SDK/config not loaded on this page
    if (!global.firebase.apps || !global.firebase.apps.length) {
      global.firebase.initializeApp(cfg);
    }
    var db = global.firebase.database();
    var myId = 'u_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    var myRef = db.ref('presence/' + myId);

    db.ref('.info/connected').on('value', function (snap) {
      if (snap.val() === true) {
        myRef.onDisconnect().remove();
        myRef.set(true);
      }
    });

    db.ref('presence').on('value', function (snap) {
      var count = 0;
      snap.forEach(function (child) { if (child.val() === true) count++; });
      currentActiveCount = count;
      presenceListeners.forEach(function (fn) { fn(currentActiveCount); });
    });

    var BOT_COUNT = 30;
    var BOT_MIN_GAP_MS = 3000;
    var BOT_MAX_GAP_MS = 45000;
    var BOT_ONLINE_BIAS = 0.8; // chance a bot's next state is "online" (not a strict toggle)

    function randomGap() {
      // weighted toward shorter gaps, with occasional long pauses — less uniform/mechanical
      var r = Math.random();
      var skewed = r * r; // biases small values
      return BOT_MIN_GAP_MS + Math.floor(skewed * (BOT_MAX_GAP_MS - BOT_MIN_GAP_MS));
    }

    function nextState() {
      return Math.random() < BOT_ONLINE_BIAS;
    }

    var botTimers = [];
    var botsRunning = false;

    function stopBots() {
      botTimers.forEach(function (t) { clearTimeout(t); });
      botTimers = [];
      botsRunning = false;
    }

    function startBots() {
      if (botsRunning) return;
      botsRunning = true;
      for (var i = 0; i < BOT_COUNT; i++) {
        (function (id) {
          var state = nextState();
          db.ref('presence/bot_' + id).set(state).catch(function (err) {
            console.warn('bot seed failed:', err && err.message);
          });

          function flip() {
            if (!botsRunning) return;
            state = nextState(); // independent draw, not a strict toggle
            db.ref('presence/bot_' + id).set(state).catch(function (err) {
              console.warn('bot flip failed:', err && err.message);
            });
            botTimers.push(setTimeout(flip, randomGap()));
          }

          // stagger each bot's very first flip individually (not just its recurring gap)
          botTimers.push(setTimeout(flip, Math.floor(Math.random() * BOT_MAX_GAP_MS)));
        })(i);
      }
    }

    db.ref('presence').on('value', function (snap) {
      var realIds = [];
      snap.forEach(function (child) {
        if (child.key.indexOf('u_') === 0) realIds.push(child.key);
      });
      realIds.sort(); // timestamp-prefixed, so ascending = earliest joined first

      var iAmLeader = realIds.length > 0 && realIds[0] === myId;

      if (iAmLeader) {
        startBots();
      } else {
        stopBots();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', initPresence);
  if (document.readyState !== 'loading') initPresence();

  /* ---------- PWA install prompt (works across every page that loads this file) ---------- */
  var pwaDeferredPrompt = null;

  function isRunningInstalled() {
    var standaloneMedia = global.matchMedia && global.matchMedia('(display-mode: standalone)').matches;
    var iosStandalone = global.navigator && global.navigator.standalone === true; // iOS Safari "Add to Home Screen"
    return !!(standaloneMedia || iosStandalone);
  }

  function syncInstallButtons() {
    var installed = isRunningInstalled();
    var btns = document.querySelectorAll('.st-install-btn, #pwaInstallBtn');
    btns.forEach(function (btn) {
      btn.style.display = installed ? 'none' : '';
    });
  }

  global.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    pwaDeferredPrompt = e;
    syncInstallButtons();
  });

  global.addEventListener('appinstalled', function () {
    pwaDeferredPrompt = null;
    syncInstallButtons();
  });

  document.addEventListener('DOMContentLoaded', syncInstallButtons);
  if (document.readyState !== 'loading') syncInstallButtons();

  function pwaInstall() {
    if (isRunningInstalled()) return; // already installed, nothing to do
    if (pwaDeferredPrompt) {
      pwaDeferredPrompt.prompt();
      pwaDeferredPrompt.userChoice.finally(function () { pwaDeferredPrompt = null; syncInstallButtons(); });
      return;
    }
    var ua = navigator.userAgent || '';
    var isIOS = /iphone|ipad|ipod/i.test(ua);
    var msg = isIOS
      ? 'Tap the Share icon, then "Add to Home Screen"'
      : 'Use your browser menu → "Install app" / "Add to Home Screen"';
    if (typeof global.showToast === 'function') global.showToast(msg, 'info');
    else alert(msg);
  }
  global.pwaInstallClick = pwaInstall;

  var AWSettings = {
    isDesktop: isDesktop,
    on: function (fn) { global.addEventListener('aw:settingchange', fn); },
    off: function (fn) { global.removeEventListener('aw:settingchange', fn); },

    theme: { get: getTheme, set: setTheme },
    navSearch: { get: getNavSearch, set: setNavSearch, key: navSearchKey },
    notifPos: { get: getNotifPos, set: setNotifPos },
    randomBtn: { get: getRandomBtn, set: setRandomBtn },
    sidebar: { get: getSidebarExpanded, set: setSidebarExpanded },
    presence: {
      get: function () { return currentActiveCount; },
      onChange: function (fn) { presenceListeners.push(fn); if (currentActiveCount) fn(currentActiveCount); }
    }
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