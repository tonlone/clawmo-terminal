/* terminal.clawmo.tech — shell runtime
   Phase 3: chrome only. Module content is placeholder; Phase 4 wires real data. */

(function () {
  'use strict';

  /* ── Module registry ──────────────────────────────────────── */
  const MODULES = [
    { id: 'stock-analysis', code: 'EQ',  fkey: 1,  label: 'Stock Analysis', labelCN: '股票分析', group: 'Core',     src: 'stocks.clawmo.tech', pdfExportable: true },
    { id: 'financials',     code: 'FIN', fkey: 2,  label: 'Financials',    labelCN: '財務深度',  group: 'Core',     src: 'stocks.clawmo.tech', pdfExportable: true },
    { id: 'holdings',       code: 'HLD', fkey: 3,  label: 'Holdings',      labelCN: '機構持股',  group: 'Core',     src: 'stocks.clawmo.tech', pdfExportable: true },
    { id: 'screener',       code: 'SCR', fkey: 4,  label: 'Screener',       labelCN: '選股器',   group: 'Core',     src: 'stocks.clawmo.tech/screener.html', pdfExportable: true, pdfNeedsTicker: false },
    { id: 'breadth',        code: 'BRD', fkey: 5,  label: 'Market Breadth', labelCN: '市場廣度', group: 'Core',     src: 'stocks.clawmo.tech/breadth.html', pdfExportable: true, pdfNeedsTicker: false },
    { id: 'signals',        code: 'SIG', fkey: 6,  label: 'Signals',        labelCN: '交易信號', group: 'Core',     src: 'stocks.clawmo.tech/signals.html', pdfExportable: true, pdfNeedsTicker: false },
    { id: 'sctr',           code: 'SCT', fkey: 7,  label: 'SCTR',           labelCN: 'SCTR排名', group: 'Tools',    src: 'stocks.clawmo.tech/sctr.html', pdfExportable: true, pdfNeedsTicker: false },
    { id: 'deep-value',     code: 'DVL', fkey: 8,  label: 'Deep Value',     labelCN: '深度價值', group: 'Tools',    src: 'deep-value.clawmo.tech' },
    { id: 'gex',            code: 'GEX', fkey: 9,  label: 'GEX',            labelCN: '伽瑪曝險', group: 'Tools',    src: 'stocks.clawmo.tech/gex.html', pdfExportable: true, pdfNeedsTicker: false },
    { id: 'smart-money',    code: 'SMY', fkey: 10, label: 'Smart Money',    labelCN: '機構資金', group: 'Tools',    src: 'stocks.clawmo.tech/smart-money.html', pdfExportable: true, pdfNeedsTicker: false },
    { id: 'heatmap',        code: 'HMP', fkey: 11, label: 'Heatmap',        labelCN: '熱力圖',   group: 'Market',   src: 'stocks.clawmo.tech/heatmap.html' },
    { id: 'calendar',       code: 'CAL', fkey: null, label: 'Calendar',     labelCN: '財經日曆', group: 'Market',   src: 'stocks.clawmo.tech/calendar.html' },
    { id: 'sentiment',      code: 'SEN', fkey: null, label: 'Sentiment',      labelCN: '市場情緒', group: 'Macro',    src: 'stocks.clawmo.tech/sentiment.html', pdfExportable: true, pdfNeedsTicker: false },
    { id: 'recession',      code: 'REC', fkey: null, label: 'Recession',      labelCN: '衰退監測', group: 'Macro',    src: 'stocks.clawmo.tech/recession.html', pdfExportable: true, pdfNeedsTicker: false },
    { id: 'valuation-map',  code: 'VAL', fkey: null, label: 'Valuation Map',  labelCN: '估值地圖', group: 'Macro',    src: 'stocks.clawmo.tech/valuation-map.html', pdfExportable: true, pdfNeedsTicker: false },
    { id: 'geo',            code: 'GEO', fkey: null, label: 'Geo Risk',       labelCN: '地緣風險', group: 'Macro',    src: 'stocks.clawmo.tech/data/hormuz.json' },
    { id: 'crypto',         code: 'CRY', fkey: null, label: 'Crypto',        labelCN: '加密貨幣', group: 'Assets',   src: 'stocks.clawmo.tech/crypto.html', pdfExportable: true, pdfNeedsTicker: false },
    { id: 'bonds',          code: 'BND', fkey: null, label: 'Bonds',         labelCN: '債券',     group: 'Assets',   src: 'stocks.clawmo.tech/bonds.html', pdfExportable: true, pdfNeedsTicker: false },
    { id: 'metals',         code: 'MET', fkey: null, label: 'Metals',        labelCN: '貴金屬',   group: 'Assets',   src: 'stocks.clawmo.tech/precious-metals.html', pdfExportable: true, pdfNeedsTicker: false },
    { id: 'news',           code: 'NWS', fkey: null, label: 'News Intel',    labelCN: '新聞情報', group: 'External', src: 'news.clawmo.tech' },
    { id: 'twitter',        code: 'TWT', fkey: null, label: 'X Signals',     labelCN: 'X信號',    group: 'External', src: 'news.clawmo.tech (x_signals)' },
    { id: 'trump',          code: 'TRP', fkey: null, label: 'Trump Monitor', labelCN: '川普監察', group: 'External', src: 'trumpsocial.clawmo.tech' },
    { id: 'polymarket',     code: 'POL', fkey: null, label: 'Polymarket',    labelCN: '預測市場', group: 'External', src: 'polymarket.com' },
    { id: 'portfolio',      code: 'PTF', fkey: null, label: 'Portfolio',    labelCN: '投資組合', group: 'Private',  src: 'stocks.clawmo.tech/portfolio.html' },
  ];

  const MODULE_BY_ID = Object.fromEntries(MODULES.map(m => [m.id, m]));
  const MODULE_BY_FKEY = Object.fromEntries(MODULES.filter(m => m.fkey).map(m => [m.fkey, m]));

  // Expose registry for i18n helpers (OC_TITLE / OC_RAIL_LABEL)
  window.OC_MODULES_META = MODULE_BY_ID;

  /* Watchlist for tape + palette ticker actions */
  const WATCHLIST = [
    { sym: 'SPY',  src: 'stocks.clawmo.tech' },
    { sym: 'QQQ',  src: 'stocks.clawmo.tech' },
    { sym: 'NVDA', src: 'stocks.clawmo.tech' },
    { sym: 'TSLA', src: 'stocks.clawmo.tech' },
    { sym: 'GOOGL',src: 'stocks.clawmo.tech' },
    { sym: 'AAPL', src: 'stocks.clawmo.tech' },
    { sym: 'MSFT', src: 'stocks.clawmo.tech' },
    { sym: 'META', src: 'stocks.clawmo.tech' },
    { sym: 'AMZN', src: 'stocks.clawmo.tech' },
    { sym: 'BTC',  src: 'stocks.clawmo.tech' },
    { sym: 'ETH',  src: 'stocks.clawmo.tech' },
    { sym: 'SOL',  src: 'stocks.clawmo.tech' },
    { sym: 'IBIT', src: 'stocks.clawmo.tech' },
    { sym: 'MARA', src: 'stocks.clawmo.tech' },
    { sym: 'BMNR', src: 'stocks.clawmo.tech' },
  ];

  /* ── State ───────────────────────────────────────────────── */
  const STATE_KEY = 'ocWorkspace';
  const DEFAULT_STATE = {
    layout: '1',
    panes: [
      { module: 'stock-analysis' },
      { module: null },
      { module: null },
      { module: null },
    ],
    focus: 0,
    theme: 'ember',
  };

  function loadState() {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (!raw) return { ...DEFAULT_STATE, panes: DEFAULT_STATE.panes.map(p => ({ ...p })) };
      const parsed = JSON.parse(raw);
      // defensive normalization
      const s = { ...DEFAULT_STATE, ...parsed };
      s.panes = (parsed.panes || DEFAULT_STATE.panes).slice(0, 4);
      while (s.panes.length < 4) s.panes.push({ module: null });
      if (typeof s.focus !== 'number' || s.focus < 0 || s.focus > 3) s.focus = 0;
      if (!['1', '2v', '2h', 'quad'].includes(s.layout)) s.layout = '1';
      return s;
    } catch (e) {
      return { ...DEFAULT_STATE, panes: DEFAULT_STATE.panes.map(p => ({ ...p })) };
    }
  }

  function saveState() {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (e) { /* quota */ }
  }

  let state = loadState();
  // migrate legacy ocTheme if present
  const legacyTheme = localStorage.getItem('ocTheme');
  if (legacyTheme && !state.theme) state.theme = legacyTheme;

  /* ── Theme ───────────────────────────────────────────────── */
  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    state.theme = t;
    const sel = document.getElementById('themeSelect');
    if (sel) sel.value = t;
    saveState();
  }

  /* ── Rail render ─────────────────────────────────────────── */
  function renderRail() {
    const rail = document.getElementById('rail');
    rail.innerHTML = '';
    let currentGroup = null;
    MODULES.forEach(m => {
      if (m.group !== currentGroup) {
        if (currentGroup !== null) {
          const sep = document.createElement('div');
          sep.className = 'rail-sep';
          rail.appendChild(sep);
        }
        currentGroup = m.group;
      }
      const btn = document.createElement('button');
      btn.className = 'rail-btn';
      btn.dataset.module = m.id;
      const tipLabel = window.OC_RAIL_LABEL ? window.OC_RAIL_LABEL(m.id) : m.label;
      btn.innerHTML = `
        <span class="rail-code">${m.code}</span>
        <span class="rail-fkey">${m.fkey ? 'F' + m.fkey : ''}</span>
        <span class="rail-close" title="Close ${m.code} (clear all panes holding it)" aria-label="Close ${m.code}">×</span>
        <span class="rail-tip">${tipLabel}${m.fkey ? ' <span style="color:var(--fg-faint);margin-left:6px">F' + m.fkey + '</span>' : ''}</span>
      `;
      btn.addEventListener('click', () => openModuleInFocusedPane(m.id));
      btn.querySelector('.rail-close').addEventListener('click', (e) => {
        e.stopPropagation();
        closeModuleFromAllPanes(m.id);
      });
      rail.appendChild(btn);
    });
    updateRailActive();
  }

  function updateRailActive() {
    const activeIds = new Set(state.panes.filter(p => p.module).map(p => p.module));
    document.querySelectorAll('.rail-btn').forEach(btn => {
      btn.classList.toggle('active', activeIds.has(btn.dataset.module));
    });
  }

  function closeModuleFromAllPanes(modId) {
    let changed = false;
    state.panes.forEach(p => {
      if (p && p.module === modId) {
        p.module = null;
        p.params = {};
        changed = true;
      }
    });
    if (!changed) return;
    renderWorkspace();
    saveState();
    updateRailActive();
  }

  /* ── Workspace render ────────────────────────────────────── */
  function renderWorkspace() {
    const ws = document.getElementById('workspace');
    ws.dataset.layout = state.layout;
    ws.innerHTML = '';

    const slotsForLayout = { '1': 1, '2v': 2, '2h': 2, 'quad': 4 };
    const visibleSlots = slotsForLayout[state.layout];
    // clamp focus within visible
    if (state.focus >= visibleSlots) state.focus = 0;

    for (let i = 0; i < visibleSlots; i++) {
      const pane = document.createElement('section');
      pane.className = 'pane';
      pane.dataset.slot = i;
      if (i === state.focus) pane.classList.add('focused');
      pane.addEventListener('click', () => focusPane(i));

      const paneState = state.panes[i];
      const mod = paneState.module ? MODULE_BY_ID[paneState.module] : null;

      const header = document.createElement('header');
      header.className = 'pane-header';
      if (mod) {
        const paneLabel = window.OC_RAIL_LABEL ? window.OC_RAIL_LABEL(mod.id) : mod.label;
        header.innerHTML = `
          <span class="pane-code">${mod.code}</span>
          <span class="pane-label">${paneLabel}</span>
          <span class="pane-actions">
            <button class="pane-action pane-action-util" title="Export / share options" data-act="util">⤓</button>
            <button class="pane-action" title="Refresh (invalidate cache + reload)" data-act="refresh">↻</button>
            <button class="pane-action" title="Open palette for this pane" data-act="palette">⌕</button>
            <button class="pane-action" title="Clear pane" data-act="clear">×</button>
          </span>
        `;
      } else {
        header.innerHTML = `
          <span class="pane-code">—</span>
          <span class="pane-label">empty</span>
          <span class="pane-actions">
            <button class="pane-action" title="Open palette for this pane" data-act="palette">⌕</button>
          </span>
        `;
      }
      pane.appendChild(header);

      header.querySelectorAll('[data-act]').forEach(b => {
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          focusPane(i);
          if (b.dataset.act === 'palette') openPalette();
          else if (b.dataset.act === 'clear') { state.panes[i].module = null; renderWorkspace(); saveState(); updateRailActive(); }
          else if (b.dataset.act === 'refresh') refreshPane(i);
          else if (b.dataset.act === 'util')    openUtilMenu(i, b);
        });
      });

      const body = document.createElement('div');
      body.className = 'pane-body';
      pane.appendChild(body);
      ws.appendChild(pane);
      // fire-and-forget render (async for real modules, sync for placeholder)
      fillPaneBody(body, mod, i);
    }

    // layout switcher active state
    document.querySelectorAll('.layout-switcher button').forEach(b => {
      b.classList.toggle('active', b.dataset.layout === state.layout);
    });

    updateRailActive();
  }

  async function fillPaneBody(body, mod, paneIdx) {
    if (!mod) {
      body.innerHTML = `
        <div class="pane-empty">
          <div class="big">◢</div>
          <div>${window.OC_T ? window.OC_T('EMPTY') : 'Empty pane'}</div>
          <div class="open-hint">${window.OC_T ? window.OC_T('OPEN_HINT') : 'press ⌘K or click a rail button'}</div>
        </div>`;
      return;
    }
    const impl = window.OC_MODULES && window.OC_MODULES[mod.id];
    if (impl && typeof impl.render === 'function') {
      const paneState = state.panes[paneIdx] || {};
      try {
        await impl.render(body, { modId: mod.id, paneIdx, params: paneState.params || {} });
      } catch (e) {
        body.innerHTML = `<div class="mod-err">Module error: ${(e && e.message) || e}</div>`;
      }
      return;
    }
    // Placeholder for modules not yet wired
    body.innerHTML = `
      <div class="pane-placeholder">
        <h2>${mod.code} — ${mod.label}</h2>
        <div><span class="tag">PHASE 4</span>will wire live data from <code>${mod.src}</code></div>
        <br>
        <div><span class="tag">GROUP</span>${mod.group}</div>
        ${mod.fkey ? `<div><span class="tag">HOTKEY</span><code>F${mod.fkey}</code> · <code>Alt+${mod.fkey <= 9 ? mod.fkey : '0'}</code></div>` : ''}
        <br>
        <div style="color:var(--fg-faint);font-size:10px">
          module.id = <code>${mod.id}</code><br>
          opened in pane <code>${paneIdx}</code> · layout <code>${state.layout}</code>
        </div>
      </div>`;
  }

  /* ── Pane / layout ops ───────────────────────────────────── */
  function focusPane(i) {
    state.focus = i;
    document.querySelectorAll('.pane').forEach(p => {
      p.classList.toggle('focused', parseInt(p.dataset.slot, 10) === i);
    });
    saveState();
  }

  function setLayout(l) {
    if (!['1', '2v', '2h', 'quad'].includes(l)) return;
    state.layout = l;
    renderWorkspace();
    saveState();
  }

  function openModuleInFocusedPane(id, params) {
    const mod = MODULE_BY_ID[id];
    if (!mod) return;
    state.panes[state.focus] = { module: id, params: params || {} };
    renderWorkspace();
    saveState();
  }

  // Let modules update their own pane params (e.g. ticker change without full re-render)
  window.OC_UPDATE_PANE_PARAMS = function (newParams) {
    const pane = state.panes[state.focus];
    if (!pane) return;
    pane.params = { ...(pane.params || {}), ...(newParams || {}) };
    saveState();
  };

  // Let modules open another module in the focused pane (e.g. click a ticker cell → Stock Analysis)
  window.OC_OPEN_MODULE = function (id, params) {
    openModuleInFocusedPane(id, params);
  };

  // Refresh a pane: drop cached data for the pane's module, re-render
  async function refreshPane(i) {
    const paneEl = document.querySelector(`.pane[data-slot="${i}"]`);
    const bodyEl = paneEl && paneEl.querySelector('.pane-body');
    const pane = state.panes[i];
    if (!paneEl || !bodyEl || !pane || !pane.module) return;
    // nuclear cache flush is fine — fetchJSON re-hydrates on next render
    if (window.OC_DATA && window.OC_DATA.invalidate) window.OC_DATA.invalidate();
    // spin icon
    const spin = paneEl.querySelector('[data-act="refresh"]');
    if (spin) spin.classList.add('pane-action-spin');
    const mod = MODULE_BY_ID[pane.module];
    try {
      const modImpl = window.OC_MODULES && window.OC_MODULES[pane.module];
      if (modImpl && typeof modImpl.beforeRefresh === 'function') await modImpl.beforeRefresh();
      await fillPaneBody(bodyEl, mod, i);
    } finally {
      if (spin) spin.classList.remove('pane-action-spin');
    }
  }
  window.OC_REFRESH_PANE = refreshPane;

  /* ── Utility menu (Bloomberg-style) ─────────────────────────
     Appears on every pane header as a single ⤓ icon → dropdown.
     Items: Export PDF (per-module opt-in), Copy data (stub), Copy link.
     Menu is re-created on each open so module state is current. */
  let _utilMenuEl = null;
  function closeUtilMenu() {
    if (_utilMenuEl && _utilMenuEl.parentNode) _utilMenuEl.parentNode.removeChild(_utilMenuEl);
    _utilMenuEl = null;
    document.removeEventListener('click', _utilDocListener, true);
    document.removeEventListener('keydown', _utilKeyListener, true);
  }
  function _utilDocListener(ev) {
    if (_utilMenuEl && !_utilMenuEl.contains(ev.target) && !ev.target.closest('[data-act="util"]')) {
      closeUtilMenu();
    }
  }
  function _utilKeyListener(ev) {
    if (ev.key === 'Escape') closeUtilMenu();
  }

  function openUtilMenu(paneIdx, trigger) {
    if (_utilMenuEl) { closeUtilMenu(); return; }
    const pane = state.panes[paneIdx];
    const mod = pane && pane.module ? MODULE_BY_ID[pane.module] : null;
    if (!mod) return;
    const ticker = (pane && pane.params && pane.params.ticker) || null;
    const market = (pane && pane.params && pane.params.market) || 'US';
    const needsTicker = mod.pdfNeedsTicker !== false;
    const pdfOK  = !!mod.pdfExportable && (!needsTicker || !!ticker);
    const pdfHint = !mod.pdfExportable ? 'PDF export not yet available for this module'
                  : (needsTicker && !ticker) ? 'Pick a ticker first (type one into the module)'
                                             : null;

    // CSV export is opt-in: a module enables it by exposing exportCsv(body)
    // on its registration object. Returns a string. The menu checks the live
    // module entry (not mod — MODULE_BY_ID has metadata only).
    const modReg = (window.OC_MODULES && window.OC_MODULES[mod.id]) || null;
    const csvFn = modReg && typeof modReg.exportCsv === 'function' ? modReg.exportCsv : null;
    const csvOK = !!csvFn;

    const menu = document.createElement('div');
    menu.className = 'pane-util-menu';
    menu.innerHTML = `
      <div class="pane-util-header">${mod.code} · ${mod.label.toUpperCase()}</div>
      <button class="pane-util-item${pdfOK ? '' : ' pane-util-item-disabled'}" data-util="pdf" ${pdfOK ? '' : 'disabled'}>
        <span class="pane-util-icon">📄</span><span class="pane-util-label">Export PDF</span>
        ${pdfHint ? `<span class="pane-util-hint">${pdfHint}</span>` : ''}
      </button>
      <button class="pane-util-item${csvOK ? '' : ' pane-util-item-disabled'}" data-util="csv" ${csvOK ? '' : 'disabled'}>
        <span class="pane-util-icon">⊞</span><span class="pane-util-label">Copy data (CSV)</span>
        ${csvOK ? '' : '<span class="pane-util-hint">not available for this module</span>'}
      </button>
      <button class="pane-util-item" data-util="link">
        <span class="pane-util-icon">🔗</span><span class="pane-util-label">Copy link to this view</span>
      </button>
    `;
    // Anchor the menu to the trigger button (right-aligned underneath)
    const rect = trigger.getBoundingClientRect();
    menu.style.top  = (rect.bottom + 4) + 'px';
    menu.style.left = Math.max(8, rect.right - 240) + 'px';
    document.body.appendChild(menu);
    _utilMenuEl = menu;
    setTimeout(() => {  // next tick so the triggering click doesn't close it
      document.addEventListener('click', _utilDocListener, true);
      document.addEventListener('keydown', _utilKeyListener, true);
    }, 0);

    menu.querySelectorAll('.pane-util-item').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (btn.disabled) return;
        const kind = btn.dataset.util;
        if (kind === 'pdf' && pdfOK) {
          exportPaneAsPdf(mod, ticker, market, pane);
          closeUtilMenu();
        } else if (kind === 'csv' && csvOK) {
          copyPaneCsv(mod, paneIdx, csvFn);
          closeUtilMenu();
        } else if (kind === 'link') {
          copyPaneLink(mod, pane);
          closeUtilMenu();
        }
      });
    });
  }

  // Serialize the full pane state — module id + every pane.params entry — into
  // a shareable URL. Boot (readUrlState) parses this shape back out so a pasted
  // link resurrects the exact view (ticker, market, tab, and any module-specific
  // state the module has stashed on pane.params via OC_UPDATE_PANE_PARAMS).
  function buildPaneUrl(mod, pane) {
    const p = new URLSearchParams();
    p.set('module', mod.id);
    const params = (pane && pane.params) || {};
    Object.keys(params).forEach((k) => {
      const v = params[k];
      if (v == null || v === '') return;
      // Keep scalars only — arrays/objects can opt-in by serializing themselves
      // into a string before stashing on pane.params.
      if (typeof v === 'object') return;
      p.set(k, String(v));
    });
    return window.location.origin + '/?' + p.toString();
  }

  function copyPaneLink(mod, pane) {
    const url = buildPaneUrl(mod, pane);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url);
        return;
      }
    } catch (e) { /* fall through */ }
    window.prompt('Copy this link:', url);
  }

  // Call the module's exportCsv(body) and copy the resulting string to the
  // clipboard. exportCsv is responsible for its own delimiting/escaping; we
  // just ship the payload.
  function copyPaneCsv(mod, paneIdx, csvFn) {
    const paneEl = document.querySelector(`.pane[data-slot="${paneIdx}"]`);
    const bodyEl = paneEl && paneEl.querySelector('.pane-body');
    if (!bodyEl) return;
    let csv;
    try { csv = csvFn(bodyEl); }
    catch (e) { console.error('[csv]', e); alert('CSV export failed: ' + e.message); return; }
    if (!csv) { alert('No data to copy — the module returned an empty payload.'); return; }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(csv);
        return;
      }
    } catch (e) { /* fall through */ }
    window.prompt('Copy this CSV:', csv);
  }

  // Read ?module=...&... from the current URL. Returns { id, params } if a
  // known module is present, else null. Called once during init() so a pasted
  // deep-link overrides whatever is in localStorage for this tab.
  function readUrlState() {
    const qs = window.location.search;
    if (!qs || qs.length < 2) return null;
    const p = new URLSearchParams(qs);
    const id = p.get('module');
    if (!id || !MODULE_BY_ID[id]) return null;
    const params = {};
    p.forEach((v, k) => { if (k !== 'module' && v !== '') params[k] = v; });
    return { id, params };
  }

  async function exportPaneAsPdf(mod, ticker, market, pane) {
    // Route depends on module. For now only FIN; more modules added in later phases.
    const routes = {
      financials:     (t, m) => `https://stocks.clawmo.tech/api/pdf/terminal/financials/${encodeURIComponent(t)}?market=${encodeURIComponent(m || 'US')}`,
      holdings:       (t, m) => `https://stocks.clawmo.tech/api/pdf/terminal/holdings/${encodeURIComponent(t)}?market=${encodeURIComponent(m || 'US')}`,
      signals:        ()     => `https://stocks.clawmo.tech/api/pdf/terminal/signals`,
      'stock-analysis': (t)  => `https://stocks.clawmo.tech/api/pdf/stock/${encodeURIComponent(t)}`,
      breadth:        ()     => `https://stocks.clawmo.tech/api/pdf/terminal/breadth`,
      'smart-money':  ()     => `https://stocks.clawmo.tech/api/pdf/terminal/smart-money`,
      sentiment:      ()     => `https://stocks.clawmo.tech/api/pdf/terminal/sentiment`,
      recession:      ()     => `https://stocks.clawmo.tech/api/pdf/terminal/recession`,
      // VAL: use the SPY/QQQ toggle from pane.params.valIdx
      'valuation-map': (_t, _m, pane) => {
        const idx = (pane && pane.params && pane.params.valIdx) || 'spy';
        return `https://stocks.clawmo.tech/api/pdf/terminal/valuation-map?idx=${encodeURIComponent(idx)}`;
      },
      crypto:         ()     => `https://stocks.clawmo.tech/api/pdf/terminal/crypto`,
      bonds:          ()     => `https://stocks.clawmo.tech/api/pdf/terminal/bonds`,
      metals:         ()     => `https://stocks.clawmo.tech/api/pdf/terminal/metals`,
      // HMP: use the selected timeframe from pane.params.hmTf so Export PDF
      // captures the same view currently on screen.
      heatmap: (_t, _m, pane) => {
        const tf = (pane && pane.params && pane.params.hmTf) || '1D';
        return `https://stocks.clawmo.tech/api/pdf/terminal/heatmap?tf=${encodeURIComponent(tf)}`;
      },
      sctr:           ()     => `https://stocks.clawmo.tech/api/pdf/terminal/sctr`,
      // GEX: if a ticker is selected in the pane (detail view open) export the
      // per-ticker detail PDF; otherwise the full-universe landscape PDF.
      gex: (_t, _m, pane) => {
        const gt = (pane && pane.params && pane.params.gexTicker) || null;
        return gt
          ? `https://stocks.clawmo.tech/api/pdf/terminal/gex/${encodeURIComponent(gt)}`
          : `https://stocks.clawmo.tech/api/pdf/terminal/gex`;
      },
      screener:       () => {
        // Serialize terminal SCR pane state (window._scrState) to the URL shape
        // accepted by stocks-app's /api/pdf/screener/{preset|custom} endpoint.
        const s = window._scrState || {};
        const noExtra = (!s.sector || s.sector === 'All') && (!s.industry || s.industry === 'All');
        if (s.activePreset && noExtra) {
          return `https://stocks.clawmo.tech/api/pdf/screener/${encodeURIComponent(s.activePreset)}`;
        }
        const p = new URLSearchParams();
        if (s.sector && s.sector !== 'All')     p.set('sector',   s.sector);
        if (s.industry && s.industry !== 'All') p.set('industry', s.industry);
        (s.filters || []).forEach((f, i) => {
          if (!f || !f.m) return;
          const n = i + 1;
          p.set('m' + n,  f.m);
          p.set('op' + n, f.op || '>');
          p.set('v' + n,  String(f.v == null ? '' : f.v));
        });
        if ([...p.keys()].length === 0) {
          return `https://stocks.clawmo.tech/api/pdf/screener/all`;
        }
        return `https://stocks.clawmo.tech/api/pdf/screener/custom?${p.toString()}`;
      },
    };
    const fn = routes[mod.id];
    if (!fn) return;
    if (mod.pdfNeedsTicker !== false && !ticker) return;
    const url = fn(ticker, market, pane);
    // Open in new tab so the browser handles the download UI
    window.open(url, '_blank', 'noopener');
  }

  // Auto-align dense-table headers with their data columns.
  // Looks at the first data row in each <table.tbl-dense>, copies alignment
  // from each <td>'s class (.mono → .num header, .cell → .ctr header) to the
  // corresponding <th>. Works for tables appended after fetch resolves too.
  function alignOneTable(table) {
    if (table.dataset.aligned === 'true') return;
    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');
    if (!thead || !tbody) return;
    const headers = thead.querySelectorAll('th');
    if (!headers.length) return;
    // find a representative data row (skip empty/colspan rows)
    let proto = null;
    for (const tr of tbody.querySelectorAll('tr')) {
      const tds = tr.querySelectorAll('td');
      if (tds.length === headers.length) { proto = tds; break; }
    }
    if (!proto) return;
    const colType = [];  // 'num' | 'ctr' | 'str' per column
    proto.forEach((td, i) => {
      const th = headers[i];
      if (!th) { colType[i] = 'str'; return; }
      if (td.classList.contains('mono')) { th.classList.add('num'); colType[i] = 'num'; }
      else if (td.classList.contains('cell')) { th.classList.add('ctr'); colType[i] = 'num'; }
      else colType[i] = 'str';
    });
    // Attach sort handlers
    headers.forEach((th, i) => {
      th.classList.add('sortable');
      th.addEventListener('click', () => sortTable(table, i, colType[i]));
    });
    table.dataset.aligned = 'true';
  }

  function parseCell(td) {
    const text = (td.textContent || '').trim();
    if (!text || text === '—' || text === '———') return { str: '', num: null };
    // Match optional minus, digits/commas/dot, optional suffix (KMBT), optional %
    const m = text.match(/^([+\-])?\$?([\d,]+(?:\.\d+)?)\s*([KMBT])?%?/i);
    if (m) {
      const sign = m[1] === '-' ? -1 : 1;
      let v = parseFloat(m[2].replace(/,/g, ''));
      if (!isNaN(v)) {
        const mult = ({ K: 1e3, M: 1e6, B: 1e9, T: 1e12 })[(m[3] || '').toUpperCase()] || 1;
        return { str: text, num: sign * v * mult };
      }
    }
    return { str: text.toLowerCase(), num: null };
  }

  function sortTable(table, colIdx, type) {
    const tbody = table.querySelector('tbody');
    const thead = table.querySelector('thead');
    if (!tbody || !thead) return;
    // Cache original order once (for 3rd-click unsort)
    if (!tbody.dataset.origOrderCached) {
      Array.from(tbody.children).forEach((tr, i) => { tr.dataset.origOrder = String(i); });
      tbody.dataset.origOrderCached = '1';
    }
    const th = thead.querySelectorAll('th')[colIdx];
    if (!th) return;
    const currentDir = th.dataset.sort || 'none';
    // Cycle: none → desc (higher-first for numbers, a-z for strings) → asc → none
    // Actually numbers: desc first (biggest at top is usually what traders want)
    //         strings: asc first (a-z)
    const cycle = ['none', type === 'num' ? 'desc' : 'asc', type === 'num' ? 'asc' : 'desc'];
    const nextIdx = (cycle.indexOf(currentDir) + 1) % cycle.length;
    const nextDir = cycle[nextIdx];

    // Clear sort markers on all headers
    thead.querySelectorAll('th').forEach(h => { h.dataset.sort = 'none'; });
    th.dataset.sort = nextDir;

    const rows = Array.from(tbody.children);
    if (nextDir === 'none') {
      rows.sort((a, b) => (parseInt(a.dataset.origOrder, 10) || 0) - (parseInt(b.dataset.origOrder, 10) || 0));
    } else {
      const mult = nextDir === 'asc' ? 1 : -1;
      rows.sort((a, b) => {
        const ta = a.querySelectorAll('td')[colIdx];
        const tb = b.querySelectorAll('td')[colIdx];
        if (!ta || !tb) return 0;
        const va = parseCell(ta);
        const vb = parseCell(tb);
        // Empty cells always sink to bottom regardless of direction
        if (va.str === '' && vb.str !== '') return 1;
        if (vb.str === '' && va.str !== '') return -1;
        if (va.num != null && vb.num != null) return (va.num - vb.num) * mult;
        if (va.num != null) return -mult;
        if (vb.num != null) return mult;
        return va.str.localeCompare(vb.str) * mult;
      });
    }
    rows.forEach(r => tbody.appendChild(r));
  }

  const tableAlignObserver = new MutationObserver(() => {
    document.querySelectorAll('table.tbl-dense:not([data-aligned="true"])').forEach(alignOneTable);
  });
  tableAlignObserver.observe(document.body, { childList: true, subtree: true });

  /* ── Command palette ─────────────────────────────────────── */
  let paletteItems = [];
  let paletteActive = 0;

  function openPalette(prefill) {
    const overlay = document.getElementById('paletteOverlay');
    overlay.hidden = false;
    const input = document.getElementById('paletteInput');
    input.value = prefill || '';
    renderPaletteResults(input.value);
    setTimeout(() => input.focus(), 0);
  }
  function closePalette() {
    document.getElementById('paletteOverlay').hidden = true;
  }
  function isPaletteOpen() {
    return !document.getElementById('paletteOverlay').hidden;
  }

  function buildCandidates() {
    const items = [];
    MODULES.forEach(m => {
      items.push({
        kind: 'module',
        group: m.group,
        label: m.label,
        code: m.code,
        hint: m.fkey ? 'F' + m.fkey : '',
        haystack: (m.label + ' ' + m.code + ' ' + m.id + ' ' + m.group).toLowerCase(),
        action: () => openModuleInFocusedPane(m.id),
      });
    });
    WATCHLIST.forEach(w => {
      items.push({
        kind: 'ticker',
        group: 'Tickers',
        label: w.sym,
        code: 'EQ',
        hint: 'Stock Analysis',
        haystack: w.sym.toLowerCase(),
        action: () => openModuleInFocusedPane('stock-analysis', { ticker: w.sym }),
      });
    });
    ['ember','cyan','phosphor','gold'].forEach(t => {
      items.push({
        kind: 'command',
        group: 'Commands',
        label: 'theme ' + t,
        code: 'T',
        hint: 'Switch theme',
        haystack: ('theme ' + t).toLowerCase(),
        action: () => applyTheme(t),
      });
    });
    [['1','Single pane'],['2v','Two vertical'],['2h','Two horizontal'],['quad','2×2 quad']].forEach(([l, name]) => {
      items.push({
        kind: 'command',
        group: 'Commands',
        label: 'layout ' + l,
        code: 'L',
        hint: name,
        haystack: ('layout ' + l + ' ' + name).toLowerCase(),
        action: () => setLayout(l),
      });
    });
    return items;
  }

  function scoreItem(item, q) {
    if (!q) return 1;
    const hay = item.haystack;
    if (hay === q) return 1000;
    if (hay.startsWith(q)) return 500 - hay.length;
    const idx = hay.indexOf(q);
    if (idx === 0) return 400 - hay.length;
    if (idx > 0) return 200 - idx;
    // fuzzy: every char in order
    let i = 0;
    for (let c of q) {
      const p = hay.indexOf(c, i);
      if (p < 0) return 0;
      i = p + 1;
    }
    return 10;
  }

  function renderPaletteResults(q) {
    q = (q || '').trim().toLowerCase();
    const all = buildCandidates();
    const scored = all
      .map(it => ({ it, s: scoreItem(it, q) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 30)
      .map(x => x.it);

    // Synthesize a "ticker → Stock Analysis" action ONLY if nothing in the
    // existing results already prefix-matches the query (otherwise typing "cry"
    // to find the Crypto module gets hijacked by a synthetic CRY ticker).
    const tickerLike = /^[a-z\.\-]{1,6}$/.test(q);
    if (tickerLike && q.length >= 1) {
      const upper = q.toUpperCase();
      const hasTickerMatch  = scored.some(it => it.kind === 'ticker' && it.label === upper);
      const hasPrefixMatch  = scored.some(it =>
        (it.kind === 'module' || it.kind === 'command') &&
        (it.label.toLowerCase().startsWith(q) || (it.code && it.code.toLowerCase().startsWith(q)))
      );
      if (!hasTickerMatch && !hasPrefixMatch) {
        scored.unshift({
          kind: 'ticker',
          group: 'Tickers',
          label: upper,
          code: 'EQ',
          hint: 'Stock Analysis',
          haystack: q,
          action: () => openModuleInFocusedPane('stock-analysis', { ticker: upper }),
        });
      }
    }

    // Two-token "CODE TICKER" syntax (e.g. "fin intc", "eq nvda"):
    // first token is a module code/id/label prefix, second token is a ticker
    // passed via params. Synthesized at the top of the list.
    const twoTokenMatch = q.match(/^([a-z\-]{2,14})\s+([a-z\.\-]{1,6})$/);
    if (twoTokenMatch) {
      const modQ = twoTokenMatch[1];
      const tkRaw = twoTokenMatch[2].toUpperCase();
      const mod = MODULES.find(m =>
        m.code.toLowerCase() === modQ ||
        m.id.toLowerCase() === modQ ||
        m.label.toLowerCase().startsWith(modQ)
      );
      if (mod) {
        scored.unshift({
          kind: 'ticker',
          group: mod.group || 'Tickers',
          label: mod.code + ' · ' + tkRaw,
          code: mod.code,
          hint: mod.label + ' · ' + tkRaw,
          haystack: q,
          action: () => openModuleInFocusedPane(mod.id, { ticker: tkRaw }),
        });
      }
    }

    paletteItems = scored;
    paletteActive = 0;

    const root = document.getElementById('paletteResults');
    if (!scored.length) {
      root.innerHTML = '<div class="palette-empty">no matches</div>';
      return;
    }
    // group by kind
    const groupOrder = ['Core','Tools','Market','Macro','Assets','External','Tickers','Commands'];
    const byGroup = {};
    scored.forEach(it => { (byGroup[it.group] = byGroup[it.group] || []).push(it); });

    let html = '';
    let flatIdx = 0;
    groupOrder.concat(Object.keys(byGroup).filter(g => !groupOrder.includes(g))).forEach(g => {
      if (!byGroup[g]) return;
      html += `<div class="palette-group">${g.toUpperCase()}</div>`;
      byGroup[g].forEach(it => {
        const act = flatIdx === paletteActive ? 'active' : '';
        html += `<div class="palette-item ${act}" data-idx="${flatIdx}">
          <span class="code">${it.code}</span>
          <span class="label">${it.label}</span>
          <span class="hint">${it.hint || ''}</span>
        </div>`;
        flatIdx++;
      });
    });
    root.innerHTML = html;

    root.querySelectorAll('.palette-item').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.idx, 10);
        executePaletteItem(idx);
      });
      el.addEventListener('mouseenter', () => {
        setPaletteActive(parseInt(el.dataset.idx, 10));
      });
    });
  }

  function setPaletteActive(i) {
    if (!paletteItems.length) return;
    paletteActive = Math.max(0, Math.min(paletteItems.length - 1, i));
    const root = document.getElementById('paletteResults');
    root.querySelectorAll('.palette-item').forEach(el => {
      const idx = parseInt(el.dataset.idx, 10);
      el.classList.toggle('active', idx === paletteActive);
    });
    const active = root.querySelector('.palette-item.active');
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  function executePaletteItem(i) {
    const it = paletteItems[i];
    if (!it) return;
    closePalette();
    it.action();
  }

  /* ── Ticker tape ─────────────────────────────────────────── */
  const PRICES_URL = 'https://stocks.clawmo.tech/api/signals/last-prices';
  const CRYPTO_URL = 'https://stocks.clawmo.tech/data/crypto.json';

  function tapeItem(sym, price, chg) {
    const cls = chg == null ? 'chg-flat' : chg > 0 ? 'chg-up' : chg < 0 ? 'chg-dn' : 'chg-flat';
    const priceStr = price == null ? '———' :
      price >= 1000 ? price.toFixed(0) :
      price < 1 ? price.toFixed(4) :
      price.toFixed(2);
    const chgStr = chg == null ? '' : ' <span class="' + cls + '">' + (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%</span>';
    return `<span><span class="sym">${sym}</span> <span class="mono">${priceStr}</span>${chgStr}</span>`;
  }

  async function renderTape() {
    const tape = document.getElementById('tape');
    // initial skeleton so there's something to scroll
    const skeleton = () => WATCHLIST.map(w => tapeItem(w.sym, null, null)).join('');
    tape.innerHTML = skeleton() + skeleton();

    try {
      const fetchJSON = window.OC_DATA && window.OC_DATA.fetchJSON;
      if (!fetchJSON) return;
      const [prices, crypto] = await Promise.all([
        fetchJSON(PRICES_URL, { ttl: 2 * 60 * 1000 }).catch(() => ({})),
        fetchJSON(CRYPTO_URL, { ttl: 2 * 60 * 1000 }).catch(() => ({ top_coins: [] })),
      ]);

      const cryptoBy = {};
      (crypto.top_coins || []).forEach(c => {
        if (c && c.symbol) cryptoBy[String(c.symbol).toUpperCase()] = c;
      });

      const cells = WATCHLIST.map(w => {
        const s = (prices || {})[w.sym];
        const c = cryptoBy[w.sym];
        if (c) return tapeItem(w.sym, c.price, c.change_24h);
        if (s && typeof s.price === 'number') return tapeItem(w.sym, s.price, s.change_pct);
        return tapeItem(w.sym, null, null);
      }).join('');
      tape.innerHTML = cells + cells;
    } catch (e) {
      // keep skeleton on failure
    }
  }

  /* ── Keyboard ────────────────────────────────────────────── */
  function onKeyDown(e) {
    // let the browser handle typing in inputs
    const tag = (e.target && e.target.tagName) || '';
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable;

    // palette open?
    if (isPaletteOpen()) {
      if (e.key === 'Escape') { e.preventDefault(); closePalette(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setPaletteActive(paletteActive + 1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setPaletteActive(paletteActive - 1); return; }
      if (e.key === 'Enter') { e.preventDefault(); executePaletteItem(paletteActive); return; }
      return;
    }

    // ⌘K / Ctrl+K → palette
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault(); openPalette(); return;
    }

    if (typing) return;

    // F1-F12 → module
    if (/^F\d{1,2}$/.test(e.key)) {
      const n = parseInt(e.key.substring(1), 10);
      const mod = MODULE_BY_FKEY[n];
      if (mod) { e.preventDefault(); openModuleInFocusedPane(mod.id); return; }
    }
    // Alt+1..9,0 → module
    if (e.altKey && /^[0-9]$/.test(e.key)) {
      const n = e.key === '0' ? 10 : parseInt(e.key, 10);
      const mod = MODULE_BY_FKEY[n];
      if (mod) { e.preventDefault(); openModuleInFocusedPane(mod.id); return; }
    }
    // 1/2/3/4 → layout (only when not typing)
    if (e.key === '1') { setLayout('1'); return; }
    if (e.key === '2') { setLayout('2v'); return; }
    if (e.key === '3') { setLayout('2h'); return; }
    if (e.key === '4') { setLayout('quad'); return; }
    // \ → cycle layout
    if (e.key === '\\') {
      const order = ['1','2v','2h','quad'];
      const next = order[(order.indexOf(state.layout) + 1) % order.length];
      setLayout(next);
      return;
    }
  }

  /* ── Bootstrap ───────────────────────────────────────────── */
  function init() {
    // theme
    applyTheme(state.theme || 'ember');

    // rail
    renderRail();

    // If the URL carries ?module=...&ticker=...&... (deep-link), override the
    // focused pane before the first render so the saved state doesn't flash in.
    const urlState = readUrlState();
    if (urlState) {
      state.panes[state.focus] = { module: urlState.id, params: urlState.params };
      saveState();
    }

    // workspace
    renderWorkspace();

    // tape
    renderTape();

    // bindings
    document.getElementById('cmdkTrigger').addEventListener('click', () => openPalette());
    document.getElementById('paletteOverlay').addEventListener('click', (e) => {
      if (e.target.id === 'paletteOverlay') closePalette();
    });
    document.getElementById('paletteInput').addEventListener('input', (e) => {
      renderPaletteResults(e.target.value);
    });
    document.getElementById('themeSelect').addEventListener('change', (e) => {
      applyTheme(e.target.value);
    });
    document.querySelectorAll('.layout-switcher button').forEach(b => {
      b.addEventListener('click', () => setLayout(b.dataset.layout));
    });

    window.addEventListener('keydown', onKeyDown);

    // update status bar clock every minute
    const updateClock = () => {
      const d = new Date();
      const et = d.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false });
      document.getElementById('sbUpdate').textContent = 'update: ' + et + ' ET';
    };
    updateClock();
    setInterval(updateClock, 60000);

    // fetch live regime + SPY; refresh every 5 min
    updateGlobalRegime();
    setInterval(updateGlobalRegime, 5 * 60 * 1000);

    // refresh ticker tape every 2 min (matches fetch TTL)
    setInterval(renderTape, 2 * 60 * 1000);

    // wire language switcher
    const langSel = document.getElementById('langSelect');
    if (langSel && window.OC_LANG) {
      langSel.value = window.OC_LANG();
      langSel.addEventListener('change', (e) => {
        window.OC_SET_LANG(e.target.value);
      });
    }
    // re-render everything when language changes (rail labels + module titles)
    window.addEventListener('oc-lang-change', () => {
      renderRail();
      renderWorkspace();
    });
  }

  async function updateGlobalRegime() {
    if (!window.OC_DATA) return;
    try {
      const s = await window.OC_DATA.fetchJSON('https://stocks.clawmo.tech/data/signals-summary.json');
      const r = s && s.regime && s.regime.regime;
      const spy = s && s.regime && s.regime.price;
      if (r) {
        const key = r.toLowerCase();
        const pill = document.getElementById('regimePill');
        if (pill) {
          pill.dataset.regime = key;
          const lbl = pill.querySelector('.regime-label');
          if (lbl) lbl.textContent = r.toUpperCase();
        }
        const sbR = document.getElementById('sbRegime');
        if (sbR) sbR.textContent = 'regime: ' + r.toUpperCase();
      }
      if (spy != null) {
        const el = document.getElementById('sbSpy');
        if (el) el.textContent = 'SPY ' + Number(spy).toFixed(2);
      }
    } catch (e) {
      // silent — status bar keeps placeholder
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
