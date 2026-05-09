/* GEO — Global AIS vessel monitor (Hormuz + Americas) */
(() => {
  'use strict';
  const { fetchJSON, fmt } = window.OC_DATA;
  const BASE = 'https://stocks.clawmo.tech/data';
  const API  = 'https://stocks.clawmo.tech';

  let _map = null;
  let _currentRegion = 'gulf';
  let _geoBody = null;

  const GEO_REGIONS = {
    gulf: {
      label: 'Gulf / Hormuz',
      desc:  'Persian Gulf · Strait of Hormuz · Gulf of Oman',
      heroNarrative: 'Coverage: W Persian Gulf · E Gulf / Strait of Hormuz · Gulf of Oman (3 VesselFinder tiles). ~21% of global seaborne oil + 20% of LNG transits Hormuz.',
      contextHtml: `
        <p style="margin:0 0 6px 0"><b style="color:var(--fg)">Strait of Hormuz</b> — a 33km-wide chokepoint between Oman and Iran through which ~21% of global oil trade and ~20% of LNG passes. This module covers the full upstream/downstream picture: the Persian Gulf loading terminals and Gulf of Oman transit lanes.</p>
        <p style="margin:0 0 6px 0"><b style="color:var(--fg)">What to watch:</b> Tanker count dropping sharply below its 60-day baseline (BELOW NORMAL status), tanker share of total vessels falling, or military vessels massing near the strait signal disruption risk. The ABOVE/BELOW NORMAL status is data-driven — calculated from a rolling 60-day μ ± 1σ of tanker counts, updated 4× daily.</p>
        <p style="margin:0 0 6px 0"><b style="color:var(--fg)">Portfolio impact:</b> Disruption → oil spike (OXY, XOM, CVX) + shipping premium (tanker ETFs) + defense bid (LMT, RTX). Sustained closure pushes crude +20–40% within days.</p>`,
      marinetraffic: 'https://www.marinetraffic.com/en/ais/home/centerx:55.4/centery:25.9/zoom:7',
      center: [26, 55], zoom: 6,
    },
    arabian_sea: {
      label: 'Arabian Sea',
      desc:  'W Arabian Sea · Pakistan coast · India west coast',
      heroNarrative: 'Coverage: NW Arabian Sea + Pakistan coast + India west coast. Primary corridor for Gulf LNG/crude moving east toward Indian subcontinent terminals.',
      contextHtml: `
        <p style="margin:0 0 6px 0"><b style="color:var(--fg)">Arabian Sea</b> — the first leg after Gulf of Oman for tankers heading to India, Pakistan, and onward. India is the world's 3rd-largest LNG importer and a major crude buyer from the Gulf.</p>
        <p style="margin:0 0 6px 0"><b style="color:var(--fg)">Key ports:</b> Mundra (Gujarat), JNPT (Mumbai), Kochi, Karachi — watch for unusual congestion or vessel diversions signalling demand shifts or port disruption.</p>
        <p style="margin:0 0 6px 0"><b style="color:var(--fg)">Portfolio impact:</b> India LNG demand surge (Petronet, GAIL) · tanker utilisation (TK, DHT) · Red Sea / Gulf of Aden disruptions reroute vessels through this corridor adding days and freight cost.</p>`,
      marinetraffic: 'https://www.marinetraffic.com/en/ais/home/centerx:67/centery:17/zoom:5',
      center: [17, 67], zoom: 5,
    },
    indian_ocean: {
      label: 'Indian Ocean',
      desc:  'India east coast · Bay of Bengal · Strait of Malacca',
      heroNarrative: 'Coverage: India east coast + Bay of Bengal + Andaman Sea + Malacca Strait. The funnel through which virtually all Middle East energy flows to East Asian buyers.',
      contextHtml: `
        <p style="margin:0 0 6px 0"><b style="color:var(--fg)">Strait of Malacca</b> — 2.8km at its narrowest; the second-most strategic chokepoint after Hormuz, carrying ~25% of global trade including ~15 million barrels/day of oil and a large share of LNG bound for Japan, China, and South Korea.</p>
        <p style="margin:0 0 6px 0"><b style="color:var(--fg)">Bay of Bengal</b> — transit lane for Myanmar, Bangladesh, and eastern India energy imports. Track LNG carriers bound for Dahej, Hazira, and Mundra regasification terminals.</p>
        <p style="margin:0 0 6px 0"><b style="color:var(--fg)">Portfolio impact:</b> Malacca congestion signals Asia demand acceleration · piracy / weather delays add freight premium · diversion around Lombok Strait adds ~3 days of cost.</p>`,
      marinetraffic: 'https://www.marinetraffic.com/en/ais/home/centerx:90/centery:8/zoom:5',
      center: [8, 90], zoom: 4,
    },
    asia_pacific: {
      label: 'Asia-Pacific',
      desc:  'South China Sea · East China Sea · Japan & Korea',
      heroNarrative: 'Coverage: South China Sea + Taiwan Strait + East China Sea + Japan/Korea approaches. Final-mile delivery region for ~45% of global seaborne LNG.',
      contextHtml: `
        <p style="margin:0 0 6px 0"><b style="color:var(--fg)">Asia-Pacific LNG demand</b> — Japan, China, and South Korea collectively import ~45% of global seaborne LNG. Unusually high tanker density signals demand pull; low density can precede spot price weakness.</p>
        <p style="margin:0 0 6px 0"><b style="color:var(--fg)">Taiwan Strait & South China Sea</b> — geopolitically sensitive waterways. Military activity or vessel diversions here have immediate impact on freight rates and energy security risk premiums.</p>
        <p style="margin:0 0 6px 0"><b style="color:var(--fg)">Portfolio impact:</b> LNG demand surge (QatarEnergy partners, Woodside) · tanker oversupply signals pricing pressure · Taiwan tensions → Asia risk premium across tech + energy.</p>`,
      marinetraffic: 'https://www.marinetraffic.com/en/ais/home/centerx:125/centery:25/zoom:5',
      center: [25, 125], zoom: 4,
    },
    // ── Americas cron-tracked regions ──────────────────────────────────────
    gulf_mexico: {
      label: 'Gulf of Mexico',
      desc:  'Houston/Galveston · New Orleans · Yucatan Channel',
      heroNarrative: 'Coverage: W Gulf (Houston/Galveston/Corpus Christi) · E Gulf (New Orleans/Tampa/Florida Straits) · Yucatan Channel approach. Primary US crude export and LNG loading corridor.',
      contextHtml: `
        <p style="margin:0 0 6px 0"><b style="color:var(--fg)">Gulf of Mexico</b> — the principal US export basin. The Houston Ship Channel and LOOP (Louisiana Offshore Oil Port) handle the majority of US crude exports; Sabine Pass and Freeport are the two largest US LNG export terminals. Tanker departures here are a leading indicator of US export volumes.</p>
        <p style="margin:0 0 6px 0"><b style="color:var(--fg)">Yucatan Channel</b> — the 200km-wide passage between Mexico and Cuba through which most Gulf traffic enters/exits toward the Atlantic and Caribbean. High inbound traffic signals loading activity ahead.</p>
        <p style="margin:0 0 6px 0"><b style="color:var(--fg)">Portfolio impact:</b> Outbound tanker surge → US crude/LNG export uptick (OXY, COP, LNG equity) · Florida Straits congestion → freight rate bump · Hurricane season June–Nov disrupts entire Gulf basin.</p>`,
      marinetraffic: 'https://www.marinetraffic.com/en/ais/home/centerx:-90/centery:27/zoom:6',
      center: [27, -90], zoom: 5,
      cronTracked: true, dataUrl: '/geo-gulf_mexico.json',
      flowEntering: '← Entering port', flowLeaving: '→ Leaving port',
    },
    panama: {
      label: 'Panama Canal',
      desc:  'Gulf of Panama (Pacific) · Caribbean approach (Atlantic)',
      heroNarrative: 'Coverage: Gulf of Panama (Pacific entrance) + Caribbean approach (Atlantic entrance). ~5% of global seaborne trade, ~40M tonnes of LNG per year transits the Expanded Canal.',
      contextHtml: `
        <p style="margin:0 0 6px 0"><b style="color:var(--fg)">Panama Canal</b> — the 80km shortcut between the Pacific and Atlantic. The Expanded Canal (2016) can handle Neopanamax vessels: up to 366m × 49m, including large LNG carriers and Suezmax tankers. ~14,000 transits/year, ~$3B in annual tolls.</p>
        <p style="margin:0 0 6px 0"><b style="color:var(--fg)">Drought risk</b> — the Canal uses Gatun Lake freshwater for its locks. Severe drought (2023–2024) cut daily transits from 36 to ~22, adding weeks to Pacific↔Atlantic voyages and spiking LNG freight rates. Watch vessel count drops as an early drought signal.</p>
        <p style="margin:0 0 6px 0"><b style="color:var(--fg)">Portfolio impact:</b> Canal congestion → higher tanker day-rates (FLNG, TK, DHT) · LNG freight spike · alternate Cape Horn or Suez routes add 7–14 days of cost · US LNG exports to Asia slow.</p>`,
      marinetraffic: 'https://www.marinetraffic.com/en/ais/home/centerx:-79.9/centery:9.1/zoom:9',
      center: [9, -80], zoom: 7,
      cronTracked: true, dataUrl: '/geo-panama.json',
      flowEntering: '← Atl→Pac', flowLeaving: '→ Pac→Atl',
    },
    venezuela: {
      label: 'Venezuela',
      desc:  'Maracaibo · Puerto La Cruz · Punta Cardón',
      heroNarrative: 'Coverage: W Venezuelan coast (Maracaibo exit, José/Punta Cardón) · E Venezuelan coast (Orinoco delta + Trinidad approaches). Primary Venezuelan crude export corridor and sanctions-monitoring zone.',
      contextHtml: `
        <p style="margin:0 0 6px 0"><b style="color:var(--fg)">Venezuelan crude exports</b> — Venezuela holds the world's largest proven oil reserves (~300Gb) but production has fallen from 3.5Mb/d (1998) to ~0.9Mb/d today. Lake Maracaibo is the historic heart; José Terminal (Anzoátegui) now handles the majority of exports to China via PDVSA-CNOOC swap agreements.</p>
        <p style="margin:0 0 6px 0"><b style="color:var(--fg)">Sanctions & dark fleet</b> — US OFAC sanctions restrict direct US purchases. Much Venezuelan crude moves via ship-to-ship (STS) transfers at sea, AIS transponder off. Visible tanker traffic here represents only a fraction of actual exports — gaps in vessel count can signal sanction-evasion upticks.</p>
        <p style="margin:0 0 6px 0"><b style="color:var(--fg)">Portfolio impact:</b> Export surge → marginal bearish crude signal · sanctions enforcement → supply shock risk · Trinidad LNG (Shell Atlantic LNG) — watch tank-vessel departures near Dragon Field.</p>`,
      marinetraffic: 'https://www.marinetraffic.com/en/ais/home/centerx:-70/centery:11/zoom:7',
      center: [11, -70], zoom: 6,
      cronTracked: true, dataUrl: '/geo-venezuela.json',
      flowEntering: '← Arriving', flowLeaving: '→ Departing',
    },
  };

  /* Traffic regime based on total SFL pings across all three tiles */
  function trafficRegime(totalSfl) {
    if (totalSfl >= 1500) return { label: 'HIGH TRAFFIC',  cls: 'num-up',   note: 'above normal throughput' };
    if (totalSfl >= 800)  return { label: 'NORMAL',         cls: 'num-up',   note: 'within expected range' };
    if (totalSfl >= 300)  return { label: 'LOW TRAFFIC',    cls: 'num-warn', note: 'below typical range' };
    return                       { label: 'DISRUPTED',      cls: 'num-dn',   note: 'critical low — possible closure' };
  }

  function shipTypeCls(type) {
    if (type === 'Tanker')   return 'num-warn';
    if (type === 'Military') return 'num-dn';
    if (type === 'Cargo')    return '';
    return 'fg-dim';
  }

  function vesselColor(type) {
    if (type === 'Tanker')   return '#f59e0b';  // amber
    if (type === 'Cargo')    return '#38bdf8';  // sky
    if (type === 'Military') return '#ef4444';  // red
    if (type === 'Special')  return '#94a3b8';  // slate
    return '#475569';                           // unknown
  }

  /* MMSI → flag: first 3 digits (MID) per ITU Radio Regulations */
  const _MID_ISO2 = {
    // Europe
    205:'BE', 209:'CY', 210:'CY', 212:'CY', 211:'DE', 219:'DK', 220:'DK',
    213:'GE', 224:'ES', 226:'FR', 227:'FR', 228:'FR', 230:'FI',
    232:'GB', 233:'GB', 234:'GB', 235:'GB',
    237:'GR', 238:'HR', 239:'GR', 240:'GR', 241:'GR',
    244:'NL', 245:'NL', 246:'NL', 247:'IT',
    248:'MT', 249:'MT', 255:'MT', 256:'MT',
    250:'IE', 251:'IS', 257:'NO', 258:'NO', 259:'NO',
    261:'PL', 263:'PT', 264:'RO', 265:'SE', 266:'SE',
    271:'TR', 272:'UA', 273:'RU', 275:'LV', 276:'EE', 277:'LT',
    // Americas
    303:'US', 308:'BS', 309:'BS', 310:'BM', 311:'BS', 312:'BZ', 338:'US', 339:'US',
    341:'VC',
    351:'PA', 352:'PA', 353:'PA', 354:'PA', 355:'PA', 356:'PA', 357:'PA',
    370:'PA', 371:'PA', 372:'PA', 373:'PA', 374:'PA', 375:'PA', 376:'PA', 377:'PA',
    // Middle East / South Asia / East Asia
    403:'SA', 408:'BH', 412:'CN', 413:'CN', 416:'TW', 419:'IN', 422:'IR',
    425:'IQ', 431:'JP', 432:'JP', 440:'KR', 441:'KR', 447:'KW', 461:'OM',
    463:'PK', 466:'QA', 470:'AE', 471:'AE', 473:'YE', 477:'HK',
    // Southeast Asia / Pacific
    511:'PW', 525:'ID', 533:'MY', 538:'MH', 548:'PH',
    563:'SG', 564:'SG', 565:'SG', 566:'SG', 567:'TH', 572:'TV', 574:'VN',
    576:'VU', 577:'VU',
    // Africa
    613:'CM', 616:'KM', 620:'DJ', 636:'LR', 671:'TG', 677:'TZ',
  };
  const _ISO2_NAME = {
    'AE':'UAE',           'BH':'Bahrain',     'BM':'Bermuda',      'BS':'Bahamas',
    'BE':'Belgium',       'BZ':'Belize',       'CM':'Cameroon',     'CN':'China',
    'CY':'Cyprus',        'DE':'Germany',      'DJ':'Djibouti',     'DK':'Denmark',
    'EE':'Estonia',       'ES':'Spain',        'FI':'Finland',      'FR':'France',
    'GB':'United Kingdom','GE':'Georgia',      'GR':'Greece',       'HK':'Hong Kong',
    'HR':'Croatia',       'ID':'Indonesia',    'IE':'Ireland',      'IN':'India',
    'IQ':'Iraq',          'IR':'Iran',         'IS':'Iceland',      'IT':'Italy',
    'JP':'Japan',         'KM':'Comoros',      'KR':'S. Korea',     'KW':'Kuwait',
    'LR':'Liberia',       'LT':'Lithuania',    'LV':'Latvia',       'MH':'Marshall Is.',
    'MT':'Malta',         'MY':'Malaysia',     'NL':'Netherlands',  'NO':'Norway',
    'OM':'Oman',          'PA':'Panama',       'PH':'Philippines',  'PK':'Pakistan',
    'PL':'Poland',        'PT':'Portugal',     'PW':'Palau',        'QA':'Qatar',
    'RO':'Romania',       'RU':'Russia',       'SA':'Saudi Arabia', 'SE':'Sweden',
    'SG':'Singapore',     'TG':'Togo',         'TH':'Thailand',     'TR':'Turkey',
    'TV':'Tuvalu',        'TW':'Taiwan',       'TZ':'Tanzania',     'UA':'Ukraine',
    'US':'United States', 'VC':'St. Vincent',  'VN':'Vietnam',      'VU':'Vanuatu',
    'YE':'Yemen',
  };

  function vesselFlag(mmsi) {
    const iso2 = _MID_ISO2[Math.floor(+mmsi / 1_000_000)];
    if (!iso2) return null;
    return { iso2, name: _ISO2_NAME[iso2] || iso2 };
  }

  function flagImg(iso2, name) {
    return `<img src="https://static.vesselfinder.net/images/flags/4x3/${iso2.toLowerCase()}.svg" `
      + `width="16" height="11" style="vertical-align:middle;margin-right:3px;border:1px solid rgba(255,255,255,0.1)" `
      + `alt="${name}" title="${name}">`;
  }

  /* 16-point compass from COG degrees */
  function compassStr(cog) {
    if (cog == null) return '—';
    const pts = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
    return pts[Math.round(cog / 22.5) % 16] + ` ${cog}°`;
  }

  /*
   * Transit flow classification — region-aware.
   * Uses _currentRegion global so no call-site changes needed.
   *
   * Gulf/Hormuz:    lon > 51°E; W=Entering, E=Leaving
   * Gulf of Mexico: NW/N/NE = entering port; S/SE/SW = leaving
   * Panama:         NE (Pac→Atl) vs SW (Atl→Pac)
   * Venezuela:      N/NE = departing loaded; S/SW = arriving in ballast
   */
  function transitFlow(lon, cog) {
    if (cog == null) return { text: '—', cls: '' };
    const region = _currentRegion || 'gulf';

    if (region === 'gulf') {
      if (lon == null || lon < 51) return { text: '—', cls: '' };
      if (cog >= 45  && cog <= 135) return { text: '→ Leaving',  cls: 'num-up'   };
      if (cog >= 225 && cog <= 315) return { text: '← Entering', cls: 'num-warn' };
      return { text: '—', cls: '' };
    }

    if (region === 'gulf_mexico') {
      // Entering US Gulf: heading W/NW/N/NE (COG 270–360 or 0–90)
      if ((cog >= 270) || (cog <= 90))  return { text: '← Entering port', cls: 'num-warn' };
      if (cog > 90 && cog < 270)        return { text: '→ Leaving port',   cls: 'num-up'  };
      return { text: '—', cls: '' };
    }

    if (region === 'panama') {
      // Pac→Atl: heading NE (COG 0–90); Atl→Pac: heading SW (180–270)
      if (cog >= 0   && cog <= 90)  return { text: '→ Pac→Atl', cls: 'num-up'   };
      if (cog >= 180 && cog <= 270) return { text: '← Atl→Pac', cls: 'num-warn' };
      return { text: '—', cls: '' };
    }

    if (region === 'venezuela') {
      // Departing loaded: heading N/NE (315–360 or 0–45)
      if ((cog >= 315) || (cog <= 45))  return { text: '→ Departing', cls: 'num-up'   };
      // Arriving in ballast: heading S/SW (135–225)
      if (cog >= 135 && cog <= 225)     return { text: '← Arriving',  cls: 'num-warn' };
      return { text: '—', cls: '' };
    }

    return { text: '—', cls: '' };
  }

  /* ── History baseline (computed from embedded history array) ── */
  function computeBaseline(history) {
    if (!history || history.length < 5) return null;
    const vals = history.map(h => h.tankers || 0);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sigma = Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / vals.length);
    return {
      mean:            Math.round(mean * 10) / 10,
      sigma:           Math.round(sigma * 10) / 10,
      high_threshold:  mean + sigma,
      low_threshold:   Math.max(0, mean - sigma),
    };
  }

  /* ── Daily aggregate helper — collapses intraday snapshots to one avg per calendar day ── */
  function dailyAggregate(history) {
    const byDay = {};
    for (const h of history) {
      const day = h.ts.slice(0, 10);
      if (!byDay[day]) byDay[day] = { ts: h.ts, tankers: [], total: [] };
      byDay[day].tankers.push(h.tankers || 0);
      byDay[day].total.push(h.total || 0);
    }
    return Object.keys(byDay).sort().map(day => ({
      ts:      byDay[day].ts,
      tankers: Math.round(byDay[day].tankers.reduce((a,b)=>a+b,0) / byDay[day].tankers.length),
      total:   Math.round(byDay[day].total.reduce((a,b)=>a+b,0)   / byDay[day].total.length),
    }));
  }

  /* ── History chart: tankers + total over time with ±1σ band ── */
  function geoHistoryChart(history) {
    if (!history || history.length < 2) {
      return `<div style="padding:8px 10px;font-size:11px;color:var(--fg-faint);font-style:italic">
        Building baseline — needs a few days of cron snapshots (${(history||[]).length} so far, need ≥5).</div>`;
    }
    const baseline  = computeBaseline(history);   // uses all raw snapshots for accurate μ/σ
    const snapshots = history.length;             // raw count for label
    const chartData = history.length > 14 ? dailyAggregate(history) : history;
    const n = chartData.length;
    const daySpan = history.length >= 2
      ? Math.max(1, Math.round((new Date(history[history.length-1].ts) - new Date(history[0].ts)) / 86400000) + 1)
      : history.length;
    const W = 520, H = 90, padL = 30, padR = 8, padT = 6, padB = 20;

    const tankers = chartData.map(h => h.tankers || 0);
    const totals  = chartData.map(h => h.total   || 0);
    let yMin = Math.min(...tankers, ...(baseline ? [baseline.low_threshold] : []));
    let yMax = Math.max(...totals,  ...(baseline ? [baseline.high_threshold]: []));
    const yPad = Math.max(1, (yMax - yMin) * 0.12);
    yMin = Math.max(0, yMin - yPad); yMax += yPad;

    const sx = i => padL + (i / Math.max(1, n - 1)) * (W - padL - padR);
    const sy = v => padT + (1 - (v - yMin) / (yMax - yMin)) * (H - padT - padB);

    // ±1σ band + mean line
    let bandSvg = '';
    if (baseline) {
      const bY1 = sy(baseline.high_threshold).toFixed(1);
      const bY2 = sy(baseline.low_threshold).toFixed(1);
      const bH  = (sy(baseline.low_threshold) - sy(baseline.high_threshold)).toFixed(1);
      const bW  = W - padL - padR;
      bandSvg = `<rect x="${padL}" y="${bY1}" width="${bW}" height="${bH}" fill="rgba(245,158,11,0.10)"/>`;
      const mY  = sy(baseline.mean).toFixed(1);
      bandSvg += `<line x1="${padL}" y1="${mY}" x2="${W - padR}" y2="${mY}" stroke="rgba(245,158,11,0.35)" stroke-width="1" stroke-dasharray="3 3"/>`;
    }

    // Smooth paths
    const sp = OC_CHART.smoothPath;
    const totalPath  = sp(totals.map((v,i)  => ({ x: sx(i), y: sy(v) })));
    const tankerPath = sp(tankers.map((v,i) => ({ x: sx(i), y: sy(v) })));

    // X labels — show up to 6 date ticks
    const step = Math.max(1, Math.floor(n / 5));
    let xLabels = '';
    const _fmtTs = ts => { const d = new Date(ts); return `${d.getMonth()+1}/${d.getDate()}`; };
    for (let i = 0; i < n; i += step) {
      xLabels += `<text x="${sx(i).toFixed(1)}" y="${H - 4}" text-anchor="middle" class="oc-xlabel">${_fmtTs(chartData[i].ts)}</text>`;
    }
    if ((n - 1) % step !== 0) {
      xLabels += `<text x="${sx(n-1).toFixed(1)}" y="${H - 4}" text-anchor="middle" class="oc-xlabel">${_fmtTs(chartData[n-1].ts)}</text>`;
    }

    // Y labels (3 ticks)
    const yTicks = [Math.round(yMax - yPad), Math.round((yMin + yMax) / 2), Math.round(yMin + yPad)];
    const yLabels = yTicks.map(v =>
      `<text x="${padL - 3}" y="${(sy(v)+3).toFixed(1)}" text-anchor="end" class="oc-xlabel">${v}</text>`
    ).join('');

    // Grid lines
    const grid = yTicks.map(v =>
      `<line x1="${padL}" y1="${sy(v).toFixed(1)}" x2="${W-padR}" y2="${sy(v).toFixed(1)}" class="oc-grid"/>`
    ).join('');

    // Status badge
    const cur = tankers[n - 1];
    let statusHtml = '';
    if (baseline) {
      const [lbl, cls] = cur > baseline.high_threshold ? ['ABOVE NORMAL','num-dn']
                       : cur < baseline.low_threshold  ? ['BELOW NORMAL','num-warn']
                       : ['NORMAL','num-up'];
      statusHtml = `<span class="mono ${cls}" style="font-size:9px;margin-left:6px">${lbl}</span>`;
    }

    return `
      <div style="margin:6px 0 10px 0;padding:8px 10px;background:var(--panel);border-radius:4px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;flex-wrap:wrap">
          <span style="font-size:10px;color:var(--fg-dim);letter-spacing:.05em">TANKERS · ${daySpan}d HISTORY (${n} daily avg · ${snapshots} snapshots)</span>
          ${baseline ? `<span class="mono" style="font-size:9px;color:var(--fg-faint)">μ=${baseline.mean} ±${baseline.sigma}</span>${statusHtml}` : ''}
          <span style="margin-left:auto;display:flex;align-items:center;gap:5px">
            <span style="width:10px;height:2px;background:rgba(148,163,184,0.45);display:inline-block;vertical-align:middle"></span>
            <span style="font-size:9px;color:var(--fg-faint)">total</span>
            <span style="width:10px;height:2px;background:#f59e0b;display:inline-block;vertical-align:middle"></span>
            <span style="font-size:9px;color:var(--fg-faint)">tankers</span>
            ${baseline ? `<span style="width:10px;height:8px;background:rgba(245,158,11,0.10);border:1px solid rgba(245,158,11,0.3);display:inline-block;vertical-align:middle"></span><span style="font-size:9px;color:var(--fg-faint)">±1σ</span>` : ''}
          </span>
        </div>
        <svg class="oc-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;max-width:${W}px;height:${H}px">
          ${grid}${bandSvg}
          <path d="${totalPath}"  style="fill:none;stroke:rgba(148,163,184,0.4);stroke-width:1;stroke-dasharray:3 2"/>
          <path d="${tankerPath}" style="fill:none;stroke:#f59e0b;stroke-width:1.6"/>
          ${xLabels}${yLabels}
        </svg>
      </div>`;
  }

  /*
   * Vessel icon: teardrop SVG (circle + nose triangle) rotated to COG.
   * The triangle points "up" in the SVG = North, so rotating by COG degrees
   * makes it point in the correct compass direction.
   * Vessels with no COG data get a plain circle.
   */
  function makeVesselIcon(color, cog) {
    const sz = 14;
    const nose = cog != null
      ? `<polygon points="7,0.5 10,5.5 4,5.5" fill="${color}" fill-opacity="0.95" stroke="rgba(0,0,0,0.5)" stroke-width="0.6"/>`
      : '';
    const rot = cog != null ? cog : 0;
    const svg = `
      <svg width="${sz}" height="${sz}" viewBox="0 0 14 14" xmlns="http://www.w3.org/2000/svg">
        <circle cx="7" cy="7" r="4.5" fill="${color}" fill-opacity="0.9" stroke="rgba(0,0,0,0.55)" stroke-width="0.8"/>
        ${nose}
      </svg>`;
    return L.divIcon({
      html: `<div style="transform:rotate(${rot}deg);width:${sz}px;height:${sz}px;transform-origin:50% 50%">${svg}</div>`,
      className: 'geo-vessel-icon',
      iconSize:   [sz, sz],
      iconAnchor: [sz / 2, sz / 2],
      popupAnchor:[0, -sz / 2 - 2],
    });
  }

  /* Map state — reset in initGeoMap each render */
  let _layers     = {};
  let _allMarkers  = [];   // { marker, type, flow, mmsi }
  let _vesselByMmsi = {};  // mmsi → full vessel object
  let _activeTypes = null;
  let _flowFilter  = 'all';  // 'all' | 'entering' | 'leaving'

  function initGeoMap(vessels, bbox) {
    if (typeof L === 'undefined') return;
    const el = document.getElementById('geo-map-canvas');
    if (!el) return;

    /* Reset per-render state */
    _allMarkers   = [];
    _vesselByMmsi = {};
    _flowFilter   = 'all';

    const rCenter = GEO_REGIONS[_currentRegion]?.center || [26.5, 56.0];
    const rZoom   = GEO_REGIONS[_currentRegion]?.zoom   || 6;
    _map = L.map('geo-map-canvas', {
      center: rCenter,
      zoom: rZoom,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 18,
    }).addTo(_map);

    const allTypes = ['Tanker', 'Cargo', 'Special', 'Military', 'Fishing', 'Passenger', 'Unknown'];
    _layers = {};
    _activeTypes = new Set(allTypes);
    allTypes.forEach(t => { _layers[t] = L.layerGroup().addTo(_map); });

    function vesselFlowCode(v) {
      const f = transitFlow(v.lon, v.cog);
      if (f.text.startsWith('←')) return 'entering';
      if (f.text.startsWith('→')) return 'leaving';
      return 'none';
    }

    function applyMapFilters() {
      Object.values(_layers).forEach(lg => lg.clearLayers());
      _allMarkers.forEach(({ marker, type, flow }) => {
        if (!_activeTypes.has(type)) return;
        if (_flowFilter !== 'all' && flow !== _flowFilter) return;
        (_layers[type] || _layers['Unknown']).addLayer(marker);
      });
    }

    vessels.forEach(v => {
      if (v.lat == null || v.lon == null) return;
      _vesselByMmsi[v.mmsi] = v;
      const color = vesselColor(v.ship_type);
      const icon  = makeVesselIcon(color, v.cog);
      const ft    = transitFlow(v.lon, v.cog);
      const flow  = ft.text.startsWith('←') ? 'entering' : ft.text.startsWith('→') ? 'leaving' : 'none';
      const flowBadge = ft.text !== '—' && ft.text !== ''
        ? `<span style="color:${flow === 'entering' ? '#fb923c' : '#4ade80'}"> ${ft.text}</span>`
        : '';
      const flg   = vesselFlag(v.mmsi);
      const lonStr = v.lon < 0 ? `${(-v.lon).toFixed(4)}°W` : `${v.lon.toFixed(4)}°E`;
      const popup =
        `<b style="color:${color}">${v.name || '—'}</b>${flowBadge}<br>` +
        `<span style="color:#94a3b8">${v.ship_type}</span>` +
        (flg ? ` · <span style="color:#94a3b8">${flg.name}</span>` : '') + `<br>` +
        (v.cog != null ? `COG: ${compassStr(v.cog)}<br>` : '') +
        `MMSI: <span style="color:#64748b">${v.mmsi}</span><br>` +
        `${v.lat.toFixed(4)}°N &nbsp;${lonStr}`;
      const type   = v.ship_type || 'Unknown';
      const marker = L.marker([v.lat, v.lon], { icon }).bindPopup(popup);
      marker.on('click', () => {
        const vessel = _vesselByMmsi[v.mmsi] || v;
        showDetailPanel(vessel, null);
        fetch(`https://stocks.clawmo.tech/api/geo/vessel/${v.mmsi}`)
          .then(r => r.json())
          .then(data => { if (data && data.ok !== false) showDetailPanel(vessel, data); })
          .catch(() => {});
      });
      marker.addTo(_layers[type] || _layers['Unknown']);
      _allMarkers.push({ marker, type, flow, mmsi: v.mmsi });
    });

    if (bbox?.sw && bbox?.ne) {
      _map.fitBounds([
        [bbox.sw.lat, bbox.sw.lon],
        [bbox.ne.lat, bbox.ne.lon],
      ], { padding: [8, 8] });
    }

    /* Type toggle buttons */
    document.querySelectorAll('.geo-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.type;
        if (!_layers[type]) return;
        const nowActive = btn.classList.toggle('active');
        btn.classList.toggle('inactive', !nowActive);
        if (nowActive) _activeTypes.add(type); else _activeTypes.delete(type);
        applyMapFilters();
      });
    });

    /* Flow filter buttons — radio style (click active to reset to 'all') */
    document.querySelectorAll('.geo-flow-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const flow = btn.dataset.flow;
        if (_flowFilter === flow) {
          _flowFilter = 'all';
          document.querySelectorAll('.geo-flow-btn').forEach(b => {
            b.classList.remove('active', 'inactive');
          });
        } else {
          _flowFilter = flow;
          document.querySelectorAll('.geo-flow-btn').forEach(b => {
            b.classList.toggle('active',   b.dataset.flow === flow);
            b.classList.toggle('inactive', b.dataset.flow !== flow);
          });
        }
        applyMapFilters();
      });
    });
  }

  /* ── Region selector + skeleton ── */
  async function renderGeo(body) {
    _geoBody = body;
    if (_map) { try { _map.remove(); } catch (_) {} _map = null; }

    const regionBtns = Object.entries(GEO_REGIONS).map(([id, r]) => {
      const a = id === _currentRegion;
      return `<button class="geo-region-btn" data-region="${id}" type="button"
        style="font-size:10px;font-weight:600;letter-spacing:.04em;padding:3px 10px;border-radius:3px;cursor:pointer;
               background:var(--${a ? 'panel-alt' : 'panel'});border:1px solid var(--${a ? 'accent' : 'panel-alt'});
               color:var(--${a ? 'fg' : 'fg-dim'})">${r.label}${id === 'gulf'
        ? ' <span style="font-size:8px;opacity:.5;font-weight:400">DEFAULT</span>' : ''}</button>`;
    }).join('');

    body.innerHTML = `
      <div id="geo-region-bar" style="display:flex;align-items:center;flex-wrap:wrap;gap:6px;padding:8px 12px;
           background:var(--panel);border-bottom:1px solid var(--panel-alt)">
        <span style="font-size:10px;letter-spacing:.08em;color:var(--fg-dim);font-weight:600;margin-right:4px">REGION</span>
        ${regionBtns}
        <span style="margin-left:auto;font-size:9px;color:var(--fg-faint)">Americas: 4× daily · Middle East: on-demand · 2h cache</span>
      </div>
      <div id="geo-region-content"></div>`;

    body.querySelectorAll('.geo-region-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.region === _currentRegion) return;
        _currentRegion = btn.dataset.region;
        body.querySelectorAll('.geo-region-btn').forEach(b => {
          const a = b.dataset.region === _currentRegion;
          b.style.background  = `var(--${a ? 'panel-alt' : 'panel'})`;
          b.style.borderColor = `var(--${a ? 'accent'    : 'panel-alt'})`;
          b.style.color       = `var(--${a ? 'fg'        : 'fg-dim'})`;
        });
        _loadRegion(document.getElementById('geo-region-content'));
      });
    });

    _loadRegion(document.getElementById('geo-region-content'));
  }

  /* ── Region content loader ── */
  async function _loadRegion(contentEl) {
    if (_map) { try { _map.remove(); } catch (_) {} _map = null; }
    const rCfg = GEO_REGIONS[_currentRegion];
    const isGulf = _currentRegion === 'gulf';
    const isCronTracked = !!rCfg.cronTracked;

    contentEl.innerHTML = `<div class="mod-loading">Loading ${rCfg.label} AIS data…</div>`;
    let d;
    try {
      if (isGulf) {
        d = await fetchJSON(`${BASE}/hormuz.json`);
      } else if (isCronTracked) {
        try {
          d = await fetchJSON(`${BASE}${rCfg.dataUrl}`);
        } catch (_) {
          d = await fetchJSON(`${API}/api/geo/region/${_currentRegion}`);
        }
      } else {
        d = await fetchJSON(`${API}/api/geo/region/${_currentRegion}`);
      }
    } catch (e) {
      contentEl.innerHTML = `<div class="mod-error">Failed to load ${rCfg.label} AIS data.<br><small>${e.message}</small></div>`;
      return;
    }

    const s   = d.summary || {};
    const reg = trafficRegime(s.total_sfl || 0);
    const tankerPct = s.total_vessels ? Math.round((s.tankers || 0) / s.total_vessels * 100) : 0;
    const vessels = d.vessels || [];
    const history = d.history || [];
    const withCog = vessels.filter(v => v.cog != null).length;

    const baseline = isCronTracked ? computeBaseline(history) : null;
    const baselineStatus = (isCronTracked && baseline) ? (() => {
      const cur = d.summary?.tankers || 0;
      if (cur > baseline.high_threshold) return { label: 'ABOVE NORMAL', cls: 'num-dn' };
      if (cur < baseline.low_threshold)  return { label: 'BELOW NORMAL', cls: 'num-warn' };
      return { label: 'NORMAL', cls: 'num-up' };
    })() : null;

    /* Format generated_at in US Eastern Time */
    const asOfET = d.generated_at
      ? new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/New_York',
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', hour12: false,
        }).format(new Date(d.generated_at)).replace(',', '') + ' ET'
      : (d.as_of || '');

    /* ── State hero ── */
    // All cron-tracked regions (incl. Gulf) use μ/σ baseline once enough history exists.
    // Fall back to hardcoded AIS-ping thresholds only while baseline is still building.
    const activeStatus = (isCronTracked && baselineStatus) ? baselineStatus
      : (isGulf ? { label: reg.label, cls: reg.cls } : null);
    const heroCls = activeStatus
      ? (activeStatus.cls === 'num-dn' ? 'brd-hero-risk' : activeStatus.cls === 'num-warn' ? 'brd-hero-caution' : 'brd-hero-healthy')
      : 'brd-hero-healthy';
    const heroTag   = isGulf ? 'PERSIAN GULF + HORMUZ + GULF OF OMAN · TANKER ACTIVITY' : `${rCfg.desc.toUpperCase()} · VESSEL ACTIVITY`;
    const heroScore = activeStatus
      ? `<span class="brd-state-score mono ${activeStatus.cls}">${activeStatus.label}</span>`
      : '';
    const hero = `
      <div class="brd-state-hero ${heroCls}">
        <div class="brd-state-headline">
          <span class="brd-state-tag">${heroTag}</span>
          ${heroScore}
        </div>
        <div class="brd-state-stats">
          <span class="chip"><span class="mono">${s.total_sfl ?? '—'}</span> AIS pings</span>
          <span class="chip"><span class="mono">${s.total_vessels ?? '—'}</span> named vessels</span>
          <span class="chip"><span class="mono num-warn">${s.tankers ?? '—'}</span> tankers (${tankerPct}%)</span>
          <span class="chip"><span class="mono">${withCog}</span> with heading</span>
        </div>
        <div class="brd-state-narrative">${rCfg.heroNarrative} Data: ${asOfET}.</div>
      </div>
    `;

    /* ── Map panel ── */
    const typeCounts = {};
    let enteringCount = 0, leavingCount = 0;
    vessels.forEach(v => {
      typeCounts[v.ship_type] = (typeCounts[v.ship_type] || 0) + 1;
      const f = transitFlow(v.lon, v.cog);
      if (f.text.startsWith('←')) enteringCount++;
      else if (f.text.startsWith('→')) leavingCount++;
    });

    /* Buttons for types that have at least one vessel */
    const TYPE_DEFS = [
      { type: 'Tanker',    color: '#f59e0b' },
      { type: 'Cargo',     color: '#38bdf8' },
      { type: 'Special',   color: '#94a3b8' },
      { type: 'Military',  color: '#ef4444' },
      { type: 'Fishing',   color: '#86efac' },
      { type: 'Passenger', color: '#c084fc' },
      { type: 'Unknown',   color: '#475569' },
    ];
    const btns = TYPE_DEFS
      .filter(td => (typeCounts[td.type] || 0) > 0)
      .map(td => `
        <button class="geo-type-btn active" data-type="${td.type}"
                style="--geo-btn-color:${td.color}">
          <span class="geo-legend-dot" style="background:${td.color}"></span>
          ${td.type} <span style="color:var(--fg-faint)">(${typeCounts[td.type]})</span>
        </button>`)
      .join('');

    const transitFilterHtml = (isGulf || isCronTracked) ? `
        <div class="geo-map-legend geo-map-legend-flow">
          <span class="geo-legend-label">TRANSIT FILTER</span>
          <button class="geo-flow-btn" data-flow="entering" style="--geo-btn-color:#fb923c">
            <span class="geo-legend-dot" style="background:#fb923c"></span>
            ${rCfg.flowEntering || '← Entering'} <span style="color:var(--fg-faint)">(${enteringCount})</span>
          </button>
          <button class="geo-flow-btn" data-flow="leaving" style="--geo-btn-color:#4ade80">
            <span class="geo-legend-dot" style="background:#4ade80"></span>
            ${rCfg.flowLeaving || '→ Leaving'} <span style="color:var(--fg-faint)">(${leavingCount})</span>
          </button>
          <span style="margin-left:auto;font-size:9px;color:var(--fg-faint)">click to isolate · click again to reset</span>
        </div>` : '';

    const mapPanelTitle = isGulf
      ? 'VESSEL POSITIONS · PERSIAN GULF + STRAIT OF HORMUZ + GULF OF OMAN'
      : `VESSEL POSITIONS · ${rCfg.desc.toUpperCase()}`;

    const mapPanel = `
      <div class="mod-panel" style="padding:0;overflow:hidden">
        <div class="mod-panel-title" style="padding:8px 12px">${mapPanelTitle}
          <span style="float:right;font-size:10px;color:var(--fg-dim);font-weight:400">▲ nose = heading</span>
        </div>
        <div class="geo-map-wrap">
          <div id="geo-map-canvas" style="height:400px;width:100%"></div>
        </div>
        <div class="geo-map-legend">
          ${btns}
          <span style="margin-left:auto;font-size:9px;color:var(--fg-faint)">${vessels.length} vessels · click type to toggle · dot = details</span>
        </div>
        ${transitFilterHtml}
      </div>
    `;

    /* ── 7-day history chart for all cron-tracked regions ── */
    const historyBlock = (isGulf || isCronTracked) ? geoHistoryChart(history) : '';

    /* ── Type breakdown table ── */
    const typeRows = (d.type_breakdown || []).map(t => `
      <tr>
        <td class="pat ${shipTypeCls(t.type)}">
          <span class="geo-legend-dot" style="background:${vesselColor(t.type)};display:inline-block;vertical-align:middle;margin-right:5px"></span>${t.type || '—'}
        </td>
        <td class="num mono">${t.count}</td>
        <td class="num mono">${t.pct}%</td>
        <td class="num mono">${t.avg_speed != null ? t.avg_speed + ' kts' : '—'}</td>
      </tr>
    `).join('');

    const typeTable = `
      <div class="mod-panel">
        <div class="mod-panel-title">VESSEL TYPE BREAKDOWN · ${asOfET}</div>
        <div class="mod-meta"><span class="chip chip-dim">${fmt.ago(d.generated_at)}</span></div>
        <div class="tbl-wrap"><table class="tbl-dense">
          <thead><tr>
            <th data-glossary="geo-ship-type">TYPE</th>
            <th class="num" data-glossary="geo-count">COUNT</th>
            <th class="num" data-glossary="geo-share">SHARE</th>
            <th class="num" data-glossary="geo-avg-spd">AVG SPD</th>
          </tr></thead>
          <tbody>${typeRows || '<tr><td colspan="4" class="small" style="color:var(--fg-dim)">No data</td></tr>'}</tbody>
        </table></div>
      </div>
    `;

    /* ── Vessel table shell — filter bar + tbody populated by initVesselSection ── */
    const typeOptItems = ['', ...[...new Set(vessels.map(v => v.ship_type))].sort()]
      .map(t => `<button class="geo-dd-opt" data-v="${t}" type="button">${t || 'All types'}</button>`)
      .join('');

    const flagOptItems = ['', ...[...new Set(vessels.map(v => vesselFlag(v.mmsi)?.name).filter(Boolean))].sort()]
      .map(n => `<button class="geo-dd-opt" data-v="${n}" type="button">${n || 'All flags'}</button>`)
      .join('');

    const vesselTable = `
      <div class="mod-panel" id="geo-vessel-panel">
        <div class="mod-panel-title" id="geo-vessel-title">NAMED VESSELS</div>
        <div class="geo-filter-bar">
          <span class="geo-filter-label">NAME</span>
          <input class="geo-filter-input" id="geo-f-name" type="text" placeholder="search…" autocomplete="off" />
          <span class="geo-filter-label">TYPE</span>
          <div class="geo-dd" id="geo-dd-type">
            <button class="geo-dd-btn" type="button"><span id="geo-dd-type-lbl">All types</span><span class="geo-dd-arrow">▾</span></button>
            <div class="geo-dd-menu" hidden>${typeOptItems}</div>
          </div>
          <span class="geo-filter-label">FLOW</span>
          <div class="geo-dd" id="geo-dd-flow">
            <button class="geo-dd-btn" type="button"><span id="geo-dd-flow-lbl">All</span><span class="geo-dd-arrow">▾</span></button>
            <div class="geo-dd-menu" hidden>
              <button class="geo-dd-opt" data-v=""         type="button">All</button>
              <button class="geo-dd-opt" data-v="entering" type="button">← Entering</button>
              <button class="geo-dd-opt" data-v="leaving"  type="button">→ Leaving</button>
              <button class="geo-dd-opt" data-v="none"     type="button">— Unclassified</button>
            </div>
          </div>
          <span class="geo-filter-label">FLAG</span>
          <div class="geo-dd" id="geo-dd-flag">
            <button class="geo-dd-btn" type="button"><span id="geo-dd-flag-lbl">All flags</span><span class="geo-dd-arrow">▾</span></button>
            <div class="geo-dd-menu geo-dd-menu-tall" hidden>${flagOptItems}</div>
          </div>
          <span class="geo-filter-label">LAT</span>
          <input class="geo-filter-input geo-f-sm" id="geo-f-lat-min" type="number" placeholder="min" step="0.1" />
          <span class="geo-filter-sep">–</span>
          <input class="geo-filter-input geo-f-sm" id="geo-f-lat-max" type="number" placeholder="max" step="0.1" />
          <span class="geo-filter-label">LON</span>
          <input class="geo-filter-input geo-f-sm" id="geo-f-lon-min" type="number" placeholder="min" step="0.1" />
          <span class="geo-filter-sep">–</span>
          <input class="geo-filter-input geo-f-sm" id="geo-f-lon-max" type="number" placeholder="max" step="0.1" />
          <span class="geo-filter-label">COG</span>
          <input class="geo-filter-input geo-f-sm" id="geo-f-cog-min" type="number" placeholder="min" step="1" min="0" max="359" />
          <span class="geo-filter-sep">–</span>
          <input class="geo-filter-input geo-f-sm" id="geo-f-cog-max" type="number" placeholder="max" step="1" min="0" max="359" />
          <button class="geo-filter-reset" id="geo-f-reset">Reset</button>
        </div>
        <div class="tbl-wrap"><table class="tbl-dense">
          <thead><tr>
            <th>NAME</th>
            <th data-glossary="geo-ship-type">TYPE</th>
            <th>FLAG</th>
            <th class="num">LAT</th>
            <th class="num">LON</th>
            <th>COG</th>
            <th data-glossary="geo-flow">FLOW</th>
            <th class="num">MMSI</th>
          </tr></thead>
          <tbody id="geo-tbl-body"></tbody>
        </table></div>
        <div class="geo-pagination" id="geo-pagination"></div>
      </div>
    `;

    /* ── Context panel ── */
    const sw = d.bbox?.sw || {};
    const ne = d.bbox?.ne || {};
    const _lonStr = v => v < 0 ? `${(-v).toFixed(1)}°W` : `${(+v).toFixed(1)}°E`;
    const bboxStr = (sw.lat != null) ? `[${sw.lat}°N ${_lonStr(sw.lon)} – ${ne.lat}°N ${_lonStr(ne.lon)}]` : '';
    const context = `
      <div class="mod-panel">
        <div class="mod-panel-title">COVERAGE & MARKET CONTEXT · ${rCfg.label.toUpperCase()}</div>
        <div style="padding:10px 12px;font-size:12px;line-height:1.7;color:var(--fg-dim)">
          ${rCfg.contextHtml}
          <p style="margin:0"><b style="color:var(--fg)">Data source:</b> VesselFinder public AIS (mp2 + sfl) · ${(isGulf || isCronTracked) ? 'updated 4× daily · ' : 'on-demand fetch · 2h cache · '}${bboxStr}.
          <a href="${rCfg.marinetraffic}" target="_blank" rel="noopener" style="color:var(--accent);margin-left:6px">MarineTraffic map ↗</a></p>
          <p style="margin:4px 0 0 0;font-size:10px;opacity:0.6">AIS data from <a href="https://vesselfinder.com" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline">VesselFinder</a> — for research and educational use only, subject to <a href="https://www.vesselfinder.com/terms" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline">their terms of service</a>. Not for commercial redistribution.</p>
        </div>
      </div>
    `;

    contentEl.innerHTML = hero + mapPanel
      + '<div id="geo-detail-panel" class="geo-detail-panel" hidden></div>'
      + historyBlock + typeTable + vesselTable + context;
    initGeoMap(vessels, d.bbox);
    initVesselSection(vessels);
  }

  /* ── Vessel table: filter + pagination ──────────────────────── */
  function initVesselSection(allVessels) {
    const PER_PAGE_DEFAULT = 50;

    /* Mutable filter + page state */
    let st = {
      name: '', type: '', flow: '', flag: '',
      latMin: null, latMax: null,
      lonMin: null, lonMax: null,
      cogMin: null, cogMax: null,
      page: 0, perPage: PER_PAGE_DEFAULT,
    };

    /* Flow code for a vessel — used in filtering */
    function flowCode(v) {
      const f = transitFlow(v.lon, v.cog);
      if (f.text.startsWith('←')) return 'entering';
      if (f.text.startsWith('→')) return 'leaving';
      return 'none';
    }

    function applyFilters() {
      const nameLo = st.name.toLowerCase();
      return allVessels.filter(v => {
        if (nameLo && !(v.name || '').toLowerCase().includes(nameLo)) return false;
        if (st.type && v.ship_type !== st.type) return false;
        if (st.flow && flowCode(v) !== st.flow) return false;
        if (st.flag && vesselFlag(v.mmsi)?.name !== st.flag) return false;
        if (st.latMin !== null && v.lat < st.latMin) return false;
        if (st.latMax !== null && v.lat > st.latMax) return false;
        if (st.lonMin !== null && v.lon < st.lonMin) return false;
        if (st.lonMax !== null && v.lon > st.lonMax) return false;
        if (st.cogMin !== null && (v.cog == null || v.cog < st.cogMin)) return false;
        if (st.cogMax !== null && (v.cog == null || v.cog > st.cogMax)) return false;
        return true;
      });
    }

    function renderRow(v) {
      const cls    = shipTypeCls(v.ship_type || 'Unknown');
      const lat    = v.lat != null ? v.lat.toFixed(3) + '°N' : '—';
      const lon    = v.lon != null ? (v.lon < 0 ? (-v.lon).toFixed(3) + '°W' : v.lon.toFixed(3) + '°E') : '—';
      const cogTxt = v.cog != null ? compassStr(v.cog) : '—';
      const flow   = transitFlow(v.lon, v.cog);
      const flg    = vesselFlag(v.mmsi);
      const flagCell = flg
        ? `${flagImg(flg.iso2, flg.name)}<span style="font-size:10px">${flg.name}</span>`
        : `<span class="fg-faint" style="font-size:10px">—</span>`;
      return `<tr>
        <td class="pat ${cls} geo-pin-link" title="Pinpoint on map" onclick="OC_GEO_PIN(${v.mmsi})">${v.name || '—'}</td>
        <td class="${cls}"><span class="geo-legend-dot" style="background:${vesselColor(v.ship_type)};display:inline-block;vertical-align:middle;margin-right:4px"></span>${v.ship_type || '—'}</td>
        <td style="white-space:nowrap">${flagCell}</td>
        <td class="num mono small">${lat}</td>
        <td class="num mono small">${lon}</td>
        <td class="mono small">${cogTxt}</td>
        <td class="mono small ${flow.cls}">${flow.text}</td>
        <td class="mono small fg-dim">${v.mmsi}</td>
      </tr>`;
    }

    function renderPageBtns(totalPages) {
      /* Show at most 7 page buttons with ellipsis compression */
      const cur = st.page;
      const pages = [];
      if (totalPages <= 7) {
        for (let i = 0; i < totalPages; i++) pages.push(i);
      } else {
        pages.push(0);
        if (cur > 2) pages.push('…');
        for (let i = Math.max(1, cur - 1); i <= Math.min(totalPages - 2, cur + 1); i++) pages.push(i);
        if (cur < totalPages - 3) pages.push('…');
        pages.push(totalPages - 1);
      }
      return pages.map(p =>
        p === '…'
          ? `<span class="geo-filter-sep" style="padding:0 2px">…</span>`
          : `<button class="geo-page-btn${p === cur ? ' geo-pg-active' : ''}" data-pg="${p}">${p + 1}</button>`
      ).join('');
    }

    function refresh() {
      const filtered   = applyFilters();
      const totalPages = Math.max(1, Math.ceil(filtered.length / st.perPage));
      st.page = Math.min(st.page, totalPages - 1);
      const slice = filtered.slice(st.page * st.perPage, (st.page + 1) * st.perPage);

      /* Title */
      const titleEl = document.getElementById('geo-vessel-title');
      if (titleEl) {
        const isFiltered = filtered.length < allVessels.length;
        titleEl.textContent =
          `NAMED VESSELS · ${filtered.length}${isFiltered ? ' filtered' : ''} of ${allVessels.length}`
          + ` · page ${st.page + 1} of ${totalPages} · tankers first`;
      }

      /* Rows */
      const tbody = document.getElementById('geo-tbl-body');
      if (tbody) tbody.innerHTML = slice.length
        ? slice.map(renderRow).join('')
        : '<tr><td colspan="8" class="small" style="color:var(--fg-dim);padding:10px">No vessels match the current filters.</td></tr>';

      /* Pagination bar */
      const pag = document.getElementById('geo-pagination');
      if (pag) {
        pag.innerHTML =
          `<button class="geo-page-btn" id="geo-pg-prev" ${st.page === 0 ? 'disabled' : ''}>← Prev</button>`
          + renderPageBtns(totalPages)
          + `<button class="geo-page-btn" id="geo-pg-next" ${st.page >= totalPages - 1 ? 'disabled' : ''}>Next →</button>`
          + `<span style="margin-left:8px;color:var(--fg-faint)">${filtered.length} vessels</span>`
          + `<select class="geo-filter-select" id="geo-pg-size" style="margin-left:10px">`
          + [25, 50, 100, 200].map(n => `<option value="${n}"${n === st.perPage ? ' selected' : ''}>${n} / page</option>`).join('')
          + `</select>`;

        document.getElementById('geo-pg-prev')?.addEventListener('click', () => { st.page--; refresh(); });
        document.getElementById('geo-pg-next')?.addEventListener('click', () => { st.page++; refresh(); });
        pag.querySelectorAll('.geo-page-btn[data-pg]').forEach(btn =>
          btn.addEventListener('click', () => { st.page = +btn.dataset.pg; refresh(); })
        );
        document.getElementById('geo-pg-size')?.addEventListener('change', e => {
          st.perPage = +e.target.value; st.page = 0; refresh();
        });
      }
    }

    /* Bind a filter input to a state key */
    function bind(id, key, parse) {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => {
        const raw = el.value.trim();
        st[key] = parse ? (raw ? parse(raw) : null) : raw;
        st.page = 0;
        refresh();
      });
    }

    bind('geo-f-name', 'name');

    /* Wire custom dropdowns for TYPE and FLOW */
    function geoDD(wrapperId, lblId, onPick) {
      const wrap = document.getElementById(wrapperId);
      if (!wrap) return;
      const menu = wrap.querySelector('.geo-dd-menu');
      const lbl  = document.getElementById(lblId);
      wrap.querySelector('.geo-dd-btn').addEventListener('click', e => {
        e.stopPropagation();
        const opening = menu.hidden;
        document.querySelectorAll('.geo-dd-menu').forEach(m => { m.hidden = true; });
        if (opening) {
          menu.hidden = false;
          const away = () => { menu.hidden = true; document.removeEventListener('click', away); };
          document.addEventListener('click', away);
        }
      });
      menu.querySelectorAll('.geo-dd-opt').forEach(opt => {
        opt.addEventListener('click', e => {
          e.stopPropagation();
          lbl.textContent = opt.textContent;
          menu.querySelectorAll('.geo-dd-opt').forEach(o => o.removeAttribute('aria-selected'));
          opt.setAttribute('aria-selected', 'true');
          menu.hidden = true;
          onPick(opt.dataset.v);
        });
      });
    }
    geoDD('geo-dd-type', 'geo-dd-type-lbl', v => { st.type = v; st.page = 0; refresh(); });
    geoDD('geo-dd-flow', 'geo-dd-flow-lbl', v => { st.flow = v; st.page = 0; refresh(); });
    geoDD('geo-dd-flag', 'geo-dd-flag-lbl', v => { st.flag = v; st.page = 0; refresh(); });
    bind('geo-f-lat-min', 'latMin', parseFloat);
    bind('geo-f-lat-max', 'latMax', parseFloat);
    bind('geo-f-lon-min', 'lonMin', parseFloat);
    bind('geo-f-lon-max', 'lonMax', parseFloat);
    bind('geo-f-cog-min', 'cogMin', parseInt);
    bind('geo-f-cog-max', 'cogMax', parseInt);

    document.getElementById('geo-f-reset')?.addEventListener('click', () => {
      st = { name:'', type:'', flow:'', flag:'', latMin:null, latMax:null, lonMin:null, lonMax:null, cogMin:null, cogMax:null, page:0, perPage:st.perPage };
      ['geo-f-name','geo-f-lat-min','geo-f-lat-max',
       'geo-f-lon-min','geo-f-lon-max','geo-f-cog-min','geo-f-cog-max'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      const typeLbl = document.getElementById('geo-dd-type-lbl');
      const flowLbl = document.getElementById('geo-dd-flow-lbl');
      const flagLbl = document.getElementById('geo-dd-flag-lbl');
      if (typeLbl) typeLbl.textContent = 'All types';
      if (flowLbl) flowLbl.textContent = 'All';
      if (flagLbl) flagLbl.textContent = 'All flags';
      document.querySelectorAll('#geo-dd-type .geo-dd-opt, #geo-dd-flow .geo-dd-opt, #geo-dd-flag .geo-dd-opt')
        .forEach(o => o.removeAttribute('aria-selected'));
      refresh();
    });

    refresh();  // initial render
  }

  /* ── Detail panel helpers ─────────────────────────────── */
  function flagEmoji(code) {
    if (!code || code.length < 2) return '';
    try {
      return String.fromCodePoint(0x1F1E6 + code.toUpperCase().charCodeAt(0) - 65) +
             String.fromCodePoint(0x1F1E6 + code.toUpperCase().charCodeAt(1) - 65);
    } catch (_) { return ''; }
  }

  function navStatusCls(code) {
    if (code === 0 || code === 8) return 'num-up';
    if (code === 1 || code === 5) return 'num-warn';
    if (code === 2 || code === 3 || code === 6) return 'num-dn';
    return 'fg-dim';
  }

  function showDetailPanel(v, rich) {
    const panel = document.getElementById('geo-detail-panel');
    if (!panel) return;

    const name  = v.name || '—';
    const mmsi  = v.mmsi ?? '—';
    const lat   = v.lat, lon = v.lon;
    const posStr = lat != null ? `${lat.toFixed(4)}°N  ${lon.toFixed(4)}°E` : '—';

    /* Flag — from rich */
    const flagCode = rich?.flag_iso2 || '';
    const flagName = rich?.flag || '';
    const flagSvg  = flagCode
      ? `<img src="https://static.vesselfinder.net/images/flags/4x3/${flagCode.toLowerCase()}.svg" width="20" height="14" style="vertical-align:middle;margin-right:4px" alt="${flagName}">`
      : '';

    /* Vessel photo */
    const photoUrl = rich?.photo_url || null;
    const photoHtml = photoUrl
      ? `<div class="gdp-photo-wrap"><img class="gdp-photo" src="${photoUrl}" alt="${v.name}" loading="lazy" onerror="this.parentElement.hidden=true"></div>`
      : '';

    /* Header sub-line */
    const typeLabel = rich?.ship_type || v.ship_type || '—';
    const cs  = rich?.callsign ? ` · ${rich.callsign}` : '';
    const imo = rich?.imo      ? ` · IMO ${rich.imo}`  : '';

    /* ── Voyage section ── */
    const dest      = rich?.destination || null;
    const eta       = rich?.eta         || null;
    const lastPort  = rich?.last_port   || null;
    const voyageHtml = rich ? `
      <div class="gdp-section">
        <div class="gdp-section-title">VOYAGE</div>
        <div class="gdp-row">
          ${lastPort ? `<div class="gdp-cell"><div class="gdp-label">LAST PORT</div><div class="gdp-value small">${lastPort}</div></div>` : ''}
          ${lastPort && dest ? `<div class="gdp-arrow">→</div>` : ''}
          ${dest ? `<div class="gdp-cell"><div class="gdp-label">DESTINATION</div><div class="gdp-value">${dest}</div></div>` : ''}
        </div>
        ${eta ? `<div class="gdp-row"><div class="gdp-cell"><div class="gdp-label">ETA</div><div class="gdp-value mono small">${eta}</div></div></div>` : ''}
      </div>` : '';

    /* ── Navigation section ── */
    const navCode = v.nav_status ?? 15;
    const NAV_LABEL = {
      0:'Underway Using Engine', 1:'At Anchor', 2:'Not Under Command',
      3:'Restricted Manoeuvrability', 4:'Constrained by Draught', 5:'Moored',
      6:'Aground', 7:'Engaged in Fishing', 8:'Under Way Sailing', 15:'Undefined',
    };
    const navText     = rich?.nav_status || NAV_LABEL[navCode] || `Status ${navCode}`;
    const navCls      = navStatusCls(navCode);
    const speed       = rich?.speed_kn   != null ? `${rich.speed_kn} kn`  : null;
    const course      = v.cog            != null ? `${v.cog}° ${compassStr(v.cog)}` : null;
    const draught     = rich?.draught_m  != null ? `${rich.draught_m} m`  : null;
    const posAgo      = rich?.pos_ago    || null;

    const navHtml = `
      <div class="gdp-section">
        <div class="gdp-section-title">NAVIGATION</div>
        <div class="gdp-row"><div class="gdp-cell wide"><div class="gdp-label">STATUS</div><div class="gdp-value ${navCls}">${navText}</div></div></div>
        <div class="gdp-row">
          ${speed   ? `<div class="gdp-cell"><div class="gdp-label">SPEED</div><div class="gdp-value mono">${speed}</div></div>` : ''}
          ${course  ? `<div class="gdp-cell"><div class="gdp-label">COURSE</div><div class="gdp-value mono">${course}</div></div>` : ''}
          ${draught ? `<div class="gdp-cell"><div class="gdp-label">DRAUGHT</div><div class="gdp-value mono">${draught}</div></div>` : ''}
        </div>
      </div>`;

    /* ── Position section ── */
    const posHtml = `
      <div class="gdp-section">
        <div class="gdp-section-title">POSITION</div>
        <div class="gdp-row">
          <div class="gdp-cell wide"><div class="gdp-label">COORDINATES</div><div class="gdp-value mono small">${posStr}</div></div>
          ${posAgo ? `<div class="gdp-cell"><div class="gdp-label">LAST AIS</div><div class="gdp-value small">${posAgo}</div></div>` : ''}
        </div>
      </div>`;

    /* ── Vessel info section (static) ── */
    const dim      = (rich?.length_m && rich?.beam_m) ? `${rich.length_m}m × ${rich.beam_m}m` : null;
    const gt       = rich?.gross_ton ? Number(rich.gross_ton).toLocaleString() + ' GT' : null;
    const yr       = rich?.year_built || null;
    const aisType  = rich?.ais_type   || null;
    const infoHtml = (rich && (dim || gt || yr || flagName || aisType)) ? `
      <div class="gdp-section">
        <div class="gdp-section-title">VESSEL</div>
        <div class="gdp-row">
          ${flagName ? `<div class="gdp-cell"><div class="gdp-label">FLAG</div><div class="gdp-value">${flagSvg}${flagName}</div></div>` : ''}
          ${aisType  ? `<div class="gdp-cell"><div class="gdp-label">AIS CLASS</div><div class="gdp-value">${aisType}</div></div>` : ''}
          ${yr       ? `<div class="gdp-cell"><div class="gdp-label">BUILT</div><div class="gdp-value mono">${yr}</div></div>` : ''}
        </div>
        <div class="gdp-row">
          ${dim ? `<div class="gdp-cell"><div class="gdp-label">LOA × BEAM</div><div class="gdp-value mono">${dim}</div></div>` : ''}
          ${gt  ? `<div class="gdp-cell"><div class="gdp-label">GROSS TONNAGE</div><div class="gdp-value mono">${gt}</div></div>` : ''}
        </div>
      </div>` : '';

    /* ── Loading placeholder ── */
    const loadingHtml = !rich ? `<div class="gdp-loading">Fetching live data from VesselFinder…</div>` : '';

    /* ── Footer links ── */
    const mtUrl = `https://www.marinetraffic.com/en/ais/details/ships/mmsi:${mmsi}`;
    const vfUrl = `https://www.vesselfinder.com/vessels/details/${mmsi}`;
    const footer = `
      <div class="gdp-footer">
        <a href="${mtUrl}" target="_blank" rel="noopener" class="gdp-link">MarineTraffic ↗</a>
        <a href="${vfUrl}" target="_blank" rel="noopener" class="gdp-link">VesselFinder ↗</a>
        ${imo ? `<span class="fg-dim" style="margin-left:auto;font-size:10px">${imo.replace(' · ','')}</span>` : ''}
      </div>`;

    panel.innerHTML = `
      <div class="gdp-header">
        <div>
          <div class="gdp-name">${name}</div>
          <div class="gdp-sub">${typeLabel}${cs}${imo} · MMSI: ${mmsi}</div>
        </div>
        <button class="gdp-close" onclick="OC_GEO_CLOSE_DETAIL()" type="button">✕</button>
      </div>
      ${photoHtml}
      <div class="gdp-body">${loadingHtml}${voyageHtml}${navHtml}${posHtml}${infoHtml}${footer}</div>`;

    panel.hidden = false;
  }

  window.OC_GEO_CLOSE_DETAIL = function() {
    const p = document.getElementById('geo-detail-panel');
    if (p) p.hidden = true;
  };

  window.OC_GEO_PIN = function(mmsi) {
    if (!_map) return;
    const entry = _allMarkers.find(m => m.mmsi === mmsi);
    if (!entry) return;

    /* Pan + zoom map */
    const latlng = entry.marker.getLatLng();
    if (!entry.marker._map) entry.marker.addTo(_map);
    _map.setView(latlng, 11, { animate: true });
    setTimeout(() => entry.marker.openPopup(), 350);

    /* Scroll map into view */
    const canvas = document.getElementById('geo-map-canvas');
    if (canvas) canvas.scrollIntoView({ behavior: 'smooth', block: 'center' });

    /* Show panel immediately with local data, then enrich via scraper */
    const v = _vesselByMmsi[mmsi] || {};
    showDetailPanel(v, null);
    fetch(`https://stocks.clawmo.tech/api/geo/vessel/${mmsi}`)
      .then(r => r.json())
      .then(data => { if (data && data.ok !== false) showDetailPanel(v, data); })
      .catch(() => {});
  };

  async function beforeRefreshGeo() {
    if (_currentRegion !== 'gulf') return;
    try {
      await fetch('https://stocks.clawmo.tech/api/geo/refresh', { method: 'POST' });
    } catch (_) { /* network error — render will use cached file */ }
  }

  window.OC_MODULES = window.OC_MODULES || {};
  window.OC_MODULES['geo'] = { render: renderGeo, beforeRefresh: beforeRefreshGeo };
})();
