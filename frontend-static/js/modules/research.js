/* Quant Research Radar — native terminal module.
   Text list (no charts). Mirrors stocks.clawmo.tech/research.html; reads the same
   research-radar.json written by compute_research_radar.py. A reading list, NOT a signal. */
(function () {
  'use strict';
  const { fetchJSON } = window.OC_DATA;
  const BASE = 'https://stocks.clawmo.tech/data';

  const FAM_COLOR = {
    'momentum': '#4ade80', 'mean-reversion': '#22d3ee', 'pead': '#fbbf24',
    'options-flow': '#a78bfa', 'factor': '#60a5fa', 'volatility': '#fb923c',
    'portfolio': '#f472b6', 'microstructure': '#f87171', 'other': '#8b949e'
  };
  const FAM_LABEL = {
    'momentum': 'MOMENTUM', 'mean-reversion': 'MEAN-REV', 'pead': 'PEAD',
    'options-flow': 'OPTIONS', 'factor': 'FACTOR', 'volatility': 'VOL',
    'portfolio': 'PORTFOLIO', 'microstructure': 'MICROSTRUCT', 'other': 'OTHER'
  };

  // arXiv titles/authors/blurbs are untrusted external text — escape before template insertion.
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const scoreColor = (n) => (n >= 3 ? '#4ade80' : n === 2 ? '#60a5fa' : n === 1 ? '#8b949e' : '#6e7681');

  async function renderResearch(body) {
    body.innerHTML = '<div class="mod-loading">Loading research radar…</div>';
    try {
      const d = await fetchJSON(`${BASE}/research-radar.json`);
      const fc = d.family_counts || {};
      const topFam = Object.keys(fc).filter((k) => k !== 'other')
        .sort((a, b) => fc[b] - fc[a])[0];
      const actionable = (d.papers || []).filter((p) => p.score >= 3).length;
      const srcLabel = { glm: 'GLM-5.2', keyword: 'KEYWORD', mixed: 'GLM+KW' }[d.tagging_source] || d.tagging_source;

      const disc = `<div class="mod-panel" style="padding:7px 12px;border-left:3px solid #60a5fa">
        <div class="small" style="line-height:1.5"><span style="font-weight:700;color:#60a5fa">📄 Reading list, not a signal.</span> ${esc(d.disclaimer || '')}</div></div>`;

      const card = (name, val, meta) => `<div class="acct-card"><div class="acct-name">${esc(name)}</div>
        <div class="acct-val"><span class="mono">${esc(val)}</span></div>
        <div class="acct-meta"><span class="small">${esc(meta)}</span></div></div>`;
      const kpis = `<div class="acct-strip" style="grid-template-columns:repeat(4,1fr)">
        ${card('PAPERS', d.count || 0, 'recent arXiv q-fin')}
        ${card('ACTIONABLE', actionable, 'relevance score 3')}
        ${card('TOP FAMILY', topFam ? (FAM_LABEL[topFam] || topFam) : '—', topFam ? fc[topFam] + ' papers' : '')}
        ${card('TAGGED BY', srcLabel, 'family + relevance')}
      </div>`;

      const famChip = (f) => {
        const c = FAM_COLOR[f] || '#8b949e';
        return `<span style="display:inline-block;font-size:9px;font-weight:700;letter-spacing:.04em;padding:1px 5px;border-radius:3px;background:${c}22;color:${c};margin-right:5px">${esc(FAM_LABEL[f] || f)}</span>`;
      };

      const rows = (d.papers || []).map((p) => {
        const authors = (p.authors || []).slice(0, 4).join(', ') + ((p.authors || []).length > 4 ? ' et al.' : '');
        const blurb = p.blurb ? `<div class="small" style="color:#8b949e;margin-top:2px">${esc(p.blurb)}</div>` : '';
        return `<div class="mod-panel" style="padding:8px 12px;margin-bottom:6px;display:flex;gap:10px;align-items:flex-start">
          <div class="mono" style="flex:0 0 auto;width:24px;height:24px;border-radius:3px;display:flex;align-items:center;justify-content:center;font-weight:800;background:${scoreColor(p.score || 0)}22;color:${scoreColor(p.score || 0)}">${esc(p.score || 0)}</div>
          <div style="flex:1 1 auto;min-width:0">
            <div style="font-size:13px;font-weight:600;line-height:1.35">${famChip(p.family)}<a href="${esc(p.link)}" target="_blank" rel="noopener" style="color:#e6edf3;text-decoration:none">${esc(p.title)}</a></div>
            <div class="small" style="color:#6e7681;margin:2px 0">${esc(authors)}${p.published ? ' · ' + esc(p.published) : ''}${p.primary_category ? ' · ' + esc(p.primary_category) : ''}</div>
            ${blurb}
            <div class="small" style="margin-top:3px"><a href="${esc(p.link)}" target="_blank" rel="noopener" style="color:#60a5fa;margin-right:12px">abstract ↗</a><a href="${esc(p.pdf)}" target="_blank" rel="noopener" style="color:#60a5fa">PDF ↗</a></div>
          </div></div>`;
      }).join('');

      const note = `<div class="mod-panel-sub small" style="margin-top:8px;line-height:1.5">
        Score: 3=directly actionable · 2=useful · 1=tangential · 0=theory (LLM opinion, not a metric). ${esc(d.methodology || '')}<br>
        Source: arXiv q-fin. Snapshot ${esc(d.generated_at || '')}.</div>`;

      body.innerHTML = disc + kpis + (rows || '<div class="small">No papers.</div>') + note;
    } catch (e) {
      body.innerHTML = `<div class="mod-err">Research radar error: ${esc((e && e.message) || e)}</div>`;
    }
  }

  window.OC_MODULES = window.OC_MODULES || {};
  window.OC_MODULES['research'] = { render: renderResearch };
})();
