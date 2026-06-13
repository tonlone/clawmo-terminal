/* F10 HMP — Market Heatmap
 *
 * Proper squarify treemap (Bruls-Huizing-van Wijk 2000). Two-dimensional encoding:
 *   · tile SIZE  = market cap (sectors sized by total sector cap, stocks within
 *                  sized by individual cap)
 *   · tile COLOR = % change on the selected timeframe
 *
 * Matches the Bloomberg / Finviz / Yahoo pattern. Replaces the prior fixed-grid
 * renderer which made mega-caps look equal in importance to mid-caps.
 *
 * Data: https://stocks.clawmo.tech/data/heatmap.json — timeframes 1D / 1W / 1M
 *       / 3M / 6M / YTD / 1Y; 11 GICS sectors; ~500 stocks.
 */
(function () {
  'use strict';
  const { fetchJSON, fmt } = window.OC_DATA;

  const TIMEFRAMES = ['1D', '1W', '1M', '3M', '6M', 'YTD', '1Y'];

  /* Color saturation point per timeframe — a fixed ±5% scale washes out
     longer views (every 1Y tile pinned at full green/red). */
  const TF_SCALE = { '1D': 5, '1W': 7, '1M': 10, '3M': 15, '6M': 20, 'YTD': 25, '1Y': 40 };

  /* ── Squarify (Bruls-Huizing-van Wijk) ─────────────────────────
     Items are laid out against the shorter side of the current rect;
     greedy grouping minimises worst-case aspect ratio per row. */
  function squarify(items, rect) {
    if (!items.length) return [];
    const totalValue = items.reduce((s, d) => s + d.value, 0);
    if (totalValue <= 0) return [];
    const totalArea = rect.w * rect.h;
    let remaining = items.map(d => ({ ...d, area: (d.value / totalValue) * totalArea }));
    const results = [];
    let r = { ...rect };

    function worst(row, side) {
      if (!row.length || side <= 0) return Infinity;
      const s = row.reduce((a, d) => a + d.area, 0);
      const s2 = s * s, side2 = side * side;
      let maxR = 0;
      for (const d of row) {
        const ar = Math.max((side2 * d.area) / s2, s2 / (side2 * d.area));
        if (ar > maxR) maxR = ar;
      }
      return maxR;
    }

    while (remaining.length > 0) {
      const shorter = Math.min(r.w, r.h);
      const row = [remaining[0]];
      let restIdx = 1;
      while (restIdx < remaining.length) {
        const withNext = [...row, remaining[restIdx]];
        if (worst(withNext, shorter) <= worst(row, shorter)) {
          row.push(remaining[restIdx]);
          restIdx++;
        } else break;
      }
      const rowArea = row.reduce((a, d) => a + d.area, 0);
      const isWide = r.w >= r.h;
      const rowThickness = rowArea / (isWide ? r.h : r.w);
      let offset = 0;
      for (const item of row) {
        const cellLength = item.area / rowThickness;
        if (isWide) results.push({ ...item, x: r.x, y: r.y + offset, w: rowThickness, h: cellLength });
        else        results.push({ ...item, x: r.x + offset, y: r.y, w: cellLength, h: rowThickness });
        offset += cellLength;
      }
      if (isWide) r = { x: r.x + rowThickness, y: r.y, w: r.w - rowThickness, h: r.h };
      else        r = { x: r.x, y: r.y + rowThickness, w: r.w, h: r.h - rowThickness };
      remaining = remaining.slice(restIdx);
    }
    return results;
  }

  /* HSL red→grey→green, saturating at ±scale% for the active timeframe. */
  function getColor(pct, scale) {
    if (pct == null || isNaN(pct) || Math.abs(pct) < 0.05) return 'hsl(0, 0%, 22%)';
    const t = Math.min(Math.abs(pct) / scale, 1);
    const h = pct > 0 ? 140 : 0;
    const s = 50 + t * 30;
    const l = 18 + t * 14;
    return `hsl(${h}, ${s}%, ${l}%)`;
  }

  function textColor(bg) {
    // Extract L from the hsl() string; flip text color past ~30%
    const m = /hsl\([^,]+,[^,]+,\s*(\d+(?:\.\d+)?)%/.exec(bg);
    const l = m ? parseFloat(m[1]) : 20;
    return l > 30 ? '#0a0e14' : '#e6edf3';
  }

  function fmtCap(v) {
    if (v == null) return '—';
    if (v >= 1e12) return '$' + (v / 1e12).toFixed(2) + 'T';
    if (v >= 1e9)  return '$' + (v / 1e9).toFixed(2) + 'B';
    if (v >= 1e6)  return '$' + (v / 1e6).toFixed(0) + 'M';
    return '$' + v.toFixed(0);
  }

  /* ── Render treemap ─────────────────────────────────────────── */
  function renderTreemap(container, d, tf) {
    container.innerHTML = '';
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width < 20 || height < 20) return;

    const sectorList = Object.entries(d.sectors || {})
      .map(([name, data]) => ({
        name,
        value: data.totalMarketCap || 0,
        stocks: data.stocks || [],
      }))
      .filter(s => s.value > 0)
      .sort((a, b) => b.value - a.value);

    const sectorRects = squarify(sectorList, { x: 0, y: 0, w: width, h: height });

    for (const sr of sectorRects) {
      const group = document.createElement('div');
      group.className = 'hm-sector-group';
      Object.assign(group.style, {
        position: 'absolute',
        left: sr.x + 'px', top: sr.y + 'px',
        width: sr.w + 'px', height: sr.h + 'px',
        border: '1px solid #0a0e14',
        boxSizing: 'border-box',
        overflow: 'hidden',
      });

      // Sector label
      if (sr.h > 18) {
        const label = document.createElement('div');
        label.className = 'hm-sector-label';
        label.textContent = sr.name;
        Object.assign(label.style, {
          position: 'absolute', top: 0, left: 0, right: 0,
          padding: '2px 6px',
          background: 'rgba(10,14,20,0.82)',
          color: '#e6edf3',
          fontSize: sr.w < 140 ? '9px' : '10px',
          fontWeight: '700',
          letterSpacing: '0.6px',
          textTransform: 'uppercase',
          zIndex: 2,
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        });
        group.appendChild(label);
      }

      // Level 2: squarify stocks (reserve top strip for sector label)
      const innerRect = { x: 0, y: sr.h > 18 ? 18 : 0, w: sr.w, h: sr.h - (sr.h > 18 ? 18 : 0) };
      const stockItems = sr.stocks
        .filter(s => (s.marketCap || 0) > 0)
        .sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0))
        .map(s => ({
          ticker: s.ticker,
          name: s.name,
          value: s.marketCap,
          marketCap: s.marketCap,
          price: s.price,
          returns: s.returns || {},
        }));
      const stockRects = squarify(stockItems, innerRect);

      for (const st of stockRects) {
        const pct = st.returns?.[tf];
        const bg = getColor(pct, TF_SCALE[tf] || 5);
        const fg = textColor(bg);

        const tile = document.createElement('div');
        tile.className = 'hm-tile';
        tile.dataset.tk = st.ticker;
        tile.title = `${st.ticker} · ${st.name || ''}\n${fmtCap(st.marketCap)} · ${pct != null ? (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%' : '—'} (${tf})`;
        Object.assign(tile.style, {
          position: 'absolute',
          left: st.x + 'px', top: st.y + 'px',
          width: st.w + 'px', height: st.h + 'px',
          background: bg,
          color: fg,
          border: '0.5px solid rgba(10,14,20,0.5)',
          boxSizing: 'border-box',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-mono)',
          overflow: 'hidden',
          userSelect: 'none',
        });
        tile.addEventListener('click', () => {
          if (window.OC_OPEN_MODULE) window.OC_OPEN_MODULE('stock-analysis', { ticker: st.ticker });
        });

        // Content: ticker + %. Hide both if tile is tiny.
        if (st.w >= 28 && st.h >= 16) {
          const tkEl = document.createElement('div');
          tkEl.textContent = st.ticker;
          tkEl.style.fontWeight = '700';
          tkEl.style.fontSize = st.w < 50 ? '8px' : st.w < 80 ? '10px' : st.w < 140 ? '12px' : '14px';
          tkEl.style.lineHeight = '1.05';
          tile.appendChild(tkEl);
          if (st.w >= 40 && st.h >= 30) {
            const pctEl = document.createElement('div');
            pctEl.textContent = pct != null ? (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%' : '—';
            pctEl.style.fontSize = st.w < 60 ? '7px' : st.w < 100 ? '9px' : '11px';
            pctEl.style.opacity = '0.85';
            pctEl.style.marginTop = '2px';
            tile.appendChild(pctEl);
          }
        }
        group.appendChild(tile);
      }

      container.appendChild(group);
    }
  }

  /* ── Main render ───────────────────────────────────────────── */
  async function render(body, ctx) {
    body.innerHTML = `<div class="mod-loading">Loading heatmap…</div>`;
    try {
      const d = await fetchJSON('https://stocks.clawmo.tech/data/heatmap.json');
      body._hmData = d;

      const savedTf = (ctx && ctx.params && ctx.params.hmTf) || '1D';
      const tf = TIMEFRAMES.includes(savedTf) ? savedTf : '1D';

      body.innerHTML = `
        <div class="mod-head">
          <div class="mod-title">${window.OC_TITLE('heatmap')} · MARKET TREEMAP</div>
          <div class="mod-meta">
            <span class="chip">UNIVERSE · ${d.total_stocks}</span>
            <span class="chip">${Object.keys(d.sectors || {}).length} sectors</span>
            <span class="chip chip-dim">${fmt.ago(d.generated_at)}</span>
          </div>
        </div>
        <div class="mod-panel" style="padding:8px 10px;display:flex;align-items:center;gap:10px">
          <span style="font-size:11px;color:var(--fg-dim)">TIMEFRAME:</span>
          <div id="hmTfBtns" style="display:inline-flex;gap:4px">
            ${TIMEFRAMES.map(t => `<button class="hm-tf-btn" data-tf="${t}" type="button" style="background:transparent;border:1px solid var(--border);color:var(--fg);padding:3px 10px;border-radius:3px;cursor:pointer;font-size:11px;font-family:inherit">${t}</button>`).join('')}
          </div>
          <span id="hmScaleHint" style="margin-left:auto;font-size:10px;color:var(--fg-dim)"></span>
        </div>
        <div id="hmMap" style="position:relative;width:100%;height:calc(100vh - 220px);min-height:400px;background:#0a0e14;border-radius:3px;overflow:hidden"></div>
      `;

      const state = { tf };
      const mapEl = body.querySelector('#hmMap');
      const btns = body.querySelectorAll('.hm-tf-btn');

      const scaleHint = body.querySelector('#hmScaleHint');

      function paint() {
        renderTreemap(mapEl, body._hmData, state.tf);
        const sc = TF_SCALE[state.tf] || 5;
        if (scaleHint) scaleHint.textContent = `tile size = market cap · color = % change, saturates ±${sc}% · click to open EQ`;
        btns.forEach(b => {
          const active = b.dataset.tf === state.tf;
          b.style.background = active ? 'var(--accent-bg, rgba(96,165,250,0.15))' : 'transparent';
          b.style.borderColor = active ? 'var(--accent)' : 'var(--border)';
          b.style.color = active ? 'var(--accent)' : 'var(--fg)';
        });
      }

      btns.forEach(btn => {
        btn.addEventListener('click', () => {
          state.tf = btn.dataset.tf;
          if (window.OC_UPDATE_PANE_PARAMS) window.OC_UPDATE_PANE_PARAMS({ hmTf: state.tf });
          paint();
        });
      });

      // Responsive re-render on container resize
      if (window.ResizeObserver) {
        const ro = new ResizeObserver(() => paint());
        ro.observe(mapEl);
        body._hmResize = ro;
      }

      paint();
    } catch (e) {
      body.innerHTML = `<div class="mod-err">${e.message}</div>`;
    }
  }

  window.OC_MODULES = window.OC_MODULES || {};
  window.OC_MODULES['heatmap'] = { render };
})();
