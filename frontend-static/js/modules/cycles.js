/* CYC · Geocosmic Cycles
 *
 * Long-history asset price + planetary aspect overlays, computed via
 * Skyfield + JPL DE440 ephemeris. Same data backbone as
 * stocks.clawmo.tech/cycles.html — this module is the touch-friendly,
 * pane-sized variant: time-range pills, pinch zoom, drag pan, optional
 * future projection band, and a forward-24mo cluster map.
 *
 * Headline disclosure stays visible: 0 / 1,728 tests survive FDR<0.05
 * across all asset×event×horizon combinations. Treat as context, not edge.
 */
(function () {
  'use strict';
  const { fetchJSON } = window.OC_DATA;

  const STOCKS = 'https://stocks.clawmo.tech';
  const PAIR_COLORS = {
    'Ju-Sa': '#fbbf24', 'Ju-Ur': '#34d399', 'Ju-Ne': '#60a5fa', 'Ju-Pl': '#a78bfa',
    'Sa-Ur': '#fb923c', 'Sa-Ne': '#ec4899', 'Sa-Pl': '#ef4444',
    'Ur-Ne': '#14b8a6', 'Ur-Pl': '#8b5cf6', 'Ne-Pl': '#f472b6',
  };
  const PLANET_COLORS = {
    'Mercury': '#a3e635', 'Venus':   '#facc15', 'Mars':    '#f87171',
    'Jupiter': '#fbbf24', 'Saturn':  '#fb923c', 'Uranus':  '#34d399',
    'Neptune': '#60a5fa', 'Pluto':   '#a78bfa',
  };
  const ASPECT_SHAPE = {
    Cnj: { shape: 'circle',  r: 5 },
    Opp: { shape: 'ring',    r: 5 },
    Sqr: { shape: 'square',  r: 4 },
    Sex: { shape: 'diamond', r: 4 },
  };
  const PAIR_THEMES = {
    'Ju-Sa': '~20yr · macro regime shifts', 'Ju-Ur': '~14yr · innovation breakouts',
    'Ju-Ne': '~13yr · speculation, bubbles', 'Ju-Pl': '~12yr · power/wealth expansion',
    'Sa-Ur': '~45yr · tightening vs disruption', 'Sa-Ne': '~36yr · debt/oil cycles',
    'Sa-Pl': '~33yr · austerity, bear markets', 'Ur-Ne': '~171yr · paradigm shift',
    'Ur-Pl': '~127yr · revolutionary upheaval', 'Ne-Pl': '~493yr · civilizational',
  };
  const PLANET_THEMES = {
    'Mercury': 'Communication/commerce (frequent)', 'Venus': 'Valuation inflection',
    'Mars': 'Momentum reversal, vol spike', 'Jupiter': 'Growth reassessment',
    'Saturn': 'Structural pressure', 'Uranus': 'Tech/innovation volatility',
    'Neptune': 'Sentiment correction', 'Pluto': 'Long-term regime shift',
  };
  const RETRO_DESCRIPTIONS = {
    'Mercury': 'Mercury Rx · 3-4×/yr · ~23d each · noisy in macro',
    'Venus':   'Venus Rx · ~18mo cycle · 40d · valuations, indecision',
    'Mars':    'Mars Rx · ~26mo cycle · 55-80d · vol spikes',
    'Jupiter': 'Jupiter Rx · annual · ~120d · growth reassessment',
    'Saturn':  'Saturn Rx · annual · ~140d · credit tightening',
    'Uranus':  'Uranus Rx · annual · ~155d · tech/innovation vol',
    'Neptune': 'Neptune Rx · annual · ~158d · sentiment correction',
    'Pluto':   'Pluto Rx · annual · ~185d · regime confirmation',
  };
  const RETRO_LABEL = {
    'Mercury': 'MeRx', 'Venus': 'VeRx', 'Mars': 'MaRx', 'Jupiter': 'JuRx',
    'Saturn':  'SaRx', 'Uranus': 'UrRx', 'Neptune': 'NeRx', 'Pluto':  'PlRx',
  };
  const HORIZON_LABEL = { 21: '1m', 63: '3m', 126: '6m', 252: '12m' };

  const DEFAULT_PAIRS   = ['Ju-Sa','Ju-Ur','Ju-Ne','Sa-Ur','Sa-Ne','Sa-Pl','Ur-Pl'];
  const DEFAULT_ASPECTS = ['Cnj', 'Opp'];
  const DEFAULT_RETROS  = []; // off by default — 3-4×/yr Mercury Rx is noise

  // Pane-scoped state factory (each pane gets its own copy so split layouts don't collide)
  function freshState(params) {
    return {
      asset:  params.asset  || 'SPY',
      scale:  params.scale  || 'log',
      range:  params.range  || 'all',     // 10y|25y|50y|100y|all
      future: params.future !== '0',      // default ON; saved future=0 still wins per-pane
      fwdFilter: params.fwdFilter || 'all', // FCM filter: all|bull|bear
      pairs:   new Set(DEFAULT_PAIRS),
      aspects: new Set(DEFAULT_ASPECTS),
      retros:  new Set(DEFAULT_RETROS),
      vp: { startMs: null, endMs: null }, // explicit zoom, overrides range pill
    };
  }

  // Cache CORS fetches across panes (15 min TTL — geocosmic data is daily-cron)
  const TTL = 15 * 60 * 1000;
  let META_PROMISE = null, EVENTS_PROMISE = null, SIG_PROMISE = null;
  const ASSET_PROMISES = {};
  function loadMeta()    { return META_PROMISE   ||= fetchJSON(`${STOCKS}/data/cycles/meta.json`,   { ttl: TTL }); }
  function loadEvents()  { return EVENTS_PROMISE ||= fetchJSON(`${STOCKS}/data/cycles/events.json`, { ttl: TTL }); }
  function loadSig()     { return SIG_PROMISE    ||= fetchJSON(`${STOCKS}/data/geocosmic_significance.json`, { ttl: TTL }); }
  function loadAsset(c)  { return ASSET_PROMISES[c] ||= fetchJSON(`${STOCKS}/data/cycles/asset_${c}.json`, { ttl: TTL }); }

  /* ── Render entry ──────────────────────────────────────────── */
  async function render(body, ctx) {
    const params = ctx.params || {};
    const st = freshState(params);

    body.innerHTML = `
      <div class="cyc-wrap" style="padding:0.5rem 0.6rem 1rem;font-size:0.78rem">
        <div class="mod-title" style="margin-bottom:0.5rem">${window.OC_TITLE ? window.OC_TITLE('cycles') : 'Geocosmic'} · LONG-CYCLE OVERLAY</div>
        <div class="cyc-disclaimer" style="background:rgba(248,113,113,0.08);border:1px solid rgba(248,113,113,0.25);border-radius:6px;padding:6px 10px;margin-bottom:8px;font-size:0.7rem;color:#fca5a5;line-height:1.4">
          <b>Research overlay, not signal.</b> 0 / 1,728 tests survive Benjamini-Hochberg FDR&lt;0.05 across the full asset×event×horizon search. Use as historical context — never as predictive edge.
        </div>

        <div class="cyc-biases" style="margin-bottom:8px"></div>

        <div class="cyc-toolbar" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:6px">
          <select class="cyc-asset" style="background:var(--bg-2);color:var(--fg);border:1px solid var(--border);border-radius:4px;padding:3px 8px;font-family:var(--font-mono,monospace);font-size:0.75rem"></select>
          <select class="cyc-scale" style="background:var(--bg-2);color:var(--fg);border:1px solid var(--border);border-radius:4px;padding:3px 8px;font-family:var(--font-mono,monospace);font-size:0.75rem">
            <option value="log"    ${st.scale==='log'?'selected':''}>log</option>
            <option value="linear" ${st.scale==='linear'?'selected':''}>linear</option>
          </select>
          <span class="cyc-range" style="display:inline-flex;gap:3px;flex-wrap:wrap"></span>
          <button class="cyc-future pill" data-on="${st.future?'1':'0'}" title="Toggle future projection through 2050 (data already computed; no prediction implied)">Future ${st.future?'ON':'OFF'}</button>
          <button class="cyc-reset pill" title="Reset zoom and pan">Reset zoom</button>
        </div>

        <div class="cyc-pills" style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:4px"></div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:0.62rem;color:var(--fg-muted);margin-bottom:6px">
          <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:rgba(74,222,128,0.55);margin-right:3px;vertical-align:middle"></span>bullish halo</span>
          <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:rgba(248,113,113,0.55);margin-right:3px;vertical-align:middle"></span>bearish halo</span>
          <span>halo = median forward return for current asset · intensity = effect × sample</span>
        </div>

        <div class="cyc-chart-wrap" style="position:relative;background:var(--bg-2,#0d1117);border:1px solid var(--border);border-radius:6px;overflow:hidden">
          <canvas class="cyc-chart" style="width:100%;height:300px;display:block;touch-action:none;cursor:crosshair"></canvas>
          <div class="cyc-tip" style="position:absolute;pointer-events:none;background:rgba(13,17,23,0.95);border:1px solid var(--border);border-radius:4px;padding:6px 8px;font-size:0.7rem;font-family:var(--font-mono,monospace);opacity:0;transition:opacity 80ms;z-index:5;max-width:240px"></div>
        </div>

        <div class="cyc-density-wrap" style="margin-top:6px;background:var(--bg-2,#0d1117);border:1px solid var(--border);border-radius:6px;padding:4px 6px">
          <div style="font-size:0.62rem;color:var(--fg-muted);letter-spacing:0.05em;text-transform:uppercase;margin-bottom:3px">Cluster density · 60d rolling · tap to zoom decade</div>
          <canvas class="cyc-density" style="width:100%;height:36px;display:block;cursor:pointer"></canvas>
        </div>

        <div class="cyc-forward" style="margin-top:8px;background:var(--bg-2,#0d1117);border:1px solid var(--border);border-radius:6px;padding:6px 8px"></div>

        <div class="cyc-upcoming" style="margin-top:8px"></div>

        <div style="margin-top:8px;font-size:0.66rem;color:var(--fg-muted)">
          Source: Skyfield + JPL DE440 ephemeris · 4,196 events 1871-2050 ·
          <a href="${STOCKS}/cycles.html" target="_blank" rel="noopener" style="color:var(--accent,#60a5fa)">full page →</a>
        </div>
      </div>
    `;

    let meta, events, sig, asset;
    try {
      [meta, events, sig] = await Promise.all([loadMeta(), loadEvents(), loadSig()]);
      asset = await loadAsset(st.asset);
    } catch (e) {
      body.innerHTML = `<div class="mod-err" style="padding:12px;color:#f87171">Failed to load cycles data: ${e.message}</div>`;
      return;
    }

    // Directional-impact lookups for the current asset. Rebuilt on asset switch.
    let sigByEvent = new Map(); // 'pair|aspect_type' → bestStat
    let sigByRetro = new Map(); // planet → bestStat
    let sigMaxAbsRet = 0.05;
    function rebuildSig() {
      sigByEvent = new Map(); sigByRetro = new Map(); sigMaxAbsRet = 0.05;
      const sec = sig.assets?.[st.asset];
      if (!sec?.results) return;
      for (const r of Object.values(sec.results)) {
        if (r.kind === 'aspect') {
          const k = `${r.pair}|${r.aspect_type}`;
          const prev = sigByEvent.get(k);
          if (!prev || r.p_raw < prev.p_raw) sigByEvent.set(k, r);
        } else if (r.kind === 'retrograde') {
          const prev = sigByRetro.get(r.planet);
          if (!prev || r.p_raw < prev.p_raw) sigByRetro.set(r.planet, r);
        }
      }
      const abs = Array.from(sigByEvent.values()).concat(Array.from(sigByRetro.values()))
        .map(r => Math.abs(r.median_return || 0)).sort((a, b) => a - b);
      if (abs.length) sigMaxAbsRet = Math.max(0.03, abs[Math.floor(abs.length * 0.95)] || 0);
    }
    function impactFor(ev) {
      let stat;
      if (ev.t === 'aspect') stat = sigByEvent.get(`${ev.p}|${ev.a}`);
      else stat = sigByRetro.get(ev.pl);
      if (!stat || (stat.n_events != null && stat.n_events < 5)) return null;
      const m = stat.median_return || 0;
      return {
        sign: m > 0 ? 1 : m < 0 ? -1 : 0,
        median: m,
        n: stat.n_events,
        hitRate: stat.hit_rate,
        horizonLabel: HORIZON_LABEL[stat.horizon_days] || (stat.horizon_days + 'd'),
        pRaw: stat.p_raw,
        strength: Math.min(1, Math.abs(m) / sigMaxAbsRet) * Math.min(1, (stat.n_events || 0) / 10),
      };
    }
    rebuildSig();

    const refs = {
      asset:    body.querySelector('.cyc-asset'),
      scale:    body.querySelector('.cyc-scale'),
      range:    body.querySelector('.cyc-range'),
      future:   body.querySelector('.cyc-future'),
      reset:    body.querySelector('.cyc-reset'),
      pills:    body.querySelector('.cyc-pills'),
      chart:    body.querySelector('.cyc-chart'),
      tip:      body.querySelector('.cyc-tip'),
      density:  body.querySelector('.cyc-density'),
      biases:   body.querySelector('.cyc-biases'),
      forward:  body.querySelector('.cyc-forward'),
      upcoming: body.querySelector('.cyc-upcoming'),
    };

    /* Asset dropdown */
    meta.assets.forEach(a => {
      const o = document.createElement('option');
      o.value = a.code;
      o.textContent = `${a.code} · ${a.label}`;
      if (a.code === st.asset) o.selected = true;
      refs.asset.appendChild(o);
    });
    refs.asset.addEventListener('change', async () => {
      st.asset = refs.asset.value;
      st.vp.startMs = st.vp.endMs = null;
      asset = await loadAsset(st.asset);
      rebuildSig();
      saveParams();
      drawAll();
    });
    refs.scale.addEventListener('change', () => { st.scale = refs.scale.value; saveParams(); drawAll(); });

    /* Time-range pills (10y / 25y / 50y / 100y / all) */
    [['10y','10 yr'],['25y','25 yr'],['50y','50 yr'],['100y','100 yr'],['all','All']].forEach(([id, lbl]) => {
      const b = document.createElement('button');
      b.className = 'pill' + (st.range === id ? ' active' : '');
      b.textContent = lbl;
      b.dataset.range = id;
      b.style.cssText = 'padding:3px 8px;font-size:0.7rem;border-radius:999px;border:1px solid var(--border);background:transparent;color:var(--fg);cursor:pointer';
      if (st.range === id) { b.style.background = 'var(--accent,#60a5fa)'; b.style.color = '#0a0c10'; b.style.borderColor = 'transparent'; }
      b.addEventListener('click', () => {
        st.range = id;
        st.vp.startMs = st.vp.endMs = null;
        refs.range.querySelectorAll('button').forEach(o => {
          const on = o.dataset.range === id;
          o.classList.toggle('active', on);
          o.style.background = on ? 'var(--accent,#60a5fa)' : 'transparent';
          o.style.color = on ? '#0a0c10' : 'var(--fg)';
          o.style.borderColor = on ? 'transparent' : 'var(--border)';
        });
        saveParams();
        drawAll();
      });
      refs.range.appendChild(b);
    });

    /* Future toggle */
    refs.future.style.cssText = 'padding:3px 8px;font-size:0.7rem;border-radius:999px;border:1px solid var(--border);background:transparent;color:var(--fg);cursor:pointer';
    if (st.future) { refs.future.style.background = 'rgba(96,165,250,0.18)'; refs.future.style.borderColor = '#60a5fa'; refs.future.style.color = '#60a5fa'; }
    refs.future.addEventListener('click', () => {
      st.future = !st.future;
      refs.future.textContent = `Future ${st.future?'ON':'OFF'}`;
      refs.future.style.background = st.future ? 'rgba(96,165,250,0.18)' : 'transparent';
      refs.future.style.borderColor = st.future ? '#60a5fa' : 'var(--border)';
      refs.future.style.color = st.future ? '#60a5fa' : 'var(--fg)';
      st.vp.startMs = st.vp.endMs = null;
      saveParams();
      drawAll();
    });
    refs.reset.style.cssText = refs.future.style.cssText.replace(/color:[^;]+;/, 'color:var(--fg-muted);');
    refs.reset.addEventListener('click', () => { st.vp.startMs = st.vp.endMs = null; drawAll(); });

    /* Pair + aspect pills (compact) */
    function pillBtn(label, color, on, onClick) {
      const b = document.createElement('button');
      b.className = 'pill' + (on ? ' active' : '');
      b.textContent = label;
      b.style.cssText = `padding:2px 7px;font-size:0.66rem;font-family:var(--font-mono,monospace);border-radius:999px;border:1px solid ${color};background:${on?color:'transparent'};color:${on?'#0a0c10':'var(--fg)'};cursor:pointer`;
      b.addEventListener('click', () => onClick(b));
      return b;
    }
    Object.keys(PAIR_COLORS).forEach(p => {
      const b = pillBtn(p, PAIR_COLORS[p], st.pairs.has(p), () => {
        if (st.pairs.has(p)) st.pairs.delete(p); else st.pairs.add(p);
        const on = st.pairs.has(p);
        b.style.background = on ? PAIR_COLORS[p] : 'transparent';
        b.style.color = on ? '#0a0c10' : 'var(--fg)';
        drawAll();
      });
      refs.pills.appendChild(b);
    });
    refs.pills.appendChild(Object.assign(document.createElement('span'), { textContent: '·', style: 'color:var(--fg-muted);align-self:center' }));
    Object.keys(ASPECT_SHAPE).forEach(a => {
      const b = pillBtn(a, '#9ca3af', st.aspects.has(a), () => {
        if (st.aspects.has(a)) st.aspects.delete(a); else st.aspects.add(a);
        const on = st.aspects.has(a);
        b.style.background = on ? '#9ca3af' : 'transparent';
        b.style.color = on ? '#0a0c10' : 'var(--fg)';
        drawAll();
      });
      refs.pills.appendChild(b);
    });
    refs.pills.appendChild(Object.assign(document.createElement('span'), { textContent: '·', style: 'color:var(--fg-muted);align-self:center' }));
    Object.keys(PLANET_COLORS).forEach(planet => {
      const color = PLANET_COLORS[planet];
      const b = pillBtn(RETRO_LABEL[planet], color, st.retros.has(planet), () => {
        if (st.retros.has(planet)) st.retros.delete(planet); else st.retros.add(planet);
        const on = st.retros.has(planet);
        b.style.background = on ? color : 'transparent';
        b.style.color = on ? '#0a0c10' : 'var(--fg)';
        drawAll();
      });
      b.title = RETRO_DESCRIPTIONS[planet] || planet + ' retrograde';
      refs.pills.appendChild(b);
    });

    /* Persist UI bits to pane params (asset / scale / range / future) */
    function saveParams() {
      if (window.OC_UPDATE_PANE_PARAMS) {
        window.OC_UPDATE_PANE_PARAMS({
          asset: st.asset, scale: st.scale, range: st.range,
          future: st.future ? '1' : '0', fwdFilter: st.fwdFilter,
        });
      }
    }

    /* Compute viewport from explicit vp or from range pill */
    function effectiveVP() {
      const dataStart = +new Date(asset.dates[0]);
      const dataEnd   = +new Date(asset.dates[asset.dates.length - 1]);
      const futureEnd = st.future ? +new Date('2050-12-31') : dataEnd;
      const fullStart = dataStart, fullEnd = futureEnd;

      if (st.vp.startMs != null && st.vp.endMs != null) {
        return { startMs: st.vp.startMs, endMs: st.vp.endMs, dataStart: fullStart, dataEnd: fullEnd };
      }
      if (st.range === 'all') return { startMs: fullStart, endMs: fullEnd, dataStart: fullStart, dataEnd: fullEnd };
      const yrs = parseInt(st.range, 10);
      const today = +new Date();
      // When future ON: center on today (half back, half forward up to 2050)
      // When future OFF: anchor to today, look back N years
      let s, e;
      if (st.future) {
        const halfMs = (yrs * 365.25 * 86400000) / 2;
        s = today - halfMs; e = today + halfMs;
        if (e > futureEnd) { s -= (e - futureEnd); e = futureEnd; }
      } else {
        e = Math.min(today, dataEnd); s = e - yrs * 365.25 * 86400000;
      }
      if (s < dataStart) s = dataStart;
      return { startMs: s, endMs: Math.min(e, fullEnd), dataStart: fullStart, dataEnd: fullEnd };
    }

    let priceLayout = null;

    function drawAll() {
      drawPrice();
      drawDensity();
      drawBiases();
      drawForwardClusters();
      drawUpcoming();
    }

    /* Top-3 bull / top-3 bear historical biases for current asset.
       Score = |median| × √n so a stable n=20 effect outranks a noisy n=4 outlier. */
    function drawBiases() {
      const all = [];
      sigByEvent.forEach((stat) => {
        if (!stat || stat.n_events < 5) return;
        const m = stat.median_return || 0; if (m === 0) return;
        all.push({ stat, kind: 'aspect', score: Math.abs(m) * Math.sqrt(stat.n_events), sign: m > 0 ? 1 : -1, color: PAIR_COLORS[stat.pair] });
      });
      sigByRetro.forEach((stat) => {
        if (!stat || stat.n_events < 5) return;
        const m = stat.median_return || 0; if (m === 0) return;
        all.push({ stat, kind: 'retrograde', score: Math.abs(m) * Math.sqrt(stat.n_events), sign: m > 0 ? 1 : -1, color: PLANET_COLORS[stat.planet] });
      });
      const bulls = all.filter(r => r.sign > 0).sort((a, b) => b.score - a.score).slice(0, 3);
      const bears = all.filter(r => r.sign < 0).sort((a, b) => b.score - a.score).slice(0, 3);

      const fmtPill = (r, dir) => {
        const m = r.stat.median_return;
        const lbl = r.kind === 'aspect'
          ? `<span style="color:${r.color}">${r.stat.pair}</span> ${r.stat.aspect_type}`
          : `<span style="color:${r.color}">${r.stat.planet.slice(0,2)}Rx</span>`;
        const horLbl = HORIZON_LABEL[r.stat.horizon_days] || (r.stat.horizon_days + 'd');
        const dirHex = dir === 'bull' ? '#4ade80' : '#f87171';
        const dirRgb = dir === 'bull' ? '74,222,128' : '248,113,113';
        return `<span title="n=${r.stat.n_events} hit ${(r.stat.hit_rate*100).toFixed(0)}% p=${r.stat.p_raw.toFixed(2)}"
          style="display:inline-flex;align-items:center;gap:5px;padding:2px 7px;border-radius:999px;
            background:rgba(${dirRgb},0.08);border:1px solid rgba(${dirRgb},0.35);
            font-family:var(--font-mono,monospace);font-size:0.66rem;white-space:nowrap">
          ${lbl}
          <span style="color:${dirHex};font-weight:700">${m>=0?'+':''}${(m*100).toFixed(2)}%</span>
          <span style="color:var(--fg-muted);font-size:0.6rem">${horLbl}·n${r.stat.n_events}</span>
        </span>`;
      };

      refs.biases.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
          <div style="padding:5px 8px;background:rgba(74,222,128,0.04);border:1px solid rgba(74,222,128,0.2);border-radius:6px">
            <div style="font-size:0.6rem;letter-spacing:0.06em;text-transform:uppercase;color:#4ade80;font-weight:700;margin-bottom:4px">▲ Bullish leans · ${st.asset}</div>
            <div style="display:flex;flex-wrap:wrap;gap:4px">${bulls.length ? bulls.map(r => fmtPill(r, 'bull')).join('') : '<span style="color:var(--fg-muted);font-size:0.65rem">no qualifying (n≥5)</span>'}</div>
          </div>
          <div style="padding:5px 8px;background:rgba(248,113,113,0.04);border:1px solid rgba(248,113,113,0.2);border-radius:6px">
            <div style="font-size:0.6rem;letter-spacing:0.06em;text-transform:uppercase;color:#f87171;font-weight:700;margin-bottom:4px">▼ Bearish leans · ${st.asset}</div>
            <div style="display:flex;flex-wrap:wrap;gap:4px">${bears.length ? bears.map(r => fmtPill(r, 'bear')).join('') : '<span style="color:var(--fg-muted);font-size:0.65rem">no qualifying (n≥5)</span>'}</div>
          </div>
        </div>
      `;
    }

    /* ── Price chart ─────────────────────────────────────────── */
    function drawPrice() {
      const canvas = refs.chart;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width  = Math.max(1, rect.width  * dpr);
      canvas.height = Math.max(1, rect.height * dpr);
      const ctx = canvas.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      const W = rect.width, H = rect.height;
      const PAD_L = 50, PAD_R = 14, PAD_T = 12, PAD_B = 22;
      const plotW = W - PAD_L - PAD_R;
      const plotH = H - PAD_T - PAD_B;

      const { startMs, endMs, dataStart, dataEnd } = effectiveVP();

      // Y range — over visible window only
      const dates = asset.dates, closes = asset.closes;
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < dates.length; i++) {
        const v = closes[i];
        if (v == null) continue;
        if (st.scale === 'log' && v <= 0) continue;
        const ms = +new Date(dates[i]);
        if (ms < startMs || ms > endMs) continue;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      if (!isFinite(lo) || !isFinite(hi)) { lo = 1; hi = 10; }
      let minY, maxY;
      if (st.scale === 'log') {
        const lL = Math.log10(lo), hL = Math.log10(hi);
        const pad = (hL - lL) * 0.05 || 0.1;
        minY = lL - pad; maxY = hL + pad;
      } else {
        const pad = (hi - lo) * 0.05 || 0.1;
        minY = lo - pad; maxY = hi + pad;
      }
      const xPos = ms => PAD_L + ((ms - startMs) / (endMs - startMs)) * plotW;
      const yPos = v => {
        if (v == null) return null;
        const yv = st.scale === 'log' ? Math.log10(v) : v;
        return PAD_T + (1 - (yv - minY) / (maxY - minY)) * plotH;
      };

      ctx.fillStyle = 'transparent';
      ctx.clearRect(0, 0, W, H);

      /* Future band (today → endMs) */
      const today = +new Date();
      if (st.future && endMs > today && today > startMs) {
        const tx = xPos(today);
        ctx.fillStyle = 'rgba(96,165,250,0.04)';
        ctx.fillRect(tx, PAD_T, Math.max(0, (W - PAD_R) - tx), plotH);
        ctx.strokeStyle = 'rgba(96,165,250,0.4)';
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(tx, PAD_T); ctx.lineTo(tx, PAD_T + plotH); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(96,165,250,0.7)';
        ctx.font = '9px monospace'; ctx.textAlign = 'left';
        ctx.fillText('today', tx + 4, PAD_T + 9);
      }

      /* Y grid + labels */
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 0.5;
      ctx.font = '9px monospace';
      ctx.fillStyle = 'var(--fg-muted)';
      ctx.fillStyle = 'rgba(160,160,170,0.7)';
      ctx.textAlign = 'right';
      const yTicks = 5;
      for (let i = 0; i <= yTicks; i++) {
        const yPx = PAD_T + (plotH / yTicks) * i;
        ctx.beginPath(); ctx.moveTo(PAD_L, yPx); ctx.lineTo(W - PAD_R, yPx); ctx.stroke();
        const yv = maxY - ((maxY - minY) / yTicks) * i;
        const dispVal = st.scale === 'log' ? Math.pow(10, yv) : yv;
        let lbl = dispVal >= 1000 ? dispVal.toFixed(0)
                : dispVal >= 10   ? dispVal.toFixed(1)
                : dispVal.toFixed(2);
        ctx.fillText(lbl, PAD_L - 5, yPx + 3);
      }

      /* X labels */
      ctx.textAlign = 'center';
      const startYr = new Date(startMs).getFullYear();
      const endYr   = new Date(endMs).getFullYear();
      const yrSpan  = endYr - startYr;
      const step    = yrSpan > 100 ? 25 : yrSpan > 50 ? 10 : yrSpan > 20 ? 5 : yrSpan > 6 ? 2 : 1;
      for (let yr = Math.ceil(startYr / step) * step; yr <= endYr; yr += step) {
        const x = xPos(+new Date(yr, 0, 1));
        if (x < PAD_L - 1 || x > W - PAD_R + 1) continue;
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.beginPath(); ctx.moveTo(x, PAD_T); ctx.lineTo(x, PAD_T + plotH); ctx.stroke();
        ctx.fillStyle = 'rgba(160,160,170,0.7)';
        ctx.fillText(String(yr), x, H - 7);
      }

      /* Price line */
      ctx.save();
      ctx.beginPath(); ctx.rect(PAD_L, PAD_T, plotW, plotH); ctx.clip();
      ctx.strokeStyle = '#60a5fa';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      let started = false, lastX = null, lastY = null;
      for (let i = 0; i < dates.length; i++) {
        const v = closes[i];
        if (v == null || (st.scale === 'log' && v <= 0)) continue;
        const x = xPos(+new Date(dates[i]));
        const y = yPos(v);
        if (!started) { ctx.moveTo(x, y); started = true; }
        else ctx.lineTo(x, y);
        lastX = x; lastY = y;
      }
      ctx.stroke();
      // area fill
      if (started) {
        ctx.lineTo(lastX, PAD_T + plotH);
        ctx.lineTo(xPos(startMs), PAD_T + plotH);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, PAD_T, 0, PAD_T + plotH);
        grad.addColorStop(0, 'rgba(96,165,250,0.14)');
        grad.addColorStop(1, 'rgba(96,165,250,0)');
        ctx.fillStyle = grad; ctx.fill();
      }
      ctx.restore();

      /* Event markers (clipped to plot) */
      ctx.save();
      ctx.beginPath(); ctx.rect(PAD_L, PAD_T, plotW, plotH); ctx.clip();
      const dotMap = [];
      // For projecting events past the asset's last close: use last close as flat baseline
      const lastClose = closes[closes.length - 1];
      const lastDate  = dates[dates.length - 1];
      for (const ev of events) {
        if (ev.t === 'aspect') {
          if (!st.pairs.has(ev.p) || !st.aspects.has(ev.a)) continue;
        } else if (ev.t === 'retrograde_start' || ev.t === 'retrograde_end') {
          if (!st.retros.has(ev.pl)) continue;
        } else continue;
        const ms = +new Date(ev.d);
        if (ms < startMs || ms > endMs) continue;
        let c;
        if (ev.d <= lastDate) c = nearestClose(asset, ev.d);
        else if (st.future) c = lastClose; // pin to last close for future events
        else continue;
        if (c == null) continue;
        const x = xPos(ms), y = yPos(c);
        if (y == null) continue;
        const isFuture = ms > today;
        const color = ev.t === 'aspect' ? PAIR_COLORS[ev.p] : PLANET_COLORS[ev.pl];
        const cfg = ev.t === 'aspect' ? ASPECT_SHAPE[ev.a] : { shape: 'tri', r: 3 };
        const imp = impactFor(ev);
        ctx.globalAlpha = isFuture ? 0.45 : 1;
        if (imp && imp.sign !== 0) {
          const haloR = cfg.r + 4;
          const a = 0.16 + 0.42 * imp.strength;
          const rgb = imp.sign > 0 ? '74,222,128' : '248,113,113';
          ctx.fillStyle = `rgba(${rgb},${a})`;
          ctx.beginPath(); ctx.arc(x, y, haloR, 0, Math.PI * 2); ctx.fill();
        }
        drawMarker(ctx, x, y, cfg.shape, cfg.r, color, ev.t);
        ctx.globalAlpha = 1;
        dotMap.push({ x, y, ev, color, isFuture, imp });
      }
      ctx.restore();

      priceLayout = { canvas, W, H, PAD_L, PAD_R, PAD_T, PAD_B, plotW, plotH,
                      startMs, endMs, dataStart, dataEnd, dotMap };
    }

    function drawMarker(ctx, x, y, shape, r, color, kind) {
      ctx.save();
      if (shape === 'circle') {
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      } else if (shape === 'ring') {
        ctx.strokeStyle = color; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      } else if (shape === 'square') {
        ctx.fillStyle = color;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      } else if (shape === 'diamond') {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath();
        ctx.fill();
      } else if (shape === 'tri') {
        const dir = kind === 'retrograde_end' ? -1 : 1;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x, y + dir * r);
        ctx.lineTo(x + r, y - dir * r);
        ctx.lineTo(x - r, y - dir * r);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }

    function nearestClose(a, dStr) {
      const ds = a.dates, cs = a.closes;
      let lo = 0, hi = ds.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (ds[mid] < dStr) lo = mid + 1; else hi = mid;
      }
      if (ds[lo] === dStr) return cs[lo];
      return cs[Math.max(0, lo - 1)];
    }

    /* ── Density strip (clickable) ──────────────────────────── */
    function drawDensity() {
      const canvas = refs.density;
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width  = Math.max(1, rect.width * dpr);
      canvas.height = Math.max(1, rect.height * dpr);
      const ctx = canvas.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      const W = rect.width, H = rect.height;
      ctx.clearRect(0, 0, W, H);

      // Density spans the FULL data + (optional) future range, not the chart viewport.
      // This way the user always sees where the dense decades are and can tap to jump.
      const dataStart = +new Date(asset.dates[0]);
      const dataEnd   = +new Date(asset.dates[asset.dates.length - 1]);
      const fullEnd   = st.future ? +new Date('2050-12-31') : dataEnd;
      const fullStart = dataStart;
      const span = fullEnd - fullStart;

      const nBuckets = 200;
      const bMs = span / nBuckets;
      const counts = new Array(nBuckets).fill(0);
      for (const e of events) {
        if (e.t !== 'aspect') continue;
        if (!st.pairs.has(e.p) || !st.aspects.has(e.a)) continue;
        const ms = +new Date(e.d);
        if (ms < fullStart || ms > fullEnd) continue;
        const idx = Math.min(nBuckets - 1, Math.floor((ms - fullStart) / bMs));
        counts[idx]++;
      }
      const winB = 4;
      const smooth = new Array(nBuckets).fill(0);
      for (let i = 0; i < nBuckets; i++) {
        let s = 0, n = 0;
        for (let k = Math.max(0, i - winB); k <= Math.min(nBuckets - 1, i + winB); k++) { s += counts[k]; n++; }
        smooth[i] = s / n;
      }
      const maxC = Math.max(0.0001, ...smooth);
      const barW = W / nBuckets;
      for (let i = 0; i < nBuckets; i++) {
        const intensity = smooth[i] / maxC;
        const h = intensity * (H - 4);
        ctx.fillStyle = `rgba(${Math.round(248 - 100*(1-intensity))},${Math.round(113 + 100*(1-intensity))},${Math.round(113 + 50*(1-intensity))},${0.35 + 0.55 * intensity})`;
        ctx.fillRect(i * barW, H - 2 - h, Math.max(1, barW - 0.4), h);
      }

      // Mark current viewport range as a translucent overlay
      const { startMs, endMs } = effectiveVP();
      const x0 = ((startMs - fullStart) / span) * W;
      const x1 = ((endMs - fullStart) / span) * W;
      ctx.fillStyle = 'rgba(96,165,250,0.18)';
      ctx.fillRect(x0, 0, Math.max(1, x1 - x0), H);
      ctx.strokeStyle = 'rgba(96,165,250,0.6)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x0 + 0.5, 0.5, Math.max(0, x1 - x0 - 1), H - 1);

      // today marker
      const today = +new Date();
      if (today >= fullStart && today <= fullEnd) {
        const tx = ((today - fullStart) / span) * W;
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.setLineDash([2, 2]);
        ctx.beginPath(); ctx.moveTo(tx, 0); ctx.lineTo(tx, H); ctx.stroke();
        ctx.setLineDash([]);
      }

      // Tap to zoom decade
      canvas.onclick = (e) => {
        const r = canvas.getBoundingClientRect();
        const frac = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
        const cx = fullStart + frac * span;
        const halfWin = 5 * 365.25 * 86400000; // 10y window
        st.vp.startMs = Math.max(fullStart, cx - halfWin);
        st.vp.endMs   = Math.min(fullEnd,   cx + halfWin);
        drawAll();
      };
    }

    /* ── Forward Cluster Map (next 24 mo) ───────────────────── */
    function drawForwardClusters() {
      const today = new Date();
      const todayStr = today.toISOString().slice(0, 10);
      const horizon  = new Date(today.getFullYear(), today.getMonth() + 24, 1);

      // Group active aspects by month. Keys come from local-time fields, NOT
      // toISOString() — UTC conversion shifts local-midnight dates back a day
      // in UTC+ timezones, mislabeling every month bucket.
      const byMonth = new Map();
      const monthsArr = [];
      for (let m = 0; m < 24; m++) {
        const d = new Date(today.getFullYear(), today.getMonth() + m, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        monthsArr.push(key);
        byMonth.set(key, []);
      }
      let suppressed = 0;
      for (const ev of events) {
        if (ev.t !== 'aspect') continue;
        if (!st.pairs.has(ev.p) || !st.aspects.has(ev.a)) continue;
        if (ev.d < todayStr) continue;
        if (new Date(ev.d) >= horizon) continue;
        if (st.fwdFilter !== 'all') {
          const imp = impactFor(ev);
          const wantBull = st.fwdFilter === 'bull';
          if (!imp || imp.sign === 0 || (imp.sign > 0) !== wantBull) { suppressed++; continue; }
        }
        const k = ev.d.slice(0, 7);
        if (byMonth.has(k)) byMonth.get(k).push(ev);
      }
      const maxCount = Math.max(1, ...Array.from(byMonth.values()).map(a => a.length));

      const cells = monthsArr.map(k => {
        const arr = byMonth.get(k) || [];
        const intensity = arr.length / maxCount;
        const monthLbl = new Date(k + '-01').toLocaleDateString('en-US', { month: 'short' });
        const yearLbl  = k.slice(2, 4);
        // Net directional bias for this month (avg median_return across active aspects)
        let netRet = 0, weighted = 0;
        const tipLines = [];
        for (const ev of arr) {
          const imp = impactFor(ev);
          if (imp) { netRet += imp.median; weighted++; }
          const arr2 = imp ? (imp.sign > 0 ? '▲' : imp.sign < 0 ? '▼' : '·') : '·';
          const pct  = imp ? `${imp.sign>=0?'+':''}${(imp.median*100).toFixed(2)}%` : '—';
          tipLines.push(`${ev.d.slice(5)} ${ev.p} ${ev.a}  ${arr2} ${pct}`);
        }
        const avgRet = weighted ? netRet / weighted : 0;
        const dirRgb = avgRet > 0 ? '74,222,128' : avgRet < 0 ? '248,113,113' : '160,160,170';
        const effectScale = Math.min(1, Math.abs(avgRet) / sigMaxAbsRet);
        const bgAlpha = 0.05 + intensity * (0.16 + effectScale * 0.4);
        const dirArrow = avgRet > 0 ? '▲' : avgRet < 0 ? '▼' : '';
        const arrowColor = avgRet > 0 ? '#4ade80' : avgRet < 0 ? '#f87171' : 'var(--fg-muted)';
        const tooltip = arr.length
          ? `${k}\n${tipLines.join('\n')}\n\nnet: ${dirArrow || '·'} ${avgRet>=0?'+':''}${(avgRet*100).toFixed(2)}% median`
          : `${k}\nno aspects`;
        return `<div class="cyc-fc-cell" data-month="${k}" title="${tooltip}"
          style="flex:1 1 0;min-width:34px;height:46px;border-radius:4px;
            background:rgba(${dirRgb},${bgAlpha});
            border:1px solid rgba(255,255,255,0.06);
            display:flex;flex-direction:column;align-items:center;justify-content:center;
            cursor:pointer;transition:transform 80ms;font-family:var(--font-mono,monospace)">
          <div style="font-size:0.6rem;color:var(--fg-muted)">${monthLbl}'${yearLbl}</div>
          <div style="font-size:0.8rem;font-weight:600;color:${arr.length ? '#e6edf3' : 'var(--fg-muted)'}">${arr.length || '·'} <span style="color:${arrowColor};font-size:0.85em">${dirArrow}</span></div>
        </div>`;
      }).join('');

      const filterPill = (id, label, color) => {
        const on = st.fwdFilter === id;
        return `<button class="cyc-fwd-pill" data-fwd="${id}"
          style="padding:1px 7px;border-radius:999px;border:1px solid ${on ? color : 'var(--border)'};
            background:${on ? color : 'transparent'};color:${on ? '#0a0c10' : 'var(--fg)'};
            font-size:0.6rem;font-family:var(--font-mono,monospace);cursor:pointer">${label}</button>`;
      };
      const filterStr = st.fwdFilter === 'bull' ? ' · bullish' : st.fwdFilter === 'bear' ? ' · bearish' : '';
      const supStr = suppressed && st.fwdFilter !== 'all' ? ` · ${suppressed} hidden` : '';
      refs.forward.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;gap:6px;flex-wrap:wrap">
          <div style="font-size:0.66rem;color:var(--fg-muted);letter-spacing:0.05em;text-transform:uppercase">Forward map · 24mo${filterStr}${supStr}</div>
          <div style="display:flex;gap:3px">
            ${filterPill('all', 'All', '#9ca3af')}
            ${filterPill('bull', '▲', '#4ade80')}
            ${filterPill('bear', '▼', '#f87171')}
          </div>
        </div>
        <div class="cyc-fc-grid" style="display:flex;gap:3px;flex-wrap:wrap">${cells}</div>
        <div style="font-size:0.6rem;color:var(--fg-muted);margin-top:3px">tap month to zoom · filter is per pane</div>
      `;
      refs.forward.querySelectorAll('.cyc-fwd-pill').forEach(b => {
        b.addEventListener('click', () => {
          st.fwdFilter = b.dataset.fwd;
          saveParams();
          drawForwardClusters();
        });
      });
      refs.forward.querySelectorAll('.cyc-fc-cell').forEach(cell => {
        cell.addEventListener('click', () => {
          const m = cell.dataset.month;
          const start = new Date(m + '-01');
          const end   = new Date(start.getFullYear(), start.getMonth() + 6, 0);
          // Enable Future directly (NOT via refs.future.click() — its handler
          // toggles st.future again and wipes the viewport we're about to set).
          if (!st.future) {
            st.future = true;
            refs.future.textContent = 'Future ON';
            refs.future.style.background = 'rgba(96,165,250,0.18)';
            refs.future.style.borderColor = '#60a5fa';
            refs.future.style.color = '#60a5fa';
            saveParams();
          }
          st.vp.startMs = +new Date(start.getTime() - 180 * 86400000);
          st.vp.endMs   = +end;
          drawAll();
        });
      });
    }

    /* ── Upcoming events table (next 6 mo) ──────────────────── */
    function drawUpcoming() {
      const todayStr = new Date().toISOString().slice(0, 10);
      const endStr   = new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10);
      const sec = sig.assets?.[st.asset];

      const upcoming = events
        .filter(e => e.d >= todayStr && e.d <= endStr)
        .sort((a, b) => a.d.localeCompare(b.d));

      function bestStat(ev) {
        if (!sec?.results) return null;
        const isAspect = ev.t === 'aspect';
        const matches = Object.values(sec.results).filter(r =>
          isAspect
            ? r.kind === 'aspect' && r.pair === ev.p && r.aspect_type === ev.a
            : r.kind === 'retrograde' && r.planet === ev.pl
        );
        if (!matches.length) return null;
        return matches.reduce((b, r) => !b || r.p_raw < b.p_raw ? r : b, null);
      }

      const MAX_ROWS = 30;
      const rows = upcoming.slice(0, MAX_ROWS).map(ev => {
        const isAspect = ev.t === 'aspect';
        const color = isAspect ? PAIR_COLORS[ev.p] : PLANET_COLORS[ev.pl];
        const lbl   = isAspect ? `${ev.p} ${ev.a}` : `${ev.pl} ${ev.t === 'retrograde_start' ? 'Rx▼' : 'Rx▲'}`;
        const theme = isAspect ? (PAIR_THEMES[ev.p] || '—') : (PLANET_THEMES[ev.pl] || '—');
        const days  = Math.round((new Date(ev.d) - new Date(todayStr)) / 86400000);
        const stat  = bestStat(ev);
        const med   = stat ? `${stat.median_return >= 0 ? '+' : ''}${(stat.median_return * 100).toFixed(2)}%` : '—';
        const medCls = stat ? (stat.median_return >= 0 ? 'num-up' : 'num-dn') : '';
        const hor   = stat ? (HORIZON_LABEL[stat.horizon_days] || stat.horizon_days + 'd') : '—';
        const hit   = stat ? `${(stat.hit_rate * 100).toFixed(0)}%` : '—';

        // Bias pill — same scale as chart halo (• / •• / •••).
        const imp = impactFor(ev);
        let biasCell = '<span style="color:var(--fg-muted)">—</span>';
        let medBg = '';
        if (imp && imp.sign !== 0) {
          const arrow = imp.sign > 0 ? '▲' : '▼';
          const dirRgb = imp.sign > 0 ? '74,222,128' : '248,113,113';
          const dirHex = imp.sign > 0 ? '#4ade80' : '#f87171';
          const dots = imp.strength > 0.55 ? '•••' : imp.strength > 0.25 ? '••' : '•';
          biasCell = `<span title="n=${imp.n} hit ${(imp.hitRate*100).toFixed(0)}% p=${imp.pRaw.toFixed(2)}" style="display:inline-flex;align-items:center;gap:3px;padding:1px 6px;border-radius:999px;background:rgba(${dirRgb},${0.1 + 0.4 * imp.strength});color:${dirHex};font-weight:700;font-size:0.65rem;border:1px solid rgba(${dirRgb},0.4)">${arrow}<span style="font-size:0.55rem">${dots}</span></span>`;
          medBg = `background:rgba(${dirRgb},${0.06 + 0.16 * imp.strength})`;
        } else if (stat) {
          biasCell = '<span style="color:var(--fg-muted)">·</span>';
        }

        return `<tr>
          <td style="white-space:nowrap;padding:5px 8px">${ev.d}<span style="color:var(--fg-muted);font-size:0.6rem;margin-left:4px">${days}d</span></td>
          <td style="white-space:nowrap;padding:5px 8px"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${color};margin-right:4px"></span>${lbl}</td>
          <td style="padding:5px 8px;text-align:center">${biasCell}</td>
          <td style="color:var(--fg-muted);padding:5px 8px">${theme}</td>
          <td class="${medCls}" style="text-align:right;padding:5px 8px;${medBg}">${med}</td>
          <td style="text-align:right;padding:5px 8px">${hit}</td>
          <td style="text-align:right;color:var(--fg-muted);padding:5px 8px">${hor}</td>
        </tr>`;
      }).join('');

      refs.upcoming.innerHTML = `
        <div style="font-size:0.66rem;color:var(--fg-muted);letter-spacing:0.05em;text-transform:uppercase;margin-bottom:4px">Upcoming · next 6 months · ${st.asset} stats</div>
        <div style="overflow-x:auto;background:var(--bg-2,#0d1117);border:1px solid var(--border);border-radius:6px">
          <table class="tbl-dense" style="width:100%;border-collapse:collapse;font-size:0.7rem">
            <thead><tr style="color:var(--fg-muted);text-align:left;border-bottom:1px solid var(--border)">
              <th style="padding:5px 8px">Date</th>
              <th style="padding:5px 8px">Event</th>
              <th style="padding:5px 8px;text-align:center" title="Historical bias for ${st.asset}: ▲ green = positive median forward return, ▼ red = negative · ••• = signal strength (effect × sample)">Bias</th>
              <th style="padding:5px 8px">Theme</th>
              <th style="padding:5px 8px;text-align:right">Median Δ</th>
              <th style="padding:5px 8px;text-align:right">Hit %</th>
              <th style="padding:5px 8px;text-align:right">Horizon</th>
            </tr></thead>
            <tbody>${rows || '<tr><td colspan="7" style="padding:10px;text-align:center;color:var(--fg-muted)">No planetary events in the next 6 months.</td></tr>'}</tbody>
          </table>
        </div>
        ${upcoming.length > MAX_ROWS ? `<div style="font-size:0.6rem;color:var(--fg-muted);margin-top:3px">showing first ${MAX_ROWS} of ${upcoming.length} events</div>` : ''}
      `;
    }

    /* ── Touch + mouse interactions on price chart ──────────── */
    bindChartInteractions(refs.chart, refs.tip, () => priceLayout, () => effectiveVP(), st, drawAll);

    /* ResizeObserver to redraw when pane size changes — disconnect any
       observer from a previous render of this pane so they don't stack. */
    if (window.ResizeObserver) {
      if (body.__cycRO) body.__cycRO.disconnect();
      body.__cycRO = new ResizeObserver(() => drawAll());
      body.__cycRO.observe(body);
    }

    drawAll();
  }

  /* ── Interaction binder ─────────────────────────────────────
     Handles pinch-zoom (2-finger), drag-pan (1-finger / mouse),
     mouse wheel zoom, and tap/click hover tooltip. */
  function bindChartInteractions(canvas, tipEl, getLayout, getVP, st, drawAll) {
    let pointers = new Map(); // id -> {x, y}
    let pinchStart = null;    // { dist, midFrac, startMs, endMs }
    let panStart = null;      // { x, startMs, endMs }
    let didDrag = false;

    function setVP(s, e) {
      const layout = getLayout();
      if (!layout) return;
      const { dataStart, dataEnd } = layout;
      // Clamp
      if (s < dataStart) { e += dataStart - s; s = dataStart; }
      if (e > dataEnd)   { s -= e - dataEnd;   e = dataEnd; }
      const minRange = 30 * 86400000;
      if (e - s < minRange) e = s + minRange;
      if (s <= dataStart && e >= dataEnd) {
        st.vp.startMs = null; st.vp.endMs = null;
      } else {
        st.vp.startMs = s; st.vp.endMs = e;
      }
      drawAll();
    }

    function onPointerDown(e) {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      didDrag = false;
      if (pointers.size === 2) {
        const layout = getLayout();
        if (!layout) return;
        const arr = Array.from(pointers.values());
        const dx = arr[0].x - arr[1].x, dy = arr[0].y - arr[1].y;
        const rect = canvas.getBoundingClientRect();
        const midX = (arr[0].x + arr[1].x) / 2 - rect.left;
        const midFrac = Math.max(0, Math.min(1, (midX - layout.PAD_L) / layout.plotW));
        pinchStart = {
          dist: Math.hypot(dx, dy) || 1,
          midFrac,
          startMs: layout.startMs, endMs: layout.endMs,
        };
        panStart = null;
      } else if (pointers.size === 1) {
        const layout = getLayout();
        if (!layout) return;
        panStart = { x: e.clientX, startMs: layout.startMs, endMs: layout.endMs };
      }
    }

    function onPointerMove(e) {
      if (!pointers.has(e.pointerId)) {
        // hover only — show tooltip
        showTooltipAt(e);
        return;
      }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.size === 2 && pinchStart) {
        const arr = Array.from(pointers.values());
        const dx = arr[0].x - arr[1].x, dy = arr[0].y - arr[1].y;
        const dist = Math.hypot(dx, dy) || 1;
        const scale = pinchStart.dist / dist; // dist grows → scale<1 (zoom in)
        const range = (pinchStart.endMs - pinchStart.startMs) * scale;
        const cursorMs = pinchStart.startMs + pinchStart.midFrac * (pinchStart.endMs - pinchStart.startMs);
        const newStart = cursorMs - pinchStart.midFrac * range;
        const newEnd   = cursorMs + (1 - pinchStart.midFrac) * range;
        didDrag = true;
        tipEl.style.opacity = '0';
        setVP(newStart, newEnd);
      } else if (pointers.size === 1 && panStart) {
        const layout = getLayout();
        if (!layout) return;
        const dx = e.clientX - panStart.x;
        if (Math.abs(dx) < 3 && !didDrag) return;
        didDrag = true;
        tipEl.style.opacity = '0';
        const range = panStart.endMs - panStart.startMs;
        const shift = -(dx / layout.plotW) * range;
        setVP(panStart.startMs + shift, panStart.endMs + shift);
      }
    }

    function onPointerUp(e) {
      pointers.delete(e.pointerId);
      try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
      if (pointers.size < 2) pinchStart = null;
      if (pointers.size === 0) panStart = null;
      if (!didDrag) showTooltipAt(e);
    }

    function showTooltipAt(e) {
      const layout = getLayout();
      if (!layout) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      let best = null, bestDist = 12 * 12;
      for (const d of layout.dotMap) {
        const dx = d.x - mx, dy = d.y - my;
        const dist = dx * dx + dy * dy;
        if (dist < bestDist) { best = d; bestDist = dist; }
      }
      if (!best) {
        if (mx < layout.PAD_L || mx > layout.W - layout.PAD_R) {
          tipEl.style.opacity = '0'; return;
        }
        const ms = layout.startMs + (mx - layout.PAD_L) / layout.plotW * (layout.endMs - layout.startMs);
        const dateStr = new Date(ms).toISOString().slice(0, 10);
        tipEl.innerHTML = `<div>${dateStr}</div>`;
      } else {
        const ev = best.ev;
        const isAspect = ev.t === 'aspect';
        const ttl = isAspect ? `${ev.p} <b>${ev.a}</b>` : `${ev.pl} ${ev.t === 'retrograde_start' ? 'Rx▼' : 'Rx▲'}`;
        const isFuture = +new Date(ev.d) > Date.now();
        const imp = best.imp;
        let impLine = '';
        if (imp) {
          const arrow = imp.sign > 0 ? '▲' : imp.sign < 0 ? '▼' : '·';
          const dirColor = imp.sign > 0 ? '#4ade80' : imp.sign < 0 ? '#f87171' : 'var(--fg-muted)';
          const sign = imp.sign > 0 ? '+' : imp.sign < 0 ? '−' : '';
          impLine = `<div style="margin-top:3px;color:${dirColor};font-weight:700">${arrow} ${sign}${(Math.abs(imp.median)*100).toFixed(2)}% (${imp.horizonLabel}) · n=${imp.n} hit ${(imp.hitRate*100).toFixed(0)}%</div>`;
        }
        tipEl.innerHTML = `<div style="color:${best.color}">${ttl}</div>
          <div style="color:var(--fg-muted);font-size:0.65rem">${ev.d}${isFuture ? ' · future · pinned to last close' : ''}</div>
          ${impLine}`;
      }
      tipEl.style.opacity = '1';
      const tipW = tipEl.offsetWidth || 140;
      const tipH = tipEl.offsetHeight || 32;
      let tx = mx + 10, ty = my + 10;
      if (tx + tipW > layout.W) tx = mx - tipW - 10;
      if (ty + tipH > layout.H) ty = my - tipH - 10;
      tipEl.style.left = Math.max(2, tx) + 'px';
      tipEl.style.top  = Math.max(2, ty) + 'px';
    }

    function onPointerLeave() { tipEl.style.opacity = '0'; }

    function onWheel(e) {
      const layout = getLayout();
      if (!layout) return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const cursorFrac = Math.max(0, Math.min(1, (mx - layout.PAD_L) / layout.plotW));
      const factor = e.deltaY > 0 ? 1.3 : 1 / 1.3;
      const range = layout.endMs - layout.startMs;
      const newRange = range * factor;
      const cursorMs = layout.startMs + cursorFrac * range;
      setVP(cursorMs - cursorFrac * newRange, cursorMs + (1 - cursorFrac) * newRange);
    }

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup',   onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
  }

  window.OC_MODULES = window.OC_MODULES || {};
  window.OC_MODULES['cycles'] = { render };
})();
