/* SPY Base-Rate Studies — native terminal module (code STU).
   Mirrors stocks.clawmo.tech/market-studies.html; reads the same market-studies.json written
   by compute_market_studies.py. Descriptive base rates, NOT signals. Deliberately neutral
   styling (no traffic-light coloring) per the GLM Q3 safeguards. Hand-rolled HTML, no Chart.js. */
(function () {
  'use strict';
  const { fetchJSON } = window.OC_DATA;
  const BASE = 'https://stocks.clawmo.tech/data';
  const pct = (x, dp) => (x == null ? '—' : (x >= 0 ? '+' : '') + (x * 100).toFixed(dp == null ? 1 : dp) + '%');
  const pctPlain = (x, dp) => (x == null ? '—' : (x * 100).toFixed(dp == null ? 0 : dp) + '%');

  function baselineTable(d) {
    const hs = d.horizons || [], HL = d.horizon_labels || {}, u = d.unconditional || {};
    const head = '<tr><th>Forward horizon</th>' + hs.map(h => `<th>${HL[h] || h + 'd'}</th>`).join('') + '</tr>';
    const med = '<tr><td>Median return</td>' + hs.map(h => `<td class="mono">${pct(u['fwd' + h] && u['fwd' + h].median)}</td>`).join('') + '</tr>';
    const hit = '<tr><td>Share positive</td>' + hs.map(h => `<td class="mono" style="color:var(--fg-dim)">${pctPlain(u['fwd' + h] && u['fwd' + h].hit_rate)}</td>`).join('') + '</tr>';
    return `<table class="tbl-dense"><thead>${head}</thead><tbody>${med}${hit}</tbody></table>`;
  }

  function studyTable(s, hs, HL) {
    const cells = s.cells || {};
    let rows = '';
    for (const h of hs) {
      const c = cells['fwd' + h] || {};
      if (!c.n) { rows += `<tr><td>${HL[h] || h + 'd'}</td><td class="mono">0</td><td colspan="5" style="color:var(--fg-dim)">—</td></tr>`; continue; }
      const ci = c.excess_ci95 || [null, null];
      const excl = ci[0] != null && ((ci[0] > 0 && ci[1] > 0) || (ci[0] < 0 && ci[1] < 0));
      const exStyle = excl ? 'color:#60A5FA;font-weight:700' : '';
      const dot = excl ? ' •' : '';
      const rowOp = c.unstable ? ' style="opacity:0.6"' : '';
      const hitCi = c.hit_ci95 ? ` <span style="color:var(--fg-dim);font-size:10px">[${(c.hit_ci95[0] * 100).toFixed(0)}–${(c.hit_ci95[1] * 100).toFixed(0)}]</span>` : '';
      const iqr = c.iqr_bounds || [null, null];
      rows += `<tr${rowOp}>
        <td>${HL[h] || h + 'd'}${c.unstable ? ' <span style="color:var(--fg-dim)">*</span>' : ''}${c.overlap_limited ? ' <span style="color:var(--fg-dim)">~</span>' : ''}</td>
        <td class="mono">${c.n}</td>
        <td class="mono">${pct(c.median)}</td>
        <td class="mono" style="color:var(--fg-dim);font-size:10px">${pct(iqr[0])}…${pct(iqr[1])}</td>
        <td class="mono" style="color:var(--fg-dim)">${pctPlain(c.hit_rate)}${hitCi}</td>
        <td class="mono" style="${exStyle}">${pct(c.excess_mean)}${dot}</td>
        <td class="mono" style="color:var(--fg-dim);font-size:10px">${pct(ci[0])}…${pct(ci[1])}</td>
      </tr>`;
    }
    const nNote = s.n_raw !== s.n_events
      ? `${s.n_events} events (of ${s.n_raw} raw, cooldown-deduped)` : `${s.n_events} events`;
    return `<div class="mod-panel">
      <div class="mod-panel-title">${s.label.toUpperCase()} · ${s.description}</div>
      <div class="small" style="color:var(--fg-dim);margin-bottom:4px">${nNote}${s.last_trigger ? ' · last ' + s.last_trigger : ''}</div>
      <div class="tbl-wrap"><table class="tbl-dense">
        <thead><tr><th>Horizon</th><th>n</th><th>Median</th><th>IQR</th><th>Share +</th><th>Excess</th><th>Excess 95% CI</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
    </div>`;
  }

  async function renderStudies(body) {
    body.innerHTML = '<div class="mod-loading">Loading base-rate studies…</div>';
    try {
      const d = await fetchJSON(`${BASE}/market-studies.json`);
      const hs = d.horizons || [], HL = d.horizon_labels || {};
      const disc = `<div class="mod-panel" style="padding:7px 12px;border-left:3px solid #E5B94C">
        <div class="small" style="line-height:1.5"><span style="color:#E5B94C;font-weight:700">DESCRIPTIVE, NOT SIGNALS.</span> ${d.note} Not wired to any trade, grade, or portfolio.</div></div>`;
      const baseline = `<div class="mod-panel">
        <div class="mod-panel-title">UNCONDITIONAL BASELINE · the market's own drift · ${d.n_sessions ? d.n_sessions.toLocaleString() : '—'} sessions since ${d.history_start || '—'}</div>
        <div class="small" style="color:var(--fg-dim);margin-bottom:4px">Average forward SPY return from every session — the bar each study is measured against. A trigger only matters if it beats (or trails) this.</div>
        <div class="tbl-wrap">${baselineTable(d)}</div></div>`;
      const studies = (d.studies || []).map(s => studyTable(s, hs, HL)).join('');
      const foot = `<div class="mod-panel"><div class="small" style="color:var(--fg-dim);line-height:1.6">
        <b style="color:var(--fg)">Read the Excess column</b> (event mean minus baseline drift) with its 95% Newey-West CI, not the raw median — a 1993+ sample drifts up so raw returns look bullish by construction. The CI widens for overlapping windows (nearby triggers share most of their forward window). <span style="color:#60A5FA;font-weight:700">Blue • = excess CI excludes 0</span> (distinguishable from drift at this n) — NOT a buy/sell rating. <span style="color:var(--fg-dim)">* = n&lt;12; ~ = few heavily-overlapping events, CI only roughly resolvable</span>. No traffic-light coloring by design.<br>
        ${d.multiplicity || ''}<br>${d.source || ''} · snapshot ${d.generated_at || ''}</div></div>`;
      body.innerHTML = `<div class="mod-head"><div class="mod-title">${window.OC_TITLE('studies')}</div>
        <div class="mod-meta"><span class="chip chip-dim">as of ${d.as_of || '—'}</span></div></div>`
        + disc + baseline + studies + foot;
    } catch (e) {
      body.innerHTML = `<div class="mod-err">Studies module error: ${(e && e.message) || e}</div>`;
    }
  }

  window.OC_MODULES = window.OC_MODULES || {};
  window.OC_MODULES['studies'] = { render: renderStudies };
})();
