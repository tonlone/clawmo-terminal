/* F5 Screener · F6 SCTR · F7 GEX · F8 Smart Money
   All 4 are "ranked table" modules. Bundled here to share the primitive render. */
(function () {
  'use strict';
  const { fetchJSON, fmt } = window.OC_DATA;
  const BASE = 'https://stocks.clawmo.tech/data';

  function pnlCls(v) {
    if (v == null || isNaN(v)) return '';
    return v > 0 ? 'num-up' : v < 0 ? 'num-dn' : '';
  }
  function openStock(ticker) {
    if (window.OC_UPDATE_PANE_PARAMS && window.OC_OPEN_MODULE) {
      window.OC_OPEN_MODULE('stock-analysis', { ticker });
    }
  }

  /* ── F5 Screener — fundamentals-rich screener with presets + custom filters
     Mirrors stocks.clawmo.tech screener.html (VALUE / GROWTH / DIVIDEND /
     QUALITY presets + custom filter rows + sector/industry dropdowns).
     All filtering runs client-side on the already-cached screener_index.json. */
  const SCR_METRICS = [
    { key: 'pe_ratio',          label: 'P/E',              cat: 'Valuation',     fmt: 'num' },
    { key: 'ps_ratio',          label: 'P/S',              cat: 'Valuation',     fmt: 'num' },
    { key: 'ev_ebitda',         label: 'EV/EBITDA',        cat: 'Valuation',     fmt: 'num' },
    { key: 'dividend_yield',    label: 'Div Yield %',      cat: 'Valuation',     fmt: 'pct' },
    { key: 'gross_margin',      label: 'Gross Margin %',   cat: 'Profitability', fmt: 'pct' },
    { key: 'operating_margin',  label: 'Operating Margin %', cat: 'Profitability', fmt: 'pct' },
    { key: 'net_margin',        label: 'Net Margin %',     cat: 'Profitability', fmt: 'pct' },
    { key: 'fcf_margin',        label: 'FCF Margin %',     cat: 'Profitability', fmt: 'pct' },
    { key: 'roe',               label: 'ROE %',            cat: 'Profitability', fmt: 'pct' },
    { key: 'roa',               label: 'ROA %',            cat: 'Profitability', fmt: 'pct' },
    { key: 'roic',              label: 'ROIC %',           cat: 'Profitability', fmt: 'pct' },
    { key: 'revenue_growth_1y', label: 'Rev Growth 1Y %',  cat: 'Growth',        fmt: 'pct' },
    { key: 'revenue_growth_3y', label: 'Rev Growth 3Y %',  cat: 'Growth',        fmt: 'pct' },
    { key: 'eps_growth_1y',     label: 'EPS Growth 1Y %',  cat: 'Growth',        fmt: 'pct' },
    { key: 'fcf_growth_1y',     label: 'FCF Growth 1Y %',  cat: 'Growth',        fmt: 'pct' },
    { key: 'debt_equity',       label: 'Debt / Equity',    cat: 'Solvency',      fmt: 'num' },
    { key: 'interest_coverage', label: 'Interest Coverage',cat: 'Solvency',      fmt: 'num' },
    { key: 'market_cap',        label: 'Market Cap',       cat: 'Size',          fmt: 'cur' },
    { key: 'revenue',           label: 'Revenue',          cat: 'Size',          fmt: 'cur' },
    { key: 'return_1y',         label: '1Y Return %',      cat: 'Performance',   fmt: 'pctRaw' },
    { key: 'alpha_1y',          label: '1Y Alpha %',       cat: 'Performance',   fmt: 'pctRaw' },
  ];

  /* Presets match stocks.clawmo.tech exactly. Values are user-facing
     (dividend_yield "2" means 2%, not 0.02) — normalized at compare time. */
  const SCR_PRESETS = {
    value:    [{ m: 'pe_ratio', op: '<', v: '20' }, { m: 'dividend_yield', op: '>', v: '2' }, { m: 'debt_equity', op: '<', v: '1.5' }],
    growth:   [{ m: 'revenue_growth_1y', op: '>', v: '20' }, { m: 'roe', op: '>', v: '15' }, { m: 'operating_margin', op: '>', v: '15' }],
    dividend: [{ m: 'dividend_yield', op: '>', v: '3' }, { m: 'fcf_margin', op: '>', v: '10' }, { m: 'debt_equity', op: '<', v: '2' }],
    quality:  [{ m: 'roe', op: '>', v: '20' }, { m: 'roic', op: '>', v: '15' }, { m: 'revenue_growth_3y', op: '>', v: '10' }, { m: 'net_margin', op: '>', v: '15' }],
  };

  /* User-visible Currency input parser: "1B"/"500M"/"100K" → raw number. */
  function parseScrVal(text, fmt) {
    if (text == null || text === '') return null;
    const t = String(text).trim().toUpperCase();
    if (fmt === 'cur') {
      const m = t.match(/^(-?[\d.]+)\s*([BMKT]?)$/);
      if (!m) { const n = Number(t); return isNaN(n) ? null : n; }
      const mult = { T: 1e12, B: 1e9, M: 1e6, K: 1e3, '': 1 }[m[2] || ''] || 1;
      return Number(m[1]) * mult;
    }
    const n = Number(t);
    return isNaN(n) ? null : n;
  }

  function normalizeFilterValue(metric, userVal) {
    // pct metrics stored as fractions (0.03), user enters the percent
    if (metric.fmt === 'pct') return userVal / 100;
    return userVal;
  }

  function matchFilter(stock, f) {
    const metric = SCR_METRICS.find((m) => m.key === f.m);
    if (!metric) return true;
    const raw = parseScrVal(f.v, metric.fmt);
    if (raw == null) return true;  // empty value = no constraint
    const thresh = normalizeFilterValue(metric, raw);
    const sv = stock[f.m];
    if (sv == null || typeof sv !== 'number' || !isFinite(sv)) return false;
    switch (f.op) {
      case '>':  return sv >  thresh;
      case '>=': return sv >= thresh;
      case '<':  return sv <  thresh;
      case '<=': return sv <= thresh;
      case '=':  return Math.abs(sv - thresh) < 1e-6;
      default:   return true;
    }
  }

  function fmtMetricCell(stock, metricKey, fmt) {
    const v = stock[metricKey];
    if (v == null || (typeof v === 'number' && !isFinite(v))) return '—';
    if (fmt === 'pct')    return (v * 100).toFixed(2) + '%';
    if (fmt === 'pctRaw') return (v >= 0 ? '+' : '') + Number(v).toFixed(2) + '%';
    if (fmt === 'cur')    return fmt_.compact(v);
    return Number(v).toFixed(2);
  }

  async function renderScreener(body) {
    body.innerHTML = `<div class="mod-loading">Loading screener…</div>`;
    try {
      const coreData = await fetchJSON(`${BASE}/screener_index.json`);
      let stocks = coreData.stocks || [];
      let allusData = null;
      const state = {
        filters: [],
        sector: 'All',
        industry: 'All',
        activePreset: null,
        industryLeaderMode: false,
        universeMode: 'core',
        textSearch: '',
        sort: { key: 'market_cap', asc: false },
      };
      // Persist preset choice within a session (but not universe mode — always start on core)
      const saved = window._scrState;
      if (saved) { Object.assign(state, saved); state.universeMode = 'core'; state.textSearch = ''; }

      let sectors = {}, indByS = {}, sortedSectors = [];
      function rebuildSectorIndex(list) {
        sectors = {}; indByS = {};
        list.forEach((s) => {
          if (s.sector) sectors[s.sector] = 1;
          if (s.sector && s.industry) (indByS[s.sector] = indByS[s.sector] || {})[s.industry] = 1;
        });
        sortedSectors = Object.keys(sectors).sort();
      }
      rebuildSectorIndex(stocks);

      function applyFilters() {
        const q = state.textSearch.trim().toLowerCase();
        return stocks.filter((s) => {
          if (q) {
            const tagHit = Array.isArray(s.tags) && s.tags.some((t) => t.includes(q));
            const hit = tagHit ||
                        s.ticker.toLowerCase().includes(q) ||
                        (s.name || '').toLowerCase().includes(q) ||
                        (s.industry || '').toLowerCase().includes(q);
            if (!hit) return false;
          }
          if (state.sector   !== 'All' && s.sector   !== state.sector)   return false;
          if (state.industry !== 'All' && s.industry !== state.industry) return false;
          return state.filters.every((f) => matchFilter(s, f));
        });
      }

      function renderFilterRow(i, f) {
        return `<div class="scr-filter-row" data-idx="${i}">
          <select class="scr-f-metric">${
            SCR_METRICS.map((m) => `<option value="${m.key}"${m.key === f.m ? ' selected' : ''}>${m.label}</option>`).join('')
          }</select>
          <select class="scr-f-op">${
            ['>', '>=', '<', '<=', '='].map((op) => `<option value="${op}"${op === f.op ? ' selected' : ''}>${op}</option>`).join('')
          }</select>
          <input class="scr-f-val" type="text" value="${f.v || ''}" placeholder="value">
          <button class="scr-f-rm" data-idx="${i}" title="Remove">×</button>
        </div>`;
      }

      function renderResults(filtered) {
        const { key, asc } = state.sort;
        const q = state.textSearch.trim().toLowerCase();

        function renderTags(tags) {
          if (!tags || !tags.length) return '<span style="color:var(--fg-faint)">—</span>';
          return tags.map((t) => {
            const matched = q && t.includes(q);
            return `<span class="scr-tag${matched ? ' scr-tag-match' : ''}">${t}</span>`;
          }).join(' ');
        }

        let displayRows;
        let colCount;
        let headCellsDef;
        let rowRenderer;

        function sortArrow(k) {
          if (state.sort.key !== k) return '<span class="scr-sort" style="opacity:0.3">▾</span>';
          return `<span class="scr-sort">${state.sort.asc ? '▴' : '▾'}</span>`;
        }

        function sortedList(list) {
          return [...list].sort((a, b) => {
            const av = a[key], bv = b[key];
            if (key === 'ticker' || key === 'name' || key === 'sector' || key === 'industry') {
              const cmp = String(av || '').localeCompare(String(bv || ''));
              return asc ? cmp : -cmp;
            }
            const an = (av == null || !isFinite(av)) ? -Infinity : Number(av);
            const bn = (bv == null || !isFinite(bv)) ? -Infinity : Number(bv);
            return asc ? an - bn : bn - an;
          });
        }

        if (state.industryLeaderMode) {
          // Group by industry → pick leader by market_cap, then sort result set
          const byInd = {};
          filtered.forEach((s) => {
            const ind = s.industry || '(Unknown)';
            if (!byInd[ind] || (s.market_cap || 0) > (byInd[ind].market_cap || 0)) byInd[ind] = s;
          });
          displayRows = sortedList(Object.values(byInd));
          if (state.universeMode === 'allus') {
            colCount = 9;
            headCellsDef = [
              ['industry',       'INDUSTRY'],
              ['ticker',         'TICKER'],
              ['name',           'NAME'],
              ['sector',         'SECTOR'],
              ['market_cap',     'MCAP'],
              ['price',          'PRICE'],
              ['beta',           'BETA'],
              ['dividend_yield', 'DIV'],
              [null,             'THEMES'],
            ];
            rowRenderer = (s) => `
              <tr>
                <td class="pat">${s.industry || '—'}</td>
                <td class="tk clickable" data-tk="${s.ticker}">${s.ticker}</td>
                <td class="pat">${s.name || '—'}</td>
                <td class="pat">${s.sector || '—'}</td>
                <td class="mono">${fmt_.compact(s.market_cap)}</td>
                <td class="mono">${s.price != null ? '$' + s.price.toFixed(2) : '—'}</td>
                <td class="mono">${s.beta != null ? s.beta.toFixed(2) : '—'}</td>
                <td class="mono">${s.dividend_yield ? (s.dividend_yield * 100).toFixed(2) + '%' : '—'}</td>
                <td class="scr-tags-cell">${renderTags(s.tags)}</td>
              </tr>
            `;
          } else {
            colCount = 9;
            headCellsDef = [
              ['industry',   'INDUSTRY'],
              ['ticker',     'TICKER'],
              ['name',       'NAME'],
              ['sector',     'SECTOR'],
              ['market_cap', 'MCAP'],
              ['pe_ratio',   'P/E'],
              ['roe',        'ROE'],
              ['net_margin', 'NM%'],
              ['return_1y',  'RET 1Y'],
            ];
            rowRenderer = (s) => `
              <tr>
                <td class="pat">${s.industry || '—'}</td>
                <td class="tk clickable" data-tk="${s.ticker}">${s.ticker}</td>
                <td class="pat">${s.name || '—'}</td>
                <td class="pat">${s.sector || '—'}</td>
                <td class="mono">${fmt_.compact(s.market_cap)}</td>
                <td class="mono">${fmt_.num(s.pe_ratio, 1)}</td>
                <td class="mono ${s.roe >= 0.15 ? 'num-up' : s.roe < 0 ? 'num-dn' : ''}">${s.roe != null ? (s.roe * 100).toFixed(1) + '%' : '—'}</td>
                <td class="mono ${s.net_margin >= 0.1 ? 'num-up' : s.net_margin < 0 ? 'num-dn' : ''}">${s.net_margin != null ? (s.net_margin * 100).toFixed(1) + '%' : '—'}</td>
                <td class="mono ${s.return_1y >= 0 ? 'num-up' : 'num-dn'}">${s.return_1y != null ? (s.return_1y >= 0 ? '+' : '') + s.return_1y.toFixed(1) + '%' : '—'}</td>
              </tr>
            `;
          }
        } else if (state.universeMode === 'allus') {
          displayRows = sortedList(filtered).slice(0, 200);
          colCount = 9;
          headCellsDef = [
            ['ticker',         'TICKER'],
            ['name',           'NAME'],
            ['sector',         'SECTOR'],
            ['industry',       'INDUSTRY'],
            ['market_cap',     'MCAP'],
            ['price',          'PRICE'],
            ['beta',           'BETA'],
            ['dividend_yield', 'DIV'],
            [null,             'THEMES'],
          ];
          rowRenderer = (s) => `
            <tr>
              <td class="tk clickable" data-tk="${s.ticker}">${s.ticker}</td>
              <td class="pat">${s.name || '—'}</td>
              <td class="pat">${s.sector || '—'}</td>
              <td class="pat">${s.industry || '—'}</td>
              <td class="mono">${fmt_.compact(s.market_cap)}</td>
              <td class="mono">${s.price != null ? '$' + s.price.toFixed(2) : '—'}</td>
              <td class="mono">${s.beta != null ? s.beta.toFixed(2) : '—'}</td>
              <td class="mono">${s.dividend_yield ? (s.dividend_yield * 100).toFixed(2) + '%' : '—'}</td>
              <td class="scr-tags-cell">${renderTags(s.tags)}</td>
            </tr>
          `;
        } else {
          displayRows = sortedList(filtered).slice(0, 120);
          colCount = 10;
          headCellsDef = [
            ['ticker',     'TICKER'],
            ['name',       'NAME'],
            ['sector',     'SECTOR'],
            ['industry',   'INDUSTRY'],
            ['market_cap', 'MCAP'],
            ['pe_ratio',   'P/E'],
            ['roe',        'ROE'],
            ['dividend_yield', 'DIV'],
            ['net_margin', 'NM%'],
            ['return_1y',  'RET 1Y'],
          ];
          rowRenderer = (s) => `
            <tr>
              <td class="tk clickable" data-tk="${s.ticker}">${s.ticker}</td>
              <td class="pat">${s.name || '—'}</td>
              <td class="pat">${s.sector || '—'}</td>
              <td class="pat">${s.industry || '—'}</td>
              <td class="mono">${fmt_.compact(s.market_cap)}</td>
              <td class="mono">${fmt_.num(s.pe_ratio, 1)}</td>
              <td class="mono ${s.roe >= 0.15 ? 'num-up' : s.roe < 0 ? 'num-dn' : ''}">${s.roe != null ? (s.roe * 100).toFixed(1) + '%' : '—'}</td>
              <td class="mono">${s.dividend_yield != null ? (s.dividend_yield * 100).toFixed(2) + '%' : '—'}</td>
              <td class="mono ${s.net_margin >= 0.1 ? 'num-up' : s.net_margin < 0 ? 'num-dn' : ''}">${s.net_margin != null ? (s.net_margin * 100).toFixed(1) + '%' : '—'}</td>
              <td class="mono ${s.return_1y >= 0 ? 'num-up' : 'num-dn'}">${s.return_1y != null ? (s.return_1y >= 0 ? '+' : '') + s.return_1y.toFixed(1) + '%' : '—'}</td>
            </tr>
          `;
        }

        const rows = displayRows.map(rowRenderer).join('');
        const headCells = headCellsDef
          .map(([k, lbl]) => k
            ? `<th class="scr-th" data-sort-key="${k}">${lbl} ${sortArrow(k)}</th>`
            : `<th class="scr-th-nosort">${lbl}</th>`
          ).join('');

        const bodyEl = body.querySelector('#scr-results-body');
        if (bodyEl) bodyEl.innerHTML = rows || `<tr><td colspan="${colCount}" class="empty">no matches — loosen filters or clear</td></tr>`;
        const headEl = body.querySelector('#scr-results-head');
        if (headEl) headEl.innerHTML = `<tr>${headCells}</tr>`;
        const countEl = body.querySelector('#scr-count');
        const uniEl   = body.querySelector('#scr-universe');
        if (countEl) {
          if (state.industryLeaderMode) {
            countEl.textContent = `${displayRows.length} industry leaders`;
          } else if (state.universeMode === 'allus') {
            const cap = 200;
            countEl.textContent = `${filtered.length} matches · top ${Math.min(cap, filtered.length)} shown`;
          } else {
            countEl.textContent = `${filtered.length} matches · top ${Math.min(120, filtered.length)} shown`;
          }
        }
        if (uniEl) uniEl.textContent = `UNIVERSE · ${stocks.length}`;
      }

      function rerenderFilters() {
        const wrap = body.querySelector('#scr-filter-rows');
        if (wrap) wrap.innerHTML = state.filters.map((f, i) => renderFilterRow(i, f)).join('');
        // reflect active preset highlight
        body.querySelectorAll('.scr-preset-btn').forEach((b) => b.classList.toggle('active', b.dataset.preset === state.activePreset));
        attachFilterHandlers();
      }

      function reRun() {
        window._scrState = { ...state };
        const filtered = applyFilters();
        renderResults(filtered);
      }

      function attachFilterHandlers() {
        body.querySelectorAll('.scr-f-metric, .scr-f-op, .scr-f-val').forEach((el) => {
          el.addEventListener('change', readFilters);
          el.addEventListener('input', debouncedReadFilters);
        });
        body.querySelectorAll('.scr-f-rm').forEach((btn) => btn.addEventListener('click', () => {
          const idx = Number(btn.dataset.idx);
          state.filters.splice(idx, 1);
          state.activePreset = null;
          rerenderFilters();
          reRun();
        }));
      }

      let readTimer = null;
      function debouncedReadFilters() {
        if (readTimer) clearTimeout(readTimer);
        readTimer = setTimeout(readFilters, 200);
      }
      function readFilters() {
        const rows = body.querySelectorAll('.scr-filter-row');
        state.filters = Array.from(rows).map((r) => ({
          m:  r.querySelector('.scr-f-metric').value,
          op: r.querySelector('.scr-f-op').value,
          v:  r.querySelector('.scr-f-val').value,
        }));
        state.activePreset = null;
        state.industryLeaderMode = false;
        body.querySelectorAll('.scr-preset-btn').forEach((b) => b.classList.toggle('active', false));
        reRun();
      }

      // Build initial shell
      body.innerHTML = `
        <div class="mod-head">
          <div class="mod-title">${window.OC_TITLE('screener')} · FUNDAMENTALS SCREENER</div>
          <div class="mod-meta">
            <span class="chip" id="scr-count">${stocks.length} loaded</span>
            <span class="chip" id="scr-universe">UNIVERSE · ${stocks.length}</span>
            <span class="chip chip-dim">${fmt_.ago(coreData.generated_at)}</span>
          </div>
        </div>

        <div class="mod-panel">
          <div class="mod-panel-title">PRESETS</div>
          <div class="scr-presets-row">
            <button class="scr-preset-btn" data-preset="value">VALUE</button>
            <button class="scr-preset-btn" data-preset="growth">GROWTH</button>
            <button class="scr-preset-btn" data-preset="dividend">DIVIDEND</button>
            <button class="scr-preset-btn" data-preset="quality">QUALITY</button>
            <span class="scr-preset-sep">│</span>
            <button class="scr-preset-btn" data-preset="industry-leaders">INDUSTRY LEADERS</button>
            <span class="scr-preset-sep">│</span>
            <button class="scr-preset-btn scr-preset-clear" data-preset="clear">CLEAR ALL</button>
          </div>
        </div>

        <div class="mod-panel">
          <div class="mod-panel-title">FILTERS <span class="scr-hint">· numeric percents enter as &ldquo;15&rdquo; for 15%; market-cap accepts 10B · 500M · 100K</span></div>
          <div class="scr-universe-row">
            <span class="scr-lbl">UNIVERSE</span>
            <button class="scr-uni-btn active" data-uni="core">CORE · ${coreData.count || stocks.length}</button>
            <button class="scr-uni-btn" data-uni="allus">ALL US · ~5K</button>
            <input class="scr-text-search stk-tick-input" id="scr-text-search" type="search"
                   placeholder="search ticker, company or industry…" autocomplete="off">
          </div>
          <div class="scr-dropdown-row">
            <label>Sector
              <select id="scr-sector">
                <option value="All">All</option>
                ${sortedSectors.map((s) => `<option value="${s}"${s === state.sector ? ' selected' : ''}>${s}</option>`).join('')}
              </select>
            </label>
            <label>Industry
              <select id="scr-industry"><option value="All">All</option></select>
            </label>
          </div>
          <div id="scr-filter-rows"></div>
          <button class="scr-add-btn" id="scr-add-filter">+ ADD FILTER</button>
        </div>

        <div class="mod-panel">
          <div class="mod-panel-title">RESULTS · click ticker to open EQ · click column to sort</div>
          <div class="tbl-wrap">
            <table class="tbl-dense scr-results-table">
              <thead id="scr-results-head"></thead>
              <tbody id="scr-results-body"></tbody>
            </table>
          </div>
        </div>
      `;

      function refreshIndustryOptions() {
        const sel = body.querySelector('#scr-industry');
        if (!sel) return;
        const list = state.sector === 'All' ? [] : Object.keys(indByS[state.sector] || {}).sort();
        sel.innerHTML = '<option value="All">All</option>' +
          list.map((ind) => `<option value="${ind}"${ind === state.industry ? ' selected' : ''}>${ind}</option>`).join('');
      }

      // Preset handler
      body.querySelectorAll('.scr-preset-btn').forEach((btn) => btn.addEventListener('click', () => {
        const preset = btn.dataset.preset;
        if (preset === 'clear') {
          state.filters = [];
          state.sector = 'All';
          state.industry = 'All';
          state.activePreset = null;
          state.industryLeaderMode = false;
          body.querySelector('#scr-sector').value = 'All';
          const searchEl = body.querySelector('#scr-text-search');
          if (searchEl) { searchEl.value = ''; state.textSearch = ''; }
          refreshIndustryOptions();
        } else if (preset === 'industry-leaders') {
          state.filters = [];
          state.activePreset = 'industry-leaders';
          state.industryLeaderMode = true;
        } else {
          state.filters = SCR_PRESETS[preset].map((f) => ({ ...f }));
          state.activePreset = preset;
          state.industryLeaderMode = false;
        }
        rerenderFilters();
        reRun();
      }));

      // Sector dropdown
      body.querySelector('#scr-sector').addEventListener('change', (ev) => {
        state.sector = ev.target.value;
        state.industry = 'All';
        refreshIndustryOptions();
        reRun();
      });
      // Industry dropdown
      body.addEventListener('change', (ev) => {
        if (ev.target && ev.target.id === 'scr-industry') {
          state.industry = ev.target.value;
          reRun();
        }
      });
      // Add-filter button
      body.querySelector('#scr-add-filter').addEventListener('click', () => {
        state.filters.push({ m: 'pe_ratio', op: '<', v: '' });
        state.activePreset = null;
        rerenderFilters();
      });
      // Column sort
      body.addEventListener('click', (ev) => {
        const th = ev.target.closest('.scr-th[data-sort-key]');
        if (!th) return;
        const key = th.dataset.sortKey;
        if (state.sort.key === key) state.sort.asc = !state.sort.asc;
        else { state.sort.key = key; state.sort.asc = (key === 'ticker' || key === 'name' || key === 'sector' || key === 'industry'); }
        reRun();
      });

      // Show/hide metric-only UI depending on universe mode
      function updateModeUI() {
        const isAllus = state.universeMode === 'allus';
        const filterRows = body.querySelector('#scr-filter-rows');
        const addBtn     = body.querySelector('#scr-add-filter');
        if (filterRows) filterRows.style.display = isAllus ? 'none' : '';
        if (addBtn)     addBtn.style.display     = isAllus ? 'none' : '';
        // Grey out fundamental presets in ALL US (no P/E / ROE data available)
        body.querySelectorAll('.scr-preset-btn').forEach((b) => {
          const fundamental = !['industry-leaders', 'clear'].includes(b.dataset.preset);
          b.disabled     = isAllus && fundamental;
          b.style.opacity = (isAllus && fundamental) ? '0.35' : '';
        });
        // Update universe button active state
        body.querySelectorAll('.scr-uni-btn').forEach((b) =>
          b.classList.toggle('active', b.dataset.uni === state.universeMode));
      }

      // Universe toggle — lazy-loads screener_universe.json on first click
      body.addEventListener('click', async (ev) => {
        const btn = ev.target.closest('[data-uni]');
        if (!btn || btn.disabled) return;
        const mode = btn.dataset.uni;
        if (mode === state.universeMode) return;

        if (mode === 'allus') {
          if (!allusData) {
            btn.textContent = 'Loading…';
            btn.disabled = true;
            try {
              allusData = await fetchJSON(`${BASE}/screener_universe.json`);
            } finally {
              btn.disabled = false;
              btn.textContent = `ALL US · ${allusData ? allusData.count : '~5K'}`;
            }
          }
          stocks = allusData.stocks || [];
        } else {
          stocks = coreData.stocks || [];
        }

        state.universeMode  = mode;
        state.filters       = [];
        state.activePreset  = null;
        state.industryLeaderMode = false;
        state.textSearch    = '';
        state.sector        = 'All';
        state.industry      = 'All';

        rebuildSectorIndex(stocks);
        const searchEl = body.querySelector('#scr-text-search');
        if (searchEl) searchEl.value = '';
        body.querySelector('#scr-sector').value = 'All';
        refreshIndustryOptions();
        updateModeUI();
        rerenderFilters();
        reRun();
      });

      // Text search
      body.querySelector('#scr-text-search').addEventListener('input', (ev) => {
        state.textSearch = ev.target.value;
        reRun();
      });

      refreshIndustryOptions();
      rerenderFilters();
      updateModeUI();
      reRun();
      attachTickerClicks(body);
      // Re-attach clicks on result rerender
      const obs = new MutationObserver(() => attachTickerClicks(body));
      const bodyEl = body.querySelector('#scr-results-body');
      if (bodyEl) obs.observe(bodyEl, { childList: true });
    } catch (e) { body.innerHTML = `<div class="mod-err">${e.message}</div>`; }
  }

  // local alias so the large function above reads cleanly
  const fmt_ = fmt;

  /* ── F6 SCTR — Technical Rank, US + TSX (full list, sortable, searchable) */
  const SCTR_COLS = [
    { key: 'ticker',     label: 'TICKER',  type: 'str', cls: '' },
    { key: 'name',       label: 'NAME',    type: 'str', cls: '' },
    { key: 'price',      label: 'PRICE',   type: 'num', cls: 'num' },
    { key: 'chg_pct',    label: 'CHG',     type: 'num', cls: 'num' },
    { key: 'sctr_raw',   label: 'TR SCORE', type: 'num', cls: 'num' },
    { key: 'sctr_rank',  label: '%ILE',    type: 'num', cls: 'num' },
    { key: 'rs_trend',   label: 'TREND',   type: 'str', cls: '' },
    { key: 'rs',         label: 'RS',      type: null,  cls: '' },  // sparkline, not sortable
  ];

  async function renderSCTR(body) {
    body.innerHTML = `<div class="mod-loading">Loading Technical Rank…</div>`;
    try {
      const d = await fetchJSON(`${BASE}/sctr.json`);

      body.innerHTML = `
        <div class="mod-head">
          <div class="mod-title">${window.OC_TITLE('sctr')} · TECHNICAL RANK</div>
          <div class="mod-meta"><span class="chip chip-dim">${fmt.ago(d.us?.updated)}</span></div>
        </div>
        <div class="mod-grid-2">
          <div>${panelShell('us', d.us)}</div>
          <div>${panelShell('tsx', d.tsx)}</div>
        </div>
        <div class="small" style="margin-top:6px;color:var(--fg-dim);font-size:10px">
          Methodology inspired by <a href="https://stockcharts.com/school/doku.php?id=chart_school:technical_indicators:sctr" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline;opacity:0.7">StockCharts Technical Rank (SCTR®)</a> — independently computed from public data via yfinance.
        </div>
      `;
      wireSctrPanel(body, 'us', d.us);
      wireSctrPanel(body, 'tsx', d.tsx);
      attachTickerClicks(body);
    } catch (e) { body.innerHTML = `<div class="mod-err">${e.message}</div>`; }
  }

  function panelShell(key, u) {
    if (!u) return '';
    const title = `${u.label || key.toUpperCase()} · vs ${u.benchmark || '—'}`;
    return `
      <div class="mod-panel" data-sctr-panel="${key}">
        <div class="mod-panel-title">
          ${title} · <span class="sctr-count mono">${u.count} stocks</span>
          <input type="search" class="sctr-search stk-tick-input" placeholder="filter ticker/name…" style="margin-left:8px;min-width:140px">
        </div>
        <div class="tbl-wrap" style="max-height:calc(100vh - 210px)">
          <table class="tbl-dense">
            <thead><tr>
              ${SCTR_COLS.map(c => c.type
                ? `<th class="sctr-th${c.cls ? ' '+c.cls : ''}" data-col="${c.key}">${c.label} <span class="sctr-sort-arrow" style="opacity:0.3">▾</span></th>`
                : `<th class="${c.cls}">${c.label}</th>`).join('')}
            </tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    `;
  }

  function wireSctrPanel(body, key, u) {
    if (!u) return;
    const panelEl = body.querySelector(`[data-sctr-panel="${key}"]`);
    if (!panelEl) return;
    const tbody = panelEl.querySelector('tbody');
    const countEl = panelEl.querySelector('.sctr-count');
    const searchEl = panelEl.querySelector('.sctr-search');
    const ths = panelEl.querySelectorAll('.sctr-th');

    const state = { sortCol: 'sctr_rank', sortDir: 'desc', query: '' };

    function render() {
      const q = state.query.trim().toUpperCase();
      let list = (u.stocks || []).slice();
      if (q) {
        list = list.filter(s =>
          (s.ticker || '').toUpperCase().includes(q) ||
          (s.name || '').toUpperCase().includes(q));
      }
      const col = SCTR_COLS.find(c => c.key === state.sortCol);
      list.sort((a, b) => {
        const av = a[state.sortCol], bv = b[state.sortCol];
        if (col && col.type === 'str') {
          const cmp = String(av || '').localeCompare(String(bv || ''));
          return state.sortDir === 'asc' ? cmp : -cmp;
        }
        const an = (av == null || !isFinite(av)) ? -Infinity : Number(av);
        const bn = (bv == null || !isFinite(bv)) ? -Infinity : Number(bv);
        return state.sortDir === 'asc' ? an - bn : bn - an;
      });

      tbody.innerHTML = list.map(s => {
        const spark = window.OC_CHART && s.rs_sparkline ? window.OC_CHART.sparkline(s.rs_sparkline, { w: 70, h: 16 }) : '';
        const trendCls = s.rs_trend === 'rising' ? 'num-up' : s.rs_trend === 'falling' ? 'num-dn' : '';
        return `<tr>
          <td class="tk clickable" data-tk="${s.ticker}">${s.ticker}</td>
          <td class="pat">${s.name || '—'}</td>
          <td class="mono">${fmt.num(s.price, 2)}</td>
          <td class="mono ${pnlCls(s.chg_pct)}">${fmt.pct(s.chg_pct)}</td>
          <td class="mono">${fmt.num(s.sctr_raw, 1)}</td>
          <td class="mono">${fmt.num(s.sctr_rank, 0)}</td>
          <td class="${trendCls}" style="text-align:center">${s.rs_trend || '—'}</td>
          <td class="spark-cell">${spark}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="8" class="empty">no matches</td></tr>';

      if (countEl) countEl.textContent = q
        ? `${list.length} of ${u.count} stocks`
        : `${u.count} stocks`;

      ths.forEach(th => {
        const isActive = th.dataset.col === state.sortCol;
        th.classList.toggle('sctr-sorted', isActive);
        const arrow = th.querySelector('.sctr-sort-arrow');
        if (arrow) {
          arrow.textContent = isActive ? (state.sortDir === 'desc' ? '▾' : '▴') : '▾';
          arrow.style.opacity = isActive ? '1' : '0.3';
        }
      });

      attachTickerClicks(panelEl);
    }

    if (searchEl) {
      searchEl.addEventListener('input', (e) => {
        state.query = e.target.value;
        render();
      });
    }
    ths.forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.col;
        if (!col) return;
        if (state.sortCol === col) state.sortDir = state.sortDir === 'desc' ? 'asc' : 'desc';
        else { state.sortCol = col; state.sortDir = (col === 'ticker' || col === 'name') ? 'asc' : 'desc'; }
        render();
      });
    });
    ths.forEach(th => { if (th.dataset.col) th.style.cursor = 'pointer'; });
    render();
  }

  /* ── F7 GEX — Gamma exposure · master-detail ───────────────
     Universe view: butterfly chart + pos/neg tables (click ticker → detail).
     Detail view:   per-ticker KPIs, Greeks, strike chart, Greeks table.
     Ticker selection persists via pane.params.gexTicker so deep-links work. */
  async function renderGEX(body, ctx) {
    body.innerHTML = `<div class="mod-loading">Loading GEX…</div>`;
    try {
      const d = await fetchJSON(`${BASE}/gex_index.json`);
      // Cache on body so detail → close doesn't refetch
      body._gexUniverse = d;

      const preTicker = (ctx && ctx.params && ctx.params.gexTicker) || null;
      if (preTicker) {
        renderGexUniverseShell(body, d);  // mod-head + strip (no butterfly/tables)
        await showGexDetail(body, preTicker);
      } else {
        renderGexUniverse(body, d);
      }
    } catch (e) { body.innerHTML = `<div class="mod-err">${e.message}</div>`; }
  }

  function renderGexUniverseShell(body, d) {
    body.innerHTML = `
      <div class="mod-head">
        <div class="mod-title">${window.OC_TITLE('gex')} · GAMMA EXPOSURE</div>
        <div class="mod-meta">
          <span class="chip">TOTAL · ${d.total}</span>
          <span class="chip num-up">POS · ${d.positive_count}</span>
          <span class="chip num-dn">NEG · ${d.negative_count}</span>
          <span class="chip chip-dim">${fmt.ago(d.updated)}</span>
        </div>
      </div>
      <div id="gex-main"></div>
    `;
  }

  function renderGexUniverse(body, d) {
    const stocks = d.stocks || [];
    const totalPos = stocks.filter(s => s.net_gex > 0).reduce((a, s) => a + s.net_gex, 0);
    const totalNeg = stocks.filter(s => s.net_gex < 0).reduce((a, s) => a + s.net_gex, 0);
    const netMarket = totalPos + totalNeg;
    const posNegRatio = totalNeg ? Math.abs(totalPos / totalNeg) : null;

    const topPos = stocks.filter(s => s.net_gex > 0).sort((a, b) => b.net_gex - a.net_gex).slice(0, 10);
    const topNeg = stocks.filter(s => s.net_gex < 0).sort((a, b) => a.net_gex - b.net_gex).slice(0, 10);
    const butterfly = [...topPos, ...topNeg.reverse()];
    const maxMag = Math.max(...butterfly.map(s => Math.abs(s.net_gex)), 1);

    const bar = (s) => {
      const gex = s.net_gex;
      const pct = Math.min(100, (Math.abs(gex) / maxMag) * 100);
      const isPos = gex >= 0;
      const tooltip = `${s.ticker}: $${(gex / 1e9).toFixed(2)}B net GEX · spot ${s.spot?.toFixed(2)} · ${(s.chg_pct >= 0 ? '+' : '') + (s.chg_pct?.toFixed(2) || '0')}%`;
      return `
        <div class="gex-row" title="${tooltip}">
          <span class="gex-ticker gex-tk-click" data-tk="${s.ticker}" style="cursor:pointer">${s.ticker}</span>
          <div class="gex-bar-half gex-left">
            ${!isPos ? `<div class="gex-bar gex-neg" style="width:${pct.toFixed(1)}%"></div>` : ''}
          </div>
          <div class="gex-bar-half gex-right">
            ${isPos ? `<div class="gex-bar gex-pos" style="width:${pct.toFixed(1)}%"></div>` : ''}
          </div>
          <span class="gex-val mono ${isPos ? 'num-up' : 'num-dn'}">${isPos ? '+' : ''}${fmt.compact(gex)}</span>
        </div>
      `;
    };

    body.innerHTML = `
      <div class="mod-head">
        <div class="mod-title">${window.OC_TITLE('gex')} · GAMMA EXPOSURE</div>
        <div class="mod-meta">
          <span class="chip">TOTAL · ${d.total}</span>
          <span class="chip num-up">POS · ${d.positive_count}</span>
          <span class="chip num-dn">NEG · ${d.negative_count}</span>
          <span class="chip chip-dim">${fmt.ago(d.updated)}</span>
        </div>
      </div>
      <div id="gex-main"></div>
    `;
    const main = body.querySelector('#gex-main');
    main.innerHTML = renderGexUniverseBody(d, stocks, totalPos, totalNeg, netMarket, posNegRatio, butterfly, bar);
    body._gexUniverse = d;
    wireGexTable(body, 'pos', stocks.filter(s => s.net_gex > 0));
    wireGexTable(body, 'neg', stocks.filter(s => s.net_gex < 0));
    // Butterfly ticker click → detail view (table ticker clicks are wired
    // inside wireGexTable.render() since that DOM re-renders on sort/search).
    body.querySelectorAll('.gex-row .gex-tk-click').forEach(el => {
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const tk = el.dataset.tk;
        if (!tk) return;
        if (window.OC_UPDATE_PANE_PARAMS) window.OC_UPDATE_PANE_PARAMS({ gexTicker: tk });
        renderGexUniverseShell(body, d);
        showGexDetail(body, tk);
      });
    });
  }

  function renderGexMarketState(d) {
    const stocks = d.stocks || [];
    const spy = stocks.find(s => s.ticker === 'SPY') || null;

    // Fallback to universe majority if SPY is missing (shouldn't happen, but safe)
    const regime = spy
      ? spy.regime
      : ((d.positive_count || 0) >= (d.negative_count || 0) ? 'positive' : 'negative');
    const isPos = regime === 'positive';
    const klass = isPos ? 'gex-state-positive' : 'gex-state-negative';
    const label = isPos ? 'STABILITY BUFFER' : 'VOLATILITY ACCELERATOR';

    const narrative = isPos
      ? 'Dealers buy dips and sell rallies, dampening volatility. Expect mean-reverting price action and pins at major strikes. Driven by income strategies (covered calls, cash-secured puts). Lower expected realized volatility.'
      : 'Dealers sell dips and buy rallies, amplifying moves. Expect trend continuation, gap risk, and elevated realized volatility. Driven by speculation and fear (long puts, leverage). Trends accelerate until the gamma flip is reached.';

    const total = d.total || ((d.positive_count || 0) + (d.negative_count || 0)) || 1;
    const posPct = Math.round(((d.positive_count || 0) / total) * 100);
    const negPct = Math.round(((d.negative_count || 0) / total) * 100);

    let spyLine = '';
    if (spy) {
      const gexBn = spy.net_gex_bn != null ? spy.net_gex_bn : (spy.net_gex || 0) / 1e9;
      const gexSign = gexBn >= 0 ? '+' : '−';
      const gexCls = gexBn >= 0 ? 'num-up' : 'num-dn';
      const chg = spy.chg_pct != null ? spy.chg_pct : 0;
      const chgSign = chg >= 0 ? '+' : '';
      const chgCls = chg >= 0 ? 'num-up' : 'num-dn';
      spyLine = `
        <span class="chip">SPY NET GEX <span class="mono ${gexCls}">${gexSign}$${Math.abs(gexBn).toFixed(2)}B</span></span>
        <span class="chip">SPOT <span class="mono">$${(spy.spot || 0).toFixed(2)}</span> <span class="mono ${chgCls}">${chgSign}${chg.toFixed(2)}%</span></span>
      `;
    }

    return `
      <div class="gex-state-hero ${klass}">
        <div class="gex-state-headline">
          <span class="gex-state-tag">GAMMA REGIME · ${isPos ? 'POSITIVE' : 'NEGATIVE'}</span>
          <span class="gex-state-label">${label}</span>
        </div>
        <div class="gex-state-stats">
          ${spyLine}
          <span class="chip">UNIVERSE <span class="mono">${posPct}% POS / ${negPct}% NEG</span></span>
        </div>
        <div class="gex-state-narrative">${narrative}</div>
      </div>
    `;
  }

  function renderGexUniverseBody(d, stocks, totalPos, totalNeg, netMarket, posNegRatio, butterfly, bar) {
    return `
        ${renderGexMarketState(d)}

        <div class="acct-strip">
          <div class="acct-card"><div class="acct-name">TOTAL POSITIVE GEX</div><div class="acct-val"><span class="mono num-up">+${fmt.compact(totalPos)}</span></div><div class="acct-meta"><span>${d.positive_count} tickers dealer long</span></div></div>
          <div class="acct-card"><div class="acct-name">TOTAL NEGATIVE GEX</div><div class="acct-val"><span class="mono num-dn">${fmt.compact(totalNeg)}</span></div><div class="acct-meta"><span>${d.negative_count} tickers dealer short</span></div></div>
          <div class="acct-card"><div class="acct-name">NET MARKET GEX</div><div class="acct-val"><span class="mono ${netMarket >= 0 ? 'num-up' : 'num-dn'}">${netMarket >= 0 ? '+' : ''}${fmt.compact(netMarket)}</span></div><div class="acct-meta"><span>${netMarket >= 0 ? 'dealers long → pinning' : 'dealers short → trending'}</span></div></div>
          <div class="acct-card"><div class="acct-name">POS / NEG RATIO</div><div class="acct-val"><span class="mono">${posNegRatio != null ? posNegRatio.toFixed(2) + '×' : '—'}</span></div><div class="acct-meta"><span>how dominant the long side</span></div></div>
        </div>

        <div class="mod-panel">
          <div class="mod-panel-title">NET GEX · TOP 10 POSITIVE + TOP 10 NEGATIVE · butterfly summary</div>
          <div class="gex-bars">
            ${butterfly.map(bar).join('')}
            <div class="gex-axis-label">
              <span>← dealer short gamma</span>
              <span class="gex-axis-center">0</span>
              <span>dealer long gamma →</span>
            </div>
          </div>
        </div>

        <div class="mod-grid-2">
          ${gexTableShell('pos', 'POSITIVE · pinning zones · dealer long gamma', stocks.filter(s => s.net_gex > 0))}
          ${gexTableShell('neg', 'NEGATIVE · acceleration risk · dealer short gamma', stocks.filter(s => s.net_gex < 0))}
        </div>
    `;
  }

  const GEX_COLS = [
    { key: 'ticker',          label: 'TICKER',  type: 'str' },
    { key: 'spot',            label: 'SPOT',    type: 'num' },
    { key: 'chg_pct',         label: 'CHG',     type: 'num' },
    { key: 'put_call_ratio',  label: 'P/C',     type: 'num' },
    { key: 'avg_iv',          label: 'IV',      type: 'num' },
    { key: 'iv_rank',         label: 'IVR',     type: 'num', glossary: 'IVR' },
    { key: 'iv_percentile',   label: 'IVP',     type: 'num', glossary: 'IVP' },
    { key: 'net_gex',         label: 'GEX',     type: 'num' },
  ];

  function gexTableShell(sign, title, list) {
    return `
      <div class="mod-panel" data-gex-panel="${sign}">
        <div class="mod-panel-title">
          <span class="gex-count mono">${list.length}</span> ${title}
          <input type="search" class="gex-search stk-tick-input" placeholder="filter ticker…" style="margin-left:8px;min-width:140px">
        </div>
        <div class="tbl-wrap" style="max-height:calc(100vh - 340px)">
          <table class="tbl-dense">
            <thead><tr>
              ${GEX_COLS.map(c => `<th class="gex-th" data-col="${c.key}"${c.glossary ? ` data-glossary="${c.glossary}"` : ''}>${c.label} <span class="gex-sort-arrow" style="opacity:0.3">▾</span></th>`).join('')}
            </tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    `;
  }

  function wireGexTable(body, sign, list) {
    const panelEl = body.querySelector(`[data-gex-panel="${sign}"]`);
    if (!panelEl) return;
    const tbody = panelEl.querySelector('tbody');
    const countEl = panelEl.querySelector('.gex-count');
    const searchEl = panelEl.querySelector('.gex-search');
    const ths = panelEl.querySelectorAll('.gex-th');
    const total = list.length;

    const state = { sortCol: 'net_gex', sortDir: sign === 'pos' ? 'desc' : 'asc', query: '' };

    function render() {
      const q = state.query.trim().toUpperCase();
      let rows = list.slice();
      if (q) rows = rows.filter(s => (s.ticker || '').toUpperCase().includes(q));
      const col = GEX_COLS.find(c => c.key === state.sortCol);
      rows.sort((a, b) => {
        const av = a[state.sortCol], bv = b[state.sortCol];
        if (col && col.type === 'str') {
          const cmp = String(av || '').localeCompare(String(bv || ''));
          return state.sortDir === 'asc' ? cmp : -cmp;
        }
        const an = (av == null || !isFinite(av)) ? -Infinity : Number(av);
        const bn = (bv == null || !isFinite(bv)) ? -Infinity : Number(bv);
        return state.sortDir === 'asc' ? an - bn : bn - an;
      });

      tbody.innerHTML = rows.map(s => `<tr>
        <td class="tk gex-tk-click" data-tk="${s.ticker}" style="cursor:pointer">${s.ticker}</td>
        <td class="mono">${fmt.num(s.spot, 2)}</td>
        <td class="mono ${pnlCls(s.chg_pct)}">${fmt.pct(s.chg_pct)}</td>
        <td class="mono">${fmt.num(s.put_call_ratio, 2)}</td>
        <td class="mono">${fmt.num(s.avg_iv, 0)}%</td>
        <td class="mono ${s.iv_rank != null && s.iv_rank > 80 ? 'num-dn' : s.iv_rank != null && s.iv_rank < 20 ? 'num-up' : ''}">${s.iv_rank != null ? fmt.num(s.iv_rank, 0) + '%' : '—'}</td>
        <td class="mono">${s.iv_percentile != null ? fmt.num(s.iv_percentile, 0) + '%' : '—'}</td>
        <td class="mono ${sign === 'pos' ? 'num-up' : 'num-dn'}">${fmt.compact(s.net_gex)}</td>
      </tr>`).join('') || '<tr><td colspan="8" class="empty">no matches</td></tr>';

      if (countEl) countEl.textContent = q ? `${rows.length} of ${total}` : String(total);

      ths.forEach(th => {
        const active = th.dataset.col === state.sortCol;
        const arrow = th.querySelector('.gex-sort-arrow');
        if (arrow) {
          arrow.textContent = active ? (state.sortDir === 'desc' ? '▾' : '▴') : '▾';
          arrow.style.opacity = active ? '1' : '0.3';
        }
      });

      // Ticker click → show GEX detail (not stock-analysis) within this module.
      // We use closest(#gex-main) to find the pane body; falls back to panelEl's parents.
      panelEl.querySelectorAll('td.gex-tk-click').forEach(td => {
        td.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const tk = td.dataset.tk;
          if (!tk) return;
          const bodyEl = panelEl.closest('.pane-body') || panelEl.parentElement?.closest('.pane-body');
          if (!bodyEl) return;
          if (window.OC_UPDATE_PANE_PARAMS) window.OC_UPDATE_PANE_PARAMS({ gexTicker: tk });
          renderGexUniverseShell(bodyEl, bodyEl._gexUniverse);
          showGexDetail(bodyEl, tk);
        });
      });
    }

    if (searchEl) searchEl.addEventListener('input', (e) => { state.query = e.target.value; render(); });
    ths.forEach(th => {
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => {
        const col = th.dataset.col;
        if (state.sortCol === col) state.sortDir = state.sortDir === 'desc' ? 'asc' : 'desc';
        else { state.sortCol = col; state.sortDir = col === 'ticker' ? 'asc' : 'desc'; }
        render();
      });
    });
    render();
  }

  /* ── GEX detail view ─────────────────────────────────────────
     Loads /data/gex/{TICKER}.json, replaces #gex-main with a per-ticker
     brief (KPIs, levels, Greeks, strike chart, Greeks table). Close button
     restores the universe view from body._gexUniverse. */
  async function showGexDetail(body, ticker) {
    const main = body.querySelector('#gex-main');
    if (!main) return;
    main.innerHTML = `<div class="mod-loading">Loading ${ticker} detail…</div>`;
    let td;
    try {
      td = await fetchJSON(`https://stocks.clawmo.tech/data/gex/${encodeURIComponent(ticker)}.json`);
    } catch (e) {
      main.innerHTML = `<div class="mod-err">No detail available for ${escapeGex(ticker)} — ${escapeGex(e.message)}</div>
        <div style="margin-top:8px"><button class="gex-back-btn" type="button">← back to universe</button></div>`;
      wireGexBack(body, main);
      return;
    }
    main.innerHTML = renderGexDetailHtml(td);
    wireGexBack(body, main);
    // EQ link
    const eq = main.querySelector('.gex-open-eq');
    if (eq) eq.addEventListener('click', (ev) => {
      ev.preventDefault();
      if (window.OC_OPEN_MODULE) window.OC_OPEN_MODULE('stock-analysis', { ticker: td.ticker });
    });
  }

  function closeGexDetail(body) {
    if (window.OC_UPDATE_PANE_PARAMS) window.OC_UPDATE_PANE_PARAMS({ gexTicker: null });
    const d = body._gexUniverse;
    if (d) renderGexUniverse(body, d);
    else renderGEX(body, {});  // fallback: refetch
  }

  function wireGexBack(body, scope) {
    const btn = scope.querySelector('.gex-back-btn');
    if (btn) btn.addEventListener('click', () => closeGexDetail(body));
  }

  function renderGexDetailHtml(td) {
    const netCls = td.net_gex >= 0 ? 'num-up' : 'num-dn';
    const regimeLabel = td.regime === 'positive' ? 'POSITIVE · stabilizing' : 'NEGATIVE · amplifying';
    const regimeCls = td.regime === 'positive' ? 'num-up' : 'num-dn';
    const pc = td.put_call_ratio;
    const pcCls = pc == null ? '' : pc > 1 ? 'num-dn' : pc > 0.7 ? 'num-warn' : 'num-up';
    const pcLabel = pc == null ? '—' : pc > 1.5 ? 'Very bearish' : pc > 1 ? 'Bearish' : pc > 0.7 ? 'Neutral' : 'Bullish';
    const ivLabel = td.avg_iv == null ? '—' : td.avg_iv > 60 ? 'High volatility' : td.avg_iv > 30 ? 'Moderate' : 'Low volatility';
    const gs = td.greeks_summary || {};
    const kl = td.key_levels || {};
    const expFirst = td.exp_dates && td.exp_dates[0];
    const expLast = td.exp_dates && td.exp_dates[td.exp_dates.length - 1];

    const svg = buildGexStrikeSvg(td);
    const greeksTable = buildGexGreeksTable(td);

    const card = (label, val, cls, sub) => `
      <div class="acct-card">
        <div class="acct-name">${escapeGex(label)}</div>
        <div class="acct-val"><span class="mono ${cls || ''}">${val}</span></div>
        ${sub ? `<div class="acct-meta"><span>${escapeGex(sub)}</span></div>` : ''}
      </div>`;

    return `
      <div class="mod-panel" style="padding:8px 12px;display:flex;align-items:center;justify-content:space-between;gap:12px">
        <div>
          <span class="mono" style="font-size:15px;font-weight:700">${escapeGex(td.ticker)}</span>
          <span style="color:var(--fg-dim);margin-left:8px">· Gamma Detail</span>
          <span class="chip ${td.chg_pct >= 0 ? 'num-up' : 'num-dn'}" style="margin-left:10px">${fmtPrice(td.spot)} ${td.chg_pct >= 0 ? '+' : ''}${(td.chg_pct || 0).toFixed(2)}%</span>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <a href="#" class="gex-open-eq" style="color:var(--accent);font-size:12px">Open in EQ ↗</a>
          <button class="gex-back-btn" type="button" style="background:transparent;border:1px solid var(--border);color:var(--fg);border-radius:3px;padding:3px 10px;cursor:pointer">← back to universe</button>
        </div>
      </div>

      <div class="acct-strip" style="grid-template-columns:repeat(4,1fr)">
        ${card('NET GEX',   '$' + fmtGexMag(td.net_gex),            netCls, td.regime_label || '')}
        ${card('REGIME',    regimeLabel,                            regimeCls, '')}
        ${card('CALL GEX',  '$' + fmtGexMag(td.total_call_gex),     'num-up',  (td.total_call_oi || 0).toLocaleString() + ' OI')}
        ${card('PUT GEX',   '$' + fmtGexMag(td.total_put_gex),      'num-dn',  (td.total_put_oi || 0).toLocaleString() + ' OI')}
      </div>
      <div class="acct-strip" style="grid-template-columns:repeat(4,1fr);margin-top:6px">
        ${card('P/C RATIO',    pc != null ? pc.toFixed(3) : '—',                        pcCls,   pcLabel)}
        ${card('AVG IV',       td.avg_iv != null ? td.avg_iv.toFixed(1) + '%' : '—',    'num-warn', ivLabel)}
        ${card('EXPIRATIONS',  String(td.expirations_used || 0),                        '',      (expFirst || '—') + ' — ' + (expLast || '—'))}
        ${card('NET DELTA',    fmtGexMag(gs.net_delta) + ' sh',                         gs.net_delta >= 0 ? 'num-up' : 'num-dn', gs.net_delta >= 0 ? 'Bullish bias' : 'Bearish bias')}
      </div>
      <div class="acct-strip" style="grid-template-columns:repeat(2,1fr);margin-top:6px">
        ${card('IV RANK',
          td.iv_rank != null ? td.iv_rank.toFixed(0) + '%' : (td.iv_days > 0 ? 'Bldg (' + td.iv_days + 'd)' : '—'),
          td.iv_rank != null && td.iv_rank > 80 ? 'num-dn' : td.iv_rank != null && td.iv_rank < 20 ? 'num-up' : 'num-warn',
          td.iv_rank != null && td.iv_rank > 80 ? 'Expensive' : td.iv_rank != null && td.iv_rank < 20 ? 'Cheap' : 'Moderate')}
        ${card('IV PCTL',
          td.iv_percentile != null ? td.iv_percentile.toFixed(0) + '%' : '—',
          'num-warn',
          td.iv_percentile != null ? td.iv_percentile.toFixed(0) + '% of days below current IV' : 'Building history…')}
      </div>
      <div class="acct-strip" style="grid-template-columns:repeat(4,1fr);margin-top:6px">
        ${card('CALL WALL',    fmtPrice(kl.call_wall),    'num-up',   'Resistance')}
        ${card('PUT WALL',     fmtPrice(kl.put_wall),     'num-dn',   'Support')}
        ${card('MAX GAMMA',    fmtPrice(kl.max_gamma),    '',         'Largest |GEX|')}
        ${card('GAMMA FLIP',   fmtPrice(kl.gamma_flip),   'num-warn', 'Neg→Pos transition')}
      </div>
      <div class="acct-strip" style="grid-template-columns:repeat(2,1fr);margin-top:6px">
        ${card('TOTAL VEGA',  '$' + fmtGexMag(gs.total_vega),              '', 'P&L per 1% IV move')}
        ${card('TOTAL THETA', '$' + fmtGexMag(gs.total_theta) + '/day',    'num-dn', 'Time decay cost')}
      </div>

      <div class="mod-panel">
        <div class="mod-panel-title">NET GEX BY STRIKE · bars show dealer positioning at each level</div>
        <div style="overflow-x:auto">${svg}</div>
        <div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:4px;font-size:10px;color:var(--fg-dim)">
          <span><span style="display:inline-block;width:10px;height:10px;background:#4ade80;border-radius:2px;margin-right:3px"></span>Positive GEX</span>
          <span><span style="display:inline-block;width:10px;height:10px;background:#f87171;border-radius:2px;margin-right:3px"></span>Negative GEX</span>
          <span><span style="display:inline-block;width:10px;height:2px;background:#e6edf3;margin-right:3px;vertical-align:middle"></span>Spot</span>
          <span><span style="display:inline-block;width:10px;height:2px;background:#4ade80;margin-right:3px;vertical-align:middle"></span>Call Wall</span>
          <span><span style="display:inline-block;width:10px;height:2px;background:#f87171;margin-right:3px;vertical-align:middle"></span>Put Wall</span>
          <span><span style="display:inline-block;width:10px;height:2px;background:#fbbf24;margin-right:3px;vertical-align:middle"></span>Gamma Flip</span>
        </div>
      </div>

      ${greeksTable}
    `;
  }

  function buildGexStrikeSvg(td) {
    const strikes = td.strikes || [];
    if (!strikes.length) return '<div class="mod-loading">No strike data</div>';
    const lo = td.spot * 0.90, hi = td.spot * 1.10;
    let f = strikes.filter(s => s.strike >= lo && s.strike <= hi && Math.abs(s.net_gex) > 0);
    if (!f.length) f = strikes.filter(s => Math.abs(s.net_gex) > 0);
    if (f.length > 80) {
      const step = Math.ceil(f.length / 80);
      f = f.filter((_, i) => i % step === 0);
    }
    const n = f.length;
    if (!n) return '<div class="mod-loading">No data in range</div>';

    const W = Math.max(720, n * 14), H = 320;
    const padL = 60, padR = 15, padT = 22, padB = 46;
    const chartW = W - padL - padR, chartH = H - padT - padB;
    const maxAbs = Math.max(...f.map(s => Math.abs(s.net_gex)), 1);
    const barW = Math.max(2, Math.min(12, (chartW / n) - 1));
    const zeroY = padT + chartH / 2;

    const kl = td.key_levels || {};
    const priceToX = (price) => {
      if (price == null) return null;
      let idx = -1, dist = Infinity;
      for (let i = 0; i < n; i++) {
        const dd = Math.abs(f[i].strike - price);
        if (dd < dist) { dist = dd; idx = i; }
      }
      if (idx < 0 || dist > td.spot * 0.03) return null;
      return padL + (idx / n) * chartW + (chartW / n) / 2;
    };

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;min-height:300px;font-family:var(--font-mono);font-size:10px">`;

    const gfX = priceToX(kl.gamma_flip);
    if (gfX != null) {
      svg += `<rect x="${padL}" y="${padT}" width="${gfX - padL}" height="${chartH}" fill="#f87171" opacity="0.06"/>`;
      svg += `<rect x="${gfX}" y="${padT}" width="${W - padR - gfX}" height="${chartH}" fill="#4ade80" opacity="0.06"/>`;
    }
    svg += `<line x1="${padL}" y1="${zeroY}" x2="${W - padR}" y2="${zeroY}" stroke="#30363d" stroke-width="1"/>`;

    for (let i = -4; i <= 4; i++) {
      if (i === 0) continue;
      const yPos = zeroY - (i / 4) * (chartH / 2);
      const yVal = (i / 4) * maxAbs;
      svg += `<line x1="${padL}" y1="${yPos}" x2="${W - padR}" y2="${yPos}" stroke="#21262d" stroke-width="0.5"/>`;
      svg += `<text x="${padL - 5}" y="${yPos + 3}" fill="#6e7681" text-anchor="end" font-size="9">$${fmtGexMag(yVal)}</text>`;
    }

    const labelEvery = Math.max(1, Math.floor(n / 18));
    for (let i = 0; i < n; i++) {
      const s = f[i];
      const x = padL + (i / n) * chartW + (chartW / n - barW) / 2;
      const val = s.net_gex;
      const barH = Math.abs(val) / maxAbs * (chartH / 2);
      const y = val >= 0 ? zeroY - barH : zeroY;
      const color = val >= 0 ? '#4ade80' : '#f87171';
      svg += `<rect x="${x}" y="${y}" width="${barW}" height="${Math.max(1, barH)}" fill="${color}" opacity="0.85" rx="1"><title>${s.strike}: $${fmtGexMag(val)}</title></rect>`;
      if (i % labelEvery === 0) {
        svg += `<text x="${x + barW / 2}" y="${H - padB + 12}" fill="#6e7681" text-anchor="middle" font-size="8" transform="rotate(-45 ${x + barW / 2} ${H - padB + 12})">${s.strike}</text>`;
      }
    }

    const cwX = priceToX(kl.call_wall);
    if (cwX != null) {
      svg += `<line x1="${cwX}" y1="${padT}" x2="${cwX}" y2="${H - padB}" stroke="#4ade80" stroke-width="1" stroke-dasharray="3 3" opacity="0.75"/>`;
      svg += `<text x="${cwX + 4}" y="${padT + 11}" fill="#4ade80" font-size="8" font-weight="600">CW $${kl.call_wall.toFixed(0)}</text>`;
    }
    const pwX = priceToX(kl.put_wall);
    if (pwX != null) {
      svg += `<line x1="${pwX}" y1="${padT}" x2="${pwX}" y2="${H - padB}" stroke="#f87171" stroke-width="1" stroke-dasharray="3 3" opacity="0.75"/>`;
      svg += `<text x="${pwX + 4}" y="${padT + 22}" fill="#f87171" font-size="8" font-weight="600">PW $${kl.put_wall.toFixed(0)}</text>`;
    }
    const gfXline = priceToX(kl.gamma_flip);
    if (gfXline != null) {
      svg += `<line x1="${gfXline}" y1="${padT}" x2="${gfXline}" y2="${H - padB}" stroke="#fbbf24" stroke-width="1.3" stroke-dasharray="4 3" opacity="0.85"/>`;
      svg += `<text x="${gfXline + 4}" y="${padT + 33}" fill="#fbbf24" font-size="8" font-weight="600">Flip $${kl.gamma_flip.toFixed(1)}</text>`;
    }
    const spotX = priceToX(td.spot);
    if (spotX != null) {
      svg += `<line x1="${spotX}" y1="${padT}" x2="${spotX}" y2="${H - padB}" stroke="#e6edf3" stroke-width="1.5" stroke-dasharray="4 3"/>`;
      svg += `<text x="${spotX}" y="${padT - 4}" fill="#e6edf3" text-anchor="middle" font-size="10" font-weight="600">Spot $${td.spot.toFixed(2)}</text>`;
    }
    svg += '</svg>';
    return svg;
  }

  function buildGexGreeksTable(td) {
    const strikes = td.strikes || [];
    if (!strikes.length || !strikes[0] || strikes[0].call_delta == null) return '';
    const sorted = strikes.slice().sort((a, b) => Math.abs(a.strike - td.spot) - Math.abs(b.strike - td.spot));
    const near = sorted.slice(0, 10).sort((a, b) => a.strike - b.strike);
    const gap = near.length >= 2 ? Math.abs(near[1].strike - near[0].strike) : 1;
    const rows = near.map(s => {
      const atm = Math.abs(s.strike - td.spot) < gap * 0.75;
      const ndCls = s.net_delta >= 0 ? 'num-up' : 'num-dn';
      const ntCls = s.net_theta >= 0 ? 'num-up' : 'num-warn';
      return `<tr${atm ? ' style="background:rgba(96,165,250,0.08);font-weight:600"' : ''}>
        <td>${s.strike.toFixed(1)}${atm ? ' (ATM)' : ''}</td>
        <td class="mono num-up">${fmtGexMag(s.call_delta)}</td>
        <td class="mono num-dn">${fmtGexMag(s.put_delta)}</td>
        <td class="mono ${ndCls}" style="font-weight:600">${fmtGexMag(s.net_delta)}</td>
        <td class="mono">${fmtGexMag(s.vega)}</td>
        <td class="mono num-warn">${fmtGexMag(s.call_theta)}</td>
        <td class="mono num-warn">${fmtGexMag(s.put_theta)}</td>
        <td class="mono ${ntCls}">${fmtGexMag(s.net_theta)}</td>
      </tr>`;
    }).join('');
    return `
      <div class="mod-panel">
        <div class="mod-panel-title">GREEKS PROFILE · 10 NEAREST STRIKES · dealer risk distribution</div>
        <div style="font-size:10px;color:var(--fg-dim);line-height:1.5;margin-bottom:4px">
          Shows how market makers' risk exposure is distributed across strike prices near spot. Larger numbers = more open interest = bigger market impact when price approaches.
        </div>
        <div class="tbl-wrap">
          <table class="tbl-dense">
            <thead><tr>
              <th>STRIKE</th>
              <th class="num" title="Calls: dealer buy/sell per $1 up move">CALL Δ</th>
              <th class="num" title="Puts: dealer buy/sell per $1 up move">PUT Δ</th>
              <th class="num" title="Combined directional exposure">NET Δ</th>
              <th class="num" title="P&L change per 1% IV increase">VEGA $</th>
              <th class="num" title="Daily time decay on calls">CALL Θ</th>
              <th class="num" title="Daily time decay on puts">PUT Θ</th>
              <th class="num" title="Total daily time decay at this strike">NET Θ</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }

  function fmtGexMag(n) {
    if (n == null || !isFinite(n)) return '—';
    const abs = Math.abs(n); const sign = n < 0 ? '-' : '';
    if (abs >= 1e9) return sign + (abs / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return sign + (abs / 1e6).toFixed(1) + 'M';
    if (abs >= 1e3) return sign + (abs / 1e3).toFixed(0) + 'K';
    return sign + abs.toFixed(0);
  }
  function fmtPrice(n) { return n == null || !isFinite(n) ? '—' : '$' + n.toFixed(2); }
  function escapeGex(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ── F9 Smart Money — institutional flow desk ──────────────
     3 sub-tabs: Signals (smart-money.json) · Insider (insider-trades.json)
                · Congress (congress-trades.json).
     Sub-tab choice persists on pane.params.smyTab so Phase E deep-links work. */
  const SMY_TABS = [
    { id: 'signals',  label: 'Signals' },
    { id: 'insider',  label: 'Insider Trades' },
    { id: 'congress', label: 'Congress Trades' },
    { id: 'trump',    label: 'Politics: Trump' },
    { id: 'moo',      label: 'Opening Auction' },
    { id: 'moc',      label: 'Closing Auction' },
  ];
  const INSIDER_URL  = 'https://stocks.clawmo.tech/data/insider-trades.json';
  const CONGRESS_URL = 'https://stocks.clawmo.tech/data/congress-trades.json';
  const MOC_URL      = 'https://stocks.clawmo.tech/data/moc.json';
  const MOO_URL      = 'https://stocks.clawmo.tech/data/moo.json';
  const TRUMP_URL    = 'https://stocks.clawmo.tech/data/politics-trump.json';

  async function renderSmartMoney(body, ctx) {
    body.innerHTML = `<div class="mod-loading">Loading smart money…</div>`;
    try {
      // Parallel fetch — full JSON has all tickers; fallback to signals-only
      const [sig, ins, cg, moc, moo, tr] = await Promise.allSettled([
        fetchJSON(`${BASE}/smart-money-full.json`).catch(() => fetchJSON(`${BASE}/smart-money.json`)),
        fetchJSON(INSIDER_URL).catch(() => null),
        fetchJSON(CONGRESS_URL).catch(() => null),
        fetchJSON(MOC_URL).catch(() => null),
        fetchJSON(MOO_URL).catch(() => null),
        fetchJSON(TRUMP_URL).catch(() => null),
      ]);
      const sigData = sig.status === 'fulfilled' ? sig.value : null;
      const insData = ins.status === 'fulfilled' ? ins.value : null;
      const cgData  = cg.status  === 'fulfilled' ? cg.value  : null;
      const mocData = moc.status === 'fulfilled' ? moc.value : null;
      const mooData = moo.status === 'fulfilled' ? moo.value : null;
      const trData  = tr.status  === 'fulfilled' ? tr.value  : null;

      if (!sigData && !insData && !cgData && !mocData && !mooData && !trData) {
        body.innerHTML = `<div class="mod-err">Failed to load smart-money data</div>`;
        return;
      }

      const initialTab = (ctx && ctx.params && ctx.params.smyTab) || 'signals';
      body._smyData = { sig: sigData, ins: insData, cg: cgData, moc: mocData, moo: mooData, tr: trData };

      body.innerHTML = `
        <div class="mod-head">
          <div class="mod-title">${window.OC_TITLE('smart-money')} · INSTITUTIONAL FLOW</div>
          <div class="mod-meta">
            ${sigData ? `<span class="chip">SCANNED · ${sigData.total_symbols || (sigData.signals || []).length}</span>` : ''}
            ${insData ? `<span class="chip">INSIDER · ${(insData.summary || {}).total_trades ?? '—'}</span>` : ''}
            ${cgData  ? `<span class="chip">CONGRESS · ${(cgData.summary || {}).totalTrades ?? '—'}</span>` : ''}
            ${trData  ? `<span class="chip">TRUMP · ${(trData.summary || {}).holdings_count ?? '—'} hld / ${(trData.summary || {}).transaction_count ?? '—'} tx</span>` : ''}
            <span class="chip chip-dim">${fmt.ago(sigData?.generated_at || insData?.generated_at || cgData?.generated_at)}</span>
          </div>
        </div>

        <div class="fin-subtabs">
          ${SMY_TABS.map(t => `<button class="fin-subtab-btn${t.id === initialTab ? ' active' : ''}" data-smytab="${t.id}">${t.label}</button>`).join('')}
        </div>

        <div class="fin-body" id="smyBody"></div>
      `;

      renderSmyTab(body, initialTab);
      body.querySelectorAll('.fin-subtab-btn[data-smytab]').forEach(btn => {
        btn.addEventListener('click', () => {
          const tab = btn.dataset.smytab;
          body.querySelectorAll('.fin-subtab-btn[data-smytab]').forEach(b => b.classList.toggle('active', b === btn));
          if (window.OC_UPDATE_PANE_PARAMS) window.OC_UPDATE_PANE_PARAMS({ smyTab: tab });
          renderSmyTab(body, tab);
        });
      });
    } catch (e) { body.innerHTML = `<div class="mod-err">${e.message}</div>`; }
  }

  function renderSmyTab(body, tab) {
    const inner = body.querySelector('#smyBody');
    if (!inner) return;
    const d = body._smyData || {};
    switch (tab) {
      case 'signals':  renderSmySignals(inner, d.sig);  break;
      case 'insider':  renderSmyInsider(inner, d.ins);  break;
      case 'congress': renderSmyCongress(inner, d.cg);  break;
      case 'trump':    renderSmyTrump(inner, d.tr);     break;
      case 'moo':      renderSmyAuction(inner, d.moo, 'MOO'); break;
      case 'moc':      renderSmyMoc(inner, d.moc);      break;
      default:         inner.innerHTML = `<div class="mod-err">Unknown tab: ${tab}</div>`;
    }
    attachTickerClicks(inner);
  }

  /* ── MOC tab — index-level closing-auction imbalance ───────── */
  function fmtMocVal(n) {
    if (n == null || !isFinite(n)) return '—';
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (abs >= 1000) return sign + '$' + (abs / 1000).toFixed(2) + 'B';
    return sign + '$' + abs.toFixed(1) + 'M';
  }

  function mocTermDonut(sell_m, buy_m, net_m) {
    const sell = Math.max(sell_m || 0, 0);
    const buy  = Math.max(buy_m  || 0, 0);
    const total = sell + buy;
    const cx = 60, cy = 60, r = 44, sw = 12;
    if (total <= 0) {
      return `<svg viewBox="0 0 120 120" width="110" height="110">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#252b35" stroke-width="${sw}"/>
        <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" fill="#6e7681" style="font:600 0.78rem var(--font-mono,monospace)">—</text>
      </svg>`;
    }
    const sellFrac = sell / total;
    const C = 2 * Math.PI * r;
    const sellLen = sellFrac * C;
    const buyLen  = C - sellLen;
    const netColor = net_m == null ? '#e6edf3' : (net_m < 0 ? '#ef4444' : (net_m > 0 ? '#22c55e' : '#9aa3af'));
    const netText = (function(n){
      if (n == null || !isFinite(n)) return '—';
      const a = Math.abs(n), s = n < 0 ? '-' : '';
      return a >= 1000 ? s + '$' + (a/1000).toFixed(2) + 'B' : s + '$' + a.toFixed(0) + 'M';
    })(net_m);
    return `<svg viewBox="0 0 120 120" width="110" height="110" style="transform:rotate(-90deg)">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#1f242c" stroke-width="${sw}"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#ef4444" stroke-width="${sw}"
              stroke-dasharray="${sellLen} ${C}" stroke-linecap="butt"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#22c55e" stroke-width="${sw}"
              stroke-dasharray="${buyLen} ${C}" stroke-dashoffset="${-sellLen}" stroke-linecap="butt"/>
      <g style="transform:rotate(90deg);transform-origin:${cx}px ${cy}px">
        <text x="${cx}" y="${cy - 4}" text-anchor="middle" dominant-baseline="central"
              fill="${netColor}" style="font:700 0.85rem var(--font-mono,monospace)">${netText}</text>
        <text x="${cx}" y="${cy + 12}" text-anchor="middle" dominant-baseline="central"
              fill="#6e7681" style="font:500 0.55rem var(--font-mono,monospace);letter-spacing:0.08em">NET</text>
      </g>
    </svg>`;
  }

  function renderSmyMoc(inner, doc) { renderSmyAuction(inner, doc, 'MOC'); }

  function renderSmyAuction(inner, doc, kind) {
    const isMoo = kind === 'MOO';
    const fj = (doc && doc.fj) || {};
    const indices = fj.indices || {};
    const order = ['sp500', 'nas100', 'dow30', 'mag7'];
    const have = order.filter(k => indices[k]);
    if (!have.length) {
      inner.innerHTML = isMoo
        ? `<div class="mod-err">No opening-auction data — runs every 2 min from 9:32–9:46 ET weekdays.</div>`
        : `<div class="mod-err">No closing-auction data — runs at 15:58 ET weekdays.</div>`;
      return;
    }
    const generated = doc.generated_at || fj.fetched_at;
    const cards = have.map(k => {
      const x = indices[k];
      const tagStyle = isMoo ? ' style="background:rgba(96,165,250,0.15);color:#60a5fa"' : '';
      return `
        <div class="mocterm-card">
          <div class="mocterm-label">${x.label || k.toUpperCase()} <span class="mocterm-tag"${tagStyle}>${kind}</span></div>
          <div class="mocterm-donut">${mocTermDonut(x.sell_m, x.buy_m, x.net_m)}</div>
          <div class="mocterm-breakdown">
            <span class="mocterm-sell">SELL ${fmtMocVal(x.sell_m)}</span>
            <span class="mocterm-buy">BUY ${fmtMocVal(x.buy_m)}</span>
          </div>
        </div>`;
    }).join('');
    const top5b = fj.top5_buy || [];
    const top5s = fj.top5_sell || [];
    const mag7t = fj.mag7_tickers || [];
    const hasBars = top5b.length || top5s.length || mag7t.length;

    function oneSidedRows(items, side) {
      if (!items.length) return '<div class="mocterm-bars-empty">no data</div>';
      const max = Math.max(...items.map(r => Math.abs(r.amount_m || 0)), 1);
      return items.map(r => {
        const v = r.amount_m || 0;
        const pct = (Math.abs(v) / max) * 100;
        return `<div class="mocterm-bar-row">
          <span class="mocterm-bar-tk">${r.ticker || ''}</span>
          <div class="mocterm-bar-track">
            <div class="mocterm-bar-fill mocterm-bar-${side}" style="left:0;width:${pct.toFixed(1)}%"></div>
          </div>
          <span class="mocterm-bar-v">${fmtMocVal(v)}</span>
        </div>`;
      }).join('');
    }
    function divergingRows(items) {
      if (!items.length) return '<div class="mocterm-bars-empty">no data</div>';
      const max = Math.max(...items.map(r => Math.abs(r.amount_m || 0)), 1);
      return items.map(r => {
        const v = r.amount_m || 0;
        const halfPct = (Math.abs(v) / max) * 50;
        let bar;
        if (v > 0)      bar = `<div class="mocterm-bar-fill mocterm-bar-pos" style="left:50%;width:${halfPct.toFixed(1)}%"></div>`;
        else if (v < 0) bar = `<div class="mocterm-bar-fill mocterm-bar-neg" style="right:50%;width:${halfPct.toFixed(1)}%"></div>`;
        else            bar = `<div class="mocterm-bar-fill mocterm-bar-zero" style="left:49.5%;width:1%"></div>`;
        return `<div class="mocterm-bar-row">
          <span class="mocterm-bar-tk">${r.ticker || ''}</span>
          <div class="mocterm-bar-track">
            <div class="mocterm-bar-axis"></div>
            ${bar}
          </div>
          <span class="mocterm-bar-v">${v >= 0 ? '+' : ''}${fmtMocVal(v)}</span>
        </div>`;
      }).join('');
    }
    const barsHtml = hasBars ? `
      <div class="mocterm-bars-grid">
        <div class="mocterm-bars-card">
          <div class="mocterm-bars-title" style="color:#22c55e">TOP 5 BUY</div>
          ${oneSidedRows(top5b, 'buy')}
        </div>
        <div class="mocterm-bars-card">
          <div class="mocterm-bars-title" style="color:#ef4444">TOP 5 SELL</div>
          ${oneSidedRows(top5s, 'sell')}
        </div>
        <div class="mocterm-bars-card">
          <div class="mocterm-bars-title">MAG 7 · NET</div>
          ${divergingRows(mag7t)}
        </div>
      </div>` : '';

    inner.innerHTML = `
      <style>
        .mocterm-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:0.5rem; margin-bottom:0.5rem; }
        .mocterm-card { background:var(--panel-alt,#0e1217); border:1px solid var(--border,#252b35); border-radius:4px;
                        padding:0.55rem 0.65rem; font-family:var(--font-mono,monospace);
                        display:flex; flex-direction:column; align-items:center; gap:0.35rem; }
        .mocterm-label { font-size:0.7rem; color:var(--text-secondary,#9aa3af); letter-spacing:0.05em; align-self:flex-start; }
        .mocterm-donut { display:flex; justify-content:center; }
        .mocterm-breakdown { display:flex; justify-content:space-between; gap:0.5rem; width:100%; font-size:0.65rem; }
        .mocterm-sell { color:#ef4444; }
        .mocterm-buy  { color:#22c55e; }
        .mocterm-meta { font-size:0.65rem; color:var(--text-muted,#6e7681); margin-top:0.4rem; line-height:1.5; }

        .mocterm-bars-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:0.5rem; margin:0.5rem 0; }
        @media (max-width:720px) { .mocterm-bars-grid { grid-template-columns:1fr; } }
        .mocterm-bars-card { background:var(--panel-alt,#0e1217); border:1px solid var(--border,#252b35); border-radius:4px;
                             padding:0.55rem 0.65rem; font-family:var(--font-mono,monospace); }
        .mocterm-bars-title { font-size:0.7rem; font-weight:700; letter-spacing:0.06em; margin-bottom:0.35rem; color:var(--text-secondary,#9aa3af); }
        .mocterm-bars-empty { font-size:0.65rem; color:var(--text-muted,#6e7681); padding:0.25rem 0; }
        .mocterm-bar-row { display:grid; grid-template-columns:48px 1fr 56px; align-items:center; gap:0.35rem;
                           height:16px; margin:1px 0; font-size:0.65rem; }
        .mocterm-bar-tk { color:var(--text-primary,#e5e7eb); font-weight:600; }
        .mocterm-bar-v  { color:var(--text-secondary,#9aa3af); text-align:right; font-variant-numeric:tabular-nums; }
        .mocterm-bar-track { position:relative; height:10px; }
        .mocterm-bar-fill  { position:absolute; top:0; height:100%; border-radius:1px; }
        .mocterm-bar-buy, .mocterm-bar-pos { background:#22c55e; }
        .mocterm-bar-sell, .mocterm-bar-neg { background:#ef4444; }
        .mocterm-bar-zero { background:#6e7681; opacity:0.4; }
        .mocterm-bar-axis { position:absolute; left:50%; top:-2px; bottom:-2px; width:1px; background:var(--border,#252b35); }
      </style>
      <div class="mocterm-grid">${cards}</div>
      ${barsHtml}
      <div class="mocterm-meta">
        Net = Buy − Sell ($M). Source: FinancialJuice (NYSE ${isMoo ? 'Opening' : 'Closing'} Auction Imbalance + Nasdaq NOII).
        ${isMoo
          ? 'Captured Mon-Fri every 2 min from 9:32 to 9:46 ET — last write wins; if FJ is unavailable the previous snapshot is kept.'
          : 'Captured Mon-Fri at 15:58 / 15:59 / 16:00 / 16:01 ET — last write wins; if FJ is unavailable the previous snapshot is kept (see updated timestamp).'}
        ${generated ? '· Updated ' + (window.fmt && window.fmt.ago ? window.fmt.ago(generated) : new Date(generated).toLocaleString()) : ''}
      </div>`;
  }

  /* ── Signals tab — the legacy flow monitor, now sortable ──── */
  // `gloss` keys override the textContent fallback so the auto-tooltip helper
  // shows the *smart-money-specific* definition (not the generic "score" entry).
  const SMY_SIG_COLS = [
    { key: 'ticker',             label: 'TICKER',  type: 'str', gloss: 'TICKER',       group: 'identity'  },
    { key: 'tag',                label: 'TAG',     type: 'str', gloss: 'TAG',          group: 'identity'  },
    { key: 'sector',             label: 'SECTOR',  type: 'str', gloss: 'SECTOR',       group: 'identity'  },
    { key: 'date',               label: 'DATE',    type: 'str', gloss: 'DATE',         group: 'identity'  },
    { key: 'price',              label: 'PRICE',   type: 'num', gloss: 'PRICE',        group: 'market'    },
    { key: 'price_change_pct',   label: 'CHG',     type: 'num', gloss: 'CHG',          group: 'market'    },
    { key: 'relative_volume',    label: 'RVOL',    type: 'num', gloss: 'RVOL',         group: 'composite' },
    { key: 'mfi',                label: 'MFI',     type: 'num', gloss: 'MFI',          group: 'composite' },
    { key: 'cmf',                label: 'CMF',     type: 'num', gloss: 'CMF',          group: 'composite' },
    { key: 'poc_distance_pct',   label: 'POC',     type: 'num', gloss: 'SMY-POC',      group: 'composite' },
    { key: 'insider_cluster',    label: 'CLUSTER', type: 'num', gloss: 'SMY-CLUSTER',  group: 'composite' },
    { key: 'score',              label: 'SCORE',   type: 'num', gloss: 'SMY-SCORE',    group: 'composite' },
    { key: 'signal',             label: 'SIGNAL',  type: 'str', gloss: 'SMY-SIGNAL',   group: 'composite' },
    { key: 'flow_score',         label: 'FLOW⚠',  type: 'num', gloss: 'FLOW-SCORE',   group: 'wyckoff'   },
    { key: 'flow_label',         label: 'VERDICT', type: 'str', gloss: 'ORDERLY-DIST', group: 'wyckoff'   },
    { key: 'vol_trend_diverging',label: 'VOL DIV', type: 'num', gloss: 'VOL-DIV',      group: 'wyckoff'   },
    { key: 'streak_up_days',     label: 'STREAK',  type: 'num', gloss: 'STREAK',       group: 'wyckoff'   },
    { key: 'churn_bars',         label: 'CHURN',   type: 'num', gloss: 'CHURN',        group: 'wyckoff'   },
    { key: 'etf_flow_5d_pct',    label: 'ETF 5d',  type: 'num', gloss: 'ETF-FLOW-5D',  group: 'wyckoff'   },
    { key: 'sector_flow_5d_pct', label: 'SEC 5d',  type: 'num', gloss: 'SECTOR-FLOW',  group: 'wyckoff'   },
  ];
  // Group headers above the column row — disambiguate the original composite (blue, OBV/CMF/MFI/RVOL) from the new Wyckoff distribution layer (red).
  const SMY_GROUP_META = {
    identity:  { label: '',                                       rgb: null         },
    market:    { label: 'PRICE',                                  rgb: '107,114,128' },
    composite: { label: 'COMPOSITE INDICATORS · original tool',   rgb: '59,130,246'  },
    wyckoff:   { label: 'WYCKOFF v3.1 · distribution warning',    rgb: '248,113,113' },
  };

  function buildSmySectorHeatmap(signals, fullData) {
    // Build per-sector aggregates from RADAR tickers (skip ETF/MACRO/PORTFOLIO)
    const map = {};
    for (const r of signals) {
      const s = r.sector;
      if (!s || s === '—' || s === 'ETF' || r.tag === 'MACRO' || r.is_sector_etf || r.is_market_etf) continue;
      if (!map[s]) map[s] = { n: 0, sum: 0, ac: 0, di: 0 };
      map[s].n++; map[s].sum += r.score;
      if (r.score >= 65) map[s].ac++;
      if (r.score <= 35) map[s].di++;
    }
    const rows = Object.entries(map)
      .filter(([, d]) => d.n >= 3)
      .map(([name, d]) => ({ name, avg: Math.round(d.sum / d.n), n: d.n, ac: d.ac, di: d.di }))
      .sort((a, b) => b.avg - a.avg);

    if (!rows.length) return '';

    const rot_map = (fullData && fullData.sector_rotation) || {};
    const bars = rows.map(s => {
      const col = s.avg >= 56 ? '#4ade80' : s.avg <= 44 ? '#f87171' : '#6b7280';
      const scol = s.avg >= 56 ? 'color:#4ade80' : s.avg <= 44 ? 'color:#f87171' : '';
      const rot = rot_map[s.name] || null;
      let deltaHtml = '';
      if (rot) {
        const sd = rot.score_delta;
        const fd = rot.flow_delta;
        const sdCol = sd > 0 ? '#4ade80' : sd < 0 ? '#f87171' : 'rgba(156,163,175,.4)';
        deltaHtml += `<span style="font-size:0.55rem;margin-left:5px;color:${sdCol}" title="Score Δ vs ${rot.prev_date}: ${sd>0?'rose +'+sd+' pts (buying increasing)':sd<0?'fell '+sd+' pts (buying cooling)':'unchanged'}">score${sd>0?'+':''}${sd}</span>`;
        if (fd !== null && fd !== undefined) {
          // INVERTED: rising flow_score = entering distribution = bad (red)
          const fdCol = fd > 0 ? '#f87171' : fd < 0 ? '#4ade80' : 'rgba(156,163,175,.4)';
          deltaHtml += `<span style="font-size:0.55rem;margin-left:3px;color:${fdCol}" title="Flow warning Δ vs ${rot.prev_date}: ${fd>0?'rose +'+fd+' pts (RED = distribution warning rising — bad)':fd<0?'fell '+fd+' pts (warning easing — good)':'unchanged'}">flow${fd>0?'+':''}${fd}</span>`;
        }
      }
      return `<div class="smy-sec-row" data-sector="${s.name.replace(/"/g,'&quot;')}"
        title="${s.name}: avg ${s.avg} · ▲${s.ac} accum · ▼${s.di} distrib / ${s.n}${rot ? ` · Δ S${rot.score_delta>0?'+':''}${rot.score_delta}${rot.flow_delta!=null?' F'+(rot.flow_delta>0?'+':'')+rot.flow_delta:''}` : ''}">
        <span class="smy-sec-name">${s.name}</span>
        <span class="smy-sec-bar"><span style="width:${s.avg}%;background:${col}"></span></span>
        <span class="mono" style="font-size:0.68rem;min-width:22px;text-align:right;${scol}">${s.avg}</span>
        ${deltaHtml}
        <span style="font-size:0.62rem;opacity:0.55;min-width:52px">▲${s.ac}&thinsp;▼${s.di}/${s.n}</span>
      </div>`;
    }).join('');

    return `<div class="mod-panel" style="margin-bottom:6px">
      <div class="mod-panel-title" style="font-size:0.68rem">
        SECTOR FLOW · avg score by sector · click row to filter
        <span class="smy-sec-active-label" style="color:#60a5fa;margin-left:6px"></span>
        <span style="margin-left:auto;font-size:0.6rem;opacity:0.45">
          <span style="color:#4ade80">■</span> accum (≥56) &nbsp;
          <span style="color:#f87171">■</span> distrib (≤44) &nbsp;
          <b>S±N</b> = score Δ vs yesterday &nbsp;·&nbsp;
          <b>F±N</b> = distribution warning Δ (<span style="color:#f87171">red F rising = bad</span>) &nbsp;·&nbsp;
          ▲▼ = accum/distrib count
        </span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:1px 12px;padding:4px 0">
        ${bars}
      </div>
    </div>
    <style>
      .smy-sec-row{display:grid;grid-template-columns:140px 1fr 26px 54px;align-items:center;gap:5px;padding:2px 4px;border-radius:3px;cursor:pointer;transition:background .1s}
      .smy-sec-row:hover{background:rgba(96,165,250,.07)}
      .smy-sec-row.active{background:rgba(96,165,250,.12)}
      .smy-sec-name{font-size:0.69rem;opacity:.8;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
      .smy-sec-row.active .smy-sec-name{opacity:1;color:#60a5fa;font-weight:600}
      .smy-sec-bar{height:5px;background:#21262d;border-radius:3px;overflow:hidden;display:block}
      .smy-sec-bar span{display:block;height:100%;border-radius:3px;transition:width .4s ease}
    </style>`;
  }

  function renderSmySignals(inner, d) {
    if (!d || !d.signals) { inner.innerHTML = '<div class="mod-loading">No signals data</div>'; return; }
    const signals = d.signals.slice();
    const state = { sortCol: 'score', sortDir: 'desc', query: '', tagFilter: 'all', sectorFilter: null };

    const SMY_REF_HTML = `
      <div id="smy-ref-panel" style="display:none;background:rgba(0,0,0,.35);border:1px solid #30363d;border-radius:4px;padding:10px 12px;margin:4px 0 6px;font-size:0.67rem">
        <div style="font-weight:700;font-size:0.69rem;opacity:0.7;letter-spacing:.05em;margin-bottom:6px">COLUMN REFERENCE</div>
        <table style="width:100%;border-collapse:collapse">
          <thead><tr style="opacity:0.45;font-size:0.63rem;text-transform:uppercase">
            <th style="text-align:left;padding:1px 8px 3px 0;min-width:65px">Column</th>
            <th style="text-align:left;padding:1px 8px 3px 0">What it measures</th>
            <th style="text-align:left;padding:1px 8px 3px 0">How to read</th>
            <th style="text-align:left;padding:1px 0 3px;min-width:70px">Score weight</th>
          </tr></thead>
          <tbody style="line-height:1.65">
            <tr><td style="opacity:.5;padding-right:8px">TICKER</td><td style="padding-right:8px;opacity:.8">Stock symbol</td><td style="padding-right:8px;opacity:.7">Click to open full analysis page</td><td style="opacity:.4">—</td></tr>
            <tr><td style="opacity:.5;padding-right:8px">TAG</td><td style="padding-right:8px;opacity:.8">Universe slot</td><td style="padding-right:8px;opacity:.7"><span style="color:#fbbf24">PORTFOLIO</span> your holdings · <span style="opacity:.6">MACRO</span> sector ETFs · <span style="color:#3b82f6">RADAR</span> S&amp;P 500 + ADRs</td><td style="opacity:.4">—</td></tr>
            <tr><td style="opacity:.5;padding-right:8px">SECTOR</td><td style="padding-right:8px;opacity:.8">GICS sector</td><td style="padding-right:8px;opacity:.7">Used by sector heatmap above to group rotation signals</td><td style="opacity:.4">—</td></tr>
            <tr><td style="opacity:.5;padding-right:8px">DATE</td><td style="padding-right:8px;opacity:.8">Bar date</td><td style="padding-right:8px;opacity:.7">Date the underlying price data closes on</td><td style="opacity:.4">—</td></tr>
            <tr><td style="opacity:.5;padding-right:8px">PRICE / CHG</td><td style="padding-right:8px;opacity:.8">Close · day % change</td><td style="padding-right:8px;opacity:.7">$ close on DATE · green = up · red = down</td><td style="opacity:.4">—</td></tr>
            <tr><td style="opacity:.5;padding-right:8px">RVOL</td><td style="padding-right:8px;opacity:.8">Relative volume vs SPY</td><td style="padding-right:8px;opacity:.7"><b>1.0×</b> typical · <b>&gt;1.5×</b> elevated (beyond market noise) · <b>&lt;0.7×</b> quiet. Strips out FOMC/CPI days when all volume spikes.</td><td style="opacity:.7">feeds composite</td></tr>
            <tr><td style="opacity:.5;padding-right:8px">MFI</td><td style="padding-right:8px;opacity:.8">Money Flow Index (0–100)</td><td style="padding-right:8px;opacity:.7">Volume-weighted RSI. <b>&gt;80</b> heavy buying pressure · <b>&lt;20</b> heavy selling · 50 neutral</td><td style="opacity:.7">feeds composite</td></tr>
            <tr><td style="opacity:.5;padding-right:8px">CMF</td><td style="padding-right:8px;opacity:.8">Chaikin Money Flow (−1 to +1)</td><td style="padding-right:8px;opacity:.7">Where price closes in daily range × volume. <b>Positive</b> = buyers in control (closing near highs) · <b>Negative</b> = sellers (closing near lows)</td><td style="opacity:.7">feeds composite</td></tr>
            <tr><td style="opacity:.5;padding-right:8px">OBV <span style="opacity:.45;font-size:0.62rem">(hidden)</span></td><td style="padding-right:8px;opacity:.8">On-Balance Volume</td><td style="padding-right:8px;opacity:.7">Cumulative volume total — adds volume on up-days, subtracts on down-days. <b>Rising OBV</b> = institutions quietly accumulating. <b>Falling OBV</b> = distribution. Not a visible column; appears in the ▶ expand reason.</td><td style="opacity:.7">feeds composite</td></tr>
            <tr><td style="opacity:.5;padding-right:8px">POC</td><td style="padding-right:8px;opacity:.8">% from 3-month volume modal price</td><td style="padding-right:8px;opacity:.7"><b style="color:#4ade80">Green badge</b> = within ±5% of POC (institutional cost basis). <b>Positive</b> = price above POC. <b>Negative</b> = buying below institutional avg.</td><td style="color:#4ade80">+10 in zone</td></tr>
            <tr><td style="opacity:.5;padding-right:8px">CLUSTER</td><td style="padding-right:8px;opacity:.8">Insider buy cluster</td><td style="padding-right:8px;opacity:.7"><b style="color:#60a5fa">✓ N</b> = N insiders filed Form 4 buys ≥$250K total in 7d. Multiple insiders agreeing is the signal, not a single buy.</td><td style="color:#60a5fa">+5 if present</td></tr>
            <tr><td style="opacity:.5;padding-right:8px">SCORE</td><td style="padding-right:8px;opacity:.8">Composite 0–100</td><td style="padding-right:8px;opacity:.7">Sum of all indicators. Additive boosts: +10 POC zone · +5 cluster</td><td style="opacity:.4">—</td></tr>
            <tr><td style="opacity:.5;padding-right:8px">SIGNAL</td><td style="padding-right:8px;opacity:.8">Score bucket label</td><td style="padding-right:8px;opacity:.7"><span style="color:#4ade80;font-weight:700">≥80 STRONG ACCUM</span> · <span style="color:#86efac">≥65 ACCUM</span> · <span style="opacity:.5">35–65 NEUTRAL</span> · <span style="color:#fb923c">≤35 DISTRIB</span> · <span style="color:#f87171;font-weight:700">≤20 STRONG DISTRIB</span>. Hover cell for reason.</td><td style="opacity:.4">—</td></tr>
            <tr style="border-top:1px solid #21262d"><td colspan="4" style="padding:6px 0 2px;font-size:0.62rem;letter-spacing:.05em;opacity:.5;text-transform:uppercase">v3.1 — Wyckoff distribution layer</td></tr>
            <tr><td style="opacity:.5;padding-right:8px">FLOW⚠</td><td style="padding-right:8px;opacity:.8">Distribution warning 0–100</td><td style="padding-right:8px;opacity:.7">Inverse of SCORE. <b style="color:#fbbf24">≥30 WATCH</b> · <b style="color:#fb923c">≥50 WARNING</b> · <b style="color:#ef4444">≥60+SCORE≥65 = ORDERLY DIST</b>. Heaton signal: rising price hides smart-money exit.</td><td style="opacity:.7">composite</td></tr>
            <tr><td style="opacity:.5;padding-right:8px">VERDICT</td><td style="padding-right:8px;opacity:.8">Combined Score + Flow⚠ tier</td><td style="padding-right:8px;opacity:.7">CLEAR · WATCH · WARNING · <span style="color:#ef4444">⚠ ORDERLY</span> (Heaton). Filter button "⚠ Orderly Dist" isolates the highest-conviction distributing names.</td><td style="opacity:.4">—</td></tr>
            <tr><td style="opacity:.5;padding-right:8px">VOL DIV</td><td style="padding-right:8px;opacity:.8">18d vol-vs-price slope</td><td style="padding-right:8px;opacity:.7"><span style="color:#fb923c">⚠</span> = price slope &gt;0 AND volume slope &lt;−1%/day. Rally on shrinking participation = APs distributing into retail bid.</td><td style="color:#fb923c">+30 if ⚠</td></tr>
            <tr><td style="opacity:.5;padding-right:8px">STREAK</td><td style="padding-right:8px;opacity:.8">Consecutive up-day count</td><td style="padding-right:8px;opacity:.7"><b style="color:#fbbf24">≥10 stretched</b> · <b style="color:#ef4444">≥14 extreme (4σ)</b>. SOXX hit 18 days April 2026 — probability under fair odds is 1-in-262,000.</td><td style="color:#fbbf24">+10/+20</td></tr>
            <tr><td style="opacity:.5;padding-right:8px">CHURN</td><td style="padding-right:8px;opacity:.8">Wyckoff churn bars (10d)</td><td style="padding-right:8px;opacity:.7">Heavy vol (≥1.5× 20d avg) + tight body (&lt;30% of range) + close in lower half. <b style="color:#fb923c">≥2 in 10d</b> = supply absorbing demand at top.</td><td style="color:#fb923c">+10/+20</td></tr>
            <tr><td style="opacity:.5;padding-right:8px">ETF 5d</td><td style="padding-right:8px;opacity:.8">ETF net flow over 5d</td><td style="padding-right:8px;opacity:.7"><b>ETFs only</b>: net creation/redemption as % of AUM. <span style="color:#ef4444">&lt;−5%</span> = APs redeeming (smart money exit). Collects daily 16:31 ET; meaningful day 6.</td><td style="color:#ef4444">+25 if &lt;−5%</td></tr>
            <tr><td style="opacity:.5;padding-right:8px">SEC 5d</td><td style="padding-right:8px;opacity:.8">Sector ETF flow override</td><td style="padding-right:8px;opacity:.7"><b>Stocks</b>: parent sector ETF's 5d flow (e.g. SOXX for semis, XLK for tech). When sector bleeds &gt;3% AUM, conviction downgrades regardless of OBV.</td><td style="color:#fb923c">+15 if &lt;−3%</td></tr>
          </tbody>
        </table>
        <div style="margin-top:7px;padding-top:6px;border-top:1px solid #21262d;opacity:.65">
          <b>Sector heatmap row format:</b>
          "Real Estate &nbsp;<em>[bar]</em>&nbsp; 90 &nbsp;<span style="color:#4ade80">S+4</span>&nbsp;<span style="color:#f87171">F+8</span>&nbsp; ▲30 ▼0/31" = sector · avg score · <b>Δ vs prior day</b> (S=accum score Δ green=rising; F=flow⚠ Δ <b>inverted</b>: red=distribution warning rising=bad, green=easing) · ▲accum ▼distrib/total. Bar color: <span style="color:#4ade80">green ≥56</span> · <span style="color:#f87171">red ≤44</span> · gray neutral.
        </div>
      </div>`;

    inner.innerHTML = `
      <div id="smy-sector-wrap">${buildSmySectorHeatmap(signals, d)}</div>
      <div class="mod-panel" data-smy-panel="signals">
        ${SMY_REF_HTML}
        <div class="mod-panel-title" style="flex-wrap:wrap;gap:6px">
          <span>SIGNALS · <span class="mono smy-sig-count">${signals.length}</span></span>
          <span style="display:flex;gap:4px;flex-wrap:wrap;align-items:center">
            <button class="fin-subtab-btn active smy-tag-btn" data-smytag="all" style="padding:2px 8px;font-size:0.7rem">All</button>
            <button class="fin-subtab-btn smy-tag-btn" data-smytag="PORTFOLIO" style="padding:2px 8px;font-size:0.7rem">Portfolio</button>
            <button class="fin-subtab-btn smy-tag-btn" data-smytag="RADAR" style="padding:2px 8px;font-size:0.7rem">Radar</button>
            <button class="fin-subtab-btn smy-tag-btn" data-smytag="MACRO" style="padding:2px 8px;font-size:0.7rem">Macro</button>
            <button class="fin-subtab-btn smy-tag-btn" data-smytag="signals" style="padding:2px 8px;font-size:0.7rem">Signals Only</button>
            <button class="fin-subtab-btn smy-tag-btn" data-smytag="pocAccum" style="padding:2px 8px;font-size:0.7rem;color:#fbbf24;border-color:rgba(251,191,36,0.4)" title="Price within ±5% of 3-month institutional cost basis AND active accumulation flow — highest-conviction combo">★ POC + Accum</button>
            <button class="fin-subtab-btn smy-tag-btn" data-smytag="orderlyDist" style="padding:2px 8px;font-size:0.7rem;color:#ef4444;border-color:rgba(239,68,68,0.4)" title="Score ≥65 (looks like accumulation) AND Flow Warning ≥60 — Heaton signal: smart money exiting under cover of strong price action">⚠ Orderly Dist</button>
            <input type="search" class="smy-sig-search stk-tick-input" placeholder="filter ticker…" style="min-width:120px">
            <button class="fin-subtab-btn smy-ref-toggle" style="padding:2px 8px;font-size:0.7rem;margin-left:4px" title="Toggle column reference">?</button>
          </span>
        </div>
        <div class="tbl-wrap" style="max-height:calc(100vh - 240px)">
          <table class="tbl-dense">
            <thead>
              <tr id="smy-sig-grouphead"></tr>
              <tr id="smy-sig-head"></tr>
            </thead>
            <tbody id="smy-sig-body"></tbody>
          </table>
        </div>
      </div>
    `;

    const headEl = inner.querySelector('#smy-sig-head');
    const tbody = inner.querySelector('#smy-sig-body');
    const countEl = inner.querySelector('.smy-sig-count');
    const searchEl = inner.querySelector('.smy-sig-search');

    function escH(s) {
      return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    async function runSmyAI(ticker, btn) {
      const sig = signals.find(s => s.ticker === ticker);
      if (!sig) return;
      const aiOut = tbody.querySelector(`#smy-ai-out-${smyTkId(ticker)}`);
      if (!aiOut) return;
      btn.disabled = true;
      btn.textContent = 'Analyzing…';
      aiOut.style.display = 'block';
      aiOut.innerHTML = `<div class="ai-loading" style="padding:6px 12px"><span class="ai-spin">⟳</span> Requesting AI analysis…</div>`;
      const ctx = [
        `Score: ${sig.score}/100, Signal: ${sig.signal}`,
        `Price: $${sig.price} (${(sig.price_change_pct >= 0 ? '+' : '') + (sig.price_change_pct != null ? sig.price_change_pct.toFixed(2) : '—')}%)`,
        `MFI: ${sig.mfi != null ? sig.mfi : '—'}, CMF: ${sig.cmf != null ? sig.cmf.toFixed(2) : '—'}`,
        `OBV trend: ${sig.obv ? sig.obv.trend : '—'} (slope ${sig.obv && sig.obv.slope_normalized != null ? sig.obv.slope_normalized.toFixed(3) : '—'})`,
        `Volume spike: ${sig.vol_spike ? sig.vol_spike.ratio.toFixed(1) : '—'}×, Relative volume: ${sig.relative_volume != null ? sig.relative_volume.toFixed(1) : '—'}×`,
        sig.poc_zone ? `In POC zone: price within ±5% of $${sig.poc}` : `POC distance: ${sig.poc_distance_pct != null ? sig.poc_distance_pct.toFixed(1) : '—'}%`,
        sig.insider_cluster && sig.insider_cluster_info
          ? `Insider cluster: ${sig.insider_cluster_info.insiders} insider${sig.insider_cluster_info.insiders > 1 ? 's' : ''} bought $${sig.insider_cluster_info.value.toLocaleString()} in last 7 days`
          : 'No recent insider cluster',
        `Wyckoff Flow Score: ${sig.flow_score != null ? sig.flow_score : 0}/100, Verdict: ${sig.flow_label || 'CLEAR'}`,
        `Vol-trend divergence (price up / vol down): ${sig.vol_trend && sig.vol_trend.diverging ? 'YES' : 'NO'}`,
        `Up-streak: ${sig.streak_up_days || 0} consecutive up-days, Churn bars: ${sig.churn_bars && typeof sig.churn_bars === 'object' ? (sig.churn_bars.count || 0) : (sig.churn_bars || 0)} in last 10 sessions`,
        sig.etf_flow_5d_pct != null ? `ETF 5d flow: ${sig.etf_flow_5d_pct >= 0 ? '+' : ''}${sig.etf_flow_5d_pct.toFixed(1)}%` : 'ETF flow: n/a',
        sig.sector_flow_5d_pct != null ? `Sector 5d flow: ${sig.sector_flow_5d_pct >= 0 ? '+' : ''}${sig.sector_flow_5d_pct.toFixed(1)}%` : 'Sector flow: n/a',
      ].join('. ');
      try {
        const resp = await fetch('https://stocks.clawmo.tech/api/ai/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          mode: 'cors',
          credentials: 'omit',
          body: JSON.stringify({ ticker, company_name: sig.name || ticker, topic: 'SmartMoneyV31', context: ctx, language: 'EN' }),
        });
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const data = await resp.json();
        const reason = data.reason || data.analysis || 'No analysis returned.';
        const now = new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false });
        aiOut.innerHTML = `
          <div class="ai-result-head" style="padding:6px 12px 0">
            <span class="ai-badge">AI</span>
            <span class="ai-meta">SmartMoneySignal · EN · ${now} ET</span>
          </div>
          <div class="ai-text" style="padding:4px 12px 10px">${escH(reason)}</div>`;
      } catch (e) {
        aiOut.innerHTML = `<div style="padding:6px 12px;color:var(--red,#f87171);font-size:0.72rem">AI analysis failed: ${escH(e.message)}</div>`;
      }
      btn.disabled = false;
      btn.innerHTML = '<span class="smy-ai-spark">✦</span>AI Analysis';
    }

    function smyTkId(ticker) { return ticker.replace(/[^A-Za-z0-9]/g, '_'); }

    tbody.addEventListener('click', e => {
      const expBtn = e.target.closest('.smy-exp-btn');
      if (expBtn) {
        const ticker = expBtn.dataset.exp;
        const detRow = tbody.querySelector(`#smy-det-${smyTkId(ticker)}`);
        if (!detRow) return;
        const isOpen = detRow.style.display !== 'none';
        detRow.style.display = isOpen ? 'none' : '';
        expBtn.textContent = isOpen ? '▶' : '▼';
        return;
      }
      const aiBtn = e.target.closest('.smy-ai-btn');
      if (aiBtn && !aiBtn.disabled) runSmyAI(aiBtn.dataset.aiTk, aiBtn);
    });

    function render() {
      // Group header row (no click — labels only). Computed each render but cheap.
      const groupHead = inner.querySelector('#smy-sig-grouphead');
      if (groupHead) {
        const groups = [];
        for (const c of SMY_SIG_COLS) {
          const last = groups[groups.length - 1];
          if (last && last.group === c.group) last.count++;
          else groups.push({ group: c.group, count: 1 });
        }
        groupHead.innerHTML = `<th style="width:18px;padding:0 2px;border-bottom:none;background:transparent"></th>` +
          groups.map(({ group, count }) => {
            const m = SMY_GROUP_META[group] || {};
            if (!m.label) {
              return `<th colspan="${count}" style="border-bottom:none;background:transparent"></th>`;
            }
            return `<th colspan="${count}" style="text-align:center;font-size:0.6rem;letter-spacing:.06em;font-weight:700;padding:3px 4px;background:rgba(${m.rgb},.08);color:rgb(${m.rgb});border-bottom:1px solid rgba(${m.rgb},.4)">${m.label}</th>`;
          }).join('');
      }

      headEl.innerHTML = `<th style="width:18px;padding:0 2px"></th>` + SMY_SIG_COLS.map(c => {
        const active = c.key === state.sortCol;
        const arrow = active ? (state.sortDir === 'desc' ? '▾' : '▴') : '▾';
        const op = active ? '1' : '0.3';
        const gloss = c.gloss ? ` data-glossary="${c.gloss}"` : '';
        return `<th class="smy-sig-th" data-col="${c.key}"${gloss} style="cursor:pointer">${c.label} <span style="opacity:${op}">${arrow}</span></th>`;
      }).join('');

      const q = state.query.trim().toUpperCase();
      let rows = signals.slice();
      // Tag / signal filter
      if (state.tagFilter === 'signals') {
        rows = rows.filter(s => s.score >= 65 || s.score <= 35 || s.is_portfolio || s.tag === 'PORTFOLIO');
      } else if (state.tagFilter === 'pocAccum') {
        rows = rows.filter(s => s.poc_zone && s.score >= 65);
      } else if (state.tagFilter === 'orderlyDist') {
        rows = rows.filter(s => s.flow_label === 'ORDERLY_DISTRIBUTION');
      } else if (state.tagFilter !== 'all') {
        rows = rows.filter(s => {
          const tag = s.tag || (s.is_portfolio ? 'PORTFOLIO' : s.is_sector_etf || s.is_market_etf ? 'MACRO' : 'RADAR');
          return tag === state.tagFilter;
        });
      }
      if (state.sectorFilter) rows = rows.filter(s => s.sector === state.sectorFilter);
      if (q) rows = rows.filter(s => (s.ticker || '').toUpperCase().includes(q) || (s.name || '').toUpperCase().includes(q));
      const col = SMY_SIG_COLS.find(c => c.key === state.sortCol);
      function getSortValue(s, key) {
        if (key === 'vol_trend_diverging') return (s.vol_trend && s.vol_trend.diverging) ? 1 : 0;
        if (key === 'flow_label') {
          const rank = { ORDERLY_DISTRIBUTION: 4, DISTRIBUTION_WARNING: 3, WATCH: 2, CLEAR: 1 };
          return rank[s.flow_label] || 0;
        }
        return s[key];
      }
      rows.sort((a, b) => {
        const av = getSortValue(a, state.sortCol), bv = getSortValue(b, state.sortCol);
        if (col && col.type === 'str' && state.sortCol !== 'flow_label') {
          const cmp = String(av || '').localeCompare(String(bv || ''));
          return state.sortDir === 'asc' ? cmp : -cmp;
        }
        const an = (av == null || !isFinite(av)) ? -Infinity : Number(av);
        const bn = (bv == null || !isFinite(bv)) ? -Infinity : Number(bv);
        return state.sortDir === 'asc' ? an - bn : bn - an;
      });

      tbody.innerHTML = rows.map(s => {
        const pocVal = (s.poc_distance_pct == null || !isFinite(s.poc_distance_pct))
          ? '<span class="mono" style="opacity:0.4">—</span>'
          : (s.poc_zone
              ? `<span class="mono" style="background:rgba(74,222,128,0.18);padding:1px 5px;border-radius:3px" title="In zone: price within ±5% of 3M Point of Control ($${s.poc}). Same cost basis as the volume-weighted majority. +10 to score.">${s.poc_distance_pct >= 0 ? '+' : ''}${s.poc_distance_pct.toFixed(1)}%</span>`
              : `<span class="mono" style="opacity:0.7" title="3M Point of Control: $${s.poc}. Price is ${Math.abs(s.poc_distance_pct).toFixed(1)}% ${s.poc_distance_pct >= 0 ? 'above' : 'below'} POC.">${s.poc_distance_pct >= 0 ? '+' : ''}${s.poc_distance_pct.toFixed(1)}%</span>`);
        const ic = s.insider_cluster_info;
        const clusterCell = s.insider_cluster && ic
          ? `<span class="mono" style="background:rgba(96,165,250,0.18);padding:1px 5px;border-radius:3px" title="${ic.insiders} insider${ic.insiders > 1 ? 's' : ''} bought $${ic.value.toLocaleString()} in the last 7 days (latest: ${ic.latest_date}). +5 to score.">✓ ${ic.insiders}</span>`
          : `<span class="mono" style="opacity:0.4">—</span>`;
        const tagVal = s.tag || (s.is_portfolio ? 'PORTFOLIO' : s.is_sector_etf || s.is_market_etf ? 'MACRO' : 'RADAR');
        const tagColor = tagVal === 'PORTFOLIO' ? 'var(--yellow)' : tagVal === 'MACRO' ? 'var(--text-muted)' : 'var(--blue-dim,#3b82f6)';
        const tkId = s.ticker.replace(/[^A-Za-z0-9]/g, '_');

        // ── v3.1 Wyckoff + ETF flow cells ───────────────────────────────
        const fs = s.flow_score || 0;
        const flowColor = fs >= 60 ? '#ef4444' : fs >= 30 ? '#fbbf24' : '';
        const flowCell = `<span class="mono" style="${flowColor ? 'color:' + flowColor + ';font-weight:700' : 'opacity:0.5'}" title="Distribution warning 0–100. Inputs: 18d vol-trend divergence (+30), churn bars (+10/+20), extension streak ≥10 (+10) / ≥14 (+20), ETF flow <-5% (+25), sector flow <-3% (+15). High Score + High Flow⚠ = ORDERLY DISTRIBUTION (Heaton signal).">${fs}</span>`;
        const verdictMap = {
          ORDERLY_DISTRIBUTION: { c: '#ef4444', bg: 'rgba(239,68,68,0.18)', t: '⚠ ORDERLY' },
          DISTRIBUTION_WARNING: { c: '#fb923c', bg: 'rgba(251,146,60,0.15)', t: 'WARNING' },
          WATCH:                { c: '#fbbf24', bg: 'rgba(251,191,36,0.12)', t: 'WATCH' },
          CLEAR:                { c: '',        bg: '',                       t: 'CLEAR' },
        };
        const vm = verdictMap[s.flow_label] || verdictMap.CLEAR;
        const verdictCell = vm.c
          ? `<span class="mono" style="background:${vm.bg};color:${vm.c};padding:1px 5px;border-radius:3px;font-weight:600;font-size:0.66rem">${vm.t}</span>`
          : `<span class="mono" style="opacity:0.4;font-size:0.66rem">${vm.t}</span>`;
        const volDivCell = (s.vol_trend && s.vol_trend.diverging)
          ? `<span class="mono" style="color:#fb923c;font-weight:700" title="18d price slope ${s.vol_trend.price_slope_pct_per_day != null ? s.vol_trend.price_slope_pct_per_day.toFixed(2) : '—'}%/d positive AND volume slope ${s.vol_trend.volume_slope_pct_per_day != null ? s.vol_trend.volume_slope_pct_per_day.toFixed(2) : '—'}%/d negative >1. Wyckoff distribution.">⚠</span>`
          : `<span class="mono" style="opacity:0.3" title="No 18-day price-up / volume-down divergence">·</span>`;
        const streakVal = s.streak_up_days || 0;
        const streakColor = streakVal >= 14 ? '#ef4444' : streakVal >= 10 ? '#fbbf24' : '';
        const streakCell = `<span class="mono"${streakColor ? ' style="color:' + streakColor + ';font-weight:700"' : ' style="opacity:' + (streakVal > 0 ? '0.7' : '0.3') + '"'} title="Consecutive up-days ending today. ≥10 stretched, ≥14 extreme (4σ rare).">${streakVal}</span>`;
        const churnVal = s.churn_bars && typeof s.churn_bars === 'object' ? (s.churn_bars.count || 0) : (s.churn_bars || 0);
        const churnColor = churnVal >= 2 ? '#fb923c' : '';
        const churnCell = `<span class="mono"${churnColor ? ' style="color:' + churnColor + ';font-weight:700"' : ' style="opacity:' + (churnVal > 0 ? '0.7' : '0.3') + '"'} title="Wyckoff churn bars in last 10 sessions: heavy vol + tight body + close in lower half = supply absorbing demand.">${churnVal}</span>`;
        function _flowPctCell(v) {
          if (v == null) return '<span class="mono" style="opacity:0.25">—</span>';
          const c = v < -5 ? '#ef4444' : v < -2 ? '#fb923c' : v > 5 ? '#4ade80' : v > 2 ? '#86efac' : '';
          return `<span class="mono"${c ? ' style="color:' + c + ';font-weight:600"' : ''}>${v >= 0 ? '+' : ''}${v.toFixed(1)}%</span>`;
        }
        const etfFlowCell    = _flowPctCell(s.etf_flow_5d_pct);
        const sectorFlowCell = _flowPctCell(s.sector_flow_5d_pct);

        return `
        <tr>
          <td style="width:18px;padding:0 3px;text-align:center">
            <button class="smy-exp-btn" data-exp="${s.ticker}" title="Show signal breakdown" style="background:none;border:none;color:var(--fg-dim,#6b7280);cursor:pointer;font-size:0.65rem;padding:0 2px;line-height:1">▶</button>
          </td>
          <td class="tk clickable" data-tk="${s.ticker}" ${tagVal!=='MACRO'&&s.name&&s.name!==s.ticker?`title="${(s.name||'').replace(/"/g,'&quot;')}"`:''}>
            ${s.ticker}${tagVal==='MACRO'&&s.name&&s.name!==s.ticker?`<span style="opacity:0.4;font-size:0.62rem;margin-left:4px">· ${s.name}</span>`:''}
          </td>
          <td class="pat" style="font-size:0.68rem;color:${tagColor}">${tagVal}</td>
          <td class="pat" style="font-size:0.68rem;opacity:0.65">${s.sector || '—'}</td>
          <td class="pat">${s.date || '—'}</td>
          <td class="mono">${fmt.num(s.price, 2)}</td>
          <td class="mono ${pnlCls(s.price_change_pct)}">${fmt.pct(s.price_change_pct)}</td>
          <td class="mono">${fmt.num(s.relative_volume, 1)}×</td>
          <td class="mono">${fmt.num(s.mfi, 0)}</td>
          <td class="mono ${pnlCls(s.cmf)}">${fmt.num(s.cmf, 2)}</td>
          <td>${pocVal}</td>
          <td>${clusterCell}</td>
          <td class="mono">${fmt.num(s.score, 0)}</td>
          <td class="pat" style="${{STRONG_ACCUMULATION:'color:#4ade80;font-weight:700',ACCUMULATION:'color:#86efac;font-weight:600',DISTRIBUTION:'color:#fb923c;font-weight:600',STRONG_DISTRIBUTION:'color:#f87171;font-weight:700'}[s.signal]||'opacity:0.5'}">${(s.signal || '—').replace(/_/g, ' ')}</td>
          <td>${flowCell}</td>
          <td>${verdictCell}</td>
          <td style="text-align:center">${volDivCell}</td>
          <td>${streakCell}</td>
          <td>${churnCell}</td>
          <td>${etfFlowCell}</td>
          <td>${sectorFlowCell}</td>
        </tr>
        <tr class="smy-det-row" id="smy-det-${tkId}" style="display:none">
          <td colspan="21" style="padding:0;border-bottom:1px solid var(--border);white-space:normal">
            <div style="padding:8px 12px 8px 14px;border-left:2px solid var(--accent);background:var(--panel-alt,var(--panel));display:flex;align-items:center;gap:14px;flex-wrap:wrap;white-space:normal">
              <span style="font-size:0.72rem;line-height:1.55;color:var(--fg);flex:1;min-width:200px;white-space:normal">${escH(s.reason || '')}</span>
              <span style="width:1px;align-self:stretch;background:var(--border);flex-shrink:0"></span>
              <button class="smy-ai-btn smy-ai-cta" data-ai-tk="${s.ticker}" title="Run AI deep analysis on these signals"><span class="smy-ai-spark">✦</span>AI Analysis</button>
            </div>
            <div class="smy-ai-out" id="smy-ai-out-${tkId}" style="display:none;white-space:normal"></div>
          </td>
        </tr>`;
      }).join('') || '<tr><td colspan="21" class="empty">no matches</td></tr>';

      if (countEl) countEl.textContent = q ? `${rows.length} of ${signals.length}` : String(signals.length);

      inner.querySelectorAll('.smy-sig-th').forEach(th => {
        th.addEventListener('click', () => {
          const c = th.dataset.col;
          if (state.sortCol === c) state.sortDir = state.sortDir === 'desc' ? 'asc' : 'desc';
          else { state.sortCol = c; state.sortDir = (c === 'ticker' || c === 'date' || c === 'signal') ? 'asc' : 'desc'; }
          render();
        });
      });
      attachTickerClicks(inner);
    }
    if (searchEl) searchEl.addEventListener('input', e => { state.query = e.target.value; render(); });

    inner.querySelectorAll('.smy-tag-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.tagFilter = btn.dataset.smytag;
        if (state.tagFilter === 'pocAccum') { state.sortCol = 'score'; state.sortDir = 'desc'; }
        inner.querySelectorAll('.smy-tag-btn').forEach(b => b.classList.toggle('active', b === btn));
        render();
      });
    });

    // Sector heatmap row clicks
    inner.querySelectorAll('.smy-sec-row').forEach(row => {
      row.addEventListener('click', () => {
        const name = row.dataset.sector;
        state.sectorFilter = state.sectorFilter === name ? null : name;
        inner.querySelectorAll('.smy-sec-row').forEach(r => r.classList.toggle('active', r.dataset.sector === state.sectorFilter));
        const lbl = inner.querySelector('.smy-sec-active-label');
        if (lbl) lbl.textContent = state.sectorFilter ? `· ${state.sectorFilter}` : '';
        render();
      });
    });

    const refToggle = inner.querySelector('.smy-ref-toggle');
    const refPanel  = inner.querySelector('#smy-ref-panel');
    if (refToggle && refPanel) {
      refToggle.addEventListener('click', () => {
        const visible = refPanel.style.display !== 'none';
        refPanel.style.display = visible ? 'none' : 'block';
        refToggle.classList.toggle('active', !visible);
      });
    }

    render();
  }

  /* ── Insider tab — summary + Top Week + Latest Buys/Sales ─── */
  function renderSmyInsider(inner, d) {
    if (!d) { inner.innerHTML = '<div class="mod-loading">No insider-trades data</div>'; return; }
    const sum = d.summary || {};
    const totalB = sum.total_buy_value || 0;
    const totalS = sum.total_sell_value || 0;
    const net = totalB - totalS;
    const sentimentCls = net > 0 ? 'num-up' : net < 0 ? 'num-dn' : '';
    const ratioCls = (sum.buy_sell_ratio || 0) >= 1 ? 'num-up' : 'num-dn';
    const topB = (sum.top_bought_tickers || []).slice(0, 5);
    const topS = (sum.top_sold_tickers || []).slice(0, 5);

    inner.innerHTML = `
      <div class="acct-strip" style="grid-template-columns:repeat(4,1fr)">
        <div class="acct-card">
          <div class="acct-name">NET FLOW · 90D</div>
          <div class="acct-val"><span class="mono ${sentimentCls}">${net >= 0 ? '+' : ''}${fmt.compact(net)}</span></div>
          <div class="acct-meta"><span>buys ${fmt.compact(totalB)} · sells ${fmt.compact(totalS)}</span></div>
        </div>
        <div class="acct-card">
          <div class="acct-name">BUY / SELL RATIO</div>
          <div class="acct-val"><span class="mono ${ratioCls}">${sum.buy_sell_ratio != null ? sum.buy_sell_ratio.toFixed(2) + '×' : '—'}</span></div>
          <div class="acct-meta"><span>$ buys / $ sells</span></div>
        </div>
        <div class="acct-card">
          <div class="acct-name">BUYS · trades</div>
          <div class="acct-val"><span class="mono num-up">${sum.buy_count ?? '—'}</span></div>
          <div class="acct-meta"><span>across ${topB.length} top tickers</span></div>
        </div>
        <div class="acct-card">
          <div class="acct-name">SELLS · trades</div>
          <div class="acct-val"><span class="mono num-dn">${sum.sell_count ?? '—'}</span></div>
          <div class="acct-meta"><span>across ${topS.length} top tickers</span></div>
        </div>
      </div>

      <div class="mod-grid-2">
        <div class="mod-panel">
          <div class="mod-panel-title">TOP TICKERS · bought · 90d aggregate</div>
          ${renderTopTickerList(topB, 'buy')}
        </div>
        <div class="mod-panel">
          <div class="mod-panel-title">TOP TICKERS · sold · 90d aggregate</div>
          ${renderTopTickerList(topS, 'sell')}
        </div>
      </div>

      ${renderInsiderListPanel('Latest Buys', d.latest_buys || [], 'buy')}
      ${renderInsiderListPanel('Latest Sales', d.latest_sales || [], 'sell')}
    `;
    wireInsiderFilters(inner);
  }

  function renderTopTickerList(list, side) {
    if (!list.length) return '<div class="mod-loading">none</div>';
    return `<div class="tbl-wrap"><table class="tbl-dense">
      <thead><tr><th>TICKER</th><th class="num">TRADES</th><th class="num">VALUE</th></tr></thead>
      <tbody>${list.map(t => `<tr>
        <td class="tk clickable" data-tk="${t.ticker || t.symbol}">${t.ticker || t.symbol || '—'}</td>
        <td class="mono">${t.count ?? t.trades ?? '—'}</td>
        <td class="mono ${side === 'buy' ? 'num-up' : 'num-dn'}">${fmt.compact(t.value || t.total_value)}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  }

  function renderInsiderListPanel(title, list, side) {
    const sideClass = side === 'buy' ? 'num-up' : 'num-dn';
    const panelId = side === 'buy' ? 'ins-buy' : 'ins-sell';
    return `
      <div class="mod-panel" data-insider-panel="${side}">
        <div class="mod-panel-title">
          ${title.toUpperCase()} · <span class="mono ins-count">${list.length}</span>
          <input type="search" class="ins-search stk-tick-input" placeholder="filter ticker…" style="margin-left:8px;min-width:140px">
        </div>
        <div class="tbl-wrap" style="max-height:320px">
          <table class="tbl-dense">
            <thead><tr>
              <th>DATE</th><th>TICKER</th><th>OWNER</th><th>ROLE</th>
              <th class="num">SHARES</th><th class="num">@</th><th class="num">VALUE</th>
              <th class="num">TOTAL HELD</th><th>SEC</th>
            </tr></thead>
            <tbody data-panel-tbody="${panelId}">${renderInsiderRows(list, side)}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderInsiderRows(list, side) {
    if (!list.length) return '<tr><td colspan="9" class="empty">no trades</td></tr>';
    const cls = side === 'buy' ? 'num-up' : 'num-dn';
    return list.map(t => `<tr>
      <td class="mono">${t.date || '—'}</td>
      <td class="tk clickable" data-tk="${t.ticker}">${t.ticker}</td>
      <td>${t.owner || '—'}</td>
      <td class="small">${(t.relationship || '—').slice(0, 40)}</td>
      <td class="mono">${fmt.compact(t.shares)}</td>
      <td class="mono">${t.cost != null ? '$' + Number(t.cost).toFixed(2) : '—'}</td>
      <td class="mono ${cls}">${fmt.compact(t.value)}</td>
      <td class="mono">${fmt.compact(t.shares_total)}</td>
      <td>${t.sec_link ? `<a href="${t.sec_link}" target="_blank" rel="noopener" style="color:var(--accent)">Form 4 ↗</a>` : '—'}</td>
    </tr>`).join('');
  }

  function wireInsiderFilters(inner) {
    inner.querySelectorAll('[data-insider-panel]').forEach(panelEl => {
      const side = panelEl.dataset.insiderPanel;
      const searchEl = panelEl.querySelector('.ins-search');
      const countEl = panelEl.querySelector('.ins-count');
      const tbody = panelEl.querySelector('tbody');
      if (!searchEl || !tbody) return;
      // We need the source list — re-read from body._smyData.ins
      const rootBody = panelEl.closest('.pane-body');
      const d = rootBody && rootBody._smyData && rootBody._smyData.ins;
      if (!d) return;
      const list = side === 'buy' ? (d.latest_buys || []) : (d.latest_sales || []);
      const total = list.length;

      searchEl.addEventListener('input', () => {
        const q = searchEl.value.trim().toUpperCase();
        const filtered = q ? list.filter(t => (t.ticker || '').toUpperCase().includes(q)) : list;
        tbody.innerHTML = renderInsiderRows(filtered, side);
        if (countEl) countEl.textContent = q ? `${filtered.length} of ${total}` : String(total);
        attachTickerClicks(panelEl);
      });
    });
  }

  /* ── Congress tab — summary + chamber/type/notable filters ─ */
  const CG_COLS = [
    { key: 'date',       label: 'TX DATE',   type: 'str' },
    { key: 'disclosed',  label: 'DISCLOSED', type: 'str' },
    { key: 'name',       label: 'MEMBER',    type: 'str' },
    { key: 'chamber',    label: 'CHAMBER',   type: 'str' },
    { key: 'district',   label: 'DIST',      type: 'str' },
    { key: 'symbol',     label: 'TICKER',    type: 'str' },
    { key: 'type',       label: 'TX',        type: 'str' },
    { key: 'amount',     label: 'AMOUNT',    type: 'str' },
  ];

  function renderSmyCongress(inner, d) {
    if (!d) { inner.innerHTML = '<div class="mod-loading">No congress data</div>'; return; }
    const sum = d.summary || {};
    const trades = d.trades || [];

    inner.innerHTML = `
      <div class="acct-strip" style="grid-template-columns:repeat(4,1fr)">
        <div class="acct-card">
          <div class="acct-name">TOTAL TRADES</div>
          <div class="acct-val"><span class="mono">${sum.totalTrades ?? trades.length}</span></div>
          <div class="acct-meta"><span>${sum.uniqueMembers ?? '—'} unique members</span></div>
        </div>
        <div class="acct-card">
          <div class="acct-name">PURCHASES / SALES</div>
          <div class="acct-val"><span class="mono num-up">${sum.purchases ?? '—'}</span><span class="acct-slash"> / </span><span class="mono num-dn">${sum.sales ?? '—'}</span></div>
          <div class="acct-meta"><span>type split</span></div>
        </div>
        <div class="acct-card">
          <div class="acct-name">SENATE</div>
          <div class="acct-val"><span class="mono">${sum.senate ?? '—'}</span></div>
          <div class="acct-meta"><span>upper chamber trades</span></div>
        </div>
        <div class="acct-card">
          <div class="acct-name">HOUSE</div>
          <div class="acct-val"><span class="mono">${sum.house ?? '—'}</span></div>
          <div class="acct-meta"><span>lower chamber trades</span></div>
        </div>
      </div>

      <div class="mod-panel" data-smy-panel="congress">
        <div class="mod-panel-title">
          CONGRESS TRADES · <span class="mono smy-cg-count">${trades.length}</span>
          <span class="fin-stmt-toggles" style="margin-left:10px">
            <button class="hld-cg-btn smy-cg-btn" data-ch="all" type="button">ALL</button>
            <button class="hld-cg-btn smy-cg-btn" data-ch="senate" type="button">SENATE</button>
            <button class="hld-cg-btn smy-cg-btn" data-ch="house" type="button">HOUSE</button>
          </span>
          <span class="fin-stmt-toggles" style="margin-left:8px">
            <button class="hld-cg-btn smy-cg-type-btn" data-tp="all" type="button">ALL TX</button>
            <button class="hld-cg-btn smy-cg-type-btn" data-tp="buy" type="button">BUY</button>
            <button class="hld-cg-btn smy-cg-type-btn" data-tp="sell" type="button">SELL</button>
          </span>
          <span class="fin-stmt-toggles" style="margin-left:8px">
            <button class="hld-cg-btn smy-cg-notable-btn" data-nt="all" type="button">ALL MEMBERS</button>
            <button class="hld-cg-btn smy-cg-notable-btn" data-nt="notable" type="button">★ NOTABLE</button>
          </span>
          <input type="search" class="smy-cg-search stk-tick-input" placeholder="filter name/ticker…" style="margin-left:8px;min-width:160px">
        </div>
        <div class="tbl-wrap" style="max-height:calc(100vh - 340px);min-height:300px">
          <table class="tbl-dense">
            <thead><tr id="smy-cg-head"></tr></thead>
            <tbody id="smy-cg-body"></tbody>
          </table>
        </div>
      </div>
    `;
    wireCongressTable(inner, trades);
  }

  /* ── Trump politics tab — OGE 278 holdings + SEC Form 3/4/5 transactions ─── */
  function bandMaxTr(v) {
    if (!v || v.indexOf('None') >= 0) return 0;
    const nums = (v.match(/\$([\d,]+)/g) || []).map(s => parseInt(s.replace(/[$,]/g, '')));
    return nums.length ? nums[nums.length - 1] : 0;
  }
  function shTr(n) {
    if (n == null) return '—';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return String(n);
  }
  function actBadgeTr(a) {
    const x = (a || '').toLowerCase();
    if (x.includes('buy') || x.includes('purchase')) return '<span class="num-up">BUY</span>';
    if (x.includes('sell') || x.includes('sale') || x.includes('disposition')) return '<span class="num-dn">SELL</span>';
    if (x.includes('award')) return '<span style="color:#60a5fa">AWARD</span>';
    if (x.includes('gift')) return '<span style="color:#fbbf24">GIFT</span>';
    if (x.includes('initial')) return '<span style="color:#a855f7">HOLD</span>';
    return '<span style="opacity:.6">' + (a || '—') + '</span>';
  }

  function renderSmyTrump(inner, d) {
    if (!d) { inner.innerHTML = '<div class="mod-loading">No Trump data — run compute_politics_trump.py</div>'; return; }
    const stake = d.djt_stake;
    const jr = d.djt_jr_personal;
    const sum = d.summary || {};
    const seedDate = (d.holdings_seed || {}).as_of || '—';
    const holdings = (d.holdings || []).slice();
    const txns = (d.transactions || []).slice();

    inner.innerHTML = `
      <div class="acct-strip" style="grid-template-columns:repeat(4,1fr)">
        <div class="acct-card">
          <div class="acct-name">DJT TRUST STAKE</div>
          <div class="acct-val"><span class="mono num-up">${stake ? shTr(stake.shares) : '—'}</span></div>
          <div class="acct-meta"><span>${stake ? stake.via + ' · ' + stake.as_of : '—'}</span></div>
        </div>
        <div class="acct-card">
          <div class="acct-name">TRUMP JR. DJT (DIRECT)</div>
          <div class="acct-val"><span class="mono">${jr ? shTr(jr.shares) : '—'}</span></div>
          <div class="acct-meta"><span>${jr ? jr.via + ' · ' + jr.as_of : 'no direct holdings'}</span></div>
        </div>
        <div class="acct-card">
          <div class="acct-name">HOLDINGS (OGE 278)</div>
          <div class="acct-val"><span class="mono">${sum.holdings_count ?? 0}</span></div>
          <div class="acct-meta"><span>≥$50K bands · as of ${seedDate}</span></div>
        </div>
        <div class="acct-card">
          <div class="acct-name">OGE 278-T TXNS</div>
          <div class="acct-val"><span class="mono">${(sum.oge_278t_count ?? 0).toLocaleString()}</span></div>
          <div class="acct-meta"><span>${sum.oge_278t_pdfs ?? 0} periodic PDF(s)</span></div>
        </div>
      </div>

      <div class="mod-panel" data-smy-panel="trump-hold" style="margin-top:8px">
        <div class="mod-panel-title">
          HOLDINGS · <span class="mono smy-tr-hold-count">${holdings.length}</span>
          <input type="search" class="smy-tr-hold-search stk-tick-input" placeholder="filter ticker / asset…" style="margin-left:8px;min-width:180px">
        </div>
        <div class="tbl-wrap" style="max-height:280px;min-height:140px">
          <table class="tbl-dense">
            <thead><tr>
              <th>Ticker</th><th>Asset</th><th style="text-align:right">Value Band</th><th style="text-align:right">Band Top</th>
            </tr></thead>
            <tbody id="smy-tr-hold-body"></tbody>
          </table>
        </div>
      </div>

      <div class="mod-panel" data-smy-panel="trump-txn" style="margin-top:8px">
        <div class="mod-panel-title">
          TRANSACTIONS · <span class="mono smy-tr-txn-count">${txns.length}</span>
          <span class="fin-stmt-toggles" style="margin-left:10px">
            <button class="hld-cg-btn smy-tr-src-btn" data-sr="all" type="button">ALL</button>
            <button class="hld-cg-btn smy-tr-src-btn" data-sr="oge" type="button">OGE</button>
            <button class="hld-cg-btn smy-tr-src-btn" data-sr="sec" type="button">SEC</button>
          </span>
          <span class="fin-stmt-toggles" style="margin-left:8px">
            <button class="hld-cg-btn smy-tr-act-btn" data-ac="all" type="button">ALL TX</button>
            <button class="hld-cg-btn smy-tr-act-btn" data-ac="buy" type="button">BUY</button>
            <button class="hld-cg-btn smy-tr-act-btn" data-ac="sell" type="button">SELL</button>
          </span>
          <input type="search" class="smy-tr-txn-search stk-tick-input" placeholder="filter ticker/asset…" style="margin-left:8px;min-width:160px">
        </div>
        <div class="tbl-wrap" style="max-height:calc(100vh - 540px);min-height:200px">
          <table class="tbl-dense">
            <thead><tr>
              <th>Date</th><th>Src</th><th>Ticker</th><th>Asset</th>
              <th style="text-align:center">Action</th>
              <th style="text-align:right">Amount</th><th style="text-align:right">Shares</th><th style="text-align:center">Link</th>
            </tr></thead>
            <tbody id="smy-tr-txn-body"></tbody>
          </table>
        </div>
      </div>

      <div class="mod-foot" style="margin-top:6px;font-size:0.62rem;opacity:.6">${d.disclaimer || ''}</div>
    `;

    wireTrumpTables(inner, holdings, txns);
  }

  function wireTrumpTables(inner, holdings, txns) {
    const holdBody = inner.querySelector('#smy-tr-hold-body');
    const txnBody  = inner.querySelector('#smy-tr-txn-body');
    const holdCount = inner.querySelector('.smy-tr-hold-count');
    const txnCount  = inner.querySelector('.smy-tr-txn-count');
    const state = { holdQ: '', txnQ: '', src: 'all', action: 'all' };

    function renderHold() {
      const q = state.holdQ.toLowerCase();
      const rows = holdings.filter(h =>
        !q || (h.ticker || '').toLowerCase().includes(q) || (h.asset || '').toLowerCase().includes(q)
      );
      holdCount.textContent = rows.length;
      holdBody.innerHTML = rows.map(h => `
        <tr>
          <td><span class="mono ticker" data-ticker="${escapeGex(h.ticker || '')}">${h.ticker || '—'}</span></td>
          <td style="opacity:.8;font-size:.7rem">${escapeGex(h.asset)}</td>
          <td style="text-align:right" class="mono">${escapeGex(h.value_range || '—')}</td>
          <td style="text-align:right;opacity:.7" class="mono">$${bandMaxTr(h.value_range).toLocaleString()}</td>
        </tr>`).join('');
    }

    function renderTxn() {
      const q = state.txnQ.toLowerCase();
      const sr = state.src;
      const ac = state.action;
      const rows = txns.filter(t => {
        const isOGE = (t.source || '').indexOf('OGE') >= 0;
        const isSEC = (t.source || '').indexOf('SEC') >= 0;
        if (sr === 'oge' && !isOGE) return false;
        if (sr === 'sec' && !isSEC) return false;
        const a = (t.action || '').toLowerCase();
        if (ac === 'buy'  && !(a.includes('buy')  || a.includes('purchase'))) return false;
        if (ac === 'sell' && !(a.includes('sell') || a.includes('sale')))     return false;
        if (q && !((t.ticker || '').toLowerCase().includes(q)
                || (t.asset  || '').toLowerCase().includes(q)
                || (t.issuer || '').toLowerCase().includes(q))) return false;
        return true;
      });
      txnCount.textContent = rows.length;
      txnBody.innerHTML = rows.slice(0, 800).map(t => {
        const isOGE = (t.source || '').indexOf('OGE') >= 0;
        const srcBadge = isOGE
          ? '<span style="color:#fb923c;font-weight:700">OGE</span>'
          : '<span style="color:#60a5fa;font-weight:700">SEC</span>';
        const assetCell = isOGE ? (t.asset || '') : (t.issuer || '');
        const amountCell = isOGE
          ? '$' + (t.amount_lo || '?') + '–$' + (t.amount_hi || '?')
          : (t.shares != null && t.price != null && t.price > 0 ? '$' + (t.shares * t.price).toLocaleString() : '—');
        return `
        <tr>
          <td class="mono" style="font-size:.68rem">${t.date || '—'}</td>
          <td style="font-size:.62rem">${srcBadge}</td>
          <td><span class="mono ticker" data-ticker="${escapeGex(t.ticker || '')}">${t.ticker || '—'}</span></td>
          <td style="opacity:.8;font-size:.65rem;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeGex(assetCell)}">${escapeGex(assetCell || '—')}</td>
          <td style="text-align:center">${actBadgeTr(t.action)}</td>
          <td style="text-align:right" class="mono" style="font-size:.65rem">${amountCell}</td>
          <td style="text-align:right" class="mono">${shTr(t.shares)}</td>
          <td style="text-align:center;font-size:.62rem">${t.source_url ? `<a href="${t.source_url}" target="_blank" rel="noopener" style="color:#a78bfa">→</a>` : '—'}</td>
        </tr>`;
      }).join('');
    }

    renderHold();
    renderTxn();

    inner.querySelector('.smy-tr-hold-search').addEventListener('input', e => { state.holdQ = e.target.value; renderHold(); });
    inner.querySelector('.smy-tr-txn-search').addEventListener('input',  e => { state.txnQ  = e.target.value; renderTxn();  });
    inner.querySelectorAll('.smy-tr-src-btn').forEach(b => {
      b.addEventListener('click', () => {
        state.src = b.dataset.sr;
        inner.querySelectorAll('.smy-tr-src-btn').forEach(x => x.classList.toggle('active', x === b));
        renderTxn();
      });
    });
    inner.querySelectorAll('.smy-tr-act-btn').forEach(b => {
      b.addEventListener('click', () => {
        state.action = b.dataset.ac;
        inner.querySelectorAll('.smy-tr-act-btn').forEach(x => x.classList.toggle('active', x === b));
        renderTxn();
      });
    });
    const defSrc = inner.querySelector('.smy-tr-src-btn[data-sr="all"]');
    const defAct = inner.querySelector('.smy-tr-act-btn[data-ac="all"]');
    if (defSrc) defSrc.classList.add('active');
    if (defAct) defAct.classList.add('active');
  }

  function wireCongressTable(inner, trades) {
    const panelEl = inner.querySelector('[data-smy-panel="congress"]');
    if (!panelEl) return;
    const tbody = panelEl.querySelector('#smy-cg-body');
    const headEl = panelEl.querySelector('#smy-cg-head');
    const countEl = panelEl.querySelector('.smy-cg-count');
    const searchEl = panelEl.querySelector('.smy-cg-search');
    const total = trades.length;

    const state = { chamber: 'all', type: 'all', notable: 'all', sortCol: 'date', sortDir: 'desc', query: '' };

    function styleBtns(sel, key) {
      panelEl.querySelectorAll(sel).forEach(b => {
        const active = b.dataset[key] === state[key === 'ch' ? 'chamber' : key === 'tp' ? 'type' : 'notable'];
        b.classList.toggle('active', active);
      });
    }

    function render() {
      headEl.innerHTML = CG_COLS.map(c => {
        const active = c.key === state.sortCol;
        const arrow = active ? (state.sortDir === 'desc' ? '▾' : '▴') : '▾';
        const op = active ? '1' : '0.3';
        return `<th class="smy-cg-th" data-col="${c.key}" style="cursor:pointer">${c.label} <span style="opacity:${op}">${arrow}</span></th>`;
      }).join('') + '<th>LINK</th>';

      let rows = trades.slice();
      if (state.chamber !== 'all') rows = rows.filter(t => t.chamber === state.chamber);
      if (state.type === 'buy') rows = rows.filter(t => (t.type || '').toLowerCase().includes('purchase') || (t.type || '').toLowerCase().includes('buy'));
      if (state.type === 'sell') rows = rows.filter(t => (t.type || '').toLowerCase().includes('sale') || (t.type || '').toLowerCase().includes('sell'));
      const getNotable = window.OC_NOTABLE && window.OC_NOTABLE.getNotable;
      if (state.notable === 'notable' && getNotable) rows = rows.filter(t => !!getNotable(t.name));
      const q = state.query.trim().toUpperCase();
      if (q) rows = rows.filter(t => (t.name || '').toUpperCase().includes(q) || (t.symbol || '').toUpperCase().includes(q));

      const col = CG_COLS.find(c => c.key === state.sortCol);
      rows.sort((a, b) => {
        const av = a[state.sortCol], bv = b[state.sortCol];
        if (col && col.type === 'str') {
          const cmp = String(av || '').localeCompare(String(bv || ''));
          return state.sortDir === 'asc' ? cmp : -cmp;
        }
        const an = (av == null || !isFinite(av)) ? -Infinity : Number(av);
        const bn = (bv == null || !isFinite(bv)) ? -Infinity : Number(bv);
        return state.sortDir === 'asc' ? an - bn : bn - an;
      });

      const badge = window.OC_NOTABLE && window.OC_NOTABLE.notableBadge;
      tbody.innerHTML = rows.slice(0, 500).map(t => {
        const txLow = (t.type || '').toLowerCase();
        const txCls = txLow.includes('purchase') || txLow.includes('buy') ? 'num-up' : txLow.includes('sale') || txLow.includes('sell') ? 'num-dn' : '';
        const chamberChip = t.chamber === 'senate'
          ? '<span style="background:#1a3a5c;color:#fff;padding:1px 6px;border-radius:2px;font-size:9px;font-weight:600">SENATE</span>'
          : t.chamber === 'house'
            ? '<span style="background:#5c1a1a;color:#fff;padding:1px 6px;border-radius:2px;font-size:9px;font-weight:600">HOUSE</span>'
            : (t.chamber || '—');
        const notableHtml = badge ? badge(t.name) : '';
        return `<tr>
          <td class="mono">${t.date || '—'}</td>
          <td class="mono small">${t.disclosed || '—'}</td>
          <td>${t.name || '—'}${notableHtml}</td>
          <td>${chamberChip}</td>
          <td class="small">${t.district || '—'}</td>
          <td class="tk clickable" data-tk="${t.symbol || ''}">${t.symbol || '—'}</td>
          <td class="${txCls}">${t.type || '—'}</td>
          <td class="mono">${t.amount || '—'}</td>
          <td>${t.link ? `<a href="${t.link}" target="_blank" rel="noopener" style="color:var(--accent)">Filing ↗</a>` : '—'}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="9" class="empty">no trades match filters</td></tr>';

      if (countEl) countEl.textContent = `${rows.length} of ${total}${rows.length > 500 ? ' · showing top 500' : ''}`;
      styleBtns('.smy-cg-btn', 'ch');
      styleBtns('.smy-cg-type-btn', 'tp');
      styleBtns('.smy-cg-notable-btn', 'nt');

      panelEl.querySelectorAll('.smy-cg-th').forEach(th => {
        th.addEventListener('click', () => {
          const c = th.dataset.col;
          if (state.sortCol === c) state.sortDir = state.sortDir === 'desc' ? 'asc' : 'desc';
          else { state.sortCol = c; state.sortDir = (c === 'date' || c === 'disclosed') ? 'desc' : 'asc'; }
          render();
        });
      });
      attachTickerClicks(panelEl);
    }

    panelEl.querySelectorAll('.smy-cg-btn').forEach(b => b.addEventListener('click', () => { state.chamber = b.dataset.ch; render(); }));
    panelEl.querySelectorAll('.smy-cg-type-btn').forEach(b => b.addEventListener('click', () => { state.type = b.dataset.tp; render(); }));
    panelEl.querySelectorAll('.smy-cg-notable-btn').forEach(b => b.addEventListener('click', () => { state.notable = b.dataset.nt; render(); }));
    if (searchEl) searchEl.addEventListener('input', () => { state.query = searchEl.value; render(); });
    render();
  }

  function attachTickerClicks(body) {
    body.querySelectorAll('.tk.clickable').forEach(el => {
      el.addEventListener('click', () => {
        const t = el.dataset.tk;
        if (t && window.OC_OPEN_MODULE) window.OC_OPEN_MODULE('stock-analysis', { ticker: t });
      });
    });
  }

  window.OC_MODULES = window.OC_MODULES || {};
  window.OC_MODULES['screener']    = { render: renderScreener };
  window.OC_MODULES['sctr']        = { render: renderSCTR };
  window.OC_MODULES['gex']         = { render: renderGEX };
  window.OC_MODULES['smart-money'] = { render: renderSmartMoney };
})();
