/* POL — Polymarket prediction market terminal module
   Data: stocks.clawmo.tech/data/polymarket-snapshot.json + polymarket-signals.json
   Tabs: Top Moves · Macro · Crypto · Watchlist
   Cadence: fetcher runs every 15 min mkt hours (:10 :25 :40 :55), hourly off-hours.
*/
(function () {
  'use strict';
  const { fetchJSON, fmt } = window.OC_DATA;

  const SNAPSHOT_URL   = 'https://stocks.clawmo.tech/data/polymarket-snapshot.json';
  const SIGNALS_URL    = 'https://stocks.clawmo.tech/data/polymarket-signals.json';
  const DIVERGENCE_URL = 'https://stocks.clawmo.tech/data/polymarket-divergence.json';

  // tabId cached on window so re-renders during same session preserve the tab.
  function _polTabGet() { return window._polTab || 'movers'; }
  function _polTabSet(t) { window._polTab = t; }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function pctCls(v) {
    if (v == null) return '';
    if (v > 5)  return 'num-up';
    if (v > 0)  return 'num-up-soft';
    if (v < -5) return 'num-dn';
    if (v < 0)  return 'num-dn-soft';
    return '';
  }
  function pctStr(v, d) {
    if (v == null) return '—';
    d = d == null ? 1 : d;
    return (v >= 0 ? '+' : '') + Number(v).toFixed(d) + 'pp';
  }
  function yesPctStr(v) {
    if (v == null) return '—';
    return Number(v).toFixed(1) + '%';
  }

  /* Market-probability "thermometer" — renders the yes% as a horizontal bar.
     Useful for scanning: 95% looks obviously full-green, 50% split, 5% empty. */
  function probBar(pct) {
    if (pct == null) return '<div class="pol-probbar"></div>';
    const p = Math.max(0, Math.min(100, Number(pct)));
    const color = p >= 66 ? 'rgba(74,222,128,0.70)'
                : p >= 33 ? 'rgba(229,185,76,0.70)'
                          : 'rgba(248,113,113,0.70)';
    return `<div class="pol-probbar"><div class="pol-probbar-fill" style="width:${p.toFixed(1)}%;background:${color}"></div></div>`;
  }

  /* "Hot" = high-information signal: big 1d move on a liquid market (and not at extremes,
     where price is just settling). These get a 🔥 badge + glow so newbies know what to look at. */
  function isHotRow(m, sig) {
    const chg1d = Math.abs(m.change_1d_pp || 0);
    const chg4h = Math.abs((sig && sig.velocity && sig.velocity['4h']) || 0);
    const liquid = (m.volume_24h || 0) >= 100000;
    const moving = chg1d >= 5 || chg4h >= 3;
    const inMidRange = m.yes_pct != null && m.yes_pct > 5 && m.yes_pct < 95;
    return liquid && moving && inMidRange;
  }

  function marketRow(m, signals) {
    const sig = signals[m.id] || {};
    const spark = (window.OC_CHART && sig.sparkline && sig.sparkline.length >= 2)
      ? window.OC_CHART.sparkline(sig.sparkline, { w: 90, h: 22 })
      : '<span class="pol-spark-empty" title="Sparkline needs ≥ 2 of our snapshots — wait 15-30 min for fetcher">…</span>';
    // prefer our intraday 4h over API's 1h for short-window motion
    const chg4h = sig.velocity && sig.velocity['4h'];
    const chg1d = m.change_1d_pp;
    const chg1w = m.change_1w_pp;
    const vol24 = m.volume_24h;
    const pin = m.pinned ? ' <span class="pol-pin" title="Pinned by user">📌</span>' : '';
    const hot = isHotRow(m, sig) ? ' <span class="pol-hot" title="HIGH-INFO ROW: liquid (≥$100K v24h) + moving (≥5pp/24h) + not at extremes. News is hitting this market.">🔥</span>' : '';
    const rowCls = isHotRow(m, sig) ? 'pol-row pol-row-hot' : 'pol-row';
    const ctx = m.context ? `<div class="pol-ctx" title="${esc(m.context)}">${esc(m.context.slice(0, 160))}${m.context.length > 160 ? '…' : ''}</div>` : '';
    return `
      <div class="${rowCls}">
        <div class="pol-row-top">
          <a class="pol-q" href="${esc(m.url)}" target="_blank" rel="noopener">${esc(m.question)}${pin}${hot}</a>
          <span class="pol-v24 mono" title="24h trading volume on Polymarket (USD). >$100K = liquid, real money. <$10K = thin, prices noisy.">$${fmt.compact(vol24)}</span>
        </div>
        <div class="pol-row-mid">
          <span class="pol-yes mono" title="Current 'Yes' price = market's implied probability. 60% means the crowd thinks 60% chance the answer resolves Yes.">${yesPctStr(m.yes_pct)}</span>
          ${probBar(m.yes_pct)}
          <span class="pol-chg mono ${pctCls(chg4h)}" title="Change in Yes price over last 4 hours (from our own 15-min snapshots). Units are percentage points (pp), not %. +5pp means probability moved from e.g. 40% → 45%.">4h ${pctStr(chg4h)}</span>
          <span class="pol-chg mono ${pctCls(chg1d)}" title="Change in Yes price over last 24 hours (from Polymarket API). >5pp move on a liquid market = real news entered.">1d ${pctStr(chg1d)}</span>
          <span class="pol-chg mono ${pctCls(chg1w)}" title="Change in Yes price over last 7 days (from Polymarket API). Trend, not noise.">1w ${pctStr(chg1w)}</span>
          <span class="pol-spark" title="7-day price line — built from our own 15-min snapshots (downsampled). Shape shows trend, not just last-day noise. Markets younger than 7d show only what we have.">${spark}</span>
        </div>
        ${ctx}
      </div>
    `;
  }

  /* Render the dynamic "your holdings" line for a bucket. Pulls from snapshot.buckets[].your_holdings
     which the fetcher computes by intersecting bucket.portfolio_tickers with current portfolio.json
     holdings — so this auto-updates whenever you add/remove positions. Categorization rules live in
     polymarket_watchlist.json (per-bucket portfolio_tickers array). */
  function holdingsLine(b) {
    const held = b.your_holdings || [];
    if (!held.length) {
      return `<span class="pol-holdings-empty" title="None of your current portfolio.json holdings fall in this bucket's portfolio_tickers list. Edit polymarket_watchlist.json to add/remove tickers.">your holdings: none in this bucket</span>`;
    }
    const chips = held.map(t =>
      `<span class="pol-holdings-chip" title="From your portfolio">${esc(t)}</span>`
    ).join('');
    return `<span class="pol-holdings-label" title="Live intersection of your portfolio.json holdings with this bucket's portfolio_tickers list. Updates automatically when portfolio changes.">your holdings:</span> ${chips}`;
  }

  function bucketPanel(b, signals) {
    const rows = b.markets.length
      ? b.markets.map(m => marketRow(m, signals)).join('')
      : '<div class="pol-empty">no markets match this bucket right now</div>';
    const blurb = b.category_blurb || b.description || '';
    return `
      <div class="mod-panel pol-bucket">
        <div class="mod-panel-title">${esc(b.label.toUpperCase())} · ${b.markets.length} markets</div>
        ${blurb ? `<div class="pol-bucket-desc">${esc(blurb)}</div>` : ''}
        <div class="pol-bucket-holdings">${holdingsLine(b)}</div>
        <div class="pol-rows">${rows}</div>
      </div>
    `;
  }

  function renderMovers(snapshot, signals) {
    const movers = snapshot.top_movers || [];
    if (!movers.length) return '<div class="pol-empty">no top movers right now</div>';
    // Reshape movers through marketRow — they have the same schema as bucket markets
    const rows = movers.map(m => marketRow(m, signals)).join('');
    return `
      <div class="mod-panel pol-bucket">
        <div class="mod-panel-title">TOP MOVERS · BIGGEST 24H PRICE MOVE · EXCLUDES SPORTS · ≥ $5K VOL</div>
        <div class="pol-bucket-desc">largest absolute <code>1d</code> price change among non-sports markets with meaningful volume. Velocity = news reaching markets.</div>
        <div class="pol-rows">${rows}</div>
      </div>
    `;
  }

  function renderBuckets(snapshot, signals, ids) {
    const selected = (snapshot.buckets || []).filter(b => ids.includes(b.id));
    if (!selected.length) return '<div class="pol-empty">no data</div>';
    return selected.map(b => bucketPanel(b, signals)).join('');
  }

  function tabs(cur, divergenceAlertCount) {
    const T = [
      ['movers',     'Top Moves'],
      ['macro',      'Macro'],
      ['crypto',     'Crypto'],
      ['watchlist',  'Watchlist'],
      ['divergence', 'Divergence'],
    ];
    return T.map(([id, label]) => {
      const badge = (id === 'divergence' && divergenceAlertCount > 0)
        ? `<span class="pol-tab-badge">${divergenceAlertCount}</span>`
        : '';
      return `<button class="pol-tab${id === cur ? ' active' : ''}" data-tab="${id}">${esc(label)}${badge}</button>`;
    }).join('');
  }

  /* Divergence table — each row is one Polymarket↔Kalshi pair. Spread = poly - kalshi.
     Positive spread (yellow): Polymarket more bullish on Yes. Negative (red): Kalshi more bullish.
     Rows above their alert threshold get a glowing left border. */
  function renderDivergence(div) {
    if (!div || !div.pairs || !div.pairs.length) {
      return '<div class="pol-empty">no divergence pairs configured</div>';
    }
    const threshold = div.default_alert_threshold_pp || 5;
    const rowsHtml = div.pairs.map(r => {
      const p = r.polymarket, k = r.kalshi, sp = r.spread_pp;
      const t = r.alert_threshold_pp || threshold;
      if (r.warning) {
        return `
          <tr class="pol-div-row pol-div-warn">
            <td>${esc(r.label)}</td>
            <td colspan="6" class="pol-div-warn-cell">${esc(r.warning)}</td>
          </tr>`;
      }
      const spCls = sp == null ? '' : (Math.abs(sp) >= t ? 'pol-div-alert' : '');
      const spSign = sp == null ? '' : (sp > 0 ? '↑' : '↓');
      const spClr = sp == null ? '' : (sp > 0 ? 'num-up' : 'num-dn');
      return `
        <tr class="pol-div-row ${spCls}">
          <td class="pol-div-label">${esc(r.label)}</td>
          <td class="mono num">${p.yes_pct.toFixed(1)}%</td>
          <td class="mono num pol-div-vol">$${fmt.compact(p.volume_24h)}</td>
          <td class="mono num">${k.yes_pct.toFixed(1)}%</td>
          <td class="mono num pol-div-vol">$${fmt.compact(k.volume_24h)}</td>
          <td class="mono num ${spClr}"><strong>${spSign} ${Math.abs(sp).toFixed(1)}pp</strong></td>
          <td class="pol-div-links">
            <a href="${esc(p.url)}" target="_blank" rel="noopener" title="Polymarket">P↗</a>
            <a href="${esc(k.url)}" target="_blank" rel="noopener" title="Kalshi">K↗</a>
          </td>
        </tr>`;
    }).join('');

    const computed = div.pairs.filter(r => r.spread_pp != null).length;
    const alerts = div.pairs.filter(r => r.spread_pp != null && Math.abs(r.spread_pp) >= (r.alert_threshold_pp || threshold)).length;
    return `
      <div class="mod-panel pol-div-warn-banner">
        <div class="pol-div-warn-title">⚠️ THIS IS A SENTIMENT SIGNAL — NOT AN ARBITRAGE OPPORTUNITY</div>
        <div class="pol-div-warn-body">
          When you see a 5pp+ spread it is tempting to think "buy on the cheap venue, sell on the expensive venue, lock in free money."
          <b>It almost never works in practice.</b> Here's why:
          <ul class="pol-div-warn-ul">
            <li><b>Geographic gates</b> — Polymarket is restricted in the US (VPN/crypto only); Kalshi is US-only. Cross-venue access is hard from Canada.</li>
            <li><b>No margin</b> — both venues require posting full notional. To "arb" $100 you need $100 on each side, locked until resolution.</li>
            <li><b>Different rails</b> — Polymarket settles in USDC on Polygon (crypto on/off-ramp fees); Kalshi settles in USD via bank wire. Round-trip costs eat thin spreads.</li>
            <li><b>Different resolvers</b> — Polymarket uses UMA optimistic oracle, Kalshi uses CFTC-blessed sources. Edge cases occasionally resolve differently → you're not hedged, you're holding two opposing positions at full risk.</li>
            <li><b>Bid/ask reality</b> — prices shown are last-trade or midpoint. Crossing the spread eats 2-5pp on each side. Wide spreads on liquid markets usually mean <i>one venue is right and the other is stale</i>, not free money.</li>
          </ul>
          <div class="pol-div-warn-do">
            <b>What divergence is actually for:</b>
            ① Persistent &gt;5pp spread on a <b>liquid pair</b> = one venue's crowd has news the other doesn't. <b>Check your news feeds.</b>
            ② Polymarket usually leads on <b>geopolitical + crypto</b> (faster, more retail, global).
            ③ Kalshi usually leads on <b>Fed + macro + CPI</b> (more pro / institutional).
            ④ Use as a signal for your <b>real portfolio</b> (BTC, ETH, equities) — not for trading the prediction markets themselves.
          </div>
        </div>
      </div>

      <div class="mod-panel pol-bucket">
        <div class="mod-panel-title">DIVERGENCE TABLE · POLYMARKET vs KALSHI · THRESHOLD ${threshold}PP · ${computed} pairs · ${alerts} alerting</div>
        <div class="pol-bucket-desc">Spread = polymarket_yes − kalshi_yes. <span class="num-up">Positive (yellow)</span> = Polymarket more bullish. <span class="num-dn">Negative (blue)</span> = Kalshi more bullish. Rows ≥ threshold get a red glow + Telegram alert (dedupe ${div.re_alert_delta_pp}pp shift).</div>
        <div class="pol-div-table-wrap">
        <table class="pol-div-table">
          <thead>
            <tr>
              <th>Question</th>
              <th class="num" title="Polymarket implied probability of Yes">Poly Yes</th>
              <th class="num pol-div-vol-th" title="24h trading volume on Polymarket (USD)">Poly v24</th>
              <th class="num" title="Kalshi implied probability of Yes">Kalshi Yes</th>
              <th class="num pol-div-vol-th" title="24h trading volume on Kalshi (USD)">Kalshi v24</th>
              <th class="num" title="Polymarket Yes minus Kalshi Yes, in percentage points">Δ Spread</th>
              <th class="pol-div-links-th"></th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        </div>
      </div>
    `;
  }

  /* Collapsible "How to read this dashboard" — open by default for first-time visitors,
     persists collapse choice in localStorage so it stays out of the way after first read. */
  function howToReadPanel() {
    const key = 'pol_howto_collapsed_v1';
    let collapsed = false;
    try { collapsed = localStorage.getItem(key) === '1'; } catch (e) {}
    return `
      <div class="mod-panel pol-howto" data-howto>
        <div class="mod-panel-title pol-howto-head" data-howto-toggle style="cursor:pointer;user-select:none">
          <span class="pol-howto-caret">${collapsed ? '▸' : '▾'}</span>
          HOW TO READ THIS DASHBOARD ${collapsed ? '' : '<span class="pol-howto-hint">click to collapse</span>'}
        </div>
        <div class="pol-howto-body" style="${collapsed ? 'display:none' : ''}">
          <div class="pol-howto-grid">
            <div class="pol-howto-block">
              <div class="pol-howto-h">📊 What each row means</div>
              <ul class="pol-howto-ul">
                <li><b class="pol-howto-em">60.5%</b> — the "Yes" price = crowd-implied probability. 60% means market thinks 60% chance the answer resolves Yes.</li>
                <li><b class="pol-howto-em">$72.8K</b> — 24h trading volume in USD. <span class="num-up">&gt;$100K = liquid + real money</span>. <span class="num-dn">&lt;$10K = thin, ignore</span>.</li>
                <li><b class="pol-howto-em">1d +40.5pp</b> — price moved <i>+40.5 percentage points</i> in 24h (e.g. 20% → 60.5%). <b>pp ≠ %</b>: pp is additive, % is multiplicative. Always pp here.</li>
                <li><b class="pol-howto-em">4h —</b> — dash means we don't have that much history yet. Sparklines + 4h velocity fill in over time as our 15-min fetcher accumulates snapshots.</li>
                <li><b class="pol-howto-em">sparkline (squiggle)</b> — 7-day price trajectory (downsampled). Shape matters: rising = trending up, V-shape = bottom + reversal, flat = no conviction. Markets younger than 7d show only what we have.</li>
                <li><b class="pol-howto-em">🔥</b> — liquid market (≥$100K v24h) + big move (≥5pp/24h) + price not at extremes. <b>This is what to look at.</b> News is hitting the market.</li>
              </ul>
            </div>
            <div class="pol-howto-block">
              <div class="pol-howto-h">🎯 What to watch (newbie checklist)</div>
              <ul class="pol-howto-ul">
                <li>🔥 <b>Hot rows first.</b> Big moves on liquid markets = real information event.</li>
                <li><b>Persistent &gt;5pp Poly↔Kalshi divergence</b> on a liquid pair = one venue's crowd has info the other doesn't. Check news.</li>
                <li><b>Geopolitical + policy + Fed</b> markets matter more for portfolios than short-dated price predictions.</li>
                <li><b>Skip markets resolving in &lt;1 day</b> — they're price-discovery on the underlying, not future sentiment.</li>
                <li><b>Skip sports.</b> Already filtered from Top Movers, but they pollute Watchlist if you scroll.</li>
              </ul>
            </div>
            <div class="pol-howto-block pol-howto-warn">
              <div class="pol-howto-h">⚠️ What this is <i>not</i></div>
              <ul class="pol-howto-ul">
                <li><b>Not a trade signal in isolation.</b> Use these as a leading sentiment compass for your real portfolio (BTC, ETH, equities) — not as entries.</li>
                <li><b>Not arbitrage-able for retail.</b> See the Divergence tab banner for why cross-venue arb doesn't work in practice.</li>
                <li><b>Not investment advice.</b> Markets are wrong all the time. Probability ≠ prediction.</li>
              </ul>
            </div>
            <div class="pol-howto-block">
              <div class="pol-howto-h">⏱️ Refresh cadence</div>
              <ul class="pol-howto-ul">
                <li>Polymarket snapshot: <b>every 15 min</b> during US mkt hours, hourly off-hours.</li>
                <li>Kalshi divergence: <b>every 30 min</b> during mkt hours. Telegram alert to InvestmentClawmo when |Δ| ≥ 5pp.</li>
                <li>Pair discovery: <b>weekly Sunday 08:05 ET</b>. Adds new BTC daily strikes as dates roll.</li>
                <li>Need it fresher? Snapshots stale &gt;30 min mean a cron failed — check <code>~/.openclaw/logs/polymarket.log</code>.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function heroStrip(snapshot, signals) {
    const nBuckets = (snapshot.buckets || []).length;
    const nMarkets = (snapshot.buckets || []).reduce((a, b) => a + b.markets.length, 0);
    const nMovers  = (snapshot.top_movers || []).length;
    const nHist = Object.values(signals).filter(s => s.sparkline && s.sparkline.length >= 2).length;
    const sparkTotal = Object.keys(signals).length;
    const nHeld = (snapshot.buckets || []).reduce((a, b) => a + (b.your_holdings || []).length, 0);
    const portChip = snapshot.portfolio_last_updated
      ? `<span class="pol-chip pol-chip-port" title="Live: each bucket shows your current portfolio.json holdings that fall in that category. Auto-updates when portfolio changes.">
           <span class="pol-chip-lbl">your holdings</span>${nHeld} matches · port ${snapshot.portfolio_last_updated}
         </span>`
      : '';
    return `
      <div class="pol-hero">
        <div class="pol-hero-accent"></div>
        <div class="pol-hero-body">
          <div class="pol-hero-title">PREDICTION MARKETS — POLYMARKET</div>
          <div class="pol-hero-chips">
            <span class="pol-chip"><span class="pol-chip-lbl">scanned</span>${fmt.compact(snapshot.total_markets_scanned)}</span>
            <span class="pol-chip"><span class="pol-chip-lbl">tracked</span>${nMarkets} in ${nBuckets} buckets</span>
            <span class="pol-chip"><span class="pol-chip-lbl">movers</span>${nMovers}</span>
            <span class="pol-chip"><span class="pol-chip-lbl">sparkline ready</span>${nHist} / ${sparkTotal}</span>
            ${portChip}
          </div>
          <div class="pol-hero-note">Non-investment advice. Prediction markets reflect crowd wisdom + speculation — useful as leading sentiment for news/policy/crypto events, not as trade entries in isolation. Next Fed decision, geopolitical flashpoints, and BTC price targets are the most portfolio-relevant here. <a href="?module=sentiment" style="color:#60a5fa;text-decoration:none">SEN ↗</a> shows curated daily Kalshi+Polymarket pairs alongside Fear &amp; Greed.</div>
        </div>
      </div>`;
  }

  async function render(body, ctx) {
    body.innerHTML = `<div class="mod-loading">Loading Polymarket…</div>`;
    let snapshot, signals, divergence;
    try {
      [snapshot, signals, divergence] = await Promise.all([
        fetchJSON(SNAPSHOT_URL),
        fetchJSON(SIGNALS_URL).catch(() => ({ markets: {} })),     // signals optional on day-1
        fetchJSON(DIVERGENCE_URL).catch(() => ({ pairs: [] })),    // divergence optional
      ]);
    } catch (e) {
      body.innerHTML = `<div class="mod-err">${e.message}</div>`;
      return;
    }
    const sigMap = (signals && signals.markets) || {};
    const divThreshold = (divergence && divergence.default_alert_threshold_pp) || 5;
    const divAlerts = (divergence.pairs || []).filter(
      r => r.spread_pp != null && Math.abs(r.spread_pp) >= (r.alert_threshold_pp || divThreshold)
    ).length;

    function paint() {
      const tab = _polTabGet();
      let tabBody = '';
      if (tab === 'movers') {
        tabBody = renderMovers(snapshot, sigMap);
      } else if (tab === 'macro') {
        tabBody = renderBuckets(snapshot, sigMap, ['macro', 'market']);
      } else if (tab === 'crypto') {
        tabBody = renderBuckets(snapshot, sigMap, ['crypto']);
      } else if (tab === 'watchlist') {
        tabBody = renderBuckets(snapshot, sigMap, ['macro', 'political', 'crypto', 'geopolitical', 'market']);
      } else if (tab === 'divergence') {
        tabBody = renderDivergence(divergence);
      }

      body.innerHTML = `
        <style>
          [data-mod-panel="pol"] .pol-hero {
            display:flex; align-items:stretch; margin-bottom:8px;
            background:var(--bg-card); border:1px solid var(--border);
            border-radius:3px; overflow:hidden;
          }
          [data-mod-panel="pol"] .pol-hero-accent {
            width:4px; background:linear-gradient(180deg,#FF6B35 0%,#E6B84A 100%);
          }
          [data-mod-panel="pol"] .pol-hero-body { padding:8px 10px; flex:1; }
          [data-mod-panel="pol"] .pol-hero-title {
            font-family:var(--font-mono); font-weight:700; font-size:11px;
            letter-spacing:0.8px; color:var(--fg); text-transform:uppercase;
          }
          [data-mod-panel="pol"] .pol-hero-chips {
            display:flex; gap:6px; margin-top:4px; flex-wrap:wrap;
          }
          [data-mod-panel="pol"] .pol-chip {
            font-family:var(--font-mono); font-size:10px;
            padding:2px 6px; border:1px solid var(--border); border-radius:2px;
            background:rgba(255,255,255,0.03); color:var(--fg);
          }
          [data-mod-panel="pol"] .pol-chip-lbl {
            color:var(--fg-dim); font-size:9px; text-transform:uppercase;
            letter-spacing:0.5px; margin-right:5px;
          }
          [data-mod-panel="pol"] .pol-chip-port {
            border-color:rgba(74,222,128,0.4);
            background:rgba(74,222,128,0.06);
          }
          [data-mod-panel="pol"] .pol-chip-port .pol-chip-lbl {
            color:rgba(74,222,128,0.85);
          }
          [data-mod-panel="pol"] .pol-hero-note {
            font-size:9px; color:var(--fg-faint); margin-top:5px; line-height:1.4;
          }
          [data-mod-panel="pol"] .pol-tabs {
            display:flex; gap:2px; margin-bottom:8px;
            border-bottom:1px solid var(--border);
          }
          [data-mod-panel="pol"] .pol-tab {
            background:transparent; border:none; color:var(--fg-dim);
            padding:6px 12px; font-family:var(--font-mono); font-size:11px;
            font-weight:500; letter-spacing:0.4px; cursor:pointer;
            border-bottom:2px solid transparent; margin-bottom:-1px;
          }
          [data-mod-panel="pol"] .pol-tab:hover { color:var(--fg); }
          [data-mod-panel="pol"] .pol-tab.active {
            color:var(--accent); border-bottom-color:var(--accent);
          }
          [data-mod-panel="pol"] .pol-bucket { margin-bottom:10px; }
          [data-mod-panel="pol"] .pol-bucket-desc {
            font-size:10px; color:var(--fg-dim); margin:-2px 0 6px 0;
            line-height:1.4;
          }
          [data-mod-panel="pol"] .pol-impact { color:var(--accent); }
          [data-mod-panel="pol"] .pol-bucket-holdings {
            font-family:var(--font-mono); font-size:10px;
            margin:0 0 6px 0; padding:4px 8px;
            background:rgba(74,222,128,0.05);
            border-left:2px solid rgba(74,222,128,0.55);
            color:var(--fg-dim);
            display:flex; flex-wrap:wrap; align-items:center; gap:4px;
          }
          [data-mod-panel="pol"] .pol-holdings-label {
            color:rgba(74,222,128,0.9); text-transform:uppercase;
            letter-spacing:0.5px; font-weight:600;
          }
          [data-mod-panel="pol"] .pol-holdings-chip {
            background:rgba(74,222,128,0.12);
            border:1px solid rgba(74,222,128,0.4);
            color:var(--fg);
            padding:0 5px; border-radius:2px;
            font-weight:600; font-size:10px;
          }
          [data-mod-panel="pol"] .pol-holdings-empty {
            color:var(--fg-faint); font-style:italic; font-size:10px;
          }
          [data-mod-panel="pol"] .pol-rows {
            display:flex; flex-direction:column; gap:4px;
          }
          [data-mod-panel="pol"] .pol-row {
            padding:6px 8px; background:var(--bg-card);
            border:1px solid var(--border); border-radius:3px;
            border-left:2px solid rgba(229,185,76,0.35);
          }
          [data-mod-panel="pol"] .pol-row:hover {
            border-left-color:var(--accent);
            background:rgba(229,185,76,0.04);
          }
          [data-mod-panel="pol"] .pol-row-hot {
            border-left:3px solid #FF6B35;
            background:linear-gradient(90deg, rgba(255,107,53,0.07) 0%, transparent 60%);
            box-shadow:0 0 0 1px rgba(255,107,53,0.2);
          }
          [data-mod-panel="pol"] .pol-row-hot:hover {
            border-left-color:#FF8C5C;
            background:linear-gradient(90deg, rgba(255,107,53,0.12) 0%, rgba(229,185,76,0.04) 60%);
          }
          [data-mod-panel="pol"] .pol-hot {
            font-size:11px; margin-left:4px; vertical-align:1px;
            filter:drop-shadow(0 0 3px rgba(255,107,53,0.6));
          }
          [data-mod-panel="pol"] .pol-howto {
            background:rgba(96,165,250,0.04);
            border-color:rgba(96,165,250,0.25);
          }
          [data-mod-panel="pol"] .pol-howto-head {
            color:#60a5fa; display:flex; align-items:center; gap:6px;
          }
          [data-mod-panel="pol"] .pol-howto-caret {
            font-size:10px; color:#60a5fa; min-width:10px;
          }
          [data-mod-panel="pol"] .pol-howto-hint {
            margin-left:auto; font-weight:400; font-size:9px;
            color:var(--fg-faint); text-transform:none; letter-spacing:0;
          }
          [data-mod-panel="pol"] .pol-howto-body {
            margin-top:6px;
          }
          [data-mod-panel="pol"] .pol-howto-grid {
            display:grid; grid-template-columns:1fr 1fr; gap:10px;
          }
          [data-mod-panel="pol"] .pol-howto-block {
            padding:8px 10px; background:var(--bg-card);
            border:1px solid var(--border); border-radius:3px;
          }
          [data-mod-panel="pol"] .pol-howto-warn {
            border-left:2px solid #f87171;
            background:rgba(248,113,113,0.04);
          }
          [data-mod-panel="pol"] .pol-howto-h {
            font-family:var(--font-mono); font-size:10px; font-weight:700;
            color:var(--fg); letter-spacing:0.5px;
            text-transform:uppercase; margin-bottom:6px;
          }
          [data-mod-panel="pol"] .pol-howto-ul {
            margin:0; padding-left:18px; color:var(--fg-dim);
            font-size:11px; line-height:1.55;
          }
          [data-mod-panel="pol"] .pol-howto-ul li { margin-bottom:4px; }
          [data-mod-panel="pol"] .pol-howto-em {
            font-family:var(--font-mono); color:var(--fg);
            background:rgba(229,185,76,0.1); padding:0 4px; border-radius:2px;
          }
          [data-mod-panel="pol"] .pol-howto-ul code {
            font-family:var(--font-mono); font-size:10px;
            background:rgba(255,255,255,0.05); padding:1px 4px; border-radius:2px;
          }
          @media (max-width: 900px) {
            [data-mod-panel="pol"] .pol-howto-grid { grid-template-columns:1fr; }
          }
          [data-mod-panel="pol"] .pol-row-top {
            display:flex; align-items:baseline; gap:8px;
          }
          [data-mod-panel="pol"] .pol-q {
            flex:1; color:var(--fg); text-decoration:none;
            font-size:12px; font-weight:500; line-height:1.35;
          }
          [data-mod-panel="pol"] .pol-q:hover { color:var(--accent); }
          [data-mod-panel="pol"] .pol-v24 {
            color:var(--fg-dim); font-size:10px;
            padding:1px 5px; background:rgba(255,255,255,0.04); border-radius:2px;
          }
          [data-mod-panel="pol"] .pol-row-mid {
            display:flex; align-items:center; gap:8px; margin-top:5px;
            flex-wrap:wrap;
          }
          [data-mod-panel="pol"] .pol-yes {
            font-size:15px; font-weight:700; font-family:var(--font-mono);
            min-width:60px; color:var(--fg);
          }
          [data-mod-panel="pol"] .pol-probbar {
            flex:1; max-width:160px; height:8px;
            background:rgba(255,255,255,0.05); border-radius:2px;
            overflow:hidden; position:relative;
          }
          [data-mod-panel="pol"] .pol-probbar-fill {
            position:absolute; left:0; top:0; bottom:0;
          }
          [data-mod-panel="pol"] .pol-chg {
            font-size:10px; min-width:58px;
          }
          [data-mod-panel="pol"] .pol-spark {
            margin-left:auto; display:inline-flex;
          }
          [data-mod-panel="pol"] .pol-spark-empty {
            color:var(--fg-faint); font-family:var(--font-mono); font-size:11px; padding:0 6px;
          }
          [data-mod-panel="pol"] .pol-ctx {
            font-size:10px; color:var(--fg-dim); margin-top:4px;
            line-height:1.45; padding-left:2px;
            border-left:1px solid rgba(255,255,255,0.08); padding-left:6px;
          }
          [data-mod-panel="pol"] .pol-pin { font-size:10px; }
          [data-mod-panel="pol"] .pol-empty {
            padding:16px; text-align:center; color:var(--fg-faint);
            font-style:italic; font-size:11px;
          }
          [data-mod-panel="pol"] .pol-tab-badge {
            display:inline-block; margin-left:5px;
            padding:1px 5px; font-size:9px; font-weight:700;
            background:rgba(248,113,113,0.85); color:#0d0d0d;
            border-radius:8px; vertical-align:1px;
          }
          [data-mod-panel="pol"] .pol-div-table-wrap {
            overflow-x:auto; -webkit-overflow-scrolling:touch;
          }
          [data-mod-panel="pol"] .pol-div-table {
            border-collapse:collapse; font-family:var(--font-mono); font-size:11px;
          }
          [data-mod-panel="pol"] .pol-div-table th {
            text-align:left; padding:6px 8px; border-bottom:1px solid var(--border);
            font-size:9px; letter-spacing:0.6px; color:var(--fg-dim); text-transform:uppercase;
            font-weight:600; white-space:nowrap;
          }
          [data-mod-panel="pol"] .pol-div-table th.num,
          [data-mod-panel="pol"] .pol-div-table td.num { text-align:right; white-space:nowrap; }
          [data-mod-panel="pol"] .pol-div-row td {
            padding:6px 8px; border-bottom:1px solid rgba(255,255,255,0.05);
          }
          [data-mod-panel="pol"] .pol-div-label {
            white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:240px;
          }
          @media (max-width:600px) {
            [data-mod-panel="pol"] .pol-div-vol,
            [data-mod-panel="pol"] .pol-div-vol-th,
            [data-mod-panel="pol"] .pol-div-links,
            [data-mod-panel="pol"] .pol-div-links-th { display:none; }
            [data-mod-panel="pol"] .pol-div-label { max-width:180px; }
          }
          [data-mod-panel="pol"] .pol-div-row:hover td {
            background:rgba(229,185,76,0.05);
          }
          [data-mod-panel="pol"] .pol-div-row.pol-div-alert td {
            background:rgba(248,113,113,0.08);
            border-left:2px solid rgba(248,113,113,0.7);
          }
          [data-mod-panel="pol"] .pol-div-row.pol-div-alert:first-child td {
            border-top:1px solid rgba(248,113,113,0.4);
          }
          [data-mod-panel="pol"] .pol-div-label {
            color:var(--fg); font-family:var(--font-sans); font-size:11px;
          }
          [data-mod-panel="pol"] .pol-div-vol {
            color:var(--fg-dim); font-size:10px;
          }
          [data-mod-panel="pol"] .pol-div-warn td {
            color:var(--fg-faint); font-style:italic;
          }
          [data-mod-panel="pol"] .pol-div-warn-cell { font-size:10px; }
          [data-mod-panel="pol"] .pol-div-links a {
            color:var(--fg-dim); text-decoration:none; padding:0 4px;
            font-size:10px;
          }
          [data-mod-panel="pol"] .pol-div-links a:hover { color:var(--accent); }
          [data-mod-panel="pol"] .pol-div-warn-banner {
            background:rgba(248,113,113,0.06);
            border:1px solid rgba(248,113,113,0.4);
            border-left:4px solid #f87171;
            padding:10px 14px; margin-bottom:10px;
          }
          [data-mod-panel="pol"] .pol-div-warn-title {
            font-family:var(--font-mono); font-size:11px; font-weight:700;
            color:#f87171; letter-spacing:0.6px; margin-bottom:6px;
          }
          [data-mod-panel="pol"] .pol-div-warn-body {
            font-size:11px; color:var(--fg); line-height:1.55;
          }
          [data-mod-panel="pol"] .pol-div-warn-ul {
            margin:6px 0; padding-left:20px; color:var(--fg-dim);
            font-size:11px; line-height:1.5;
          }
          [data-mod-panel="pol"] .pol-div-warn-ul li { margin-bottom:3px; }
          [data-mod-panel="pol"] .pol-div-warn-do {
            margin-top:6px; padding:6px 10px;
            background:rgba(74,222,128,0.06); border-left:3px solid rgba(74,222,128,0.6);
            color:var(--fg); font-size:11px; line-height:1.6;
          }
          [data-mod-panel="pol"] .pol-div-warn-do b {
            color:rgb(110,235,160);
          }
        </style>

        <div class="mod-head" data-mod-panel="pol">
          <div class="mod-title">${window.OC_TITLE ? window.OC_TITLE('polymarket') : 'POL — Polymarket'} · PREDICTION MARKETS</div>
          <div class="mod-meta">
            <a class="chip ext-link" href="https://polymarket.com" target="_blank">open ↗</a>
            <span class="chip chip-dim">history ${signals.history_snapshots || 0} snaps</span>
            <span class="chip chip-dim">${fmt.ago(snapshot.generated_at)}</span>
          </div>
        </div>

        <div data-mod-panel="pol">
          ${heroStrip(snapshot, sigMap)}
          ${howToReadPanel()}
          <div class="pol-tabs">${tabs(tab, divAlerts)}</div>
          ${tabBody}
        </div>
      `;

      // Wire tab clicks
      body.querySelectorAll('.pol-tab').forEach(btn => {
        btn.addEventListener('click', () => {
          _polTabSet(btn.dataset.tab);
          paint();
        });
      });
      // Wire how-to collapse — persists to localStorage
      const howtoHead = body.querySelector('[data-howto-toggle]');
      if (howtoHead) {
        howtoHead.addEventListener('click', () => {
          const panel = body.querySelector('[data-howto] .pol-howto-body');
          const caret = body.querySelector('[data-howto] .pol-howto-caret');
          const hint = body.querySelector('[data-howto] .pol-howto-hint');
          if (!panel) return;
          const willCollapse = panel.style.display !== 'none';
          panel.style.display = willCollapse ? 'none' : '';
          if (caret) caret.textContent = willCollapse ? '▸' : '▾';
          if (hint) hint.style.display = willCollapse ? 'none' : '';
          try { localStorage.setItem('pol_howto_collapsed_v1', willCollapse ? '1' : '0'); } catch (e) {}
        });
      }
    }

    paint();
  }

  window.OC_MODULES = window.OC_MODULES || {};
  window.OC_MODULES['polymarket'] = { render };
})();
