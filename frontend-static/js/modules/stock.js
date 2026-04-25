/* F1 Stock Analysis — Option B essential dense view
   One scrollable page per ticker: header, sparkline+trend, valuation grade,
   key metrics, 52W range, PE range, business summary.
   Pass {ticker} via params; default to AAPL. */
(function () {
  'use strict';
  const { fetchJSON, fmt } = window.OC_DATA;

  const API = 'https://stocks.clawmo.tech/api/stock';

  function analysisUrl(sym, market) {
    return `${API}/${encodeURIComponent(sym)}/analysis?market=${market || 'US'}`;
  }

  function shortUrl(u) {
    try { return new URL(u).hostname.replace(/^www\./, ''); }
    catch (e) { return u; }
  }
  function gradeCls(g) {
    if (!g) return '';
    const u = String(g).toUpperCase();
    if (u.startsWith('A')) return 'gd-a';
    if (u.startsWith('B')) return 'gd-b';
    if (u.startsWith('C')) return 'gd-c';
    return 'gd-d';
  }
  function pctCls(v) {
    if (v == null || isNaN(v)) return '';
    if (v > 0) return 'num-up';
    if (v < 0) return 'num-dn';
    return '';
  }
  function trendSigns(tech, price) {
    // 5-indicator trend light set (matches methodology school MIN)
    const lights = [
      { label: 'px>SMA50',  pass: price != null && tech.sma_50  != null && price > tech.sma_50 },
      { label: 'px>SMA200', pass: price != null && tech.sma_200 != null && price > tech.sma_200 },
      { label: 'SMA50>200', pass: tech.sma_50 != null && tech.sma_200 != null && tech.sma_50 > tech.sma_200 },
      { label: 'RSI>50',    pass: tech.rsi != null && tech.rsi > 50 },
      { label: 'MACD>0',    pass: tech.macd != null && tech.macd > 0 },
    ];
    return lights;
  }

  /* Pro-grade sparkline:
     - Price line + optional SMA200 line + target line
     - Optional volume zone (toggleable) as faint green/red bars
     - Optional trend strip (one cell per day, green/red/neutral based on
       3-signal alignment: price>SMA50, price>SMA200, SMA50>SMA200)
     - Current-price tag pinned to right edge of last dot
     - Crosshair + tooltip handled by attachSparkCrosshair */
  function sparkline(chartData, opts) {
    opts = opts || {};
    if (!Array.isArray(chartData) || !chartData.length) return { html: '', meta: null };
    const W = opts.w || 640;
    const padT = 4, padB = 4;
    const rightLabelW = 46;
    const showVolume = !!opts.showVolume;
    const showTrend  = opts.showTrend !== false;  // default on

    // Stack zones with explicit coordinates so volume/trend never overlap.
    // Layout (top → bottom): padT · priceH · gap1 · volumeH · gap2 · trendH · padB
    const baseH   = opts.h || 140;  // desired PRICE-only height when volume/trend are off
    const priceH  = baseH - padT - padB;
    const gap1    = showVolume ? 4 : 0;
    const gap2    = showTrend  ? 4 : 0;
    const volumeH = showVolume ? 22 : 0;
    const trendH  = showTrend  ? 8  : 0;
    const priceTop    = padT;
    const priceBottom = priceTop + priceH;
    const volumeTop   = priceBottom + gap1;
    const trendTop    = volumeTop + volumeH + gap2;
    const H           = trendTop + trendH + padB;

    const pts = chartData.filter(d => d && typeof d.close === 'number');
    if (!pts.length) return { html: '', meta: null };
    const closes = pts.map(d => d.close);
    let min = Math.min(...closes), max = Math.max(...closes);
    if (opts.target != null) {
      min = Math.min(min, opts.target);
      max = Math.max(max, opts.target);
    }
    if (min === max) { max = min + 1; }
    // Unified cell grid: every day is a discrete cell of width `cellW`, and
    // the price line / volume bars / trend strip all reference that same grid.
    // Price line connects cell CENTERS so it stays visually in-line with the
    // vertical bars below. This eliminates the ~2-4px width mismatch that
    // happened when point-based positioning (spanning N-1 intervals) was
    // mixed with cell-based positioning (spanning N intervals).
    const plotW = W - padT - rightLabelW;
    const cellW = plotW / pts.length;
    const sx = (i) => padT + (i + 0.5) * cellW;
    const sy = (v) => priceTop + (1 - (v - min) / (max - min)) * priceH;

    const path = pts.map((d, i) => `${i === 0 ? 'M' : 'L'} ${sx(i).toFixed(1)} ${sy(d.close).toFixed(1)}`).join(' ');
    const lastX = sx(pts.length - 1);
    const lastY = sy(closes[closes.length - 1]);
    const lastClose = closes[closes.length - 1];
    const firstClose = closes[0];
    const up = lastClose >= firstClose;
    const lineColor = up ? 'var(--pnl-up)' : 'var(--pnl-dn)';

    const tgtY = opts.target != null ? sy(opts.target) : null;
    const smaPts = pts.filter(d => typeof d.sma_200 === 'number');
    let smaPath = '';
    if (smaPts.length > 5) {
      smaPath = pts.map((d, i) => {
        if (typeof d.sma_200 !== 'number') return null;
        return `${sx(i).toFixed(1)},${sy(d.sma_200).toFixed(1)}`;
      }).filter(x => x !== null).join(' ');
    }

    // Volume zone just under the price area — bars centered WITHIN each cell
    const barW = Math.max(0.8, cellW * 0.82);
    let volumeSvg = '';
    if (showVolume) {
      const volumes = pts.map(d => (typeof d.volume === 'number') ? d.volume : 0);
      const maxVol = Math.max(...volumes, 1);
      volumeSvg = pts.map((d, i) => {
        const v = d.volume || 0;
        const h = (v / maxVol) * volumeH;
        const y = volumeTop + (volumeH - h);
        const prev = i > 0 ? pts[i - 1].close : d.close;
        const upDay = d.close >= prev;
        const color = upDay ? 'rgba(74,222,128,0.55)' : 'rgba(248,113,113,0.55)';
        const x = padT + i * cellW + (cellW - barW) / 2;
        return `<rect x="${x.toFixed(2)}" y="${y.toFixed(1)}" width="${barW.toFixed(2)}" height="${Math.max(h, 0.6).toFixed(1)}" style="fill:${color}"></rect>`;
      }).join('');
    }

    // Trend strip — one cell per day, same width + gap as volume bars so
    // columns line up perfectly across the two stratas.
    let trendSvg = '';
    if (showTrend) {
      trendSvg = pts.map((d, i) => {
        let color = '#6B7280';  // neutral
        if (typeof d.sma_50 === 'number' && typeof d.sma_200 === 'number') {
          const s1 = d.close > d.sma_50;
          const s2 = d.close > d.sma_200;
          const s3 = d.sma_50 > d.sma_200;
          const passCount = (s1 ? 1 : 0) + (s2 ? 1 : 0) + (s3 ? 1 : 0);
          color = passCount === 3 ? '#4ADE80'
                : passCount === 0 ? '#F87171'
                : passCount >= 2 ? 'rgba(74,222,128,0.55)'
                : 'rgba(248,113,113,0.55)';
        }
        const x = padT + i * cellW + (cellW - barW) / 2;
        return `<rect x="${x.toFixed(2)}" y="${trendTop.toFixed(1)}" width="${barW.toFixed(2)}" height="${trendH}" style="fill:${color};opacity:0.85"></rect>`;
      }).join('');
    }

    // Current-price tag anchored to right edge, pointing at last close
    const tagX = W - rightLabelW + 2;
    const tagW = rightLabelW - 4;
    const tagY = Math.max(priceTop + 2, Math.min(priceBottom - 14, lastY - 7));
    const priceTag = `
      <line x1="${lastX.toFixed(1)}" y1="${lastY.toFixed(1)}" x2="${tagX.toFixed(1)}" y2="${(tagY + 7).toFixed(1)}" style="stroke:${lineColor};stroke-width:0.7;opacity:0.7"></line>
      <rect x="${tagX.toFixed(1)}" y="${tagY.toFixed(1)}" width="${tagW}" height="14" style="fill:${lineColor};opacity:0.92" rx="1.5"></rect>
      <text x="${(tagX + tagW / 2).toFixed(1)}" y="${(tagY + 10).toFixed(1)}" text-anchor="middle" style="font-family:var(--font-mono);font-size:9.5px;font-weight:700;fill:#0a0c10">$${lastClose.toFixed(2)}</text>
    `;

    const html = `
      <svg class="sparkline" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="height:${H}px">
        ${smaPath ? `<polyline class="spark-sma" points="${smaPath}"></polyline>` : ''}
        <path class="spark-line ${up ? 'up' : 'dn'}" d="${path}"></path>
        ${tgtY != null ? `<line class="spark-tgt" x1="0" y1="${tgtY.toFixed(1)}" x2="${W - rightLabelW}" y2="${tgtY.toFixed(1)}"></line>` : ''}
        <circle class="spark-dot ${up ? 'up' : 'dn'}" cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="3"></circle>
        ${volumeSvg}
        ${trendSvg}
        ${priceTag}
        <line class="spark-cross-x" x1="0" y1="${priceTop}" x2="0" y2="${(H - padB).toFixed(1)}" style="stroke:var(--fg);stroke-width:0.5;opacity:0;pointer-events:none;stroke-dasharray:2 2"></line>
        <circle class="spark-cross-dot" cx="0" cy="0" r="3" style="fill:var(--accent);stroke:var(--fg);stroke-width:0.7;opacity:0;pointer-events:none"></circle>
        <rect class="spark-cross-hit" x="${padT}" y="${priceTop}" width="${W - padT - rightLabelW}" height="${priceH}" style="fill:transparent;cursor:crosshair"></rect>
      </svg>
    `;
    return {
      html,
      meta: {
        W, H, padT, pts, rightLabelW,
        target: opts.target ?? null, yMin: min, yMax: max, lastClose,
        priceTop, priceH,
      },
    };
  }

  /* Crosshair + tooltip for the EQ sparkline. Called after the DOM is in place. */
  function attachSparkCrosshair(svg, tooltip, meta) {
    if (!svg || !meta) return;
    const xLine = svg.querySelector('.spark-cross-x');
    const dot = svg.querySelector('.spark-cross-dot');
    const hit = svg.querySelector('.spark-cross-hit');
    if (!xLine || !dot || !hit) return;
    const { W, H, padT, pts, target, yMin, yMax, lastClose, rightLabelW = 0, priceTop, priceH } = meta;
    const plotW = W - padT - rightLabelW;
    const cellW = plotW / pts.length;
    const sx = (i) => padT + (i + 0.5) * cellW;   // match cell-center rendering
    const sy = (v) => priceTop + (1 - (v - yMin) / (yMax - yMin)) * priceH;

    function onMove(ev) {
      const ptSvg = svg.createSVGPoint();
      ptSvg.x = ev.clientX; ptSvg.y = ev.clientY;
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const loc = ptSvg.matrixTransform(ctm.inverse());
      let i = Math.floor((loc.x - padT) / cellW);
      if (i < 0) i = 0;
      if (i > pts.length - 1) i = pts.length - 1;
      const p = pts[i];
      const x = sx(i);
      const y = sy(p.close);
      xLine.setAttribute('x1', x.toFixed(2));
      xLine.setAttribute('x2', x.toFixed(2));
      xLine.style.opacity = '0.55';
      dot.setAttribute('cx', x.toFixed(2));
      dot.setAttribute('cy', y.toFixed(2));
      dot.style.opacity = '1';

      const vsLast = lastClose ? ((p.close - lastClose) / lastClose) * 100 : null;
      const vsSma = (typeof p.sma_200 === 'number' && p.sma_200 !== 0) ? ((p.close - p.sma_200) / p.sma_200) * 100 : null;
      const vsTgt = (typeof target === 'number' && target !== 0) ? ((p.close - target) / target) * 100 : null;
      const cls = (v) => v == null ? '' : v >= 0 ? 'num-up' : 'num-dn';
      const txt = (v) => v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
      tooltip.innerHTML = `
        <div class="stk-tt-row"><span class="stk-tt-k">DATE</span><span class="stk-tt-v mono">${p.date || '—'}</span></div>
        <div class="stk-tt-row"><span class="stk-tt-k">CLOSE</span><span class="stk-tt-v mono">$${p.close.toFixed(2)}</span></div>
        <div class="stk-tt-row"><span class="stk-tt-k">SMA200</span><span class="stk-tt-v mono">${typeof p.sma_200 === 'number' ? '$' + p.sma_200.toFixed(2) : '—'}</span></div>
        <div class="stk-tt-row"><span class="stk-tt-k">vs SMA</span><span class="stk-tt-v mono ${cls(vsSma)}">${txt(vsSma)}</span></div>
        ${target != null ? `<div class="stk-tt-row"><span class="stk-tt-k">vs TGT</span><span class="stk-tt-v mono ${cls(vsTgt)}">${txt(vsTgt)}</span></div>` : ''}
        <div class="stk-tt-row"><span class="stk-tt-k">vs LAST</span><span class="stk-tt-v mono ${cls(vsLast)}">${txt(vsLast)}</span></div>
      `;
      tooltip.style.opacity = '1';
    }
    function onLeave() {
      xLine.style.opacity = '0';
      dot.style.opacity = '0';
      tooltip.style.opacity = '0';
    }
    hit.addEventListener('mousemove', onMove);
    hit.addEventListener('mouseleave', onLeave);
  }

  function rangeBar(low, high, current) {
    if (low == null || high == null || current == null || high <= low) return '';
    const pct = Math.max(0, Math.min(100, ((current - low) / (high - low)) * 100));
    return `
      <div class="range-bar">
        <div class="range-track">
          <div class="range-pos" style="left:${pct.toFixed(1)}%"></div>
        </div>
        <div class="range-labels">
          <span class="mono">${fmt.num(low, 2)}</span>
          <span class="mono range-cur">${fmt.num(current, 2)}</span>
          <span class="mono">${fmt.num(high, 2)}</span>
        </div>
      </div>
    `;
  }

  function peRangeBar(peMin, peMax, pePos) {
    if (peMin == null || peMax == null || pePos == null) return '';
    // pePos is 0-100 already (per API)
    return `
      <div class="range-bar">
        <div class="range-track pe-track">
          <div class="range-pos" style="left:${Math.max(0, Math.min(100, pePos)).toFixed(1)}%"></div>
        </div>
        <div class="range-labels">
          <span class="mono">${fmt.num(peMin, 1)}x</span>
          <span class="mono">${fmt.num(peMax, 1)}x</span>
        </div>
      </div>
    `;
  }

  async function loadAndRender(body, ticker, market) {
    const sym = (ticker || 'AAPL').toUpperCase();
    market = market || 'US';
    body.innerHTML = `
      <div class="stk-input-row">
        <form class="stk-tickform" id="stkForm">
          <input class="stk-tick-input" id="stkTick" value="${sym}" maxlength="8" autocomplete="off" spellcheck="false">
          <select class="stk-market" id="stkMarket">
            <option value="US" ${market==='US'?'selected':''}>US</option>
            <option value="HK" ${market==='HK'?'selected':''}>HK</option>
            <option value="CA" ${market==='CA'?'selected':''}>CA</option>
          </select>
          <button type="submit" class="stk-go">GO</button>
        </form>
        <span class="mono chip chip-dim">loading ${sym}…</span>
      </div>
      <div class="mod-loading">Fetching ${sym}…</div>
    `;
    attachForm(body);

    let d;
    try {
      d = await fetchJSON(analysisUrl(sym, market));
    } catch (e) {
      body.innerHTML = `
        <div class="stk-input-row">
          <form class="stk-tickform" id="stkForm">
            <input class="stk-tick-input" id="stkTick" value="${sym}" maxlength="8" autocomplete="off" spellcheck="false">
            <select class="stk-market" id="stkMarket">
              <option value="US" ${market==='US'?'selected':''}>US</option>
              <option value="HK" ${market==='HK'?'selected':''}>HK</option>
              <option value="CA" ${market==='CA'?'selected':''}>CA</option>
            </select>
            <button type="submit" class="stk-go">GO</button>
          </form>
        </div>
        <div class="mod-err">Failed to load ${sym}: ${e.message}</div>
      `;
      attachForm(body);
      return;
    }
    renderAnalysis(body, d, sym, market);
  }

  function attachForm(body) {
    const form = body.querySelector('#stkForm');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newTick = body.querySelector('#stkTick').value.trim();
      const newMkt = body.querySelector('#stkMarket').value;
      if (!newTick) return;
      // update pane params via app.js hook
      if (window.OC_UPDATE_PANE_PARAMS) {
        window.OC_UPDATE_PANE_PARAMS({ ticker: newTick.toUpperCase(), market: newMkt });
      }
      await loadAndRender(body, newTick, newMkt);
    });
  }

  function renderAnalysis(body, d, sym, market) {
    const info = d.info || {};
    const m = d.metrics || {};
    const t = d.technicals || {};
    const v = d.valuation || {};
    const chart = d.chart_data || [];
    const lights = trendSigns(t, info.price);
    const lightGreen = lights.filter(l => l.pass).length;
    const priceChg = (chart.length >= 2 && typeof chart[0].close === 'number')
      ? ((info.price - chart[0].close) / chart[0].close) * 100
      : null;
    const tgtPct = (info.target_price != null && info.price != null)
      ? ((info.target_price - info.price) / info.price) * 100
      : null;

    const lastDate = chart && chart.length ? chart[chart.length - 1].date : null;
    const showVol = localStorage.getItem('oc_eq_vol') === 'on';  // default off
    const showTrend = localStorage.getItem('oc_eq_trend') !== 'off';  // default on
    const sparkResult = sparkline(chart, { target: info.target_price, showVolume: showVol, showTrend });
    body.innerHTML = `
      <div class="stk-input-row">
        <form class="stk-tickform" id="stkForm">
          <input class="stk-tick-input" id="stkTick" value="${sym}" maxlength="8" autocomplete="off" spellcheck="false">
          <select class="stk-market" id="stkMarket">
            <option value="US" ${market==='US'?'selected':''}>US</option>
            <option value="HK" ${market==='HK'?'selected':''}>HK</option>
            <option value="CA" ${market==='CA'?'selected':''}>CA</option>
          </select>
          <button type="submit" class="stk-go">GO</button>
        </form>
        <span class="chip chip-dim mono">${info.exchange || '—'} · ${info.sector || '—'}</span>
        <span class="chip chip-dim mono">${info.industry || '—'}</span>
        <span class="chip chip-dim mono">MCAP ${fmt.compact(info.market_cap)}</span>
        <span class="chip chip-dim mono">β ${fmt.num(info.beta, 2)}</span>
        ${lastDate ? `<span class="chip chip-dim mono" title="last trading day in series">last ${lastDate}</span>` : ''}
        <a href="#" class="stk-open-fin" data-tk="${sym}">Open in FIN ↗</a>
        <a href="#" class="stk-open-hld" data-tk="${sym}">Open in HLD ↗</a>
      </div>

      <div class="stk-hero">
        <div class="stk-name">
          <div class="stk-ticker">${info.symbol || sym}</div>
          <div class="stk-longname">${info.name || ''}</div>
        </div>
        <div class="stk-price">
          <div class="stk-px">${fmt.num(info.price, 2)} <span class="stk-ccy">${info.currency || ''}</span></div>
          <div class="stk-chg ${pctCls(priceChg)}">${priceChg != null ? fmt.pct(priceChg) + ' (120d)' : ''}</div>
        </div>
        <div class="stk-target">
          <div class="stk-target-lbl">TARGET</div>
          <div class="stk-target-val mono">${fmt.num(info.target_price, 2)}</div>
          <div class="stk-target-pct ${pctCls(tgtPct)} mono">${tgtPct != null ? fmt.pct(tgtPct) : '—'}</div>
        </div>
      </div>

      <div class="mod-grid-2">
        <div>
          <div class="mod-panel">
            <div class="mod-panel-title">
              PRICE · 120d · close +sma200 · trend
              <span class="fin-stmt-toggles">
                <button class="fin-mode-btn stk-vol-btn${showVol ? ' active' : ''}" data-vol="${showVol ? 'off' : 'on'}" title="Toggle volume bars">VOL ${showVol ? 'ON' : 'OFF'}</button>
                <button class="fin-mode-btn stk-trend-btn${showTrend ? ' active' : ''}" data-trend="${showTrend ? 'off' : 'on'}" title="Toggle trend strip">TREND ${showTrend ? 'ON' : 'OFF'}</button>
              </span>
            </div>
            <div class="spark-wrap">
              ${sparkResult.html}
              <div class="stk-tooltip" style="opacity:0"></div>
            </div>
          </div>

          <div class="mod-panel">
            <div class="mod-panel-title">TREND LIGHTS · ${lightGreen}/5</div>
            <div class="trend-lights">
              ${lights.map(l => `
                <div class="light ${l.pass ? 'ok' : 'no'}">
                  <span class="light-dot"></span>
                  <span class="light-lbl">${l.label}</span>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="mod-panel">
            <div class="mod-panel-title">TECHNICALS</div>
            <div class="kv-grid">
              <span>SMA50</span><span class="mono">${fmt.num(t.sma_50, 2)}</span>
              <span>SMA200</span><span class="mono">${fmt.num(t.sma_200, 2)}</span>
              <span>RSI(14)</span><span class="mono ${t.rsi > 70 ? 'num-warn' : t.rsi < 30 ? 'num-warn' : ''}">${fmt.num(t.rsi, 1)}</span>
              <span>MACD</span><span class="mono ${pctCls(t.macd)}">${fmt.num(t.macd, 2)}</span>
              <span>MACD sig</span><span class="mono">${fmt.num(t.macd_signal, 2)}</span>
              <span>MACD hist</span><span class="mono ${pctCls(t.macd_histogram)}">${fmt.num(t.macd_histogram, 2)}</span>
              <span>ATR</span><span class="mono">${fmt.num(t.atr, 2)}</span>
              <span>Support</span><span class="mono">${fmt.num(t.support, 2)}</span>
              <span>Resistance</span><span class="mono">${fmt.num(t.resistance, 2)}</span>
              <span>BB upper</span><span class="mono">${fmt.num(t.bollinger_upper, 2)}</span>
              <span>BB mid</span><span class="mono">${fmt.num(t.bollinger_middle, 2)}</span>
              <span>BB lower</span><span class="mono">${fmt.num(t.bollinger_lower, 2)}</span>
              <span>Trend</span><span class="tk-inline">${t.trend || '—'}</span>
              <span>Signal</span><span class="tk-inline">${t.signal || '—'}</span>
              <span>Vol ratio</span><span class="mono">${fmt.num(t.volume_ratio, 2)}</span>
            </div>
          </div>
        </div>

        <div class="mod-side">
          <div class="mod-panel">
            <div class="mod-panel-title">VALUATION</div>
            <div class="val-card">
              <div class="val-score">
                <div class="val-score-big ${gradeCls(v.grade)}">${fmt.num(v.final_score, 0)}</div>
                <div class="val-score-lbl">SCORE · <span class="${gradeCls(v.grade)}">${v.grade || '—'}</span></div>
              </div>
              <div class="val-rec ${gradeCls(v.grade)}">${v.recommendation || '—'}</div>
              <div class="kv-grid val-breakdown">
                <span>Qualitative</span><span class="mono">${fmt.num(v.qualitative_score, 0)}</span>
                <span>PE position</span><span class="mono">${fmt.num(v.pe_position, 0)}%</span>
                <span>Multiplier</span><span class="mono">${fmt.num(v.multiplier, 2)}×</span>
              </div>
              <div class="val-pe-range">
                <div class="val-pe-label">PE range · low → high</div>
                ${peRangeBar(v.pe_min, v.pe_max, v.pe_position)}
              </div>
            </div>
          </div>

          <div class="mod-panel">
            <div class="mod-panel-title">52W RANGE</div>
            <div class="range-wrap">
              ${rangeBar(info.fifty_two_week_low, info.fifty_two_week_high, info.price)}
            </div>
          </div>

          <div class="mod-panel">
            <div class="mod-panel-title">KEY METRICS</div>
            <div class="kv-grid">
              <span>P/E</span><span class="mono">${fmt.num(info.pe_ratio, 1)}</span>
              <span>Forward P/E</span><span class="mono">${fmt.num(info.forward_pe, 1)}</span>
              <span>P/B</span><span class="mono">${fmt.num(m.price_to_book, 1)}</span>
              <span>P/S</span><span class="mono">${fmt.num(m.price_to_sales, 1)}</span>
              <span>PEG</span><span class="mono">${fmt.num(m.peg_ratio, 2)}</span>
              <span>EPS</span><span class="mono">${fmt.num(info.eps, 2)}</span>
              <span>Div yield</span><span class="mono">${info.dividend_yield != null ? (info.dividend_yield*100).toFixed(2) + '%' : '—'}</span>
              <span>Rev (B)</span><span class="mono">${fmt.num(m.revenue, 1)}</span>
              <span>Rev growth</span><span class="mono ${pctCls(m.revenue_growth)}">${fmt.pct(m.revenue_growth, 0)}</span>
              <span>Gross margin</span><span class="mono">${fmt.pct(m.gross_margin, 0)}</span>
              <span>Profit margin</span><span class="mono ${pctCls(m.profit_margin)}">${fmt.pct(m.profit_margin, 0)}</span>
              <span>ROE</span><span class="mono ${pctCls(m.roe)}">${fmt.pct(m.roe, 0)}</span>
              <span>ROA</span><span class="mono ${pctCls(m.roa)}">${fmt.pct(m.roa, 0)}</span>
              <span>Debt/Eq</span><span class="mono">${fmt.num(m.debt_to_equity, 2)}</span>
              <span>Curr ratio</span><span class="mono">${fmt.num(m.current_ratio, 2)}</span>
              <span>Book val</span><span class="mono">${fmt.num(m.book_value, 2)}</span>
            </div>
          </div>
        </div>
      </div>

      ${renderAIBlock(d, sym, info)}

      ${info.business_summary ? `
        <div class="mod-panel">
          <div class="mod-panel-title">BUSINESS${info.website ? ` · <a href="${info.website}" target="_blank" rel="noopener" class="ext-link">${shortUrl(info.website)} ↗</a>` : ''}</div>
          <div class="biz-summary">${info.business_summary}</div>
        </div>
      ` : ''}
    `;

    attachForm(body);
    attachAIBlock(body, d, sym, info);

    // Wire the Open-in-FIN / Open-in-HLD links
    const finLink = body.querySelector('.stk-open-fin');
    if (finLink) {
      finLink.addEventListener('click', (ev) => {
        ev.preventDefault();
        if (window.OC_OPEN_MODULE) window.OC_OPEN_MODULE('financials', { ticker: sym, market });
      });
    }
    const hldLink = body.querySelector('.stk-open-hld');
    if (hldLink) {
      hldLink.addEventListener('click', (ev) => {
        ev.preventDefault();
        if (window.OC_OPEN_MODULE) window.OC_OPEN_MODULE('holdings', { ticker: sym, market });
      });
    }

    // VOL toggle
    const volBtn = body.querySelector('.stk-vol-btn');
    if (volBtn) {
      volBtn.addEventListener('click', () => {
        const next = volBtn.dataset.vol;  // 'on' or 'off'
        localStorage.setItem('oc_eq_vol', next);
        // Re-render only the chart panel to avoid full EQ refetch
        renderAnalysis(body, d, sym, market);
      });
    }
    // TREND toggle
    const trendBtn = body.querySelector('.stk-trend-btn');
    if (trendBtn) {
      trendBtn.addEventListener('click', () => {
        const next = trendBtn.dataset.trend;  // 'on' or 'off'
        localStorage.setItem('oc_eq_trend', next);
        renderAnalysis(body, d, sym, market);
      });
    }

    // Crosshair + tooltip on the 120d price chart
    if (sparkResult.meta) {
      const wrap = body.querySelector('.spark-wrap');
      if (wrap) {
        attachSparkCrosshair(
          wrap.querySelector('.sparkline'),
          wrap.querySelector('.stk-tooltip'),
          sparkResult.meta
        );
      }
    }
  }

  /* ── AI panel: static qualitative topics + on-demand GLM/AI call ─── */
  function renderAIBlock(d, sym, info) {
    const v = d.valuation || {};
    const topics = Array.isArray(v.qualitative_topics) ? v.qualitative_topics : [];
    const topicsHtml = topics.map((t, i) => {
      const pct = t.max_score ? (t.score / t.max_score) * 100 : 0;
      const barCls = pct >= 75 ? 'num-up' : pct >= 50 ? 'num-up-soft' : pct >= 25 ? 'num-warn' : 'num-dn';
      return `
        <details class="qual-topic">
          <summary>
            <span class="qual-caret">▸</span>
            <span class="qual-lbl">${t.topic || '—'}</span>
            <span class="qual-lbl-cn">${t.topic_cn || ''}</span>
            <span class="qual-bar"><span class="qual-bar-fill ${barCls}" style="width:${pct.toFixed(0)}%"></span></span>
            <span class="qual-score mono">${fmt.num(t.score, 1)}/${fmt.num(t.max_score, 1)}</span>
          </summary>
          <div class="qual-reason">${t.reason || ''}</div>
        </details>
      `;
    }).join('');

    return `
      <div class="mod-panel ai-panel">
        <div class="mod-panel-title ai-panel-title">
          <span>VALUATION RATIONALE · why grade <span class="${gradeCls(v.grade)}">${v.grade || '—'}</span></span>
          <span class="ai-lang-row">
            <select class="ai-lang" id="aiLang">
              <option value="EN">EN</option>
              <option value="CN">中</option>
            </select>
            <button class="ai-btn" id="aiAnalyzeBtn">✨ AI ANALYZE</button>
          </span>
        </div>
        <div class="qual-list">
          ${topics.length ? topicsHtml : '<div class="cal-empty">no qualitative topics returned</div>'}
        </div>
        <div class="ai-result" id="aiResult" hidden></div>
      </div>
    `;
  }

  function attachAIBlock(body, d, sym, info) {
    const btn = body.querySelector('#aiAnalyzeBtn');
    const out = body.querySelector('#aiResult');
    const langSel = body.querySelector('#aiLang');
    if (!btn || !out) return;
    // restore language preference
    try { const saved = localStorage.getItem('ocAiLang'); if (saved) langSel.value = saved; } catch (e) {}
    langSel.addEventListener('change', () => {
      try { localStorage.setItem('ocAiLang', langSel.value); } catch (e) {}
    });

    btn.addEventListener('click', async () => {
      const v = d.valuation || {};
      const m = d.metrics || {};
      const lang = langSel.value || 'EN';
      btn.disabled = true;
      btn.innerHTML = '<span class="ai-spin">◐</span> analyzing…';
      out.hidden = false;
      out.innerHTML = '<div class="ai-loading">AI is analyzing ' + sym + '…</div>';

      const ctx = [
        `Grade: ${v.grade} (score ${v.final_score}/100)`,
        `Recommendation: ${v.recommendation}`,
        `Price: ${info.price} ${info.currency || ''}`,
        `Target: ${info.target_price} (${info.target_price && info.price ? ((info.target_price/info.price - 1)*100).toFixed(0) + '%' : '—'})`,
        `Forward PE: ${info.forward_pe}`,
        `5y PE Range: ${v.pe_min}–${v.pe_max}, Position ${v.pe_position}%`,
        `Revenue growth: ${m.revenue_growth}%`,
        `Profit margin: ${m.profit_margin}%`,
        `ROE: ${m.roe}%`,
        `Debt/Eq: ${m.debt_to_equity}`,
      ].join('. ');

      try {
        const r = await fetch('https://stocks.clawmo.tech/api/ai/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          mode: 'cors',
          credentials: 'omit',
          body: JSON.stringify({
            ticker: info.symbol || sym,
            company_name: info.name || sym,
            topic: 'TerminalValuation',
            context: ctx,
            language: lang,
          }),
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const j = await r.json();
        const reason = j.reason || j.analysis || JSON.stringify(j);
        const now = new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false });
        out.innerHTML = `
          <div class="ai-result-head">
            <span class="ai-badge">AI</span>
            <span class="ai-meta">TerminalValuation · ${lang} · ${now} ET</span>
          </div>
          <div class="ai-text">${escapeHtml(reason)}</div>
        `;
      } catch (e) {
        out.innerHTML = `<div class="mod-err">AI call failed: ${e.message}</div>`;
      } finally {
        btn.disabled = false;
        btn.innerHTML = '✨ AI ANALYZE';
      }
    });
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  async function render(body, ctx) {
    const p = ctx?.params || {};
    await loadAndRender(body, p.ticker, p.market);
  }

  window.OC_MODULES = window.OC_MODULES || {};
  window.OC_MODULES['stock-analysis'] = { render };
})();
