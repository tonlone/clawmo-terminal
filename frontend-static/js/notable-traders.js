/* Shared Notable Traders registry.
 *
 * Identifies members of Congress whose trades warrant extra attention — either
 * because they've demonstrated outsized returns (tier 1) or because their
 * committee seats give them non-public information advantages (tier 2).
 *
 * Used by:
 *   · SMY Congress tab (universe-level filter + badge)
 *   · HLD Congress tab (per-ticker filter + badge)
 *
 * Mirrors the list in /opt/stocks-app/frontend-static/smart-money.html so
 * terminal + stocks-app agree on who gets flagged. Keep in sync.
 */
(function (global) {
  'use strict';

  const NOTABLE_TRADERS = {
    'Nancy Pelosi':       { tier: 1, tag: 'TOP TRADER', note: 'Former Speaker · Tech mega-cap trades consistently outperform S&P 500' },
    'Tommy Tuberville':   { tier: 1, tag: 'TOP TRADER', note: 'Armed Services, Banking · DOJ investigated for STOCK Act violations' },
    'Dan Crenshaw':       { tier: 1, tag: 'TOP TRADER', note: 'Energy Committee · Aggressive options, well-timed entries' },
    'Markwayne Mullin':   { tier: 2, tag: 'NOTABLE',    note: 'Armed Services · Active in defense, energy, pharma' },
    'Josh Gottheimer':    { tier: 2, tag: 'NOTABLE',    note: 'Financial Services · One of highest volume traders in Congress' },
    'Ro Khanna':          { tier: 2, tag: 'NOTABLE',    note: 'Armed Services, Oversight · Silicon Valley, tech-heavy portfolio' },
    'Michael McCaul':     { tier: 2, tag: 'NOTABLE',    note: 'Former Foreign Affairs Chair · Defense & tech positions' },
    'Pat Fallon':         { tier: 2, tag: 'NOTABLE',    note: 'Armed Services · Hundreds of trades/year in defense contractors' },
    'Sheldon Whitehouse': { tier: 2, tag: 'NOTABLE',    note: 'Judiciary, Environment · Well-timed trades despite advocating ban' },
    'Mark Green':         { tier: 2, tag: 'NOTABLE',    note: 'Homeland Security Chair · Defense & cybersecurity trades' },
  };

  // Case-insensitive name → { tier, tag, note } lookup. Matches on substring
  // so "Nancy Pelosi (CA-11)" still hits "Nancy Pelosi".
  function getNotable(name) {
    if (!name) return null;
    const low = String(name).toLowerCase();
    for (const key in NOTABLE_TRADERS) {
      if (low.includes(key.toLowerCase())) return NOTABLE_TRADERS[key];
    }
    return null;
  }

  // Render an inline HTML badge for a notable trader; returns '' if not notable.
  function notableBadge(name) {
    const n = getNotable(name);
    if (!n) return '';
    const tier1 = n.tier === 1;
    const bg = tier1 ? 'rgba(251,191,36,0.15)' : 'rgba(96,165,250,0.12)';
    const col = tier1 ? '#fbbf24' : '#60a5fa';
    const bd  = tier1 ? 'rgba(251,191,36,0.3)' : 'rgba(96,165,250,0.25)';
    const note = String(n.note || '').replace(/"/g, '&quot;');
    return ` <span style="background:${bg};color:${col};border:1px solid ${bd};padding:0.08rem 0.35rem;border-radius:3px;font-size:9px;font-weight:700;vertical-align:middle;margin-left:4px" title="${note}">${n.tag}</span>`;
  }

  global.OC_NOTABLE = { getNotable, notableBadge, NOTABLE_TRADERS };
})(window);
