/* net.js — front-end deterrents for AnimeWave
   -------------------------------------------------------------------------
   IMPORTANT / HONEST DISCLAIMER:
   This file does NOT provide real security. Anything running in a user's
   browser can be inspected, and all of the tricks below can be bypassed by:
     - Opening DevTools from the browser's own menu (not just F12)
     - Disabling JavaScript before the page loads
     - Using browser extensions or a proxy to view network/source
     - Opening view-source: or curl-ing the page directly
   Never rely on this to protect secrets, API keys, paid content, or user
   data — that must always be enforced on the server. This script only
   discourages the most casual attempts (right-click "view source",
   accidental F12, basic text copy) and is a UX/deterrent layer only.

   Side effects to be aware of before you ship this everywhere:
     - Disables right-click site-wide (context menu, "Save image as", etc.)
     - Disables text selection (can hurt users who want to copy a title,
       and can annoy screen-reader / accessibility tool users)
     - Blocks common keyboard shortcuts (F12, Ctrl+Shift+I/J/C, Ctrl+U)
     - Adds a devtools-open detector (heuristic, not 100% reliable, can
       false-positive on slow devices or when browser zoom is used)
   ------------------------------------------------------------------------- */

(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // Configuration — toggle features on/off without touching the logic below
  // ---------------------------------------------------------------------
  const NET_CONFIG = Object.assign({
    blockRightClick: true,
    blockTextSelection: true,
    blockKeyShortcuts: true,
    blockDevToolsKeys: true,
    detectDevToolsOpen: true,
    blockImageDrag: true,
    blockPrintScreen: false, // cannot truly block OS-level screenshots
    devtoolsMessage: 'Developer tools are disabled on this site.',
    onDevToolsDetected: null, // optional callback(){} — e.g. redirect, blur page
  }, window.NET_SECURITY_CONFIG || {});

  // ---------------------------------------------------------------------
  // 1. Block right-click / context menu
  // ---------------------------------------------------------------------
  if (NET_CONFIG.blockRightClick) {
    document.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });
  }

  // ---------------------------------------------------------------------
  // 2. Block text selection (CSS + JS belt-and-suspenders)
  // ---------------------------------------------------------------------
  if (NET_CONFIG.blockTextSelection) {
    const style = document.createElement('style');
    style.textContent = `
      * {
        -webkit-user-select: none !important;
        -moz-user-select: none !important;
        -ms-user-select: none !important;
        user-select: none !important;
      }
      input, textarea, [contenteditable="true"] {
        -webkit-user-select: text !important;
        -moz-user-select: text !important;
        -ms-user-select: text !important;
        user-select: text !important;
      }
    `;
    document.head.appendChild(style);

    document.addEventListener('selectstart', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag !== 'input' && tag !== 'textarea' && !e.target.isContentEditable) {
        e.preventDefault();
      }
    });
  }

  // ---------------------------------------------------------------------
  // 3. Block dragging images out of the page (a common way to "save" media)
  // ---------------------------------------------------------------------
  if (NET_CONFIG.blockImageDrag) {
    document.addEventListener('dragstart', (e) => {
      if ((e.target.tagName || '').toLowerCase() === 'img') {
        e.preventDefault();
      }
    });
  }

  // ---------------------------------------------------------------------
  // 4. Block common "view source" / devtools keyboard shortcuts
  // ---------------------------------------------------------------------
  if (NET_CONFIG.blockKeyShortcuts || NET_CONFIG.blockDevToolsKeys) {
    document.addEventListener('keydown', (e) => {
      const key = (e.key || '').toUpperCase();
      const ctrlOrCmd = e.ctrlKey || e.metaKey;

      // F12 — most browsers' devtools shortcut
      if (NET_CONFIG.blockDevToolsKeys && key === 'F12') {
        e.preventDefault();
        return;
      }

      // Ctrl/Cmd+Shift+I (inspector), +J (console), +C (element picker)
      if (
        NET_CONFIG.blockDevToolsKeys &&
        ctrlOrCmd && e.shiftKey && ['I', 'J', 'C'].includes(key)
      ) {
        e.preventDefault();
        return;
      }

      // Ctrl/Cmd+U — view page source
      if (NET_CONFIG.blockKeyShortcuts && ctrlOrCmd && key === 'U') {
        e.preventDefault();
        return;
      }

      // Ctrl/Cmd+S — save page
      if (NET_CONFIG.blockKeyShortcuts && ctrlOrCmd && key === 'S') {
        e.preventDefault();
        return;
      }

      // Ctrl/Cmd+P — print (only if you also set blockPrintScreen)
      if (NET_CONFIG.blockPrintScreen && ctrlOrCmd && key === 'P') {
        e.preventDefault();
        return;
      }
    });
  }

  // ---------------------------------------------------------------------
  // 5. Heuristic devtools-open detector
  //    NOTE: this is a best-effort guess, not a guarantee. It works by
  //    checking the gap between the outer and inner window dimensions
  //    (docked devtools shrink the viewport) — it can misfire on mobile,
  //    on ultra-wide monitors, or when the user simply resizes the window.
  // ---------------------------------------------------------------------
  if (NET_CONFIG.detectDevToolsOpen) {
    const threshold = 160;
    let warned = false;

    setInterval(() => {
      const widthGap = window.outerWidth - window.innerWidth > threshold;
      const heightGap = window.outerHeight - window.innerHeight > threshold;

      if ((widthGap || heightGap) && !warned) {
        warned = true;
        if (typeof NET_CONFIG.onDevToolsDetected === 'function') {
          NET_CONFIG.onDevToolsDetected();
        } else if (NET_CONFIG.devtoolsMessage) {
          console.log('%c' + NET_CONFIG.devtoolsMessage, 'color:red;font-size:16px;');
        }
      } else if (!widthGap && !heightGap) {
        warned = false;
      }
    }, 1000);
  }

  // ---------------------------------------------------------------------
  // Public API — lets a page override config after this script loads,
  // e.g. window.NET_SECURITY.disable('blockTextSelection')
  // ---------------------------------------------------------------------
  window.NET_SECURITY = {
    config: NET_CONFIG,
  };
})();