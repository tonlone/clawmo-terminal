/* GPU Cloud Pricing — native terminal module.
   Hand-rolled SVG (no Chart.js). Mirrors stocks.clawmo.tech/gpu.html; reads the same
   gpu-pricing.json + gpu-pricing-history.json written by compute_gpu_pricing.py. */
(function () {
  'use strict';
  const { fetchJSON } = window.OC_DATA;
  const BASE = 'https://stocks.clawmo.tech/data';
  const px = (v) => (v == null ? '—' : '$' + Number(v).toFixed(2));

  /* Horizontal SVG bar chart of marketplace floor per SKU. */
  function barChartSVG(skus) {
    const items = (skus || []).filter((s) => s.floor != null);
    if (!items.length) return '<div class="small">No priced SKUs.</div>';
    const maxV = Math.max.apply(null, items.map((s) => s.floor));
    const rowH = 26, padL = 96, padR = 56, w = 580, barMax = w - padL - padR;
    const h = items.length * rowH + 8;
    let svg = `<svg viewBox="0 0 ${w} ${h}" width="100%" preserveAspectRatio="xMidYMid meet">`;
    items.forEach((s, i) => {
      const y = i * rowH + 6;
      const bw = Math.max(2, (s.floor / maxV) * barMax);
      svg += `<text x="${padL - 6}" y="${y + 13}" text-anchor="end" font-size="11" fill="#9aa4b2">${s.label}</text>`;
      svg += `<rect x="${padL}" y="${y + 3}" width="${bw.toFixed(1)}" height="14" rx="2" fill="#4ade80" opacity="0.5"/>`;
      svg += `<text x="${(padL + bw + 5).toFixed(1)}" y="${y + 13}" font-size="11" fill="#e6edf3" font-weight="700">$${s.floor.toFixed(2)}</text>`;
    });
    return svg + '</svg>';
  }

  async function renderGpu(body) {
    body.innerHTML = '<div class="mod-loading">Loading GPU pricing…</div>';
    try {
      const d = await fetchJSON(`${BASE}/gpu-pricing.json`);
      let hist = { series: [] };
      try { hist = await fetchJSON(`${BASE}/gpu-pricing-history.json`); } catch (e) { /* optional */ }
      const h = d.headline || {}, v = h.vast || {}, rp = h.runpod || {};

      const disc = `<div class="mod-panel" style="padding:7px 12px;border-left:3px solid #E5B94C">
        <div class="small" style="line-height:1.5"><span class="num-warn" style="font-weight:700">⚠ Reference rates, not a market-wide index.</span> ${d.disclaimer || ''}</div></div>`;

      const card = (name, val, meta) => `<div class="acct-card"><div class="acct-name">${name}</div>
        <div class="acct-val"><span class="mono">${val}</span></div>
        <div class="acct-meta"><span class="small">${meta}</span></div></div>`;
      const kpis = `<div class="acct-strip" style="grid-template-columns:repeat(4,1fr)">
        ${card('H100 SXM · FLOOR', px(h.floor), (v.offers ? v.offers + ' Vast offers' : 'RunPod only'))}
        ${card('RUNPOD SECURE', px(rp.secure), 'managed cloud')}
        ${card('RUNPOD COMMUNITY', px(rp.community), 'marketplace')}
        ${card('VAST MEDIAN', px(v.median), 'marketplace median')}
      </div>`;

      const bars = `<div class="mod-panel"><div class="mod-panel-title">Marketplace floor by GPU ($/GPU-hr)</div>
        <div class="mod-panel-sub small">Lowest available rate across sources. Lower = looser compute supply.</div>
        ${barChartSVG(d.skus)}</div>`;

      const rows = (d.skus || []).map((s) => {
        const r = s.runpod || {}, vv = s.vast || {};
        return `<tr><td class="mono" style="font-weight:700">${s.label}</td>
          <td class="mono small">${s.vram_gb ? s.vram_gb + 'G' : '—'}</td>
          <td class="mono num">${px(r.secure)}</td><td class="mono num">${px(r.community)}</td>
          <td class="mono num">${px(vv.min)}</td><td class="mono num">${px(vv.median)}</td>
          <td class="mono num small">${vv.offers || '—'}</td>
          <td class="mono num num-up" style="font-weight:700">${px(s.floor)}</td></tr>`;
      }).join('');
      const table = `<div class="mod-panel"><div class="mod-panel-title">All SKUs</div>
        <div class="tbl-wrap"><table class="tbl-dense" style="width:100%">
        <thead><tr><th>GPU</th><th class="num">VRAM</th><th class="num">RP Secure</th><th class="num">RP Comm</th>
        <th class="num">Vast Min</th><th class="num">Vast Med</th><th class="num">Off</th><th class="num">Floor</th></tr></thead>
        <tbody>${rows}</tbody></table></div></div>`;

      const days = (hist.series || []).length;
      const note = `<div class="mod-panel-sub small" style="margin-top:8px;line-height:1.5">
        History: ${days} day${days === 1 ? '' : 's'} (accrues daily). ${d.methodology || ''}<br>
        Sources: RunPod GraphQL + Vast.ai marketplace. SemiAnalysis's 63-provider aggregate is paywalled with no API. Snapshot ${d.generated_at || ''}.</div>`;

      body.innerHTML = disc + kpis + bars + table + note;
    } catch (e) {
      body.innerHTML = `<div class="mod-err">GPU module error: ${(e && e.message) || e}</div>`;
    }
  }

  window.OC_MODULES = window.OC_MODULES || {};
  window.OC_MODULES['gpu'] = { render: renderGpu };
})();
