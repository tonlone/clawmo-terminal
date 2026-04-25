/* terminal.clawmo.tech — Auto-tooltip helper
   Walks rendered DOM and adds `title="<full name> — <definition>"` to every
   abbreviated header/label that matches an entry in window.OC_GLOSSARY.
   Also adds `.oc-tip` for the dotted-underline visual hint (headers/kv only,
   not value-mixed level chips).

   Load order in index.html:
     1. glossary.js  (window.OC_GLOSSARY)
     2. tooltip-auto.js  (self-starting; observes <body>)
     3. module scripts
*/
(function () {
  'use strict';
  if (!window.OC_GLOSSARY) {
    console.warn('[tooltip-auto] OC_GLOSSARY not loaded — skipping');
    return;
  }

  const G = window.OC_GLOSSARY;

  // Elements we've already processed (avoid re-processing on re-renders).
  // Cheap and accurate via a dataset flag — the MutationObserver only sees
  // new nodes anyway, but initial sweep + re-select can visit the same node.
  const APPLIED = 'ocTipApplied';

  function assign(el, key, opts) {
    if (!el || el.dataset[APPLIED] === '1') return;
    const entry = G.get(key);
    if (!entry) { el.dataset[APPLIED] = '1'; return; }
    el.title = G.format(entry);
    if (!opts || opts.underline !== false) el.classList.add('oc-tip');
    el.dataset[APPLIED] = '1';
  }

  // Extract a candidate glossary key from a DOM text node.
  // Strategy:
  //   - Trim.
  //   - If the whole string matches a glossary entry → use it.
  //   - Else: try the first whitespace-separated token.
  //   - Else: try the first token split by " · " (compound chip labels).
  function keyFromText(txt) {
    if (!txt) return null;
    // Strip sort-arrow characters that `tbl-dense` sort headers append to textContent.
    const s = txt.trim().replace(/\s*[▾▴]\s*$/, '');
    if (!s) return null;
    if (G.get(s)) return s;
    const firstSpace = s.split(/\s+/)[0];
    if (G.get(firstSpace)) return firstSpace;
    const firstDot = s.split(/ · /)[0].trim();
    if (firstDot !== s && G.get(firstDot)) return firstDot;
    return null;
  }

  function applyTooltips(root) {
    if (!root || root.nodeType !== 1) return;

    // 1) Explicit override: any element with data-glossary="foo" wins.
    root.querySelectorAll('[data-glossary]').forEach((el) => {
      assign(el, el.dataset.glossary, { underline: el.tagName === 'TH' || el.classList.contains('kv-key') });
    });
    // Also self-check (root itself).
    if (root.hasAttribute && root.hasAttribute('data-glossary')) {
      assign(root, root.getAttribute('data-glossary'));
    }

    // 2) Dense-table headers.
    root.querySelectorAll('.tbl-dense th').forEach((th) => {
      const key = keyFromText(th.textContent);
      if (key) assign(th, key);
      else th.dataset[APPLIED] = '1';
    });

    // 3) KV-grid labels: label/value spans are siblings; labels come at
    //    odd positions (1, 3, 5…). Also support class="kv-grid" variant.
    const kvSelectors = ['.kv', '.kv-grid'];
    kvSelectors.forEach((sel) => {
      root.querySelectorAll(sel).forEach((grid) => {
        const children = grid.children;
        for (let i = 0; i < children.length; i += 2) {
          const labelEl = children[i];
          if (!labelEl) continue;
          const key = keyFromText(labelEl.textContent);
          if (key) assign(labelEl, key);
          else labelEl.dataset[APPLIED] = '1';
        }
      });
    });

    // 4) Signals preview-chart level chips (ENT / STP / TGT / R:R).
    //    Each chip is `<span>ENT <b>$164.33</b></span>` — we want the tooltip
    //    on the whole span, but NO underline (would span the price value).
    root.querySelectorAll('.sig-chart-levels > span').forEach((sp) => {
      if (sp.classList.contains('sig-chart-eq')) return;
      const firstWord = (sp.textContent || '').trim().split(/\s+/)[0];
      const key = G.get(firstWord) ? firstWord : null;
      if (key) assign(sp, key, { underline: false });
      else sp.dataset[APPLIED] = '1';
    });

    // 5) Crosshair tooltip rows (the labels inside .sig-tt-k / .stk-tt-k).
    //    These are inside the dynamic per-hover tooltip — the helper still
    //    tags them, so an accessible screen reader can announce "vs ENT:
    //    vs Entry — distance from the entry trigger price".
    root.querySelectorAll('.sig-tt-k, .stk-tt-k').forEach((el) => {
      const key = keyFromText(el.textContent);
      if (key) assign(el, key, { underline: false });
      else el.dataset[APPLIED] = '1';
    });
  }

  // Initial sweep on DOMContentLoaded (if already past, run now).
  function sweep() { applyTooltips(document.body); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', sweep);
  } else {
    sweep();
  }

  // Re-sweep on any new subtree — modules inject their panels after data fetch.
  const obs = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (!m.addedNodes || !m.addedNodes.length) continue;
      m.addedNodes.forEach((n) => {
        if (n.nodeType === 1) applyTooltips(n);
      });
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });

  // Expose for manual re-run if something ever bypasses the observer.
  window.OC_TIP_SWEEP = sweep;
})();
