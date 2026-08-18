/* share.js — modern share helper for AnimeWave
   -------------------------------------------------------------------------
   Builds a nicely formatted share message and uses the native Web Share
   API (mobile) with a rich, accessible fallback menu (desktop).

   v2.0 — hardened rewrite:
     • XSS-safe rendering (no raw HTML interpolation of user data)
     • Real focus trap + full keyboard support (Tab/Shift+Tab/Esc/Enter)
     • Restores focus to the trigger element on close
     • Clipboard fallback works in more browsers, cleans up listeners
     • No global CSS id collisions, no memory leaks (listeners removed)
     • Configurable via window.AW_SHARE_CONFIG (brand name, extra targets…)
     • More share targets (Facebook, LinkedIn, SMS) behind config flags
     • Defensive coding: never throws on malformed anime objects
     • Works as a plain script (window.shareAnimeModern) — same public API
       as before, so nothing else in AnimeWave needs to change.
   ------------------------------------------------------------------------- */

(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // Configuration (override before this script loads, e.g.:
  //   <script>window.AW_SHARE_CONFIG = { brand: 'AnimeWave', targets: [...] };</script>
  // ---------------------------------------------------------------------
  const DEFAULT_CONFIG = {
    brand: 'AnimeWave',
    // Visible text shown in the shared message itself (e.g. "on 🌐 animewave.web.app").
    // Because this is a real URL written as plain text, WhatsApp/SMS/Telegram/etc.
    // auto-detect and auto-link it on the recipient's end — this is the only
    // way to get a genuinely tappable link into those plain-text channels.
    siteLabel: '🌐 animewave.web.app',
    // Destination when the brand text is clicked inside the in-app share
    // PREVIEW popup (real HTML, rendered locally before sending/copying).
    brandUrl: 'https://animewave.web.app',
    synopsisMaxLength: 180,
    // Order controls the order the icons render in the grid.
    targets: ['copy', 'whatsapp', 'instagram', 'telegram', 'twitter', 'reddit', 'facebook', 'linkedin', 'sms', 'email'],
    // If true, always show the custom app/site menu below — even on mobile —
    // instead of handing off to the OS's native share sheet. Set this to
    // false if you want native-share-first behavior back.
    forceCustomMenu: true,
    // On touch devices, add a "More" tile that opens the native OS share
    // sheet (covers apps not in `targets`, e.g. Instagram, AirDrop, Notes).
    showNativeMoreOnTouch: true,
  };

  /** True for phones/tablets (coarse pointer, no hover) — used to switch
   *  between a mobile bottom-sheet and a desktop centered dialog. */
  function isTouchDevice() {
    return window.matchMedia
      ? window.matchMedia('(pointer: coarse)').matches
      : ('ontouchstart' in window);
  }

  const CONFIG = Object.assign({}, DEFAULT_CONFIG, window.AW_SHARE_CONFIG || {});

  // ---------------------------------------------------------------------
  // Small utilities
  // ---------------------------------------------------------------------

  /** Escapes text for safe insertion into HTML (prevents XSS). */
  function escapeHTML(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[ch]));
  }

  function stateLabel(state) {
    const s = (state || '').toLowerCase();
    if (s === 'watched') return 'Available';
    if (s === 'watching' || s === 'running' || s === 'ongoing') return 'Running';
    if (s === 'planned' || s === 'upcoming' || s === 'plan_to_watch' || s === 'plan') return 'Coming Soon';
    return 'Unknown';
  }

  function truncate(text, max) {
    if (!text || typeof text !== 'string') return 'No synopsis available.';
    const trimmed = text.trim();
    if (!trimmed) return 'No synopsis available.';
    return trimmed.length > max ? trimmed.slice(0, max).trim() + '…' : trimmed;
  }

  function safeRating(rating) {
    const n = Number(rating);
    if (!rating || Number.isNaN(n)) return 'Not rated';
    // Clamp to a sane 0–10 range so garbage input can't produce odd text.
    const clamped = Math.min(10, Math.max(0, n));
    return `${clamped} / 10`;
  }

  // ---------------------------------------------------------------------
  // Message building
  // ---------------------------------------------------------------------

  /** Small status → emoji dot, purely cosmetic. */
  function stateEmoji(label) {
    if (label === 'Running') return '🟢';
    if (label === 'Coming Soon') return '🟡';
    if (label === 'Available') return '✅';
    return '⚪';
  }

  /** Star rating out of 10 → visual 5-star row (e.g. 8.6/10 → ★★★★☆). */
  function starBar(rating) {
    const n = Number(rating);
    if (!rating || Number.isNaN(n)) return null;
    const stars = Math.max(0, Math.min(5, Math.round(n / 2)));
    return '★'.repeat(stars) + '☆'.repeat(5 - stars);
  }

  /**
   * Builds a polished, human-readable share body suitable for chat apps,
   * e.g.:
   *
   *   🎬 Attack on Titan — AnimeWave
   *   ★★★★★ 9.2/10 · 🟢 Running
   *
   *   Eren Yeager vows to eliminate every last Titan after they bring…
   *
   *   👉 Watch now: https://example.com/anime/123
   */
  function buildShareText(a, url, context) {
    a = a || {};
    context = context || {};
    const title = (a.name && String(a.name).trim()) || 'Untitled Anime';
    const rating = safeRating(a.rating);
    const stars = starBar(a.rating);
    const current = stateLabel(a.state);
    const about = truncate(a.review, CONFIG.synopsisMaxLength);
    const safeUrl = typeof url === 'string' && url ? url : (typeof window !== 'undefined' ? window.location.href : '');

    const ratingLine = stars
      ? `${stars}  ${rating}  ·  ${stateEmoji(current)} ${current}`
      : `${stateEmoji(current)} ${current}`;

    // "watch" variant — shared from the watch/player page. Leads with an
    // invite ("I am watching…") and surfaces the viewer's current
    // season/episode instead of a synopsis.
    if (context.variant === 'watch') {
      const season = context.season;
      const episode = context.episode;
      const progressLine = (season != null && episode != null)
        ? `Currently I am in Season ${season} · Episode ${episode} — want to catch up with me?`
        : `Want to catch up with me?`;

      return [
        `I am watching "🎬 ${title}" on ${CONFIG.siteLabel}`,
        ratingLine,
        '',
        progressLine,
        '',
        `👉 Start now: ${safeUrl}`,
      ].join('\n');
    }

    // Default "detail" variant — shared from the anime info page.
    return [
      `🎬 ${title} — ${CONFIG.siteLabel}`,
      ratingLine,
      '',
      about,
      '',
      `👉 Watch now: ${safeUrl}`,
    ].join('\n');
  }

  function buildShareTitle(a) {
    const name = (a && a.name && String(a.name).trim()) || 'Anime';
    return `${name} — ${CONFIG.brand}`;
  }

  // ---------------------------------------------------------------------
  // Clipboard
  // ---------------------------------------------------------------------

  async function copyToClipboard(text) {
    // Modern async clipboard API (requires secure context).
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (err) {
        // fall through to legacy method below
      }
    }
    // Legacy fallback for older/insecure contexts.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.left = '0';
    ta.style.opacity = '0';
    ta.style.pointerEvents = 'none';
    document.body.appendChild(ta);
    const previouslyFocused = document.activeElement;
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (e) {
      ok = false;
    }
    document.body.removeChild(ta);
    if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
      previouslyFocused.focus();
    }
    return ok;
  }

  function openWindow(url) {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // ---------------------------------------------------------------------
  // Social share links
  // ---------------------------------------------------------------------

  function buildSocialLinks(text, url, title) {
    const encodedText = encodeURIComponent(text);
    const encodedUrl = encodeURIComponent(url);
    const encodedTitle = encodeURIComponent(title);
    // Strip whichever closing "👉 ...: <url>" line is present (varies by
    // page/variant) rather than a hardcoded label, so Telegram still gets a
    // clean caption + separate url field either way.
    const textWithoutLink = encodeURIComponent(
      text.split('\n').filter((line) => !line.includes(url)).join('\n').trim()
    );

    return {
      whatsapp: `https://wa.me/?text=${encodedText}`,
      telegram: `https://t.me/share/url?url=${encodedUrl}&text=${textWithoutLink}`,
      twitter: `https://twitter.com/intent/tweet?text=${encodedText}`,
      reddit: `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedTitle}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      sms: `sms:?&body=${encodedText}`,
      email: `mailto:?subject=${encodedTitle}&body=${encodedText}`,
    };
  }

  const TARGET_META = {
    copy: { icon: 'fas fa-copy', label: 'Copy' },
    whatsapp: { icon: 'fab fa-whatsapp', label: 'WhatsApp' },
    instagram: { icon: 'fab fa-instagram', label: 'Instagram' },
    telegram: { icon: 'fab fa-telegram', label: 'Telegram' },
    twitter: { icon: 'fab fa-x-twitter', label: 'X' },
    reddit: { icon: 'fab fa-reddit', label: 'Reddit' },
    facebook: { icon: 'fab fa-facebook', label: 'Facebook' },
    linkedin: { icon: 'fab fa-linkedin', label: 'LinkedIn' },
    sms: { icon: 'fas fa-comment-sms', label: 'SMS' },
    email: { icon: 'fas fa-envelope', label: 'Email' },
  };

  // ---------------------------------------------------------------------
  // Styles (injected once)
  // ---------------------------------------------------------------------

  function injectShareMenuStyles() {
    if (document.getElementById('aw-share-menu-styles')) return;
    const style = document.createElement('style');
    style.id = 'aw-share-menu-styles';
    style.textContent = `
      .aw-share-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.4);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);z-index:9998;display:flex;align-items:flex-end;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','SF Pro Display','Outfit',sans-serif}
      @media(min-width:640px){.aw-share-backdrop{align-items:center}}
      .aw-share-sheet{background:rgba(28,28,30,.82);backdrop-filter:blur(30px) saturate(1.6);-webkit-backdrop-filter:blur(30px) saturate(1.6);border:0.5px solid rgba(255,255,255,.12);border-radius:20px 20px 0 0;padding:1.25rem;width:100%;max-width:420px;box-shadow:0 -8px 40px rgba(0,0,0,.45);animation:awShareUp .42s cubic-bezier(0.32,0.72,0,1)}
      @media(min-width:640px){.aw-share-sheet{border-radius:20px;margin-bottom:2rem}}
      @keyframes awShareUp{from{transform:translateY(100%);opacity:0.4}to{transform:translateY(0);opacity:1}}
      .aw-share-handle{width:36px;height:5px;border-radius:3px;background:rgba(255,255,255,.28);margin:0 auto 1rem;cursor:grab}
      .aw-share-title-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:.9rem}
      .aw-share-title{color:#f5f5f7;font-weight:600;font-size:1.05rem;letter-spacing:-0.01em}
      .aw-share-x{display:none;background:rgba(118,118,128,.24);border:none;color:#f5f5f7;cursor:pointer;font-size:.75rem;line-height:1;width:26px;height:26px;border-radius:50%;align-items:center;justify-content:center}
      .aw-share-x:hover,.aw-share-x:focus-visible{background:rgba(118,118,128,.4)}
      .aw-share-preview{background:rgba(118,118,128,.16);border:0.5px solid rgba(255,255,255,.1);border-radius:14px;padding:.9rem 1rem;font-size:.8rem;line-height:1.55;color:rgba(235,235,245,.72);white-space:pre-wrap;margin-bottom:1rem;max-height:140px;overflow-y:auto;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',sans-serif}
      .aw-share-linkrow{display:flex;align-items:center;gap:.5rem;background:rgba(118,118,128,.24);border:0.5px solid rgba(255,255,255,.1);border-radius:980px;padding:.4rem .4rem .4rem 1rem;margin-bottom:1rem}
      .aw-share-linktext{flex:1;min-width:0;color:rgba(235,235,245,.6);font-size:.78rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .aw-share-copybtn{flex-shrink:0;background:#0a84ff;color:#fff;border:none;border-radius:980px;padding:.5rem 1.1rem;font-weight:590;font-size:.78rem;cursor:pointer;transition:opacity .15s}
      .aw-share-copybtn:hover,.aw-share-copybtn:focus-visible{opacity:.85}
      .aw-share-copybtn:active{transform:scale(0.96)}
      .aw-share-copybtn.aw-copied{background:#30d158}
      .aw-share-card{display:flex;align-items:center;gap:.8rem;background:rgba(118,118,128,.16);border:0.5px solid rgba(255,255,255,.1);border-radius:14px;padding:.7rem .8rem;margin-bottom:.9rem}
      .aw-share-card-img{width:46px;height:62px;object-fit:cover;border-radius:8px;flex-shrink:0;background:rgba(255,255,255,.08);box-shadow:0 2px 8px rgba(0,0,0,.35)}
      .aw-share-card-meta{min-width:0}
      .aw-share-card-title{color:#f5f5f7;font-weight:590;font-size:.9rem;letter-spacing:-0.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .aw-share-card-sub{color:rgba(235,235,245,.5);font-size:.75rem;margin-top:.2rem}
      .aw-share-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:.9rem 0;margin-bottom:.75rem}
      .aw-share-item{position:relative;display:flex;flex-direction:column;align-items:center;gap:.45rem;background:transparent;border:none;border-radius:12px;padding:.2rem;cursor:pointer;color:rgba(235,235,245,.82);font-size:.7rem;font-weight:400;letter-spacing:-0.01em;transition:transform .15s cubic-bezier(0.32,0.72,0,1),opacity .15s}
      .aw-share-item:active{transform:scale(0.92);opacity:0.7}
      .aw-share-item:focus-visible{outline:2px solid #0a84ff;outline-offset:2px;border-radius:16px}
      .aw-share-item i{font-size:1.3rem;width:52px;height:52px;display:flex;align-items:center;justify-content:center;border-radius:50%;color:#fff;box-shadow:inset 0 0 0 0.5px rgba(255,255,255,.15)}
      .aw-share-item i.fa-whatsapp{background:#25D366}
      .aw-share-item i.fa-instagram{background:radial-gradient(circle at 30% 110%,#fdf497 0%,#fdf497 5%,#fd5949 45%,#d6249f 60%,#285AEB 90%)}
      .aw-share-item i.fa-telegram{background:#229ED9}
      .aw-share-item i.fa-x-twitter{background:#000;box-shadow:inset 0 0 0 1px rgba(255,255,255,.25)}
      .aw-share-item i.fa-reddit{background:#FF4500}
      .aw-share-item i.fa-facebook{background:#1877F2}
      .aw-share-item i.fa-linkedin{background:#0A66C2}
      .aw-share-item i.fa-comment-sms{background:#34C759}
      .aw-share-item i.fa-envelope{background:linear-gradient(180deg,#6ec1ff,#0a84ff)}
      .aw-share-item i.fa-copy{background:#8e8e93}
      .aw-share-item i.fa-ellipsis{background:#8e8e93}
      .aw-share-item .aw-share-key{position:absolute;top:-2px;right:2px;font-size:.58rem;color:#6a6a6a;display:none}
      .aw-share-close{width:100%;text-align:center;padding:.85rem;border-radius:14px;background:rgba(118,118,128,.24);color:#0a84ff;font-weight:590;font-size:.95rem;cursor:pointer;border:none;margin-top:.25rem;transition:opacity .15s}
      .aw-share-close:hover,.aw-share-close:focus-visible{opacity:.75}
      .aw-share-close:active{transform:scale(0.98)}

      /* ---------- Mobile sheet: drag handle, no desktop chrome ---------- */
      .aw-share-backdrop:not(.aw-share-backdrop--popover) .aw-share-x{display:none}

      /* Desktop popover variant: compact card anchored to the trigger button
         instead of a full-width mobile-style bottom sheet. */
      .aw-share-backdrop--popover{background:transparent;backdrop-filter:none;align-items:flex-start;justify-content:flex-start}
      .aw-share-backdrop--popover .aw-share-sheet{
        max-width:300px;border-radius:16px;padding:1rem;
        background:rgba(40,40,42,.78);backdrop-filter:blur(30px) saturate(1.8);-webkit-backdrop-filter:blur(30px) saturate(1.8);
        box-shadow:0 12px 32px rgba(0,0,0,.45),0 0 0 0.5px rgba(255,255,255,.1);
        animation:awSharePop .22s cubic-bezier(0.32,0.72,0,1);
      }
      .aw-share-backdrop--popover .aw-share-handle{display:none}
      .aw-share-backdrop--popover .aw-share-x{display:flex}
      .aw-share-backdrop--popover .aw-share-close{display:none}
      .aw-share-backdrop--popover .aw-share-grid{grid-template-columns:repeat(4,1fr);gap:.5rem}
      .aw-share-backdrop--popover .aw-share-item{padding:.55rem .3rem;font-size:.65rem}
      .aw-share-backdrop--popover .aw-share-item .aw-share-key{display:block}
      @keyframes awSharePop{from{transform:translateY(-6px) scale(.97);opacity:0}to{transform:translateY(0) scale(1);opacity:1}}
    `;
    document.head.appendChild(style);
  }

  // ---------------------------------------------------------------------
  // Device detection — decides which layout feels native on this device.
  // Desktop (mouse/trackpad, wide viewport) gets a small anchored popover,
  // like GitHub/Twitter/LinkedIn share menus. Touch/mobile gets a full-width
  // bottom sheet, like a native app share tray.
  // ---------------------------------------------------------------------
  function isDesktopLayout() {
    const wideEnough = window.matchMedia('(min-width: 768px)').matches;
    const finePointer = window.matchMedia('(pointer: fine)').matches;
    return wideEnough && finePointer;
  }

  // ---------------------------------------------------------------------
  // Share menu (accessible modal)
  // ---------------------------------------------------------------------

  /**
   * Renders the preview text as HTML with the brand name turned into a real
   * clickable link (this popup is genuine HTML, unlike the plain-text
   * message that actually gets sent). Only the first occurrence is linked;
   * everything else is safely escaped as plain text.
   */
  function linkifyBrandInPreview(text) {
    const escapedText = escapeHTML(text);
    if (!CONFIG.brandUrl || !CONFIG.siteLabel) return escapedText;
    const escapedSite = escapeHTML(CONFIG.siteLabel);
    const idx = escapedText.indexOf(escapedSite);
    if (idx === -1) return escapedText;
    const before = escapedText.slice(0, idx);
    const after = escapedText.slice(idx + escapedSite.length);
    const href = escapeHTML(CONFIG.brandUrl);
    return `${before}<a href="${href}" target="_blank" rel="noopener noreferrer" style="color:#6ea8fe;text-decoration:underline">${escapedSite}</a>${after}`;
  }

  function showShareMenu(a, text, url, triggerEl) {
    injectShareMenuStyles();
    const title = buildShareTitle(a);
    const links = buildSocialLinks(text, url, title);
    const previouslyFocused = document.activeElement;
    const desktop = isDesktopLayout() && triggerEl;

    const backdrop = document.createElement('div');
    backdrop.className = desktop ? 'aw-share-backdrop aw-share-backdrop--popover' : 'aw-share-backdrop';

    const touch = isTouchDevice();
    const targetKeys = CONFIG.targets.filter((key) => TARGET_META[key]);
    // "More" tile hands off to the native OS share sheet — only useful on
    // touch devices that actually have one, and only if it isn't already
    // the primary share path (forceCustomMenu true means it never was).
    const showMore = touch && CONFIG.showNativeMoreOnTouch && !!navigator.share;
    if (showMore) targetKeys.push('more');

    const items = targetKeys
      .map((key, i) => {
        const meta = key === 'more' ? { icon: 'fas fa-ellipsis', label: 'More' } : TARGET_META[key];
        const shortcut = !touch && i < 9 ? `<span class="aw-share-key">${i + 1}</span>` : '';
        return `<div class="aw-share-item" role="button" tabindex="0" data-action="${key}" aria-label="${escapeHTML(meta.label)}">
          ${shortcut}<i class="${meta.icon}" aria-hidden="true"></i>${escapeHTML(meta.label)}
        </div>`;
      })
      .join('');

    backdrop.innerHTML = `
      <div class="aw-share-sheet" role="dialog" aria-modal="true" aria-labelledby="aw-share-title">
        <div class="aw-share-handle" aria-hidden="true"></div>
        <div class="aw-share-title-row">
          <div class="aw-share-title" id="aw-share-title">Share this anime</div>
          <button type="button" class="aw-share-x" data-action="close" aria-label="Close">✕</button>
        </div>
        ${a && a.image ? `
        <div class="aw-share-card">
          <img class="aw-share-card-img" src="${escapeHTML(a.image)}" alt="" loading="lazy" onerror="handleImgError(this)">
          <div class="aw-share-card-meta">
            <div class="aw-share-card-title">${escapeHTML((a.name && String(a.name).trim()) || 'Untitled Anime')}</div>
            <div class="aw-share-card-sub">${escapeHTML(stateLabel(a.state))} · ${escapeHTML(safeRating(a.rating))}</div>
          </div>
        </div>` : ''}
        <div class="aw-share-preview">${linkifyBrandInPreview(text)}</div>
        <div class="aw-share-linkrow">
          <span class="aw-share-linktext">${escapeHTML(url)}</span>
          <button type="button" class="aw-share-copybtn" data-action="copylink">Copy</button>
        </div>
        <div class="aw-share-grid">${items}</div>
        <button type="button" class="aw-share-close" data-action="close">Cancel</button>
      </div>
    `;

    const sheet = backdrop.querySelector('.aw-share-sheet');

    function focusableElements() {
      return Array.from(sheet.querySelectorAll('[data-action]'));
    }

    function close() {
      backdrop.removeEventListener('click', onBackdropClick);
      backdrop.removeEventListener('keydown', onKeyDown);
      sheet.removeEventListener('touchstart', onTouchStart);
      sheet.removeEventListener('touchmove', onTouchMove);
      sheet.removeEventListener('touchend', onTouchEnd);
      backdrop.remove();
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    }

    async function runAction(action) {
      switch (action) {
        case 'copy': {
          const ok = await copyToClipboard(text);
          if (window.showToast) window.showToast(ok ? 'Share text copied!' : 'Could not copy', ok ? 'success' : 'error');
          close();
          break;
        }
        case 'copylink': {
          const ok = await copyToClipboard(url);
          const btn = sheet.querySelector('[data-action="copylink"]');
          if (btn) {
            btn.textContent = ok ? 'Copied!' : 'Failed';
            btn.classList.toggle('aw-copied', ok);
            setTimeout(() => {
              btn.textContent = 'Copy';
              btn.classList.remove('aw-copied');
            }, 1500);
          }
          break;
        }
        case 'close':
          close();
          break;
        case 'instagram': {
          const ok = await copyToClipboard(text);
          if (window.showToast) {
            window.showToast(
              ok ? 'Caption copied! Paste it into your Instagram DM.' : 'Could not copy caption',
              ok ? 'success' : 'error'
            );
          }
          const isMobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent || '');
          if (isMobile) {
            // Try the app deep link first; browsers that can't handle it
            // will just ignore the navigation, so we don't need a timed
            // fallback — the Instagram app, when installed, intercepts this.
            window.location.href = 'instagram://direct/inbox';
          } else {
            openWindow('https://www.instagram.com/direct/inbox/');
          }
          close();
          break;
        }
        case 'more': {
          close();
          try {
            await navigator.share({ title, text });
          } catch (err) {
            // AbortError = user cancelled; anything else, just let it be —
            // we already tried our best via the custom menu.
          }
          break;
        }
        default: {
          const link = links[action];
          if (!link) { close(); break; }
            openWindow(link);
          close();
        }
      }
    }

    function onBackdropClick(e) {
      const item = e.target.closest('[data-action]');
      if (item) {
        runAction(item.dataset.action);
      } else if (e.target === backdrop) {
        close();
      }
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === 'Enter' || e.key === ' ') {
        const item = e.target.closest('[data-action]');
        if (item) {
          e.preventDefault();
          runAction(item.dataset.action);
        }
        return;
      }
      // Desktop convenience: press 1-9 to trigger the matching tile.
      if (desktop && /^[1-9]$/.test(e.key)) {
        const idx = Number(e.key) - 1;
        const focusables = focusableElements();
        if (focusables[idx]) {
          e.preventDefault();
          runAction(focusables[idx].dataset.action);
        }
        return;
      }
      // Basic focus trap.
      if (e.key === 'Tab') {
        const focusables = focusableElements();
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    backdrop.addEventListener('click', onBackdropClick);
    backdrop.addEventListener('keydown', onKeyDown);

    // ---- Swipe-down-to-dismiss (mobile bottom sheet only) ----
    let dragStartY = null;
    let dragCurrentY = 0;
    function onTouchStart(e) {
      if (desktop) return;
      dragStartY = e.touches[0].clientY;
      sheet.style.transition = 'none';
    }
    function onTouchMove(e) {
      if (desktop || dragStartY === null) return;
      const delta = e.touches[0].clientY - dragStartY;
      if (delta > 0) {
        dragCurrentY = delta;
        sheet.style.transform = `translateY(${delta}px)`;
      }
    }
    function onTouchEnd() {
      if (desktop || dragStartY === null) return;
      sheet.style.transition = '';
      if (dragCurrentY > 90) {
        close();
      } else {
        sheet.style.transform = '';
      }
      dragStartY = null;
      dragCurrentY = 0;
    }
    if (!desktop) {
      sheet.addEventListener('touchstart', onTouchStart, { passive: true });
      sheet.addEventListener('touchmove', onTouchMove, { passive: true });
      sheet.addEventListener('touchend', onTouchEnd);
    }

    document.body.appendChild(backdrop);

    // On desktop, anchor the popover next to the button that opened it
    // instead of centering it — this is what makes it feel like a native
    // desktop share menu (GitHub/Twitter-style) instead of a mobile sheet.
    if (desktop) {
      positionPopover(sheet, triggerEl);
      window.addEventListener('resize', repositionOnResize);
      window.addEventListener('scroll', repositionOnResize, true);
    }

    function repositionOnResize() {
      positionPopover(sheet, triggerEl);
    }

    const baseClose = close;
    close = function () {
      window.removeEventListener('resize', repositionOnResize);
      window.removeEventListener('scroll', repositionOnResize, true);
      baseClose();
    };

    // Move focus into the dialog for keyboard/screen-reader users.
    const first = focusableElements()[0];
    if (first) first.focus();
  }

  /** Places the popover sheet directly below (or above, if no room) the trigger button. */
  function positionPopover(sheet, triggerEl) {
    if (!triggerEl || !triggerEl.getBoundingClientRect) return;
    const rect = triggerEl.getBoundingClientRect();
    const sheetRect = sheet.getBoundingClientRect();
    const margin = 8;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;

    let top = rect.bottom + margin;
    let left = rect.left;

    // Flip above the button if there isn't room below.
    if (top + sheetRect.height > viewportH) {
      top = rect.top - sheetRect.height - margin;
    }
    // Keep it within the right edge of the viewport.
    if (left + sheetRect.width > viewportW - margin) {
      left = viewportW - sheetRect.width - margin;
    }
    if (left < margin) left = margin;
    if (top < margin) top = margin;

    sheet.style.position = 'fixed';
    sheet.style.top = `${top}px`;
    sheet.style.left = `${left}px`;
    sheet.style.margin = '0';
  }

  // ---------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------

  /**
   * Main entry point. Call window.shareAnimeModern(a) with the anime object
   * and it will:
   *  1. Try the native Web Share API (best on mobile — opens the OS share sheet)
   *  2. Fall back to a custom, accessible share menu with copy + social options
   *
   * @param {object} a - Anime object: { name, rating, state, review }
   * @param {string} [urlOverride] - Optional URL to share instead of current page.
   * @param {Element} [triggerEl] - Element that triggered the share (for popover anchoring).
   * @param {object} [context] - Optional variant info, e.g. { variant: 'watch', season, episode }.
   *   Omit (or pass { variant: 'detail' }) for the standard anime-detail-page message.
   */
  async function shareAnimeModern(a, urlOverride, triggerEl, context) {
    if (!a || typeof a !== 'object') {
      console.warn('[share.js] shareAnimeModern called without a valid anime object.');
      return;
    }

    const url = urlOverride || window.location.href;
    const text = buildShareText(a, url, context);
    const title = buildShareTitle(a);

    if (!CONFIG.forceCustomMenu && navigator.share) {
      try {
        // NOTE: intentionally omitting `url` here. When both `text` and `url`
        // are passed, many OS share sheets (Android "Copy", Windows "Copy link")
        // only copy the url field and silently drop everything else.
        // Keeping the link inside `text` guarantees the full formatted
        // message (title/rating/link/current/about) is what gets shared/copied.
        await navigator.share({ title, text });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return; // user cancelled
        // Any other error (unsupported data, permission issues, etc.) —
        // fall through to the custom menu instead of failing silently.
      }
    }

    // triggerEl is the button/element the user clicked (event.currentTarget).
    // If the caller didn't pass one, we try to infer it from the global
    // click event so old call sites (`shareAnimeModern(anime)`) still work.
    const inferredTrigger = triggerEl || (window.event && window.event.currentTarget) || null;
    showShareMenu(a, text, url, inferredTrigger);
  }

  window.shareAnimeModern = shareAnimeModern;
  window.buildAnimeShareText = buildShareText;
  // Exposed for testing / advanced integrations.
  window.AW_SHARE_INTERNAL = { buildShareText, buildShareTitle, buildSocialLinks, stateLabel };
})();