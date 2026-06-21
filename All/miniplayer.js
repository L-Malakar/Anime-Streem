/**
 * ANIvalted Mini Player — persistent pip across pages
 *
 * Bug fixes:
 *  1. Opening a new anime on watch.html kills existing PIP automatically
 *  2. iframe NEVER reloads on page navigation — src set only once
 *  3. Closing PIP blanks iframe so audio/video truly stops
 */
(function () {
  'use strict';

  const SESSION_KEY = 'anivalted_miniplayer';
  const ACTIVE_KEY  = 'anivalted_pip_active';
  const DRAG_MARGIN = 12;

  /* ─── State ─────────────────────────────────────────────── */
  function loadState()     { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch(e) { return null; } }
  function saveState(d)    { try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(d)); } catch(e) {} }
  function isActive()      { return sessionStorage.getItem(ACTIVE_KEY) === '1'; }
  function setActive(v)    { v ? sessionStorage.setItem(ACTIVE_KEY, '1') : sessionStorage.removeItem(ACTIVE_KEY); }
  function clearAll()      { sessionStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(ACTIVE_KEY); }

  /* ─── CSS ────────────────────────────────────────────────── */
  function injectCSS() {
    if (document.getElementById('anv-mp-css')) return;
    const s = document.createElement('style');
    s.id = 'anv-mp-css';
    s.textContent = `
      #anv-miniplayer {
        position:fixed; bottom:24px; right:24px; width:340px;
        background:#0e0e1a; border:1px solid rgba(232,50,26,0.35);
        border-radius:12px; overflow:hidden;
        box-shadow:0 24px 64px rgba(0,0,0,0.7),0 0 0 1px rgba(255,255,255,0.04);
        z-index:8000; display:none; flex-direction:column;
        user-select:none; -webkit-user-select:none; transition:box-shadow 0.2s;
      }
      #anv-miniplayer.anv-mp-visible {
        display:flex;
        animation:anvMpIn 0.35s cubic-bezier(0.34,1.56,0.64,1);
      }
      #anv-miniplayer.dragging {
        box-shadow:0 32px 80px rgba(0,0,0,0.85),0 0 0 1px rgba(232,50,26,0.5);
        transition:none;
      }
      @keyframes anvMpIn {
        from{opacity:0;transform:scale(0.85) translateY(20px);}
        to  {opacity:1;transform:scale(1)    translateY(0);   }
      }
      #anv-mp-bar {
        display:flex; align-items:center; gap:0.5rem; padding:8px 10px;
        background:rgba(8,8,16,0.9); cursor:grab; flex-shrink:0;
        border-bottom:1px solid rgba(255,255,255,0.05);
      }
      #anv-mp-bar:active{cursor:grabbing;}
      #anv-mp-thumb{width:28px;height:28px;border-radius:4px;object-fit:cover;flex-shrink:0;background:#14141f;}
      #anv-mp-info{flex:1;min-width:0;}
      #anv-mp-title{font-family:'Bebas Neue',sans-serif;font-size:0.85rem;letter-spacing:1.5px;color:#e8e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      #anv-mp-ep{font-size:0.65rem;color:#6b6b80;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .anv-mp-icon-btn{background:none;border:none;cursor:pointer;color:#6b6b80;padding:4px;border-radius:4px;display:flex;align-items:center;justify-content:center;transition:color 0.15s,background 0.15s;flex-shrink:0;}
      .anv-mp-icon-btn:hover{color:#e8e8f0;background:rgba(255,255,255,0.07);}
      .anv-mp-icon-btn.red:hover{color:#e8321a;}
      #anv-mp-frame-wrap{position:relative;width:100%;aspect-ratio:16/9;background:#080810;flex-shrink:0;}
      #anv-mp-frame-wrap iframe{position:absolute;inset:0;width:100%;height:100%;border:none;}
      #anv-mp-overlay{position:absolute;inset:0;cursor:grab;z-index:1;background:transparent;display:none;}
      #anv-miniplayer.dragging #anv-mp-overlay{display:block;}
      #anv-mp-controls{display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:rgba(8,8,16,0.9);border-top:1px solid rgba(255,255,255,0.05);flex-shrink:0;}
      #anv-mp-expand-btn{font-family:'Bebas Neue',sans-serif;font-size:0.7rem;letter-spacing:2px;color:#e8321a;background:none;border:1px solid rgba(232,50,26,0.3);border-radius:4px;padding:3px 8px;cursor:pointer;transition:background 0.15s,border-color 0.15s;white-space:nowrap;}
      #anv-mp-expand-btn:hover{background:rgba(232,50,26,0.12);border-color:#e8321a;}
      #anv-mp-resize{position:absolute;bottom:0;left:0;width:18px;height:18px;cursor:sw-resize;display:flex;align-items:flex-end;justify-content:flex-start;padding:3px;z-index:10;}
      #anv-mp-resize svg{color:rgba(255,255,255,0.15);pointer-events:none;}
      #anv-mp-resize:hover svg{color:rgba(232,50,26,0.5);}
    `;
    document.head.appendChild(s);
  }

  /* ─── Build DOM ─────────────────────────────────────────── */
  function buildDOM() {
    if (document.getElementById('anv-miniplayer')) return;
    const el = document.createElement('div');
    el.id = 'anv-miniplayer';
    el.innerHTML = `
      <div id="anv-mp-bar">
        <img id="anv-mp-thumb" src="" alt=""/>
        <div id="anv-mp-info">
          <div id="anv-mp-title">—</div>
          <div id="anv-mp-ep">—</div>
        </div>
        <button class="anv-mp-icon-btn" id="anv-mp-prev-btn" title="Previous episode">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="14" height="14"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/></svg>
        </button>
        <button class="anv-mp-icon-btn" id="anv-mp-next-btn" title="Next episode">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="14" height="14"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/></svg>
        </button>
        <button class="anv-mp-icon-btn red" id="anv-mp-close-btn" title="Close">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" width="14" height="14"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
      <div id="anv-mp-frame-wrap">
        <iframe id="anv-mp-iframe" frameborder="0" scrolling="no"
          allow="autoplay; encrypted-media; fullscreen" allowfullscreen
          sandbox="allow-scripts allow-same-origin allow-presentation allow-forms"></iframe>
        <div id="anv-mp-overlay"></div>
      </div>
      <div id="anv-mp-controls">
        <button id="anv-mp-expand-btn">↗ OPEN FULL</button>
        <div style="display:flex;gap:4px">
          <button class="anv-mp-icon-btn" id="anv-mp-mute-btn" title="Mute">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="15" height="15"><path stroke-linecap="round" stroke-linejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.531L6.75 15.75H4.5A2.25 2.25 0 012.25 13.5v-3A2.25 2.25 0 014.5 8.25h2.25z"/></svg>
          </button>
        </div>
      </div>
      <div id="anv-mp-resize" title="Resize">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="12" height="12" fill="none"><path d="M2 14L14 2M8 14L14 8M2 8L8 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </div>`;
    document.body.appendChild(el);
  }

  /* ─── The ONE src we have loaded — never set twice ──────── */
  let _loadedSrc = '';

  function showPIP(state) {
    const el = document.getElementById('anv-miniplayer');
    if (!el || !state) return;

    // Update metadata (no reload risk)
    const thumb = document.getElementById('anv-mp-thumb');
    const title = document.getElementById('anv-mp-title');
    const ep    = document.getElementById('anv-mp-ep');
    if (thumb) thumb.src = state.image || '';
    if (title) title.textContent = state.animeName || '—';
    if (ep)    ep.textContent    = state.epLabel   || '—';

    // ★ BUG 2 FIX: only set iframe.src when src actually changes — never on page nav
    const iframe = document.getElementById('anv-mp-iframe');
    if (iframe && state.iframeSrc && state.iframeSrc !== _loadedSrc) {
      iframe.src = state.iframeSrc;
      _loadedSrc  = state.iframeSrc;
    }

    const prevBtn = document.getElementById('anv-mp-prev-btn');
    const nextBtn = document.getElementById('anv-mp-next-btn');
    if (prevBtn) prevBtn.disabled = !state.prevUrl;
    if (nextBtn) nextBtn.disabled = !state.nextUrl;

    const expandBtn = document.getElementById('anv-mp-expand-btn');
    if (expandBtn && state.watchUrl) expandBtn.onclick = () => { window.location.href = state.watchUrl; };

    el.classList.add('anv-mp-visible');
  }

  function hidePIP(killIframe) {
    const el = document.getElementById('anv-miniplayer');
    if (!el) return;
    // ★ BUG 3 FIX: blank the iframe so audio/video truly stops
    if (killIframe) {
      const iframe = document.getElementById('anv-mp-iframe');
      if (iframe) iframe.src = 'about:blank';
      _loadedSrc = '';
    }
    el.classList.remove('anv-mp-visible');
    el.style.display = 'none';
  }

  /* ─── Prev / Next episode inside PIP ────────────────────── */
  function navEp(direction) {
    const state = loadState();
    if (!state) return;
    const url = direction === 'prev' ? state.prevUrl : state.nextUrl;
    if (!url) return;

    fetch('details.json').then(r => r.json()).then(data => {
      const p = new URLSearchParams(url.split('?')[1] || '');
      const id = p.get('id'), s = parseInt(p.get('s')||'1'), e = parseInt(p.get('e')||'1');
      const anime = data.find(a => String(a.id) === String(id));
      if (!anime || !anime.episodeLinks) return;

      const sk = 's'+s;
      const src = (anime.episodeLinks[sk]||{})['e'+e];
      if (!src) return;

      const seasons = Object.keys(anime.episodeLinks).sort((a,b)=>parseInt(a.slice(1))-parseInt(b.slice(1)));
      const eps     = Object.keys(anime.episodeLinks[sk]||{}).map(k=>parseInt(k.slice(1))).sort((a,b)=>a-b);
      const curIdx  = eps.indexOf(e), sIdx = seasons.indexOf(sk);

      let prevUrl = null, nextUrl = null;
      if (curIdx > 0) {
        prevUrl = `watch.html?id=${encodeURIComponent(id)}&s=${s}&e=${eps[curIdx-1]}`;
      } else if (sIdx > 0) {
        const ps = parseInt(seasons[sIdx-1].slice(1));
        const pE = Object.keys(anime.episodeLinks[seasons[sIdx-1]]||{}).map(k=>parseInt(k.slice(1))).sort((a,b)=>a-b);
        if (pE.length) prevUrl = `watch.html?id=${encodeURIComponent(id)}&s=${ps}&e=${pE[pE.length-1]}`;
      }
      if (curIdx < eps.length-1) {
        nextUrl = `watch.html?id=${encodeURIComponent(id)}&s=${s}&e=${eps[curIdx+1]}`;
      } else if (sIdx < seasons.length-1) {
        const ns = parseInt(seasons[sIdx+1].slice(1));
        const nE = Object.keys(anime.episodeLinks[seasons[sIdx+1]]||{}).map(k=>parseInt(k.slice(1))).sort((a,b)=>a-b);
        if (nE.length) nextUrl = `watch.html?id=${encodeURIComponent(id)}&s=${ns}&e=${nE[0]}`;
      }

      const seasonLabels = anime.seasons || seasons.map(s=>`Season ${s.slice(1)}`);
      const seasonLabel  = seasonLabels[sIdx] || `Season ${s}`;

      const newState = { ...state, iframeSrc:src, watchUrl:`watch.html?id=${encodeURIComponent(id)}&s=${s}&e=${e}`, epLabel:`${seasonLabel} · Ep ${e}`, prevUrl, nextUrl };
      saveState(newState);
      // Force iframe update since src changed intentionally
      _loadedSrc = '';
      showPIP(newState);
    }).catch(()=>{});
  }

  /* ─── Drag ───────────────────────────────────────────────── */
  function makeDraggable(el) {
    let sx, sy, sl, st, drag = false;
    function dn(e) {
      if (e.target.closest('button')||e.target.closest('#anv-mp-resize')) return;
      drag=true; el.classList.add('dragging');
      const r=el.getBoundingClientRect(); sx=e.clientX; sy=e.clientY; sl=r.left; st=r.top;
      e.preventDefault();
    }
    function mv(e) {
      if (!drag) return;
      const W=window.innerWidth, H=window.innerHeight, rw=el.offsetWidth, rh=el.offsetHeight;
      el.style.left   = Math.min(Math.max(sl+e.clientX-sx, DRAG_MARGIN), W-rw-DRAG_MARGIN)+'px';
      el.style.top    = Math.min(Math.max(st+e.clientY-sy, DRAG_MARGIN), H-rh-DRAG_MARGIN)+'px';
      el.style.right='auto'; el.style.bottom='auto';
    }
    function up() { if(!drag)return; drag=false; el.classList.remove('dragging'); }
    const bar = document.getElementById('anv-mp-bar');
    bar.addEventListener('mousedown', dn);
    document.addEventListener('mousemove', mv);
    document.addEventListener('mouseup', up);
    bar.addEventListener('touchstart', e=>{const t=e.touches[0];dn({clientX:t.clientX,clientY:t.clientY,target:e.target,preventDefault:()=>e.preventDefault()});},{passive:false});
    document.addEventListener('touchmove', e=>{if(!drag)return;const t=e.touches[0];mv({clientX:t.clientX,clientY:t.clientY});},{passive:true});
    document.addEventListener('touchend', up);
  }

  /* ─── Resize ─────────────────────────────────────────────── */
  function makeResizable(el) {
    const h=document.getElementById('anv-mp-resize');
    let sx, sw, res=false;
    h.addEventListener('mousedown', e=>{e.stopPropagation();e.preventDefault();res=true;el.classList.add('dragging');sx=e.clientX;sw=el.getBoundingClientRect().width;});
    document.addEventListener('mousemove', e=>{
      if(!res)return;
      el.style.width=Math.min(Math.max(sw+(sx-e.clientX),240),560)+'px';
      el.style.left=Math.max(e.clientX,DRAG_MARGIN)+'px'; el.style.right='auto';
    });
    document.addEventListener('mouseup', ()=>{if(!res)return;res=false;el.classList.remove('dragging');});
  }

  /* ─── Mute ───────────────────────────────────────────────── */
  let _muted=false;
  function setupMute() {
    const btn=document.getElementById('anv-mp-mute-btn');
    if(!btn)return;
    btn.addEventListener('click',()=>{
      _muted=!_muted;
      try{document.getElementById('anv-mp-iframe').contentWindow.postMessage({type:'mute',muted:_muted},'*');}catch(e){}
      btn.style.color=_muted?'#e8321a':''; btn.title=_muted?'Unmute':'Mute';
      btn.innerHTML=_muted
        ?`<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="15" height="15"><path stroke-linecap="round" stroke-linejoin="round" d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-4.72a.75.75 0 011.28.531V19.94a.75.75 0 01-1.281.53l-4.72-4.719M4.5 18.75H3A2.25 2.25 0 01.75 16.5v-3A2.25 2.25 0 013 11.25h1.5"/></svg>`
        :`<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="15" height="15"><path stroke-linecap="round" stroke-linejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.531L6.75 15.75H4.5A2.25 2.25 0 012.25 13.5v-3A2.25 2.25 0 014.5 8.25h2.25z"/></svg>`;
    });
  }

  /* ─── Close button ───────────────────────────────────────── */
  function setupClose() {
    const btn=document.getElementById('anv-mp-close-btn');
    if(!btn)return;
    btn.addEventListener('click',()=>{
      // ★ BUG 3 FIX: clear state AND kill iframe src so audio stops
      clearAll();
      hidePIP(true);
    });
  }

  /* ─── Init ───────────────────────────────────────────────── */
  function init() {
    // ── WATCH PAGE GUARD ────────────────────────────────────────────────────
    // On watch.html the user is already watching a full video.
    // We must guarantee zero PIP activity — no DOM, no iframe, no audio.
    // Strategy:
    //   1. clearAll()   — wipe sessionStorage so isActive() returns false
    //                     and showPIP() can never be triggered
    //   2. hidePIP(true) — physically remove the iframe from the DOM in case
    //                     a PIP window was already mounted on a previous paint
    //                     (hidePIP is safe to call even before buildDOM)
    //   3. return early  — don't build or show anything; watch page needs no PIP
    // Detect watch page robustly — works with or without .html extension,
    // in subdirectories, on any host (GitHub Pages, Netlify, Vercel, etc.)
    const _path = window.location.pathname;
    const _isWatchPage = _path === '/watch.html'
      || _path.endsWith('/watch.html')
      || _path === '/watch'
      || _path.endsWith('/watch')
      || _path.includes('watch.html');
    if (_isWatchPage) {
      clearAll();
      hidePIP(true);   // kills iframe if it somehow already exists
      return;          // ← hard stop: no PIP DOM built on this page at all
    }
    // ────────────────────────────────────────────────────────────────────────

    injectCSS();
    buildDOM();
    const el=document.getElementById('anv-miniplayer');
    document.getElementById('anv-mp-prev-btn').addEventListener('click',()=>navEp('prev'));
    document.getElementById('anv-mp-next-btn').addEventListener('click',()=>navEp('next'));
    makeDraggable(el);
    makeResizable(el);
    setupMute();
    setupClose();

    // ★ BUG 2 FIX: restore PIP on page nav without reloading iframe
    // _loadedSrc starts as '' on every new page, so showPIP will set src once,
    // but on the SAME page if called again with same src it skips the set.
    if (isActive()) {
      const state=loadState();
      if (state && state.iframeSrc) {
        showPIP(state);
      } else {
        setActive(false);
      }
    }
  }

  /* ─── Public API ─────────────────────────────────────────── */
  window.MiniPlayer = {
    /** watch.html calls this to keep state in sync as episode changes */
    store(data) { saveState(data); },

    /**
     * Called by watch.html PIP button.
     * Saves state, marks active, shows pip, then watch.html navigates away.
     */
    activate(data) {
      saveState(data);
      setActive(true);
      showPIP(data);
    },

    /**
     * Called by watch.html on every page load.
     * ★ BUG 1 FIX: if a DIFFERENT anime opens, kill PIP.
     *              if SAME anime opens, just hide pip (user is in full player).
     */
    onWatchPageLoad(newAnimeId) {
      if (!isActive()) return;
      const state = loadState();
      const pipId = state && state.animeId;
      if (String(pipId) !== String(newAnimeId)) {
        // Different anime — close pip completely
        clearAll();
        hidePIP(true);
      } else {
        // Same anime — user came back to full player, hide pip but keep state
        setActive(false);
        hidePIP(false);
      }
    },

    /** Update state fields without changing visibility */
    update(data) { const cur=loadState()||{}; saveState({...cur,...data}); },

    /** Hard close */
    close() { clearAll(); hidePIP(true); }
  };

  if (document.readyState==='loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();