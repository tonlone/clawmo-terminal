/* F11 Sentiment · F12 Recession · Valuation Map */
(function () {
  'use strict';
  const { fetchJSON, fmt } = window.OC_DATA;
  const BASE = 'https://stocks.clawmo.tech/data';

  /* Five-zone F&G color ramp used by gauge, zone bands, and comparison cells. */
  const FG_ZONES = [
    { start: 0,  end: 25,  color: '#DC2626', label: 'EXTREME', label2: 'FEAR' },
    { start: 25, end: 45,  color: '#D4776B', label: 'FEAR',    label2: '' },
    { start: 45, end: 55,  color: '#E5B94C', label: 'NEUTRAL', label2: '' },
    { start: 55, end: 75,  color: '#5BB77A', label: 'GREED',   label2: '' },
    { start: 75, end: 100, color: '#1EA87A', label: 'EXTREME', label2: 'GREED' },
  ];
  function fgColor(score) {
    if (score == null) return '#888';
    for (const z of FG_ZONES) if (score < z.end || z.end === 100 && score <= 100) return z.color;
    return '#888';
  }

  /* Semicircular SVG gauge — arc segments per zone, dark radial separators,
     tick dots, number labels, tapered needle. Ported from /sentiment.html. */
  function buildGaugeSVG(score) {
    if (score == null || !isFinite(score)) score = 0;
    const w = 300, outerR = 104, innerR = 70;
    const cx = w / 2, cy = outerR + 40, h = cy + 20;
    const scoreToAngle = (v) => Math.PI * (1 - v / 100);
    function annularSector(startPct, endPct, rIn, rOut) {
      const a1 = scoreToAngle(startPct), a2 = scoreToAngle(endPct);
      const large = (endPct - startPct) > 50 ? 1 : 0;
      const ox1 = cx + rOut * Math.cos(a1), oy1 = cy - rOut * Math.sin(a1);
      const ox2 = cx + rOut * Math.cos(a2), oy2 = cy - rOut * Math.sin(a2);
      const ix1 = cx + rIn * Math.cos(a2),  iy1 = cy - rIn * Math.sin(a2);
      const ix2 = cx + rIn * Math.cos(a1),  iy2 = cy - rIn * Math.sin(a1);
      return `M${ox1},${oy1} A${rOut},${rOut} 0 ${large} 1 ${ox2},${oy2} L${ix1},${iy1} A${rIn},${rIn} 0 ${large} 0 ${ix2},${iy2} Z`;
    }
    const activeIdx = Math.max(0, FG_ZONES.findIndex(z => score >= z.start && score < z.end));
    let svg = '';
    FG_ZONES.forEach((z, i) => {
      const isActive = (i === activeIdx);
      const fill = isActive ? z.color : '#2d333b';
      const op = isActive ? '1' : '0.85';
      svg += `<path d="${annularSector(z.start, z.end, innerR, outerR)}" fill="${fill}" opacity="${op}"/>`;
    });
    [25, 45, 55, 75].forEach(pct => {
      const a = scoreToAngle(pct);
      const x1 = cx + (innerR - 1) * Math.cos(a), y1 = cy - (innerR - 1) * Math.sin(a);
      const x2 = cx + (outerR + 1) * Math.cos(a), y2 = cy - (outerR + 1) * Math.sin(a);
      svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#0d1117" stroke-width="2.5"/>`;
    });
    const labelR = outerR + 14;
    FG_ZONES.forEach((z, i) => {
      const isActive = (i === activeIdx);
      const mid = (z.start + z.end) / 2;
      const a = scoreToAngle(mid);
      const lx = cx + labelR * Math.cos(a);
      const ly = cy - labelR * Math.sin(a);
      const lc = isActive ? '#e6edf3' : '#8b949e';
      const fw = isActive ? '700' : '600';
      if (z.label2) {
        svg += `<text x="${lx}" y="${ly - 5}" fill="${lc}" font-size="9" font-weight="${fw}" font-family="inherit" text-anchor="middle" dominant-baseline="middle">${z.label}</text>`;
        svg += `<text x="${lx}" y="${ly + 5}" fill="${lc}" font-size="9" font-weight="${fw}" font-family="inherit" text-anchor="middle" dominant-baseline="middle">${z.label2}</text>`;
      } else {
        svg += `<text x="${lx}" y="${ly}" fill="${lc}" font-size="10" font-weight="${fw}" font-family="inherit" text-anchor="middle" dominant-baseline="middle">${z.label}</text>`;
      }
    });
    for (let v = 0; v <= 100; v += 2) {
      const a = scoreToAngle(v);
      const dotR = v % 25 === 0 ? 2.3 : 0.9;
      const dx = cx + (innerR - 4) * Math.cos(a), dy = cy - (innerR - 4) * Math.sin(a);
      svg += `<circle cx="${dx}" cy="${dy}" r="${dotR}" fill="#6e7681"/>`;
    }
    for (const val of [0, 25, 50, 75, 100]) {
      const a = scoreToAngle(val);
      const nlx = cx + (innerR - 16) * Math.cos(a), nly = cy - (innerR - 16) * Math.sin(a);
      svg += `<text x="${nlx}" y="${nly}" fill="#8b949e" font-size="10" font-family="monospace" text-anchor="middle" dominant-baseline="middle">${val}</text>`;
    }
    const nAng = scoreToAngle(Math.max(0, Math.min(100, score)));
    const nLen = outerR - 6;
    const nx = cx + nLen * Math.cos(nAng), ny = cy - nLen * Math.sin(nAng);
    const perp = nAng + Math.PI / 2;
    const bw = 4.5;
    const bx1 = cx + bw * Math.cos(perp), by1 = cy - bw * Math.sin(perp);
    const bx2 = cx - bw * Math.cos(perp), by2 = cy + bw * Math.sin(perp);
    svg += `<polygon points="${bx1},${by1} ${bx2},${by2} ${nx},${ny}" fill="#c9d1d9"/>`;
    svg += `<circle cx="${cx}" cy="${cy}" r="7" fill="#c9d1d9"/><circle cx="${cx}" cy="${cy}" r="3" fill="#0d1117"/>`;
    return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;max-width:${w}px;display:block;margin:0 auto">${svg}</svg>`;
  }

  /* Zone-banded time-series chart — background bands for Extreme Fear / Fear /
     Neutral / Greed / Extreme Greed, single or double line overlay, optional
     date labels + current-value callout. Uses pure SVG; no OC_CHART dep. */
  function buildFGHistoryChart(seriesList, opts) {
    opts = opts || {};
    const W = opts.w || 820, H = opts.h || 180, padL = 32, padR = 10, padT = 8, padB = 24;
    const innerW = W - padL - padR, innerH = H - padT - padB;
    if (!seriesList.length) return '';
    const n = Math.max(...seriesList.map(s => s.values.length));
    if (n < 2) return '<div class="mod-loading">not enough history</div>';
    const sx = (i) => padL + (i / (n - 1)) * innerW;
    const sy = (v) => padT + (1 - v / 100) * innerH;
    let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:${H}px">`;
    // Zone bands (5 colored backgrounds)
    FG_ZONES.forEach(z => {
      const y1 = sy(z.end), y2 = sy(z.start);
      svg += `<rect x="${padL}" y="${y1}" width="${innerW}" height="${y2 - y1}" fill="${z.color}" opacity="0.1"/>`;
    });
    // Separator lines at 25/45/55/75
    [25, 45, 55, 75].forEach(pct => {
      svg += `<line x1="${padL}" y1="${sy(pct)}" x2="${W - padR}" y2="${sy(pct)}" stroke="#3a3f49" stroke-width="0.4" stroke-dasharray="2 3"/>`;
      svg += `<text x="${padL - 4}" y="${sy(pct) + 3}" fill="#6e7681" font-size="9" text-anchor="end" font-family="monospace">${pct}</text>`;
    });
    svg += `<text x="${padL - 4}" y="${sy(0) + 3}" fill="#6e7681" font-size="9" text-anchor="end" font-family="monospace">0</text>`;
    svg += `<text x="${padL - 4}" y="${sy(100) + 3}" fill="#6e7681" font-size="9" text-anchor="end" font-family="monospace">100</text>`;
    // Lines — skip null segments (used when a series starts later in the
    // window; see the padLeft() alignment in renderSentiment).
    seriesList.forEach(s => {
      let cmd = '';
      let needMove = true;
      s.values.forEach((v, i) => {
        if (v == null || !isFinite(v)) { needMove = true; return; }
        cmd += `${needMove ? ' M' : ' L'} ${sx(i).toFixed(1)} ${sy(v).toFixed(1)}`;
        needMove = false;
      });
      if (cmd) svg += `<path d="${cmd.trim()}" fill="none" stroke="${s.color}" stroke-width="1.4"/>`;
    });
    // Date labels
    if (opts.xLabels && opts.xLabels.length) {
      const lbls = [0, Math.floor(n / 2), n - 1];
      lbls.forEach(i => {
        const lab = opts.xLabels[i];
        if (!lab) return;
        const x = sx(i);
        const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
        svg += `<text x="${x}" y="${H - 8}" fill="#8b949e" font-size="9" text-anchor="${anchor}" font-family="monospace">${lab}</text>`;
      });
    }
    svg += '</svg>';
    return svg;
  }

  async function renderSentiment(body, ctx) {
    body.innerHTML = `<div class="mod-loading">Loading sentiment…</div>`;
    try {
      const [d, preds, div] = await Promise.all([
        fetchJSON(`${BASE}/sentiment.json`),
        fetchJSON(`${BASE}/predictions.json`).catch(() => null),
        fetchJSON(`${BASE}/polymarket-divergence.json`).catch(() => ({ pairs: [] })),
      ]);
      // Build divergence index for in-row spread pills (POL module owns the data)
      window._senDivergence = (function () {
        const idx = { bySlug: {}, byTicker: {}, threshold: (div && div.default_alert_threshold_pp) || 5 };
        (div && div.pairs || []).forEach(p => {
          if (p.spread_pp == null) return;
          idx.bySlug[p.polymarket_slug] = p;
          idx.byTicker[p.kalshi_ticker] = p;
        });
        return idx;
      })();
      const cnn = d.cnn_fear_greed || {};
      const cry = d.crypto_fear_greed || {};
      const aaii = d.aaii_sentiment || {};

      // ── Gauge card ────────────────────────────────────────
      const gaugeCard = (g) => {
        const compItems = [
          ['yesterday',  'Yesterday'],
          ['lastWeek',   'Last Week'],
          ['lastMonth',  'Last Month'],
          ['lastYear',   'Last Year'],
        ].map(([k, lbl]) => {
          const c = g.comparisons?.[k];
          if (!c) return '';
          return `<div class="sen-comp-cell">
            <div class="sen-comp-label">${lbl}</div>
            <div class="sen-comp-val" style="color:${fgColor(c.value)}">${Math.round(c.value)}</div>
            <div class="sen-comp-rating" style="color:${fgColor(c.value)}">${c.rating || '—'}</div>
          </div>`;
        }).join('');
        const scoreColor = fgColor(g.score);
        return `<div class="sen-gauge-card">
          <div class="sen-gauge-title">${g.name || '—'}</div>
          <div class="sen-gauge-source">${g.source || ''}</div>
          <div class="sen-gauge-svg">${buildGaugeSVG(g.score)}</div>
          <div class="sen-gauge-score" style="color:${scoreColor}">${g.score != null ? Math.round(g.score) : '—'} · ${g.rating || '—'}</div>
          <div class="sen-comp-grid">${compItems}</div>
        </div>`;
      };

      // ── F&G 90-day historical ─────────────────────────────
      // CNN gives us ~365 days; Crypto from alternative.me is typically only
      // the last ~30 days. Align both series to the same 90-day window by
      // padding the shorter one with leading nulls (so Crypto occupies the
      // right side of the chart, aligned with the most-recent CNN points).
      const cnnHist = (cnn.history || []).slice(-90);
      const cryHist = (cry.history || []).slice(-90);
      const alignedLen = Math.max(cnnHist.length, cryHist.length, 1);
      const padLeft = (arr, n) => Array(Math.max(0, n - arr.length)).fill(null).concat(arr);
      const cnnVals = padLeft(cnnHist.map(x => x.value), alignedLen);
      const cryVals = padLeft(cryHist.map(x => x.value), alignedLen);
      // Use CNN dates for x-axis labels since its coverage is longer; if
      // cryHist happens to be longer, fall back to that.
      const xLabelsSource = cnnHist.length >= cryHist.length ? cnnHist : cryHist;
      const xLabelsFull = padLeft(xLabelsSource.map(x => x.date ? x.date.slice(5) : ''), alignedLen);
      const fgChart = buildFGHistoryChart([
        { name: 'CNN F&G',    values: cnnVals, color: '#E5B94C' },
        { name: 'Crypto F&G', values: cryVals, color: '#60A5FA' },
      ], { xLabels: xLabelsFull });

      // ── AAII 26w triple-line + spread ─────────────────────
      const aaiiHist = (aaii.history || []).slice(-26);
      const aaiiLines = window.OC_CHART ? window.OC_CHART.lineAbs([
        { name: 'Bullish',  values: aaiiHist.map(x => x.bullish),  color: '#5BB77A' },
        { name: 'Bearish',  values: aaiiHist.map(x => x.bearish),  color: '#DC2626' },
        { name: 'Neutral',  values: aaiiHist.map(x => x.neutral),  color: '#8b949e' },
      ], {
        gridY: 3, xLabels: aaiiHist.map(x => x.date ? x.date.slice(5) : ''),
        yFmt: v => v.toFixed(0) + '%',
      }) : '';
      const aaiiSpreadChart = window.OC_CHART ? window.OC_CHART.lineAbs([
        { name: 'Spread', values: aaiiHist.map(x => x.spread), color: 'var(--accent)' },
      ], {
        gridY: 2, xLabels: aaiiHist.map(x => x.date ? x.date.slice(5) : ''),
        yFmt: v => v.toFixed(0) + '%',
      }) : '';
      const aaiiBars = `
        <div class="aaii-bars">
          <div class="aaii-row"><span>bullish</span><div class="aaii-bar"><div class="aaii-fill num-up" style="width:${(aaii.bullish ?? 0).toFixed(0)}%;background:#5BB77A"></div></div><span class="mono">${fmt.num(aaii.bullish, 1)}%</span></div>
          <div class="aaii-row"><span>bearish</span><div class="aaii-bar"><div class="aaii-fill num-dn" style="width:${(aaii.bearish ?? 0).toFixed(0)}%;background:#DC2626"></div></div><span class="mono">${fmt.num(aaii.bearish, 1)}%</span></div>
          <div class="aaii-row"><span>neutral</span><div class="aaii-bar"><div class="aaii-fill" style="width:${(aaii.neutral ?? 0).toFixed(0)}%;background:var(--fg-faint)"></div></div><span class="mono">${fmt.num(aaii.neutral, 1)}%</span></div>
          <div class="aaii-row"><span>spread</span><span></span><span class="mono ${(aaii.spread || 0) > 0 ? 'num-up' : 'num-dn'}">${fmt.pct(aaii.spread, 1)}</span></div>
        </div>
      `;

      // ── Render ─────────────────────────────────────────────
      const initialCat = (ctx && ctx.params && ctx.params.senPredCat) || 'fed';
      body.innerHTML = `
        <style>
          [data-mod-panel="sen"] .sen-gauges-row { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:6px; }
          [data-mod-panel="sen"] .sen-gauge-card { background:var(--pane-bg); border:1px solid var(--border); border-radius:3px; padding:10px 14px; }
          [data-mod-panel="sen"] .sen-gauge-title { font-size:14px; font-weight:700; color:var(--fg); text-align:center; letter-spacing:0.5px; text-transform:uppercase; }
          [data-mod-panel="sen"] .sen-gauge-source { font-size:10px; color:var(--fg-dim); text-align:center; margin-top:2px; margin-bottom:4px; }
          [data-mod-panel="sen"] .sen-gauge-svg { margin: 4px 0; }
          [data-mod-panel="sen"] .sen-gauge-score { text-align:center; font-size:15px; font-weight:700; letter-spacing:0.5px; margin-top:2px; font-family:var(--font-mono); }
          [data-mod-panel="sen"] .sen-comp-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; margin-top:10px; padding-top:8px; border-top:1px solid var(--border); }
          [data-mod-panel="sen"] .sen-comp-cell { text-align:center; }
          [data-mod-panel="sen"] .sen-comp-label { font-size:9px; color:var(--fg-dim); text-transform:uppercase; letter-spacing:0.5px; }
          [data-mod-panel="sen"] .sen-comp-val { font-size:16px; font-weight:700; font-family:var(--font-mono); margin-top:2px; }
          [data-mod-panel="sen"] .sen-comp-rating { font-size:9px; margin-top:2px; }
          [data-mod-panel="sen"] .sen-pred-btn {
            background: transparent; border: 1px solid var(--border); color: var(--fg);
            padding: 3px 10px; margin-right: 4px; border-radius: 3px; cursor: pointer;
            font-size: 11px; font-family: inherit; text-transform: uppercase; letter-spacing: 0.3px;
          }
          [data-mod-panel="sen"] .sen-pred-btn.active { background: var(--accent-bg, rgba(96,165,250,0.15)); border-color: var(--accent); color: var(--accent); }
          [data-mod-panel="sen"] .sen-pred-impact { font-size:10px; color:var(--fg-dim); margin:4px 0 8px 0; padding:4px 8px; background:rgba(96,165,250,0.06); border-left:2px solid var(--accent); }
          [data-mod-panel="sen"] .sen-pred-pol-link {
            margin-left:8px; padding:1px 8px; font-size:10px; font-weight:600;
            color:#FF6B35; text-decoration:none;
            border:1px solid rgba(255,107,53,0.55); border-radius:2px;
            font-family:var(--font-mono); letter-spacing:0.4px;
          }
          [data-mod-panel="sen"] .sen-pred-pol-link:hover {
            background:rgba(255,107,53,0.12); color:#FFB590;
          }
          /* Fixed-layout table so columns respect container width; long titles wrap */
          [data-mod-panel="sen"] .sen-pred-table { table-layout: fixed; width: 100%; }
          [data-mod-panel="sen"] .sen-pred-table tbody td { padding:4px 6px; vertical-align: top; }
          [data-mod-panel="sen"] .sen-pred-table td.sen-pred-title {
            word-break: normal; overflow-wrap: anywhere;
            white-space: normal; line-height: 1.3;
          }
          [data-mod-panel="sen"] .sen-pred-table td.sen-pred-title a { color: var(--fg); text-decoration: none; }
          [data-mod-panel="sen"] .sen-pred-table td.sen-pred-title a:hover { text-decoration: underline; color: var(--accent); }
          [data-mod-panel="sen"] .sen-pred-pct { font-weight:700; font-family:var(--font-mono); text-align:right; }
          [data-mod-panel="sen"] .sen-pred-pct.low  { color:#DC2626; }
          [data-mod-panel="sen"] .sen-pred-pct.mid  { color:#E5B94C; }
          [data-mod-panel="sen"] .sen-pred-pct.high { color:#5BB77A; }
          /* Prediction panel wants equal 50/50 columns (not the global
             .mod-grid-2 2.5:1 main+sidebar ratio). */
          [data-mod-panel="sen"] [data-pred-body] > .mod-grid-2 {
            grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          }
          [data-mod-panel="sen"] [data-pred-body] > .mod-grid-2 > div { min-width: 0; }
          /* Mobile: source toggle tabs (hidden on desktop) */
          [data-mod-panel="sen"] .sen-pred-src-tabs { display: none; }
          @media (max-width: 700px) {
            [data-mod-panel="sen"] .sen-pred-src-tabs {
              display: flex; gap: 6px; padding: 6px 0 8px 0;
            }
            [data-mod-panel="sen"] .sen-pred-src-btn {
              flex: 1; padding: 6px 0; background: transparent;
              border: 1px solid var(--border); border-radius: 2px;
              color: var(--fg-dim); font-family: var(--font-mono);
              font-size: 10px; letter-spacing: 0.1em; cursor: pointer;
            }
            [data-mod-panel="sen"] .sen-pred-src-btn.active {
              border-color: var(--accent); color: var(--fg);
              background: var(--accent-bg, rgba(96,165,250,0.15));
            }
            [data-mod-panel="sen"] [data-pred-body] > .mod-grid-2 {
              grid-template-columns: 1fr;
            }
            [data-mod-panel="sen"] [data-sen-src][data-sen-hidden] { display: none; }
            [data-mod-panel="sen"] .sen-pred-hide-mob { display: none !important; }
            [data-mod-panel="sen"] .sen-pred-table td.sen-pred-title a {
              display: -webkit-box; -webkit-line-clamp: 2;
              -webkit-box-orient: vertical; overflow: hidden;
            }
          }
        </style>

        <div class="mod-head" data-mod-panel="sen">
          <div class="mod-title">${window.OC_TITLE('sentiment')}</div>
          <div class="mod-meta"><span class="chip chip-dim">${fmt.ago(d.generated_at)}</span></div>
        </div>

        <div data-mod-panel="sen">
          <div class="sen-gauges-row">${gaugeCard(cnn)}${gaugeCard(cry)}</div>

          <div class="mod-panel">
            <div class="mod-panel-title">FEAR &amp; GREED · 90D HISTORICAL · zones shaded red→green</div>
            ${fgChart}
            <div class="chart-legend">
              <span><span class="lg-line" style="background:#E5B94C"></span>CNN (equity)</span>
              <span><span class="lg-line" style="background:#60A5FA"></span>Crypto</span>
              <span class="chart-note">red band = extreme fear (&lt;25) · green band = extreme greed (&gt;75)</span>
            </div>
          </div>

          <div class="mod-panel">
            <div class="mod-panel-title">AAII INVESTOR SENTIMENT · ${aaii.date || '—'} · weekly survey</div>
            <div class="mod-grid-2">
              <div>
                <div style="font-size:11px;color:var(--fg-dim);margin-bottom:4px">Current week (bullish / bearish / neutral / spread)</div>
                ${aaiiBars}
                ${aaii.historicalAverages ? `<div class="small" style="margin-top:8px;color:var(--fg-dim);font-size:10px">
                  Historical averages: bullish <b style="color:var(--fg)">${fmt.num(aaii.historicalAverages.bullish, 1)}%</b> · bearish <b style="color:var(--fg)">${fmt.num(aaii.historicalAverages.bearish, 1)}%</b> · neutral <b style="color:var(--fg)">${fmt.num(aaii.historicalAverages.neutral, 1)}%</b>
                </div>` : ''}
              </div>
              <div>
                <div style="font-size:11px;color:var(--fg-dim);margin-bottom:4px">26-week bullish / bearish / neutral</div>
                <div class="chart-wrap">${aaiiLines}</div>
              </div>
            </div>
            <div style="margin-top:10px">
              <div style="font-size:11px;color:var(--fg-dim);margin-bottom:4px">Bull-bear spread · 26w (contrarian — extremes mark reversals)</div>
              <div class="chart-wrap">${aaiiSpreadChart}</div>
            </div>
          </div>

          ${preds && preds.categories ? renderPredictionsPanel(preds, initialCat) : ''}
        </div>
      `;
      if (preds && preds.categories) wirePredictionsPanel(body, preds);
    } catch (e) { body.innerHTML = `<div class="mod-err">${e.message}</div>`; }
  }

  /* ── Prediction Markets panel ──────────────────────────────
     6 category tabs (fed/recession/inflation/gdp/crypto/geopolitical) × 2 source
     columns (Kalshi + Polymarket). Probabilities colored red<30 / amber 30-70 / green>70. */
  const PRED_CATEGORIES = [
    { id: 'fed',          label: 'FED & RATES' },
    { id: 'recession',    label: 'RECESSION' },
    { id: 'inflation',    label: 'INFLATION' },
    { id: 'gdp',          label: 'GDP' },
    { id: 'crypto',       label: 'CRYPTO' },
    { id: 'geopolitical', label: 'GEOPOLITICAL' },
  ];

  function predPctCls(p) {
    if (p == null || !isFinite(p)) return '';
    const v = p > 1 ? p : p * 100;  // accept 0-1 or 0-100
    if (v < 30) return 'low';
    if (v > 70) return 'high';
    return 'mid';
  }
  function predPctFmt(p) {
    if (p == null || !isFinite(p)) return '—';
    const v = p > 1 ? p : p * 100;
    return v.toFixed(0) + '%';
  }
  function fmtVolume(v) {
    if (v == null || !isFinite(v)) return '—';
    if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K';
    return '$' + v.toFixed(0);
  }
  function fmtCloseDate(s) {
    if (!s) return '—';
    try { return new Date(s).toISOString().slice(0, 10); } catch (e) { return s; }
  }

  /* Match a market row's URL to a divergence pair and emit a small Δ chip.
     Polymarket: /event/{slug} → idx.bySlug[slug]
     Kalshi:     /markets/{series}/{event_ticker} → prefix-match against full
                 market ticker (idx.byTicker keys include the strike suffix). */
  function senSpreadPill(url) {
    const idx = window._senDivergence;
    if (!idx || !url) return '';
    let pair = null;
    const polyMatch = url.match(/polymarket\.com\/event\/([^/?#]+)/);
    if (polyMatch) pair = idx.bySlug[polyMatch[1]];
    if (!pair) {
      const kalshiMatch = url.match(/kalshi\.com\/markets\/[^/]+\/([^/?#]+)/);
      if (kalshiMatch) {
        const ev = kalshiMatch[1];
        for (const t of Object.keys(idx.byTicker)) {
          if (t.startsWith(ev + '-')) { pair = idx.byTicker[t]; break; }
        }
      }
    }
    if (!pair || pair.spread_pp == null) return '';
    const sp = pair.spread_pp, t = pair.alert_threshold_pp || idx.threshold;
    const isAlert = Math.abs(sp) >= t;
    const color = isAlert ? '#f87171' : (sp >= 0 ? '#fbbf24' : '#60a5fa');
    const sign = sp >= 0 ? '+' : '';
    const tipExtra = isAlert ? ' · ABOVE alert threshold' : '';
    return ` <span style="display:inline-block;margin-left:6px;padding:0 5px;font-family:var(--font-mono);font-size:9px;font-weight:700;color:${color};border:1px solid ${color};border-radius:2px;vertical-align:1px" title="POL divergence vs paired venue: Δ ${sign}${sp.toFixed(1)}pp · threshold ${t.toFixed(0)}pp${tipExtra}">Δ ${sign}${sp.toFixed(1)}pp</span>`;
  }

  function renderPredictionsPanel(preds, initialCat) {
    const tabs = PRED_CATEGORIES.map(c => `
      <button class="sen-pred-btn${c.id === initialCat ? ' active' : ''}" data-pred-cat="${c.id}" type="button">${c.label}</button>
    `).join('');
    return `
      <div class="mod-panel" data-pred-panel>
        <div class="mod-panel-title">
          PREDICTION MARKETS · Kalshi + Polymarket · real-money odds
          <span style="margin-left:10px">${tabs}</span>
          <span class="mod-panel-sub" style="margin-left:8px;color:var(--fg-dim);font-size:10px">source: kalshi.com · polymarket.com · updated ${preds.generated_at ? fmt.ago(preds.generated_at) : ''}</span>
          <a href="?module=polymarket" class="sen-pred-pol-link" title="Open POL terminal — 15-min refresh, sparklines, Kalshi divergence alerts">POL ↗</a>
        </div>
        <div data-pred-body></div>
      </div>
    `;
  }

  function wirePredictionsPanel(body, preds) {
    const panel = body.querySelector('[data-pred-panel]');
    if (!panel) return;
    const bodyEl = panel.querySelector('[data-pred-body]');
    const btns = panel.querySelectorAll('.sen-pred-btn');
    let cat = (PRED_CATEGORIES.find(c => panel.querySelector(`.sen-pred-btn.active`)?.dataset.predCat === c.id) || PRED_CATEGORIES[0]).id;
    let srcState = 'kalshi';

    function applySrcToggle() {
      bodyEl.querySelectorAll('.sen-pred-src-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.src === srcState);
      });
      bodyEl.querySelectorAll('[data-sen-src]').forEach(div => {
        if (div.dataset.senSrc === srcState) div.removeAttribute('data-sen-hidden');
        else div.setAttribute('data-sen-hidden', '');
      });
    }

    function render() {
      btns.forEach(b => b.classList.toggle('active', b.dataset.predCat === cat));
      const blk = preds.categories[cat];
      if (!blk) {
        bodyEl.innerHTML = `<div class="mod-loading">No ${cat} markets available</div>`;
        return;
      }
      const mkTable = (rows, srcLabel) => {
        if (!rows || !rows.length) return `<div class="mod-loading small">No ${srcLabel} markets</div>`;
        const sorted = rows.slice().sort((a, b) => (b.volume_24h || 0) - (a.volume_24h || 0));
        return `
          <table class="tbl-dense sen-pred-table">
            <colgroup>
              <col style="width:auto">
              <col style="width:44px">
              <col style="width:56px">
              <col class="sen-pred-hide-mob" style="width:72px">
            </colgroup>
            <thead><tr>
              <th style="text-align:left">MARKET</th>
              <th class="num">ODDS</th>
              <th class="num">24H VOL</th>
              <th class="sen-pred-hide-mob">CLOSE</th>
            </tr></thead>
            <tbody>${sorted.map(r => `
              <tr>
                <td class="sen-pred-title"><a href="${r.url || '#'}" target="_blank" rel="noopener">${(r.title || '—').slice(0, 140)}</a>${senSpreadPill(r.url)}</td>
                <td class="sen-pred-pct ${predPctCls(r.pct)}">${predPctFmt(r.pct)}</td>
                <td class="mono">${fmtVolume(r.volume_24h)}</td>
                <td class="mono small sen-pred-hide-mob">${fmtCloseDate(r.close_time)}</td>
              </tr>`).join('')}</tbody>
          </table>
        `;
      };
      bodyEl.innerHTML = `
        <div class="sen-pred-impact">${blk.label || ''}${blk.portfolio_impact ? ' · <b>Portfolio impact:</b> ' + blk.portfolio_impact : ''}</div>
        <div class="sen-pred-src-tabs">
          <button class="sen-pred-src-btn" data-src="kalshi" type="button">KALSHI</button>
          <button class="sen-pred-src-btn" data-src="polymarket" type="button">POLYMARKET</button>
        </div>
        <div class="mod-grid-2">
          <div data-sen-src="kalshi">
            <div class="mod-panel-title" style="margin-top:4px">KALSHI (CFTC-regulated)</div>
            ${mkTable(blk.kalshi, 'Kalshi')}
          </div>
          <div data-sen-src="polymarket">
            <div class="mod-panel-title" style="margin-top:4px">POLYMARKET (crypto-settled)</div>
            ${mkTable(blk.polymarket, 'Polymarket')}
          </div>
        </div>
      `;
      applySrcToggle();
      bodyEl.querySelectorAll('.sen-pred-src-btn').forEach(btn => {
        btn.addEventListener('click', () => { srcState = btn.dataset.src; applySrcToggle(); });
      });
    }
    btns.forEach(b => b.addEventListener('click', () => {
      cat = b.dataset.predCat;
      if (window.OC_UPDATE_PANE_PARAMS) window.OC_UPDATE_PANE_PARAMS({ senPredCat: cat });
      render();
    }));
    render();
  }

  /* ── Recession dashboard ─────────────────────────────────
     Institutional-grade macro desk: regime hero + Cycle Clock scorecard
     + indicators + 3-cycle comparison (Dot-Com / GFC / COVID / Current)
     + SPX with NBER bands & step annotations + yield curve + Fed rate. */
  async function renderRecession(body) {
    body.innerHTML = `<div class="mod-loading">Loading recession dash…</div>`;
    try {
      const d = await fetchJSON(`${BASE}/recession.json`);
      const regimeCls = d.regime && /high/i.test(d.regime) ? 'num-dn'
                      : d.regime && /low/i.test(d.regime)  ? 'num-up' : 'num-warn';
      const mp = d.macroPattern || {};
      const ca = d.cycleAnalysis || {};
      const sc = ca.scorecard || {};
      const cycles = ca.cycles || [];
      const currentCycle = cycles.find(c => c.name === 'Current') || cycles[cycles.length - 1];
      const recessionBands = mp.recessionBands || [];

      const indicators = (d.indicators || []).map(i => {
        const sig = (i.signal || '').toLowerCase();
        const cls = sig === 'red' || sig.includes('warn') || sig.includes('neg') ? 'num-dn'
                  : sig === 'green' || sig.includes('pos') || sig.includes('ok') ? 'num-up'
                  : sig === 'yellow' ? 'num-warn' : '';
        const trendCls = i.trend === 'rising' ? 'num-warn' : i.trend === 'falling' ? 'num-up-soft' : '';
        return `
          <tr>
            <td class="pat">${i.shortName || i.name || '—'}</td>
            <td class="mono">${fmt.num(i.value, 2)}${i.unit && i.unit !== '%' ? ' ' + i.unit : i.unit === '%' ? '%' : ''}</td>
            <td class="${cls}">${(i.signal || '—').toUpperCase()}</td>
            <td class="${trendCls}">${i.trend || '—'}</td>
            <td class="small">${i.status || '—'}</td>
          </tr>
        `;
      }).join('');

      /* Cycle Clock — 4 KPI cards driven by cycleAnalysis.scorecard */
      const pctFromATH = parseFloat(sc.pctFromATH);
      const pctAthCls = isNaN(pctFromATH) ? '' : pctFromATH <= -20 ? 'num-dn' : pctFromATH <= -10 ? 'num-warn' : 'num-up';
      const monthsSinceUninversion = sc.monthsSinceUninversion;
      const avgLag = sc.historicalAvgRecLag;
      const lagCls = (monthsSinceUninversion != null && avgLag != null && monthsSinceUninversion > avgLag) ? 'num-dn' : 'num-warn';
      const scorecardStrip = currentCycle ? `
        <div class="acct-strip" style="grid-template-columns:repeat(4,1fr)">
          <div class="acct-card">
            <div class="acct-name">MONTHS SINCE UNINVERSION</div>
            <div class="acct-val"><span class="mono ${lagCls}">${monthsSinceUninversion != null ? monthsSinceUninversion : '—'}</span></div>
            <div class="acct-meta"><span>hist avg ${avgLag ?? '—'} · min ${sc.historicalMinRecLag ?? '—'} · max ${sc.historicalMaxRecLag ?? '—'}</span></div>
          </div>
          <div class="acct-card">
            <div class="acct-name">FED CUT DEPTH</div>
            <div class="acct-val"><span class="mono">${sc.cutDepth != null ? sc.cutDepth + '%' : '—'}</span></div>
            <div class="acct-meta"><span>peak ${sc.fedPeakRate ?? '—'}% ${sc.fedPeakDate || ''} → now ${sc.currentFedRate ?? '—'}%</span></div>
          </div>
          <div class="acct-card">
            <div class="acct-name">SPX · % FROM ATH</div>
            <div class="acct-val"><span class="mono ${pctAthCls}">${sc.pctFromATH != null ? sc.pctFromATH + '%' : '—'}</span></div>
            <div class="acct-meta"><span>${sc.currentSPX ?? '—'} vs ATH ${sc.spxATH ?? '—'} · ${sc.spxATHDate || ''}</span></div>
          </div>
          <div class="acct-card">
            <div class="acct-name">HIST CUT AT RECESSION</div>
            <div class="acct-val"><span class="mono">${sc.historicalAvgCutAtRec != null ? sc.historicalAvgCutAtRec + '%' : '—'}</span></div>
            <div class="acct-meta"><span>avg Fed cut already delivered when recession lands</span></div>
          </div>
        </div>
      ` : '';

      /* Cycle comparison — 3 past cycles + current */
      const cycleRows = [
        ['name',             'CYCLE'],
        ['inversionStart',   'INVERSION START'],
        ['inversionEnd',     'INVERSION END'],
        ['inversionDuration','DURATION (mo)'],
        ['uninversionDate',  'UNINVERSION'],
        ['fedPeakDate',      'FED PEAK DATE'],
        ['fedPeakRate',      'FED PEAK RATE (%)'],
        ['firstCutDate',     'FIRST CUT'],
        ['spxPeakDate',      'SPX PEAK DATE'],
        ['spxPeakValue',     'SPX PEAK VALUE'],
      ];
      const comparisonTable = cycles.length ? `
        <div class="mod-panel">
          <div class="mod-panel-title">CYCLE COMPARISON · 3 historical cycles vs current</div>
          <div class="tbl-wrap"><table class="tbl-dense">
            <thead><tr>
              <th>FIELD</th>${cycles.map(c => `<th class="num">${c.name.toUpperCase()}</th>`).join('')}
            </tr></thead>
            <tbody>${cycleRows.map(([k, lbl]) => `
              <tr>
                <td class="pat">${lbl}</td>
                ${cycles.map(c => {
                  const v = c[k];
                  if (k === 'name') return `<td class="mono"><b>${v || '—'}</b></td>`;
                  return `<td class="mono">${v ?? '—'}</td>`;
                }).join('')}
              </tr>
            `).join('')}</tbody>
          </table></div>
          <div class="small" style="margin-top:4pt;color:var(--fg-dim);font-size:10px;line-height:1.5">
            Standard macro framework: past cycles (Dot-Com 2000, GFC 2008, COVID 2020) anchor expectations for current uninversion →
            first-cut → recession lag. Historical average lag from yield-curve uninversion to NBER-dated recession is 6–24 months;
            if months-since-uninversion exceeds that window without recession, either the signal is wrong this time, or it arrives late.
          </div>
        </div>
      ` : '';

      /* Macro charts with recession bands + step annotations */
      const spx = (mp.spx || []).filter(x => x.value != null);
      const yc = (mp.yieldCurve || []).filter(x => x.value != null);
      const fedRate = (mp.fedRate || []).filter(x => x.value != null);

      // Per-indicator history. The data file uses long `name` fields
      // ("ICE BofA High Yield OAS") and short `shortName` ("HY OAS"). The
      // table + lookup here both use shortName for brevity.
      const indByShort = {};
      (d.indicators || []).forEach(i => { indByShort[i.shortName || i.name] = i; });
      const hyOasHist = (indByShort['HY OAS']?.history || []).filter(x => x.value != null);
      const sahmHist  = (indByShort['Sahm Rule']?.history || []).filter(x => x.value != null);

      const spxChart = buildRecessionChart(spx, {
        color: '#60A5FA',
        yFmt: v => v.toFixed(0),
        recessionBands,
        steps: currentCycleSteps(currentCycle, 'spx'),
      });
      const ycChart = buildRecessionChart(yc, {
        color: '#5BB77A',
        yFmt: v => v.toFixed(1) + '%',
        recessionBands,
        zeroLine: true,
        steps: currentCycleSteps(currentCycle, 'yc'),
      });
      const fedChart = buildRecessionChart(fedRate, {
        color: '#E5B94C',
        yFmt: v => v.toFixed(1) + '%',
        recessionBands,
        steps: currentCycleSteps(currentCycle, 'fed'),
      });
      const hyOasChart = hyOasHist.length ? buildRecessionChart(hyOasHist, {
        color: '#F87171',
        yFmt: v => v.toFixed(2) + '%',
        recessionBands,
        thresholds: [{ value: 5, label: 'stress >5%', color: '#f87171' }],
      }) : '';
      const sahmChart = sahmHist.length ? buildRecessionChart(sahmHist, {
        color: '#A78BFA',
        yFmt: v => v.toFixed(2),
        recessionBands,
        thresholds: [{ value: 0.5, label: 'trigger 0.5', color: '#fbbf24' }],
      }) : '';

      body.innerHTML = `
        <div class="mod-head">
          <div class="mod-title">${window.OC_TITLE('recession')}</div>
          <div class="mod-meta">
            <span class="chip chip-dim">${fmt.ago(d.generated_at)}</span>
          </div>
        </div>

        <div class="score-hero">
          <div class="score-big ${regimeCls}">${d.compositeScore ?? '—'}</div>
          <div class="score-lbl">
            <div class="score-regime ${regimeCls}">${d.regime || '—'}</div>
            <div class="score-sub">composite score · ${(d.indicators || []).length} indicators</div>
          </div>
        </div>

        ${scorecardStrip}

        <div class="mod-panel">
          <div class="mod-panel-title">LEADING INDICATORS · ${(d.indicators || []).length} signals</div>
          <div class="tbl-wrap"><table class="tbl-dense">
            <thead><tr><th>INDICATOR</th><th class="num">VALUE</th><th>SIGNAL</th><th>TREND</th><th>STATUS</th></tr></thead>
            <tbody>${indicators}</tbody>
          </table></div>
        </div>

        ${comparisonTable}

        ${spx.length ? `
          <div class="mod-panel">
            <div class="mod-panel-title">SPX · 30Y · recession bands + current-cycle step annotations</div>
            <div class="chart-wrap">${spxChart}</div>
            <div class="chart-legend">
              <span><span class="lg-line" style="background:#60A5FA"></span>SPX</span>
              <span><span class="lg-line" style="background:rgba(176,33,33,0.35)"></span>NBER recession</span>
              <span class="chart-note">vertical lines = inversion start/end, Fed peak, first cut (current cycle only)</span>
            </div>
          </div>

          <style>
            /* REC yield+Fed row wants equal 50/50 columns (global .mod-grid-2 is
               2.5:1 main+sidebar which leaves the Fed chart too narrow to read). */
            [data-rec-chart-row] {
              display: grid;
              grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
              gap: 10px;
            }
            [data-rec-chart-row] > .mod-panel { min-width: 0; }
            @media (max-width: 900px) {
              [data-rec-chart-row] { grid-template-columns: 1fr; }
            }
          </style>
          <div data-rec-chart-row>
            <div class="mod-panel">
              <div class="mod-panel-title">10Y–2Y YIELD CURVE · inversion = classic recession warning</div>
              <div class="chart-wrap">${ycChart}</div>
              <div class="chart-legend">
                <span><span class="lg-line" style="background:#5BB77A"></span>10Y − 2Y</span>
                <span class="chart-note">below 0 = inverted · preceded every US recession since 1955</span>
              </div>
            </div>
            <div class="mod-panel">
              <div class="mod-panel-title">FED FUNDS RATE · rate-cut cycles precede recessions</div>
              <div class="chart-wrap">${fedChart}</div>
              <div class="chart-legend">
                <span><span class="lg-line" style="background:#E5B94C"></span>Fed funds upper bound</span>
                <span class="chart-note">peak-to-cut transition marks end of tightening cycle</span>
              </div>
            </div>
          </div>

          ${(hyOasChart || sahmChart) ? `
            <div data-rec-chart-row>
              ${hyOasChart ? `
                <div class="mod-panel">
                  <div class="mod-panel-title">HY OAS · HIGH-YIELD CREDIT SPREAD · ICE BofA</div>
                  <div class="chart-wrap">${hyOasChart}</div>
                  <div class="chart-legend">
                    <span><span class="lg-line" style="background:#F87171"></span>HY OAS (%)</span>
                    <span class="chart-note">widens during stress · &gt;5% historically marks recession territory</span>
                  </div>
                </div>
              ` : ''}
              ${sahmChart ? `
                <div class="mod-panel">
                  <div class="mod-panel-title">SAHM RULE · UNEMPLOYMENT-BASED RECESSION SIGNAL</div>
                  <div class="chart-wrap">${sahmChart}</div>
                  <div class="chart-legend">
                    <span><span class="lg-line" style="background:#A78BFA"></span>Sahm Rule</span>
                    <span class="chart-note">3-mo avg unemployment vs 12-mo low · triggers at 0.5 · ≥0.5 historically = active recession</span>
                  </div>
                </div>
              ` : ''}
            </div>
          ` : ''}
        ` : ''}
      `;
    } catch (e) { body.innerHTML = `<div class="mod-err">${e.message}</div>`; }
  }

  /* Resolve step-annotation dates for the current cycle for a given chart key.
     Returns [{date, label, color}]. Chart keys: 'spx' / 'yc' / 'fed'. */
  function currentCycleSteps(cyc, chartKey) {
    if (!cyc) return [];
    const out = [];
    if (cyc.inversionStart) out.push({ date: cyc.inversionStart, label: 'INV START', color: '#F87171' });
    if (cyc.uninversionDate) out.push({ date: cyc.uninversionDate, label: 'UNINV', color: '#FBBF24' });
    if (chartKey === 'fed' && cyc.fedPeakDate) out.push({ date: cyc.fedPeakDate, label: 'FED PEAK', color: '#FBBF24' });
    if (chartKey === 'fed' && cyc.firstCutDate) out.push({ date: cyc.firstCutDate, label: 'FIRST CUT', color: '#60A5FA' });
    if (chartKey === 'spx' && cyc.spxPeakDate) out.push({ date: cyc.spxPeakDate, label: 'SPX PEAK', color: '#4ADE80' });
    return out;
  }

  /* Build a line chart with recession band overlay + step annotations.
     series: [{date: 'YYYY-MM', value: num}]. opts:
       color, yFmt, recessionBands: [{start,end}], steps: [{date,label,color}],
       zeroLine: boolean. */
  function buildRecessionChart(series, opts) {
    opts = opts || {};
    if (!series.length) return '';
    const W = opts.w || 780, H = opts.h || 200, padL = 44, padR = 12, padT = 8, padB = 24;
    const innerW = W - padL - padR, innerH = H - padT - padB;

    // Date → index map (assume series is sorted chronologically)
    const dateKey = (s) => String(s).slice(0, 7);  // YYYY-MM
    const idxByDate = {};
    series.forEach((pt, i) => { if (pt.date) idxByDate[dateKey(pt.date)] = i; });
    const firstDate = series[0].date, lastDate = series[series.length - 1].date;

    const vals = series.map(x => x.value).filter(v => v != null && isFinite(v));
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (opts.zeroLine) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    const pad = (hi - lo) * 0.06 || 1;
    lo -= pad; hi += pad;

    const n = series.length;
    const sx = (i) => padL + (i / (n - 1)) * innerW;
    const sy = (v) => padT + (1 - (v - lo) / (hi - lo)) * innerH;
    const dateToX = (dateStr) => {
      if (!dateStr) return null;
      const k = dateKey(dateStr);
      if (idxByDate[k] != null) return sx(idxByDate[k]);
      // fallback: linear interpolate by year between first and last
      const [y, m] = k.split('-').map(Number);
      const totalMonths = Math.round((n - 1));
      const firstY = firstDate.split('-').map(Number);
      const thisTotal = (y - firstY[0]) * 12 + (m - firstY[1]);
      if (thisTotal < 0 || thisTotal > totalMonths) return null;
      return sx(thisTotal);
    };

    let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:${H}px">`;

    // Recession bands (behind everything)
    (opts.recessionBands || []).forEach(rb => {
      const x1 = dateToX(rb.start);
      const x2 = dateToX(rb.end);
      if (x1 == null || x2 == null) return;
      svg += `<rect x="${Math.min(x1, x2)}" y="${padT}" width="${Math.abs(x2 - x1)}" height="${innerH}" fill="rgba(176,33,33,0.22)"/>`;
    });

    // Gridlines
    for (let g = 0; g <= 4; g++) {
      const yVal = lo + (g / 4) * (hi - lo);
      const y = sy(yVal);
      svg += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="rgba(255,255,255,0.06)" stroke-width="0.4"/>`;
      svg += `<text x="${padL - 4}" y="${y + 3}" fill="#8b949e" font-size="9" text-anchor="end" font-family="var(--font-mono)">${opts.yFmt ? opts.yFmt(yVal) : yVal.toFixed(0)}</text>`;
    }
    if (opts.zeroLine && lo < 0 && hi > 0) {
      const y0 = sy(0);
      svg += `<line x1="${padL}" y1="${y0}" x2="${W - padR}" y2="${y0}" stroke="#f87171" stroke-width="0.8" stroke-dasharray="3 3"/>`;
    }
    // Optional horizontal threshold line with label — e.g. Sahm rule 0.5
    // trigger, HY OAS stress level. opts.thresholds: [{value,label,color}]
    (opts.thresholds || []).forEach(t => {
      if (t.value == null || t.value < lo || t.value > hi) return;
      const y = sy(t.value);
      svg += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="${t.color || '#fbbf24'}" stroke-width="0.8" stroke-dasharray="4 3" opacity="0.85"/>`;
      svg += `<text x="${W - padR - 3}" y="${y - 3}" fill="${t.color || '#fbbf24'}" font-size="8" text-anchor="end" font-weight="700" font-family="var(--font-mono)">${t.label || ''}</text>`;
    });

    // Step annotations (vertical lines with labels). Labels default to the
    // right side of the line; when close to the chart's right edge we flip
    // them to the left with text-anchor:end so they don't get clipped.
    // Roughly estimate label width at 5.5px per char; bail at chart's right.
    (opts.steps || []).forEach((step, si) => {
      const x = dateToX(step.date);
      if (x == null) return;
      svg += `<line x1="${x}" y1="${padT}" x2="${x}" y2="${H - padB}" stroke="${step.color}" stroke-width="1" stroke-dasharray="2 2" opacity="0.7"/>`;
      const estWidth = (step.label || '').length * 5.5 + 6;
      const rightEdge = W - padR;
      const flipLeft = (x + estWidth) > rightEdge;
      const tx = flipLeft ? x - 3 : x + 3;
      const anchor = flipLeft ? 'end' : 'start';
      svg += `<text x="${tx}" y="${padT + 10 + (si * 10)}" fill="${step.color}" font-size="8" font-weight="600" text-anchor="${anchor}">${step.label}</text>`;
    });

    // Line
    const d = series.map((pt, i) => pt.value == null ? null : `${i === 0 ? 'M' : 'L'} ${sx(i).toFixed(1)} ${sy(pt.value).toFixed(1)}`)
      .filter(Boolean).join(' ');
    svg += `<path d="${d}" fill="none" stroke="${opts.color}" stroke-width="1.2"/>`;

    // X labels (first / middle / last year)
    [0, Math.floor(n / 2), n - 1].forEach(i => {
      const x = sx(i);
      const lab = series[i]?.date ? String(series[i].date).slice(0, 4) : '';
      const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
      svg += `<text x="${x}" y="${H - 8}" fill="#8b949e" font-size="9" text-anchor="${anchor}" font-family="var(--font-mono)">${lab}</text>`;
    });
    svg += '</svg>';
    return svg;
  }

  /* ── Valuation Map ──────────────────────────────────────
     Market-level metrics (P/E, CAPE, Earnings Yield, Dividend Yield,
     Buffett Indicator, ERP) + top-100 scatter + top-100 heatmap grid
     colored by Forward P/E + full-size historical charts with zone bands. */

  /* Zone thresholds per metric — matches /valuation-map.html reference.
     Each metric has 4 zones: cheap / fair / expensive / bubble.
     value → color class based on which zone the current reading falls in. */
  const VAL_ZONES = {
    sp500_pe:          { cheap: 15, fair: 20, expensive: 25, yFmt: v => v.toFixed(1) },
    shiller_cape:      { cheap: 17, fair: 22, expensive: 30, yFmt: v => v.toFixed(1) },
    earnings_yield:    { cheap: 7,  fair: 5,  expensive: 4,  inverse: true, yFmt: v => v.toFixed(2) + '%' },
    dividend_yield:    { cheap: 2.5, fair: 2, expensive: 1.5, inverse: true, yFmt: v => v.toFixed(2) + '%' },
    buffett_indicator: { cheap: 100, fair: 125, expensive: 150, yFmt: v => v.toFixed(0) + '%' },
  };

  function valZoneCls(key, value) {
    const z = VAL_ZONES[key];
    if (!z || value == null || !isFinite(value)) return '';
    // inverse: higher = cheaper (yield metrics)
    if (z.inverse) {
      if (value >= z.cheap) return 'num-up';
      if (value >= z.fair) return 'num-up-soft';
      if (value >= z.expensive) return 'num-warn';
      return 'num-dn';
    }
    if (value <= z.cheap) return 'num-up';
    if (value <= z.fair) return 'num-up-soft';
    if (value <= z.expensive) return 'num-warn';
    return 'num-dn';
  }

  function valZoneLabel(key, value) {
    const z = VAL_ZONES[key];
    if (!z || value == null || !isFinite(value)) return '—';
    const getLbl = (pos) => ({ 0: 'CHEAP', 1: 'FAIR', 2: 'EXPENSIVE', 3: 'BUBBLE' }[pos]);
    if (z.inverse) {
      if (value >= z.cheap) return 'CHEAP';
      if (value >= z.fair) return 'FAIR';
      if (value >= z.expensive) return 'EXPENSIVE';
      return 'BUBBLE';
    }
    if (value <= z.cheap) return 'CHEAP';
    if (value <= z.fair) return 'FAIR';
    if (value <= z.expensive) return 'EXPENSIVE';
    return 'BUBBLE';
  }

  /* Build a historical chart with colored zone bands, current line + mean line. */
  function buildValHistoryChart(key, m, opts) {
    opts = opts || {};
    const W = opts.w || 780, H = opts.h || 200, padL = 44, padR = 10, padT = 8, padB = 22;
    const innerW = W - padL - padR, innerH = H - padT - padB;
    const hist = (m.history || []).filter(x => typeof x.value === 'number');
    if (hist.length < 2) return '';
    const z = VAL_ZONES[key];
    const yFmt = z?.yFmt || (v => v.toFixed(2));
    const vals = hist.map(x => x.value);
    let lo = Math.min(...vals, m.mean ?? Infinity), hi = Math.max(...vals, m.mean ?? -Infinity);
    const pad = (hi - lo) * 0.08 || 1;
    lo -= pad; hi += pad;
    const n = hist.length;
    const sx = (i) => padL + (i / (n - 1)) * innerW;
    const sy = (v) => padT + (1 - (v - lo) / (hi - lo)) * innerH;

    let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:${H}px">`;

    // Zone bands — 4 colored rectangles at the metric's cheap/fair/expensive/bubble thresholds
    if (z) {
      const bands = z.inverse ? [
        { from: Math.max(z.cheap, hi),       to: z.cheap,     fill: '#0a7d2c', op: 0.12 },
        { from: z.cheap,    to: z.fair,      fill: '#5BB77A', op: 0.10 },
        { from: z.fair,     to: z.expensive, fill: '#E5B94C', op: 0.10 },
        { from: z.expensive, to: Math.min(z.expensive, lo), fill: '#DC2626', op: 0.12 },
      ] : [
        { from: lo,          to: z.cheap,     fill: '#0a7d2c', op: 0.12 },
        { from: z.cheap,    to: z.fair,      fill: '#5BB77A', op: 0.10 },
        { from: z.fair,     to: z.expensive, fill: '#E5B94C', op: 0.10 },
        { from: z.expensive, to: hi,         fill: '#DC2626', op: 0.12 },
      ];
      bands.forEach(b => {
        const y1 = sy(Math.min(b.from, b.to)), y2 = sy(Math.max(b.from, b.to));
        const top = Math.min(y1, y2), h = Math.abs(y2 - y1);
        if (h > 0 && top >= padT - 1 && top + h <= padT + innerH + 1) {
          svg += `<rect x="${padL}" y="${top}" width="${innerW}" height="${h}" fill="${b.fill}" opacity="${b.op}"/>`;
        }
      });
    }

    // Gridlines
    for (let g = 0; g <= 4; g++) {
      const yVal = lo + (g / 4) * (hi - lo);
      const y = sy(yVal);
      svg += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="rgba(255,255,255,0.06)" stroke-width="0.4"/>`;
      svg += `<text x="${padL - 4}" y="${y + 3}" fill="#8b949e" font-size="9" text-anchor="end" font-family="var(--font-mono)">${yFmt(yVal)}</text>`;
    }

    // Mean line (dashed)
    if (m.mean != null && isFinite(m.mean)) {
      const y = sy(m.mean);
      svg += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#E5B94C" stroke-width="0.8" stroke-dasharray="4 3"/>`;
      svg += `<text x="${W - padR - 3}" y="${y - 3}" fill="#E5B94C" font-size="9" text-anchor="end" font-family="var(--font-mono)">mean ${yFmt(m.mean)}</text>`;
    }

    // Data line
    const d = hist.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${sx(i).toFixed(1)} ${sy(pt.value).toFixed(1)}`).join(' ');
    svg += `<path d="${d}" fill="none" stroke="${opts.color || 'var(--accent)'}" stroke-width="1.3"/>`;

    // Current marker (last point)
    const lastIdx = n - 1;
    const lastY = sy(hist[lastIdx].value);
    svg += `<circle cx="${sx(lastIdx)}" cy="${lastY}" r="3" fill="${opts.color || 'var(--accent)'}"/>`;
    svg += `<text x="${sx(lastIdx) - 3}" y="${lastY - 5}" fill="${opts.color || 'var(--accent)'}" font-size="9" text-anchor="end" font-weight="700" font-family="var(--font-mono)">${yFmt(hist[lastIdx].value)}</text>`;

    // Year labels
    [0, Math.floor(n / 2), n - 1].forEach(i => {
      const lab = hist[i]?.date ? String(hist[i].date).slice(0, 4) : '';
      const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
      svg += `<text x="${sx(i)}" y="${H - 6}" fill="#8b949e" font-size="9" text-anchor="${anchor}" font-family="var(--font-mono)">${lab}</text>`;
    });
    svg += '</svg>';
    return svg;
  }

  /* Scatter plot: market cap (log x) vs forward P/E (linear y) for top-N stocks.
     Dots color-coded by P/E range. Click → open EQ. */
  function buildValScatter(stocks, opts) {
    opts = opts || {};
    if (!stocks || !stocks.length) return '';
    const W = opts.w || 780, H = opts.h || 300, padL = 48, padR = 10, padT = 16, padB = 30;
    const innerW = W - padL - padR, innerH = H - padT - padB;
    const valid = stocks.filter(s => s.marketCap > 0 && s.forwardPE != null && s.forwardPE > 0 && s.forwardPE < 200);
    if (!valid.length) return '';
    const mcLog = valid.map(s => Math.log10(s.marketCap));
    const peVals = valid.map(s => s.forwardPE);
    const xLo = Math.min(...mcLog) - 0.1, xHi = Math.max(...mcLog) + 0.1;
    const yLo = 0, yHi = Math.min(Math.max(...peVals) * 1.05, 60);
    const sx = v => padL + ((v - xLo) / (xHi - xLo)) * innerW;
    const sy = v => padT + (1 - (Math.min(v, yHi) - yLo) / (yHi - yLo)) * innerH;
    const peColor = (pe) => pe <= 15 ? '#0a7d2c' : pe <= 25 ? '#5BB77A' : pe <= 35 ? '#E5B94C' : '#DC2626';

    let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:${H}px">`;

    // Zone bands for P/E (background)
    [
      { y1: 0,  y2: 15, fill: '#0a7d2c', op: 0.08 },
      { y1: 15, y2: 25, fill: '#5BB77A', op: 0.06 },
      { y1: 25, y2: 35, fill: '#E5B94C', op: 0.06 },
      { y1: 35, y2: yHi, fill: '#DC2626', op: 0.08 },
    ].forEach(b => {
      const y1 = sy(b.y1), y2 = sy(Math.min(b.y2, yHi));
      if (Math.abs(y2 - y1) < 1) return;
      svg += `<rect x="${padL}" y="${Math.min(y1, y2)}" width="${innerW}" height="${Math.abs(y2 - y1)}" fill="${b.fill}" opacity="${b.op}"/>`;
    });

    // Y gridlines and labels
    [5, 15, 25, 35, 50].forEach(pe => {
      if (pe > yHi) return;
      svg += `<line x1="${padL}" y1="${sy(pe)}" x2="${W - padR}" y2="${sy(pe)}" stroke="rgba(255,255,255,0.06)" stroke-width="0.3"/>`;
      svg += `<text x="${padL - 4}" y="${sy(pe) + 3}" fill="#8b949e" font-size="9" text-anchor="end" font-family="var(--font-mono)">${pe}×</text>`;
    });

    // X gridlines at log levels (100B, 1T, 4T)
    const xTicks = [1e10, 1e11, 1e12, 1e13];
    xTicks.forEach(v => {
      const lx = Math.log10(v);
      if (lx < xLo || lx > xHi) return;
      svg += `<line x1="${sx(lx)}" y1="${padT}" x2="${sx(lx)}" y2="${H - padB}" stroke="rgba(255,255,255,0.04)" stroke-width="0.3"/>`;
      const label = v >= 1e12 ? '$' + (v / 1e12) + 'T' : '$' + (v / 1e9) + 'B';
      svg += `<text x="${sx(lx)}" y="${H - padB + 14}" fill="#8b949e" font-size="9" text-anchor="middle" font-family="var(--font-mono)">${label}</text>`;
    });

    // Axis labels
    svg += `<text x="${padL}" y="${padT - 4}" fill="#8b949e" font-size="9" font-family="var(--font-mono)">Fwd P/E</text>`;
    svg += `<text x="${W - padR}" y="${H - padB + 14}" fill="#8b949e" font-size="9" text-anchor="end" font-family="var(--font-mono)">Market Cap (log)</text>`;

    // Dots
    valid.forEach(s => {
      const cx = sx(Math.log10(s.marketCap)), cy = sy(s.forwardPE);
      const r = Math.max(3, Math.min(10, Math.log10(s.marketCap) - 9));
      svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${peColor(s.forwardPE)}" opacity="0.78" stroke="rgba(0,0,0,0.4)" stroke-width="0.4" data-tk="${s.ticker}"><title>${s.ticker} · ${s.name || ''} · Cap ${fmtBig(s.marketCap)} · Fwd P/E ${s.forwardPE.toFixed(1)}</title></circle>`;
      // Label mega-caps
      if (s.marketCap > 1e12) {
        svg += `<text x="${cx + r + 2}" y="${cy + 3}" fill="#e6edf3" font-size="8" font-weight="700" font-family="var(--font-mono)">${s.ticker}</text>`;
      }
    });
    svg += '</svg>';
    return svg;
  }

  function fmtBig(v) {
    if (v == null || !isFinite(v)) return '—';
    if (v >= 1e12) return '$' + (v / 1e12).toFixed(2) + 'T';
    if (v >= 1e9)  return '$' + (v / 1e9).toFixed(1) + 'B';
    if (v >= 1e6)  return '$' + (v / 1e6).toFixed(0) + 'M';
    return '$' + v.toFixed(0);
  }

  /* Heatmap grid: top-N stocks sorted by market cap (largest top-left).
     Each tile is a fixed-size square; color = forward P/E zone. */
  function buildValHeatGrid(stocks) {
    if (!stocks || !stocks.length) return '';
    const sorted = stocks.slice().filter(s => s.marketCap > 0).sort((a, b) => b.marketCap - a.marketCap).slice(0, 100);
    const peColor = (pe) => {
      if (pe == null || !isFinite(pe) || pe <= 0) return '#6e7681';
      if (pe <= 15) return '#0a7d2c';
      if (pe <= 25) return '#5BB77A';
      if (pe <= 35) return '#E5B94C';
      return '#DC2626';
    };
    const tiles = sorted.map((s, i) => {
      const bg = peColor(s.forwardPE);
      const peTxt = (s.forwardPE != null && s.forwardPE > 0) ? s.forwardPE.toFixed(1) + '×' : '—';
      return `<div class="val-heat-tile" style="background:${bg}" data-tk="${s.ticker}" title="${s.ticker} · ${(s.name || '').replace(/"/g, "'")} · Cap ${fmtBig(s.marketCap)} · Fwd P/E ${peTxt}">
        <div class="val-heat-tk">${s.ticker}</div>
        <div class="val-heat-pe">${peTxt}</div>
      </div>`;
    }).join('');
    return `<div class="val-heat-grid">${tiles}</div>`;
  }

  /* Historical timeframe offsets (months back from today). "current" means
     use the live valuation.json snapshot; anything else pulls from the
     pre-computed /data/valuation-history.json aggregator. */
  const VAL_TIMEFRAMES = [
    { id: 'current', label: 'CURRENT', months: 0 },
    { id: '1M',      label: '1M',      months: 1 },
    { id: '2M',      label: '2M',      months: 2 },
    { id: '1Q',      label: '1Q',      months: 3 },
    { id: '2Q',      label: '2Q',      months: 6 },
    { id: '1Y',      label: '1Y',      months: 12 },
    { id: '2Y',      label: '2Y',      months: 24 },
    { id: '3Y',      label: '3Y',      months: 36 },
    { id: '5Y',      label: '5Y',      months: 60 },
  ];

  /* Find the latest snapshot whose YYYY-MM ≤ target month. Returns
     { date, data } or null if no matching snapshot. */
  function findHistSnapshot(history, monthsBack) {
    if (!history || !history.snapshots) return null;
    const now = new Date();
    const tgt = new Date(now.getFullYear(), now.getMonth() - monthsBack, 28);
    const targetKey = tgt.toISOString().slice(0, 7);
    const keys = Object.keys(history.snapshots).sort().reverse();
    const match = keys.find(k => k.slice(0, 7) <= targetKey);
    return match ? { date: match, data: history.snapshots[match] } : null;
  }

  async function renderValuationMap(body, ctx) {
    body.innerHTML = `<div class="mod-loading">Loading valuation map…</div>`;
    try {
      const [mv, val, history] = await Promise.all([
        fetchJSON(`${BASE}/market_valuation.json`),
        fetchJSON(`${BASE}/valuation.json`).catch(() => null),
        fetchJSON(`${BASE}/valuation-history.json`).catch(() => null),
      ]);
      const erp = mv.equity_risk_premium || {};
      const initialIdx = (ctx && ctx.params && ctx.params.valIdx) || 'spy';
      const initialTf  = (ctx && ctx.params && ctx.params.valTf)  || 'current';

      // Market-level metric cards with zones
      const metricCard = (key, m) => {
        if (!m) return '';
        const cls = valZoneCls(key, m.current);
        const zoneLbl = valZoneLabel(key, m.current);
        const diff = (m.current != null && m.mean != null) ? ((m.current - m.mean) / m.mean) * 100 : null;
        return `
          <div class="acct-card">
            <div class="acct-name">${m.name || key}</div>
            <div class="acct-val"><span class="mono ${cls}">${fmt.num(m.current, 2)}${key.includes('yield') || key === 'buffett_indicator' ? '%' : ''}</span></div>
            <div class="acct-meta"><span class="${cls}">${zoneLbl}</span> · mean ${fmt.num(m.mean, 2)} · ${diff != null ? (diff >= 0 ? '+' : '') + diff.toFixed(1) + '%' : '—'}</div>
          </div>
        `;
      };
      const erpCls = (erp.current != null && erp.current < 1) ? 'num-dn' : erp.current != null && erp.current < 3 ? 'num-warn' : 'num-up';
      const erpCard = `
        <div class="acct-card">
          <div class="acct-name">${erp.name || 'Equity Risk Premium'}</div>
          <div class="acct-val"><span class="mono ${erpCls}">${fmt.num(erp.current, 2)}%</span></div>
          <div class="acct-meta"><span>EY ${fmt.num(erp.earnings_yield, 2)}% − 10Y ${fmt.num(erp.treasury_10y, 2)}%</span></div>
        </div>
      `;

      const indexStocks = (idx) => (val && val[idx]) || [];

      /* Build the stock list for (idx, tf). When tf === 'current' just pass
         through the live data. For historical tfs, pull from history file and
         filter to the current universe so visual stability is preserved. */
      function stocksForState(idx, tf) {
        if (tf === 'current' || !history) return { stocks: indexStocks(idx), date: null, coverage: null };
        const row = VAL_TIMEFRAMES.find(t => t.id === tf);
        const snap = row ? findHistSnapshot(history, row.months) : null;
        if (!snap) return { stocks: indexStocks(idx), date: null, coverage: null };
        const currentTk = new Set(indexStocks(idx).map(s => s.ticker));
        const currentMeta = {};
        indexStocks(idx).forEach(s => { currentMeta[s.ticker] = { name: s.name, sector: s.sector, industry: s.industry }; });
        const rows = Object.entries(snap.data)
          .filter(([tk]) => currentTk.has(tk))
          .map(([tk, r]) => ({
            ticker: tk,
            name: currentMeta[tk]?.name || tk,
            marketCap: r.mcap,
            forwardPE: r.pe,     // from history = trailing P/E; labeled accordingly in UI
            sector: r.sector || currentMeta[tk]?.sector || '',
            industry: currentMeta[tk]?.industry || '',
          }));
        return {
          stocks: rows,
          date: snap.date,
          coverage: { found: rows.length, total: currentTk.size },
        };
      }

      body.innerHTML = `
        <style>
          [data-mod-panel="val"] .acct-strip { grid-template-columns: repeat(6, 1fr); gap: 8px; }
          [data-mod-panel="val"] .val-idx-btn, [data-mod-panel="val"] .val-tf-btn {
            background: transparent; border: 1px solid var(--border); color: var(--fg);
            padding: 3px 10px; margin-right: 4px; border-radius: 3px; cursor: pointer;
            font-size: 11px; font-family: inherit; letter-spacing: 0.5px;
          }
          [data-mod-panel="val"] .val-idx-btn.active, [data-mod-panel="val"] .val-tf-btn.active {
            background: var(--accent-bg, rgba(96,165,250,0.15)); border-color: var(--accent); color: var(--accent);
          }
          [data-mod-panel="val"] .val-as-of {
            display: inline-block; margin-left: 8px; padding: 1px 7px; border-radius: 3px;
            background: rgba(229,185,76,0.12); color: #E5B94C; font-family: var(--font-mono);
            font-size: 10px; letter-spacing: 0.3px;
          }
          [data-mod-panel="val"] .val-coverage {
            color: var(--fg-dim); font-size: 10px; margin-left: 6px;
          }
          [data-mod-panel="val"] .val-heat-grid {
            display: grid; grid-template-columns: repeat(10, 1fr); gap: 3px;
            margin-top: 4px;
          }
          [data-mod-panel="val"] .val-heat-tile {
            aspect-ratio: 1.7 / 1; padding: 4px 6px; border-radius: 2px;
            display: flex; flex-direction: column; justify-content: center; align-items: center;
            cursor: pointer; color: #0a0e14; overflow: hidden;
            border: 1px solid rgba(0,0,0,0.2);
            min-height: 38px;
          }
          [data-mod-panel="val"] .val-heat-tile:hover { outline: 2px solid var(--accent); }
          [data-mod-panel="val"] .val-heat-tk { font-weight: 700; font-family: var(--font-mono); font-size: 11px; }
          [data-mod-panel="val"] .val-heat-pe { font-size: 9px; opacity: 0.82; margin-top: 1px; font-family: var(--font-mono); }
          [data-mod-panel="val"] .val-chart-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 6px; }
          [data-mod-panel="val"] .val-chart-row > .mod-panel { min-width: 0; }
          @media (max-width: 900px) { [data-mod-panel="val"] .val-chart-row { grid-template-columns: 1fr; } }
          [data-mod-panel="val"] .val-glossary { font-size: 10px; color: var(--fg-dim); line-height: 1.5; }
          [data-mod-panel="val"] .val-glossary b { color: var(--fg); }
        </style>

        <div class="mod-head" data-mod-panel="val">
          <div class="mod-title">${window.OC_TITLE('valuation-map')}</div>
          <div class="mod-meta"><span class="chip chip-dim">${fmt.ago(mv.generated_at)}</span></div>
        </div>

        <div data-mod-panel="val">
          <div class="acct-strip">
            ${metricCard('sp500_pe',          mv.sp500_pe)}
            ${metricCard('shiller_cape',      mv.shiller_cape)}
            ${metricCard('earnings_yield',    mv.earnings_yield)}
            ${metricCard('dividend_yield',    mv.dividend_yield)}
            ${metricCard('buffett_indicator', mv.buffett_indicator)}
            ${erpCard}
          </div>

          ${val ? `
            <div class="mod-panel" data-val-panel>
              <div class="mod-panel-title">
                TOP 100 · MARKET CAP vs <span data-val-pe-label>FORWARD P/E</span>
                <span data-val-asof></span>
                <span data-val-coverage class="val-coverage"></span>
                <br>
                <span style="margin-top:4px;display:inline-block">
                  <button class="val-idx-btn${initialIdx === 'spy' ? ' active' : ''}" data-val-idx="spy" type="button">SPY</button>
                  <button class="val-idx-btn${initialIdx === 'qqq' ? ' active' : ''}" data-val-idx="qqq" type="button">QQQ</button>
                  <span style="display:inline-block;width:1px;height:14px;background:var(--border);vertical-align:middle;margin:0 8px"></span>
                  ${VAL_TIMEFRAMES.map(t => `<button class="val-tf-btn${t.id === initialTf ? ' active' : ''}" data-val-tf="${t.id}" type="button"${history ? '' : (t.id !== 'current' ? ' disabled title="history file not yet seeded"' : '')}>${t.label}</button>`).join('')}
                </span>
              </div>
              <div data-val-scatter></div>
              <div class="chart-legend" style="margin-top:4px">
                <span><span class="lg-line" style="background:#0a7d2c"></span>&lt;15 cheap</span>
                <span><span class="lg-line" style="background:#5BB77A"></span>15–25 fair</span>
                <span><span class="lg-line" style="background:#E5B94C"></span>25–35 expensive</span>
                <span><span class="lg-line" style="background:#DC2626"></span>&gt;35 bubble</span>
                <span class="chart-note">dot size ~ log(market cap); hover for ticker · name · cap · P/E</span>
              </div>
            </div>

            <div class="mod-panel">
              <div class="mod-panel-title">TOP 100 · HEATMAP GRID · sorted by market cap · colored by <span data-val-pe-label-2>Forward P/E</span><span data-val-asof-2></span></div>
              <div data-val-heat></div>
              <div class="chart-legend" style="margin-top:4px">
                <span class="chart-note">largest top-left. Click tile to open EQ. Color bands same as scatter above.</span>
              </div>
            </div>
          ` : ''}

          <div class="val-chart-row">
            <div class="mod-panel">
              <div class="mod-panel-title">S&amp;P 500 P/E · 10Y HISTORY · zone bands</div>
              ${buildValHistoryChart('sp500_pe', mv.sp500_pe || {}, { color: '#60A5FA' })}
              <div class="chart-legend"><span class="chart-note">green = cheap (&lt;15) · yellow = fair · orange = expensive (&gt;20) · red = bubble (&gt;25). Dashed = historical mean (${fmt.num(mv.sp500_pe?.mean, 2)}).</span></div>
            </div>
            <div class="mod-panel">
              <div class="mod-panel-title">SHILLER CAPE · 10Y HISTORY · CYCLICALLY ADJUSTED</div>
              ${buildValHistoryChart('shiller_cape', mv.shiller_cape || {}, { color: '#A78BFA' })}
              <div class="chart-legend"><span class="chart-note">CAPE uses 10-year avg inflation-adjusted earnings to smooth cycles. mean ${fmt.num(mv.shiller_cape?.mean, 2)}; &gt;30 historically marks bubble territory.</span></div>
            </div>
          </div>

          <div class="val-chart-row">
            <div class="mod-panel">
              <div class="mod-panel-title">BUFFETT INDICATOR · MARKET CAP / GDP · 25Y HISTORY</div>
              ${buildValHistoryChart('buffett_indicator', mv.buffett_indicator || {}, { color: '#E5B94C' })}
              <div class="chart-legend"><span class="chart-note">&lt;100% undervalued · 100–150% fair · &gt;150% overvalued. Current ${fmt.num(mv.buffett_indicator?.current, 1)}%, long-run mean ${fmt.num(mv.buffett_indicator?.mean, 1)}%.</span></div>
            </div>
            <div class="mod-panel">
              <div class="mod-panel-title">EARNINGS YIELD vs DIVIDEND YIELD · 10Y</div>
              ${buildValTwoLineHistory(mv.earnings_yield || {}, mv.dividend_yield || {})}
              <div class="chart-legend">
                <span><span class="lg-line" style="background:#5BB77A"></span>Earnings Yield (inverse of P/E)</span>
                <span><span class="lg-line" style="background:#60A5FA"></span>Dividend Yield (cash payout)</span>
                <span class="chart-note">gap = retained earnings for buybacks/growth</span>
              </div>
            </div>
          </div>

          <div class="mod-panel">
            <div class="mod-panel-title">HOW TO READ THESE METRICS</div>
            <div class="val-glossary">
              <p><b>P/E Ratio</b> — Price ÷ trailing 12-month earnings. Historical mean ${fmt.num(mv.sp500_pe?.mean, 1)}. <b>Above 25</b> is expensive, <b>below 15</b> is cheap. Elevated levels reflect strong earnings expectations or low interest rates.</p>
              <p><b>Shiller CAPE</b> — Price ÷ 10-year average inflation-adjusted earnings. Smooths out business cycles. Historical mean ${fmt.num(mv.shiller_cape?.mean, 1)}. <b>Above 30</b> has only occurred during dot-com bubble and recent years.</p>
              <p><b>Buffett Indicator</b> — Total US stock market value ÷ GDP. Buffett's preferred macro-valuation gauge. <b>Below 100%</b> undervalued; <b>100–150%</b> fair; <b>above 150%</b> overvalued. Source: Federal Reserve Z.1.</p>
              <p><b>Earnings Yield</b> — Inverse of P/E (Earnings ÷ Price) expressed as %. Higher = cheaper. Useful for comparing stocks directly to bond yields. S&amp;P 500 historical mean ~${fmt.num(mv.earnings_yield?.mean, 1)}%.</p>
              <p><b>Dividend Yield</b> — Annual dividends per share ÷ price. Cash return to shareholders. Declining over time as companies shift to buybacks over direct payouts. Mean ~${fmt.num(mv.dividend_yield?.mean, 2)}%.</p>
              <p><b>Equity Risk Premium (ERP)</b> — Earnings Yield minus 10Y Treasury yield. Extra compensation stocks offer over risk-free bonds. Negative ERP = bonds yield more than stocks (historically rare; suggests stocks expensive relative to bonds).</p>
            </div>
          </div>
        </div>
      `;

      if (val) {
        const state = { idx: initialIdx, tf: initialTf };
        const panel = body.querySelector('[data-val-panel]');
        const scatterEl = body.querySelector('[data-val-scatter]');
        const heatEl    = body.querySelector('[data-val-heat]');
        const idxBtns   = panel.querySelectorAll('.val-idx-btn');
        const tfBtns    = panel.querySelectorAll('.val-tf-btn');
        const asOfEl    = body.querySelector('[data-val-asof]');
        const asOfEl2   = body.querySelector('[data-val-asof-2]');
        const coverageEl = body.querySelector('[data-val-coverage]');
        const peLabelEl  = body.querySelector('[data-val-pe-label]');
        const peLabelEl2 = body.querySelector('[data-val-pe-label-2]');

        function repaint() {
          const { stocks, date, coverage } = stocksForState(state.idx, state.tf);
          scatterEl.innerHTML = buildValScatter(stocks);
          heatEl.innerHTML    = buildValHeatGrid(stocks);
          idxBtns.forEach(b => b.classList.toggle('active', b.dataset.valIdx === state.idx));
          tfBtns.forEach(b => b.classList.toggle('active', b.dataset.valTf === state.tf));
          // Label: "Forward P/E" when current, "Trailing P/E" when historical
          const peLabel = state.tf === 'current' ? 'FORWARD P/E' : 'TRAILING P/E';
          if (peLabelEl)  peLabelEl.textContent  = peLabel;
          if (peLabelEl2) peLabelEl2.textContent = state.tf === 'current' ? 'Forward P/E' : 'Trailing P/E';
          // "as of" pill
          const asOfTxt = date ? `as of ${date}` : '';
          if (asOfEl)  asOfEl.innerHTML  = asOfTxt  ? `<span class="val-as-of">${asOfTxt}</span>` : '';
          if (asOfEl2) asOfEl2.innerHTML = asOfTxt ? ` <span class="val-as-of">${asOfTxt}</span>` : '';
          // Coverage note
          if (coverageEl) {
            coverageEl.textContent = coverage
              ? `${coverage.found} of ${coverage.total} tickers had data`
              : '';
          }
          body.querySelectorAll('.val-heat-tile, [data-val-scatter] circle[data-tk]').forEach(el => {
            el.addEventListener('click', () => {
              const tk = el.dataset.tk;
              if (tk && window.OC_OPEN_MODULE) window.OC_OPEN_MODULE('stock-analysis', { ticker: tk });
            });
          });
        }
        idxBtns.forEach(b => b.addEventListener('click', () => {
          state.idx = b.dataset.valIdx;
          if (window.OC_UPDATE_PANE_PARAMS) window.OC_UPDATE_PANE_PARAMS({ valIdx: state.idx });
          repaint();
        }));
        tfBtns.forEach(b => b.addEventListener('click', () => {
          if (b.hasAttribute('disabled')) return;
          state.tf = b.dataset.valTf;
          if (window.OC_UPDATE_PANE_PARAMS) window.OC_UPDATE_PANE_PARAMS({ valTf: state.tf });
          repaint();
        }));
        repaint();
      }
    } catch (e) { body.innerHTML = `<div class="mod-err">${e.message}</div>`; }
  }

  function buildValTwoLineHistory(m1, m2) {
    const W = 780, H = 200, padL = 44, padR = 10, padT = 10, padB = 22;
    const innerW = W - padL - padR, innerH = H - padT - padB;
    const h1 = (m1.history || []).filter(x => typeof x.value === 'number');
    const h2 = (m2.history || []).filter(x => typeof x.value === 'number');
    if (!h1.length && !h2.length) return '';
    const vals = [...h1.map(x => x.value), ...h2.map(x => x.value)];
    let lo = Math.min(...vals), hi = Math.max(...vals);
    const pad = (hi - lo) * 0.08 || 1;
    lo -= pad; hi += pad;
    const n = Math.max(h1.length, h2.length);
    const sx = (i, arr) => padL + (i / (arr.length - 1)) * innerW;
    const sy = (v) => padT + (1 - (v - lo) / (hi - lo)) * innerH;
    let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:${H}px">`;
    for (let g = 0; g <= 4; g++) {
      const yVal = lo + (g / 4) * (hi - lo);
      const y = sy(yVal);
      svg += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="rgba(255,255,255,0.05)" stroke-width="0.3"/>`;
      svg += `<text x="${padL - 4}" y="${y + 3}" fill="#8b949e" font-size="9" text-anchor="end" font-family="var(--font-mono)">${yVal.toFixed(1)}%</text>`;
    }
    const drawLine = (hist, color) => {
      if (hist.length < 2) return '';
      const d = hist.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${sx(i, hist).toFixed(1)} ${sy(pt.value).toFixed(1)}`).join(' ');
      return `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.3"/>`;
    };
    svg += drawLine(h1, '#5BB77A');
    svg += drawLine(h2, '#60A5FA');
    const baseHist = h1.length > h2.length ? h1 : h2;
    [0, Math.floor(baseHist.length / 2), baseHist.length - 1].forEach(i => {
      const lab = baseHist[i]?.date ? String(baseHist[i].date).slice(0, 4) : '';
      const anchor = i === 0 ? 'start' : i === baseHist.length - 1 ? 'end' : 'middle';
      svg += `<text x="${sx(i, baseHist)}" y="${H - 6}" fill="#8b949e" font-size="9" text-anchor="${anchor}" font-family="var(--font-mono)">${lab}</text>`;
    });
    svg += '</svg>';
    return svg;
  }

  window.OC_MODULES = window.OC_MODULES || {};
  window.OC_MODULES['sentiment']     = { render: renderSentiment };
  window.OC_MODULES['recession']     = { render: renderRecession };
  window.OC_MODULES['valuation-map'] = { render: renderValuationMap };
})();
