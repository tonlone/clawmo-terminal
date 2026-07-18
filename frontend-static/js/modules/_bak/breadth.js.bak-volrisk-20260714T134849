/* F3 Breadth — MA50/100/200 breadth + sectors heatmap + industry movers */
(function () {
  'use strict';
  const { fetchJSON, fmt } = window.OC_DATA;

  const BREADTH_URL = 'https://stocks.clawmo.tech/data/breadth.json';
  const INDUSTRY_URL = 'https://stocks.clawmo.tech/data/industry_performance.json';
  const MONITOR_URL = 'https://stocks.clawmo.tech/data/monitor.json';
  const ROTATION_URL = 'https://stocks.clawmo.tech/data/rotation.json';

  // Per-pane state for industry filter + historical heatmap range.
  // Stored on body element so sort clicks don't leak across modules.
  const HIST_RANGES = { '1M': 22, '3M': 63, '6M': 126, '1Y': 252 };
  const IND_COLS = [
    { key: 'label',   label: 'INDUSTRY',  type: 'str' },
    { key: 'perfT',   label: '1D',        type: 'num' },
    { key: 'perfW',   label: '1W',        type: 'num' },
    { key: 'perfM',   label: '1M',        type: 'num' },
    { key: 'perfQ',   label: '3M',        type: 'num' },
    { key: 'perfH',   label: '6M',        type: 'num' },
    { key: 'perfYtd', label: 'YTD',       type: 'num' },
    { key: 'perfY',   label: '1Y',        type: 'num' },
  ];
  // Stockbee T2108 regime classifier (contrarian bands).
  function t2108Label(v) {
    if (v == null || !isFinite(v)) return { cls: '', text: '—', hint: 'no reading' };
    if (v >= 80) return { cls: 'num-dn',   text: 'OVERBOUGHT', hint: 'pullback risk' };
    if (v >= 60) return { cls: 'num-up',   text: 'STRONG',     hint: 'healthy participation' };
    if (v >= 40) return { cls: 'num-warn', text: 'NEUTRAL',    hint: '' };
    if (v >= 20) return { cls: 'num-warn', text: 'WEAK',       hint: 'participation fading' };
    return             { cls: 'num-up',   text: 'OVERSOLD',   hint: 'bounce setup' };
  }
  function ratio5dLabel(v) {
    if (v == null || !isFinite(v)) return { cls: '', text: '—' };
    if (v >= 1.5)  return { cls: 'num-up', text: 'UP THRUST' };
    if (v >= 1.0)  return { cls: 'num-up-soft', text: 'MILD UP' };
    if (v >= 0.67) return { cls: 'num-warn', text: 'BALANCED' };
    if (v >= 0.4)  return { cls: 'num-dn-soft', text: 'MILD DN' };
    return             { cls: 'num-dn', text: 'DN THRUST' };
  }

  // 0-100 breadth score → token-based color class
  function breadthCls(v) {
    if (v == null || isNaN(v)) return '';
    if (v >= 80) return 'bh-5';
    if (v >= 60) return 'bh-4';
    if (v >= 40) return 'bh-3';
    if (v >= 20) return 'bh-2';
    return 'bh-1';
  }

  // % return → token-based color
  function perfCls(v) {
    if (v == null || isNaN(v)) return '';
    if (v >= 5)  return 'num-up';
    if (v > 0)   return 'num-up-soft';
    if (v <= -5) return 'num-dn';
    if (v < 0)   return 'num-dn-soft';
    return '';
  }

  function latestForMA(data, ma) {
    const arr = data[String(ma)] || [];
    return arr[0] || {};
  }

  /* Market-regime hero: composite score + EW-CW zone + divergence.
     Replaces the implicit framing where score was buried in the matrix
     and divergence was only visible via chart tooltip. */
  function renderBrdMarketState(latest) {
    const regime = latest.regime || 'Neutral';
    const regimeLc = String(regime).toLowerCase();
    const klass = regimeLc === 'bull' ? 'brd-state-bull'
                : regimeLc === 'risk-off' ? 'brd-state-risk-off'
                : 'brd-state-neutral';
    const score = latest.breadth_score;
    const scoreCls = score == null ? ''
                   : score >= 65 ? 'num-up'
                   : score >= 40 ? 'num-warn'
                   : 'num-dn';

    const ewcw = latest.ew_cw_spread;
    const ewcw20 = latest.ew_cw_spread_20d;
    const ewcwSign = (ewcw != null && ewcw >= 0) ? '+' : '';
    const ewcw20Sign = (ewcw20 != null && ewcw20 >= 0) ? '+' : '';
    const ewcwCls = ewcw == null ? '' : ewcw >= 0 ? 'num-up' : 'num-dn';
    const ewcw20Cls = ewcw20 == null ? '' : ewcw20 >= 0 ? 'num-up' : 'num-dn';

    let zone = null;
    if (ewcw20 != null) {
      if (ewcw20 < -2)      zone = { label: 'ABNORMAL', cls: 'brd-zone-abnormal', note: 'narrow · Mag7 driven' };
      else if (ewcw20 < 0)  zone = { label: 'CAUTION',  cls: 'brd-zone-caution',  note: 'slightly narrow' };
      else if (ewcw20 > 2)  zone = { label: 'HEALTHY',  cls: 'brd-zone-healthy',  note: 'broad-based' };
      else                  zone = { label: 'NORMAL',   cls: 'brd-zone-normal',   note: 'normal range' };
    }

    const div = latest.divergence;
    let divPill = '';
    if (div === 'bearish') divPill = `<span class="chip brd-zone-abnormal">BEAR DIVERGENCE · price up, breadth weakening</span>`;
    else if (div === 'bullish') divPill = `<span class="chip brd-zone-healthy">BULL DIVERGENCE · price down, breadth improving</span>`;

    return `
      <div class="brd-state-hero ${klass}">
        <div class="brd-state-headline">
          <span class="brd-state-tag">MARKET REGIME · ${String(regime).toUpperCase()}</span>
          <span class="brd-state-score mono ${scoreCls}">${score != null ? score : '—'} <span class="brd-state-score-unit">/ 100</span></span>
        </div>
        <div class="brd-state-stats">
          ${ewcw != null ? `<span class="chip">EW-CW <span class="mono ${ewcwCls}">${ewcwSign}${ewcw.toFixed(2)}%</span></span>` : ''}
          ${ewcw20 != null ? `<span class="chip">20D <span class="mono ${ewcw20Cls}">${ewcw20Sign}${ewcw20.toFixed(1)}%</span></span>` : ''}
          ${zone ? `<span class="chip ${zone.cls}">${zone.label} · ${zone.note}</span>` : ''}
          ${divPill}
        </div>
        <div class="brd-state-narrative">Composite of SP500 above SMA50 (40%) + above SMA200 (30%) + sector participation % above 50% (20%) + EW-CW spread direction (10%). Bull ≥ 65 · Neutral 40-64 · Risk-Off &lt; 40.</div>
      </div>
    `;
  }

  /* Two-line overlay chart: SPY cumulative (rebased to 100) + SP500 breadth score (0-100).
     Divergence between them is the classic early-warning signal. */
  function overlayChart(history, opts) {
    const W = opts?.w || 780, H = opts?.h || 160, pad = 22;
    if (!history || history.length < 3) return { html: '', meta: null };
    const oldest = history[0];
    // SPY cumulative rebased to 100
    let px = 100;
    const spyLine = history.map(d => {
      px *= (1 + (d.spy_change || 0) / 100);
      return px;
    });
    const breadthLine = history.map(d => d.sp500_breadth);
    const qqqBreadthLine = history.map(d => d.qqq_breadth);
    // Use own min/max for SPY, normalize into shared 0-100 chart space.
    // Breadth and qqqBreadth are already in 0-100.
    const spyMin = Math.min(...spyLine), spyMax = Math.max(...spyLine);
    const spySpan = spyMax - spyMin || 1;
    const normSpy = spyLine.map(v => ((v - spyMin) / spySpan) * 100);

    const sx = (i) => pad + (i / (history.length - 1)) * (W - 2 * pad);
    const sy = (v) => pad + (1 - v / 100) * (H - 2 * pad);
    const path = (arr) => arr.map((v, i) => `${i === 0 ? 'M' : 'L'} ${sx(i).toFixed(1)} ${sy(v).toFixed(1)}`).join(' ');

    // Reference lines at 50 and 80 (breadth thresholds)
    const ref = (v, label) => `
      <line class="ch-ref" x1="${pad}" y1="${sy(v)}" x2="${W-pad}" y2="${sy(v)}"></line>
      <text class="ch-ref-label" x="${W - pad + 3}" y="${sy(v) + 3}">${label}</text>
    `;

    // Date labels (oldest + latest)
    const firstDate = oldest.date ? oldest.date.slice(5) : '';
    const lastDate = history[history.length - 1].date ? history[history.length - 1].date.slice(5) : '';

    const html = `
      <svg class="breadth-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
        ${ref(50, '50')}
        ${ref(80, '80')}
        <path class="ch-qqq" d="${path(qqqBreadthLine)}"></path>
        <path class="ch-breadth" d="${path(breadthLine)}"></path>
        <path class="ch-spy" d="${path(normSpy)}"></path>
        <text class="ch-date" x="${pad}" y="${H - 4}">${firstDate}</text>
        <text class="ch-date" x="${W - pad}" y="${H - 4}" text-anchor="end">${lastDate}</text>
        <line class="brd-cross-x" x1="0" y1="${pad}" x2="0" y2="${H - pad}" style="stroke:var(--fg);stroke-width:0.5;opacity:0;pointer-events:none;stroke-dasharray:2 2"></line>
        <circle class="brd-cross-dot brd-cross-dot-spy"     cx="0" cy="0" r="3" style="fill:var(--pnl-up);stroke:var(--fg);stroke-width:0.6;opacity:0;pointer-events:none"></circle>
        <circle class="brd-cross-dot brd-cross-dot-breadth" cx="0" cy="0" r="3" style="fill:var(--accent);stroke:var(--fg);stroke-width:0.6;opacity:0;pointer-events:none"></circle>
        <circle class="brd-cross-dot brd-cross-dot-qqq"     cx="0" cy="0" r="3" style="fill:#A78BFA;stroke:var(--fg);stroke-width:0.6;opacity:0;pointer-events:none"></circle>
        <rect class="brd-cross-hit" x="${pad}" y="${pad}" width="${W - 2 * pad}" height="${H - 2 * pad}" style="fill:transparent;cursor:crosshair"></rect>
      </svg>
    `;
    return {
      html,
      meta: {
        W, H, pad,
        n: history.length,
        dates: history.map(d => d.date),
        spyLine, breadthLine, qqqBreadthLine, normSpy,
      },
    };
  }

  /* Crosshair + tooltip for the BREADTH vs PRICE chart.
     Snaps to the nearest day; drops a dot on each of the 3 series at that day;
     tooltip shows Date · SPY cum · SP500 breadth % · QQQ breadth % + a
     divergence pill when breadth and price are moving opposite ways. */
  function attachBreadthCrosshair(svg, tooltip, meta) {
    if (!svg || !meta) return;
    const xLine = svg.querySelector('.brd-cross-x');
    const dotSpy = svg.querySelector('.brd-cross-dot-spy');
    const dotBrd = svg.querySelector('.brd-cross-dot-breadth');
    const dotQqq = svg.querySelector('.brd-cross-dot-qqq');
    const hit = svg.querySelector('.brd-cross-hit');
    if (!xLine || !hit) return;
    const { W, H, pad, n, dates, spyLine, breadthLine, qqqBreadthLine, normSpy } = meta;
    const plotW = W - 2 * pad;
    const sx = (i) => pad + (i / (n - 1)) * plotW;
    const sy = (v) => pad + (1 - v / 100) * (H - 2 * pad);  // v in 0-100

    function onMove(ev) {
      const pt = svg.createSVGPoint();
      pt.x = ev.clientX; pt.y = ev.clientY;
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const loc = pt.matrixTransform(ctm.inverse());
      let i = Math.round(((loc.x - pad) / plotW) * (n - 1));
      if (i < 0) i = 0;
      if (i > n - 1) i = n - 1;
      const x = sx(i);

      xLine.setAttribute('x1', x.toFixed(2));
      xLine.setAttribute('x2', x.toFixed(2));
      xLine.style.opacity = '0.55';
      if (dotSpy) { dotSpy.setAttribute('cx', x.toFixed(2)); dotSpy.setAttribute('cy', sy(normSpy[i]).toFixed(2)); dotSpy.style.opacity = '1'; }
      if (dotBrd) { dotBrd.setAttribute('cx', x.toFixed(2)); dotBrd.setAttribute('cy', sy(breadthLine[i]).toFixed(2)); dotBrd.style.opacity = '1'; }
      if (dotQqq) { dotQqq.setAttribute('cx', x.toFixed(2)); dotQqq.setAttribute('cy', sy(qqqBreadthLine[i]).toFixed(2)); dotQqq.style.opacity = '1'; }

      const spyCum = spyLine[i];
      const spyPctVs100 = (spyCum - 100);  // 0 = flat since start; +5 = +5% since start
      const brd = breadthLine[i];
      const qqq = qqqBreadthLine[i];

      // Divergence signal: compare last 10 days of SPY direction vs breadth
      let divergence = null;
      if (i >= 10) {
        const spyChg = spyLine[i] - spyLine[i - 10];
        const brdChg = breadthLine[i] - breadthLine[i - 10];
        if (spyChg > 0.5 && brdChg < -5) divergence = { cls: 'num-dn', txt: 'BEAR DIV · price up, breadth weakening' };
        else if (spyChg < -0.5 && brdChg > 5) divergence = { cls: 'num-up', txt: 'BULL DIV · price down, breadth improving' };
      }

      const spyCls = spyPctVs100 > 0 ? 'num-up' : spyPctVs100 < 0 ? 'num-dn' : '';
      tooltip.innerHTML = `
        <div class="stk-tt-row"><span class="stk-tt-k">DATE</span><span class="stk-tt-v mono">${dates[i] || '—'}</span></div>
        <div class="stk-tt-row"><span class="stk-tt-k">SPY cum</span><span class="stk-tt-v mono ${spyCls}">${(spyPctVs100 >= 0 ? '+' : '') + spyPctVs100.toFixed(2)}%</span></div>
        <div class="stk-tt-row"><span class="stk-tt-k">SP500 brd</span><span class="stk-tt-v mono">${typeof brd === 'number' ? brd.toFixed(1) + '%' : '—'}</span></div>
        <div class="stk-tt-row"><span class="stk-tt-k">QQQ brd</span><span class="stk-tt-v mono">${typeof qqq === 'number' ? qqq.toFixed(1) + '%' : '—'}</span></div>
        ${divergence ? `<div class="stk-tt-row"><span class="stk-tt-k">SIGNAL</span><span class="stk-tt-v mono ${divergence.cls}" style="font-size:9px">${divergence.txt}</span></div>` : ''}
      `;
      tooltip.style.opacity = '1';
    }
    function onLeave() {
      xLine.style.opacity = '0';
      [dotSpy, dotBrd, dotQqq].forEach(d => d && (d.style.opacity = '0'));
      tooltip.style.opacity = '0';
    }
    hit.addEventListener('mousemove', onMove);
    hit.addEventListener('mouseleave', onLeave);
  }

  /* Bipolar mini-sparkline for QQQ−SPY gap series (positive blue / negative green).
     Series is oldest → newest. */
  function gapSparkline(series, opts) {
    const W = opts?.w || 100, H = opts?.h || 22;
    const pts = (series || []).map(v => (typeof v === 'number' && isFinite(v)) ? v : null);
    const valid = pts.filter(v => v != null);
    if (valid.length < 2) return '';
    const absMax = Math.max(8, ...valid.map(Math.abs));
    const xStep = pts.length > 1 ? W / (pts.length - 1) : 0;
    const yMid = H / 2;
    const yScale = (v) => yMid - (v / absMax) * (H / 2 - 1);
    let path = '';
    pts.forEach((v, i) => {
      if (v == null) return;
      const x = i * xStep;
      const y = yScale(v);
      path += (path ? ' L' : 'M') + x.toFixed(1) + ',' + y.toFixed(1);
    });
    const last = pts[pts.length - 1];
    const color = last == null ? '#8b949e' : (last > 0 ? '#60a5fa' : (last < 0 ? '#4ade80' : '#8b949e'));
    return `
      <svg class="gap-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:${H}px;display:block">
        <line x1="0" y1="${yMid}" x2="${W}" y2="${yMid}" stroke="rgba(139,148,158,0.4)" stroke-width="0.5" stroke-dasharray="2,2"/>
        <path d="${path}" fill="none" stroke="${color}" stroke-width="1.4" stroke-linejoin="round"/>
      </svg>`;
  }

  /* Classify the rotation regime for a single day given SPY and QQQ breadth. */
  function classifyRotation(spy, qqq) {
    if (spy == null || qqq == null) return { reg: 'na', label: '—', cls: '' };
    if (spy < 30 && qqq < 30) return { reg: 'riskoff', label: 'RISK-OFF',     cls: 'num-dn' };
    const gap = qqq - spy;
    if (gap > 5)  return { reg: 'tech',    label: 'TECH LEADING',   cls: 'num-up' };
    if (gap < -5) return { reg: 'broad',   label: 'BROAD LEADING',  cls: 'num-up-soft' };
    return            { reg: 'aligned', label: 'ALIGNED',        cls: '' };
  }

  /* GICS sector → group classifier shared with leaders/laggards panel. */
  const BRD_SECTOR_GROUP = {
    'Information Technology': 'tech',
    'Communication Services': 'tech',
    'Consumer Discretionary': 'tech',
    'Consumer Staples': 'defensive',
    'Utilities': 'defensive',
    'Health Care': 'defensive',
    'Real Estate': 'defensive',
    'Energy': 'cyclical',
    'Financials': 'cyclical',
    'Industrials': 'cyclical',
    'Materials': 'cyclical'
  };
  const BRD_GROUP_LABEL = { tech: 'Tech / Growth', defensive: 'Defensive', cyclical: 'Cyclical / Value' };
  const BRD_GROUP_TAG = { tech: 'TECH', defensive: 'DEF', cyclical: 'CYC' };

  /* Mini sparkline for a sector's breadth score over N days. */
  function sectorSparkline(series, opts) {
    const W = opts?.w || 80, H = opts?.h || 18;
    if (!series || series.length < 2) return '';
    const pts = series.filter(v => typeof v === 'number');
    if (pts.length < 2) return '';
    const min = 0, max = 100;  // fixed scale for cross-sector comparability
    const sx = (i) => (i / (pts.length - 1)) * W;
    const sy = (v) => (1 - (v - min) / (max - min)) * H;
    const path = pts.map((v, i) => `${i === 0 ? 'M' : 'L'} ${sx(i).toFixed(1)} ${sy(v).toFixed(1)}`).join(' ');
    const first = pts[0], last = pts[pts.length - 1];
    const cls = last >= 60 ? 'spark-up' : last <= 40 ? 'spark-dn' : 'spark-mid';
    return `
      <svg class="sector-spark ${cls}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
        <path d="${path}"></path>
      </svg>
    `;
  }

  async function render(body) {
    body.innerHTML = `<div class="mod-loading">Loading market breadth…</div>`;
    try {
      const [br, ind, mon, rot] = await Promise.all([
        fetchJSON(BREADTH_URL),
        fetchJSON(INDUSTRY_URL),
        fetchJSON(MONITOR_URL).catch(() => null),
        fetchJSON(ROTATION_URL).catch(() => null),
      ]);

      const periods = br.ma_periods || [50, 100, 200];
      const data = br.data || {};
      const latest50  = latestForMA(data, 50);
      const latest100 = latestForMA(data, 100);
      const latest200 = latestForMA(data, 200);
      const latestDate = latest50.date || '—';
      const regime = latest50.regime || '—';

      // Historical series for overlay chart (oldest → newest, 90d)
      const series = (data['50'] || []).slice(0, 90).slice().reverse();
      const ewcw = latest50.ew_cw_spread;
      const ewcw20 = latest50.ew_cw_spread_20d;
      const ewcwCls = ewcw >= 0 ? 'num-up' : 'num-dn';

      // Headline scores matrix: rows = SP500, QQQ, Score ; cols = 50/100/200
      const rows = [
        { lbl: 'SP500',   vals: [latest50.sp500_breadth, latest100.sp500_breadth, latest200.sp500_breadth] },
        { lbl: 'QQQ',     vals: [latest50.qqq_breadth,   latest100.qqq_breadth,   latest200.qqq_breadth] },
        { lbl: 'SCORE',   vals: [latest50.breadth_score, latest100.breadth_score, latest200.breadth_score] },
      ];
      const headlineRows = rows.map(r => `
        <tr>
          <td class="lbl">${r.lbl}</td>
          ${r.vals.map(v => `<td class="cell ${breadthCls(v)}">${v != null ? v : '—'}</td>`).join('')}
        </tr>
      `).join('');

      // Sectors heatmap: union sector set across 3 MAs (source data has same 11)
      const sectorSet = new Set();
      [latest50.sectors, latest100.sectors, latest200.sectors].forEach(s => {
        if (s) Object.keys(s).forEach(k => sectorSet.add(k));
      });
      const sectors = Array.from(sectorSet).sort();
      // Build 20-day history per sector from data['50']
      const sectorHistory = {};
      sectors.forEach(s => {
        sectorHistory[s] = (data['50'] || [])
          .slice(0, 20)
          .slice().reverse()
          .map(d => d.sectors?.[s])
          .filter(v => typeof v === 'number');
      });
      const sectorRows = sectors.map(s => `
        <tr>
          <td class="lbl">${s}</td>
          <td class="cell ${breadthCls(latest50.sectors?.[s])}">${latest50.sectors?.[s] ?? '—'}</td>
          <td class="cell ${breadthCls(latest100.sectors?.[s])}">${latest100.sectors?.[s] ?? '—'}</td>
          <td class="cell ${breadthCls(latest200.sectors?.[s])}">${latest200.sectors?.[s] ?? '—'}</td>
          <td class="spark-cell">${sectorSparkline(sectorHistory[s])}</td>
        </tr>
      `).join('');

      // Recent 10 days trend
      const recent = (data[String(periods[0])] || []).slice(0, 10);
      const trendRows = recent.map(d => `
        <tr>
          <td class="mono">${d.date ? d.date.slice(5) : '—'}</td>
          <td class="mono ${perfCls(d.spy_change)}">${fmt.pct(d.spy_change)}</td>
          <td class="mono ${perfCls(d.qqq_change)}">${fmt.pct(d.qqq_change)}</td>
          <td class="cell ${breadthCls(d.sp500_breadth)}">${d.sp500_breadth ?? '—'}</td>
          <td class="cell ${breadthCls(d.qqq_breadth)}">${d.qqq_breadth ?? '—'}</td>
        </tr>
      `).join('');

      const industries = (ind && ind.industries) || [];
      const chartResult = overlayChart(series);
      const spyToday = latest50.spy_change;
      const qqqToday = latest50.qqq_change;
      const sectorVals = Object.values(latest50.sectors || {}).filter(v => v != null);
      const sectorsAbove = sectorVals.filter(v => v >= 50).length;
      const sectorsTotal = sectorVals.length;
      const sectorsBelow = sectorsTotal - sectorsAbove;

      body.innerHTML = `
        <div class="mod-head">
          <div class="mod-title">${window.OC_TITLE('breadth')}</div>
          <div class="mod-meta">
            <span class="chip">LATEST · ${latestDate}</span>
            <span class="chip chip-dim">${fmt.ago(br.generated_at)}</span>
          </div>
        </div>

        ${renderBrdMarketState(latest50)}

        <div class="acct-strip">
          <div class="acct-card">
            <div class="acct-name">SPY · TODAY</div>
            <div class="acct-val"><span class="mono ${perfCls(spyToday)}">${fmt.pct(spyToday)}</span></div>
            <div class="acct-meta"><span>${latestDate}</span></div>
          </div>
          <div class="acct-card">
            <div class="acct-name">QQQ · TODAY</div>
            <div class="acct-val"><span class="mono ${perfCls(qqqToday)}">${fmt.pct(qqqToday)}</span></div>
            <div class="acct-meta"><span>${latestDate}</span></div>
          </div>
          <div class="acct-card">
            <div class="acct-name">SP500 · 50D MA</div>
            <div class="acct-val"><span class="mono ${breadthCls(latest50.sp500_breadth)}">${latest50.sp500_breadth != null ? latest50.sp500_breadth + '%' : '—'}</span></div>
            <div class="acct-meta"><span>above 50-day MA</span></div>
          </div>
          <div class="acct-card">
            <div class="acct-name">NDX · 50D MA</div>
            <div class="acct-val"><span class="mono ${breadthCls(latest50.qqq_breadth)}">${latest50.qqq_breadth != null ? latest50.qqq_breadth + '%' : '—'}</span></div>
            <div class="acct-meta"><span>above 50-day MA</span></div>
          </div>
          ${(() => {
            // QQQ−SPY GAP card: rotation regime + 30d sparkline.
            const spy = latest50.sp500_breadth, qqq = latest50.qqq_breadth;
            const haveBoth = spy != null && qqq != null;
            const gap = haveBoth ? (qqq - spy) : null;
            const sign = gap == null ? '' : (gap > 0 ? '+' : '');
            const rot = classifyRotation(spy, qqq);
            const gapCls = gap == null ? '' : Math.abs(gap) <= 5 ? '' : (gap > 0 ? 'num-up' : 'num-up-soft');
            // 30d gap series, oldest → newest
            const gapSeries = (data['50'] || [])
              .slice(0, 30).slice().reverse()
              .map(d => (d.sp500_breadth != null && d.qqq_breadth != null) ? (d.qqq_breadth - d.sp500_breadth) : null);
            const spark = gapSparkline(gapSeries, { w: 100, h: 18 });
            return `
              <div class="acct-card">
                <div class="acct-name">QQQ−SPY GAP · 50D</div>
                <div class="acct-val">
                  <span class="mono ${gapCls}">${gap != null ? sign + gap.toFixed(1) + 'pp' : '—'}</span>
                </div>
                <div class="acct-meta" style="display:flex;align-items:center;gap:6px;justify-content:space-between">
                  <span class="${rot.cls}">${rot.label}</span>
                  ${spark ? `<span style="flex:1;max-width:100px">${spark}</span>` : ''}
                </div>
              </div>`;
          })()}
          <div class="acct-card">
            <div class="acct-name">SECTORS ≥ 50%</div>
            <div class="acct-val"><span class="mono">${sectorsTotal ? sectorsAbove + ' / ' + sectorsTotal : '—'}</span></div>
            <div class="acct-meta"><span>${sectorsTotal ? sectorsBelow + ' below 50%' : 'no sector data'}</span></div>
          </div>
        </div>

        <div class="mod-panel">
          <div class="mod-panel-title">BREADTH vs PRICE · 90d · divergence watch</div>
          <div class="chart-wrap" style="position:relative">
            ${chartResult.html}
            <div class="stk-tooltip" style="opacity:0"></div>
          </div>
          <div class="chart-legend">
            <span><span class="lg-line ch-spy-leg"></span>SPY cumulative (rebased, shared scale)</span>
            <span><span class="lg-line ch-breadth-leg"></span>SP500 % above SMA50</span>
            <span><span class="lg-line ch-qqq-leg"></span>QQQ % above SMA50</span>
            <span class="chart-note">price up + breadth flat/down = divergence warning</span>
          </div>
        </div>

        ${renderStockbeePanel(mon)}

        <div class="mod-grid-2">
          <div>
            <div class="mod-panel">
              <div class="mod-panel-title">HEADLINE BREADTH · % above MA</div>
              <div class="tbl-wrap">
                <table class="tbl-dense tbl-heat">
                  <thead>
                    <tr><th></th><th>MA50</th><th>MA100</th><th>MA200</th></tr>
                  </thead>
                  <tbody>${headlineRows}</tbody>
                </table>
              </div>
            </div>

            <div class="mod-panel">
              <div class="mod-panel-title">SECTOR BREADTH · heatmap + 20d trend</div>
              <div class="tbl-wrap">
                <table class="tbl-dense tbl-heat">
                  <thead>
                    <tr><th>SECTOR</th><th>MA50</th><th>MA100</th><th>MA200</th><th>20D TREND</th></tr>
                  </thead>
                  <tbody>${sectorRows}</tbody>
                </table>
              </div>
            </div>
          </div>

          <div class="mod-side">
            <div class="mod-panel">
              <div class="mod-panel-title">RECENT · 10 days</div>
              <div class="tbl-wrap">
                <table class="tbl-dense">
                  <thead>
                    <tr><th>DATE</th><th>SPY</th><th>QQQ</th><th>SP</th><th>QQ</th></tr>
                  </thead>
                  <tbody>${trendRows}</tbody>
                </table>
              </div>
            </div>

            <div class="mod-panel">
              <div class="mod-panel-title">HEATMAP LEGEND</div>
              <div class="heat-legend">
                <span class="cell bh-1">0–20</span>
                <span class="cell bh-2">20–40</span>
                <span class="cell bh-3">40–60</span>
                <span class="cell bh-4">60–80</span>
                <span class="cell bh-5">80–100</span>
              </div>
            </div>
          </div>
        </div>

        ${renderRotationRibbon(data, 63)}
        ${renderRRG(rot)}
        ${renderLeadersLaggards(data, latest50)}
        ${renderSectorDonut(br)}
        ${renderHistoricalHeatShell(data, sectors)}
        ${renderIndustryShell(industries)}
      `;

      wireHistoricalHeat(body, data, sectors);
      wireIndustryTable(body, industries);

      // Crosshair + tooltip on the divergence chart
      if (chartResult.meta) {
        const wrap = body.querySelector('.chart-wrap');
        if (wrap) {
          attachBreadthCrosshair(
            wrap.querySelector('.breadth-chart'),
            wrap.querySelector('.stk-tooltip'),
            chartResult.meta
          );
        }
      }
    } catch (e) {
      body.innerHTML = `<div class="mod-err">Failed to load breadth: ${e.message}</div>`;
    }
  }

  /* ── Stockbee Market Monitor ────────────────────────────────
     T2108 + 4%-movers + 5d/10d ratio + monthly 25/50% extremes.
     Source: /data/monitor.json (82 days, updated daily by stockbee pipeline). */
  function renderStockbeePanel(mon) {
    if (!mon || !mon.data || !mon.data.length) {
      return `<div class="mod-panel">
        <div class="mod-panel-title">STOCKBEE MONITOR</div>
        <div class="mod-loading">No monitor data available</div>
      </div>`;
    }
    const rows = mon.data.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    const latest = rows[0];
    const recent = rows.slice(0, 7);
    const t2108 = latest.t2108;
    const tlabel = t2108Label(t2108);
    const r5 = latest.ratio_5d, r10 = latest.ratio_10d;
    const r5lab = ratio5dLabel(r5);
    const r10lab = ratio5dLabel(r10);
    const up4 = latest.up_4pct, dn4 = latest.down_4pct;
    const up4Pct = latest.universe_size ? (up4 / latest.universe_size * 100) : null;
    const dn4Pct = latest.universe_size ? (dn4 / latest.universe_size * 100) : null;
    const up25m = latest.up_25pct_month, dn25m = latest.down_25pct_month;
    const up50m = latest.up_50pct_month, dn50m = latest.down_50pct_month || 0;

    const trendRows = recent.map(r => `
      <tr>
        <td class="mono">${r.date ? r.date.slice(5) : '—'}</td>
        <td class="mono ${(r.t2108 || 0) >= 60 ? 'num-up' : (r.t2108 || 0) <= 30 ? 'num-dn' : ''}">${r.t2108 != null ? r.t2108.toFixed(1) : '—'}</td>
        <td class="mono num-up">${r.up_4pct ?? '—'}</td>
        <td class="mono num-dn">${r.down_4pct ?? '—'}</td>
        <td class="mono ${(r.ratio_5d || 0) >= 1.5 ? 'num-up' : (r.ratio_5d || 0) <= 0.67 ? 'num-dn' : ''}">${r.ratio_5d != null ? r.ratio_5d.toFixed(2) : '—'}</td>
        <td class="mono ${(r.ratio_10d || 0) >= 1.5 ? 'num-up' : (r.ratio_10d || 0) <= 0.67 ? 'num-dn' : ''}">${r.ratio_10d != null ? r.ratio_10d.toFixed(2) : '—'}</td>
        <td class="mono num-up">${r.up_25pct_month ?? '—'}</td>
        <td class="mono num-dn">${r.down_25pct_month ?? '—'}</td>
      </tr>
    `).join('');

    return `
      <div class="mod-panel">
        <div class="mod-panel-title">STOCKBEE MARKET MONITOR · ~${(latest.universe_size || 6400).toLocaleString()} US stocks · ${latest.date || '—'}</div>
        <div class="acct-strip" style="grid-template-columns:repeat(4,1fr)">
          <div class="acct-card">
            <div class="acct-name">T2108 · % &gt; 40D MA</div>
            <div class="acct-val"><span class="mono ${tlabel.cls}">${t2108 != null ? t2108.toFixed(1) + '%' : '—'}</span></div>
            <div class="acct-meta"><span>${tlabel.text}${tlabel.hint ? ' · ' + tlabel.hint : ''}</span></div>
          </div>
          <div class="acct-card">
            <div class="acct-name">4% MOVERS · today</div>
            <div class="acct-val"><span class="mono num-up">${up4 ?? '—'}</span><span class="acct-slash"> / </span><span class="mono num-dn">${dn4 ?? '—'}</span></div>
            <div class="acct-meta"><span>${up4Pct != null ? up4Pct.toFixed(1) + '% up · ' + (dn4Pct != null ? dn4Pct.toFixed(1) + '% dn' : '') : 'up / down'}</span></div>
          </div>
          <div class="acct-card">
            <div class="acct-name">5D RATIO · thrust</div>
            <div class="acct-val"><span class="mono ${r5lab.cls}">${r5 != null ? r5.toFixed(2) : '—'}×</span></div>
            <div class="acct-meta"><span>${r5lab.text} · 10D ${r10 != null ? r10.toFixed(2) : '—'}×</span></div>
          </div>
          <div class="acct-card">
            <div class="acct-name">25% MONTH · extremes</div>
            <div class="acct-val"><span class="mono num-up">${up25m ?? '—'}</span><span class="acct-slash"> / </span><span class="mono num-dn">${dn25m ?? '—'}</span></div>
            <div class="acct-meta"><span>50%·mo ${up50m ?? '—'} up / ${dn50m ?? '—'} dn</span></div>
          </div>
        </div>
        <div class="tbl-wrap" style="margin-top:6px">
          <table class="tbl-dense">
            <thead><tr>
              <th>DATE</th><th>T2108</th><th>UP 4%</th><th>DN 4%</th><th>R5D</th><th>R10D</th><th>UP 25%M</th><th>DN 25%M</th>
            </tr></thead>
            <tbody>${trendRows}</tbody>
          </table>
        </div>
        <div class="small" style="margin-top:4px;color:var(--fg-dim);font-size:10px;line-height:1.5">
          <b>T2108</b> = % of NYSE stocks above 40d MA; contrarian — extremes mark bottoms (&lt;20) and tops (&gt;80).
          <b>4% movers</b> count stocks with ≥4% daily gain/loss — spikes signal momentum thrust regime.
          <b>Ratios</b> sum up/down 4% movers over N days; ≥1.5 = up thrust, ≤0.67 = down thrust.
          <b>25%·M / 50%·M</b> stocks up/down ≥25% or ≥50% over the last month — extreme trend-following participation.
          <br>Data: <a href="https://stockbee.blogspot.com" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline;opacity:0.6">Stockbee Market Monitor</a> — used with attribution.
        </div>
      </div>
    `;
  }

  /* Bloomberg-style sector donut: slice size = SPX sector weight,
     color = 1-day ETF % change. Data from br.sector_changes. */
  function renderSectorDonut(br) {
    const sc = br.sector_changes || {};
    if (!Object.keys(sc).length) return '';
    // Rows are newest-first — [0] is the latest day (matching the slices' date)
    const latest = ((br.data || br)['50'] || [])[0] || {};
    const spyChange = latest.spy_change ?? null;

    const WEIGHT = {
      'Information Technology': 31.8, 'Financials': 13.0, 'Health Care': 12.4,
      'Consumer Discretionary': 10.0, 'Communication Services': 8.9, 'Industrials': 8.3,
      'Consumer Staples': 5.5, 'Energy': 3.8, 'Utilities': 2.6, 'Materials': 2.4, 'Real Estate': 2.3,
    };
    const SHORT = {
      'Information Technology': 'Info Tech', 'Financials': 'Financials', 'Health Care': 'Health Care',
      'Consumer Discretionary': 'Cons Discr', 'Communication Services': 'Comm Svc',
      'Industrials': 'Industrials', 'Consumer Staples': 'Cons Stpl',
      'Energy': 'Energy', 'Utilities': 'Utilities', 'Materials': 'Materials', 'Real Estate': 'Real Estate',
    };
    const TINY = {
      'Utilities': 'XLU', 'Materials': 'XLB', 'Real Estate': 'XLRE',
    };

    const chgColor = (v) => v == null ? '#6b7280' : v > 0 ? '#22c55e' : v < 0 ? '#ef4444' : '#6b7280';
    const fmt = (v) => v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
    const d2r = (deg) => (deg - 90) * Math.PI / 180;

    const sectors = Object.entries(WEIGHT)
      .map(([name, w]) => ({ name, weight: w, change: sc[name]?.change ?? null }))
      .sort((a, b) => b.weight - a.weight);
    const total = sectors.reduce((s, x) => s + x.weight, 0);

    const W = 700, H = 480, cx = W / 2, cy = H / 2;
    const R2 = 140, R1 = 92, RC = 75;
    const GAP = 0.7;

    const arcPath = (s, e, r1, r2) => {
      const a1 = d2r(s), a2 = d2r(e);
      const x1 = cx + r2 * Math.cos(a1), y1 = cy + r2 * Math.sin(a1);
      const x2 = cx + r2 * Math.cos(a2), y2 = cy + r2 * Math.sin(a2);
      const x3 = cx + r1 * Math.cos(a2), y3 = cy + r1 * Math.sin(a2);
      const x4 = cx + r1 * Math.cos(a1), y4 = cy + r1 * Math.sin(a1);
      const lg = (e - s) > 180 ? 1 : 0;
      return `M${x1.toFixed(1)},${y1.toFixed(1)} A${r2},${r2},0,${lg},1,${x2.toFixed(1)},${y2.toFixed(1)} L${x3.toFixed(1)},${y3.toFixed(1)} A${r1},${r1},0,${lg},0,${x4.toFixed(1)},${y4.toFixed(1)} Z`;
    };

    let slices = '', labels = '';
    let angle = 0;
    sectors.forEach(sec => {
      const span = (sec.weight / total) * 360;
      const sa = angle + GAP / 2, ea = angle + span - GAP / 2;
      const mid = (sa + ea) / 2;
      angle += span;

      const col = chgColor(sec.change);
      slices += `<path d="${arcPath(sa, ea, R1, R2)}" fill="${col}" stroke="#0d1117" stroke-width="1.5"/>`;

      const tiny = span < 12;
      const LR = R2 + (tiny ? 28 : 20);
      const LT = LR + 8;
      const ma = d2r(mid);
      const lx1 = cx + (R2 + 3) * Math.cos(ma), ly1 = cy + (R2 + 3) * Math.sin(ma);
      const lx2 = cx + LR * Math.cos(ma),       ly2 = cy + LR * Math.sin(ma);
      const tx  = cx + LT * Math.cos(ma),        ty  = cy + LT * Math.sin(ma);
      const anch = tx > cx + 8 ? 'start' : tx < cx - 8 ? 'end' : 'middle';
      const label = tiny ? (TINY[sec.name] || sec.name.split(' ')[0]) : SHORT[sec.name];
      const fsize = tiny ? 8.5 : 9.5;
      labels += `
        <line x1="${lx1.toFixed(1)}" y1="${ly1.toFixed(1)}" x2="${lx2.toFixed(1)}" y2="${ly2.toFixed(1)}" stroke="${col}" stroke-width="0.8" opacity="0.65"/>
        <text x="${tx.toFixed(1)}" y="${(ty - 3.5).toFixed(1)}" text-anchor="${anch}" font-size="${fsize}" fill="#d1d5db" font-family="system-ui,sans-serif">${label}</text>
        <text x="${tx.toFixed(1)}" y="${(ty + 7.5).toFixed(1)}" text-anchor="${anch}" font-size="${fsize}" fill="${col}" font-family="'JetBrains Mono',monospace,system-ui">${fmt(sec.change)}</text>`;
    });

    const centerCol = chgColor(spyChange);
    const dataDate = sc[Object.keys(sc)[0]]?.date || '';
    return `
      <div class="mod-panel">
        <div class="mod-panel-title">SPX SECTOR PERFORMANCE · ${dataDate} · SIZED BY S&amp;P 500 WEIGHT</div>
        <div style="display:flex;justify-content:center;overflow:visible">
          <svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px;overflow:visible;display:block">
            ${slices}
            <circle cx="${cx}" cy="${cy}" r="${RC}" fill="${centerCol}" opacity="0.82"/>
            <text x="${cx}" y="${cy - 8}" text-anchor="middle" font-size="11" fill="#fff" font-family="system-ui,sans-serif" font-weight="600" opacity="0.85">S&amp;P 500</text>
            <text x="${cx}" y="${cy + 10}" text-anchor="middle" font-size="14" fill="#fff" font-family="'JetBrains Mono',monospace,system-ui" font-weight="700">${fmt(spyChange)}</text>
            ${labels}
          </svg>
        </div>
        <div style="font-size:9px;color:var(--muted);text-align:center;margin-top:2px">Slice size = S&amp;P 500 sector weight · Color = 1-day % change (ETF proxy: XLK XLV XLF XLY XLC XLI XLP XLE XLRE XLB XLU)</div>
      </div>`;
  }

  /* Detect whether the regime has shifted in the most recent N days.
     Returns { currentReg, streak, priorReg } when streak ≥ 3 consecutive
     days in a new regime, else null.
     cells: chronological array (oldest first). */
  function detectRegimeShift(cells) {
    if (cells.length < 5) return null;
    const currentReg = cells[cells.length - 1].reg;
    if (currentReg === 'na') return null;
    let streakStart = cells.length - 1;
    while (streakStart > 0) {
      const prev = cells[streakStart - 1].reg;
      if (prev === currentReg || prev === 'na') streakStart--;
      else break;
    }
    const streak = cells.length - streakStart;
    if (streak < 3) return null;
    let priorReg = null;
    for (let i = streakStart - 1; i >= 0; i--) {
      if (cells[i].reg !== 'na' && cells[i].reg !== currentReg) { priorReg = cells[i].reg; break; }
    }
    if (!priorReg) return null;
    return { currentReg, streak, priorReg };
  }

  function renderRegimeTransitionAlert(shift) {
    if (!shift) return '';
    const { currentReg, streak, priorReg } = shift;
    const LABEL = { tech: 'TECH LEADING', broad: 'BROAD LEADING', aligned: 'ALIGNED', riskoff: 'RISK-OFF' };
    const from = priorReg, to = currentReg;
    let interp = '';
    if (to === 'riskoff')                          interp = 'Broad deterioration — both indices weakening. Reduce risk exposure.';
    else if (from === 'riskoff')                   interp = 'Risk-off easing — breadth recovering. Wait for confirmation above 40%.';
    else if (from === 'tech' && to === 'aligned')  interp = 'Growth leadership fading — rotation likely in early stages.';
    else if (from === 'aligned' && to === 'tech')  interp = 'Tech/growth re-asserting leadership — momentum favours growth names.';
    else if (from === 'tech' && to === 'broad')    interp = 'Sharp tech→value rotation. Cyclicals and defensives leading.';
    else if (from === 'broad' && to === 'tech')    interp = 'Value rotation reversing — growth re-taking breadth leadership.';
    else if (from === 'aligned' && to === 'broad') interp = 'Broadening rotation underway — cyclicals/value gaining vs growth.';
    else if (from === 'broad' && to === 'aligned') interp = 'Broad rotation pausing — regime stabilising, watch sector 5D deltas.';
    else interp = 'Regime transition in progress — confirm with sector 5D deltas.';
    const icon = to === 'riskoff' ? '⚠' : streak >= 5 ? '↻' : '→';
    return `<div class="brd-shift-alert brd-shift-${to}">
      <span class="brd-shift-icon">${icon}</span>
      <span class="brd-shift-body">
        <b>Regime shift:</b> ${LABEL[from]} → <b>${LABEL[to]}</b> · ${streak} consecutive days
        <span class="brd-shift-interp">${interp}</span>
      </span>
    </div>`;
  }

  /* Historical rotation regime ribbon — every day classified into one of
     {tech, broad, aligned, riskoff} based on QQQ−SPY breadth gap, rendered
     as a horizontal time-axis bar so the dominant regime over the window is
     visually obvious. Range default 63 td (3M) to match stocks-app /breadth.html. */
  /* ── Sector Rotation (RRG) ──────────────────────────────────
     Compact JdK Relative Rotation Graph for 11 SPDR sectors vs SPY.
     Scan-density priority: small SVG chart + dense table side-by-side. */
  const RRG_QUAD_COLOR = {
    Leading:   '#4ade80',
    Weakening: '#facc15',
    Lagging:   '#f87171',
    Improving: '#60a5fa',
    Unknown:   '#8b949e',
  };

  // Collision-aware label placement: stack labels vertically when anchors cluster.
  function rrgPlaceLabels(anchors, opts) {
    const GAP_X = opts.gapX || 38, GAP_Y = opts.gapY || 14, OFF = opts.offset || 7;
    const xR = opts.xR, charW = opts.charW || 6.6, padApprox = 4;
    const sorted = anchors.slice().sort((a, b) => a.ay - b.ay);
    const placed = [];
    sorted.forEach(a => {
      let lx = a.ax + OFF;
      let ly = a.ay;
      let iters = 0;
      while (iters < 40 && placed.some(p =>
        Math.abs(p.lx - lx) < GAP_X && Math.abs(p.ly - ly) < GAP_Y
      )) { ly += GAP_Y; iters++; }
      // If running off right edge, swing left of anchor
      const labelW = a.etf.length * charW + padApprox;
      let anchor = 'start';
      if (lx + labelW > xR) {
        lx = a.ax - OFF - labelW;
        anchor = 'end';
        iters = 0;
        while (iters < 40 && placed.some(p =>
          Math.abs(p.lx - lx) < GAP_X && Math.abs(p.ly - ly) < GAP_Y
        )) { ly += GAP_Y; iters++; }
      }
      placed.push({ etf: a.etf, color: a.color, ax: a.ax, ay: a.ay, lx, ly, anchor });
    });
    return placed;
  }

  function renderRRG(rot) {
    if (!rot || !rot.data || !rot.data.SPY || !rot.data.SPY.weekly) {
      return `<div class="mod-panel">
        <div class="mod-panel-title">SECTOR ROTATION (RRG) · weekly · vs SPY</div>
        <div class="mod-empty">rotation.json unavailable — run compute_rotation.py</div>
      </div>`;
    }
    const snap = rot.data.SPY.weekly;
    const W = 540, H = 420, pad = 36;
    // Compute axis bounds from all trail points (last 5 each)
    const xs = [], ys = [];
    Object.keys(snap).forEach(etf => {
      snap[etf].trail.slice(-5).forEach(p => { xs.push(p.ratio); ys.push(p.mom); });
    });
    if (!xs.length) return '';
    let xMin = Math.min.apply(null, xs), xMax = Math.max.apply(null, xs);
    let yMin = Math.min.apply(null, ys), yMax = Math.max.apply(null, ys);
    const padN = 0.6;
    xMin = Math.min(xMin - padN, 99); xMax = Math.max(xMax + padN, 101);
    yMin = Math.min(yMin - padN, 99); yMax = Math.max(yMax + padN, 101);
    const sx = v => pad + ((v - xMin) / (xMax - xMin)) * (W - 2 * pad);
    const sy = v => pad + (1 - (v - yMin) / (yMax - yMin)) * (H - 2 * pad);
    const x100 = sx(100), y100 = sy(100);
    const xL = pad, xR = W - pad, yT = pad, yB = H - pad;

    // Quadrant tint rects + labels + crosshair
    const quadRects = `
      <rect x="${x100}" y="${yT}"  width="${xR - x100}" height="${y100 - yT}" fill="rgba(74,222,128,0.07)"/>
      <rect x="${x100}" y="${y100}" width="${xR - x100}" height="${yB - y100}" fill="rgba(250,204,21,0.07)"/>
      <rect x="${xL}"   y="${y100}" width="${x100 - xL}" height="${yB - y100}" fill="rgba(248,113,113,0.07)"/>
      <rect x="${xL}"   y="${yT}"  width="${x100 - xL}" height="${y100 - yT}" fill="rgba(96,165,250,0.07)"/>
    `;
    const quadLbls = `
      <text x="${xR - 6}" y="${yT + 14}" fill="rgba(74,222,128,0.65)" text-anchor="end" font-size="11" font-weight="700">LEADING</text>
      <text x="${xR - 6}" y="${yB - 6}"  fill="rgba(250,204,21,0.65)" text-anchor="end" font-size="11" font-weight="700">WEAKENING</text>
      <text x="${xL + 6}" y="${yB - 6}"  fill="rgba(248,113,113,0.65)" font-size="11" font-weight="700">LAGGING</text>
      <text x="${xL + 6}" y="${yT + 14}" fill="rgba(96,165,250,0.65)" font-size="11" font-weight="700">IMPROVING</text>
    `;
    const crosshair = `
      <line x1="${xL}" y1="${y100}" x2="${xR}" y2="${y100}" stroke="rgba(255,255,255,0.18)" stroke-width="0.8"/>
      <line x1="${x100}" y1="${yT}" x2="${x100}" y2="${yB}" stroke="rgba(255,255,255,0.18)" stroke-width="0.8"/>
    `;

    // Sector trails — tapered segments + hollow start + halo head dots
    const anchors = [];
    let sampleTrailDates = null;
    const trails = Object.keys(snap).map(etf => {
      const s = snap[etf];
      const pts = s.trail.slice(-5);
      if (!pts.length) return '';
      if (!sampleTrailDates) sampleTrailDates = { start: pts[0].date, end: pts[pts.length - 1].date, n: pts.length };
      const color = RRG_QUAD_COLOR[s.quadrant] || '#8b949e';
      const n = pts.length;
      // Segment-tapered line: thinner+faded toward start, thicker+opaque toward head
      const segments = [];
      for (let i = 0; i < n - 1; i++) {
        const p1 = pts[i], p2 = pts[i + 1];
        const t = i / Math.max(1, n - 2);             // 0 (oldest) → 1 (newest)
        const sw = (0.9 + t * 1.7).toFixed(2);        // 0.9 → 2.6
        const op = (0.35 + t * 0.55).toFixed(2);      // 0.35 → 0.90
        segments.push(`<line x1="${sx(p1.ratio).toFixed(1)}" y1="${sy(p1.mom).toFixed(1)}" x2="${sx(p2.ratio).toFixed(1)}" y2="${sy(p2.mom).toFixed(1)}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" opacity="${op}"/>`);
      }
      // Dots: hollow start · faded middles · halo head
      const dots = pts.map((p, i) => {
        const cx = sx(p.ratio).toFixed(1), cy = sy(p.mom).toFixed(1);
        if (i === 0) {
          // Hollow start ring
          return `<circle cx="${cx}" cy="${cy}" r="3.2" fill="#0d1117" stroke="${color}" stroke-width="1.4" opacity="0.85"/>`;
        }
        if (i === n - 1) {
          // Head: large filled + light halo ring
          return `<circle cx="${cx}" cy="${cy}" r="6.8" fill="none" stroke="#e6edf3" stroke-width="1.2" opacity="0.7"/>` +
                 `<circle cx="${cx}" cy="${cy}" r="4.4" fill="${color}" stroke="#0d1117" stroke-width="1" opacity="1"/>`;
        }
        // Middle: small faded dot
        const op = (0.45 + (i / (n - 1)) * 0.4).toFixed(2);
        return `<circle cx="${cx}" cy="${cy}" r="1.8" fill="${color}" opacity="${op}"/>`;
      }).join('');
      const head = pts[pts.length - 1];
      anchors.push({ etf, color, ax: sx(head.ratio), ay: sy(head.mom) });
      return `<g>${segments.join('')}${dots}</g>`;
    }).join('');

    // Place labels with collision avoidance
    const placed = rrgPlaceLabels(anchors, { xR: xR - 2 });
    const labels = placed.map(p => {
      // Leader line if displaced
      const dx = Math.abs(p.lx - p.ax), dy = Math.abs(p.ly - p.ay);
      const lineEndX = p.anchor === 'end' ? p.lx + (p.etf.length * 6.6 + 2) : p.lx - 2;
      const leader = (dx > 12 || dy > 6)
        ? `<line x1="${p.ax}" y1="${p.ay}" x2="${lineEndX}" y2="${p.ly}" stroke="${p.color}" stroke-width="0.6" opacity="0.45"/>`
        : '';
      // text with dark stroke + colored fill for legibility
      return `${leader}<text x="${p.lx.toFixed(1)}" y="${(p.ly + 3.5).toFixed(1)}" fill="${p.color}" stroke="#0d1117" stroke-width="2.6" stroke-linejoin="round" paint-order="stroke fill" text-anchor="${p.anchor}" font-size="11" font-weight="700" font-family="SF Mono, monospace">${p.etf}</text>`;
    }).join('');

    const chartSvg = `
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" style="width:100%;max-width:${W}px;height:auto;display:block">
        ${quadRects}
        ${crosshair}
        ${quadLbls}
        ${trails}
        ${labels}
        <text x="${W / 2}" y="${H - 6}" text-anchor="middle" fill="var(--text-muted, #6e7681)" font-size="10">RS-Ratio →</text>
        <text x="12" y="${H / 2}" transform="rotate(-90 12 ${H / 2})" text-anchor="middle" fill="var(--text-muted, #6e7681)" font-size="10">RS-Momentum →</text>
      </svg>
    `;

    // Trail key strip — explains start vs current dot convention + date range
    const td = sampleTrailDates || { start: '—', end: '—', n: 0 };
    const trailKeySvg = `
      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:4px 8px;font-size:10px;color:var(--text-muted, #6e7681);font-family:SF Mono, monospace">
        <span style="display:inline-flex;align-items:center;gap:4px">
          <svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="3.2" fill="#0d1117" stroke="#8b949e" stroke-width="1.4"/></svg>
          <b style="color:var(--text-primary, #e6edf3)">${td.start || '—'}</b> start
        </span>
        <span>→</span>
        <span style="display:inline-flex;align-items:center;gap:4px">
          <svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.5" fill="none" stroke="#e6edf3" stroke-width="1.1" opacity="0.7"/><circle cx="8" cy="8" r="4.4" fill="#8b949e" stroke="#0d1117" stroke-width="1"/></svg>
          <b style="color:var(--text-primary, #e6edf3)">${td.end || '—'}</b> current
        </span>
        <span style="opacity:0.7">· ${td.n} weekly points, oldest → newest</span>
        <span style="opacity:0.7;margin-left:auto">line thickens toward current</span>
      </div>
    `;

    // Dense table
    const quadOrder = { Leading: 0, Improving: 1, Weakening: 2, Lagging: 3, Unknown: 4 };
    const rows = Object.keys(snap).map(etf => Object.assign({ etf }, snap[etf]))
      .sort((a, b) => (quadOrder[a.quadrant] - quadOrder[b.quadrant]) || (b.ratio - a.ratio));
    const tableRows = rows.map(r => {
      const color = RRG_QUAD_COLOR[r.quadrant] || '#8b949e';
      const cross = r.crossed_recently ? '<span class="mono" style="color:#fde68a">↺</span>' : '';
      return `<tr>
        <td class="lbl"><b>${r.etf}</b></td>
        <td class="mono" style="color:${color}">${r.quadrant.slice(0, 4).toUpperCase()}</td>
        <td class="mono">${r.ratio.toFixed(2)}</td>
        <td class="mono">${r.mom.toFixed(2)}</td>
        <td class="mono">${r.weeks_in_quadrant}</td>
        <td>${cross}</td>
      </tr>`;
    }).join('');

    // Full-name "Just Crossed" panel — mirrors stocks.clawmo.tech layout
    const crossedList = Object.keys(snap).filter(e => snap[e].crossed_recently);
    const crossedPanelHtml = crossedList.length
      ? `<div class="mod-subpanel" style="background:rgba(96,165,250,0.06);border:1px solid rgba(96,165,250,0.25);border-radius:4px;padding:6px 10px;margin-bottom:8px">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:#93c5fd;font-weight:700;margin-bottom:4px">Just Crossed (last 1–2 weeks)</div>
          ${crossedList.map(etf => {
            const s = snap[etf];
            const color = RRG_QUAD_COLOR[s.quadrant] || '#8b949e';
            return `<div style="display:flex;justify-content:space-between;align-items:center;padding:2px 0;font-size:11px">
              <span><b style="font-family:SF Mono, monospace">${etf}</b> <span style="color:var(--text-muted, #6e7681)">${s.name || ''}</span></span>
              <span style="color:${color};font-family:SF Mono, monospace;font-weight:700">→ ${s.quadrant}</span>
            </div>`;
          }).join('')}
        </div>`
      : `<div class="mod-subpanel" style="background:rgba(255,255,255,0.02);border:1px solid var(--border, #30363d);border-radius:4px;padding:6px 10px;margin-bottom:8px;font-size:11px;color:var(--text-muted, #6e7681);font-style:italic">No quadrant changes — stable rotation.</div>`;

    // Quadrant counts narrative footer
    const counts = { Leading: 0, Weakening: 0, Lagging: 0, Improving: 0 };
    Object.values(snap).forEach(s => { if (counts[s.quadrant] != null) counts[s.quadrant]++; });

    return `
      <div class="mod-panel">
        <div class="mod-panel-title">SECTOR ROTATION (RRG) · weekly · vs SPY · as of ${rot.as_of || '—'}</div>
        <div class="mod-grid-2" style="grid-template-columns: minmax(0,1.4fr) minmax(0,1fr); gap: 12px">
          <div style="min-width:0">
            ${chartSvg}
            ${trailKeySvg}
          </div>
          <div style="min-width:0;display:flex;flex-direction:column">
            ${crossedPanelHtml}
            <div class="tbl-wrap" style="flex:1">
              <table class="tbl-dense">
                <thead><tr>
                  <th data-glossary="RRG_ETF">ETF</th>
                  <th data-glossary="RRG_Q">Q</th>
                  <th data-glossary="RRG_RATIO">RATIO</th>
                  <th data-glossary="RRG_MOM">MOM</th>
                  <th data-glossary="RRG_WKS">WKS</th>
                  <th data-glossary="RRG_CROSS">↺</th>
                </tr></thead>
                <tbody>${tableRows}</tbody>
              </table>
            </div>
          </div>
        </div>
        <div class="chart-legend" style="margin-top:6px;font-size:11px">
          <span style="color:#86efac"><b>${counts.Leading}</b> Leading</span>
          <span style="color:#93c5fd"><b>${counts.Improving}</b> Improving</span>
          <span style="color:#fde68a"><b>${counts.Weakening}</b> Weakening</span>
          <span style="color:#fca5a5"><b>${counts.Lagging}</b> Lagging</span>
        </div>
      </div>
    `;
  }

  function renderRotationRibbon(data, days) {
    const N = days || 63;
    const rows = (data['50'] || []).slice(0, N).slice().reverse();  // chronological
    if (!rows.length) return '';
    const cells = rows.map(r => {
      const reg = classifyRotation(r.sp500_breadth, r.qqq_breadth).reg;
      return { date: r.date, reg };
    });
    const counts = { tech: 0, broad: 0, aligned: 0, riskoff: 0, na: 0 };
    cells.forEach(c => { counts[c.reg] = (counts[c.reg] || 0) + 1; });
    const total = cells.length;
    const pct = (n) => total ? Math.round((n / total) * 100) : 0;
    const first = cells[0]?.date || '—';
    const last = cells[cells.length - 1]?.date || '—';
    const mid = cells[Math.floor(cells.length / 2)]?.date || '';
    const ribbonHTML = cells.map(c =>
      `<div class="brd-ribbon-cell ${c.reg}" title="${c.date} · ${c.reg.toUpperCase()}"></div>`
    ).join('');

    const shift = detectRegimeShift(cells);
    return `
      <div class="mod-panel">
        <div class="mod-panel-title">HISTORICAL ROTATION REGIME · ${total} trading days</div>
        ${renderRegimeTransitionAlert(shift)}
        <div class="brd-ribbon">${ribbonHTML}</div>
        <div class="brd-ribbon-axis"><span>${first}</span><span>${mid}</span><span>${last}</span></div>
        <div class="brd-ribbon-legend">
          <span><i class="tech"></i>Tech leading (gap &gt;+5pp)</span>
          <span><i class="broad"></i>Broad leading (gap &lt;−5pp)</span>
          <span><i class="aligned"></i>Aligned (±5pp)</span>
          <span><i class="riskoff"></i>Risk-off (both &lt;30%)</span>
        </div>
        <div class="brd-ribbon-stats">
          Days in regime · Tech <b>${pct(counts.tech)}%</b> · Broad <b>${pct(counts.broad)}%</b> · Aligned <b>${pct(counts.aligned)}%</b> · Risk-off <b>${pct(counts.riskoff)}%</b>
        </div>
      </div>
    `;
  }

  /* Leaders / Laggards panel — top-3 vs bottom-3 sectors today with 5d Δ
     and a plain-language rotation interpretation derived from the dominant
     style group at each end of the ranking. */
  function renderLeadersLaggards(data, latest50) {
    const sectors = latest50?.sectors || {};
    const items = Object.entries(sectors)
      .filter(([, v]) => typeof v === 'number')
      .map(([name, v]) => ({ name, val: v, group: BRD_SECTOR_GROUP[name] || 'cyclical' }));
    if (items.length < 3) return '';
    const prior = (data['50'] || [])[5] || (data['50'] || []).slice(-1)[0] || {};
    items.forEach(it => {
      const p = prior?.sectors?.[it.name];
      it.delta = (typeof p === 'number') ? +(it.val - p).toFixed(1) : null;
    });
    const sorted = items.slice().sort((a, b) => b.val - a.val);
    const top = sorted.slice(0, 3);
    const bot = sorted.slice(-3).reverse();

    // Dominant style at each end → rotation interpretation
    const tally = arr => arr.reduce((m, it) => (m[it.group] = (m[it.group] || 0) + 1, m), {});
    const dominant = (counts) => Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || ['', 0];
    const [topGrp, topGrpN] = dominant(tally(top));
    const [botGrp, botGrpN] = dominant(tally(bot));
    let interp;
    if (topGrpN >= 2 && botGrpN >= 2 && topGrp !== botGrp) {
      interp = `Money rotating <b>out of ${BRD_GROUP_LABEL[botGrp]}</b> and <b>into ${BRD_GROUP_LABEL[topGrp]}</b>.`;
      if (topGrp === 'tech' && botGrp === 'defensive')      interp += ' Risk-on posture — growth bid, defensives sold.';
      else if (topGrp === 'defensive' && botGrp === 'tech') interp += ' Risk-off / late-cycle — investors hiding in non-cyclicals.';
      else if (topGrp === 'cyclical' && botGrp === 'tech')  interp += ' Reflation / value rotation — bond-sensitive sectors leading growth.';
      else if (topGrp === 'tech' && botGrp === 'cyclical')  interp += ' Growth re-leadership — secular themes outpacing cyclical/value.';
    } else {
      interp = `Mixed leadership — no single style dominates the top or bottom of the sector ranking.`;
    }

    const renderRow = (it) => {
      const tagCls = it.group === 'tech' ? 'num-up-soft' : it.group === 'defensive' ? 'num-warn' : '';
      const dlt = it.delta == null ? '—' :
        `<span class="mono ${it.delta >= 0 ? 'num-up' : 'num-dn'}">${it.delta >= 0 ? '+' : ''}${it.delta}pp</span>`;
      return `<tr>
        <td class="lbl">${it.name} <span class="chip ${tagCls}" style="font-size:8px;padding:1px 4px;margin-left:4px">${BRD_GROUP_TAG[it.group]}</span></td>
        <td class="cell ${breadthCls(it.val)}">${it.val}</td>
        <td class="mono">${dlt}</td>
      </tr>`;
    };

    return `
      <div class="mod-panel">
        <div class="mod-panel-title">SECTOR LEADERS &amp; LAGGARDS · ${latest50.date || '—'}</div>
        <div class="mod-grid-2">
          <div>
            <div class="mod-panel-subtitle" style="font-size:10px;color:var(--muted);margin-bottom:4px;letter-spacing:0.04em">LEADERS · top 3 by % above 50D MA</div>
            <div class="tbl-wrap">
              <table class="tbl-dense tbl-heat">
                <thead><tr><th>SECTOR</th><th>%&gt;50MA</th><th>5D Δ</th></tr></thead>
                <tbody>${top.map(renderRow).join('')}</tbody>
              </table>
            </div>
          </div>
          <div>
            <div class="mod-panel-subtitle" style="font-size:10px;color:var(--muted);margin-bottom:4px;letter-spacing:0.04em">LAGGARDS · bottom 3 by % above 50D MA</div>
            <div class="tbl-wrap">
              <table class="tbl-dense tbl-heat">
                <thead><tr><th>SECTOR</th><th>%&gt;50MA</th><th>5D Δ</th></tr></thead>
                <tbody>${bot.map(renderRow).join('')}</tbody>
              </table>
            </div>
          </div>
        </div>
        <div style="margin-top:8px;padding:6px 10px;background:var(--panel);border:1px dashed var(--border);font-size:11px;color:var(--fg)">
          ${interp}
        </div>
      </div>
    `;
  }

  /* ── Full Industry Performance table ────────────────────────
     Replaces the old "top 5 / bottom 5" panels with a sortable +
     searchable table covering all ~144 Finviz industries. */
  function renderIndustryShell(industries) {
    return `
      <style>
        [data-breadth-panel="industry"] .fv-bar-track {
          position: relative; display: flex; height: 14px;
          background: transparent; border-left: 1px solid var(--border);
          border-right: 1px solid var(--border); overflow: hidden;
        }
        [data-breadth-panel="industry"] .fv-bar-half {
          flex: 1; position: relative; height: 100%;
        }
        [data-breadth-panel="industry"] .fv-bar-half.left  { border-right: 1px solid var(--fg-dim); }
        [data-breadth-panel="industry"] .fv-bar-fill {
          position: absolute; top: 1px; bottom: 1px; height: auto;
        }
        [data-breadth-panel="industry"] .fv-bar-fill.neg { right: 0; background: #f87171; }
        [data-breadth-panel="industry"] .fv-bar-fill.pos { left: 0;  background: #4ade80; }
        [data-breadth-panel="industry"] .ind-view-btn {
          background: transparent; border: 1px solid var(--border);
          color: var(--fg); padding: 2px 8px; margin-left: 4px;
          border-radius: 3px; cursor: pointer; font-size: 11px;
          font-family: inherit;
        }
        [data-breadth-panel="industry"] .ind-view-btn.active {
          background: var(--accent-bg, rgba(96,165,250,0.15));
          border-color: var(--accent);
          color: var(--accent);
        }
      </style>
      <div class="mod-panel" data-breadth-panel="industry">
        <div class="mod-panel-title">
          INDUSTRY PERFORMANCE · <a href="https://finviz.com/groups.ashx" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline;opacity:0.7">Finviz groups</a> · <span class="ind-count mono">${industries.length}</span>
          <span style="margin-left:10px">
            <button class="ind-view-btn" data-view="heatmap" type="button">HEATMAP</button>
            <button class="ind-view-btn" data-view="bars" type="button">BARS</button>
          </span>
          <input type="search" class="ind-search stk-tick-input" placeholder="filter industry…" style="margin-left:8px;min-width:140px">
        </div>
        <div class="tbl-wrap" style="max-height:calc(100vh - 540px);min-height:300px">
          <table class="tbl-dense">
            <thead><tr id="ind-head"></tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    `;
  }

  function wireIndustryTable(body, industries) {
    const panelEl = body.querySelector('[data-breadth-panel="industry"]');
    if (!panelEl) return;
    const tbody = panelEl.querySelector('tbody');
    const headEl = panelEl.querySelector('#ind-head');
    const countEl = panelEl.querySelector('.ind-count');
    const searchEl = panelEl.querySelector('.ind-search');
    const viewBtns = panelEl.querySelectorAll('.ind-view-btn');
    const total = industries.length;

    // Persist view choice per-session on window so switching panes doesn't reset
    const savedView = window._brdIndView === 'bars' ? 'bars' : 'heatmap';
    const state = { sortCol: 'perfW', sortDir: 'desc', query: '', view: savedView };

    function renderHead() {
      if (state.view === 'bars') {
        // Rank / Industry / Bar (driven by sort metric) / 1D / 1W / 1M
        const metric = state.sortCol === 'label' ? 'perfT' : state.sortCol;
        const col = IND_COLS.find(c => c.key === metric);
        const metricLabel = col ? col.label : '—';
        const numTh = (key, label) => {
          const active = state.sortCol === key;
          const arrow = active ? (state.sortDir === 'desc' ? '▾' : '▴') : '▾';
          const style = `text-align:right;min-width:56px${active ? ';color:var(--accent)' : ''}`;
          return `<th class="ind-th" data-col="${key}" style="${style}">${label} <span class="ind-sort-arrow" style="opacity:${active ? 1 : 0.3}">${arrow}</span></th>`;
        };
        headEl.innerHTML = `
          <th style="width:40px;text-align:right">#</th>
          <th class="ind-th" data-col="label" style="text-align:left">INDUSTRY <span class="ind-sort-arrow" style="opacity:0.3">▾</span></th>
          <th style="min-width:180px;text-align:center">BAR · ${metricLabel}</th>
          ${numTh('perfT', '1D')}
          ${numTh('perfW', '1W')}
          ${numTh('perfM', '1M')}
        `;
      } else {
        headEl.innerHTML = IND_COLS.map(c => `<th class="ind-th" data-col="${c.key}">${c.label} <span class="ind-sort-arrow" style="opacity:0.3">▾</span></th>`).join('');
      }
      panelEl.querySelectorAll('.ind-th').forEach(th => {
        th.style.cursor = 'pointer';
        th.addEventListener('click', () => {
          const col = th.dataset.col;
          if (!col) return;
          if (state.sortCol === col) state.sortDir = state.sortDir === 'desc' ? 'asc' : 'desc';
          else { state.sortCol = col; state.sortDir = col === 'label' ? 'asc' : 'desc'; }
          render();
        });
      });
    }

    function render() {
      renderHead();

      const q = state.query.trim().toUpperCase();
      let rows = industries.slice();
      if (q) rows = rows.filter(r => (r.label || '').toUpperCase().includes(q));
      const col = IND_COLS.find(c => c.key === state.sortCol);
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

      if (state.view === 'bars') {
        // Bar metric follows the sort column (label sort falls back to perfT)
        const metric = state.sortCol === 'label' ? 'perfT' : state.sortCol;
        // Normalize to max|val| of VISIBLE (filtered) set — prevents the "all
        // top performers clamp to 100%" trap called out in the product memory.
        let maxAbs = 0;
        rows.forEach(r => {
          const v = r[metric];
          if (v != null && isFinite(v) && Math.abs(v) > maxAbs) maxAbs = Math.abs(v);
        });
        if (maxAbs === 0) maxAbs = 1;
        const numCell = (val, isActive) => {
          const cls = perfCls(val);
          const txt = val != null && isFinite(val) ? (val >= 0 ? '+' : '') + val.toFixed(2) + '%' : '—';
          const style = isActive ? 'font-weight:700' : '';
          return `<td class="mono ${cls}" style="text-align:right;${style}">${txt}</td>`;
        };
        tbody.innerHTML = rows.map((r, i) => {
          const url = r.screenerUrl ? `https://finviz.com/${r.screenerUrl}` : null;
          const label = url
            ? `<a href="${url}" target="_blank" rel="noopener" style="color:var(--fg);text-decoration:none">${r.label || '—'}</a>`
            : (r.label || '—');
          const val = r[metric];
          const pct = val == null || !isFinite(val) ? 0 : (Math.abs(val) / maxAbs) * 100;
          const posW = val != null && val > 0 ? pct.toFixed(1) : 0;
          const negW = val != null && val < 0 ? pct.toFixed(1) : 0;
          return `<tr>
            <td class="mono" style="color:var(--fg-dim);text-align:right">${i + 1}</td>
            <td>${label}</td>
            <td>
              <div class="fv-bar-track">
                <div class="fv-bar-half left"><div class="fv-bar-fill neg" style="width:${negW}%"></div></div>
                <div class="fv-bar-half"><div class="fv-bar-fill pos" style="width:${posW}%"></div></div>
              </div>
            </td>
            ${numCell(r.perfT, metric === 'perfT')}
            ${numCell(r.perfW, metric === 'perfW')}
            ${numCell(r.perfM, metric === 'perfM')}
          </tr>`;
        }).join('') || '<tr><td colspan="6" class="empty">no matches</td></tr>';
      } else {
        tbody.innerHTML = rows.map(r => {
          const url = r.screenerUrl ? `https://finviz.com/${r.screenerUrl}` : null;
          const label = url
            ? `<a href="${url}" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:none">${r.label || '—'}</a>`
            : (r.label || '—');
          return `<tr>
            <td>${label}</td>
            <td class="mono ${perfCls(r.perfT)}">${r.perfT != null ? (r.perfT >= 0 ? '+' : '') + r.perfT.toFixed(2) + '%' : '—'}</td>
            <td class="mono ${perfCls(r.perfW)}">${r.perfW != null ? (r.perfW >= 0 ? '+' : '') + r.perfW.toFixed(2) + '%' : '—'}</td>
            <td class="mono ${perfCls(r.perfM)}">${r.perfM != null ? (r.perfM >= 0 ? '+' : '') + r.perfM.toFixed(2) + '%' : '—'}</td>
            <td class="mono ${perfCls(r.perfQ)}">${r.perfQ != null ? (r.perfQ >= 0 ? '+' : '') + r.perfQ.toFixed(2) + '%' : '—'}</td>
            <td class="mono ${perfCls(r.perfH)}">${r.perfH != null ? (r.perfH >= 0 ? '+' : '') + r.perfH.toFixed(2) + '%' : '—'}</td>
            <td class="mono ${perfCls(r.perfYtd)}">${r.perfYtd != null ? (r.perfYtd >= 0 ? '+' : '') + r.perfYtd.toFixed(2) + '%' : '—'}</td>
            <td class="mono ${perfCls(r.perfY)}">${r.perfY != null ? (r.perfY >= 0 ? '+' : '') + r.perfY.toFixed(2) + '%' : '—'}</td>
          </tr>`;
        }).join('') || '<tr><td colspan="8" class="empty">no matches</td></tr>';
      }

      if (countEl) countEl.textContent = q ? `${rows.length} of ${total}` : String(total);

      viewBtns.forEach(b => b.classList.toggle('active', b.dataset.view === state.view));

      // Update sort arrows on the heatmap column headers (bar-view head is built fresh each render)
      if (state.view !== 'bars') {
        panelEl.querySelectorAll('.ind-th').forEach(th => {
          const active = th.dataset.col === state.sortCol;
          const arrow = th.querySelector('.ind-sort-arrow');
          if (arrow) {
            arrow.textContent = active ? (state.sortDir === 'desc' ? '▾' : '▴') : '▾';
            arrow.style.opacity = active ? '1' : '0.3';
          }
        });
      }
    }

    if (searchEl) searchEl.addEventListener('input', (e) => { state.query = e.target.value; render(); });
    viewBtns.forEach(btn => btn.addEventListener('click', () => {
      state.view = btn.dataset.view;
      window._brdIndView = state.view;
      render();
    }));
    render();
  }

  /* ── Historical Heatmap with range selector ─────────────────
     Date-by-date grid across SPY, QQQ, SP500, NDX + 11 GICS sectors.
     Uses breadth.json[`50`] as source (daily MA50 readings).
     1M=22d / 3M=63d / 6M=126d / 1Y=252d. */
  function renderHistoricalHeatShell(dataByMA, sectors) {
    const rows = dataByMA['50'] || [];
    if (!rows.length) return '';
    return `
      <div class="mod-panel" data-breadth-panel="histheat">
        <div class="mod-panel-title">
          HISTORICAL HEATMAP · % above 50D MA · ${rows.length} days available
          <span class="hist-range-btns" style="margin-left:10px">
            ${Object.keys(HIST_RANGES).map(r => `<button class="hist-range-btn" data-range="${r}" type="button" style="background:transparent;border:1px solid var(--border);color:var(--fg);padding:2px 8px;margin-left:4px;border-radius:3px;cursor:pointer;font-size:11px">${r}</button>`).join('')}
          </span>
        </div>
        <div class="tbl-wrap" style="max-height:500px">
          <table class="tbl-dense tbl-heat hist-heat-table">
            <thead id="hist-heat-head"></thead>
            <tbody id="hist-heat-body"></tbody>
          </table>
        </div>
      </div>
    `;
  }

  function wireHistoricalHeat(body, dataByMA, sectors) {
    const panelEl = body.querySelector('[data-breadth-panel="histheat"]');
    if (!panelEl) return;
    const headEl = panelEl.querySelector('#hist-heat-head');
    const bodyEl = panelEl.querySelector('#hist-heat-body');
    const btns = panelEl.querySelectorAll('.hist-range-btn');
    const rows = dataByMA['50'] || [];
    let range = '3M';

    function render() {
      const n = Math.min(HIST_RANGES[range] || 63, rows.length);
      const slice = rows.slice(0, n);
      const cols = ['sp500_breadth', 'qqq_breadth', 'breadth_score'];
      const colLabels = ['SP500', 'QQQ', 'SCORE'];

      headEl.innerHTML = `<tr>
        <th>DATE</th>
        ${colLabels.map(l => `<th>${l}</th>`).join('')}
        ${sectors.map(s => `<th title="${s}">${s.length > 7 ? s.slice(0, 7) + '…' : s}</th>`).join('')}
      </tr>`;

      bodyEl.innerHTML = slice.map(d => {
        const baseCols = cols.map(k => {
          const v = d[k];
          return `<td class="cell ${breadthCls(v)}">${v != null ? v : '—'}</td>`;
        }).join('');
        const sectorCols = sectors.map(s => {
          const v = d.sectors?.[s];
          return `<td class="cell ${breadthCls(v)}">${v != null ? v : '—'}</td>`;
        }).join('');
        return `<tr>
          <td class="mono" style="font-size:10px;white-space:nowrap">${d.date ? d.date.slice(5) : '—'}</td>
          ${baseCols}${sectorCols}
        </tr>`;
      }).join('');

      btns.forEach(b => b.classList.toggle('active', b.dataset.range === range));
      btns.forEach(b => {
        b.style.background = b.dataset.range === range ? 'var(--accent-bg, rgba(96,165,250,0.15))' : 'transparent';
        b.style.borderColor = b.dataset.range === range ? 'var(--accent)' : 'var(--border)';
        b.style.color = b.dataset.range === range ? 'var(--accent)' : 'var(--fg)';
      });
    }

    btns.forEach(b => b.addEventListener('click', () => { range = b.dataset.range; render(); }));
    render();
  }

  window.OC_MODULES = window.OC_MODULES || {};
  window.OC_MODULES.breadth = { render };
})();
