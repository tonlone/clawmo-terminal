/* ============================================================================
   fastgraph-core.js — shared FAST Graphs-style fair-value math
   ----------------------------------------------------------------------------
   Single source of truth for the "Fair Value" sub-tab on BOTH surfaces
   (stocks.clawmo.tech Stock Analysis > Financials, and terminal financials
   module). Pure, framework-free, no Chart.js dependency — the per-surface
   render functions are thin wrappers over this. Keep the two copies of this
   file (stocks-app + terminal) byte-identical; this is the parity contract
   from project_geo_port_to_stocksapp_2026_06_03.

   Input: the financials JSON returned by /api/stock/{T}/financials (`_finData`).
   Relevant keys:
     per_share.{years:["TTM","2016",..], eps_diluted, revenue_per_share,
                book_value_per_share, dividend_per_share}
     valuation_history.price_monthly.{dates, close, adjClose}
     valuation_history.averages.<metric>.{avg_5y,avg_10y,min_10y,max_10y,stddev}
       metric ∈ {pe_ratio, ps_ratio, pb_ratio, dividend_yield}
     growth_rates.eps.{1y,3y,5y,10y}  (DECIMALS, may be null)
     profile.{name,sector}; reporting_currency; fetched_at

   Spec: workspace/roadmaps/fastgraph-fair-value-chart-spec.md.
   Phase A: P/E only. Phase B (this file): metric toggle (P/E·P/S·P/B·DivYield),
   forward projection (P/E only, compounded EPS growth + analyst target),
   per-share "mountain" series exposed for the render layer.
   ========================================================================== */
