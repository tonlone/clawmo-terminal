/* F2 Signals — trade setups + regime + scorecard + master-detail chart pane */
(function () {
  'use strict';
  const { fetchJSON, fmt } = window.OC_DATA;

  const SETUPS_URL = 'https://stocks.clawmo.tech/data/trade-setups.json';
  const SCORECARD_URL = 'https://stocks.clawmo.tech/data/weekly-scorecard.json';
  const SUMMARY_URL = 'https://stocks.clawmo.tech/data/signals-summary.json';
  const PLAYBOOK_URL = 'https://stocks.clawmo.tech/data/pattern-playbook.json';
  const CHART_URL = (t) => `https://stocks.clawmo.tech/api/signals/chart/${encodeURIComponent(t)}?days=90`;
  const HIST_URL  = (t) => `https://stocks.clawmo.tech/api/signals/history/${encodeURIComponent(t)}?days=90`;

  function rrClass(rr) {
    if (rr == null || isNaN(rr)) return '';
    if (rr >= 2)   return 'gd-a';
    if (rr >= 1.5) return 'gd-b';
    if (rr >= 1)   return 'gd-c';
    return 'gd-d';
  }
  function wrClass(wr) {
    if (wr == null || isNaN(wr)) return '';
    if (wr >= 50) return 'num-up';
    if (wr >= 40) return 'num-warn';
    return 'num-dn';
  }
  function pnlClass(v) {
    if (v == null || isNaN(v)) return '';
    if (v > 0) return 'num-up';
    if (v < 0) return 'num-dn';
    return '';
  }

  /* ── Setup-overlay chart (SVG) ────────────────────────────
     Renders 90-day close line + horizontal entry/stop/target levels
     + a daily signal strip (green/red/neutral) beneath the chart.
     Returns { html, meta } so selectRow can attach crosshair handlers. */
  function renderSetupChart(setup, chart, history, opts) {
    opts = opts || {};
    const showVolume = !!opts.showVolume;
    const showTrend  = opts.showTrend !== false;  // default on
    const W = 960, padL = 44, padR = 56, padT = 12, padB = 22;
    const stripH = showTrend ? 14 : 0;
    const volumeH = showVolume ? 30 : 0;   // reserved between price zone and signal strip
    const H = 260 + volumeH - (showTrend ? 0 : 14);
    const data = (chart && chart.data) || [];
    if (data.length < 2) {
      return { html: `<div class="sig-chart-empty">No price history for ${setup.ticker}</div>`, meta: null };
    }
    const closes = data.map(d => d.close);
    const dates = data.map(d => d.date);
    const entry = Number(setup.entry_price);
    const stop  = Number(setup.stop_loss);
    const tgt   = Number(setup.take_profit);

    const extras = [entry, stop, tgt].filter(v => typeof v === 'number' && !isNaN(v));
    let min = Math.min(...closes, ...extras);
    let max = Math.max(...closes, ...extras);
    if (min === max) { max = min + 1; }
    const pad = (max - min) * 0.06;
    min -= pad; max += pad;

    const n = closes.length;
    const plotTop = padT;
    const plotBottom = H - padB - stripH - 4 - volumeH;
    const sx = (i) => padL + (i / (n - 1)) * (W - padL - padR);
    const sy = (v) => plotTop + (1 - (v - min) / (max - min)) * (plotBottom - plotTop);

    const grid = [];
    const gridN = 4;
    for (let i = 0; i <= gridN; i++) {
      const v = min + ((max - min) / gridN) * i;
      const y = sy(v);
      grid.push(`<line class="oc-grid" x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}"></line>`);
      grid.push(`<text class="oc-ylabel" x="${padL - 4}" y="${(y + 3).toFixed(1)}">${v.toFixed(2)}</text>`);
    }

    const pathD = closes.map((v, i) => `${i === 0 ? 'M' : 'L'} ${sx(i).toFixed(1)} ${sy(v).toFixed(1)}`).join(' ');
    const areaD = pathD + ` L ${sx(n-1).toFixed(1)} ${plotBottom.toFixed(1)} L ${sx(0).toFixed(1)} ${plotBottom.toFixed(1)} Z`;

    function levelLine(v, color, label, dashed) {
      if (typeof v !== 'number' || isNaN(v)) return '';
      const y = sy(v);
      const lineStyle = `stroke:${color};stroke-width:1.2${dashed ? ';stroke-dasharray:4 3' : ''}`;
      return `
        <line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" style="${lineStyle}"></line>
        <rect x="${W - padR + 2}" y="${(y - 8).toFixed(1)}" width="${padR - 4}" height="16" style="fill:${color};opacity:0.18"></rect>
        <text x="${W - padR + 4}" y="${(y + 3).toFixed(1)}" style="font-size:9px;font-family:var(--font-mono);fill:${color}">${label} ${v.toFixed(2)}</text>
      `;
    }
    const entryLine = levelLine(entry, '#60A5FA', 'ENT', true);
    const stopLine  = levelLine(stop,  '#F87171', 'STP', false);
    const tgtLine   = levelLine(tgt,   '#4ADE80', 'TGT', false);

    const xLabels = [0, Math.floor(n / 2), n - 1].map(i => {
      return `<text class="oc-xlabel" x="${sx(i).toFixed(1)}" y="${(H - stripH - 8).toFixed(1)}" text-anchor="middle">${dates[i]}</text>`;
    }).join('');

    const sigMap = {};
    const histData = (history && history.data) || [];
    histData.forEach(h => { sigMap[h.date] = h.signal; });
    const barW = (W - padL - padR) / n;
    let stripBars = '';
    if (showTrend) {
      const stripY = H - stripH - 2;
      stripBars = data.map((d, i) => {
        const s = sigMap[d.date];
        const color = s === 1 ? '#4ADE80' : s === -1 ? '#F87171' : '#3a3f49';
        return `<rect x="${sx(i).toFixed(1) - barW / 2}" y="${stripY}" width="${Math.max(barW - 0.5, 0.5).toFixed(2)}" height="${stripH}" style="fill:${color};opacity:0.75"></rect>`;
      }).join('');
    }

    // Volume bars — between price zone and signal strip
    let volumeBars = '';
    if (showVolume) {
      const volumes = data.map(d => (typeof d.volume === 'number') ? d.volume : 0);
      const maxVol = Math.max(...volumes, 1);
      const vTop = plotBottom + 4;
      const vBarW = Math.max(1, (W - padL - padR) / n * 0.8);
      volumeBars = data.map((d, i) => {
        const v = d.volume || 0;
        const h = (v / maxVol) * (volumeH - 2);
        const y = vTop + (volumeH - 2 - h);
        const prev = i > 0 ? data[i - 1].close : d.close;
        const color = d.close >= prev ? 'rgba(74,222,128,0.55)' : 'rgba(248,113,113,0.55)';
        const x = sx(i) - vBarW / 2;
        return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${vBarW.toFixed(2)}" height="${Math.max(h, 0.6).toFixed(1)}" style="fill:${color}"></rect>`;
      }).join('');
    }

    const html = `
      <svg class="oc-chart sig-chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="height:${H}px">
        ${grid.join('')}
        <path d="${areaD}" style="fill:var(--accent-bg);opacity:0.35"></path>
        <path d="${pathD}" style="fill:none;stroke:var(--accent);stroke-width:1.4"></path>
        ${entryLine}${stopLine}${tgtLine}
        ${volumeBars}
        ${xLabels}
        ${stripBars}
        <line class="sig-cross-x" x1="0" y1="${plotTop}" x2="0" y2="${plotBottom + stripH + 4 + volumeH}" style="stroke:var(--fg);stroke-width:0.6;opacity:0;pointer-events:none;stroke-dasharray:2 2"></line>
        <circle class="sig-cross-dot" cx="0" cy="0" r="3" style="fill:var(--accent);stroke:var(--fg);stroke-width:0.8;opacity:0;pointer-events:none"></circle>
        <rect class="sig-cross-hit" x="${padL}" y="${plotTop}" width="${W - padL - padR}" height="${(plotBottom - plotTop).toFixed(1)}" style="fill:transparent;cursor:crosshair"></rect>
      </svg>
    `;
    return {
      html,
      meta: { W, H, padL, padR, plotTop, plotBottom, n, dates, closes, entry, stop, tgt, sigMap, yMin: min, yMax: max },
    };
  }

  /* Attach crosshair + tooltip. Called after innerHTML is set so the SVG
     and tooltip elements exist in the DOM. */
  function attachCrosshair(svg, tooltip, meta) {
    if (!svg || !meta) return;
    const xLine = svg.querySelector('.sig-cross-x');
    const dot = svg.querySelector('.sig-cross-dot');
    const hit = svg.querySelector('.sig-cross-hit');
    if (!xLine || !dot || !hit) return;

    const { padL, padR, W, n, dates, closes, entry, sigMap, plotTop, plotBottom, yMin, yMax } = meta;
    const plotW = W - padL - padR;
    const sxIdx = (i) => padL + (i / (n - 1)) * plotW;
    const syVal = (v) => plotTop + (1 - (v - yMin) / (yMax - yMin)) * (plotBottom - plotTop);

    function onMove(ev) {
      const pt = svg.createSVGPoint();
      pt.x = ev.clientX; pt.y = ev.clientY;
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const loc = pt.matrixTransform(ctm.inverse());
      // Map loc.x to nearest data index
      let i = Math.round(((loc.x - padL) / plotW) * (n - 1));
      if (i < 0) i = 0;
      if (i > n - 1) i = n - 1;
      const x = sxIdx(i);
      const y = syVal(closes[i]);
      xLine.setAttribute('x1', x.toFixed(2));
      xLine.setAttribute('x2', x.toFixed(2));
      xLine.style.opacity = '0.55';
      dot.setAttribute('cx', x.toFixed(2));
      dot.setAttribute('cy', y.toFixed(2));
      dot.style.opacity = '1';

      // Tooltip content
      const close = closes[i];
      const vsEnt = (typeof entry === 'number' && !isNaN(entry) && entry !== 0)
        ? ((close - entry) / entry) * 100 : null;
      const sig = sigMap[dates[i]];
      const lightColor = sig === 1 ? '#4ADE80' : sig === -1 ? '#F87171' : '#6b7280';
      const lightLabel = sig === 1 ? 'UP' : sig === -1 ? 'DN' : '—';
      const vsCls = vsEnt == null ? '' : vsEnt >= 0 ? 'num-up' : 'num-dn';
      const vsTxt = vsEnt == null ? '—' : (vsEnt >= 0 ? '+' : '') + vsEnt.toFixed(2) + '%';
      tooltip.innerHTML = `
        <div class="sig-tt-row"><span class="sig-tt-k">DATE</span><span class="sig-tt-v mono">${dates[i]}</span></div>
        <div class="sig-tt-row"><span class="sig-tt-k">CLOSE</span><span class="sig-tt-v mono">$${close.toFixed(2)}</span></div>
        <div class="sig-tt-row"><span class="sig-tt-k">vs ENT</span><span class="sig-tt-v mono ${vsCls}">${vsTxt}</span></div>
        <div class="sig-tt-row"><span class="sig-tt-k">TREND</span><span class="sig-tt-v mono" style="color:${lightColor}">● ${lightLabel}</span></div>
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

  /* ── Cache fetches per ticker to avoid refetching on row-reselect ── */
  const chartCache = {};
  async function fetchChartBundle(ticker) {
    if (chartCache[ticker]) return chartCache[ticker];
    const p = Promise.all([
      fetchJSON(CHART_URL(ticker), { ttl: 5 * 60 * 1000 }).catch(() => ({ data: [] })),
      fetchJSON(HIST_URL(ticker),  { ttl: 5 * 60 * 1000 }).catch(() => ({ data: [] })),
    ]).then(([chart, history]) => ({ chart, history }));
    chartCache[ticker] = p;
    return p;
  }

  function trendLightDot(streakDir) {
    if (streakDir === 1)  return `<span class="sig-trend-dot" style="background:#4ADE80;box-shadow:0 0 6px #4ADE80"></span>`;
    if (streakDir === -1) return `<span class="sig-trend-dot" style="background:#F87171;box-shadow:0 0 6px #F87171"></span>`;
    return `<span class="sig-trend-dot" style="background:#6b7280"></span>`;
  }

  async function selectRow(body, setups, idx) {
    const pane = body.querySelector('#sig-chart-pane');
    if (!pane) return;
    // Highlight
    body.querySelectorAll('tbody tr[data-row-idx]').forEach(tr => {
      tr.classList.toggle('sig-row-selected', Number(tr.dataset.rowIdx) === idx);
    });
    const setup = setups[idx];
    if (!setup || !setup.ticker) {
      pane.innerHTML = `<div class="sig-chart-empty">No setup selected</div>`;
      return;
    }
    pane.innerHTML = `<div class="sig-chart-loading">Loading ${setup.ticker}…</div>`;
    const { chart, history } = await fetchChartBundle(setup.ticker);
    const streakDir = history && history.streak_direction;
    const streak = history && history.streak;
    const dirArrow = setup.direction === 'long' ? '▲ LONG' : setup.direction === 'short' ? '▼ SHORT' : '◆';
    const dirC = setup.direction === 'long' ? 'num-up' : setup.direction === 'short' ? 'num-dn' : '';
    const risk = Math.abs((setup.entry_price || 0) - (setup.stop_loss || 0));
    const reward = Math.abs((setup.take_profit || 0) - (setup.entry_price || 0));
    const rr = risk > 0 ? reward / risk : null;

    const showVolume = localStorage.getItem('oc_sig_vol') === 'on';
    const showTrend  = localStorage.getItem('oc_sig_trend') !== 'off';  // default on
    const chartResult = renderSetupChart(setup, chart, history, { showVolume, showTrend });
    pane.innerHTML = `
      <div class="sig-chart-head">
        <div class="sig-chart-title">
          <span class="tk">${setup.ticker}</span>
          <span class="sig-chart-pat">${setup.pattern_name || setup.signal_type || '—'}</span>
          <span class="chip ${dirC}">${dirArrow}</span>
          ${trendLightDot(streakDir)}
          <span class="sig-chart-streak">${streak != null ? streak + 'd ' + (streakDir === 1 ? 'up' : streakDir === -1 ? 'down' : 'flat') : ''}</span>
        </div>
        <div class="sig-chart-levels mono">
          <span>ENT <b>${fmt.money(setup.entry_price)}</b></span>
          <span class="num-dn">STP <b>${fmt.money(setup.stop_loss)}</b></span>
          <span class="num-up">TGT <b>${fmt.money(setup.take_profit)}</b></span>
          <span class="${rrClass(rr)}">R:R <b>${rr != null ? rr.toFixed(2) : '—'}</b></span>
          <button class="sig-vol-btn${showVolume ? ' active' : ''}" data-vol="${showVolume ? 'off' : 'on'}" title="Toggle volume bars">VOL ${showVolume ? 'ON' : 'OFF'}</button>
          <button class="sig-trend-btn${showTrend ? ' active' : ''}" data-trend="${showTrend ? 'off' : 'on'}" title="Toggle daily trend strip">TREND ${showTrend ? 'ON' : 'OFF'}</button>
          <a href="#" class="sig-chart-eq" data-tk="${setup.ticker}">Open in EQ ↗</a>
        </div>
      </div>
      <div class="sig-chart-body">
        ${chartResult.html}
        <div class="sig-tooltip" style="opacity:0"></div>
      </div>
      <div class="sig-chart-legend">
        <span><span class="sig-legend-swatch" style="background:var(--accent)"></span>close</span>
        <span><span class="sig-legend-swatch" style="background:#60A5FA;border:1px dashed #60A5FA"></span>entry</span>
        <span><span class="sig-legend-swatch" style="background:#F87171"></span>stop</span>
        <span><span class="sig-legend-swatch" style="background:#4ADE80"></span>target</span>
        <span class="sig-legend-sep">│</span>
        <span>strip: daily trend light (green = ema+rsi+macd aligned up, red = aligned down)</span>
      </div>
    `;
    // Wire the EQ handoff
    const eqLink = pane.querySelector('.sig-chart-eq');
    if (eqLink) {
      eqLink.addEventListener('click', (ev) => {
        ev.preventDefault();
        if (window.OC_OPEN_MODULE) window.OC_OPEN_MODULE('stock-analysis', { ticker: setup.ticker });
      });
    }
    // VOL toggle — re-runs selectRow so the chart re-renders with new size
    const volBtn = pane.querySelector('.sig-vol-btn');
    if (volBtn) {
      volBtn.addEventListener('click', () => {
        localStorage.setItem('oc_sig_vol', volBtn.dataset.vol);
        selectRow(body, setups, idx);
      });
    }
    // TREND toggle
    const trendBtn = pane.querySelector('.sig-trend-btn');
    if (trendBtn) {
      trendBtn.addEventListener('click', () => {
        localStorage.setItem('oc_sig_trend', trendBtn.dataset.trend);
        selectRow(body, setups, idx);
      });
    }
    // Crosshair + tooltip
    if (chartResult.meta) {
      attachCrosshair(
        pane.querySelector('.sig-chart-svg'),
        pane.querySelector('.sig-tooltip'),
        chartResult.meta
      );
    }
  }

  function escSig(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // ── Position Sizer ─────────────────────────────────────────
  // Persisted in localStorage so it survives reloads. Applied to every
  // trade row (Setups, Open Trades, Closed Trades, Equity Curve).
  const SIZER_KEY = 'oc_sig_sizer';
  const REGIME_MULT = { BULL: 1.0, CAUTION: 0.5, BEAR: 0.3 };
  function getSizer() {
    let s;
    try { s = JSON.parse(localStorage.getItem(SIZER_KEY)); } catch (e) {}
    if (!s || typeof s !== 'object') s = {};
    return {
      account: typeof s.account === 'number' && s.account > 0 ? s.account : 100000,
      riskPct: typeof s.riskPct === 'number' && s.riskPct > 0 ? s.riskPct : 2,
      method:  s.method === 'half_kelly' || s.method === 'regime_scaled' ? s.method : 'fixed_fractional',
    };
  }
  function setSizer(patch) {
    const cur = getSizer();
    const next = { ...cur, ...patch };
    try { localStorage.setItem(SIZER_KEY, JSON.stringify(next)); } catch (e) {}
    return next;
  }
  // Compute position size for a single trade. Returns { shares, dollarRisk, positionValue, dollarPnL }.
  // - entry: entry price · stop: stop loss · regime: BULL/CAUTION/BEAR (for regime_scaled)
  // - patternStats: { win_rate, avg_win, avg_loss } (for half_kelly) — from playbook/adaptive_grades
  // - returnPct: closed-trade % return (for dollarPnL)
  function computeSize(opts) {
    const sizer = opts.sizer || getSizer();
    const account = sizer.account;
    const riskFrac = sizer.riskPct / 100;
    const entry = Number(opts.entry || 0);
    const stop  = Number(opts.stop  || 0);
    const stopDist = Math.abs(entry - stop);
    if (entry <= 0 || stopDist <= 0) {
      return { shares: 0, dollarRisk: 0, positionValue: 0, dollarPnL: null, methodLbl: sizer.method };
    }
    let dollarRisk;
    if (sizer.method === 'half_kelly' && opts.patternStats) {
      const ps = opts.patternStats;
      // Aligned with stocks.clawmo.tech/signals.html sizer formula:
      // - WR = positive_return_pct (% of trades with positive P&L —
      //   consistent denominator with avg_win_pct which averages those)
      // - avg_win_pct / avg_loss_pct from backtest-results
      // - Kelly capped at 1.0 (100% allocation), then halved → max 50%
      // - Shares = (account × halfKelly) / entry  [capital-allocation Kelly]
      // - dollarRisk derived for display = shares × stopDist
      const wr = (ps.positive_return_pct ?? ps.win_rate ?? 0) / 100;
      const aw = Math.abs(ps.avg_win_pct ?? ps.avg_win ?? 0);
      const al = Math.abs(ps.avg_loss_pct ?? ps.avg_loss ?? 0);
      if (wr > 0 && aw > 0 && al > 0) {
        const kelly = (wr * aw - (1 - wr) * al) / aw;
        const halfKelly = Math.max(0, Math.min(kelly, 1)) / 2;  // cap 1.0 then halve → max 50%
        const dollarAmt = account * halfKelly;
        const shares = Math.floor(dollarAmt / entry);
        const dollarRiskKelly = shares * stopDist;
        const positionValueKelly = shares * entry;
        const dollarPnLKelly = (opts.returnPct != null && shares > 0)
          ? (shares * entry * opts.returnPct / 100)
          : null;
        return { shares, dollarRisk: dollarRiskKelly, positionValue: positionValueKelly, dollarPnL: dollarPnLKelly, methodLbl: sizer.method };
      }
      dollarRisk = account * riskFrac;  // fallback if pattern stats unavailable
    } else if (sizer.method === 'regime_scaled') {
      const mult = REGIME_MULT[opts.regime] || 1.0;
      dollarRisk = account * riskFrac * mult;
    } else {
      // fixed_fractional (default)
      dollarRisk = account * riskFrac;
    }
    const shares = Math.floor(dollarRisk / stopDist);
    const positionValue = shares * entry;
    const dollarPnL = (opts.returnPct != null && shares > 0)
      ? (shares * entry * opts.returnPct / 100)
      : null;
    return { shares, dollarRisk, positionValue, dollarPnL, methodLbl: sizer.method };
  }
  function fmtUsd(v, compact) {
    if (v == null || !isFinite(v)) return '—';
    const abs = Math.abs(v);
    const sign = v < 0 ? '-$' : '$';
    if (compact) {
      if (abs >= 1e6) return sign + (abs / 1e6).toFixed(2) + 'M';
      if (abs >= 1e3) return sign + (abs / 1e3).toFixed(1) + 'K';
      return sign + abs.toFixed(0);
    }
    return sign + abs.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  async function render(body) {
    body.innerHTML = `<div class="mod-loading">Loading signals…</div>`;
    try {
      const [setups, scorecard, summary, playbook] = await Promise.all([
        fetchJSON(SETUPS_URL),
        fetchJSON(SCORECARD_URL),
        fetchJSON(SUMMARY_URL),
        fetchJSON(PLAYBOOK_URL).catch(() => ({ patterns: [] })),
      ]);

      // Build grade lookup
      const gradeByKey = {};
      const gradeByType = {};
      (playbook.patterns || []).forEach(p => {
        if (!p.signal_type) return;
        gradeByKey[p.signal_type + '|' + (p.direction || '')] = p;
        gradeByType[p.signal_type] = p;
      });
      const gradeFor = (signalType, direction) => {
        return gradeByKey[signalType + '|' + (direction || '')] || gradeByType[signalType] || null;
      };

      const setupList = setups || [];
      const initialTab = window._sigTab || 'setups';
      const state = { tab: initialTab };
      let sizer = getSizer();
      // Need detailed pattern stats (avg_win, avg_loss) for half_kelly mode.
      // Pull from backtest-results.json which has per-pattern win/loss bucket data.
      let backtestStats = {};
      try {
        const br = await fetchJSON('https://stocks.clawmo.tech/data/backtest-results.json').catch(() => null);
        if (br && Array.isArray(br.stats)) {
          br.stats.forEach(s => { if (s.signal_type) backtestStats[s.signal_type] = s; });
        }
      } catch (e) {}
      const patternStatsFor = (signalType) => backtestStats[signalType] || null;
      // Adaptive grades + scorecard data for new tabs
      const adaptiveGrades = summary?.adaptive_grades || {};
      const equityCurve = scorecard?.equity_curve || [];
      const openTrades = scorecard?.open_trades || [];
      const closedTrades = scorecard?.closed_trades || [];
      const patternVsBacktest = scorecard?.pattern_vs_backtest || [];

      // ── Compute KPI aggregates ──────────────────────────────
      const tsCounts = summary?.trade_setups || {};
      const totalSetups = setupList.length;
      let bestAB = 0, highConf = 0, portfolioHits = 0;
      setupList.forEach(s => {
        const g = gradeFor(s.signal_type, s.direction);
        if (g && (g.grade === 'A' || g.grade === 'B')) bestAB++;
        if ((s.confidence || 0) >= 75) highConf++;
        if (s.portfolio_match || s.in_portfolio) portfolioHits++;
      });
      const buyCount = tsCounts.long_direction ?? setupList.filter(s => s.direction === 'long').length;
      const sellCount = tsCounts.short_direction ?? setupList.filter(s => s.direction === 'short').length;
      const shortTerm = tsCounts.short_term ?? 0;
      const mediumTerm = tsCounts.medium_term ?? 0;
      const sigDist = summary?.signal_distribution || {};
      const universeCount = summary?.ticker_count || 0;
      const greenPct = universeCount ? ((sigDist.green || 0) / universeCount * 100) : null;
      const redPct = universeCount ? ((sigDist.red || 0) / universeCount * 100) : null;

      const regime = summary?.regime || {};
      const regName = regime.regime || 'UNKNOWN';
      const regCls = regName === 'BULL' ? 'num-up' : regName === 'BEAR' ? 'num-dn' : 'num-warn';
      const regScore = regime.score ?? '—';
      const ks = summary?.kill_switch || {};
      const pipe = summary?.signal_pipeline || {};

      // ── Kill-switch banner ──
      const ksBanner = ks.active ? `
        <div class="sig-ks-banner sig-ks-${(ks.level || 'CAUTION').toLowerCase().replace(/_/g, '-')}">
          <div class="sig-ks-icon">⚠</div>
          <div class="sig-ks-body">
            <div class="sig-ks-title">${escSig((ks.level || 'CAUTION_ONLY').replace(/_/g, '-'))} MODE — ${escSig(ks.reason || '')}</div>
            <div class="sig-ks-detail">
              ${ks.drawdown_20d != null ? `20d drawdown: <b class="num-dn">${ks.drawdown_20d.toFixed(2)}%</b>` : ''}
              ${ks.consecutive_losses != null ? ` · consec losses: <b>${ks.consecutive_losses}</b>` : ''}
              ${(ks.triggers || []).length > 1 ? ` · triggers: ${escSig(ks.triggers.join(' · '))}` : ''}
            </div>
          </div>
        </div>
      ` : '';

      // ── Macro strip (regime + SPY + RSI + SMA + pipeline + breadth) ──
      const conds = [
        { lbl: 'SPY > SMA50',    pass: !!regime.above_sma50 },
        { lbl: 'SPY > SMA200',   pass: !!regime.above_sma200 },
        { lbl: 'Golden Cross',   pass: !!regime.golden_cross },
        { lbl: 'RSI > 45',       pass: !!regime.rsi_above_45 },
      ];
      const condDots = conds.map(c => `<span class="sig-cond ${c.pass ? 'pass' : 'fail'}" title="${c.lbl}">${c.pass ? '✓' : '✗'} ${c.lbl}</span>`).join('');
      const rsiCls = (regime.rsi || 0) > 70 ? 'num-dn' : (regime.rsi || 0) < 30 ? 'num-up' : '';
      const macroStrip = `
        <div class="sig-macro-strip">
          <div class="sig-macro sig-macro-regime sig-regime-${regName.toLowerCase()}">
            <div class="sig-macro-lbl">Market Regime</div>
            <div class="sig-macro-val ${regCls}">${escSig(regName)} <span class="sig-regime-score">(${regScore}/4)</span></div>
            <div class="sig-cond-row">${condDots}</div>
          </div>
          <div class="sig-macro">
            <div class="sig-macro-lbl">SPY Price</div>
            <div class="sig-macro-val mono">$${regime.price != null ? regime.price.toFixed(2) : '—'}</div>
            <div class="sig-macro-sub mono">benchmark</div>
          </div>
          <div class="sig-macro">
            <div class="sig-macro-lbl">RSI(14)</div>
            <div class="sig-macro-val mono ${rsiCls}">${regime.rsi != null ? regime.rsi.toFixed(1) : '—'}</div>
            <div class="sig-macro-sub mono">${(regime.rsi || 0) > 70 ? 'overbought' : (regime.rsi || 0) < 30 ? 'oversold' : 'neutral'}</div>
          </div>
          <div class="sig-macro">
            <div class="sig-macro-lbl">SMA 50 / 200</div>
            <div class="sig-macro-val mono">$${regime.sma50 != null ? regime.sma50.toFixed(0) : '—'} / $${regime.sma200 != null ? regime.sma200.toFixed(0) : '—'}</div>
            <div class="sig-macro-sub mono">${regime.golden_cross ? '<span class="num-up">golden cross</span>' : '<span class="num-warn">death cross</span>'}</div>
          </div>
          <div class="sig-macro">
            <div class="sig-macro-lbl">Signal Pipeline</div>
            <div class="sig-macro-funnel">
              <span class="mono">${pipe.raw ?? '—'}</span><span class="sig-arrow">→</span>
              <span class="mono" title="after quality gate">${pipe.after_gate ?? '—'}</span><span class="sig-arrow">→</span>
              <span class="mono" title="after trend filter">${pipe.after_trend ?? '—'}</span><span class="sig-arrow">→</span>
              <span class="mono num-up" title="active surviving">${pipe.active ?? '—'}</span>
            </div>
            <div class="sig-macro-sub mono">raw → gate → trend → active</div>
          </div>
          <div class="sig-macro">
            <div class="sig-macro-lbl">Universe Breadth</div>
            <div class="sig-macro-val mono">
              <span class="num-up">${sigDist.green ?? 0}</span> / <span class="num-dn">${sigDist.red ?? 0}</span> / <span style="color:var(--fg-dim)">${sigDist.neutral ?? 0}</span>
            </div>
            <div class="sig-macro-sub mono">${greenPct != null ? greenPct.toFixed(0) : '—'}% bull · ${redPct != null ? redPct.toFixed(0) : '—'}% bear · ${universeCount} stocks</div>
          </div>
        </div>
      `;

      // ── KPI strip (8 cards) ──
      const kpiStrip = `
        <div class="sig-kpi-strip">
          <div class="sig-kpi accent">
            <div class="sig-kpi-lbl">Total Setups</div>
            <div class="sig-kpi-val mono">${totalSetups}</div>
            <div class="sig-kpi-sub">${pipe.raw ?? '—'} raw → ${pipe.after_gate ?? '—'} gate → <b>${totalSetups} active</b></div>
          </div>
          <div class="sig-kpi">
            <div class="sig-kpi-lbl">Best (A+B)</div>
            <div class="sig-kpi-val mono ${totalSetups && bestAB === totalSetups ? 'num-up' : ''}">${bestAB}</div>
            <div class="sig-kpi-sub">${totalSetups ? Math.round(bestAB / totalSetups * 100) : 0}% top grade</div>
          </div>
          <div class="sig-kpi">
            <div class="sig-kpi-lbl">BUY Signals</div>
            <div class="sig-kpi-val mono num-up">${buyCount}</div>
            <div class="sig-kpi-sub">${totalSetups ? Math.round(buyCount / totalSetups * 100) : 0}% long setups</div>
          </div>
          <div class="sig-kpi">
            <div class="sig-kpi-lbl">SELL Signals</div>
            <div class="sig-kpi-val mono num-dn">${sellCount}</div>
            <div class="sig-kpi-sub">${totalSetups ? Math.round(sellCount / totalSetups * 100) : 0}% short setups</div>
          </div>
          <div class="sig-kpi">
            <div class="sig-kpi-lbl">Short-term</div>
            <div class="sig-kpi-val mono">${shortTerm}</div>
            <div class="sig-kpi-sub">3-15 day trades</div>
          </div>
          <div class="sig-kpi">
            <div class="sig-kpi-lbl">Medium-term</div>
            <div class="sig-kpi-val mono">${mediumTerm}</div>
            <div class="sig-kpi-sub">15-60 day trades</div>
          </div>
          <div class="sig-kpi">
            <div class="sig-kpi-lbl">High Conf (75+)</div>
            <div class="sig-kpi-val mono">${highConf}</div>
            <div class="sig-kpi-sub">strongest conviction</div>
          </div>
          <div class="sig-kpi">
            <div class="sig-kpi-lbl">Portfolio Hits</div>
            <div class="sig-kpi-val mono ${portfolioHits > 0 ? 'num-up' : ''}">${portfolioHits}</div>
            <div class="sig-kpi-sub">your holdings flagged</div>
          </div>
        </div>
      `;

      // ── Setups tab content (table + sidebar + chart pane) ──
      const setupRows = setupList.map((s, idx) => {
        const dir  = s.direction === 'long' ? '▲' : s.direction === 'short' ? '▼' : '◆';
        const dirC = s.direction === 'long' ? 'num-up' : s.direction === 'short' ? 'num-dn' : '';
        const risk = Math.abs((s.entry_price || 0) - (s.stop_loss || 0));
        const reward = Math.abs((s.take_profit || 0) - (s.entry_price || 0));
        const rr = risk > 0 ? reward / risk : null;
        const pnl = s.cumulative_return != null ? s.cumulative_return * 100 : null;
        const g = gradeFor(s.signal_type, s.direction);
        const grade = g ? g.grade : null;
        const gradeCls = grade ? ('gd-' + grade.toLowerCase()) : '';
        const gradeTitle = g ? `PF ${g.grade_pf ?? g.profit_factor} · WR ${g.win_rate}% · occ ${g.occurrences}${g.quarantined ? ' · QUARANTINED' : ''}` : '';
        // Position sizing
        const ps = computeSize({
          sizer, entry: s.entry_price, stop: s.stop_loss,
          regime: regName, patternStats: patternStatsFor(s.signal_type),
        });
        return `
          <tr data-row-idx="${idx}" class="sig-row">
            <td class="tk clickable" data-tk="${s.ticker || ''}">${s.ticker || '—'}</td>
            <td class="${gradeCls}" title="${gradeTitle}">${grade || '—'}</td>
            <td class="pat">${escSig(s.pattern_name || s.signal_type || '—')}</td>
            <td class="${dirC}">${dir}</td>
            <td class="tf">${(s.timeframe || '').slice(0,2).toUpperCase() || '—'}</td>
            <td class="mono">${fmt.money(s.entry_price)}</td>
            <td class="mono">${fmt.money(s.current_price)}</td>
            <td class="mono num-dn">${fmt.money(s.stop_loss)}</td>
            <td class="mono num-up">${fmt.money(s.take_profit)}</td>
            <td class="${rrClass(rr)}">${rr != null ? rr.toFixed(2) : '—'}</td>
            <td class="mono">${fmt.num(s.confidence, 0)}</td>
            <td class="mono ${pnlClass(pnl)}">${fmt.pct(pnl)}</td>
            <td class="mono sig-pos-col">${ps.shares > 0 ? ps.shares : '—'}</td>
            <td class="mono sig-pos-col">${ps.positionValue > 0 ? fmtUsd(ps.positionValue, true) : '—'}</td>
            <td class="mono num-dn sig-pos-col">${ps.dollarRisk > 0 ? '-' + fmtUsd(ps.dollarRisk, true) : '—'}</td>
          </tr>
        `;
      }).join('');

      const ov = (scorecard && scorecard.overall) || {};
      const byP = (scorecard && scorecard.by_pattern) || [];
      const byPatternRows = byP.slice(0, 12).map(p => `
        <tr>
          <td class="pat">${escSig(p.signal_type)}</td>
          <td class="mono">${p.total ?? '—'}</td>
          <td class="mono">${p.closed ?? '—'}</td>
          <td class="mono ${wrClass(p.win_rate)}">${p.win_rate != null ? p.win_rate.toFixed(0) + '%' : '—'}</td>
          <td class="mono ${pnlClass(p.avg_return)}">${p.avg_return != null ? fmt.pct(p.avg_return) : '—'}</td>
        </tr>
      `).join('');

      const setupsContent = `
        <div class="mod-grid-2">
          <div class="mod-panel">
            <div class="mod-panel-title">TRADE SETUPS · ACTIVE <span class="mod-panel-sub">click row to preview chart below</span></div>
            <div class="tbl-wrap sig-tbl-wrap">
              <table class="tbl-dense">
                <thead>
                  <tr>
                    <th>TICKER</th><th>GD</th><th>PATTERN</th><th>DIR</th><th>TF</th>
                    <th>ENTRY</th><th>LAST</th><th>STOP</th><th>TGT</th>
                    <th>R:R</th><th>CONF</th><th>P&amp;L%</th>
                    <th class="num">SHARES</th><th class="num">POS $</th><th class="num">RISK $</th>
                  </tr>
                </thead>
                <tbody>${setupRows || '<tr><td colspan="15" class="empty">no active setups</td></tr>'}</tbody>
              </table>
            </div>
          </div>
          <div class="mod-side">
            <div class="mod-panel">
              <div class="mod-panel-title">OVERALL LEDGER</div>
              <div class="kv">
                <span>total signals</span><span class="mono">${ov.total_signals ?? '—'}</span>
                <span>active</span><span class="mono">${ov.active ?? '—'}</span>
                <span>closed</span><span class="mono">${ov.closed ?? '—'}</span>
                <span>win rate</span><span class="mono ${wrClass(ov.win_rate)}">${ov.win_rate != null ? ov.win_rate.toFixed(0) + '%' : '—'}</span>
                <span>avg return</span><span class="mono ${pnlClass(ov.avg_return)}">${fmt.pct(ov.avg_return)}</span>
              </div>
            </div>
            <div class="mod-panel">
              <div class="mod-panel-title">PATTERN HEALTH (live)</div>
              <div class="tbl-wrap">
                <table class="tbl-dense">
                  <thead><tr><th>PAT</th><th>TOT</th><th>CLS</th><th>WR</th><th>AVG</th></tr></thead>
                  <tbody>${byPatternRows || '<tr><td colspan="5" class="empty">no live patterns yet</td></tr>'}</tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
        <div class="mod-panel sig-chart-panel">
          <div class="mod-panel-title">SETUP PREVIEW</div>
          <div id="sig-chart-pane" class="sig-chart-pane">
            <div class="sig-chart-empty">Select a setup row above</div>
          </div>
        </div>
      `;

      // ── Heatmap tab: pattern × regime grid (PF + count per cell, color by PF) ──
      function pfFill(pf) {
        if (pf == null || isNaN(pf)) return 'rgba(140,140,140,0.18)';
        if (pf >= 1.4) return 'rgba(74,222,128,0.55)';
        if (pf >= 1.2) return 'rgba(74,222,128,0.35)';
        if (pf >= 1.0) return 'rgba(229,185,76,0.30)';
        if (pf >= 0.8) return 'rgba(248,113,113,0.30)';
        return 'rgba(248,113,113,0.55)';
      }
      const playbookPatterns = (playbook.patterns || []).slice().sort((a, b) => (b.profit_factor || 0) - (a.profit_factor || 0));
      const heatmapRows = playbookPatterns.map(p => {
        const overall = p.profit_factor;
        const overallWr = p.win_rate;
        const reg = p.by_regime || {};
        const cell = (k) => {
          const r = reg[k];
          if (!r || r.count == null) return `<td style="background:rgba(140,140,140,0.05);color:var(--fg-faint);text-align:center">—</td>`;
          const pf = r.profit_factor;
          // Show PF prominently; sample size on a small second line so it's
          // clearly "trade count" not "× multiplication". Wrapping in <div>s
          // gives proper line break inside the td.
          return `<td style="background:${pfFill(pf)};text-align:right;font-family:var(--font-mono);padding:3px 8px;line-height:1.15" title="${k}: ${r.count.toLocaleString()} historical signals · WR ${r.win_rate?.toFixed(0)}% · avg ${r.avg_return?.toFixed(2)}%">
            <div style="font-size:13px;font-weight:700">${pf != null ? pf.toFixed(2) : '—'}</div>
            <div style="font-size:9px;color:var(--fg-dim);font-weight:400">n=${r.count.toLocaleString()}</div>
          </td>`;
        };
        const status = p.quarantined ? `<span class="sig-quarantine">Q-${p.quarantine_tier || ''}</span>`
                     : p.passes_gate === false ? '<span class="sig-blocked">BLOCKED</span>'
                     : '<span class="sig-active">active</span>';
        return `<tr>
          <td class="pat">${escSig(p.signal_type)}</td>
          <td class="${'gd-' + (p.grade || '').toLowerCase()}">${p.grade || '—'}</td>
          <td class="mono ${overall >= 1.1 ? 'num-up' : 'num-dn'}">${overall != null ? overall.toFixed(2) : '—'}</td>
          <td class="mono">${overallWr != null ? overallWr.toFixed(0) + '%' : '—'}</td>
          <td class="mono">${p.occurrences ?? '—'}</td>
          ${cell('BULL')}${cell('CAUTION')}${cell('BEAR')}
          <td>${status}</td>
        </tr>`;
      }).join('');
      const heatmapContent = `
        <div class="mod-panel">
          <div class="mod-panel-title">SIGNAL HEATMAP · pattern × regime · profit-factor color-coded</div>
          <div class="tbl-wrap">
            <table class="tbl-dense">
              <thead><tr>
                <th rowspan="2" style="vertical-align:bottom">PATTERN</th>
                <th rowspan="2" style="vertical-align:bottom">GD</th>
                <th class="num" rowspan="2" style="vertical-align:bottom" data-glossary="PF">PF<br><span style="font-weight:400;color:var(--fg-dim)">overall</span></th>
                <th class="num" rowspan="2" style="vertical-align:bottom" data-glossary="WR">WR<br><span style="font-weight:400;color:var(--fg-dim)">overall</span></th>
                <th class="num" rowspan="2" style="vertical-align:bottom" data-glossary="OCC">OCC<br><span style="font-weight:400;color:var(--fg-dim)">total</span></th>
                <th colspan="3" style="text-align:center;border-bottom:1px solid var(--border)">PROFIT FACTOR BY REGIME</th>
                <th rowspan="2" style="vertical-align:bottom">STATUS</th>
              </tr><tr>
                <th class="num" style="font-size:9px;font-weight:400;color:#4ADE80">BULL ↗</th>
                <th class="num" style="font-size:9px;font-weight:400;color:#fbbf24">CAUTION →</th>
                <th class="num" style="font-size:9px;font-weight:400;color:#f87171">BEAR ↘</th>
              </tr></thead>
              <tbody>${heatmapRows || '<tr><td colspan="9" class="empty">no patterns</td></tr>'}</tbody>
            </table>
          </div>
          <div class="chart-legend">
            <span><span class="lg-line" style="background:rgba(74,222,128,0.55)"></span>PF ≥ 1.4 strong</span>
            <span><span class="lg-line" style="background:rgba(74,222,128,0.35)"></span>PF ≥ 1.2 good</span>
            <span><span class="lg-line" style="background:rgba(229,185,76,0.30)"></span>PF ≥ 1.0 marginal</span>
            <span><span class="lg-line" style="background:rgba(248,113,113,0.30)"></span>PF &lt; 1.0 losing</span>
            <span class="chart-note"><b>Each cell = profit factor for that pattern when fired in that regime · n = trade count (sample size).</b> BULL/CAUTION/BEAR are the macro regime at signal time (same classifier as the regime card above — 4 health-check conditions). PF &lt;1 = losing. Sample size matters: PF 1.5 with n=10 is unreliable, PF 1.2 with n=1000 is solid evidence. Regime-locked patterns (BOS, Liquidity Sweep) are only allowed to fire in named regimes.</span>
          </div>
        </div>
      `;

      // ── Backtest tab: per-pattern stats from pattern-playbook (all 12),
      //    enriched with advanced_metrics (Sharpe/MaxDD/AvgWin/AvgLoss only
      //    exist for patterns with live closed trades). ──
      const adv = summary?.advanced_metrics || {};
      const ag  = summary?.adaptive_grades || {};
      const advPatterns = (playbook.patterns || []).map(p => {
        const live = adv[p.signal_type] || {};
        const grad = ag[p.signal_type] || {};
        return {
          signal_type: p.signal_type,
          grade: p.grade,
          profit_factor: p.profit_factor,
          win_rate: p.win_rate,
          expectancy: p.expectancy,
          backtest_count: p.occurrences,
          live_count: live.closed ?? grad.live_count ?? 0,
          // Live-only enrichment fields (— when no live trades)
          avg_win: live.avg_win,
          avg_loss: live.avg_loss,
          sharpe: live.sharpe,
          max_drawdown: live.max_drawdown,
          avg_hold_days: live.avg_hold_days,
          regime_lock: grad.regime_lock,
          quarantined: p.quarantined,
          passes_gate: p.passes_gate,
        };
      }).sort((a, b) => (b.profit_factor || 0) - (a.profit_factor || 0));
      const backtestRows = advPatterns.map(p => {
        const status = p.quarantined ? '<span class="sig-quarantine">Q</span>'
                     : p.passes_gate === false ? '<span class="sig-blocked">BLOCK</span>'
                     : '';
        return `
          <tr>
            <td class="pat">${escSig(p.signal_type)} ${status}</td>
            <td class="${'gd-' + (p.grade || '').toLowerCase()}">${p.grade || '—'}</td>
            <td class="mono">${p.backtest_count != null ? fmt.compact(p.backtest_count) : '—'}</td>
            <td class="mono ${p.live_count > 0 ? '' : 'sig-dim'}">${p.live_count ?? 0}</td>
            <td class="mono ${p.profit_factor >= 1.1 ? 'num-up' : 'num-dn'}">${p.profit_factor != null ? p.profit_factor.toFixed(2) : '—'}</td>
            <td class="mono ${wrClass(p.win_rate)}">${p.win_rate != null ? p.win_rate.toFixed(0) + '%' : '—'}</td>
            <td class="mono ${pnlClass(p.expectancy)}">${p.expectancy != null ? p.expectancy.toFixed(2) + '%' : '—'}</td>
            <td class="mono num-up">${p.avg_win != null ? '+' + p.avg_win.toFixed(2) + '%' : '—'}</td>
            <td class="mono num-dn">${p.avg_loss != null ? '-' + p.avg_loss.toFixed(2) + '%' : '—'}</td>
            <td class="mono ${p.sharpe >= 0 ? 'num-up' : 'num-dn'}">${p.sharpe != null ? p.sharpe.toFixed(2) : '—'}</td>
            <td class="mono num-dn">${p.max_drawdown != null ? '-' + p.max_drawdown.toFixed(2) + '%' : '—'}</td>
            <td class="mono">${p.avg_hold_days != null ? p.avg_hold_days.toFixed(1) + 'd' : '—'}</td>
            <td class="mono">${p.regime_lock ? `<span class="sig-regime-lock">${escSig(p.regime_lock)}</span>` : '—'}</td>
          </tr>
        `;
      }).join('');
      const backtestContent = `
        <div class="mod-panel">
          <div class="mod-panel-title">BACKTEST STATISTICS · per-pattern · live + historical blend</div>
          <div class="tbl-wrap">
            <table class="tbl-dense">
              <thead><tr>
                <th>PATTERN</th><th>GD</th>
                <th class="num">BT N</th><th class="num">LIVE N</th>
                <th class="num">PF</th><th class="num">WR</th><th class="num">EXP</th>
                <th class="num">AVG WIN</th><th class="num">AVG LOSS</th>
                <th class="num">SHARPE</th><th class="num">MAX DD</th><th class="num">HOLD</th>
                <th>REGIME LOCK</th>
              </tr></thead>
              <tbody>${backtestRows || '<tr><td colspan="13" class="empty">no backtest data</td></tr>'}</tbody>
            </table>
          </div>
          <div class="chart-legend">
            <span class="chart-note"><b>BT N</b> backtest sample size (historical occurrences) · <b>LIVE N</b> live trades closed since signal-tracking went live · <b>PF</b> profit factor (gross profit / gross loss; ≥1.1 passes quality gate) · <b>WR</b> win rate · <b>EXP</b> expectancy (avg P&L per trade) · <b>AVG WIN/AVG LOSS/SHARPE/MAX DD/HOLD</b> are LIVE-ONLY metrics — only computed once a pattern has closed live trades, so most show "—" until the ledger fills. <b>REGIME LOCK</b> pattern only fires in named regime. <b>Q</b> = quarantined. <b>BLOCK</b> = fails PF gate.</span>
          </div>
        </div>
      `;

      // ── Adaptive Grades tab: blended (backtest + live) per-pattern grades ──
      const grades = Object.keys(adaptiveGrades).map(k => ({ signal_type: k, ...adaptiveGrades[k] }))
        .sort((a, b) => (b.blended_pf || 0) - (a.blended_pf || 0));
      const gradesRows = grades.map(g => {
        const downCls = g.downgraded ? 'num-warn' : '';
        return `
          <tr>
            <td class="pat">${escSig(g.signal_type)}</td>
            <td class="${'gd-' + (g.grade || '').toLowerCase()}">${g.grade || '—'}</td>
            <td class="mono ${(g.blended_pf || 0) >= 1.1 ? 'num-up' : 'num-dn'}"><b>${g.blended_pf != null ? g.blended_pf.toFixed(2) : '—'}</b></td>
            <td class="mono ${wrClass(g.blended_wr)}">${g.blended_wr != null ? g.blended_wr.toFixed(0) + '%' : '—'}</td>
            <td class="mono">${g.backtest_pf != null ? g.backtest_pf.toFixed(2) : '—'}</td>
            <td class="mono">${g.backtest_wr != null ? g.backtest_wr.toFixed(0) + '%' : '—'}</td>
            <td class="mono">${g.backtest_count != null ? fmt.compact(g.backtest_count) : '—'}</td>
            <td class="mono ${(g.live_pf || 0) >= 1.1 ? 'num-up' : (g.live_pf != null && g.live_pf > 0) ? 'num-dn' : 'sig-dim'}">${g.live_pf != null ? g.live_pf.toFixed(2) : '—'}</td>
            <td class="mono ${wrClass(g.live_wr)}">${g.live_wr != null ? g.live_wr.toFixed(0) + '%' : '—'}</td>
            <td class="mono ${g.live_count > 0 ? '' : 'sig-dim'}">${g.live_count ?? 0}</td>
            <td class="mono ${pnlClass(g.live_avg_return)}">${g.live_avg_return != null ? (g.live_avg_return >= 0 ? '+' : '') + g.live_avg_return.toFixed(2) + '%' : '—'}</td>
            <td class="mono">${escSig(g.blend_weights || '—')}</td>
            <td class="mono">${g.regime_lock ? `<span class="sig-regime-lock">${escSig(g.regime_lock)}</span>` : '—'}</td>
            <td class="${downCls}" style="font-size:10px">${g.downgraded ? escSig(g.downgrade_reason || 'downgraded') : ''}</td>
          </tr>
        `;
      }).join('');
      const gradesContent = `
        <div class="mod-panel">
          <div class="mod-panel-title">ADAPTIVE PATTERN GRADES · live + backtest blend · ${grades.length} patterns</div>
          <div class="tbl-wrap">
            <table class="tbl-dense">
              <thead><tr>
                <th>PATTERN</th><th>GD</th>
                <th class="num">BLEND PF</th><th class="num">BLEND WR</th>
                <th class="num">BT PF</th><th class="num">BT WR</th><th class="num">BT N</th>
                <th class="num">LIVE PF</th><th class="num">LIVE WR</th><th class="num">LIVE N</th><th class="num">LIVE AVG</th>
                <th class="num">WEIGHTS</th>
                <th>REGIME LOCK</th><th>NOTES</th>
              </tr></thead>
              <tbody>${gradesRows || '<tr><td colspan="14" class="empty">no adaptive grades</td></tr>'}</tbody>
            </table>
          </div>
          <div class="chart-legend">
            <span class="chart-note"><b>BLEND PF/WR</b> = the working grade (backtest + live blended by WEIGHTS column, e.g. "100/0" = pure backtest until live sample is meaningful) · <b>BT</b> = historical backtest (large sample, slow to update) · <b>LIVE</b> = live closed trades since signal-tracking went live (small sample, recent reality) · <b>REGIME LOCK</b> = pattern only allowed to fire in named regime · <b>NOTES</b> = downgrade reason if the live performance forced a grade reduction</span>
          </div>
        </div>
      `;

      // ── Live Trades tab: open + closed + equity curve ──
      // Crosshair state cached on closure — bindClicks() wires after innerHTML.
      let _eqPoints = [];
      let _eqSx = null, _eqW = 820;
      let _eqMode = window._sigEqMode || 'dollar';  // 'dollar' or 'alpha'
      function buildEquityCurveChart(curve, closed) {
        // Two modes:
        //  - 'alpha'  : Σ of return_pct (no sizing). Uses pre-computed equity_curve
        //               for per-trade resolution (one point per trade, not per day).
        //  - 'dollar' : Account-impact view. Per-trade compounding with sizer applied.
        // One point per trade — no date-bucketing, so same-day trades each get a point.
        const sortedClosed = (closed || []).slice().sort(
          (a, b) => (a.exit_date || '').localeCompare(b.exit_date || ''));
        if (!sortedClosed.length) return '<div class="cal-empty">no closed trades yet</div>';
        const acct = sizer.account;
        const isAlpha = _eqMode === 'alpha';

        // Seed point (start of curve)
        const seedDate = (isAlpha && curve && curve.length ? curve[0].date : sortedClosed[0].exit_date);
        const points = [{ date: seedDate, dollar: acct, alpha: 0, ret: 0, tradePnl: 0, ticker: '', signal_type: '', isSeed: true }];

        if (isAlpha && curve && curve.length) {
          // Use scorecard's pre-computed equity_curve: cumulative α per trade
          curve.forEach(pt => {
            points.push({
              date:        pt.date,
              dollar:      acct,
              alpha:       pt.cumulative,
              ret:         pt.return_pct,
              tradePnl:    pt.return_pct,
              ticker:      pt.ticker      || '',
              signal_type: pt.signal_type || '',
            });
          });
        } else {
          // Dollar mode: apply sizer per trade, compound running equity
          let running = acct;
          sortedClosed.forEach(t => {
            const ps = computeSize({
              sizer, entry: t.entry_price, stop: t.stop_loss,
              regime: regName, patternStats: patternStatsFor(t.signal_type), returnPct: t.return_pct,
            });
            const dollarPnL = ps.dollarPnL != null ? ps.dollarPnL : 0;
            running += dollarPnL;
            points.push({
              date:        t.exit_date     || '—',
              dollar:      running,
              alpha:       0,
              ret:         ((running - acct) / acct) * 100,
              tradePnl:    t.return_pct   || 0,
              ticker:      t.ticker       || '',
              signal_type: t.signal_type  || '',
            });
          });
        }

        const W = 820, H = 220, padL = 56, padR = 14, padT = 14, padB = 24;
        const innerW = W - padL - padR, innerH = H - padT - padB;
        _eqW = W;

        const yField   = isAlpha ? 'alpha' : 'dollar';
        const baseline = isAlpha ? 0 : acct;
        const yFmt     = isAlpha
          ? (v) => (v >= 0 ? '+' : '') + v.toFixed(1) + '%'
          : (v) => fmtUsd(v, true);
        const vals = points.map(p => p[yField]);
        let lo = Math.min(baseline, ...vals), hi = Math.max(baseline, ...vals);
        const rangePad = (hi - lo) * 0.08 || (isAlpha ? 1 : acct * 0.01);
        lo -= rangePad; hi += rangePad;

        const n  = points.length;
        const sx = (i) => padL + (i / Math.max(1, n - 1)) * innerW;
        const sy = (v)  => padT + (1 - (v - lo) / (hi - lo)) * innerH;
        _eqPoints = points.map((p, i) => ({ ...p, _x: sx(i), _y: sy(p[yField]) }));
        _eqSx = sx;

        // ── Smooth Catmull-Rom → cubic Bézier path ─────────────────────────
        const coords = points.map((p, i) => ({ x: sx(i), y: sy(p[yField]) }));
        function catmullToBezier(pts) {
          if (pts.length < 2) return '';
          const d = [`M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`];
          for (let i = 1; i < pts.length; i++) {
            const p0 = pts[Math.max(0, i - 2)];
            const p1 = pts[i - 1];
            const p2 = pts[i];
            const p3 = pts[Math.min(pts.length - 1, i + 1)];
            const cp1x = p1.x + (p2.x - p0.x) / 6;
            const cp1y = p1.y + (p2.y - p0.y) / 6;
            const cp2x = p2.x - (p3.x - p1.x) / 6;
            const cp2y = p2.y - (p3.y - p1.y) / 6;
            d.push(`C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`);
          }
          return d.join(' ');
        }
        const linePath = catmullToBezier(coords);

        const lastP = points[n - 1];
        const isUp  = lastP[yField] >= baseline;
        const color = isUp ? '#4ADE80' : '#f87171';

        // Gradient fill under the curve
        const gradId   = `eq-g-${Math.random().toString(36).slice(2, 7)}`;
        const yBase    = sy(baseline);
        const fillPath = `${linePath} L ${sx(n - 1).toFixed(1)} ${yBase.toFixed(1)} L ${sx(0).toFixed(1)} ${yBase.toFixed(1)} Z`;

        let svg = `<svg class="sig-eq-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;aspect-ratio:${W}/${H};height:auto;display:block">`;
        svg += `<defs><linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.22"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0.02"/>
        </linearGradient></defs>`;

        // Grid lines
        for (let g = 0; g <= 4; g++) {
          const yVal = lo + (g / 4) * (hi - lo), y = sy(yVal);
          svg += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="rgba(255,255,255,0.05)" stroke-width="0.4"/>`;
          svg += `<text x="${padL - 4}" y="${y + 3}" fill="#8b949e" font-size="10" text-anchor="end" font-family="var(--font-mono)">${yFmt(yVal)}</text>`;
        }
        // Baseline dashed line
        svg += `<line x1="${padL}" y1="${yBase}" x2="${W - padR}" y2="${yBase}" stroke="rgba(255,255,255,0.25)" stroke-width="0.6" stroke-dasharray="3 3"/>`;

        // Fill then stroke (drawn after baseline so gradient doesn't cover the line)
        svg += `<path d="${fillPath}" fill="url(#${gradId})" stroke="none"/>`;
        svg += `<path d="${linePath}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/>`;

        // Baseline label — rendered last (on top of fill) with background rect so
        // the curve never blocks it; sits below the dashed line, not above it.
        const baseLbl = isAlpha ? 'baseline 0%' : 'starting account ' + fmtUsd(acct, true);
        const blW = baseLbl.length * 5.8 + 8, blH = 13, blX = padL + 4, blY = yBase + 4;
        svg += `<rect x="${blX - 2}" y="${blY}" width="${blW}" height="${blH}" rx="2" fill="rgba(0,0,0,0.55)"/>`;
        svg += `<text x="${blX + blW / 2}" y="${blY + blH - 3}" fill="#8b949e" font-size="9" text-anchor="middle" font-family="var(--font-mono)">${baseLbl}</text>`;

        // Last-value pill
        const lbl = isAlpha
          ? (lastP.alpha >= 0 ? '+' : '') + lastP.alpha.toFixed(2) + '%'
          : `${fmtUsd(lastP.dollar)} (${lastP.ret >= 0 ? '+' : ''}${lastP.ret.toFixed(2)}%)`;
        const charW = 6.6, padX = 6, bh = 17;
        const bw = Math.max(80, lbl.length * charW + padX * 2);
        const bx = W - padR - bw, by = padT;
        svg += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="3" fill="rgba(0,0,0,0.65)" stroke="${color}" stroke-width="0.7"/>`;
        svg += `<text x="${bx + bw - padX}" y="${by + bh - 5}" fill="${color}" font-size="11" text-anchor="end" font-weight="700" font-family="var(--font-mono)">${escSig(lbl)}</text>`;

        // X-axis date labels (dedupe same-date labels)
        const numLabels = Math.min(6, n);
        const candidates = Array.from({ length: numLabels }, (_, i) =>
          Math.round((i / Math.max(1, numLabels - 1)) * (n - 1)));
        let shownLab = null;
        candidates.forEach(i => {
          const lab = (points[i].date || '').slice(5);
          if (lab === shownLab) return;
          shownLab = lab;
          const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
          svg += `<text x="${sx(i)}" y="${H - 6}" fill="#8b949e" font-size="9" text-anchor="${anchor}" font-family="var(--font-mono)">${escSig(lab)}</text>`;
        });

        // Crosshair elements
        svg += `<line class="sig-eq-crossx" x1="0" y1="${padT}" x2="0" y2="${padT + innerH}" style="stroke:var(--fg);stroke-width:0.6;opacity:0;pointer-events:none;stroke-dasharray:2 2"></line>`;
        svg += `<circle class="sig-eq-crossdot" cx="0" cy="0" r="3.5" style="fill:${color};stroke:var(--fg);stroke-width:0.8;opacity:0;pointer-events:none"></circle>`;
        svg += `<rect class="sig-eq-crosshit" x="${padL}" y="${padT}" width="${innerW}" height="${innerH}" style="fill:transparent;cursor:crosshair"></rect>`;
        svg += '</svg>';

        return `<div class="sig-eq-wrap" style="position:relative">
          ${svg}
          <div class="sig-eq-tt" style="display:none"></div>
        </div>`;
      }
      // Wire the equity-curve crosshair after innerHTML is set. Reads
      // _eqPoints (built during buildEquityCurveChart) and the SVG's
      // bounding rect to translate mouse → viewBox coords → nearest point.
      function wireEquityCurve(root) {
        const wrap = root.querySelector('.sig-eq-wrap');
        if (!wrap || !_eqPoints.length) return;
        const svg = wrap.querySelector('.sig-eq-svg');
        const xLine = wrap.querySelector('.sig-eq-crossx');
        const dot = wrap.querySelector('.sig-eq-crossdot');
        const hit = wrap.querySelector('.sig-eq-crosshit');
        const tt  = wrap.querySelector('.sig-eq-tt');
        if (!svg || !xLine || !dot || !hit || !tt) return;
        const W = _eqW;
        function nearestIdx(xViewBox) {
          let best = 0, bestDist = Infinity;
          for (let i = 0; i < _eqPoints.length; i++) {
            const d = Math.abs(_eqPoints[i]._x - xViewBox);
            if (d < bestDist) { bestDist = d; best = i; }
          }
          return best;
        }
        function onMove(ev) {
          const rect = svg.getBoundingClientRect();
          if (!rect.width) return;
          const xView = ((ev.clientX - rect.left) / rect.width) * W;
          const i = nearestIdx(xView);
          const p = _eqPoints[i];
          // Position crosshair line + dot in viewBox coords
          xLine.setAttribute('x1', p._x); xLine.setAttribute('x2', p._x);
          xLine.style.opacity = '0.7';
          dot.setAttribute('cx', p._x); dot.setAttribute('cy', p._y);
          dot.style.opacity = '1';
          // Tooltip in client coords
          const ttX = ((p._x / W) * rect.width);
          const isAlphaMode = _eqMode === 'alpha';
          const tradePnlCls = (p.tradePnl || 0) >= 0 ? 'num-up' : 'num-dn';
          const cumCls = isAlphaMode
            ? ((p.alpha || 0) >= 0 ? 'num-up' : 'num-dn')
            : ((p.ret   || 0) >= 0 ? 'num-up' : 'num-dn');
          const fromAcct = p.dollar - sizer.account;
          const fromCls  = fromAcct >= 0 ? 'num-up' : 'num-dn';
          tt.innerHTML = `
            <div class="sig-tt-row"><span class="sig-tt-k">DATE</span><span class="sig-tt-v mono">${escSig(p.date || '—')}</span></div>
            ${p.isSeed ? '' : `
            <div class="sig-tt-row"><span class="sig-tt-k">TICKER</span><span class="sig-tt-v mono" style="color:var(--accent)">${escSig(p.ticker)}</span></div>
            <div class="sig-tt-row"><span class="sig-tt-k">PATTERN</span><span class="sig-tt-v">${escSig(p.signal_type)}</span></div>
            <div class="sig-tt-row"><span class="sig-tt-k">TRADE RET</span><span class="sig-tt-v mono ${tradePnlCls}">${(p.tradePnl || 0) >= 0 ? '+' : ''}${(p.tradePnl || 0).toFixed(2)}%</span></div>
            `}
            ${isAlphaMode
              ? `<div class="sig-tt-row"><span class="sig-tt-k">CUM α %</span><span class="sig-tt-v mono ${cumCls}">${(p.alpha || 0) >= 0 ? '+' : ''}${(p.alpha || 0).toFixed(2)}%</span></div>`
              : `<div class="sig-tt-row"><span class="sig-tt-k">EQUITY</span><span class="sig-tt-v mono">${fmtUsd(p.dollar)}</span></div>
                 <div class="sig-tt-row"><span class="sig-tt-k">TOTAL P&L</span><span class="sig-tt-v mono ${fromCls}">${fromAcct >= 0 ? '+' : ''}${fmtUsd(fromAcct, true)} (${(p.ret || 0) >= 0 ? '+' : ''}${(p.ret || 0).toFixed(2)}%)</span></div>`
            }
          `;
          tt.style.display = 'block';
          // Clamp tooltip horizontally so it stays on-chart
          const ttW = tt.offsetWidth || 160;
          let left = ttX + 12;
          if (left + ttW > rect.width - 4) left = ttX - ttW - 12;
          if (left < 4) left = 4;
          tt.style.left = left + 'px';
          tt.style.top  = '6px';
        }
        function onLeave() {
          xLine.style.opacity = '0';
          dot.style.opacity = '0';
          tt.style.display = 'none';
        }
        hit.addEventListener('mousemove', onMove);
        hit.addEventListener('mouseleave', onLeave);
      }
      const openRows = openTrades.slice(0, 50).map(t => {
        const dirC = t.direction === 'long' ? 'num-up' : 'num-dn';
        const ps = computeSize({
          sizer, entry: t.entry_price, stop: t.stop_loss,
          regime: regName, patternStats: patternStatsFor(t.signal_type),
        });
        const unrlPct = t.unrealized_pnl;
        const unrlDollar = ps.shares > 0 ? (ps.shares * t.entry_price * (unrlPct / 100)) : null;
        const pnlCls = unrlPct == null ? '' : unrlPct > 0 ? 'num-up' : 'num-dn';
        return `<tr>
          <td class="tk clickable" data-tk="${escSig(t.ticker)}">${escSig(t.ticker)}</td>
          <td class="pat">${escSig(t.signal_type)}</td>
          <td class="${dirC}">${t.direction === 'long' ? '▲' : '▼'}</td>
          <td class="mono">${escSig(t.signal_date || '—')}</td>
          <td class="mono">${fmt.money(t.entry_price)}</td>
          <td class="mono">${fmt.money(t.current_price)}</td>
          <td class="mono num-dn">${fmt.money(t.stop_loss)}</td>
          <td class="mono num-up">${fmt.money(t.take_profit)}</td>
          <td class="mono ${pnlCls}">${unrlPct != null ? (unrlPct >= 0 ? '+' : '') + unrlPct.toFixed(2) + '%' : '—'}</td>
          <td class="mono ${pnlCls}">${unrlDollar != null ? (unrlDollar >= 0 ? '+' : '') + fmtUsd(unrlDollar, true) : '—'}</td>
          <td class="mono">${ps.shares > 0 ? ps.shares : '—'}</td>
          <td class="mono">${ps.positionValue > 0 ? fmtUsd(ps.positionValue, true) : '—'}</td>
          <td class="mono num-dn">${ps.dollarRisk > 0 ? '-' + fmtUsd(ps.dollarRisk, true) : '—'}</td>
        </tr>`;
      }).join('');
      const closedRows = closedTrades.map(t => {
        const dirC = t.direction === 'long' ? 'num-up' : 'num-dn';
        const ps = computeSize({
          sizer, entry: t.entry_price, stop: t.stop_loss,
          regime: regName, patternStats: patternStatsFor(t.signal_type), returnPct: t.return_pct,
        });
        const pct = t.return_pct;
        const pnlCls = pct == null ? '' : pct > 0 ? 'num-up' : 'num-dn';
        const outcomeCls = t.outcome === 'tp_hit' ? 'num-up' : t.outcome === 'sl_hit' ? 'num-dn' : '';
        return `<tr>
          <td class="tk clickable" data-tk="${escSig(t.ticker)}">${escSig(t.ticker)}</td>
          <td class="pat">${escSig(t.signal_type)}</td>
          <td class="${dirC}">${t.direction === 'long' ? '▲' : '▼'}</td>
          <td class="mono">${escSig(t.exit_date || '—')}</td>
          <td class="mono">${t.holding_days != null ? t.holding_days + 'd' : '—'}</td>
          <td class="mono">${fmt.money(t.entry_price)}</td>
          <td class="mono">${fmt.money(t.exit_price)}</td>
          <td class="mono ${pnlCls}">${pct != null ? (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%' : '—'}</td>
          <td class="mono ${pnlCls}">${ps.dollarPnL != null ? (ps.dollarPnL >= 0 ? '+' : '') + fmtUsd(ps.dollarPnL, true) : '—'}</td>
          <td class="mono ${outcomeCls}" style="font-size:10px">${escSig(t.outcome || '—')}</td>
        </tr>`;
      }).join('');
      const liveContent = `
        <div class="mod-panel">
          <div class="mod-panel-title" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span>EQUITY CURVE · ${_eqMode === 'alpha' ? 'Strategy α (sum of return %)' : 'Portfolio $ (sized + compounded)'} · ${closedTrades.length} closed trades</span>
            <span style="margin-left:auto;display:inline-flex;gap:4px">
              <button class="sig-eq-mode-btn${_eqMode === 'dollar' ? ' active' : ''}" data-eq-mode="dollar" type="button">Portfolio $</button>
              <button class="sig-eq-mode-btn${_eqMode === 'alpha' ? ' active' : ''}" data-eq-mode="alpha" type="button">Strategy α %</button>
            </span>
          </div>
          <div class="chart-wrap">${buildEquityCurveChart(equityCurve, closedTrades)}</div>
          <div class="chart-legend"><span class="chart-note">${
            _eqMode === 'alpha'
              ? `<b>Strategy α %</b> = sum of every closed trade&rsquo;s return percentage, ignoring sizing. Pure strategy edge: assumes equal allocation per signal. Matches the old page&rsquo;s α mode.`
              : `starting account = <b>${fmtUsd(sizer.account)}</b> · method = <b>${escSig(sizer.method.replace(/_/g, ' '))}</b> · risk = <b>${sizer.riskPct}%</b> · walks each closed trade chronologically with your sizer applied → real account impact. <b>This is much smaller than α %</b> because Half Kelly only allocates ~2-3% per trade.`
          }</span></div>
        </div>
        <div class="mod-panel">
          <div class="mod-panel-title">OPEN TRADES · ${openTrades.length} active${openTrades.length > 50 ? ' (showing first 50)' : ''}</div>
          <div class="tbl-wrap">
            <table class="tbl-dense">
              <thead><tr>
                <th>TICKER</th><th>PATTERN</th><th>DIR</th><th>SIGNAL</th>
                <th class="num">ENTRY</th><th class="num">LAST</th><th class="num">STOP</th><th class="num">TGT</th>
                <th class="num">UNRL %</th><th class="num">UNRL $</th>
                <th class="num">SHARES</th><th class="num">POS $</th><th class="num">RISK $</th>
              </tr></thead>
              <tbody>${openRows || '<tr><td colspan="13" class="empty">no open trades</td></tr>'}</tbody>
            </table>
          </div>
        </div>
        <div class="mod-panel">
          <div class="mod-panel-title">CLOSED TRADES · ${closedTrades.length} closed</div>
          <div class="tbl-wrap">
            <table class="tbl-dense">
              <thead><tr>
                <th>TICKER</th><th>PATTERN</th><th>DIR</th><th>EXIT</th>
                <th class="num">HOLD</th><th class="num">ENTRY</th><th class="num">EXIT $</th>
                <th class="num">RET %</th><th class="num">P&amp;L $</th><th>OUTCOME</th>
              </tr></thead>
              <tbody>${closedRows || '<tr><td colspan="10" class="empty">no closed trades yet</td></tr>'}</tbody>
            </table>
          </div>
        </div>
      `;

      // ── How It Works tab: methodology + pattern playbook descriptions ──
      const playbookByPF = (playbook.patterns || []).slice().sort((a, b) => (b.profit_factor || 0) - (a.profit_factor || 0));
      const playbookCards = playbookByPF.map(p => {
        const para = (p.paragraph || '').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'); // markdown bold
        return `<div class="sig-how-card">
          <div class="sig-how-head">
            <span class="${'gd-' + (p.grade || '').toLowerCase()}">${p.grade || '—'}</span>
            <span class="pat" style="font-weight:700">${escSig(p.signal_type)}</span>
            <span style="color:var(--fg-dim);font-size:10px">${p.direction || ''} · PF ${p.profit_factor != null ? p.profit_factor.toFixed(2) : '—'} · WR ${p.win_rate != null ? p.win_rate.toFixed(0) + '%' : '—'} · ${p.occurrences != null ? fmt.compact(p.occurrences) : '—'} backtests</span>
            ${p.quarantined ? '<span class="sig-quarantine">QUARANTINED</span>' : ''}
            ${p.passes_gate === false ? '<span class="sig-blocked">BLOCKED</span>' : ''}
          </div>
          <p class="sig-how-body">${para}</p>
        </div>`;
      }).join('');
      const howContent = `
        <div class="mod-panel">
          <div class="mod-panel-title">POSITION SIZING METHODS · what the sizer bar at top of SIG does</div>
          <div class="sig-how-meth">
            <div class="sig-how-meth-row">
              <b>Fixed Fractional</b> — risk a flat % of account on every trade. Position size = <code>(account × risk%) / |entry − stop|</code>. Predictable and conservative; what most retail systems use.
            </div>
            <div class="sig-how-meth-row">
              <b>Half Kelly</b> — math-optimal sizing using each pattern's historical win-rate + avg-win + avg-loss. Full Kelly fraction = <code>(WR × avgWin − (1 − WR) × avgLoss) / avgWin</code>. Half Kelly = ½ of that, capped at the risk% as a safety ceiling. Sized larger for high-conviction patterns, smaller for marginal ones.
            </div>
            <div class="sig-how-meth-row">
              <b>Regime-Scaled</b> — Fixed Fractional × regime multiplier (BULL 1.0×, CAUTION 0.5×, BEAR 0.3×). Compresses dollar exposure during risk-off periods. Same approach the kill-switch uses to gate signal flow.
            </div>
          </div>
        </div>
        <div class="mod-panel">
          <div class="mod-panel-title">PATTERN PLAYBOOK · ${playbookByPF.length} patterns · sorted by profit factor</div>
          <div class="sig-how-list">${playbookCards}</div>
          <div class="chart-legend"><span class="chart-note">each pattern's <b>grade</b> is computed adaptively from blended (backtest + live) profit factor: A ≥ 1.2 · B ≥ 1.1 · C ≥ 1.0 · D &lt; 1.0. Quarantined = paused due to live underperformance. Blocked = fails the PF ≥ 1.1 quality gate.</span></div>
        </div>
      `;

      function tabContent() {
        switch (state.tab) {
          case 'heatmap':  return heatmapContent;
          case 'backtest': return backtestContent;
          case 'grades':   return gradesContent;
          case 'live':     return liveContent;
          case 'how':      return howContent;
          default:         return setupsContent;
        }
      }

      const tabs = [
        { id: 'setups',   label: `Setups · ${totalSetups}` },
        { id: 'heatmap',  label: `Heatmap · ${playbookPatterns.length}` },
        { id: 'backtest', label: `Backtest · ${advPatterns.length}` },
        { id: 'grades',   label: `Grades · ${grades.length}` },
        { id: 'live',     label: `Live Trades · ${openTrades.length + closedTrades.length}` },
        { id: 'how',      label: `How It Works` },
      ];
      const tabBtns = tabs.map(t => `<button class="sig-tab-btn${t.id === state.tab ? ' active' : ''}" data-sig-tab="${t.id}" type="button">${t.label}</button>`).join('');

      body.innerHTML = `
        <style>
          [data-mod-panel="sig"] .sig-ks-banner {
            display:flex; gap:10px; align-items:flex-start; padding:8px 12px;
            border:1px solid; border-left-width:3px; border-radius:3px; margin-bottom:8px;
          }
          [data-mod-panel="sig"] .sig-ks-caution-only { background:rgba(251,191,36,0.10); border-color:rgba(251,191,36,0.55); }
          [data-mod-panel="sig"] .sig-ks-paused      { background:rgba(248,113,113,0.10); border-color:rgba(248,113,113,0.55); }
          [data-mod-panel="sig"] .sig-ks-icon { font-size:18px; color:#fbbf24; line-height:1; }
          [data-mod-panel="sig"] .sig-ks-title { font-size:11px; font-weight:700; color:var(--fg); letter-spacing:0.4px; }
          [data-mod-panel="sig"] .sig-ks-detail { font-size:10px; color:var(--fg-dim); margin-top:3px; font-family:var(--font-mono); }

          [data-mod-panel="sig"] .sig-macro-strip { display:grid; grid-template-columns:repeat(6,1fr); gap:6px; margin-bottom:8px; }
          @media (max-width:1100px) { [data-mod-panel="sig"] .sig-macro-strip { grid-template-columns:repeat(2,1fr); } }
          [data-mod-panel="sig"] .sig-macro {
            background:var(--bg-card); border:1px solid var(--border); border-radius:3px; padding:6px 8px;
          }
          [data-mod-panel="sig"] .sig-macro-regime { grid-column: span 1; }
          [data-mod-panel="sig"] .sig-regime-bull { border-left:3px solid #4ADE80; }
          [data-mod-panel="sig"] .sig-regime-caution { border-left:3px solid #fbbf24; }
          [data-mod-panel="sig"] .sig-regime-bear { border-left:3px solid #f87171; }
          [data-mod-panel="sig"] .sig-macro-lbl { font-size:9px; color:var(--fg-dim); text-transform:uppercase; letter-spacing:0.6px; }
          [data-mod-panel="sig"] .sig-macro-val { font-size:14px; font-weight:700; font-family:var(--font-mono); margin-top:2px; }
          [data-mod-panel="sig"] .sig-regime-score { font-size:10px; color:var(--fg-dim); font-weight:400; }
          [data-mod-panel="sig"] .sig-macro-sub { font-size:9px; color:var(--fg-dim); margin-top:2px; }
          [data-mod-panel="sig"] .sig-macro-funnel { font-size:13px; font-weight:700; margin-top:2px; }
          [data-mod-panel="sig"] .sig-arrow { color:var(--fg-faint); margin:0 3px; font-weight:400; }
          [data-mod-panel="sig"] .sig-cond-row { display:flex; gap:3px; flex-wrap:wrap; margin-top:4px; }
          [data-mod-panel="sig"] .sig-cond {
            font-size:8.5px; padding:1px 4px; border-radius:2px; font-family:var(--font-mono);
          }
          [data-mod-panel="sig"] .sig-cond.pass { background:rgba(74,222,128,0.15); color:#4ADE80; }
          [data-mod-panel="sig"] .sig-cond.fail { background:rgba(140,140,140,0.10); color:var(--fg-faint); text-decoration:line-through; }

          [data-mod-panel="sig"] .sig-kpi-strip { display:grid; grid-template-columns:repeat(8,1fr); gap:5px; margin-bottom:8px; }
          @media (max-width:1100px) { [data-mod-panel="sig"] .sig-kpi-strip { grid-template-columns:repeat(4,1fr); } }
          @media (max-width:600px)  { [data-mod-panel="sig"] .sig-kpi-strip { grid-template-columns:repeat(2,1fr); } }
          [data-mod-panel="sig"] .sig-kpi {
            background:var(--bg-card); border:1px solid var(--border); border-radius:3px; padding:5px 7px;
          }
          [data-mod-panel="sig"] .sig-kpi.accent { border-color:var(--accent); }
          [data-mod-panel="sig"] .sig-kpi-lbl { font-size:8.5px; color:var(--fg-dim); text-transform:uppercase; letter-spacing:0.5px; }
          [data-mod-panel="sig"] .sig-kpi-val { font-size:16px; font-weight:700; font-family:var(--font-mono); margin-top:1px; }
          [data-mod-panel="sig"] .sig-kpi-sub { font-size:8.5px; color:var(--fg-dim); margin-top:1px; font-family:var(--font-mono); }

          [data-mod-panel="sig"] .sig-tabs { display:flex; gap:4px; margin-bottom:8px; flex-wrap:wrap; }
          [data-mod-panel="sig"] .sig-tab-btn {
            background:var(--bg-card); color:var(--fg-dim); border:1px solid var(--border);
            padding:4px 10px; font-size:10px; font-family:var(--font-mono);
            cursor:pointer; border-radius:3px; letter-spacing:0.4px;
          }
          [data-mod-panel="sig"] .sig-tab-btn:hover { color:var(--fg); border-color:#555; }
          [data-mod-panel="sig"] .sig-tab-btn.active { background:var(--accent); color:#0d1117; border-color:var(--accent); }

          [data-mod-panel="sig"] .sig-quarantine {
            font-size:9px; padding:1px 5px; border-radius:2px;
            background:rgba(248,113,113,0.20); color:#f87171; font-family:var(--font-mono); font-weight:700;
          }
          [data-mod-panel="sig"] .sig-blocked {
            font-size:9px; padding:1px 5px; border-radius:2px;
            background:rgba(140,140,140,0.20); color:var(--fg-dim); font-family:var(--font-mono);
          }
          [data-mod-panel="sig"] .sig-active {
            font-size:9px; padding:1px 5px; border-radius:2px;
            background:rgba(74,222,128,0.18); color:#4ADE80; font-family:var(--font-mono);
          }
          [data-mod-panel="sig"] .sig-regime-lock {
            font-size:9px; padding:1px 5px; border-radius:2px;
            background:rgba(167,139,250,0.20); color:#A78BFA; font-family:var(--font-mono); font-weight:700;
          }
          [data-mod-panel="sig"] .sig-dim { color: var(--fg-faint); }

          [data-mod-panel="sig"] .sig-sizer-bar {
            display:flex; align-items:center; gap:10px; flex-wrap:wrap;
            padding:6px 10px; margin-bottom:8px;
            background:var(--bg-card); border:1px solid var(--border); border-left:3px solid var(--accent); border-radius:3px;
            font-size:10px; font-family:var(--font-mono);
          }
          [data-mod-panel="sig"] .sig-sizer-lbl { color:var(--accent); font-weight:700; letter-spacing:0.5px; }
          [data-mod-panel="sig"] .sig-sizer-bar label { color:var(--fg-dim); display:inline-flex; align-items:center; gap:4px; }
          [data-mod-panel="sig"] .sig-sizer-input {
            background:#0d1117; color:var(--fg); border:1px solid #30363d;
            padding:3px 6px; font-size:10px; font-family:var(--font-mono); border-radius:3px;
            width:90px;
          }
          [data-mod-panel="sig"] .sig-sizer-input-sm { width:50px; }
          [data-mod-panel="sig"] .sig-sizer-input:focus { outline:1px solid var(--accent); }
          [data-mod-panel="sig"] .sig-sizer-help {
            display:inline-flex; align-items:center; justify-content:center;
            width:16px; height:16px; border-radius:50%;
            background:rgba(140,140,140,0.18); color:var(--fg-dim); cursor:help;
            font-size:10px; font-weight:700;
          }
          [data-mod-panel="sig"] .sig-sizer-help:hover { color:var(--fg); background:rgba(229,185,76,0.18); }
          [data-mod-panel="sig"] .sig-sizer-applied { margin-left:auto; color:var(--fg-faint); font-size:9.5px; }
          [data-mod-panel="sig"] .sig-pos-col { background:rgba(229,185,76,0.04); }

          [data-mod-panel="sig"] .sig-eq-wrap { position:relative; }
          [data-mod-panel="sig"] .sig-eq-tt {
            position:absolute; min-width:170px; pointer-events:none;
            background:rgba(13,17,23,0.96); border:1px solid var(--accent); border-radius:3px;
            padding:6px 8px; font-size:10px; font-family:var(--font-mono);
            box-shadow:0 4px 12px rgba(0,0,0,0.5);
            z-index:5;
          }
          [data-mod-panel="sig"] .sig-eq-tt .sig-tt-row {
            display:flex; justify-content:space-between; gap:8px; padding:1px 0;
          }
          [data-mod-panel="sig"] .sig-eq-tt .sig-tt-k { color:var(--fg-dim); font-size:9px; letter-spacing:0.4px; }
          [data-mod-panel="sig"] .sig-eq-tt .sig-tt-v { color:var(--fg); font-weight:700; }
          [data-mod-panel="sig"] .sig-eq-mode-btn {
            background:#0d1117; color:var(--fg-dim); border:1px solid #30363d;
            padding:2px 8px; font-size:9px; font-family:var(--font-mono);
            cursor:pointer; border-radius:3px; letter-spacing:0.4px;
          }
          [data-mod-panel="sig"] .sig-eq-mode-btn:hover { color:var(--fg); border-color:#555; }
          [data-mod-panel="sig"] .sig-eq-mode-btn.active { background:var(--accent); color:#0d1117; border-color:var(--accent); }

          [data-mod-panel="sig"] .sig-how-card {
            background:var(--bg-card); border:1px solid var(--border); border-radius:3px;
            padding:8px 10px; margin-bottom:6px;
          }
          [data-mod-panel="sig"] .sig-how-head {
            display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:4px;
          }
          [data-mod-panel="sig"] .sig-how-body {
            font-size:10px; color:#c9d1d9; line-height:1.55; margin:0;
          }
          [data-mod-panel="sig"] .sig-how-meth {
            display:flex; flex-direction:column; gap:6px;
          }
          [data-mod-panel="sig"] .sig-how-meth-row {
            font-size:10.5px; color:#c9d1d9; line-height:1.6;
            padding:6px 10px; background:var(--bg-card); border-left:2px solid var(--accent); border-radius:3px;
          }
          [data-mod-panel="sig"] .sig-how-meth-row code {
            font-family:var(--font-mono); background:rgba(255,255,255,0.06); padding:1px 4px; border-radius:2px;
          }
        </style>

        <div class="mod-head" data-mod-panel="sig">
          <div class="mod-title">${window.OC_TITLE('signals')} · TRADING SIGNALS</div>
          <div class="mod-meta">
            <span class="chip ${regCls}">${escSig(regName)} · ${regScore}/4</span>
            <span class="chip">SETUPS · ${totalSetups}</span>
            <span class="chip">UNIVERSE · ${universeCount}</span>
            ${ks.active ? `<span class="chip num-warn">⚠ ${escSig((ks.level || 'CAUTION').replace(/_/g, '-'))}</span>` : ''}
            <span class="chip chip-dim">${fmt.ago(summary?.computed_at)}</span>
          </div>
        </div>

        <div data-mod-panel="sig">
          ${ksBanner}
          ${macroStrip}
          ${kpiStrip}
          <div class="sig-sizer-bar">
            <span class="sig-sizer-lbl">POSITION SIZER</span>
            <label>Account $ <input type="number" class="sig-sizer-input" data-sizer-field="account" value="${sizer.account}" min="1000" step="1000"></label>
            <label>Risk % <input type="number" class="sig-sizer-input sig-sizer-input-sm" data-sizer-field="riskPct" value="${sizer.riskPct}" min="0.1" max="100" step="0.1"></label>
            <label>Method
              <select class="sig-sizer-input" data-sizer-field="method">
                <option value="fixed_fractional"${sizer.method === 'fixed_fractional' ? ' selected' : ''}>Fixed Fractional</option>
                <option value="half_kelly"${sizer.method === 'half_kelly' ? ' selected' : ''}>Half Kelly</option>
                <option value="regime_scaled"${sizer.method === 'regime_scaled' ? ' selected' : ''}>Regime-Scaled</option>
              </select>
            </label>
            <span class="sig-sizer-help" title="Fixed Fractional: flat risk% per trade. Half Kelly: math-optimal sizing using each pattern's WR/avgWin/avgLoss, halved for safety, capped at risk%. Regime-Scaled: Fixed Fractional × regime multiplier (BULL 1.0× / CAUTION 0.5× / BEAR 0.3×). See How It Works tab for full methodology.">?</span>
            <span class="sig-sizer-applied">applied to all trade tables → see <b>SHARES / POS $ / RISK $</b> columns and Live Trades equity curve</span>
          </div>
          <div class="sig-tabs">${tabBtns}</div>
          <div class="sig-content" data-sig-content>${tabContent()}</div>
        </div>
      `;

      function repaint() {
        const wrap = body.querySelector('[data-sig-content]');
        if (wrap) wrap.innerHTML = tabContent();
        body.querySelectorAll('.sig-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.sigTab === state.tab));
        bindClicks();
      }

      function bindClicks() {
        body.querySelectorAll('.tk.clickable').forEach(el => {
          el.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const t = el.dataset.tk;
            if (t && window.OC_OPEN_MODULE) window.OC_OPEN_MODULE('stock-analysis', { ticker: t });
          });
        });
        body.querySelectorAll('tbody tr[data-row-idx]').forEach(tr => {
          tr.addEventListener('click', () => {
            const idx = Number(tr.dataset.rowIdx);
            selectRow(body, setupList, idx);
          });
        });
        if (state.tab === 'setups' && setupList.length > 0) {
          selectRow(body, setupList, 0);
        }
        if (state.tab === 'live') {
          wireEquityCurve(body);
          // α / $ mode toggle — must trigger a full re-render because
          // liveContent is a string built once in render(); repaint() alone
          // would re-emit the same stale string.
          body.querySelectorAll('.sig-eq-mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
              window._sigEqMode = btn.dataset.eqMode;
              render(body);
            });
          });
        }
      }

      body.querySelectorAll('.sig-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          state.tab = btn.dataset.sigTab;
          window._sigTab = state.tab;
          repaint();
        });
      });

      // Position sizer change → persist + full re-render of the module so
      // every table reflects the new sizing. Uses input/change events to catch
      // both number-input typing (debounced) and select changes.
      let sizerDebounce = null;
      body.querySelectorAll('[data-sizer-field]').forEach(el => {
        const evtName = el.tagName === 'SELECT' ? 'change' : 'input';
        el.addEventListener(evtName, () => {
          const field = el.dataset.sizerField;
          let val;
          if (field === 'account' || field === 'riskPct') {
            val = parseFloat(el.value);
            if (!isFinite(val) || val <= 0) return;
          } else {
            val = el.value;
          }
          if (sizerDebounce) clearTimeout(sizerDebounce);
          sizerDebounce = setTimeout(() => {
            sizer = setSizer({ [field]: val });
            // Full re-render: many tables depend on sizer values
            render(body);
          }, 250);
        });
      });

      bindClicks();
    } catch (e) {
      body.innerHTML = `<div class="mod-err">Failed to load signals: ${e.message}</div>`;
    }
  }

  window.OC_MODULES = window.OC_MODULES || {};
  window.OC_MODULES.signals = { render };
})();
