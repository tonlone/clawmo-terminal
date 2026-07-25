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
      // 2026-07-18: tagger moved GLM-5.2 → Kimi. Prefer the published `tagging_model` so the
      // badge tracks reality; map is fallback and still accepts legacy 'glm' for a pre-cutover JSON.
      const srcModel = (d.tagging_model || '').toUpperCase();
      const srcLabel = d.tagging_source === 'keyword' ? 'KEYWORD'
        : d.tagging_source === 'mixed' ? ((srcModel || 'LLM') + '+KW')
        : (srcModel || { glm: 'GLM-5.2', llm: 'LLM' }[d.tagging_source] || d.tagging_source);

      const disc = `<div class="mod-panel" style="padding:7px 12px;border-left:3px solid #60a5fa">
        <div class="small" style="line-height:1.5"><span style="font-weight:700;color:#60a5fa">📄 Reading list, not a signal.</span> ${esc(d.disclaimer || '')}</div></div>`;

      // Candidates panel (triage=novel). Handles populated / empty / keyword-fallback states.
      let cand;
      const novel = (d.papers || []).filter((p) => p.triage === 'novel');
      if (d.tagging_source === 'keyword') {
        cand = `<div class="mod-panel" style="padding:8px 12px"><div style="font-weight:700;color:#8b949e">🔬 Candidates worth a look</div>
          <div class="small" style="color:#6e7681;margin-top:3px">Triage unavailable this run (tagging fell back to keywords). Candidates return next successful refresh.</div></div>`;
      } else if (!novel.length) {
        const tc = d.triage_counts || {};
        const untri = tc['untriaged'] || 0;
        const triaged = Object.keys(tc).reduce((a, k) => a + (k === 'untriaged' ? 0 : tc[k]), 0);
        cand = `<div class="mod-panel" style="padding:8px 12px"><div style="font-weight:700;color:#8b949e">🔬 Candidates worth a look · 0</div>
          <div class="small" style="color:#6e7681;margin-top:3px">No papers flagged novel-vs-our-patterns this week — the tagger triaged ${esc(triaged)} as overlapping/known/execution-only/infeasible${untri ? '; ' + esc(untri) + ' not triaged' : ''}. Normal outcome; the funnel is working.</div></div>`;
      } else {
        const items = novel.map((p) => {
          const c = FAM_COLOR[p.family] || '#8b949e';
          const chip = `<span style="display:inline-block;font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;background:${c}22;color:${c};margin-right:5px">${esc(FAM_LABEL[p.family] || p.family)}</span>`;
          return `<div style="padding:5px 0;border-top:1px solid #21262d">${chip}<a href="${esc(p.link)}" target="_blank" rel="noopener" style="color:#e6edf3;font-weight:600;text-decoration:none">${esc(p.title)}</a>${p.triage_note ? `<div class="small" style="color:#8b949e;margin-top:2px">${esc(p.triage_note)}</div>` : ''}</div>`;
        }).join('');
        cand = `<div class="mod-panel" style="padding:8px 12px;border-left:3px solid #4ade80;background:rgba(74,222,128,0.05)">
          <div style="font-weight:800;color:#4ade80">🔬 Candidates worth a look · ${novel.length}</div>
          <div class="small" style="color:#6e7681;margin:3px 0 5px;line-height:1.5">Potentially novel vs our patterns + buildable from our data. First-pass filter, NOT a verdict — each needs a probe + review first.</div>
          ${items}</div>`;
      }

      // "Methodology worth a look" (2026-07-07, §4b item 1) — triage='method': validation-stack
      // upgrade papers, NOT trade ideas. Mirrors web renderMethodPanel. Silent pre-schema-v3
      // (class doesn't exist until the next Sat run) and on keyword-fallback runs.
      let meth = '';
      if (Number(d.schema_version) >= 3 && d.tagging_source !== 'keyword') {
        const method = (d.papers || []).filter((p) => p.triage === 'method');
        if (!method.length) {
          meth = `<div class="mod-panel" style="padding:8px 12px"><div style="font-weight:700;color:#8b949e">🧪 Methodology worth a look · 0</div>
            <div class="small" style="color:#6e7681;margin-top:3px">No papers flagged this week as upgrades to how we validate (overfitting control, bootstrap/CV variants, cost models, regime detection, drawdown estimation). Normal outcome.</div></div>`;
        } else {
          const mItems = method.map((p) => {
            const c = FAM_COLOR[p.family] || '#8b949e';
            const chip = `<span style="display:inline-block;font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;background:${c}22;color:${c};margin-right:5px">${esc(FAM_LABEL[p.family] || p.family)}</span>`;
            return `<div style="padding:5px 0;border-top:1px solid #21262d">${chip}<a href="${esc(p.link)}" target="_blank" rel="noopener" style="color:#e6edf3;font-weight:600;text-decoration:none">${esc(p.title)}</a>${p.triage_note ? `<div class="small" style="color:#8b949e;margin-top:2px">${esc(p.triage_note)}</div>` : ''}</div>`;
          }).join('');
          meth = `<div class="mod-panel" style="padding:8px 12px;border-left:3px solid #a78bfa;background:rgba(167,139,250,0.05)">
            <div style="font-weight:800;color:#a78bfa">🧪 Methodology worth a look · ${method.length}</div>
            <div class="small" style="color:#6e7681;margin:3px 0 5px;line-height:1.5">${esc(d.method_disclaimer || 'Not trade ideas — papers that might upgrade how we VALIDATE. First-pass filter, not a verdict.')}</div>
            ${mItems}</div>`;
        }
      }

      // "Overlaps our live book" (2026-07-07, §4b item 2) — collapsed literature-context list.
      // No schema_version gate (unlike the method panel): 'overlaps' rows exist in v2 JSON
      // already, so the list is correct on day one; notes (which pattern/question) appear
      // from schema v3 on — older rows render title-only.
      let ovl = '';
      if (d.tagging_source !== 'keyword') {
        const ov = (d.papers || []).filter((p) => p.triage === 'overlaps');
        if (ov.length) {
          const oItems = ov.map((p) => {
            const c = FAM_COLOR[p.family] || '#8b949e';
            const chip = `<span style="display:inline-block;font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;background:${c}22;color:${c};margin-right:5px">${esc(FAM_LABEL[p.family] || p.family)}</span>`;
            return `<div style="padding:5px 0;border-top:1px solid #21262d">${chip}<a href="${esc(p.link)}" target="_blank" rel="noopener" style="color:#e6edf3;font-weight:600;text-decoration:none">${esc(p.title)}</a>${p.triage_note ? `<div class="small" style="color:#8b949e;margin-top:2px">touches: ${esc(p.triage_note)}</div>` : ''}</div>`;
          }).join('');
          ovl = `<details class="mod-panel" style="padding:8px 12px;cursor:pointer">
            <summary style="font-weight:700;color:#8b949e">📚 Overlaps our live book · ${ov.length} <span class="small" style="font-weight:400;color:#6e7681">— literature context for patterns/questions we already run (click to expand)</span></summary>
            <div class="small" style="color:#6e7681;margin:3px 0 5px;line-height:1.5">NOT new ideas — each touches a live pattern or an open question already on our list. Useful for keep/tune/drop discussions of the pattern it names.</div>
            ${oItems}</details>`;
        }
      }

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

      body.innerHTML = disc + cand + meth + ovl + kpis + (rows || '<div class="small">No papers.</div>') + note;
    } catch (e) {
      body.innerHTML = `<div class="mod-err">Research radar error: ${esc((e && e.message) || e)}</div>`;
    }
  }

  window.OC_MODULES = window.OC_MODULES || {};
  window.OC_MODULES['research'] = { render: renderResearch };
})();