(function (root) {
  'use strict';

  // GDF reference-multiple cap (§4d / §12-Q1: GDF-capped, fall back to 15).
  var REF_PE_CAP = 22;
  var REF_PE_FLOOR = 15;

  // Metric config. `inverse` = the "multiple" is price/value inverted, i.e.
  // a yield: fair price = perShare / avgYield (only dividend_yield today).
  // `hasRef` = the GDF reference line applies (P/E only). `hasForward` = the
  // forward-EPS projection applies (P/E only — we lack revenue/book forecasts).
  var METRICS = {
    pe:        { perShare: 'eps_diluted',          avg: 'pe_ratio',       inverse: false, hasRef: true,  hasForward: true,  label: 'P/E',       mountain: 'EPS',        unit: 'x' },
    ps:        { perShare: 'revenue_per_share',    avg: 'ps_ratio',       inverse: false, hasRef: false, hasForward: false, label: 'P/S',       mountain: 'Rev/sh',     unit: 'x' },
    pb:        { perShare: 'book_value_per_share', avg: 'pb_ratio',       inverse: false, hasRef: false, hasForward: false, label: 'P/B',       mountain: 'Book/sh',    unit: 'x' },
    div_yield: { perShare: 'dividend_per_share',   avg: 'dividend_yield', inverse: true,  hasRef: false, hasForward: false, label: 'Div Yield', mountain: 'Div/sh',     unit: '%' }
  };

  function parseYMD(s) {
    var p = String(s).split('-');
    return new Date(Date.UTC(+p[0], (+p[1] || 1) - 1, +p[2] || 1, 12));
  }
  function addMonths(date, m) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + m, date.getUTCDate(), 12));
  }
  function ymd(date) {
    var mo = String(date.getUTCMonth() + 1).padStart(2, '0');
    var dd = String(date.getUTCDate()).padStart(2, '0');
    return date.getUTCFullYear() + '-' + mo + '-' + dd;
  }

  /* GDF reference P/E from 5y EPS growth (decimal). Falls back to 15x when
     growth is missing or non-positive (a shrinking business gets no premium). */
  function computeRefPE(growth5yDecimal) {
    if (growth5yDecimal == null || !isFinite(growth5yDecimal) || growth5yDecimal <= 0) {
      return { pe: REF_PE_FLOOR, basis: '15x' };
    }
    var gPct = growth5yDecimal * 100;
    var pe = Math.min(REF_PE_FLOOR + 2 * gPct, REF_PE_CAP);
    return { pe: pe, basis: pe >= REF_PE_CAP ? 'gdf-capped' : 'gdf' };
  }

  /* Build monthly per-share anchors: each annual value at that fiscal year-end,
     plus a final TTM anchor at the latest price date. Linear-interpolate
     between anchors; flat-hold outside the range. Annual points are returned
     as markers (the discrete yearly facts). */
  function buildAnchors(perShare, key, lastPriceDate) {
    var years = (perShare && perShare.years) || [];
    var vals = (perShare && perShare[key]) || [];
    var anchors = [], markers = [], ttm = null;
    for (var i = 0; i < years.length; i++) {
      var v = vals[i];
      if (v == null || !isFinite(v)) continue;
      if (years[i] === 'TTM') { ttm = v; continue; }
      var yr = parseInt(years[i], 10);
      if (!yr) continue;
      var d = yr + '-12-31';
      anchors.push({ t: parseYMD(d), v: v });
      markers.push({ date: d, v: v });
    }
    if (ttm != null && lastPriceDate) {
      var tDate = parseYMD(lastPriceDate);
      if (!anchors.length || tDate > anchors[anchors.length - 1].t) {
        anchors.push({ t: tDate, v: ttm });
      }
    }
    anchors.sort(function (a, b) { return a.t - b.t; });
    return { anchors: anchors, markers: markers, ttm: ttm };
  }

  function interpAt(date, anchors) {
    if (!anchors.length) return null;
    var t = date.getTime();
    if (t <= anchors[0].t.getTime()) return anchors[0].v;
    var last = anchors[anchors.length - 1];
    if (t >= last.t.getTime()) return last.v;
    for (var i = 1; i < anchors.length; i++) {
      var a = anchors[i - 1], b = anchors[i];
      if (t <= b.t.getTime()) {
        var span = b.t.getTime() - a.t.getTime();
        var frac = span > 0 ? (t - a.t.getTime()) / span : 0;
        return a.v + (b.v - a.v) * frac;
      }
    }
    return last.v;
  }

  function windowMonths(win) {
    if (win === '5y') return 60;
    if (win === '10y') return 120;
    return Infinity;
  }

  /* Main entry. opts: { metric:'pe'|'ps'|'pb'|'div_yield', window:'5y'|'10y'|'all',
     priceBasis:'close'|'adjClose', refPeMode:'gdf'|'15x',
     forward: null | { analystTarget, analystReturnPct, nextEarningsDate, horizonMonths } }
     Returns null if essential data is missing. */
  function buildSeries(finData, opts) {
    opts = opts || {};
    var mKey = METRICS[opts.metric] ? opts.metric : 'pe';
    var M = METRICS[mKey];
    var win = opts.window || '10y';
    var basis = opts.priceBasis === 'adjClose' ? 'adjClose' : 'close';

    var vh = (finData && finData.valuation_history) || {};
    var pm = vh.price_monthly || {};
    var datesAll = pm.dates || [];
    var pxAll = pm[basis] || pm.close || [];
    if (!datesAll.length || !pxAll.length) return null;

    var growth5y = ((finData.growth_rates || {}).eps || {})['5y'];
    var growth1y = ((finData.growth_rates || {}).eps || {})['1y'];
    var refMode = opts.refPeMode === '15x' ? '15x' : 'gdf';
    var ref = !M.hasRef ? null
      : (refMode === '15x' ? { pe: REF_PE_FLOOR, basis: '15x' } : computeRefPE(growth5y));
    var refPE = ref ? ref.pe : null;

    var anc = buildAnchors(finData.per_share || {}, M.perShare, datesAll[datesAll.length - 1]);
    var anchors = anc.anchors;

    // Compute the "normal" multiple statistics from THIS chart's own basis —
    // monthly price ÷ interpolated TTM per-share — rather than the stored
    // valuation_history.averages (which for P/S is on an inconsistent
    // quarterly-revenue basis). This guarantees the value line, trailing
    // multiple and the average all reconcile. Cap clears near-zero-denominator
    // artifacts (same caps as the Valuation panel).
    var CAP = { pe: 200, ps: 100, pb: 50, div_yield: 0.5 }[mKey] || 1000;
    var perShareAll = datesAll.map(function (d) { return interpAt(parseYMD(d), anchors); });
    function ratioOf(ps, p) {
      if (ps == null || ps <= 0 || p == null || p <= 0) return null;
      var r = M.inverse ? ps / p : p / ps;
      return (r > 0 && r <= CAP) ? r : null;
    }
    var ratioAll = datesAll.map(function (d, i) { return ratioOf(perShareAll[i], pxAll[i]); });
    function stats(arr) {
      var v = arr.filter(function (x) { return x != null; });
      if (!v.length) return { mean: null, min: null, max: null, n: 0 };
      var sum = v.reduce(function (a, b) { return a + b; }, 0);
      return { mean: sum / v.length, min: Math.min.apply(null, v), max: Math.max.apply(null, v), n: v.length };
    }
    var s10 = stats(ratioAll.slice(-120));   // ~10y normal (window-independent)
    var s5 = stats(ratioAll.slice(-60));     // ~5y normal
    var avg10 = s10.mean, avg5 = s5.mean, min10 = s10.min, max10 = s10.max;

    var n = windowMonths(win);
    var start = isFinite(n) ? Math.max(0, datesAll.length - n) : 0;
    var dates = datesAll.slice(start);
    var price = pxAll.slice(start);

    // For a "fair price" line: non-inverse → perShare × avgMultiple;
    //                          inverse (yield) → perShare / avgYield.
    function valFromMultiple(ps, mult) {
      if (ps == null || mult == null || mult <= 0) return null;
      if (M.inverse) return (ps > 0) ? ps / mult : null;
      return (ps > 0) ? ps * mult : null;
    }

    var perShareWin = perShareAll.slice(start);
    var perShare = [], normalVal = [], refVal = [], bandLo = [], bandHi = [];
    for (var i = 0; i < dates.length; i++) {
      var e = perShareWin[i];
      perShare.push(e);
      normalVal.push(valFromMultiple(e, avg10));
      refVal.push(M.hasRef ? valFromMultiple(e, refPE) : null);
      // For yields, min yield → high price, so band endpoints swap.
      var lo = valFromMultiple(e, M.inverse ? max10 : min10);
      var hi = valFromMultiple(e, M.inverse ? min10 : max10);
      bandLo.push(lo); bandHi.push(hi);
    }

    var firstDate = dates.length ? parseYMD(dates[0]).getTime() : 0;
    var perShareMarkers = anc.markers
      .filter(function (m) { return parseYMD(m.date).getTime() >= firstDate; })
      .map(function (m) { return { date: m.date, v: m.v, val: valFromMultiple(m.v, avg10) }; });

    // ── Readout ──
    var currentPrice = null;
    for (var j = price.length - 1; j >= 0; j--) {
      if (price[j] != null && price[j] > 0) { currentPrice = price[j]; break; }
    }
    var ttm = anc.ttm;
    // Current multiple in the metric's natural unit (P/E ×, yield %).
    var trailingMultiple = null;
    if (currentPrice != null && ttm != null && ttm > 0) {
      trailingMultiple = M.inverse ? (ttm / currentPrice) : (currentPrice / ttm);
    }
    var fairValueNormal = valFromMultiple(ttm, avg10);
    var fairValueRef = M.hasRef ? valFromMultiple(ttm, refPE) : null;
    // Premium/discount is metric-agnostic when expressed in PRICE terms:
    // price above the normal-multiple fair price = premium (rich).
    var premiumDiscountPct = (currentPrice != null && fairValueNormal)
      ? (currentPrice / fairValueNormal - 1) * 100 : null;
    var upsideNormalPct = (fairValueNormal != null && currentPrice)
      ? (fairValueNormal / currentPrice - 1) * 100 : null;

    // ── Forward projection (P/E only) ──
    var forward = null;
    if (M.hasForward && opts.forward && ttm != null && ttm > 0 && avg10 != null && dates.length) {
      var horizon = opts.forward.horizonMonths || 24;
      // Growth rate: prefer 1y, fall back to 5y; clamp to avoid runaway / death-spiral.
      var g = (growth1y != null && isFinite(growth1y)) ? growth1y
            : (growth5y != null && isFinite(growth5y)) ? growth5y : 0;
      g = Math.max(-0.10, Math.min(0.25, g));
      var lastDate = parseYMD(dates[dates.length - 1]);
      var fDates = [], fEps = [], fNormal = [], fRef = [];
      for (var k = 1; k <= horizon; k++) {
        var fd = addMonths(lastDate, k);
        var fe = ttm * Math.pow(1 + g, k / 12);
        fDates.push(ymd(fd)); fEps.push(fe);
        fNormal.push(fe * avg10);
        fRef.push(refPE != null ? fe * refPE : null);
      }
      // Implied annualized return to forward fair value @ normal (end of horizon).
      var yrs = horizon / 12;
      var fairAtHorizon = fNormal[fNormal.length - 1];
      var impliedAnnualReturnPct = (fairAtHorizon != null && currentPrice)
        ? (Math.pow(fairAtHorizon / currentPrice, 1 / yrs) - 1) * 100 : null;
      forward = {
        dates: fDates, eps: fEps, normalVal: fNormal, refVal: fRef,
        growthUsedPct: g * 100,
        analystTarget: opts.forward.analystTarget != null ? opts.forward.analystTarget : null,
        analystReturnPct: opts.forward.analystReturnPct != null ? opts.forward.analystReturnPct : null,
        nextEarningsDate: opts.forward.nextEarningsDate || null,
        impliedAnnualReturnPct: impliedAnnualReturnPct
      };
    }

    return {
      meta: {
        ticker: finData.ticker || (finData.profile || {}).symbol || '',
        name: (finData.profile || {}).name || '',
        sector: (finData.profile || {}).sector || '',
        currency: finData.reporting_currency || 'USD',
        fetchedAt: finData.fetched_at || null,
        priceBasis: basis, window: win
      },
      metric: mKey, metricLabel: M.label, metricUnit: M.unit, mountainLabel: M.mountain,
      isYield: M.inverse, hasReference: M.hasRef, hasForward: M.hasForward,
      dates: dates, price: price, perShare: perShare,
      normalVal: normalVal, refVal: refVal, bandLo: bandLo, bandHi: bandHi,
      perShareMarkers: perShareMarkers,
      forward: forward,
      readout: {
        currentPrice: currentPrice, ttmPerShare: ttm,
        trailingMultiple: trailingMultiple,
        normalMult5y: avg5, normalMult10y: avg10,
        minMult10y: min10, maxMult10y: max10,
        premiumDiscountPct: premiumDiscountPct,
        refPe: refPE, refPeBasis: ref ? ref.basis : null,
        fairValueNormal: fairValueNormal, fairValueRef: fairValueRef,
        upsideNormalPct: upsideNormalPct,
        epsGrowth5yPct: (growth5y != null && isFinite(growth5y)) ? growth5y * 100 : null,
        epsGrowth1yPct: (growth1y != null && isFinite(growth1y)) ? growth1y * 100 : null
      }
    };
  }

  root.FastGraphCore = {
    REF_PE_CAP: REF_PE_CAP,
    METRICS: METRICS,
    computeRefPE: computeRefPE,
    buildSeries: buildSeries
  };
})(typeof window !== 'undefined' ? window : this);
