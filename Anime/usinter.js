/* usinter.js — detects if the user is online, and if not, shows a
   full-screen "offline.png" overlay sized for the user's device,
   without covering the top bar, side bar, or bottom bar. */
(function (global) {
  "use strict";

  // ---- 1. Available pre-rendered offline image sizes ----
  // Keep sorted by width then height; findBestImage() picks the
  // smallest one that is >= the viewport in both dimensions,
  // falling back to the largest available if none is big enough.
  var OFFLINE_SIZES = [
    { w: 360,  h: 640  },
    { w: 390,  h: 844  },
    { w: 430,  h: 932  },
    { w: 768,  h: 1024 },
    { w: 810,  h: 1080 },
    { w: 1080, h: 810  },
    { w: 1640, h: 2360 },
    { w: 1366, h: 768  },
    { w: 1536, h: 864  },
    { w: 1920, h: 1080 },
    { w: 2560, h: 1440 },
    { w: 3440, h: 1440 },
    { w: 3840, h: 2160 },
    { w: 7680, h: 4320 }
  ];

  var OFFLINE_IMG_PATH = "images/offline_"; // + "{w}X{h}.png"
  var OVERLAY_ID = "awOfflineOverlay";
  var OVERLAY_IMG_ID = "awOfflineOverlayImg";

  // ---- 2. Pick the best-fit image for this device ----
  function findBestImage() {
    var vw = Math.round(global.innerWidth * (global.devicePixelRatio || 1));
    var vh = Math.round(global.innerHeight * (global.devicePixelRatio || 1));

    var best = null;
    var bestArea = Infinity;

    for (var i = 0; i < OFFLINE_SIZES.length; i++) {
      var s = OFFLINE_SIZES[i];
      if (s.w >= vw && s.h >= vh) {
        var area = s.w * s.h;
        if (area < bestArea) {
          bestArea = area;
          best = s;
        }
      }
    }

    // Nothing big enough (e.g. 8K+ display) — use the largest available.
    if (!best) {
      best = OFFLINE_SIZES[OFFLINE_SIZES.length - 1];
      for (var j = 0; j < OFFLINE_SIZES.length; j++) {
        if (OFFLINE_SIZES[j].w * OFFLINE_SIZES[j].h > best.w * best.h) {
          best = OFFLINE_SIZES[j];
        }
      }
    }
    return OFFLINE_IMG_PATH + best.w + "X" + best.h + ".png";
  }

  // ---- 3. Build / show / hide the overlay ----
  function ensureOverlay() {
    var overlay = document.getElementById(OVERLAY_ID);
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;

    var img = document.createElement("img");
    img.id = OVERLAY_IMG_ID;
    img.alt = "You are offline";

    overlay.appendChild(img);
    document.body.appendChild(overlay);
    return overlay;
  }

  function preventScrollKeys(e) {
    var keys = [32, 33, 34, 35, 36, 37, 38, 39, 40];
    if (keys.indexOf(e.keyCode) !== -1) e.preventDefault();
  }
  function preventScrollEvent(e) {
    e.preventDefault();
  }

  var lockedElements = [];

  function lockAllScrollableElements() {
    lockedElements = [];
    var all = document.querySelectorAll("*");
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.id === OVERLAY_ID) continue;
      var style = global.getComputedStyle(el);
      var overflowY = style.overflowY;
      var canScroll = (overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight;
      if (canScroll) {
        lockedElements.push({ el: el, prevOverflow: el.style.overflow, prevTouchAction: el.style.touchAction });
        el.style.overflow = "hidden";
        el.style.touchAction = "none";
      }
    }
  }

  function unlockAllScrollableElements() {
    for (var i = 0; i < lockedElements.length; i++) {
      lockedElements[i].el.style.overflow = lockedElements[i].prevOverflow;
      lockedElements[i].el.style.touchAction = lockedElements[i].prevTouchAction;
    }
    lockedElements = [];
  }

  function showOfflineOverlay() {
    var overlay = ensureOverlay();
    var img = document.getElementById(OVERLAY_IMG_ID);
    img.src = findBestImage();
    overlay.classList.add("active");
    document.documentElement.classList.add("aw-scroll-lock");
    document.body.classList.add("aw-scroll-lock");
    lockAllScrollableElements();
    document.addEventListener("wheel", preventScrollEvent, { passive: false, capture: true });
    document.addEventListener("touchmove", preventScrollEvent, { passive: false, capture: true });
    document.addEventListener("keydown", preventScrollKeys, true);
  }

  function hideOfflineOverlay() {
    var overlay = document.getElementById(OVERLAY_ID);
    if (overlay) overlay.classList.remove("active");
    document.documentElement.classList.remove("aw-scroll-lock");
    document.body.classList.remove("aw-scroll-lock");
    unlockAllScrollableElements();
    document.removeEventListener("wheel", preventScrollEvent, { capture: true });
    document.removeEventListener("touchmove", preventScrollEvent, { capture: true });
    document.removeEventListener("keydown", preventScrollKeys, true);
  }

  // ---- 4. Signal anime.html of the connectivity change ----
  function dispatchStatus(isOnline) {
    document.dispatchEvent(new CustomEvent("aw:connectivity", {
      detail: { online: isOnline }
    }));
  }

  function handleOnline() {
    dispatchStatus(true);
    hideOfflineOverlay();
  }

  function handleOffline() {
    dispatchStatus(false);
    showOfflineOverlay();
  }

  // ---- 5. Wire up listeners ----
  global.addEventListener("online", handleOnline);
  global.addEventListener("offline", handleOffline);

  // Re-pick image size if the viewport changes (rotation, resize, dev tools).
  var resizeTimer = null;
  global.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      var overlay = document.getElementById(OVERLAY_ID);
      if (overlay && overlay.classList.contains("active")) {
        document.getElementById(OVERLAY_IMG_ID).src = findBestImage();
      }
    }, 200);
  });

  // Precache the offline images via a Service Worker so they can still
  // load from cache when the device has zero network connectivity.
  function registerOfflineServiceWorker() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw-offline.js").catch(function (err) {
        console.warn("usinter.js: service worker registration failed", err);
      });
    }
  }

  // Initial check on load.
  document.addEventListener("DOMContentLoaded", function () {
    registerOfflineServiceWorker();
    if (navigator.onLine === false) {
      handleOffline();
    } else {
      dispatchStatus(true);
    }
  });

  // Expose for manual use / debugging.
  global.awOfflineOverlay = {
    show: showOfflineOverlay,
    hide: hideOfflineOverlay,
    findBestImage: findBestImage
  };
})(window);