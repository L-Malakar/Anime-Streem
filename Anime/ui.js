/*!
 * ui.js — AnimeWave shared UI behavior
 * Wires the identical chrome (sidebar, bottom nav, settings panel, topbar) that appears
 * on every page to AWSettings, so all pages stay visually and behaviorally in sync.
 *
 * Load AFTER settings.js. Existing pages keep their current markup (ids already match
 * across index.html / notification.html / save.html) — this file applies state and
 * handles the shared interactions instead of every page reimplementing them.
 *
 * NEW pages can call AWUI.renderTopbar(config) to generate the topbar from one config
 * object instead of hand-copying HTML (see "TOPBAR CONFIG" section below).
 */
(function (global, document) {
  'use strict';

  function $all(sel, root) { return (root || document).querySelectorAll(sel); }
  function toast(msg, type) {
    if (typeof global.showToast === 'function') global.showToast(msg, type);
  }

  var AWUI = {};

  /* ============================================================
     THEME
  ============================================================ */
  var THEME_ICONS = { default: 'fa-circle-half-stroke', light: 'fa-sun', dark: 'fa-moon' };
  var THEME_META = { default: '#0a0a0a', light: '#ffffff', dark: '#141414' };

  function applyTheme(t) {
    document.documentElement.classList.remove('light', 'dark');
    if (t === 'light' || t === 'dark') document.documentElement.classList.add(t);
    var icon = document.getElementById('themeIcon');
    if (icon) icon.innerHTML = '<i class="fas ' + THEME_ICONS[t] + '"></i>';
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', THEME_META[t]);
    var select = document.getElementById('themeSelect');
    if (select) select.value = t;
  }

  /* ============================================================
     NAV SEARCH toggle (desktop search shortcut / mobile search icon)
  ============================================================ */
  function applyNavSearch(show) {
    var toggle = document.getElementById('navSearchToggle');
    var btn = document.getElementById('mobileNavSearchBtn') || document.getElementById('mobileSearchOpenBtn');
    var sbBtn = document.querySelector('#sidebar .sb-btn[data-sb="search"]');
    if (toggle) toggle.classList.toggle('active', !!show);
    if (btn) btn.classList.toggle('hidden', !show);
    if (sbBtn) sbBtn.style.display = show ? '' : 'none';
  }

  /* ============================================================
     NOTIFICATION POSITION (top bar vs sidebar) — desktop only concept,
     forced to top bar on mobile, matching original behavior.
  ============================================================ */
  function applyNotifPos(onTop) {
    var navBtn = document.getElementById('notifBtn');
    var sbBtn = document.getElementById('sbNotifBtn');
    var toggle = document.getElementById('notifToggle');
    var item = document.getElementById('notifSettingsItem');

    if (!global.AWSettings.isDesktop()) {
      if (navBtn) navBtn.style.display = '';
      if (sbBtn) sbBtn.style.display = 'none';
      if (toggle) toggle.classList.add('active');
      if (item) item.style.display = 'none';
      return;
    }
    if (item) item.style.display = '';
    if (onTop) {
      if (navBtn) navBtn.style.display = '';
      if (sbBtn) sbBtn.style.display = 'none';
      if (toggle) toggle.classList.add('active');
    } else {
      if (navBtn) navBtn.style.display = 'none';
      if (sbBtn) sbBtn.style.display = '';
      if (toggle) toggle.classList.remove('active');
    }
  }

  /* ============================================================
     RANDOM BUTTON shortcut (mobile top bar + sidebar)
  ============================================================ */
  function applyRandomBtn(show) {
    var mobileBtn = document.getElementById('mobileRandomBtn');
    var sbBtn = document.querySelector('#sidebar .sb-btn[data-sb="random"]');
    if (mobileBtn) { mobileBtn.classList.toggle('hidden', !show); mobileBtn.style.display = show ? '' : 'none'; }
    if (sbBtn) sbBtn.style.display = show ? '' : 'none';
  }
  // legacy aliases some pages call directly
  global.showNavRandomBtn = function () { applyRandomBtn(true); };
  global.hideNavRandomBtn = function () { applyRandomBtn(false); };
  global.applyRandomBtn = applyRandomBtn;
  global.initNavRandomBtn = global.initRandomBtn = function () { applyRandomBtn(global.AWSettings.randomBtn.get()); };

  /* ============================================================
     RANDOM BUTTON long-press "add to shortcuts" confirm (settings panel)
  ============================================================ */
  var randomLPTimer = null;
  global.randomConfirming = false;
  function startRandomLongPress(e) {
    if (e.button !== 0) return;
    global.randomConfirming = false;
    var isAdded = global.AWSettings.randomBtn.get();
    randomLPTimer = setTimeout(function () {
      global.randomConfirming = true;
      var item = document.getElementById('randomSettingsItem');
      if (!item) return;
      item.classList.add('confirming', 'random-active');
      var confirmP = item.querySelector('.st-random-confirm p');
      if (confirmP) confirmP.textContent = isAdded ? 'Remove Shortcut?' : 'Add Shortcut?';
      var yesBtn = item.querySelector('.st-yes');
      if (yesBtn) yesBtn.onclick = function (ev) {
        ev.stopPropagation();
        hideRandomConfirm();
        if (isAdded) {
          global.AWSettings.randomBtn.set(false);
          toast('Random button removed', 'info');
        } else {
          global.AWSettings.randomBtn.set(true);
          toast('Random button added', 'success');
        }
      };
    }, 500);
  }
  function cancelRandomLongPress() { clearTimeout(randomLPTimer); }
  function hideRandomConfirm() {
    global.randomConfirming = false;
    var item = document.getElementById('randomSettingsItem');
    if (item) {
      item.classList.remove('confirming', 'random-active');
      var yesBtn = item.querySelector('.st-yes');
      if (yesBtn) delete yesBtn.dataset.clicked;
    }
  }
  global.startRandomLongPress = startRandomLongPress;
  global.cancelRandomLongPress = cancelRandomLongPress;
  global.hideRandomConfirm = hideRandomConfirm;

  /* ============================================================
     SIDEBAR expand/collapse toggle button
  ============================================================ */
  function applySidebarExpanded(v) {
    var sb = document.getElementById('sidebar');
    var btn = document.getElementById('sbToggle');
    if (sb) sb.classList.toggle('expanded', v);
    if (btn) btn.classList.toggle('active', v);
    document.body.classList.toggle('sb-expanded', v);
  }
  global.setSbActive = function (btn) {
    $all('.sb-btn').forEach(function (b) { b.classList.remove('active'); });
    if (btn) btn.classList.add('active');
  };

  /* ============================================================
     TOPBAR CONFIG (fully shared, adapts per page)
     config = {
       title: 'Notifications',                 // optional subtitle next to logo (desktop)
       search: { mode:'live'|'saved'|'none', id:'searchInput', placeholder:'Search animes...' },
       mobileSearchBtn: true|false,
       notifOnClick: 'notification'|'custom'    // 'custom' expects window.AW_onNotifClick defined
     }
     Existing pages keep their hand-written topbar markup (zero risk of visual
     regression); this exists so NEW pages can generate the identical topbar from one
     config object instead of copy-pasting HTML.
  ============================================================ */
  function renderTopbar(config) {
    config = config || {};
    var mount = document.getElementById('awTopbar');
    if (!mount) return;

    var searchHtml = '';
    if (config.search && config.search.mode !== 'none') {
      searchHtml =
        '<div class="' + (config.search.mode === 'saved' ? 'flex-1 max-w-lg mx-auto relative' : 'hidden lg:flex lg:flex-1 lg:max-w-xl lg:mx-auto relative') + '" id="searchWrap">' +
          '<i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-aw-muted text-sm z-10"></i>' +
          '<input id="' + (config.search.id || 'searchInput') + '" type="text" placeholder="' + (config.search.placeholder || 'Search animes...') + '" autocomplete="off" spellcheck="false" class="w-full bg-aw-bg2 border border-aw-border rounded-full pl-10 pr-16 py-2 text-sm text-aw-fg placeholder-aw-muted focus:outline-none focus:border-aw-accent focus:ring-1 focus:ring-aw-accent/30 transition-all">' +
          '<span id="searchHint" class="search-hint">/</span>' +
          '<button id="searchClear" class="search-clear" aria-label="Clear search"><i class="fas fa-xmark"></i></button>' +
          '<div id="searchDropdown" class="search-dropdown"></div>' +
        '</div>';
    }

    var titleHtml = config.title
      ? '<div class="ml-3 h-5 w-px bg-aw-border hidden sm:block"></div><span class="text-aw-muted text-sm hidden sm:block font-medium">' + config.title + '</span>'
      : '';

    var mobileBtnsHtml = config.mobileSearchBtn
      ? '<div id="mobileExtraBtns" class="shrink-0 items-center gap-1 lg:hidden">' +
          '<button id="mobileSearchOpenBtn" class="w-10 h-10 flex items-center justify-center rounded-full hover:bg-aw-bg2 transition-colors group" title="Search" onclick="openMobileSearch()"><i class="fas fa-magnifying-glass text-aw-muted text-lg group-hover:text-aw-accent transition-colors"></i></button>' +
          '<button id="mobileRandomBtn" class="w-10 h-10 flex items-center justify-center rounded-full hover:bg-aw-bg2 transition-colors group hidden" title="Random Anime" onclick="goRandom()"><i class="fas fa-dice text-aw-muted text-lg group-hover:text-aw-accent transition-colors"></i></button>' +
        '</div>'
      : '';

    var notifClick = config.notifOnClick === 'custom' ? 'AW_onNotifClick()' : "window.location.href='notification.html'";

    mount.innerHTML =
      '<nav class="fixed top-0 left-0 right-0 z-[1000] bg-aw-bg/80 backdrop-blur-xl border-b border-aw-border">' +
        '<div class="max-w-[1600px] mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">' +
          '<button id="sbToggle" class="-ml-1" title="Toggle sidebar (M)" aria-label="Toggle sidebar"><span></span><span></span><span></span></button>' +
          '<a href="index.html" class="flex items-center gap-2 shrink-0"><img src="logo.PNG" alt="AnimeWave" class="h-9 w-9 rounded-lg object-cover"><span class="font-display text-aw-fg text-lg">AnimeWave</span></a>' +
          titleHtml + searchHtml + mobileBtnsHtml +
          '<button id="notifBtn" onclick="' + notifClick + '" class="ml-auto shrink-0 w-10 h-10 flex items-center justify-center rounded-full hover:bg-aw-bg2 transition-colors group relative" title="Notifications (N)">' +
            '<i class="fas fa-bell text-aw-muted text-lg group-hover:text-aw-accent transition-colors"></i>' +
            '<span id="notifDot" class="hidden absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-aw-accent rounded-full text-white text-[9px] font-bold flex items-center justify-center leading-none" style="font-variant-numeric:tabular-nums"></span>' +
          '</button>' +
        '</div>' +
      '</nav>';

    wireSidebarToggleButton();
  }
  AWUI.renderTopbar = renderTopbar;

  /* ============================================================
     Sidebar toggle button + settings overlay open/close
  ============================================================ */
  function wireSidebarToggleButton() {
    var btn = document.getElementById('sbToggle');
    if (!btn || btn.dataset.awWired) return;
    btn.dataset.awWired = '1';
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      global.AWSettings.sidebar.set(!global.AWSettings.sidebar.get());
    });
  }

  var isClosingOverlay = false;
  function trapFocus(container) {
    var focusable = container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (!focusable.length) return;
    var first = focusable[0], last = focusable[focusable.length - 1];
    container.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
      else { if (document.activeElement === last) { e.preventDefault(); first.focus(); } }
    });
  }
  global.trapFocus = global.trapFocus || trapFocus;

  global.openSettings = function () {
    var overlay = document.getElementById('settingsOverlay');
    var backdrop = document.getElementById('settingsBackdrop');
    if (!overlay) return;
    overlay.classList.add('open');
    if (backdrop) backdrop.classList.add('show');
    document.body.style.overflow = 'hidden';
    $all('.mnav-btn').forEach(function (b) { b.classList.remove('active'); });
    history.pushState({ overlay: 'settings' }, '');
    trapFocus(overlay);
  };
  global.closeSettings = function () {
    if (isClosingOverlay) return;
    isClosingOverlay = true;
    var overlay = document.getElementById('settingsOverlay');
    var backdrop = document.getElementById('settingsBackdrop');
    try {
      if (overlay) overlay.classList.remove('open');
      if (backdrop) backdrop.classList.remove('show');
      document.body.style.overflow = '';
      $all('.st-item.confirming').forEach(function (i) { i.classList.remove('confirming'); });
      history.back();
    } finally {
      setTimeout(function () {
        $all('.mnav-btn').forEach(function (b, i) { b.classList.toggle('active', i === 0); });
        isClosingOverlay = false;
      }, 350);
    }
  };

  /* generalized back-button handling for the settings overlay (shared across pages) */
  global.addEventListener('popstate', function () {
    if (isClosingOverlay) return;
    var st = document.getElementById('settingsOverlay');
    if (st && st.classList.contains('open')) {
      st.classList.remove('open');
      document.body.style.overflow = '';
      var backdrop = document.getElementById('settingsBackdrop');
      if (backdrop) backdrop.classList.remove('show');
      $all('.st-item.confirming').forEach(function (i) { i.classList.remove('confirming'); });
      $all('.mnav-btn').forEach(function (b, i) { b.classList.toggle('active', i === 0); });
    }
  });

  /* ============================================================
     Apply settings to the DOM (initial load + on every change)
  ============================================================ */
  function applyAll() {
    applyTheme(global.AWSettings.theme.get());
    applyNavSearch(global.AWSettings.navSearch.get());
    applyNotifPos(global.AWSettings.notifPos.get());
    applyRandomBtn(global.AWSettings.randomBtn.get());
    applySidebarExpanded(global.AWSettings.sidebar.get());
  }

  global.addEventListener('aw:settingchange', function (e) {
    switch (e.detail.key) {
      case 'theme': applyTheme(e.detail.value); break;
      case 'navSearch': applyNavSearch(e.detail.value); break;
      case 'notifPos': applyNotifPos(e.detail.value); break;
      case 'randomBtn': applyRandomBtn(e.detail.value); break;
      case 'sidebar': applySidebarExpanded(e.detail.value); break;
    }
  });

  global.addEventListener('resize', function () { applyNotifPos(global.AWSettings.notifPos.get()); });

  document.addEventListener('DOMContentLoaded', function () {
    wireSidebarToggleButton();
    applyAll();
    var backdrop = document.getElementById('settingsBackdrop');
    if (backdrop && !backdrop.dataset.awWired) {
      backdrop.dataset.awWired = '1';
      backdrop.addEventListener('click', function () { global.closeSettings(); });
    }
  });

  global.AWUI = AWUI;

})(window, document);