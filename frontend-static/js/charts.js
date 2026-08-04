/* terminal.clawmo.tech — shared SVG chart helpers
   Keep all color refs pointing at CSS classes (theming). */
(function () {
  'use strict';

  const COLORS = [
    'var(--accent)',
    'var(--pnl-up)',
    '#60A5FA',
    '#A78BFA',
    '#E6B84A',
    '#4FD1C5',
  ];

  /* Catmull-Rom spline → cubic bezier SVG path.
     pts: [{x, y}, ...]. Returns a "M … C … C …" d-string. */
  function smoothPath(pts) {
    if (pts.length < 2) return '';
    if (pts.length === 2) {
      return `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)} L ${pts[1].x.toFixed(1)} ${pts[1].y.toFixed(1)}`;
    }
    const d = [`M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      d.push(`C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`);
    }
    return d.join(' ');
  }

  /* Normalized-overlay chart: multiple series, each min-max normalized into
     the same 0-100 plotting space. Best for showing divergence between
     lines with different absolute scales (e.g. price vs indicator). */
  function overlayNorm(series, opts) {
    opts = opts || {};
    const W = opts.w || 780, H = opts.h || 180, pad = opts.pad || 22;
    const cleanSeries = series
      .map((s, i) => ({
        name: s.name,
        values: (s.values || []).filter(v => typeof v === 'number'),
        color: s.color || COLORS[i % COLORS.length],
        dashed: s.dashed,
      }))
      .filter(s => s.values.length >= 2);
    if (!cleanSeries.length) return '';
    // Assume all series share the same x-length
    const n = Math.max(...cleanSeries.map(s => s.values.length));
    const normed = cleanSeries.map(s => {
      const min = Math.min(...s.values), max = Math.max(...s.values);
      const span = max - min || 1;
      return {
        ...s,
        norm: s.values.map(v => ((v - min) / span) * 100),
      };
    });
    const sx = (i) => pad + (i / (n - 1)) * (W - 2 * pad);
    const sy = (v) => pad + (1 - v / 100) * (H - 2 * pad);
    const paths = normed.map(s => {
      const pts = s.norm.map((v, i) => ({ x: sx(i), y: sy(v) }));
      const d = smoothPath(pts);
      return `<path d="${d}" style="fill:none;stroke:${s.color};stroke-width:${s.dashed ? 1 : 1.5};${s.dashed ? 'stroke-dasharray:3 2;' : ''}"></path>`;
    }).join('');
    return `<svg class="oc-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${paths}</svg>`;
  }

  /* Absolute-scale line chart: multiple series on a shared Y axis.
     Good when values are comparable (e.g. 3 yield curves, all in %).
     Options: min, max (y range), gridY (how many horizontal grid lines),
              xLabels (array of strings matching values length). */
  function lineAbs(series, opts) {
    opts = opts || {};
    const W = opts.w || 780, H = opts.h || 200, padL = opts.padL || 36, padR = 12, padT = 10, padB = opts.padB || 26;
    const cleanSeries = series
      .map((s, i) => ({
        name: s.name,
        values: (s.values || []),
        color: s.color || COLORS[i % COLORS.length],
        dashed: s.dashed,
      }))
      .filter(s => s.values.length >= 2);
    if (!cleanSeries.length) return '';
    const n = Math.max(...cleanSeries.map(s => s.values.length));
    let min = opts.min != null ? opts.min : Math.min(...cleanSeries.flatMap(s => s.values.filter(v => typeof v === 'number')));
    let max = opts.max != null ? opts.max : Math.max(...cleanSeries.flatMap(s => s.values.filter(v => typeof v === 'number')));
    if (min === max) { max = min + 1; }
    // pad y range slightly
    const yPad = (max - min) * 0.05;
    min -= yPad; max += yPad;
    const sx = (i) => padL + (i / (n - 1)) * (W - padL - padR);
    const sy = (v) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);
    // Publish the geometry so OC_CROSSHAIR can be attached to a lineAbs chart without the
    // caller re-deriving padL/padR/min/max — re-deriving is how a crosshair silently drifts
    // off its own line. Read it IMMEDIATELY after the lineAbs() call that produced it.
    lineAbs.lastGeom = { n: n, xScale: sx, yScale: sy, min: min, max: max,
                         padL: padL, padR: padR, W: W, H: H };

    // grid
    const gridY = opts.gridY || 4;
    const grid = [];
    for (let i = 0; i <= gridY; i++) {
      const v = min + ((max - min) / gridY) * i;
      const y = sy(v);
      grid.push(`<line class="oc-grid" x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}"></line>`);
      grid.push(`<text class="oc-ylabel" x="${padL - 4}" y="${(y + 3).toFixed(1)}">${opts.yFmt ? opts.yFmt(v) : v.toFixed(2)}</text>`);
    }

    // zero line (if range crosses zero)
    let zeroLine = '';
    if (min < 0 && max > 0) {
      const y0 = sy(0);
      zeroLine = `<line class="oc-zero" x1="${padL}" y1="${y0.toFixed(1)}" x2="${W - padR}" y2="${y0.toFixed(1)}"></line>`;
    }

    // x labels
    let xLabels = '';
    if (opts.xLabels) {
      const step = Math.max(1, Math.floor(opts.xLabels.length / 8));
      for (let i = 0; i < opts.xLabels.length; i += step) {
        xLabels += `<text class="oc-xlabel" x="${sx(i).toFixed(1)}" y="${H - 8}" text-anchor="middle">${opts.xLabels[i]}</text>`;
      }
      // always add last label
      const lastI = opts.xLabels.length - 1;
      if ((lastI) % step !== 0) {
        xLabels += `<text class="oc-xlabel" x="${sx(lastI).toFixed(1)}" y="${H - 8}" text-anchor="middle">${opts.xLabels[lastI]}</text>`;
      }
    }

    // paths + optional dots
    const paths = cleanSeries.map(s => {
      const pts = [];
      s.values.forEach((v, i) => {
        if (typeof v !== 'number' || isNaN(v)) return;
        pts.push({ x: sx(i), y: sy(v) });
      });
      const d = smoothPath(pts);
      const pathAttr = `style="fill:none;stroke:${s.color};stroke-width:${s.dashed ? 1.1 : 1.6};${s.dashed ? 'stroke-dasharray:4 3;' : ''}"`;
      let dots = '';
      if (opts.dots) {
        dots = s.values.map((v, i) => {
          if (typeof v !== 'number' || isNaN(v)) return '';
          return `<circle cx="${sx(i).toFixed(1)}" cy="${sy(v).toFixed(1)}" r="2.5" style="fill:${s.color}"></circle>`;
        }).join('');
      }
      return `<path d="${d}" ${pathAttr}></path>${dots}`;
    }).join('');

    return `<svg class="oc-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${grid.join('')}${zeroLine}${paths}${xLabels}</svg>`;
  }

  /* Simple inline sparkline (values only) */
  function sparkline(values, opts) {
    opts = opts || {};
    const W = opts.w || 80, H = opts.h || 18;
    const pts = (values || []).filter(v => typeof v === 'number');
    if (pts.length < 2) return '';
    const min = opts.min != null ? opts.min : Math.min(...pts);
    const max = opts.max != null ? opts.max : Math.max(...pts);
    const span = max - min || 1;
    const sx = (i) => (i / (pts.length - 1)) * W;
    const sy = (v) => (1 - (v - min) / span) * H;
    const path = smoothPath(pts.map((v, i) => ({ x: sx(i), y: sy(v) })));
    const first = pts[0], last = pts[pts.length - 1];
    const cls = last >= first ? 'spark-up' : 'spark-dn';
    const color = opts.color || (last >= first ? 'var(--pnl-up)' : 'var(--pnl-dn)');
    return `<svg class="oc-spark ${cls}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <path d="${path}" style="fill:none;stroke:${color};stroke-width:1.2"></path>
    </svg>`;
  }

  /* Horizontal ranked bars (Finviz-style) — one value per label */
  function rankBars(items, opts) {
    opts = opts || {};
    if (!items.length) return '';
    const maxMag = Math.max(...items.map(x => Math.abs(x.value || 0)), 1);
    const posColor = opts.posColor || 'var(--pnl-up)';
    const negColor = opts.negColor || 'var(--pnl-dn)';
    return `<div class="rank-bars">` + items.map(it => {
      const v = it.value || 0;
      const pct = Math.min(100, (Math.abs(v) / maxMag) * 100);
      const isPos = v >= 0;
      return `
        <div class="rank-row" ${it.tooltip ? `title="${it.tooltip}"` : ''}>
          <span class="rank-label">${it.label}</span>
          <div class="rank-track">
            <div class="rank-bar" style="width:${pct.toFixed(1)}%;background:${isPos ? posColor : negColor}"></div>
          </div>
          <span class="rank-val mono ${isPos ? 'num-up' : 'num-dn'}">${opts.fmt ? opts.fmt(v) : v.toFixed(2)}</span>
        </div>
      `;
    }).join('') + `</div>`;
  }

  /* Grouped vertical bar chart — multiple series per period, each series a
     distinct color.  Used by the FIN module statement tabs.
     series: [{name, color, values[]}]   values aligned to labels[]
     opts:   {w, h, vFmt}  */
  function groupedBars(series, labels, opts) {
    opts = opts || {};
    const W = opts.w || 900, H = opts.h || 230;
    const padL = 56, padR = 14, padT = 28, padB = 22;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    if (!labels || !labels.length || !series || !series.length) return '';

    const flat = [];
    series.forEach(s => (s.values || []).forEach(v => {
      if (typeof v === 'number' && isFinite(v)) flat.push(v);
    }));
    if (!flat.length) return '';

    const hasNeg = flat.some(v => v < 0);
    const maxAbs = Math.max(...flat.map(Math.abs), 1);
    const zeroY  = hasNeg ? padT + plotH / 2 : padT + plotH;
    const span   = hasNeg ? plotH / 2 : plotH;

    const vFmt = opts.vFmt || ((v) => {
      const a = Math.abs(v);
      if (a >= 1e12) return '$' + (v / 1e12).toFixed(1) + 'T';
      if (a >= 1e9)  return '$' + (v / 1e9).toFixed(1)  + 'B';
      if (a >= 1e6)  return '$' + (v / 1e6).toFixed(1)  + 'M';
      return '$' + v.toFixed(0);
    });

    const n = labels.length;
    const m = series.length;
    const groupW = plotW / n;
    const usable = groupW * 0.78;
    const bw     = usable / m;
    const gPad   = (groupW - usable) / 2;

    const parts = [];

    // Y gridlines + labels (5 ticks)
    for (let t = 0; t <= 4; t++) {
      const frac = t / 4;
      const ty   = padT + plotH * frac;
      const val  = hasNeg ? maxAbs * (1 - 2 * frac) : maxAbs * (1 - frac);
      parts.push(`<line class="oc-grid" x1="${padL}" y1="${ty.toFixed(1)}" x2="${(W - padR)}" y2="${ty.toFixed(1)}"/>`);
      parts.push(`<text class="oc-ylabel" x="${(padL - 3)}" y="${(ty + 3).toFixed(1)}">${vFmt(val)}</text>`);
    }

    // Zero line
    parts.push(`<line class="oc-zero" x1="${padL}" y1="${zeroY.toFixed(1)}" x2="${(W - padR)}" y2="${zeroY.toFixed(1)}"/>`);

    // Bars + x labels
    labels.forEach((lbl, gi) => {
      const gx0 = padL + gi * groupW + gPad;
      series.forEach((s, si) => {
        const v = (s.values || [])[gi];
        if (v == null || !isFinite(v)) return;
        const h  = Math.abs(v) / maxAbs * span;
        const bx = gx0 + si * bw;
        const by = v >= 0 ? zeroY - h : zeroY;
        parts.push(`<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${(bw - 1.2).toFixed(1)}" height="${Math.max(h, 0.5).toFixed(1)}" style="fill:${s.color};opacity:0.85"/>`);
      });
      const lx = padL + gi * groupW + groupW / 2;
      parts.push(`<text class="oc-xlabel" x="${lx.toFixed(1)}" y="${(H - 5)}" text-anchor="middle">${lbl}</text>`);
    });

    // Legend (top, left-aligned)
    let lx = padL;
    series.forEach(s => {
      parts.push(`<rect x="${lx.toFixed(1)}" y="9" width="8" height="6" style="fill:${s.color};opacity:0.9"/>`);
      lx += 11;
      parts.push(`<text class="oc-xlabel" x="${lx.toFixed(1)}" y="15" text-anchor="start">${s.name}</text>`);
      lx += s.name.length * 5.4 + 10;
    });

    return `<svg class="oc-chart fin-grouped-bars" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${parts.join('')}</svg>`;
  }


  /* ── OC_CROSSHAIR — shared hover crosshair + readout for SVG time-series ──────────
     WHY THIS EXISTS: an audit of 29 modules / 89 plots found 5 interactive and 64
     time-series charts with no hover at all. The capability existed — it was hand-rolled
     five separate times (stock.js, breadth.js, signals.js, geo.js, cycles.js) — but
     "hand-write 5 SVG nodes per chart" had a ~7% adoption rate. So this helper INJECTS
     its own scaffolding; a design that keeps per-chart markup would reproduce the gap.

     SCOPE: SVG line/area/bar charts with index-addressable x. ⛔ Not canvas (CYC) — that
     needs a different hit path; only the index math would be shared. ⛔ Not gauges/sparklines.

     CONTRACT — attach AFTER every render, on the fresh node:
         el.innerHTML = renderChart(d);
         OC_CROSSHAIR(el.querySelector('svg'), optsFor(d));
     Re-attaching on the same element auto-detaches the previous one (see _attached), so a
     double-attach cannot stack listeners. Because the tooltip lives inside the caller's
     container, an innerHTML rebuild takes it with the chart — a stale tooltip quoting an
     old series is structurally impossible rather than merely unlikely.

     Reviewed 2026-08-03 (peer review, APPROVE-WITH-CHANGES); all blocking items applied. */
  const _attached = new WeakMap();

  function crosshair(svg, opts) {
    if (!svg || !opts) return function () {};
    const prev = _attached.get(svg);
    if (prev) prev();                        // idempotent per element

    const n = opts.n | 0;
    // A single point (or none) has no x-axis to scrub. Bail rather than divide by zero.
    if (n <= 1) return function () {};

    const vb = svg.viewBox && svg.viewBox.baseVal;
    const W = vb && vb.width ? vb.width : (svg.width && svg.width.baseVal.value);
    const H = vb && vb.height ? vb.height : (svg.height && svg.height.baseVal.value);
    if (!W || !H) {
      console.error('[OC_CROSSHAIR] svg has neither a viewBox nor width/height; refusing to guess', svg);
      return function () {};
    }

    const pad = opts.pad == null ? 22 : opts.pad;
    const plotW = W - 2 * pad;
    const xScale = opts.xScale || function (i) { return pad + (i / (n - 1)) * plotW; };
    const series = opts.series || [];
    const DOT_R = 3;                          // px, before viewport scaling

    const NS = 'http://www.w3.org/2000/svg';
    const mk = (t, a) => { const e = document.createElementNS(NS, t);
      for (const k in a) e.setAttribute(k, a[k]); return e; };

    // Scaffold appended LAST so nothing drawn later can cover the hit rect.
    const line = mk('line', { class: 'occh-x', x1: 0, y1: pad, x2: 0, y2: H - pad,
      stroke: 'var(--fg-faint, #6e7681)', 'stroke-width': 1, 'stroke-dasharray': '3 3',
      'vector-effect': 'non-scaling-stroke', opacity: 0, 'pointer-events': 'none' });
    // ⚠ <ellipse>, not <circle>: these charts use preserveAspectRatio="none", so a circle
    // is scaled non-uniformly into an ellipse whose eccentricity CHANGES on resize.
    // rx/ry are recomputed from the live CTM per move (two divisions — cheaper than a
    // ResizeObserver and always correct).
    const dots = series.map(s => mk('ellipse', { class: 'occh-dot', rx: DOT_R, ry: DOT_R,
      fill: s.color || 'var(--accent, #FF6B35)', opacity: 0, 'pointer-events': 'none' }));
    const hit = mk('rect', { class: 'occh-hit', x: pad, y: pad,
      width: plotW, height: H - 2 * pad, fill: 'transparent',
      style: 'cursor:crosshair;pointer-events:all;touch-action:none' });

    svg.appendChild(line);
    dots.forEach(d => svg.appendChild(d));
    svg.appendChild(hit);

    // Tooltip lives in the caller's container, NOT document.body — an innerHTML rebuild
    // must dispose of it, or orphans accumulate on every range change.
    let tip = opts.tooltip, madeTip = false;
    if (!tip) {
      const host = opts.tooltipContainer || svg.parentElement;
      if (host) {
        if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
        tip = document.createElement('div');
        tip.className = 'occh-tip';
        host.appendChild(tip); madeTip = true;
      }
    }

    function onMove(ev) {
      const ctm = svg.getScreenCTM();
      if (!ctm) return;                       // detached mid-rebuild — no-op, don't throw
      const pt = svg.createSVGPoint();
      pt.x = ev.clientX; pt.y = ev.clientY;
      const loc = pt.matrixTransform(ctm.inverse());
      let i = Math.round(((loc.x - pad) / plotW) * (n - 1));
      if (i < 0) i = 0; else if (i > n - 1) i = n - 1;
      const x = xScale(i);

      line.setAttribute('x1', x.toFixed(2));
      line.setAttribute('x2', x.toFixed(2));
      line.setAttribute('opacity', '0.55');

      const rx = DOT_R / (ctm.a || 1), ry = DOT_R / (ctm.d || 1);
      series.forEach((s, k) => {
        const v = s.values ? s.values[i] : null;
        const d = dots[k];
        // A gap is information. Hide the dot; never draw it at 0 and never snap to a
        // neighbour — both would invent a reading the series does not contain.
        if (v == null || !isFinite(v)) { d.setAttribute('opacity', '0'); return; }
        d.setAttribute('cx', x.toFixed(2));
        d.setAttribute('cy', (s.yScale ? s.yScale(v) : 0).toFixed(2));
        d.setAttribute('rx', rx.toFixed(2));
        d.setAttribute('ry', ry.toFixed(2));
        d.setAttribute('opacity', '1');
      });

      if (tip && opts.rows) {
        const rows = opts.rows(i) || [];
        tip.innerHTML = rows.map(r =>
          '<div class="stk-tt-row"><span class="stk-tt-k">' + r.k + '</span>' +
          '<span class="stk-tt-v mono ' + (r.cls || '') + '">' +
          // Missing values render as an em-dash ROW rather than a dropped row: a vanishing
          // row makes the tooltip jitter, and a missing metric reads as a bug, not a gap.
          (r.v == null || r.v === '' ? '<span style="opacity:.5">—</span>' : r.v) +
          '</span></div>').join('');
        tip.style.opacity = '1';
        const frac = plotW ? (x - pad) / plotW : 0;
        tip.style.left = (frac * 100).toFixed(1) + '%';
        tip.style.transform = frac > 0.6 ? 'translateX(-100%)' : 'translateX(8px)';
      }
    }
    function onLeave() {
      line.setAttribute('opacity', '0');
      dots.forEach(d => d.setAttribute('opacity', '0'));
      if (tip) tip.style.opacity = '0';
    }

    // pointer* rather than mouse*: free touch support, no desktop downside.
    hit.addEventListener('pointermove', onMove);
    hit.addEventListener('pointerleave', onLeave);

    function detach() {
      hit.removeEventListener('pointermove', onMove);
      hit.removeEventListener('pointerleave', onLeave);
      [line, hit].concat(dots).forEach(e => e.parentNode && e.parentNode.removeChild(e));
      if (madeTip && tip && tip.parentNode) tip.parentNode.removeChild(tip);
      _attached.delete(svg);
    }
    _attached.set(svg, detach);
    return detach;
  }

  window.OC_CROSSHAIR = crosshair;
  window.OC_CHART = { overlayNorm, lineAbs, sparkline, rankBars, smoothPath, groupedBars, COLORS };
})();
