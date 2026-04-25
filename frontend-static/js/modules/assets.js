/* Crypto · Bonds · Metals */
(function () {
  'use strict';
  const { fetchJSON, fmt } = window.OC_DATA;
  const BASE = 'https://stocks.clawmo.tech/data';

  function pnlCls(v) { return v == null ? '' : v > 0 ? 'num-up' : v < 0 ? 'num-dn' : ''; }

  /* ── Crypto dashboard ─────────────────────────────────────
     Global stats + derivatives cards, BTC price-and-volume chart,
     on-chain (MVRV Z-score + Hash rate), funding rate, long/short ratio,
     top-10 table with 7d sparklines + 30d column, glossary. */

  /* Price + volume + trend combined chart.
     Price line with area on top; optional volume bars (close-up = green)
     and optional trend strip (3-signal alignment: close>SMA50, close>SMA200,
     SMA50>SMA200 → all 3 = bright green, 2 = soft green, 1 = soft red, 0
     = bright red; missing SMA = gray).
     opts: { showVolume: bool (default true), showTrend: bool (default true) } */
  function buildCryptoPriceVolumeChart(series, opts) {
    if (!series || series.length < 2) return '';
    opts = opts || {};
    const showVolume = opts.showVolume !== false;
    const showTrend  = opts.showTrend  !== false;

    const W = 820, padL = 50, padR = 14, padT = 10, padB = 24;
    const innerW = W - padL - padR;

    // Dynamic vertical layout — zones drop out when toggled off
    const priceH = showVolume && showTrend ? 178 : showVolume ? 200 : showTrend ? 210 : 226;
    const volH   = showVolume ? 36 : 0;
    const trendH = showTrend  ? 10 : 0;
    const gap1   = showVolume ? 6 : 0;
    const gap2   = showTrend  ? 6 : 0;
    const priceTop = padT;
    const priceBot = priceTop + priceH;
    const volTop   = priceBot + gap1;
    const volBot   = volTop + volH;
    const trendTop = volBot + gap2;
    const H = trendTop + trendH + padB;

    const n = series.length;
    const prices = series.map(p => p.price);
    const vols   = series.map(p => p.volume || 0);
    const pMin = Math.min(...prices), pMax = Math.max(...prices);
    const pPad = (pMax - pMin) * 0.06 || 1;
    const pLo = pMin - pPad, pHi = pMax + pPad;
    const vMax = Math.max(...vols, 1);
    const sx = (i) => padL + (i / (n - 1)) * innerW;
    const syP = (v) => priceTop + (1 - (v - pLo) / (pHi - pLo)) * priceH;
    const syV = (v) => volBot - (v / vMax) * volH;
    const fmtK = (v) => v >= 1e12 ? '$' + (v/1e12).toFixed(2) + 'T'
                      : v >= 1e9  ? '$' + (v/1e9).toFixed(1)  + 'B'
                      : v >= 1e6  ? '$' + (v/1e6).toFixed(0)  + 'M'
                      : '$' + v.toFixed(0);
    const fmtPx = (v) => v >= 1000 ? '$' + (v/1000).toFixed(0) + 'k' : '$' + v.toFixed(0);
    let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:${H}px">`;
    // Price grid
    for (let g = 0; g <= 4; g++) {
      const yVal = pLo + (g / 4) * (pHi - pLo), y = syP(yVal);
      svg += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="rgba(255,255,255,0.06)" stroke-width="0.4"/>`;
      svg += `<text x="${padL - 4}" y="${y + 3}" fill="#8b949e" font-size="9" text-anchor="end" font-family="var(--font-mono)">${fmtPx(yVal)}</text>`;
    }
    const barW = Math.max(0.8, innerW / n * 0.82);
    // Volume bars
    if (showVolume) {
      svg += `<text x="${padL - 4}" y="${volBot + 3}" fill="#8b949e" font-size="8" text-anchor="end" font-family="var(--font-mono)">vol ${fmtK(vMax)}</text>`;
      vols.forEach((v, i) => {
        const upBar = i > 0 ? prices[i] >= prices[i - 1] : true;
        const color = upBar ? 'rgba(74,222,128,0.55)' : 'rgba(248,113,113,0.55)';
        const h = volBot - syV(v);
        svg += `<rect x="${sx(i) - barW / 2}" y="${syV(v)}" width="${barW.toFixed(1)}" height="${Math.max(h, 0.5).toFixed(1)}" fill="${color}"/>`;
      });
    }
    // Trend strip
    if (showTrend) {
      svg += `<text x="${padL - 4}" y="${trendTop + trendH - 1}" fill="#8b949e" font-size="8" text-anchor="end" font-family="var(--font-mono)">trend</text>`;
      series.forEach((p, i) => {
        let color = '#6B7280';  // neutral — missing SMA data
        if (typeof p.sma_50 === 'number' && typeof p.sma_100 === 'number') {
          const s1 = p.price > p.sma_50;
          const s2 = p.price > p.sma_100;
          const s3 = p.sma_50 > p.sma_100;
          const passCount = (s1 ? 1 : 0) + (s2 ? 1 : 0) + (s3 ? 1 : 0);
          color = passCount === 3 ? '#4ADE80'
                : passCount === 0 ? '#F87171'
                : passCount >= 2 ? 'rgba(74,222,128,0.55)'
                : 'rgba(248,113,113,0.55)';
        }
        svg += `<rect x="${sx(i) - barW / 2}" y="${trendTop}" width="${barW.toFixed(1)}" height="${trendH}" fill="${color}" opacity="0.9"/>`;
      });
    }
    // Price area + line
    const areaD = prices.map((v, i) => `${i === 0 ? 'M' : 'L'} ${sx(i).toFixed(1)} ${syP(v).toFixed(1)}`).join(' ')
                + ` L ${sx(n - 1).toFixed(1)} ${priceBot} L ${sx(0).toFixed(1)} ${priceBot} Z`;
    const lineD = prices.map((v, i) => `${i === 0 ? 'M' : 'L'} ${sx(i).toFixed(1)} ${syP(v).toFixed(1)}`).join(' ');
    svg += `<path d="${areaD}" fill="var(--accent)" opacity="0.12"/>`;
    svg += `<path d="${lineD}" fill="none" stroke="var(--accent)" stroke-width="1.4"/>`;
    // X labels
    [0, Math.floor(n / 2), n - 1].forEach(i => {
      const dateStr = series[i]?.date ? series[i].date.slice(5, 10) : '';
      const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
      svg += `<text x="${sx(i)}" y="${H - 6}" fill="#8b949e" font-size="9" text-anchor="${anchor}" font-family="var(--font-mono)">${dateStr}</text>`;
    });
    svg += '</svg>';
    return svg;
  }

  /* Attach rolling SMAs onto each point of a chart series in-place.
     Uses the FULL history for lookback, then caller slices the display window. */
  function attachSmas(series, periods) {
    if (!Array.isArray(series) || !series.length) return;
    periods.forEach(p => {
      for (let i = 0; i < series.length; i++) {
        if (i < p - 1) { series[i]['sma_' + p] = null; continue; }
        let sum = 0;
        for (let k = i - p + 1; k <= i; k++) sum += series[k].price;
        series[i]['sma_' + p] = sum / p;
      }
    });
  }

  /* MVRV Z-score chart with zone bands: <1 green (accumulation),
     1–2.5 neutral, 2.5–3.5 orange (elevated), >3.5 red (cycle top). */
  function buildMvrvChart(series) {
    if (!series || series.length < 2) return '';
    const W = 520, H = 180, padL = 36, padR = 10, padT = 8, padB = 22;
    const innerW = W - padL - padR, innerH = H - padT - padB;
    const vals = series.map(p => p.value).filter(v => typeof v === 'number');
    if (!vals.length) return '';
    let lo = Math.min(...vals, 0.5), hi = Math.max(...vals, 4);
    const pad = (hi - lo) * 0.06 || 0.5;
    lo -= pad; hi += pad;
    const n = series.length;
    const sx = (i) => padL + (i / (n - 1)) * innerW;
    const sy = (v) => padT + (1 - (v - lo) / (hi - lo)) * innerH;
    let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:${H}px">`;
    const bands = [
      { from: lo,  to: 1,   fill: '#0a7d2c', op: 0.12 },
      { from: 1,   to: 2.5, fill: '#5BB77A', op: 0.08 },
      { from: 2.5, to: 3.5, fill: '#E5B94C', op: 0.10 },
      { from: 3.5, to: hi,  fill: '#DC2626', op: 0.12 },
    ];
    bands.forEach(b => {
      const y1 = sy(Math.min(b.from, b.to)), y2 = sy(Math.max(b.from, b.to));
      svg += `<rect x="${padL}" y="${Math.min(y1, y2)}" width="${innerW}" height="${Math.abs(y2 - y1)}" fill="${b.fill}" opacity="${b.op}"/>`;
    });
    [1, 2.5, 3.5].forEach(v => {
      const y = sy(v);
      svg += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="rgba(255,255,255,0.12)" stroke-width="0.4" stroke-dasharray="3 3"/>`;
      svg += `<text x="${padL - 3}" y="${y + 3}" fill="#8b949e" font-size="8" text-anchor="end" font-family="var(--font-mono)">${v}</text>`;
    });
    const lineD = series.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(i).toFixed(1)} ${sy(p.value).toFixed(1)}`).join(' ');
    svg += `<path d="${lineD}" fill="none" stroke="#A78BFA" stroke-width="1.3"/>`;
    const last = series[n - 1];
    if (last) {
      svg += `<circle cx="${sx(n - 1)}" cy="${sy(last.value)}" r="3" fill="#A78BFA"/>`;
      const lbl = last.value.toFixed(2);
      const charW = 5.4, padX = 5, padY = 2.5, bh = 14;
      const bw = Math.max(24, lbl.length * charW + padX * 2);
      const bx = W - padR - bw, by = padT;
      svg += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="3" fill="rgba(0,0,0,0.55)" stroke="#A78BFA" stroke-width="0.6"/>`;
      svg += `<text x="${bx + bw - padX}" y="${by + bh - padY - 1}" fill="#A78BFA" font-size="9" text-anchor="end" font-weight="700" font-family="var(--font-mono)">${lbl}</text>`;
    }
    [0, Math.floor(n / 2), n - 1].forEach(i => {
      const lab = series[i]?.date ? series[i].date.slice(0, 7) : '';
      const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
      svg += `<text x="${sx(i)}" y="${H - 6}" fill="#8b949e" font-size="8" text-anchor="${anchor}" font-family="var(--font-mono)">${lab}</text>`;
    });
    svg += '</svg>';
    return svg;
  }

  /* Simple line chart — used for hash rate. */
  function buildSimpleLine(series, opts) {
    if (!series || series.length < 2) return '';
    opts = opts || {};
    const W = opts.w || 520, H = opts.h || 180, padL = 42, padR = 10, padT = 8, padB = 22;
    const innerW = W - padL - padR, innerH = H - padT - padB;
    const vals = series.map(p => p.value).filter(v => typeof v === 'number' && isFinite(v));
    if (!vals.length) return '';
    let lo = Math.min(...vals), hi = Math.max(...vals);
    const pad = (hi - lo) * 0.06 || 1;
    lo -= pad; hi += pad;
    const n = series.length;
    const sx = (i) => padL + (i / (n - 1)) * innerW;
    const sy = (v) => padT + (1 - (v - lo) / (hi - lo)) * innerH;
    const yFmt = opts.yFmt || (v => v.toFixed(0));
    let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:${H}px">`;
    for (let g = 0; g <= 3; g++) {
      const yVal = lo + (g / 3) * (hi - lo), y = sy(yVal);
      svg += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="rgba(255,255,255,0.05)" stroke-width="0.3"/>`;
      svg += `<text x="${padL - 3}" y="${y + 3}" fill="#8b949e" font-size="8" text-anchor="end" font-family="var(--font-mono)">${yFmt(yVal)}</text>`;
    }
    const lineD = series.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(i).toFixed(1)} ${sy(p.value).toFixed(1)}`).join(' ');
    svg += `<path d="${lineD}" fill="none" stroke="${opts.color || 'var(--accent)'}" stroke-width="1.3"/>`;
    const last = series[n - 1];
    if (last) {
      svg += `<circle cx="${sx(n - 1)}" cy="${sy(last.value)}" r="3" fill="${opts.color || 'var(--accent)'}"/>`;
      const lbl = yFmt(last.value);
      const charW = 5.4, padX = 5, padY = 2.5, bh = 14;
      const bw = Math.max(24, lbl.length * charW + padX * 2);
      const bx = W - padR - bw, by = padT;
      svg += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="3" fill="rgba(0,0,0,0.55)" stroke="${opts.color || 'var(--accent)'}" stroke-width="0.6"/>`;
      svg += `<text x="${bx + bw - padX}" y="${by + bh - padY - 1}" fill="${opts.color || 'var(--accent)'}" font-size="9" text-anchor="end" font-weight="700" font-family="var(--font-mono)">${lbl}</text>`;
    }
    [0, Math.floor(n / 2), n - 1].forEach(i => {
      const lab = series[i]?.date ? series[i].date.slice(0, 7) : '';
      const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
      svg += `<text x="${sx(i)}" y="${H - 6}" fill="#8b949e" font-size="8" text-anchor="${anchor}" font-family="var(--font-mono)">${lab}</text>`;
    });
    svg += '</svg>';
    return svg;
  }

  /* Tiny inline sparkline for top-10 table rows. */
  function buildCoinSparkline(points, is_up) {
    if (!points || points.length < 2) return '';
    const W = 90, H = 22, pad = 1;
    const lo = Math.min(...points), hi = Math.max(...points);
    const rng = (hi - lo) || 1;
    const n = points.length;
    const sx = (i) => pad + (i / (n - 1)) * (W - 2 * pad);
    const sy = (v) => pad + (1 - (v - lo) / rng) * (H - 2 * pad);
    const d = points.map((v, i) => `${i === 0 ? 'M' : 'L'} ${sx(i).toFixed(1)} ${sy(v).toFixed(1)}`).join(' ');
    const color = is_up ? '#4ADE80' : '#F87171';
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:${W}px;height:${H}px"><path d="${d}" fill="none" stroke="${color}" stroke-width="1.1"/></svg>`;
  }

  async function renderCrypto(body) {
    // Cache full payload so toggle clicks re-render without refetching
    let d = body._cryData;
    if (!d) {
      body.innerHTML = `<div class="mod-loading">Loading crypto…</div>`;
    }
    try {
      if (!d) {
        d = await fetchJSON(`${BASE}/crypto.json`);
        body._cryData = d;
      }
      const g = d.global_stats || {};
      const oi = d.open_interest || {};
      const onchain = d.onchain || {};
      const mvrv = onchain.mvrv || [];
      const hashrate = onchain.hashrate || [];
      // Attach SMA50/SMA100 onto full btc_chart once, then slice last 60 for display.
      // SMA200 unavailable: feed history is ~180d.
      const fullBtc = d.btc_chart || [];
      if (fullBtc.length && fullBtc[0].sma_50 === undefined) attachSmas(fullBtc, [50, 100]);
      const btcData = fullBtc.slice(-60);
      const fundingData = (d.funding_rate || []).slice(-90);
      const lsData = (d.long_short || []).slice(-100);

      const cryShowVol   = localStorage.getItem('oc_cry_vol')   !== 'off';  // default on
      const cryShowTrend = localStorage.getItem('oc_cry_trend') !== 'off';  // default on

      const lastMvrv = mvrv.length ? mvrv[mvrv.length - 1].value : null;
      const mvrvZone = lastMvrv == null ? '' : lastMvrv > 3.5 ? 'num-dn' : lastMvrv > 2.5 ? 'num-warn' : lastMvrv > 1 ? 'num-up-soft' : 'num-up';
      const mvrvLabel = lastMvrv == null ? '—' : lastMvrv > 3.5 ? 'CYCLE TOP' : lastMvrv > 2.5 ? 'ELEVATED' : lastMvrv > 1 ? 'FAIR' : 'ACCUMULATION';

      // Top 10 coins with sparklines + 30d column
      const coins = (d.top_coins || []).slice(0, 10).map(c => {
        const spark = buildCoinSparkline(c.sparkline || [], (c.change_7d || 0) >= 0);
        return `
          <tr>
            <td class="mono">${c.rank}</td>
            <td class="tk clickable" data-tk="${String(c.symbol || '').toUpperCase()}">${String(c.symbol || '').toUpperCase()}</td>
            <td class="pat">${c.name || '—'}</td>
            <td class="mono">${fmt.money(c.price, (c.price != null && c.price < 1) ? 4 : 2)}</td>
            <td class="mono ${pnlCls(c.change_1h)}">${fmt.pct(c.change_1h)}</td>
            <td class="mono ${pnlCls(c.change_24h)}">${fmt.pct(c.change_24h)}</td>
            <td class="mono ${pnlCls(c.change_7d)}">${fmt.pct(c.change_7d)}</td>
            <td class="mono ${pnlCls(c.change_30d)}">${fmt.pct(c.change_30d)}</td>
            <td class="mono">${fmt.compact(c.market_cap)}</td>
            <td class="mono">${fmt.compact(c.volume_24h)}</td>
            <td class="crypto-spark">${spark}</td>
          </tr>
        `;
      }).join('');

      const fundingChart = window.OC_CHART && fundingData.length ? window.OC_CHART.lineAbs([
        { name: 'funding rate', values: fundingData.map(p => p.rate), color: 'var(--pnl-up)' },
      ], {
        gridY: 3, xLabels: fundingData.map(p => p.date || ''),
        yFmt: v => (v * 100).toFixed(3) + '%',
      }) : '';

      const lsChart = window.OC_CHART && lsData.length ? window.OC_CHART.lineAbs([
        { name: 'long/short ratio', values: lsData.map(p => p.ratio), color: '#60A5FA' },
      ], {
        gridY: 3, xLabels: lsData.map(p => p.date || ''),
        yFmt: v => v.toFixed(2),
      }) : '';

      body.innerHTML = `
        <style>
          [data-mod-panel="cry"] .acct-strip { grid-template-columns: repeat(6, 1fr); gap: 8px; }
          [data-mod-panel="cry"] .crypto-spark { width: 90px; padding: 2px 4px; }
          [data-mod-panel="cry"] .cry-glossary { font-size: 10px; color: var(--fg-dim); line-height: 1.5; }
          [data-mod-panel="cry"] .cry-glossary b { color: var(--fg); }
          [data-mod-panel="cry"] .cry-glossary p { margin: 3px 0; }
        </style>

        <div class="mod-head" data-mod-panel="cry">
          <div class="mod-title">${window.OC_TITLE('crypto')}</div>
          <div class="mod-meta"><span class="chip chip-dim">${fmt.ago(d.generated_at)}</span></div>
        </div>

        <div data-mod-panel="cry">
          <div class="acct-strip">
            <div class="acct-card">
              <div class="acct-name">TOTAL MCAP</div>
              <div class="acct-val"><span class="mono">${fmt.compact(g.total_market_cap)}</span></div>
              <div class="acct-meta"><span class="${pnlCls(g.market_cap_change_24h)}">${fmt.pct(g.market_cap_change_24h)} 24h</span></div>
            </div>
            <div class="acct-card">
              <div class="acct-name">24H VOLUME</div>
              <div class="acct-val"><span class="mono">${fmt.compact(g.total_volume_24h)}</span></div>
              <div class="acct-meta"><span>across ${fmt.compact(g.active_cryptocurrencies)} coins</span></div>
            </div>
            <div class="acct-card">
              <div class="acct-name">BTC DOMINANCE</div>
              <div class="acct-val"><span class="mono">${fmt.num(g.btc_dominance, 1)}%</span></div>
              <div class="acct-meta"><span>ETH ${fmt.num(g.eth_dominance, 1)}%</span></div>
            </div>
            <div class="acct-card">
              <div class="acct-name">MVRV Z-SCORE</div>
              <div class="acct-val"><span class="mono ${mvrvZone}">${lastMvrv != null ? lastMvrv.toFixed(2) : '—'}</span></div>
              <div class="acct-meta"><span class="${mvrvZone}">${mvrvLabel}</span></div>
            </div>
            <div class="acct-card">
              <div class="acct-name">BTC OPEN INTEREST</div>
              <div class="acct-val"><span class="mono">${fmt.compact(oi.oi_usd)}</span></div>
              <div class="acct-meta"><span>OKX perp</span></div>
            </div>
            <div class="acct-card">
              <div class="acct-name">CURRENT FUNDING</div>
              <div class="acct-val"><span class="mono ${oi.current_funding > 0 ? 'num-up' : 'num-dn'}">${oi.current_funding != null ? (oi.current_funding * 100).toFixed(4) + '%' : '—'}</span></div>
              <div class="acct-meta"><span>${oi.current_funding > 0 ? 'longs paying shorts' : 'shorts paying longs'}</span></div>
            </div>
          </div>

          ${btcData.length ? `
            <div class="mod-panel">
              <div class="mod-panel-title">
                BTC · ${btcData.length}-DAY PRICE${cryShowVol ? ' + VOLUME' : ''}${cryShowTrend ? ' + TREND' : ''}
                <span class="fin-stmt-toggles" style="margin-left:8px">
                  <button class="fin-mode-btn cry-vol-btn${cryShowVol ? ' active' : ''}" data-vol="${cryShowVol ? 'off' : 'on'}" title="Toggle volume bars">VOL ${cryShowVol ? 'ON' : 'OFF'}</button>
                  <button class="fin-mode-btn cry-trend-btn${cryShowTrend ? ' active' : ''}" data-trend="${cryShowTrend ? 'off' : 'on'}" title="Toggle trend strip">TREND ${cryShowTrend ? 'ON' : 'OFF'}</button>
                </span>
              </div>
              <div class="chart-wrap">${buildCryptoPriceVolumeChart(btcData, { showVolume: cryShowVol, showTrend: cryShowTrend })}</div>
              <div class="chart-legend">
                <span><span class="lg-line" style="background:var(--accent)"></span>BTC price</span>
                ${cryShowVol ? `
                  <span><span class="lg-line" style="background:rgba(74,222,128,0.55)"></span>volume (green = up-day)</span>
                  <span><span class="lg-line" style="background:rgba(248,113,113,0.55)"></span>volume (red = down-day)</span>
                ` : ''}
                ${cryShowTrend ? `
                  <span><span class="lg-line" style="background:#4ADE80"></span>trend 3/3 aligned up</span>
                  <span><span class="lg-line" style="background:#F87171"></span>trend 0/3 (aligned down)</span>
                  <span><span class="lg-line" style="background:#6B7280"></span>no SMA data</span>
                  <span class="chart-note">3-signal: px&gt;SMA50 · px&gt;SMA100 · SMA50&gt;SMA100 (SMA200 unavailable — ~180d history)</span>
                ` : ''}
              </div>
            </div>
          ` : ''}

          <div class="mod-grid-2">
            ${mvrv.length ? `
              <div class="mod-panel">
                <div class="mod-panel-title">MVRV Z-SCORE · on-chain valuation · ${mvrv.length} days</div>
                <div class="chart-wrap">${buildMvrvChart(mvrv)}</div>
                <div class="chart-legend">
                  <span class="chart-note">&gt;3.5 cycle top · 2.5–3.5 elevated · 1–2.5 fair · &lt;1 accumulation</span>
                </div>
              </div>
            ` : ''}
            ${hashrate.length ? `
              <div class="mod-panel">
                <div class="mod-panel-title">BTC HASH RATE · network security · ${hashrate.length} days</div>
                <div class="chart-wrap">${buildSimpleLine(hashrate, { color: '#FBBF24', yFmt: v => v.toFixed(0) + ' EH/s' })}</div>
                <div class="chart-legend">
                  <span class="chart-note">rising = miner confidence · drops &gt;10% signal miner capitulation</span>
                </div>
              </div>
            ` : ''}
          </div>

          <div class="mod-grid-2">
            <div class="mod-panel">
              <div class="mod-panel-title">FUNDING RATE · ${fundingData.length} bars · positive = longs paying</div>
              <div class="chart-wrap">${fundingChart}</div>
              <div class="chart-legend">
                <span class="chart-note">extreme positive (&gt;0.05%) often precedes corrections</span>
              </div>
            </div>
            <div class="mod-panel">
              <div class="mod-panel-title">LONG/SHORT RATIO · ${lsData.length} bars · &gt;1 = crowd long</div>
              <div class="chart-wrap">${lsChart}</div>
              <div class="chart-legend">
                <span class="chart-note">extremes are contrarian — everyone long → squeeze risk</span>
              </div>
            </div>
          </div>

          <div class="mod-panel">
            <div class="mod-panel-title">TOP 10 BY MARKET CAP · 7-day sparkline</div>
            <div class="tbl-wrap"><table class="tbl-dense">
              <thead><tr>
                <th>#</th><th>SYM</th><th>NAME</th><th>PRICE</th>
                <th>1H</th><th>24H</th><th>7D</th><th>30D</th>
                <th>MCAP</th><th>VOL</th><th>7D CHART</th>
              </tr></thead>
              <tbody>${coins}</tbody>
            </table></div>
          </div>

          <div class="mod-panel">
            <div class="mod-panel-title">HOW TO READ THIS DASHBOARD</div>
            <div class="cry-glossary">
              <p><b>MVRV Z-Score</b> — Market Value ÷ Realized Value. Compares BTC market cap to the aggregate cost basis of all coins. <b>&gt;3.5</b> historically marks cycle tops (2013, 2017, 2021). <b>&lt;1</b> marks accumulation zones (2018, 2022). Source: CoinMetrics.</p>
              <p><b>Hash Rate</b> — Total computational power securing the Bitcoin network (EH/s). Rising = miner confidence + network security. Sustained drops &gt;10% signal miner capitulation — historically a late-stage bear market marker.</p>
              <p><b>Funding Rate</b> — Periodic fee between long/short perp futures traders. <b>Positive</b> = longs pay shorts (bullish positioning, potentially overleveraged). <b>Negative</b> = shorts pay longs (bearish, squeeze setup). Source: OKX.</p>
              <p><b>Long/Short Ratio</b> — Top-trader account ratio. &gt;1 = more accounts long. Extremes are contrarian — crowded long positioning often precedes squeezes.</p>
              <p><b>Open Interest (OI)</b> — Total value of outstanding perp futures contracts. Rising OI with rising price = strong trend. Rising OI with falling price = short-squeeze setup. Falling OI = positions closing, trend weakening.</p>
              <p><b>BTC Dominance</b> — Bitcoin's share of total crypto market cap. Rising = capital flowing to BTC (risk-off). Falling = altcoin rotation ("alt season"). Historical range: 40–70%.</p>
            </div>
          </div>
        </div>
      `;

      // ticker click-throughs
      body.querySelectorAll('.tk.clickable').forEach(el => {
        el.addEventListener('click', () => {
          const t = el.dataset.tk;
          if (t && window.OC_OPEN_MODULE) window.OC_OPEN_MODULE('stock-analysis', { ticker: t });
        });
      });

      // BTC chart VOL / TREND toggles — re-render using cached data
      const volBtn = body.querySelector('.cry-vol-btn');
      if (volBtn) {
        volBtn.addEventListener('click', () => {
          localStorage.setItem('oc_cry_vol', volBtn.dataset.vol);
          renderCrypto(body);
        });
      }
      const trendBtn = body.querySelector('.cry-trend-btn');
      if (trendBtn) {
        trendBtn.addEventListener('click', () => {
          localStorage.setItem('oc_cry_trend', trendBtn.dataset.trend);
          renderCrypto(body);
        });
      }
    } catch (e) { body.innerHTML = `<div class="mod-err">${e.message}</div>`; }
  }

  /* Generic time-series chart — used for yields, spreads, credit, mortgage.
     Supports optional horizontal threshold line. */
  function buildSeriesChart(series, opts) {
    opts = opts || {};
    if (!series || series.length < 2) return '';
    const W = opts.w || 520, H = opts.h || 150, padL = 42, padR = 10, padT = 8, padB = 22;
    const innerW = W - padL - padR, innerH = H - padT - padB;
    const vals = series.map(p => p.value).filter(v => typeof v === 'number' && isFinite(v));
    if (!vals.length) return '';
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (opts.zeroLine) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    const pad = (hi - lo) * 0.08 || 1;
    lo -= pad; hi += pad;
    const n = series.length;
    const sx = (i) => padL + (i / (n - 1)) * innerW;
    const sy = (v) => padT + (1 - (v - lo) / (hi - lo)) * innerH;
    const yFmt = opts.yFmt || (v => v.toFixed(2));
    let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:${H}px">`;
    for (let g = 0; g <= 3; g++) {
      const yVal = lo + (g / 3) * (hi - lo), y = sy(yVal);
      svg += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="rgba(255,255,255,0.05)" stroke-width="0.3"/>`;
      svg += `<text x="${padL - 3}" y="${y + 3}" fill="#8b949e" font-size="8" text-anchor="end" font-family="var(--font-mono)">${yFmt(yVal)}</text>`;
    }
    if (opts.zeroLine && lo < 0 && hi > 0) {
      const y = sy(0);
      svg += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#f87171" stroke-width="0.8" stroke-dasharray="3 3"/>`;
    }
    (opts.thresholds || []).forEach(t => {
      if (t.value == null || t.value < lo || t.value > hi) return;
      const y = sy(t.value);
      svg += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="${t.color || '#fbbf24'}" stroke-width="0.7" stroke-dasharray="4 3" opacity="0.85"/>`;
      svg += `<text x="${W - padR - 3}" y="${y - 3}" fill="${t.color || '#fbbf24'}" font-size="8" text-anchor="end" font-weight="700" font-family="var(--font-mono)">${t.label || ''}</text>`;
    });
    const lineD = series.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(i).toFixed(1)} ${sy(p.value).toFixed(1)}`).join(' ');
    svg += `<path d="${lineD}" fill="none" stroke="${opts.color || 'var(--accent)'}" stroke-width="1.3"/>`;
    const last = series[n - 1];
    if (last) {
      svg += `<circle cx="${sx(n - 1)}" cy="${sy(last.value)}" r="3" fill="${opts.color || 'var(--accent)'}"/>`;
      const lbl = yFmt(last.value);
      const charW = 5.4, padX = 5, padY = 2.5, bh = 14;
      const bw = Math.max(24, lbl.length * charW + padX * 2);
      const bx = W - padR - bw, by = padT;
      svg += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="3" fill="rgba(0,0,0,0.55)" stroke="${opts.color || 'var(--accent)'}" stroke-width="0.6"/>`;
      svg += `<text x="${bx + bw - padX}" y="${by + bh - padY - 1}" fill="${opts.color || 'var(--accent)'}" font-size="9" text-anchor="end" font-weight="700" font-family="var(--font-mono)">${lbl}</text>`;
    }
    [0, Math.floor(n / 2), n - 1].forEach(i => {
      const lab = series[i]?.date ? series[i].date.slice(0, 7) : '';
      const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
      svg += `<text x="${sx(i)}" y="${H - 6}" fill="#8b949e" font-size="8" text-anchor="${anchor}" font-family="var(--font-mono)">${lab}</text>`;
    });
    svg += '</svg>';
    return svg;
  }

  /* COT history chart — paired diverging bars per snapshot date for one
     instrument: net speculator (red on negative / blue on positive) and
     net commercial (mirror of spec). Centered on a zero line. */
  function buildCotHistoryChart(history) {
    if (!history || !Array.isArray(history.dates) || history.dates.length < 2) return '';
    const dates = history.dates;
    const spec  = history.netSpec || [];
    const comm  = history.netComm || [];
    const n = dates.length;
    // viewBox sized for full-panel-width COT charts (used in BND + MET).
    // W=820 keeps text close to its native pixel size at typical render width.
    const W = 820, H = 240, padL = 56, padR = 14, padT = 14, padB = 30;
    const innerW = W - padL - padR, innerH = H - padT - padB;
    const all = [...spec, ...comm].filter(v => typeof v === 'number' && isFinite(v));
    if (!all.length) return '';
    let lo = Math.min(0, ...all), hi = Math.max(0, ...all);
    const pad = Math.max(Math.abs(lo), Math.abs(hi)) * 0.08 || 1;
    lo -= pad; hi += pad;
    const sx = (i) => padL + ((i + 0.5) / n) * innerW;
    const sy = (v) => padT + (1 - (v - lo) / (hi - lo)) * innerH;
    const slot = innerW / n;
    const barW = Math.max(4, Math.min(28, slot * 0.36));

    let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:${H}px">`;
    // y grid + labels
    for (let g = 0; g <= 4; g++) {
      const yVal = lo + (g / 4) * (hi - lo), y = sy(yVal);
      svg += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="rgba(255,255,255,0.05)" stroke-width="0.3"/>`;
      svg += `<text x="${padL - 4}" y="${y + 3}" fill="#8b949e" font-size="10" text-anchor="end" font-family="var(--font-mono)">${fmt.compact(yVal)}</text>`;
    }
    // zero line
    if (lo < 0 && hi > 0) {
      const y0 = sy(0);
      svg += `<line x1="${padL}" y1="${y0}" x2="${W - padR}" y2="${y0}" stroke="rgba(255,255,255,0.35)" stroke-width="0.7"/>`;
    }
    // normal-range bands (±1σ around mean) for spec and comm — only render
    // if stddev is a meaningful fraction of the chart's vertical range
    const meanStd = (arr) => {
      const v = arr.filter(x => typeof x === 'number' && isFinite(x));
      if (v.length < 2) return null;
      const m = v.reduce((a, b) => a + b, 0) / v.length;
      const s = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
      return { mean: m, sd: s };
    };
    const drawBand = (stat, color, label, yAnchor) => {
      if (!stat) return;
      const yRange = hi - lo;
      const bandFrac = (2 * stat.sd) / yRange;
      if (bandFrac < 0.04) return; // band too thin to read — skip
      const yTop = sy(stat.mean + stat.sd), yBot = sy(stat.mean - stat.sd);
      const yMean = sy(stat.mean);
      svg += `<rect x="${padL}" y="${Math.min(yTop, yBot)}" width="${innerW}" height="${Math.abs(yBot - yTop)}" fill="${color}" opacity="0.10"/>`;
      svg += `<line x1="${padL}" y1="${yMean}" x2="${W - padR}" y2="${yMean}" stroke="${color}" stroke-width="0.6" stroke-dasharray="3 3" opacity="0.65"/>`;
      // tiny "±1σ" tag at left edge
      svg += `<text x="${padL + 4}" y="${yAnchor}" fill="${color}" font-size="9" font-family="var(--font-mono)" opacity="0.85">${label} ±1σ</text>`;
    };
    // Use neutral grays for bands so they don't conflict with the
    // long/short bar colors. Spec band slightly brighter (it's the signal).
    drawBand(meanStd(spec), '#9ca3af', 'spec', padT + 9);
    drawBand(meanStd(comm), '#6b7280', 'comm', padT + 19);
    // bars — same semantic colors for both series so the mirror relationship
    // is visually obvious (long = green, short = red). Spec sits on the left
    // of each tick, comm on the right. Spec gets a thin border to disambiguate.
    const colLong  = 'rgba(74,222,128,0.85)';
    const colShort = 'rgba(248,113,113,0.85)';
    const y0 = sy(0);
    for (let i = 0; i < n; i++) {
      const cx = sx(i);
      const sv = spec[i], cv = comm[i];
      if (typeof sv === 'number' && isFinite(sv)) {
        const sy1 = sy(sv);
        const top = Math.min(y0, sy1), h = Math.abs(sy1 - y0);
        const fill = sv >= 0 ? colLong : colShort;
        svg += `<rect x="${cx - barW - 1}" y="${top}" width="${barW}" height="${h}" fill="${fill}" stroke="rgba(255,255,255,0.55)" stroke-width="0.6"/>`;
      }
      if (typeof cv === 'number' && isFinite(cv)) {
        const sy2 = sy(cv);
        const top = Math.min(y0, sy2), h = Math.abs(sy2 - y0);
        const fill = cv >= 0 ? colLong : colShort;
        svg += `<rect x="${cx + 1}" y="${top}" width="${barW}" height="${h}" fill="${fill}"/>`;
      }
    }
    // x labels — show every snapshot if <=12, else evenly spaced
    const step = n <= 12 ? 1 : Math.ceil(n / 10);
    for (let i = 0; i < n; i += step) {
      const lab = (dates[i] || '').slice(5); // MM-DD
      svg += `<text x="${sx(i)}" y="${H - 8}" fill="#8b949e" font-size="9" text-anchor="middle" font-family="var(--font-mono)">${lab}</text>`;
    }
    svg += '</svg>';
    return svg;
  }

  /* FedWatch stacked probability chart — next N meetings × rate-range
     probabilities. Each meeting is a stacked column; each segment's height
     is the probability of that rate range at that meeting. */
  function buildFedWatchChart(meetings, rateRanges) {
    if (!meetings || !meetings.length || !rateRanges || !rateRanges.length) return '';
    const W = 820, H = 280, padL = 48, padR = 120, padT = 22, padB = 40;
    const innerW = W - padL - padR, innerH = H - padT - padB;
    const n = Math.min(meetings.length, 8);
    const keepMeetings = meetings.slice(0, n);
    const colW = innerW / n;
    const barW = Math.min(64, colW * 0.66);
    // Color ramp: higher rate range = more orange/red (tightening)
    // Lower rate range = more green (cutting)
    const rampColor = (idx, total) => {
      const t = total > 1 ? idx / (total - 1) : 0.5;
      // green (low rate) → yellow → red (high rate)
      const h = 140 - t * 140;
      return `hsl(${h}, 55%, 45%)`;
    };
    let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:${H}px">`;
    // Y axis labels (0-100%)
    for (let pct = 0; pct <= 100; pct += 25) {
      const y = padT + (1 - pct / 100) * innerH;
      svg += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="rgba(255,255,255,0.05)" stroke-width="0.3"/>`;
      svg += `<text x="${padL - 4}" y="${y + 3}" fill="#8b949e" font-size="9" text-anchor="end" font-family="var(--font-mono)">${pct}%</text>`;
    }
    keepMeetings.forEach((m, mi) => {
      const x0 = padL + mi * colW + (colW - barW) / 2;
      let stackY = padT + innerH;
      rateRanges.forEach((range, ri) => {
        const pct = (m.probabilities || {})[range] || 0;
        if (pct <= 0) return;
        const h = (pct / 100) * innerH;
        const y = stackY - h;
        const color = rampColor(ri, rateRanges.length);
        svg += `<rect x="${x0}" y="${y}" width="${barW}" height="${h}" fill="${color}" opacity="0.85"/>`;
        // Label inside if segment big enough
        if (pct >= 12) {
          svg += `<text x="${x0 + barW / 2}" y="${y + h / 2 + 3}" fill="#fff" font-size="9" font-weight="700" text-anchor="middle">${pct.toFixed(0)}%</text>`;
        }
        stackY -= h;
      });
      // Meeting date label below
      const shortDate = m.meeting_date ? m.meeting_date.slice(5) : '';
      svg += `<text x="${x0 + barW / 2}" y="${H - padB + 12}" fill="#e6edf3" font-size="9" text-anchor="middle" font-family="var(--font-mono)">${shortDate}</text>`;
      // Expected rate below the date
      if (m.expected_rate != null) {
        svg += `<text x="${x0 + barW / 2}" y="${H - padB + 25}" fill="#60A5FA" font-size="8" font-weight="700" text-anchor="middle" font-family="var(--font-mono)">${m.expected_rate.toFixed(2)}%</text>`;
      }
    });
    // Legend on the right (show color ramp for rate ranges)
    rateRanges.forEach((range, ri) => {
      const y = padT + (ri / Math.max(1, rateRanges.length - 1)) * (innerH - 14);
      svg += `<rect x="${W - padR + 6}" y="${y}" width="10" height="10" fill="${rampColor(ri, rateRanges.length)}" opacity="0.85"/>`;
      svg += `<text x="${W - padR + 20}" y="${y + 9}" fill="#c9d1d9" font-size="9" font-family="var(--font-mono)">${range}</text>`;
    });
    svg += '</svg>';
    return svg;
  }

  /* ── Bonds dashboard ─────────────────────────────────────
     FedWatch + Yield curve + individual yield/spread charts +
     inflation (breakeven + real yield) + credit (HY/BBB) +
     mortgage (30Y/15Y) + COT positioning + tables + glossary. */
  async function renderBonds(body) {
    body.innerHTML = `<div class="mod-loading">Loading bonds…</div>`;
    try {
      const [d, fw, cot] = await Promise.all([
        fetchJSON(`${BASE}/bonds.json`),
        fetchJSON(`${BASE}/fedwatch.json`).catch(() => null),
        fetchJSON(`${BASE}/cot.json`).catch(() => null),
      ]);
      const tys = d.treasury_yields || [];
      const rows = tys.map(y => `
        <tr>
          <td class="pat">${y.name || y.maturity || y.label || '—'}</td>
          <td class="mono">${fmt.num(y.value, 2)}%</td>
          <td class="mono ${pnlCls(y.daily_change)}">${fmt.num(y.daily_change, 2)}</td>
          <td class="mono ${pnlCls(y.weekly_change)}">${fmt.num(y.weekly_change, 2)}</td>
          <td class="mono">${y.date || '—'}</td>
        </tr>
      `).join('');
      const keyRate = (k, r) => !r ? '' : `
        <tr>
          <td class="pat">${r.name || k}</td>
          <td class="mono">${fmt.num(r.value, 2)}%</td>
          <td class="mono ${pnlCls(r.daily_change)}">${fmt.num(r.daily_change, 2)}</td>
          <td class="mono">${r.date || '—'}</td>
        </tr>
      `;
      const keyRates = Object.entries(d.key_rates || {}).map(([k, v]) => keyRate(k, v)).join('');
      const creditRows = Object.entries(d.credit || {}).map(([k, v]) => keyRate(k, v)).join('');

      // Yield curve chart: current vs 1mo ago vs 1yr ago
      const yc = d.yield_curves || {};
      const curveMaturities = (yc.current || []).map(p => p.label);
      const curveChart = window.OC_CHART && (yc.current || []).length ? window.OC_CHART.lineAbs([
        { name: '1yr ago', values: (yc.one_year_ago || []).map(p => p.value), color: 'var(--fg-faint)', dashed: true },
        { name: '1mo ago', values: (yc.one_month_ago || []).map(p => p.value), color: '#60A5FA', dashed: true },
        { name: 'current',  values: (yc.current || []).map(p => p.value), color: 'var(--accent)' },
      ], {
        gridY: 4, xLabels: curveMaturities, dots: true,
        yFmt: v => v.toFixed(2) + '%',
      }) : '';

      // Chart histories from FRED-sourced bonds.json
      const charts = d.charts || {};
      const hist = (key) => (charts[key]?.history || []).filter(x => x.value != null);
      const spreadSeries = hist('T10Y2Y');
      const spreadChart = buildSeriesChart(spreadSeries, {
        color: '#0a7d2c', yFmt: v => v.toFixed(2) + '%', zeroLine: true,
      });

      // Individual yield / spread charts
      const dgs10Chart = buildSeriesChart(hist('DGS10'), { color: '#60A5FA', yFmt: v => v.toFixed(2) + '%' });
      const dgs2Chart  = buildSeriesChart(hist('DGS2'),  { color: '#A78BFA', yFmt: v => v.toFixed(2) + '%' });
      const t103mChart = buildSeriesChart(hist('T10Y3M'), { color: '#F87171', yFmt: v => v.toFixed(2) + '%', zeroLine: true });

      // Inflation expectations
      const breakevenChart = buildSeriesChart(hist('T10YIE'), { color: '#E5B94C', yFmt: v => v.toFixed(2) + '%' });
      const realYieldChart = buildSeriesChart(hist('DFII10'), { color: '#5BB77A', yFmt: v => v.toFixed(2) + '%', zeroLine: true });

      // Credit spreads (with thresholds)
      const hyHist  = (d.credit?.BAMLH0A0HYM2?.history || []).filter(x => x.value != null);
      const bbbHist = (d.credit?.BAMLC0A4CBBB?.history || []).filter(x => x.value != null);
      const hyChart = buildSeriesChart(hyHist, {
        color: '#DC2626', yFmt: v => v.toFixed(2) + '%',
        thresholds: [{ value: 5, label: 'stress >5%', color: '#f87171' }],
      });
      const bbbChart = buildSeriesChart(bbbHist, {
        color: '#FB923C', yFmt: v => v.toFixed(2) + '%',
      });

      // Mortgage rates
      const mort30Chart = buildSeriesChart(hist('MORTGAGE30US'), { color: '#60A5FA', yFmt: v => v.toFixed(2) + '%' });
      const mort15Chart = buildSeriesChart(hist('MORTGAGE15US'), { color: '#A78BFA', yFmt: v => v.toFixed(2) + '%' });

      // FedWatch
      const fwChart = fw ? buildFedWatchChart(fw.meetings || [], fw.rate_ranges || []) : '';
      const fwNext = fw?.meetings?.[0];

      // COT history chart — instruments with >=2 history snapshots
      const cotInsts = cot?.instruments || [];
      const cotChartable = cotInsts
        .map((inst, idx) => ({ inst, idx }))
        .filter(({ inst }) => inst.history && Array.isArray(inst.history.dates) && inst.history.dates.length >= 2);
      const cotInitialIdx = cotChartable.length ? cotChartable[0].idx : -1;
      const cotInitialChart = cotInitialIdx >= 0 ? buildCotHistoryChart(cotInsts[cotInitialIdx].history) : '';
      const cotSelectOpts = cotChartable
        .map(({ inst, idx }) => `<option value="${idx}">${inst.name || `#${idx}`}</option>`)
        .join('');

      // COT positioning table
      const cotRows = cotInsts.length ? cotInsts.map(i => `
        <tr>
          <td>${i.name || '—'}</td>
          <td class="small">${i.category || '—'}</td>
          <td class="mono">${fmt.compact(i.openInterest)}</td>
          <td class="mono ${pnlCls(i.netSpeculator)}">${i.netSpeculator >= 0 ? '+' : ''}${fmt.compact(i.netSpeculator)}</td>
          <td class="mono ${pnlCls(i.netCommercial)}">${i.netCommercial >= 0 ? '+' : ''}${fmt.compact(i.netCommercial)}</td>
          <td class="mono">${fmt.compact(i.specLong)}</td>
          <td class="mono">${fmt.compact(i.specShort)}</td>
          <td class="mono">${fmt.compact(i.commLong)}</td>
          <td class="mono">${fmt.compact(i.commShort)}</td>
        </tr>
      `).join('') : '';

      body.innerHTML = `
        <style>
          [data-mod-panel="bnd"] .bnd-chart-3 { display:grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-top: 6px; }
          [data-mod-panel="bnd"] .bnd-chart-2 { display:grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 6px; }
          [data-mod-panel="bnd"] .bnd-chart-3 > .mod-panel, [data-mod-panel="bnd"] .bnd-chart-2 > .mod-panel { min-width: 0; }
          @media (max-width: 1100px) { [data-mod-panel="bnd"] .bnd-chart-3 { grid-template-columns: 1fr; } }
          @media (max-width: 900px)  { [data-mod-panel="bnd"] .bnd-chart-2 { grid-template-columns: 1fr; } }
          [data-mod-panel="bnd"] .bnd-glossary { font-size: 10px; color: var(--fg-dim); line-height: 1.5; }
          [data-mod-panel="bnd"] .bnd-glossary b { color: var(--fg); }
          [data-mod-panel="bnd"] .bnd-glossary p { margin: 3px 0; }
          [data-mod-panel="bnd"] select.bnd-cot-select {
            color-scheme: dark;
            background: #0d1117;
            color: #c9d1d9;
            border: 1px solid #30363d;
            border-radius: 3px;
            padding: 2px 6px;
            font-size: 10px;
            font-family: var(--font-mono);
            cursor: pointer;
          }
          [data-mod-panel="bnd"] select.bnd-cot-select:focus { outline: 1px solid var(--accent); }
          [data-mod-panel="bnd"] select.bnd-cot-select option { background: #0d1117; color: #c9d1d9; }
        </style>

        <div class="mod-head" data-mod-panel="bnd">
          <div class="mod-title">${window.OC_TITLE('bonds')} · FIXED INCOME</div>
          <div class="mod-meta">
            <span class="chip chip-dim" title="Treasury yields + credit spreads (compute_bonds.py)">YIELDS ${fmt.ago(d.generated_at)}</span>
            ${fw && fw.generated_at ? `<span class="chip chip-dim" title="CME Fed rate probabilities">FEDWATCH ${fmt.ago(fw.generated_at)}</span>` : ''}
            ${cot && cot.generated_at ? `<span class="chip chip-dim" title="CFTC Commitments of Traders (weekly)">COT ${fmt.ago(cot.generated_at)}</span>` : ''}
          </div>
        </div>

        <div data-mod-panel="bnd">
          ${fwChart ? `
            <div class="mod-panel">
              <div class="mod-panel-title">
                CME FEDWATCH · market-implied rate path · ${fwNext ? 'next meeting ' + fwNext.meeting_date : ''}
                ${fwNext ? `· expected <span class="mono num-up">${fwNext.expected_rate?.toFixed(2)}%</span> · most likely <span class="mono">${fwNext.most_probable} (${fwNext.most_probable_pct?.toFixed(0)}%)</span>` : ''}
              </div>
              <div class="chart-wrap">${fwChart}</div>
              <div class="chart-legend">
                <span class="chart-note">each column = one FOMC meeting · stacked probabilities across rate ranges · blue number = expected rate</span>
              </div>
            </div>
          ` : ''}

          ${curveMaturities.length ? `
            <div class="mod-grid-2">
              <div class="mod-panel">
                <div class="mod-panel-title">YIELD CURVE · 1M → 30Y · shape and shifts</div>
                <div class="chart-wrap">${curveChart}</div>
                <div class="chart-legend">
                  <span><span class="lg-line" style="background:var(--accent)"></span>current</span>
                  <span><span class="lg-line" style="background:#60A5FA"></span>1mo ago</span>
                  <span><span class="lg-line" style="background:var(--fg-faint)"></span>1yr ago</span>
                  <span class="chart-note">inverted = front &gt; back end</span>
                </div>
              </div>
              ${spreadSeries.length ? `
                <div class="mod-panel">
                  <div class="mod-panel-title">10Y − 2Y SPREAD · recession leading indicator</div>
                  <div class="chart-wrap">${spreadChart}</div>
                  <div class="chart-legend">
                    <span class="chart-note">below zero = inverted · historically 6–24 mo recession signal</span>
                  </div>
                </div>
              ` : ''}
            </div>
          ` : ''}

          ${(dgs10Chart || dgs2Chart || t103mChart) ? `
            <div class="bnd-chart-3">
              ${dgs10Chart ? `
                <div class="mod-panel">
                  <div class="mod-panel-title">10Y TREASURY YIELD</div>
                  <div class="chart-wrap">${dgs10Chart}</div>
                  <div class="chart-legend"><span class="chart-note">benchmark long rate</span></div>
                </div>
              ` : ''}
              ${dgs2Chart ? `
                <div class="mod-panel">
                  <div class="mod-panel-title">2Y TREASURY YIELD</div>
                  <div class="chart-wrap">${dgs2Chart}</div>
                  <div class="chart-legend"><span class="chart-note">short-rate expectation</span></div>
                </div>
              ` : ''}
              ${t103mChart ? `
                <div class="mod-panel">
                  <div class="mod-panel-title">10Y − 3M SPREAD</div>
                  <div class="chart-wrap">${t103mChart}</div>
                  <div class="chart-legend"><span class="chart-note">Fed's preferred recession-probability model input</span></div>
                </div>
              ` : ''}
            </div>
          ` : ''}

          ${(breakevenChart || realYieldChart) ? `
            <div class="bnd-chart-2">
              ${breakevenChart ? `
                <div class="mod-panel">
                  <div class="mod-panel-title">10Y BREAKEVEN INFLATION · market-implied</div>
                  <div class="chart-wrap">${breakevenChart}</div>
                  <div class="chart-legend"><span class="chart-note">10Y nominal − 10Y TIPS · rising = inflation fear · Fed target ~2.5%</span></div>
                </div>
              ` : ''}
              ${realYieldChart ? `
                <div class="mod-panel">
                  <div class="mod-panel-title">10Y REAL YIELD · TIPS (DFII10)</div>
                  <div class="chart-wrap">${realYieldChart}</div>
                  <div class="chart-legend"><span class="chart-note">real cost of capital · above 2% historically restrictive</span></div>
                </div>
              ` : ''}
            </div>
          ` : ''}

          ${(hyChart || bbbChart) ? `
            <div class="bnd-chart-2">
              ${hyChart ? `
                <div class="mod-panel">
                  <div class="mod-panel-title">HY OAS · HIGH-YIELD CREDIT SPREAD</div>
                  <div class="chart-wrap">${hyChart}</div>
                  <div class="chart-legend"><span class="chart-note">&lt;3% complacent · 3–5% normal · &gt;5% recession territory</span></div>
                </div>
              ` : ''}
              ${bbbChart ? `
                <div class="mod-panel">
                  <div class="mod-panel-title">BBB SPREAD · lowest investment-grade</div>
                  <div class="chart-wrap">${bbbChart}</div>
                  <div class="chart-legend"><span class="chart-note">widens first when credit cycle turns</span></div>
                </div>
              ` : ''}
            </div>
          ` : ''}

          ${(mort30Chart || mort15Chart) ? `
            <div class="bnd-chart-2">
              ${mort30Chart ? `
                <div class="mod-panel">
                  <div class="mod-panel-title">30-YEAR FIXED MORTGAGE · Freddie Mac</div>
                  <div class="chart-wrap">${mort30Chart}</div>
                  <div class="chart-legend"><span class="chart-note">primary consumer borrowing cost · housing-market transmission</span></div>
                </div>
              ` : ''}
              ${mort15Chart ? `
                <div class="mod-panel">
                  <div class="mod-panel-title">15-YEAR FIXED MORTGAGE</div>
                  <div class="chart-wrap">${mort15Chart}</div>
                  <div class="chart-legend"><span class="chart-note">typical refinance path · tracks 10Y Treasury + MBS spread</span></div>
                </div>
              ` : ''}
            </div>
          ` : ''}

          <div class="mod-grid-2">
            <div class="mod-panel">
              <div class="mod-panel-title">TREASURY YIELDS</div>
              <div class="tbl-wrap"><table class="tbl-dense">
                <thead><tr><th>MATURITY</th><th>YIELD</th><th>1D</th><th>1W</th><th>DATE</th></tr></thead>
                <tbody>${rows || '<tr><td colspan="5" class="empty">no data</td></tr>'}</tbody>
              </table></div>
            </div>
            <div class="mod-side">
              <div class="mod-panel">
                <div class="mod-panel-title">KEY RATES</div>
                <div class="tbl-wrap"><table class="tbl-dense">
                  <thead><tr><th>NAME</th><th>VAL</th><th>1D</th><th>DATE</th></tr></thead>
                  <tbody>${keyRates}</tbody>
                </table></div>
              </div>
              <div class="mod-panel">
                <div class="mod-panel-title">CREDIT SPREADS (current)</div>
                <div class="tbl-wrap"><table class="tbl-dense">
                  <thead><tr><th>NAME</th><th>VAL</th><th>1D</th><th>DATE</th></tr></thead>
                  <tbody>${creditRows}</tbody>
                </table></div>
              </div>
            </div>
          </div>

          ${cotInitialChart ? `
            <div class="mod-panel">
              <div class="mod-panel-title" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <span>COT POSITIONING HISTORY</span>
                <select class="bnd-cot-select" style="margin-left:auto">${cotSelectOpts}</select>
              </div>
              <div class="chart-wrap bnd-cot-chart-wrap">${cotInitialChart}</div>
              <div class="chart-legend">
                <span><span class="lg-line" style="background:rgba(74,222,128,0.85)"></span>net long (positive)</span>
                <span><span class="lg-line" style="background:rgba(248,113,113,0.85)"></span>net short (negative)</span>
                <span><span class="lg-line" style="background:rgba(255,255,255,0.55);height:2px;border:0.5px solid #fff"></span>spec (left, white border)</span>
                <span><span class="lg-line" style="background:rgba(255,255,255,0.0);border:0.5px solid #888"></span>comm (right, no border)</span>
                <span class="chart-note">futures are zero-sum: spec + comm ≈ 0, so each tick shows mirror bars (one red, one green) of equal height. The signal is which side the speculators are taking — extreme spec long often precedes squeezes; extreme spec short often precedes rallies. Commercials are hedgers responding to flow.</span>
              </div>
            </div>
          ` : ''}

          ${cotRows ? `
            <div class="mod-panel">
              <div class="mod-panel-title">COT POSITIONING · ${cot?.total_instruments || 0} instruments · as of ${cot?.as_of || '—'}</div>
              <div class="tbl-wrap"><table class="tbl-dense">
                <thead><tr>
                  <th>INSTRUMENT</th><th>CATEGORY</th>
                  <th class="num">OI</th>
                  <th class="num">NET SPEC</th><th class="num">NET COMM</th>
                  <th class="num">SPEC L</th><th class="num">SPEC S</th>
                  <th class="num">COMM L</th><th class="num">COMM S</th>
                </tr></thead>
                <tbody>${cotRows}</tbody>
              </table></div>
              <div class="chart-legend"><span class="chart-note">CFTC Commitments of Traders · speculators (HF/CTA/funds) vs commercials (hedgers). Extreme net-spec positioning often precedes reversals — crowded long = squeeze risk.</span></div>
            </div>
          ` : ''}

          <div class="mod-panel">
            <div class="mod-panel-title">HOW TO READ THIS DASHBOARD</div>
            <div class="bnd-glossary">
              <p><b>CME FedWatch</b> — Fed funds futures-implied probabilities for each FOMC meeting's target rate range. Every morning's "market's pricing X% odds of a cut" headline comes from here. Colour ramp: green = low rate (cut), red = high rate (hike/hold).</p>
              <p><b>Yield Curve</b> — Treasury yields plotted by maturity (3M, 2Y, 5Y, 10Y, 30Y). Normal = upward sloping. Inverted = front end &gt; long end, historically precedes every US recession since 1955 by 6–24 months.</p>
              <p><b>10Y − 2Y / 10Y − 3M Spreads</b> — two classic recession-leading indicators. The Fed's official recession-probability model uses 10Y − 3M; market commentary usually cites 10Y − 2Y.</p>
              <p><b>Breakeven Inflation</b> — (10Y nominal yield − 10Y TIPS yield). Market's implied inflation expectation over the next decade. Rising = inflation fear; the Fed's stated 2% goal translates to ~2.5% breakeven after term premium.</p>
              <p><b>10Y Real Yield</b> — the TIPS yield directly; the real cost of capital after inflation. Above 2% historically signals restrictive policy; below zero = financial repression.</p>
              <p><b>HY OAS (High-Yield Option-Adjusted Spread)</b> — excess yield on junk bonds over Treasuries. &lt;3% complacent, 3–5% normal, &gt;5% recession territory (2001, 2008, 2020). Widens first in credit cycles.</p>
              <p><b>BBB Spread</b> — lowest investment-grade cohort. Widens before HY does when the credit cycle turns because BBB sits at the "fallen angel" boundary.</p>
              <p><b>Mortgage Rates</b> — 30Y + 15Y Freddie Mac PMMS. Primary consumer borrowing cost and the most direct transmission channel from Fed policy to the real economy.</p>
              <p><b>COT Positioning</b> — CFTC Commitments of Traders. Speculators (HF, CTA, managed money) vs commercials (hedgers/producers). Extreme net-spec positioning is contrarian — crowded long often precedes short squeezes.</p>
            </div>
          </div>
        </div>
      `;

      // Wire up COT instrument selector → swap chart in place
      const cotSel = body.querySelector('.bnd-cot-select');
      const cotWrap = body.querySelector('.bnd-cot-chart-wrap');
      if (cotSel && cotWrap) {
        cotSel.addEventListener('change', () => {
          const idx = parseInt(cotSel.value, 10);
          const inst = cotInsts[idx];
          if (inst && inst.history) cotWrap.innerHTML = buildCotHistoryChart(inst.history);
        });
      }
    } catch (e) { body.innerHTML = `<div class="mod-err">${e.message}</div>`; }
  }

  /* ── Metals helpers ────────────────────────────────────── */

  // Compute simple moving average series from a values[] array.
  // Returns same length, with leading nulls for the warm-up period.
  function computeSma(values, window) {
    const out = new Array(values.length).fill(null);
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
      sum += values[i];
      if (i >= window) sum -= values[i - window];
      if (i >= window - 1) out[i] = sum / window;
    }
    return out;
  }

  // Wilder's RSI(14). Returns same length array, leading nulls.
  function computeRsi(values, period) {
    period = period || 14;
    const out = new Array(values.length).fill(null);
    if (values.length < period + 1) return out;
    let gain = 0, loss = 0;
    for (let i = 1; i <= period; i++) {
      const ch = values[i] - values[i - 1];
      if (ch >= 0) gain += ch; else loss -= ch;
    }
    let avgGain = gain / period, avgLoss = loss / period;
    out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    for (let i = period + 1; i < values.length; i++) {
      const ch = values[i] - values[i - 1];
      const g = ch > 0 ? ch : 0, l = ch < 0 ? -ch : 0;
      avgGain = (avgGain * (period - 1) + g) / period;
      avgLoss = (avgLoss * (period - 1) + l) / period;
      out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    }
    return out;
  }

  // Gold/Silver/GDX price chart — close line + SMA20/50/200 overlays + RSI14 subpanel.
  // Bars = [{date, open, high, low, close}]. Renders last `lookback` bars (default 180).
  function buildMetalChart(bars, opts) {
    opts = opts || {};
    if (!bars || bars.length < 30) return '';
    const lookback = Math.min(opts.lookback || 180, bars.length);
    // Compute SMAs from the FULL bar history first (so SMA200 is valid at the start of the visible window).
    const allCloses = bars.map(b => b.close);
    const sma20full  = computeSma(allCloses, 20);
    const sma50full  = computeSma(allCloses, 50);
    const sma200full = computeSma(allCloses, 200);
    const rsi14full  = computeRsi(allCloses, 14);
    const start = bars.length - lookback;
    const view  = bars.slice(start);
    const closes = view.map(b => b.close);
    const sma20  = sma20full.slice(start);
    const sma50  = sma50full.slice(start);
    const sma200 = sma200full.slice(start);
    const rsi    = rsi14full.slice(start);
    const dates  = view.map(b => b.date);

    // viewBox width matches BND charts (~540) so text doesn't get squished
    // horizontally when the container is narrow (e.g. half-screen browser).
    // Wider viewBox + preserveAspectRatio="none" = thin text on small panels.
    const W = opts.w || 540, padL = 44, padR = 12;
    const priceH = opts.priceH || 220, rsiH = opts.rsiH || 80, gap = 8;
    const padT = 10, padBP = 4, padTR = 14, padBR = 22;
    const H = padT + priceH + gap + rsiH + padBR;

    const innerW = W - padL - padR;
    const n = view.length;
    const sx = (i) => padL + (i / (n - 1)) * innerW;

    // Price y-scale spans close + all SMA values present
    const priceVals = [...closes, ...sma20.filter(v => v != null), ...sma50.filter(v => v != null), ...sma200.filter(v => v != null)];
    let pLo = Math.min(...priceVals), pHi = Math.max(...priceVals);
    const pPad = (pHi - pLo) * 0.05 || 1; pLo -= pPad; pHi += pPad;
    const syP = (v) => padT + (1 - (v - pLo) / (pHi - pLo)) * (priceH - padBP);

    // RSI y-scale fixed 0..100
    const rsiTop = padT + priceH + gap;
    const syR = (v) => rsiTop + padTR - 4 + (1 - v / 100) * (rsiH - padTR);

    const yFmtP = opts.yFmt || (v => '$' + v.toFixed(2));

    let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:${H}px">`;

    // Price grid
    for (let g = 0; g <= 4; g++) {
      const yVal = pLo + (g / 4) * (pHi - pLo), y = syP(yVal);
      svg += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="rgba(255,255,255,0.05)" stroke-width="0.4"/>`;
      svg += `<text x="${padL - 4}" y="${y + 3}" fill="#8b949e" font-size="11" text-anchor="end" font-family="var(--font-mono)">${yFmtP(yVal)}</text>`;
    }

    // SMA paths (drawn first so close line sits on top)
    const drawPath = (series, color, sw, dash) => {
      const pts = [];
      series.forEach((v, i) => { if (typeof v === 'number' && !isNaN(v)) pts.push({ x: sx(i), y: syP(v) }); });
      if (!pts.length) return '';
      const d = window.OC_CHART ? window.OC_CHART.smoothPath(pts) : pts.map((p, j) => (j === 0 ? 'M' : 'L') + ' ' + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' ');
      return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${sw}" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`;

    };
    svg += drawPath(sma200, '#888', 1.0, '4 3');
    svg += drawPath(sma50,  '#A78BFA', 1.1);
    svg += drawPath(sma20,  '#60A5FA', 1.0);

    // Close line (accent)
    svg += drawPath(closes, opts.color || '#E5B94C', 1.6);

    // Last-value pills for close + SMAs (stacked top-right of price panel).
    // Sized to read cleanly at half-screen browser widths.
    const drawPill = (lbl, color, idx) => {
      if (lbl == null) return;
      const charW = 6.6, padX = 6, padY = 3, bh = 17;
      const bw = Math.max(50, lbl.length * charW + padX * 2);
      const bx = W - padR - bw, by = padT + idx * (bh + 2);
      svg += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="3" fill="rgba(0,0,0,0.65)" stroke="${color}" stroke-width="0.7"/>`;
      svg += `<text x="${bx + bw - padX}" y="${by + bh - padY - 1}" fill="${color}" font-size="11" text-anchor="end" font-weight="700" font-family="var(--font-mono)">${lbl}</text>`;
    };
    const lastClose = closes[closes.length - 1];
    const lastS20 = sma20[sma20.length - 1];
    const lastS50 = sma50[sma50.length - 1];
    const lastS200 = sma200[sma200.length - 1];
    drawPill(lastClose != null ? `PX ${yFmtP(lastClose)}` : null, opts.color || '#E5B94C', 0);
    drawPill(lastS20   != null ? `SMA20 ${yFmtP(lastS20)}` : null, '#60A5FA', 1);
    drawPill(lastS50   != null ? `SMA50 ${yFmtP(lastS50)}` : null, '#A78BFA', 2);
    drawPill(lastS200  != null ? `SMA200 ${yFmtP(lastS200)}` : null, '#888', 3);

    // Date labels (price panel x-axis)
    [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor(3 * n / 4), n - 1].forEach(i => {
      const lab = (dates[i] || '').slice(0, 7);
      const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
      svg += `<text x="${sx(i)}" y="${padT + priceH - 2}" fill="#8b949e" font-size="10" text-anchor="${anchor}" font-family="var(--font-mono)">${lab}</text>`;
    });

    // RSI subpanel: 30/70 reference bands
    svg += `<rect x="${padL}" y="${syR(70)}" width="${innerW}" height="${syR(30) - syR(70)}" fill="rgba(255,255,255,0.03)"/>`;
    [30, 50, 70].forEach(v => {
      const y = syR(v);
      const color = v === 50 ? 'rgba(255,255,255,0.15)' : 'rgba(248,113,113,0.35)';
      svg += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="${color}" stroke-width="0.6" stroke-dasharray="${v === 50 ? '2 3' : '4 3'}"/>`;
      svg += `<text x="${padL - 4}" y="${y + 3}" fill="#8b949e" font-size="10" text-anchor="end" font-family="var(--font-mono)">${v}</text>`;
    });
    // RSI path
    const rsiPts = [];
    rsi.forEach((v, i) => { if (typeof v === 'number' && !isNaN(v)) rsiPts.push({ x: sx(i), y: syR(v) }); });
    if (rsiPts.length) {
      const rsiD = window.OC_CHART ? window.OC_CHART.smoothPath(rsiPts) : rsiPts.map((p, j) => (j === 0 ? 'M' : 'L') + ' ' + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' ');
      svg += `<path d="${rsiD}" fill="none" stroke="#5BB77A" stroke-width="1.2"/>`;
      // RSI last-value pill (top-right of RSI subpanel)
      const lastR = rsi[rsi.length - 1];
      if (lastR != null) {
        const lbl = `RSI14 ${lastR.toFixed(1)}`;
        const color = lastR > 70 ? '#f87171' : lastR < 30 ? '#5BB77A' : '#8b949e';
        const charW = 6.6, padX = 6, bh = 15;
        const bw = Math.max(50, lbl.length * charW + padX * 2);
        const bx = W - padR - bw, by = rsiTop + 2;
        svg += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="3" fill="rgba(0,0,0,0.65)" stroke="${color}" stroke-width="0.7"/>`;
        svg += `<text x="${bx + bw - padX}" y="${by + bh - 3}" fill="${color}" font-size="11" text-anchor="end" font-weight="700" font-family="var(--font-mono)">${lbl}</text>`;
      }
    }
    svg += '</svg>';
    return svg;
  }

  // Diverging horizontal bar chart for net buyers (positive, green) and sellers (negative, red).
  // buyers/sellers = [{country, change_tonnes}]. Sorted by abs() descending, top N.
  function buildFlowsBars(buyers, sellers, opts) {
    opts = opts || {};
    const all = [...(buyers || []), ...(sellers || [])]
      .filter(x => x && typeof x.change_tonnes === 'number')
      .sort((a, b) => Math.abs(b.change_tonnes) - Math.abs(a.change_tonnes))
      .slice(0, opts.maxRows || 12);
    if (!all.length) return '';
    const W = opts.w || 1080, rowH = 22, padT = 14, padB = 22;
    const labelW = 130, valueW = 64, padR = 14;
    const barCol = labelW + 6;
    const barAreaW = W - padR - barCol - valueW;
    const H = padT + all.length * rowH + padB;
    const maxAbs = Math.max(...all.map(x => Math.abs(x.change_tonnes)));
    const cx = barCol + barAreaW / 2; // zero line in the middle
    const halfW = barAreaW / 2;
    let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:${H}px">`;
    // zero line
    svg += `<line x1="${cx}" y1="${padT - 4}" x2="${cx}" y2="${padT + all.length * rowH}" stroke="rgba(255,255,255,0.35)" stroke-width="0.7"/>`;
    // grid (axis labels at +/- maxAbs and +/- maxAbs/2)
    [-1, -0.5, 0.5, 1].forEach(f => {
      const x = cx + f * halfW;
      svg += `<line x1="${x}" y1="${padT - 4}" x2="${x}" y2="${padT + all.length * rowH}" stroke="rgba(255,255,255,0.05)" stroke-width="0.4"/>`;
      svg += `<text x="${x}" y="${padT + all.length * rowH + 12}" fill="#8b949e" font-size="9" text-anchor="middle" font-family="var(--font-mono)">${(f * maxAbs).toFixed(0)}t</text>`;
    });
    all.forEach((row, i) => {
      const y = padT + i * rowH;
      const isPos = row.change_tonnes >= 0;
      const fill = isPos ? 'rgba(74,222,128,0.85)' : 'rgba(248,113,113,0.85)';
      const w = (Math.abs(row.change_tonnes) / maxAbs) * halfW;
      const bx = isPos ? cx : (cx - w);
      // country label (left, truncated if long)
      const country = (row.country || '—').replace(/, Rep\. of$/, '').replace(/Republic of /, '');
      svg += `<text x="${labelW - 4}" y="${y + 14}" fill="#c9d1d9" font-size="10" text-anchor="end" font-family="var(--font-mono)">${escape(country.slice(0, 22))}</text>`;
      // bar
      svg += `<rect x="${bx}" y="${y + 4}" width="${w}" height="${rowH - 8}" fill="${fill}"/>`;
      // value
      const valStr = (isPos ? '+' : '') + row.change_tonnes.toFixed(2) + 't';
      svg += `<text x="${W - padR}" y="${y + 14}" fill="${isPos ? '#4ADE80' : '#f87171'}" font-size="10" text-anchor="end" font-weight="700" font-family="var(--font-mono)">${valStr}</text>`;
    });
    svg += '</svg>';
    return svg;
  }

  // Lightweight HTML-escape for SVG text content.
  function escape(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  /* ── Metals ────────────────────────────────────────────── */
  async function renderMetals(body) {
    body.innerHTML = `<div class="mod-loading">Loading metals…</div>`;
    try {
      const [d, cb, cot] = await Promise.all([
        fetchJSON(`${BASE}/precious-metals.json`),
        fetchJSON(`${BASE}/precious-metals-cb-snapshot.json`).catch(() => null),
        fetchJSON(`${BASE}/cot.json`).catch(() => null),
      ]);

      // ── §1 Spot prices + ratios (existing, kept) ──
      const spot = d.spot || {};
      const ratios = d.ratios || {};
      const spotRows = Object.entries(spot).map(([k, v]) => {
        if (!v || typeof v !== 'object') return '';
        return `
          <tr>
            <td class="pat">${v.name || k} <span class="ccy">${v.unit || ''}</span></td>
            <td class="mono">${fmt.num(v.value, 2)}</td>
            <td class="mono ${pnlCls(v.daily_change_pct)}">${fmt.pct(v.daily_change_pct)}</td>
            <td class="mono ${pnlCls(v.weekly_change_pct)}">${fmt.pct(v.weekly_change_pct)}</td>
            <td class="mono ${pnlCls(v.monthly_change_pct)}">${fmt.pct(v.monthly_change_pct)}</td>
            <td class="mono ${pnlCls(v.ytd_change_pct)}">${fmt.pct(v.ytd_change_pct)}</td>
            <td class="mono">${v.date || '—'}</td>
          </tr>
        `;
      }).join('');
      const ratioRows = Object.entries(ratios).map(([k, v]) => {
        if (typeof v !== 'number') return '';
        const label = k.replace(/_/g, ' / ').replace(/\b\w/g, c => c.toUpperCase());
        return `<tr><td class="pat">${label}</td><td class="mono">${fmt.num(v, 2)}</td></tr>`;
      }).join('');

      // ── §6 Gold technicals chart (close + SMA20/50/200 + RSI subpanel) ──
      const goldBars = (d.ohlc && d.ohlc.gold) || [];
      const silverBars = (d.ohlc && d.ohlc.silver) || [];
      const gdxBars = (d.ohlc && d.ohlc.gdx) || [];
      const goldChart   = buildMetalChart(goldBars,   { color: '#E5B94C' });
      const silverChart = buildMetalChart(silverBars, { color: '#C0C0C0' });
      const gdxChart    = buildMetalChart(gdxBars,    { color: '#FB923C' });

      // ── §2 Top central bank holders ──
      const topHolders = (cb && cb.top_holders) || [];
      const holderRows = topHolders.map(h => `
        <tr>
          <td class="mono">${h.rank}</td>
          <td>${escape(h.country || '—')}</td>
          <td class="mono">${fmt.num(h.tonnes, 2)}</td>
          <td class="mono">${h.pct_reserves != null ? fmt.num(h.pct_reserves, 1) + '%' : '—'}</td>
          <td class="mono">${escape(h.as_of || '—')}</td>
        </tr>
      `).join('');

      // ── §3 Net buyers / sellers (1M + 3M tabs) ──
      const flowsChart1m = cb ? buildFlowsBars(cb.buyers_1m || [], cb.sellers_1m || []) : '';
      const flowsChart3m = cb ? buildFlowsBars(cb.buyers_3m || [], cb.sellers_3m || []) : '';
      const flowList = (arr, isBuy) => (arr || []).map(r => `
        <tr>
          <td>${escape((r.country || '—').replace(/, Rep\. of$/, ''))}</td>
          <td class="mono ${isBuy ? 'num-up' : 'num-dn'}">${(isBuy ? '+' : '') + fmt.num(r.change_tonnes, 2)}t</td>
        </tr>
      `).join('');
      const buyers1mRows  = cb ? flowList(cb.buyers_1m,  true)  : '';
      const sellers1mRows = cb ? flowList(cb.sellers_1m, false) : '';
      const buyers3mRows  = cb ? flowList(cb.buyers_3m,  true)  : '';
      const sellers3mRows = cb ? flowList(cb.sellers_3m, false) : '';

      // ── §4 5-year holdings history (multi-line, top 10 by latest tonnes) ──
      // The top holders (US, Germany, IMF, France, Italy) basically don't trade
      // their reserves — their lines are visually flat. The interesting movers
      // are EM central banks (China, Russia, Poland, Türkiye, India). NORMALIZED
      // mode (overlayNorm: each series scaled to its own min-max) reveals those
      // moves clearly. ABSOLUTE mode (lineAbs: shared y-axis in tonnes) is right
      // when comparing actual sizes. Default = normalized.
      const hist = (cb && cb.history_5y) || null;
      let historyChartNorm = '', historyChartAbs = '', historyLegend = '';
      if (hist && Array.isArray(hist.countries) && Array.isArray(hist.quarters) && window.OC_CHART) {
        const colors = ['#60A5FA', '#A78BFA', '#5BB77A', '#E5B94C', '#FB923C', '#F87171', '#22D3EE', '#F472B6', '#94A3B8', '#84CC16'];
        const top10 = [...hist.countries]
          .filter(c => c.tonnes && c.tonnes.some(v => typeof v === 'number'))
          .sort((a, b) => {
            const av = (a.tonnes.filter(v => v != null).slice(-1)[0]) || 0;
            const bv = (b.tonnes.filter(v => v != null).slice(-1)[0]) || 0;
            return bv - av;
          })
          .slice(0, 10);
        const series = top10.map((c, i) => ({ name: c.country, values: c.tonnes, color: colors[i % colors.length] }));
        historyChartAbs = window.OC_CHART.lineAbs(series, {
          w: 540, h: 280,
          gridY: 4, xLabels: hist.quarters,
          yFmt: v => v >= 1000 ? (v / 1000).toFixed(1) + 'k t' : v.toFixed(0) + ' t',
        });
        historyChartNorm = window.OC_CHART.overlayNorm(series, { w: 540, h: 280, pad: 26 });
        // Legend shows per-country last value + min-max range so the absolute
        // scale stays visible even when chart is normalized.
        historyLegend = top10.map((c, i) => {
          const nums = (c.tonnes || []).filter(v => typeof v === 'number');
          const last = nums.length ? nums[nums.length - 1] : null;
          const lo = nums.length ? Math.min(...nums) : null;
          const hi = nums.length ? Math.max(...nums) : null;
          const rng = (lo != null && hi != null) ? `${lo.toFixed(0)}–${hi.toFixed(0)}t` : '';
          return `<span><span class="lg-line" style="background:${colors[i % colors.length]}"></span>${escape(c.country)} · last <b>${last != null ? last.toFixed(0) + 't' : '—'}</b> <span style="color:var(--fg-faint)">(${rng})</span></span>`;
        }).join('');
      }
      const initialHistMode = window._metHistMode || 'normalized';
      const historyChart = initialHistMode === 'absolute' ? historyChartAbs : historyChartNorm;
      const historyTitleSuffix = initialHistMode === 'absolute'
        ? 'ABSOLUTE (shared Y in tonnes — actual sizes)'
        : 'NORMALIZED (each series scaled to its own min-max — reveals EM movers)';

      // ── §5 Spotlight country (parameterized: defaults to 'turkey'; future-swappable) ──
      const SPOTLIGHT_KEY = (cb && (cb.spotlight_key || (cb.turkey ? 'turkey' : null))) || null;
      const spot_c = (cb && SPOTLIGHT_KEY && cb[SPOTLIGHT_KEY]) || null;
      const spotName = SPOTLIGHT_KEY ? SPOTLIGHT_KEY.replace(/\b\w/g, c => c.toUpperCase()) : '';
      const spotlightHtml = !spot_c ? '' : `
        <div class="mod-panel">
          <div class="mod-panel-title">SPOTLIGHT · ${escape(spotName.toUpperCase())} · rank #${spot_c.rank} · ${fmt.num(spot_c.current_tonnes, 1)}t total</div>
          ${spot_c.sovereign ? `
            <div style="margin-bottom:10px">
              <div style="font-size:11px;color:var(--fg-dim);font-weight:700;margin-bottom:4px">SOVEREIGN (excludes commercial bank gold)</div>
              <div class="kv-grid">
                <span>as of</span><span class="mono">${escape(spot_c.sovereign.as_of_month || '—')}</span>
                <span>change 1M</span><span class="mono ${pnlCls(spot_c.sovereign.change_1m_tonnes)}">${spot_c.sovereign.change_1m_tonnes >= 0 ? '+' : ''}${fmt.num(spot_c.sovereign.change_1m_tonnes, 2)}t</span>
                <span>change 3M</span><span class="mono ${pnlCls(spot_c.sovereign.change_3m_tonnes)}">${spot_c.sovereign.change_3m_tonnes >= 0 ? '+' : ''}${fmt.num(spot_c.sovereign.change_3m_tonnes, 2)}t</span>
                <span>change 12M</span><span class="mono ${pnlCls(spot_c.sovereign.change_12m_tonnes)}">${spot_c.sovereign.change_12m_tonnes >= 0 ? '+' : ''}${fmt.num(spot_c.sovereign.change_12m_tonnes, 2)}t</span>
              </div>
            </div>
          ` : ''}
          ${spot_c.gross ? `
            <div style="margin-bottom:10px">
              <div style="font-size:11px;color:var(--fg-dim);font-weight:700;margin-bottom:4px">GROSS (includes commercial bank gold under reserve-option mechanism)</div>
              <div class="kv-grid">
                <span>as of</span><span class="mono">${escape(spot_c.gross.as_of_month || '—')}</span>
                <span>change 1M</span><span class="mono ${pnlCls(spot_c.gross.change_1m_tonnes)}">${spot_c.gross.change_1m_tonnes >= 0 ? '+' : ''}${fmt.num(spot_c.gross.change_1m_tonnes, 2)}t</span>
                <span>change 3M</span><span class="mono ${pnlCls(spot_c.gross.change_3m_tonnes)}">${spot_c.gross.change_3m_tonnes >= 0 ? '+' : ''}${fmt.num(spot_c.gross.change_3m_tonnes, 2)}t</span>
                <span>change 12M</span><span class="mono ${pnlCls(spot_c.gross.change_12m_tonnes)}">${spot_c.gross.change_12m_tonnes >= 0 ? '+' : ''}${fmt.num(spot_c.gross.change_12m_tonnes, 2)}t</span>
              </div>
            </div>
          ` : ''}
          ${spot_c.explanation ? `<p style="font-size:10px;color:var(--fg-dim);line-height:1.5;margin-top:6px">${escape(spot_c.explanation)}</p>` : ''}
        </div>
      `;

      // ── §6 Gold COT history (replaces snapshot — uses full cot.json) ──
      const goldCot = cot && Array.isArray(cot.instruments) ? cot.instruments.find(i => /gold/i.test(i.name || '')) : null;
      const goldCotChart = goldCot && goldCot.history ? buildCotHistoryChart(goldCot.history) : '';
      const fmtKey = (k) => k.replace(/_/g, ' ');

      body.innerHTML = `
        <style>
          [data-mod-panel="met"] .met-flows-tabs { display:flex; gap:6px; margin-bottom:6px; }
          [data-mod-panel="met"] .met-flows-tabs button {
            background:var(--bg-card); color:var(--fg-dim); border:1px solid var(--border);
            padding:3px 10px; font-size:10px; font-family:var(--font-mono); cursor:pointer; border-radius:3px;
          }
          [data-mod-panel="met"] .met-flows-tabs button.active { background:var(--accent); color:#0d1117; border-color:var(--accent); }
          [data-mod-panel="met"] .met-flows-pane { display:none; }
          [data-mod-panel="met"] .met-flows-pane.active { display:block; }
          [data-mod-panel="met"] .met-flows-grid { display:grid; grid-template-columns: 1fr 220px 220px; gap:10px; align-items:start; }
          @media (max-width: 1100px) { [data-mod-panel="met"] .met-flows-grid { grid-template-columns: 1fr; } }
          [data-mod-panel="met"] .met-charts-3 { display:grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-top: 6px; }
          @media (max-width: 1100px) { [data-mod-panel="met"] .met-charts-3 { grid-template-columns: 1fr; } }
          [data-mod-panel="met"] .met-glossary { font-size: 10px; color: var(--fg-dim); line-height: 1.5; }
          [data-mod-panel="met"] .met-glossary b { color: var(--fg); }
          [data-mod-panel="met"] .met-glossary p { margin: 3px 0; }
          /* Bump OC_CHART axis labels inside MET — default 8px is too thin
             on narrow containers due to preserveAspectRatio="none" squishing */
          [data-mod-panel="met"] .oc-chart .oc-ylabel,
          [data-mod-panel="met"] .oc-chart .oc-xlabel { font-size: 11px; }
          [data-mod-panel="met"] .met-hist-btn {
            background:#0d1117; color:var(--fg-dim); border:1px solid #30363d;
            padding:2px 8px; font-size:9px; font-family:var(--font-mono);
            cursor:pointer; border-radius:3px; letter-spacing:0.5px;
          }
          [data-mod-panel="met"] .met-hist-btn:hover { color: var(--fg); border-color: #555; }
          [data-mod-panel="met"] .met-hist-btn.active { background:var(--accent); color:#0d1117; border-color:var(--accent); }
        </style>

        <div class="mod-head" data-mod-panel="met">
          <div class="mod-title">${window.OC_TITLE('metals')} · PRECIOUS METALS</div>
          <div class="mod-meta"><span class="chip chip-dim">${fmt.ago(d.generated_at)}</span></div>
        </div>

        <div data-mod-panel="met">

          <div class="mod-grid-2">
            <div class="mod-panel">
              <div class="mod-panel-title">SPOT PRICES</div>
              <div class="tbl-wrap"><table class="tbl-dense">
                <thead><tr><th>SYMBOL</th><th>LAST</th><th>1D</th><th>1W</th><th>1M</th><th>YTD</th><th>DATE</th></tr></thead>
                <tbody>${spotRows || '<tr><td colspan="7" class="empty">no data</td></tr>'}</tbody>
              </table></div>
            </div>
            <div class="mod-side">
              <div class="mod-panel">
                <div class="mod-panel-title">KEY RATIOS</div>
                <div class="tbl-wrap"><table class="tbl-dense">
                  <thead><tr><th>RATIO</th><th>VALUE</th></tr></thead>
                  <tbody>${ratioRows || '<tr><td colspan="2" class="empty">no data</td></tr>'}</tbody>
                </table></div>
              </div>
            </div>
          </div>

          ${(goldChart || silverChart || gdxChart) ? `
            <div class="met-charts-3">
              ${goldChart ? `
                <div class="mod-panel">
                  <div class="mod-panel-title">GOLD · last ${Math.min(180, goldBars.length)} sessions · close + SMA20/50/200 + RSI14</div>
                  <div class="chart-wrap">${goldChart}</div>
                </div>
              ` : ''}
              ${silverChart ? `
                <div class="mod-panel">
                  <div class="mod-panel-title">SILVER · last ${Math.min(180, silverBars.length)} sessions</div>
                  <div class="chart-wrap">${silverChart}</div>
                </div>
              ` : ''}
              ${gdxChart ? `
                <div class="mod-panel">
                  <div class="mod-panel-title">GDX · gold miners ETF</div>
                  <div class="chart-wrap">${gdxChart}</div>
                </div>
              ` : ''}
            </div>
          ` : ''}

          ${holderRows ? `
            <div class="mod-panel">
              <div class="mod-panel-title">TOP CENTRAL BANK GOLD HOLDERS · as of ${escape((cb && cb.data_as_of_month) || '—')} · source WGC/IMF IFS</div>
              <div class="tbl-wrap"><table class="tbl-dense">
                <thead><tr><th>RANK</th><th>COUNTRY</th><th class="num">TONNES</th><th class="num">% RESERVES</th><th>AS OF</th></tr></thead>
                <tbody>${holderRows}</tbody>
              </table></div>
            </div>
          ` : ''}

          ${(flowsChart1m || flowsChart3m) ? `
            <div class="mod-panel">
              <div class="mod-panel-title">NET BUYERS &amp; SELLERS · monthly central-bank flows</div>
              <div class="met-flows-tabs">
                <button class="active" data-tab="1m">1 MONTH · ${escape((cb && cb.period_1m) || '—')}</button>
                <button data-tab="3m">3 MONTHS · ${escape((cb && cb.period_3m) || '—')}</button>
              </div>
              <div class="met-flows-pane active" data-pane="1m">
                <div class="met-flows-grid">
                  <div class="chart-wrap">${flowsChart1m || '<div class="empty">no data</div>'}</div>
                  <div>
                    <div style="font-size:10px;color:var(--fg-dim);font-weight:700;margin-bottom:3px">BUYERS</div>
                    <div class="tbl-wrap"><table class="tbl-dense">
                      <tbody>${buyers1mRows || '<tr><td colspan="2" class="empty">none</td></tr>'}</tbody>
                    </table></div>
                  </div>
                  <div>
                    <div style="font-size:10px;color:var(--fg-dim);font-weight:700;margin-bottom:3px">SELLERS</div>
                    <div class="tbl-wrap"><table class="tbl-dense">
                      <tbody>${sellers1mRows || '<tr><td colspan="2" class="empty">none</td></tr>'}</tbody>
                    </table></div>
                  </div>
                </div>
              </div>
              <div class="met-flows-pane" data-pane="3m">
                <div class="met-flows-grid">
                  <div class="chart-wrap">${flowsChart3m || '<div class="empty">no data</div>'}</div>
                  <div>
                    <div style="font-size:10px;color:var(--fg-dim);font-weight:700;margin-bottom:3px">BUYERS</div>
                    <div class="tbl-wrap"><table class="tbl-dense">
                      <tbody>${buyers3mRows || '<tr><td colspan="2" class="empty">none</td></tr>'}</tbody>
                    </table></div>
                  </div>
                  <div>
                    <div style="font-size:10px;color:var(--fg-dim);font-weight:700;margin-bottom:3px">SELLERS</div>
                    <div class="tbl-wrap"><table class="tbl-dense">
                      <tbody>${sellers3mRows || '<tr><td colspan="2" class="empty">none</td></tr>'}</tbody>
                    </table></div>
                  </div>
                </div>
              </div>
              <div class="chart-legend"><span class="chart-note">positive bars (green) = central banks added gold reserves; negative (red) = sold. Sourced from WGC quarterly/monthly aggregations of IMF IFS data.</span></div>
            </div>
          ` : ''}

          ${historyChart ? `
            <div class="mod-panel">
              <div class="mod-panel-title" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <span>5-YEAR HOLDINGS HISTORY · top 10 by current tonnes · ${escape((hist.quarters && hist.quarters[0]) || '')} → ${escape((hist.quarters && hist.quarters[hist.quarters.length - 1]) || '')} · <span class="met-hist-suffix" style="color:var(--fg-dim);font-weight:400">${historyTitleSuffix}</span></span>
                <span style="margin-left:auto;display:inline-flex;gap:4px">
                  <button class="met-hist-btn${initialHistMode === 'normalized' ? ' active' : ''}" data-histmode="normalized">NORM</button>
                  <button class="met-hist-btn${initialHistMode === 'absolute'   ? ' active' : ''}" data-histmode="absolute">ABS</button>
                </span>
              </div>
              <div class="chart-wrap met-hist-chart-wrap">${historyChart}</div>
              <div class="chart-legend" style="display:flex;flex-wrap:wrap;gap:8px;font-size:9px">${historyLegend}</div>
            </div>
          ` : ''}

          ${spotlightHtml}

          ${goldCotChart ? `
            <div class="mod-panel">
              <div class="mod-panel-title">GOLD COT POSITIONING HISTORY · CFTC weekly · as of ${escape((cot && cot.as_of) || '—')}</div>
              <div class="chart-wrap">${goldCotChart}</div>
              <div class="chart-legend">
                <span><span class="lg-line" style="background:rgba(74,222,128,0.85)"></span>net long (positive)</span>
                <span><span class="lg-line" style="background:rgba(248,113,113,0.85)"></span>net short (negative)</span>
                <span class="chart-note">spec (left, white border) and commercial (right) bars mirror each other — futures are zero-sum. Spec extremity is the contrarian signal: crowded long often precedes squeezes; crowded short often precedes rallies.</span>
              </div>
            </div>
          ` : ''}

          <div class="mod-panel">
            <div class="mod-panel-title">HOW TO READ THIS DASHBOARD</div>
            <div class="met-glossary">
              <p><b>Spot Prices</b> — Continuous front-month futures (GC=F gold, SI=F silver, PL=F platinum, PA=F palladium) plus the major metals ETFs (GLD, SLV, GDX, GDXJ). Multi-timeframe % changes show short-term momentum vs YTD trend.</p>
              <p><b>Key Ratios</b> — Cross-asset relationships. <b>Gold/Silver</b> &gt;80 historically signals risk-off / silver undervaluation; &lt;55 = silver outperformance. <b>Gold/Oil</b> rising = gold leading inflation hedge over commodities.</p>
              <p><b>SMA20 / SMA50 / SMA200</b> — Simple moving averages over 20, 50, 200 sessions. Price above all three = uptrend; below all three = downtrend. SMA50 crossing SMA200 (golden/death cross) is the classic regime-change signal.</p>
              <p><b>RSI14</b> — Wilder's Relative Strength Index, 14-period. &gt;70 = overbought; &lt;30 = oversold. Extended periods above 70 indicate a strong uptrend (don't blindly fade).</p>
              <p><b>Top Central Bank Holders</b> — World Gold Council aggregation of IMF International Financial Statistics data. Includes IMF + central banks. <b>% reserves</b> = gold's share of total foreign reserves (high = "gold-heavy" balance sheet).</p>
              <p><b>Net Buyers &amp; Sellers</b> — Monthly changes in central-bank gold holdings. Persistent net-buying by emerging-market central banks (China, Poland, Turkey, India) since 2022 is the structural demand story under the gold rally.</p>
              <p><b>5-Year Holdings History</b> — Quarterly tonnage for top holders. Most lines are flat (US, Germany, France, Italy don't trade their reserves). Movers are EM central banks; rising lines = sustained accumulation.</p>
              <p><b>Gold COT Positioning</b> — CFTC Commitments of Traders weekly. Net spec + net comm ≈ 0 (zero-sum). Watch the spec bar: extreme long = crowded trade, often precedes corrections; extreme short = capitulation, often precedes rallies.</p>
            </div>
          </div>
        </div>
      `;

      // Wire up the 1M/3M tab switcher for net buyers/sellers
      body.querySelectorAll('.met-flows-tabs button').forEach(btn => {
        btn.addEventListener('click', () => {
          const tab = btn.dataset.tab;
          body.querySelectorAll('.met-flows-tabs button').forEach(b => b.classList.toggle('active', b === btn));
          body.querySelectorAll('.met-flows-pane').forEach(p => p.classList.toggle('active', p.dataset.pane === tab));
        });
      });

      // Wire up the NORM/ABS toggle for the 5-year holdings history chart
      body.querySelectorAll('.met-hist-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const mode = btn.dataset.histmode;
          window._metHistMode = mode;
          body.querySelectorAll('.met-hist-btn').forEach(b => b.classList.toggle('active', b === btn));
          const wrap = body.querySelector('.met-hist-chart-wrap');
          if (wrap) wrap.innerHTML = mode === 'absolute' ? historyChartAbs : historyChartNorm;
          const suf = body.querySelector('.met-hist-suffix');
          if (suf) suf.textContent = mode === 'absolute'
            ? 'ABSOLUTE (shared Y in tonnes — actual sizes)'
            : 'NORMALIZED (each series scaled to its own min-max — reveals EM movers)';
        });
      });

      // ticker click-throughs
      body.querySelectorAll('.tk.clickable').forEach(el => {
        el.addEventListener('click', () => {
          const t = el.dataset.tk;
          if (t && window.OC_OPEN_MODULE) window.OC_OPEN_MODULE('stock-analysis', { ticker: t });
        });
      });
    } catch (e) { body.innerHTML = `<div class="mod-err">${e.message}</div>`; }
  }

  window.OC_MODULES = window.OC_MODULES || {};
  window.OC_MODULES['crypto'] = { render: renderCrypto };
  window.OC_MODULES['bonds']  = { render: renderBonds };
  window.OC_MODULES['metals'] = { render: renderMetals };
})();
