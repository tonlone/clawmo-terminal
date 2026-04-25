/* HLD Holdings — institutional ownership + insider trades + Congress trades
   Takes a ticker via params; defaults to AAPL. Mirrors stocks.clawmo.tech's
   Institutional (13F) tab but organized as a proper dense-terminal module.
   Sub-tabs: Summary · Insiders · Congress · 13F.
   Backend: /api/stock/{t}/analysis + /insider-trades + /congress-trades. */
(function () {
  'use strict';
  const { fetchJSON, fmt } = window.OC_DATA;
  const API = 'https://stocks.clawmo.tech/api/stock';

  function analysisUrl(sym, market) { return `${API}/${encodeURIComponent(sym)}/analysis?market=${market || 'US'}`; }
  function insiderUrl(sym)           { return `${API}/${encodeURIComponent(sym)}/insider-trades`; }
  function congressUrl(sym)          { return `${API}/${encodeURIComponent(sym)}/congress-trades`; }
  function holdersUrl(sym, limit)    { return `${API}/${encodeURIComponent(sym)}/holders?limit=${limit || 100}`; }

  function pctCls(v) { if (v == null) return ''; if (v > 0) return 'num-up'; if (v < 0) return 'num-dn'; return ''; }
  function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  function sentimentClass(s) {
    if (s === 'bullish') return 'num-up';
    if (s === 'bearish') return 'num-dn';
    return 'num-warn';
  }
  function txCls(t) {
    if (!t) return '';
    const low = t.toLowerCase();
    if (low.includes('buy') || low.includes('purchase')) return 'num-up';
    if (low.includes('sale') || low.includes('sell'))   return 'num-dn';
    return '';
  }

  /* Midpoint of a Congress-style amount range like "$1,001 - $15,000" */
  function rangeMid(range) {
    if (!range) return null;
    const nums = range.replace(/[$,]/g, '').match(/\d+/g);
    if (!nums || nums.length === 0) return null;
    if (nums.length === 1) return Number(nums[0]);
    const lo = Number(nums[0]), hi = Number(nums[1]);
    return (lo + hi) / 2;
  }

  const TABS = [
    { id: 'summary',  label: 'Summary' },
    { id: 'holders',  label: '13F Holders' },
    { id: 'insiders', label: 'Insider Trades' },
    { id: 'congress', label: 'Congress Trades' },
    { id: '13f',      label: '13F About' },
  ];

  /* ── Tab renderers ───────────────────────────────────────── */
  function renderSummary(d) {
    const inst = d.analysis?.institutional || {};
    const ins  = d.insider || {};
    const cg   = d.congress || {};
    const insSum = ins.summary || {};
    const insTrades = (ins.trades || []).slice(0, 3);
    const cgTrades  = (cg.trades || []).slice(0, 3);
    // Congress quick summary (buy/sell counts + dollar flow via range midpoint)
    let cgBuys = 0, cgSells = 0, cgBuyAmt = 0, cgSellAmt = 0;
    (cg.trades || []).forEach((t) => {
      const mid = rangeMid(t.amount) || 0;
      if ((t.type || '').toLowerCase().includes('purchase')) { cgBuys++; cgBuyAmt += mid; }
      else if ((t.type || '').toLowerCase().includes('sale')) { cgSells++; cgSellAmt += mid; }
    });
    const cgNet = cgBuyAmt - cgSellAmt;

    return `
      <div class="fin-summary-strip">
        <div class="fin-kpi" data-glossary="INSIDER-SENT">
          <div class="fin-kpi-lbl">INSIDER SENTIMENT</div>
          <div class="fin-kpi-val mono ${sentimentClass(insSum.netSentiment)}">${(insSum.netSentiment || '—').toUpperCase()}</div>
          <div class="fin-kpi-sub mono">${insSum.buyCount || 0} buy · ${insSum.sellCount || 0} sell</div>
        </div>
        <div class="fin-kpi">
          <div class="fin-kpi-lbl">INSIDER NET FLOW</div>
          <div class="fin-kpi-val mono ${pctCls((insSum.totalBuyValue || 0) - (insSum.totalSellValue || 0))}">
            ${fmtMoney((insSum.totalBuyValue || 0) - (insSum.totalSellValue || 0))}
          </div>
          <div class="fin-kpi-sub mono">buys ${fmtMoney(insSum.totalBuyValue)} · sells ${fmtMoney(insSum.totalSellValue)}</div>
        </div>
        <div class="fin-kpi">
          <div class="fin-kpi-lbl">CONGRESS ACTIVITY</div>
          <div class="fin-kpi-val mono ${pctCls(cgNet)}">${cgBuys} BUY · ${cgSells} SELL</div>
          <div class="fin-kpi-sub mono">net ~${fmtMoney(cgNet)} (midpoint of disclosed ranges)</div>
        </div>
        <div class="fin-kpi">
          <div class="fin-kpi-lbl">13F REPORT</div>
          <div class="fin-kpi-val mono" style="font-size:12px">${inst.report_label || '—'}</div>
          <div class="fin-kpi-sub mono">cusip ${inst.cusip || '—'}</div>
        </div>
      </div>

      <div class="mod-grid-2">
        <div class="mod-panel">
          <div class="mod-panel-title">RECENT INSIDER · ${insTrades.length ? 'top 3' : 'none'}</div>
          <div class="tbl-wrap">
            <table class="tbl-dense">
              <thead><tr><th>DATE</th><th>NAME</th><th>TX</th><th class="num">SHARES</th><th class="num">VALUE</th></tr></thead>
              <tbody>${insTrades.length ? insTrades.map(insiderRow).join('') : '<tr><td colspan="5" class="empty">no recent insider trades</td></tr>'}</tbody>
            </table>
          </div>
        </div>
        <div class="mod-panel">
          <div class="mod-panel-title">RECENT CONGRESS · ${cgTrades.length ? 'top 3' : 'none'}</div>
          <div class="tbl-wrap">
            <table class="tbl-dense">
              <thead><tr><th>DATE</th><th>NAME</th><th>CHAMBER</th><th>TX</th><th>RANGE</th></tr></thead>
              <tbody>${cgTrades.length ? cgTrades.map(congressRow).join('') : '<tr><td colspan="5" class="empty">no recent congress trades</td></tr>'}</tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="mod-panel">
        <div class="mod-panel-title">13F INSTITUTIONAL HOLDINGS</div>
        <div class="hld-13f-card">
          <div class="hld-13f-body">
            <div class="hld-13f-title mono">${inst.report_label || 'Most recent 13F comparison'}</div>
            <div class="hld-13f-sub">CUSIP ${inst.cusip || '—'} · source ${inst.cusip_source || '—'}</div>
            <div class="hld-13f-note">
              Form 13F filings are due 45 days after quarter-end — data is always 1–2 quarters behind.
              terminal.clawmo.tech doesn't ingest holder-level tables yet; the link below opens 13f.info
              for the full institutional holder breakdown (Vanguard / BlackRock / State Street etc. with
              share counts and quarter-over-quarter change).
            </div>
          </div>
          <div class="hld-13f-action">
            ${inst.report_url
              ? `<a href="${escapeHtml(inst.report_url)}" target="_blank" rel="noopener" class="hld-13f-btn">View on 13f.info ↗</a>`
              : `<span class="hld-13f-btn hld-13f-btn-disabled">No 13F link (non-US or missing CUSIP)</span>`}
          </div>
        </div>
      </div>
    `;
  }

  function renderInsiders(d) {
    const ins = d.insider || {};
    const trades = ins.trades || [];
    const sum = ins.summary || {};
    if (!trades.length) return `<div class="mod-loading">No insider trades available for this ticker</div>`;
    const ratio = (sum.buyCount || 0) + (sum.sellCount || 0) > 0
      ? (sum.buyCount || 0) / ((sum.buyCount || 0) + (sum.sellCount || 0))
      : 0;
    return `
      <div class="fin-summary-strip">
        <div class="fin-kpi">
          <div class="fin-kpi-lbl">NET SENTIMENT</div>
          <div class="fin-kpi-val mono ${sentimentClass(sum.netSentiment)}">${(sum.netSentiment || '—').toUpperCase()}</div>
          <div class="fin-kpi-sub mono">${trades.length} trades</div>
        </div>
        <div class="fin-kpi">
          <div class="fin-kpi-lbl">BUYS</div>
          <div class="fin-kpi-val mono num-up">${sum.buyCount || 0}</div>
          <div class="fin-kpi-sub mono">${fmtMoney(sum.totalBuyValue)} total</div>
        </div>
        <div class="fin-kpi">
          <div class="fin-kpi-lbl">SELLS</div>
          <div class="fin-kpi-val mono num-dn">${sum.sellCount || 0}</div>
          <div class="fin-kpi-sub mono">${fmtMoney(sum.totalSellValue)} total</div>
        </div>
        <div class="fin-kpi">
          <div class="fin-kpi-lbl">BUY / SELL RATIO</div>
          <div class="fin-kpi-val mono ${ratio >= 0.5 ? 'num-up' : 'num-dn'}">${(ratio * 100).toFixed(0)}%</div>
          <div class="fin-kpi-sub mono">${(sum.buyCount || 0)} of ${(sum.buyCount || 0) + (sum.sellCount || 0)} are buys</div>
        </div>
      </div>

      <div class="mod-panel">
        <div class="mod-panel-title">INSIDER TRANSACTIONS · SEC FORM 4 · ${trades.length} trades</div>
        <div class="tbl-wrap">
          <table class="tbl-dense">
            <thead><tr>
              <th>DATE</th><th>NAME</th><th>ROLE</th><th>TX</th>
              <th class="num">SHARES</th><th class="num">@</th><th class="num">VALUE</th>
              <th class="num">TOTAL HELD</th><th>SEC</th>
            </tr></thead>
            <tbody>${trades.map(insiderRowFull).join('')}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderCongress(d) {
    const trades = d.congress?.trades || [];
    if (!trades.length) return `<div class="mod-loading">No Congress trades disclosed for this ticker</div>`;
    const chamberFilter = window._hldChamber || 'all';
    const notableFilter = window._hldCgNotable || 'all';
    const getNotable = window.OC_NOTABLE && window.OC_NOTABLE.getNotable;
    let filtered = chamberFilter === 'all' ? trades : trades.filter((t) => t.chamber === chamberFilter);
    if (notableFilter === 'notable' && getNotable) filtered = filtered.filter((t) => !!getNotable(t.name));
    const buys = trades.filter((t) => (t.type || '').toLowerCase().includes('purchase')).length;
    const sells = trades.filter((t) => (t.type || '').toLowerCase().includes('sale')).length;
    const senate = trades.filter((t) => t.chamber === 'senate').length;
    const house  = trades.filter((t) => t.chamber === 'house').length;
    const notableCount = getNotable ? trades.filter((t) => !!getNotable(t.name)).length : 0;
    return `
      <div class="fin-summary-strip">
        <div class="fin-kpi">
          <div class="fin-kpi-lbl">TOTAL TRADES</div>
          <div class="fin-kpi-val mono">${trades.length}</div>
          <div class="fin-kpi-sub mono">${senate} senate · ${house} house</div>
        </div>
        <div class="fin-kpi">
          <div class="fin-kpi-lbl">PURCHASES</div>
          <div class="fin-kpi-val mono num-up">${buys}</div>
        </div>
        <div class="fin-kpi">
          <div class="fin-kpi-lbl">SALES</div>
          <div class="fin-kpi-val mono num-dn">${sells}</div>
        </div>
        <div class="fin-kpi">
          <div class="fin-kpi-lbl">NOTABLE TRADERS</div>
          <div class="fin-kpi-val mono" style="font-size:14px">${notableCount} of ${trades.length}</div>
          <div class="fin-kpi-sub mono">top-tier + tracked members</div>
        </div>
      </div>

      <div class="mod-panel">
        <div class="mod-panel-title">
          CONGRESS TRADES · ${filtered.length} shown
          <span class="fin-stmt-toggles">
            <button class="hld-cg-btn${chamberFilter === 'all' ? ' active' : ''}"    data-chamber="all">ALL</button>
            <button class="hld-cg-btn${chamberFilter === 'senate' ? ' active' : ''}" data-chamber="senate">SENATE</button>
            <button class="hld-cg-btn${chamberFilter === 'house' ? ' active' : ''}"  data-chamber="house">HOUSE</button>
          </span>
          <span class="fin-stmt-toggles" style="margin-left:8px">
            <button class="hld-cg-btn hld-cg-ntbtn${notableFilter === 'all' ? ' active' : ''}"     data-notable="all">ALL MEMBERS</button>
            <button class="hld-cg-btn hld-cg-ntbtn${notableFilter === 'notable' ? ' active' : ''}" data-notable="notable">★ NOTABLE</button>
          </span>
        </div>
        <div class="tbl-wrap">
          <table class="tbl-dense">
            <thead><tr>
              <th>DATE</th><th>DISCLOSED</th><th>NAME</th><th>CHAMBER</th>
              <th>DIST</th><th>TX</th><th>RANGE</th><th>LINK</th>
            </tr></thead>
            <tbody>${filtered.length ? filtered.map(congressRowFull).join('') : '<tr><td colspan="8" class="empty">no trades for this filter</td></tr>'}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  /* Holder table sort state (persists within a session) */
  function getHoldersSort() {
    return window._hldSort || (window._hldSort = { col: 'cur_shares', dir: 'desc' });
  }

  function sortedHolders(holders) {
    const s = getHoldersSort();
    const out = [...holders];
    out.sort((a, b) => {
      const av = a[s.col], bv = b[s.col];
      const an = (av == null || isNaN(av)) ? -Infinity : Number(av);
      const bn = (bv == null || isNaN(bv)) ? -Infinity : Number(bv);
      if (s.col === 'manager') {
        const cmp = String(av || '').localeCompare(String(bv || ''));
        return s.dir === 'asc' ? cmp : -cmp;
      }
      return s.dir === 'asc' ? an - bn : bn - an;
    });
    return out;
  }

  function renderHolders(d) {
    const h = d.holdersData;
    if (d.holdersError) {
      return `
        <div class="mod-panel">
          <div class="mod-panel-title">13F HOLDERS — error</div>
          <div class="fin-empty-panel">
            <div class="fin-empty-title">${escapeHtml(d.holdersError.title || 'Holders data unavailable')}</div>
            <div class="fin-empty-sub">${escapeHtml(d.holdersError.detail || '')}</div>
            ${d.analysis?.institutional?.report_url
              ? `<div class="fin-empty-sub" style="margin-top:10px"><a href="${escapeHtml(d.analysis.institutional.report_url)}" target="_blank" rel="noopener" class="hld-13f-btn">View on 13f.info ↗</a></div>`
              : ''}
          </div>
        </div>`;
    }
    if (!h) return `<div class="mod-loading">Fetching 13F holders from 13f.info…</div>`;

    const s = h.summary || {};
    const sort = getHoldersSort();
    const rows = sortedHolders(h.holders || []).map((r, i) => {
      const isNew  = r.is_new;
      const isExit = r.is_exit;
      const rowCls = isNew ? 'hld-hldr-new' : isExit ? 'hld-hldr-exit' : '';
      const diffCls = (r.diff || 0) > 0 ? 'num-up' : (r.diff || 0) < 0 ? 'num-dn' : '';
      return `<tr class="${rowCls}">
        <td class="mono hld-rank">${i + 1}</td>
        <td class="hld-manager">${r.manager_url ? `<a href="${escapeHtml(r.manager_url)}" target="_blank" rel="noopener">${escapeHtml(r.manager)}</a>` : escapeHtml(r.manager)}</td>
        <td class="mono">${fmtCount(r.prev_shares)}</td>
        <td class="mono">${fmtCount(r.cur_shares)}</td>
        <td class="mono ${diffCls}">${(r.diff != null && r.diff > 0 ? '+' : '') + fmtCount(r.diff)}</td>
        <td class="mono ${diffCls}">${r.chg_pct != null ? (r.chg_pct >= 0 ? '+' : '') + r.chg_pct.toFixed(1) + '%' : (isNew ? 'NEW' : isExit ? 'EXIT' : '—')}</td>
      </tr>`;
    }).join('');

    function sortArrow(col) {
      if (sort.col !== col) return '<span class="hld-sort-arrow" style="opacity:0.3">▾</span>';
      return `<span class="hld-sort-arrow">${sort.dir === 'desc' ? '▾' : '▴'}</span>`;
    }

    return `
      <div class="fin-summary-strip">
        <div class="fin-kpi">
          <div class="fin-kpi-lbl">TOTAL HOLDERS</div>
          <div class="fin-kpi-val mono">${s.total_holders != null ? s.total_holders.toLocaleString() : '—'}</div>
          <div class="fin-kpi-sub mono">+${s.new_positions || 0} new · -${s.exits || 0} exits</div>
        </div>
        <div class="fin-kpi">
          <div class="fin-kpi-lbl">SHARES HELD</div>
          <div class="fin-kpi-val mono">${fmtCount(s.total_cur_shares)}</div>
          <div class="fin-kpi-sub mono ${pctCls(s.shares_delta)}">Δ ${(s.shares_delta >= 0 ? '+' : '') + fmtCount(s.shares_delta)} QoQ</div>
        </div>
        <div class="fin-kpi">
          <div class="fin-kpi-lbl">ADDS vs TRIMS</div>
          <div class="fin-kpi-val mono">${s.increased || 0}<span class="fin-kpi-slash"> / </span><span class="num-dn">${s.decreased || 0}</span></div>
          <div class="fin-kpi-sub mono">${((s.increased || 0) + (s.new_positions || 0)) > ((s.decreased || 0) + (s.exits || 0)) ? 'NET BUYING' : 'NET SELLING'}</div>
        </div>
        <div class="fin-kpi">
          <div class="fin-kpi-lbl">WINDOW</div>
          <div class="fin-kpi-val mono" style="font-size:12px">${h.prev_label} → ${h.cur_label}</div>
          <div class="fin-kpi-sub mono">CUSIP ${h.cusip}</div>
        </div>
      </div>

      <div class="mod-panel">
        <div class="mod-panel-title">
          TOP ${(h.holders || []).length} HOLDERS · click column to sort · new/exit highlighted
          <a href="${escapeHtml(h.source_url)}" target="_blank" rel="noopener" class="hld-13f-btn hld-13f-btn-sm">View full list on 13f.info ↗</a>
        </div>
        <div class="tbl-wrap">
          <table class="tbl-dense hld-holders-table">
            <thead><tr>
              <th class="hld-sort" data-sort-col="rank">#</th>
              <th class="hld-sort hld-sort-name" data-sort-col="manager">MANAGER ${sortArrow('manager')}</th>
              <th class="hld-sort num" data-sort-col="prev_shares">${h.prev_label} ${sortArrow('prev_shares')}</th>
              <th class="hld-sort num" data-sort-col="cur_shares">${h.cur_label} ${sortArrow('cur_shares')}</th>
              <th class="hld-sort num" data-sort-col="diff">DIFF ${sortArrow('diff')}</th>
              <th class="hld-sort num" data-sort-col="chg_pct">CHG % ${sortArrow('chg_pct')}</th>
            </tr></thead>
            <tbody>${rows || '<tr><td colspan="6" class="empty">no holders</td></tr>'}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function render13F(d) {
    const inst = d.analysis?.institutional || {};
    const info = d.analysis?.info || {};
    return `
      <div class="mod-panel">
        <div class="mod-panel-title">13F INSTITUTIONAL HOLDINGS · QUARTERLY SEC FILINGS</div>
        <div class="hld-13f-card hld-13f-card-full">
          <div class="hld-13f-body">
            <div class="hld-13f-title mono">${info.symbol || '—'} · ${escapeHtml(info.name || '')}</div>
            <div class="hld-13f-sub">CUSIP <b>${inst.cusip || '—'}</b> · source ${inst.cusip_source || '—'}</div>
            <div class="hld-13f-sub">Comparison ${inst.report_label || '—'}</div>
          </div>
          <div class="hld-13f-action">
            ${inst.report_url
              ? `<a href="${escapeHtml(inst.report_url)}" target="_blank" rel="noopener" class="hld-13f-btn hld-13f-btn-lg">View on 13f.info ↗</a>`
              : `<span class="hld-13f-btn hld-13f-btn-disabled">No 13F link (non-US or missing CUSIP)</span>`}
          </div>
        </div>
      </div>

      <div class="mod-panel">
        <div class="mod-panel-title">ABOUT 13F FILINGS</div>
        <div class="hld-13f-about">
          <p><b>What is a 13F?</b> Every institutional investment manager with more than $100M AUM must file Form 13F with the SEC within 45 days of each quarter-end, disclosing their US equity holdings as of the quarter-end date.</p>
          <p><b>Why it matters.</b> 13F lets you see who owns the stock (Vanguard, BlackRock, Berkshire, hedge funds, pension funds), how concentrated ownership is, and who's been accumulating vs trimming quarter-over-quarter. A sudden spike in institutional ownership often precedes earnings beats; coordinated selling can foreshadow weakness.</p>
          <p><b>The 45-day lag.</b> By the time a 13F hits, the filing is reporting positions as of 45+ days ago. Fast-moving funds (Citadel, Renaissance) may have already reversed. Treat 13F as slow-information, better for long-term holders like Berkshire or state pensions than for hedge-fund tactical reads.</p>
          <p><b>What this panel shows.</b> The quarter comparison link above opens 13f.info, which aggregates the full holder list side-by-side (current vs prior quarter) with holder names, share counts, % of each holder's portfolio, and changes. terminal.clawmo.tech doesn't ingest the holder-level tables yet — if you want them in-terminal as a sortable dense table, say the word and we can wire an additional backend endpoint.</p>
        </div>
      </div>
    `;
  }

  /* ── Row renderers ───────────────────────────────────────── */
  function insiderRow(t) {
    return `<tr>
      <td class="mono">${escapeHtml(t.date || '—')}</td>
      <td>${escapeHtml(t.name || '—')}</td>
      <td class="${txCls(t.transaction)}">${escapeHtml((t.transaction || '—').slice(0, 4))}</td>
      <td class="mono">${fmtCount(t.shares)}</td>
      <td class="mono">${fmtMoney(t.value)}</td>
    </tr>`;
  }
  function insiderRowFull(t) {
    return `<tr>
      <td class="mono">${escapeHtml(t.date || '—')}</td>
      <td>${escapeHtml(t.name || '—')}</td>
      <td class="hld-role">${escapeHtml(t.relationship || '—')}</td>
      <td class="${txCls(t.transaction)}">${escapeHtml(t.transaction || '—')}</td>
      <td class="mono">${fmtCount(t.shares)}</td>
      <td class="mono">${t.cost != null ? '$' + Number(t.cost).toFixed(2) : '—'}</td>
      <td class="mono">${fmtMoney(t.value)}</td>
      <td class="mono">${fmtCount(t.sharesTotal)}</td>
      <td>${t.secLink ? `<a href="${escapeHtml(t.secLink)}" target="_blank" rel="noopener" class="hld-sec-link">Form 4 ↗</a>` : '—'}</td>
    </tr>`;
  }
  function congressRow(t) {
    return `<tr>
      <td class="mono">${escapeHtml(t.date || '—')}</td>
      <td>${escapeHtml(t.name || '—')}</td>
      <td class="mono">${escapeHtml((t.chamber || '—').toUpperCase())}</td>
      <td class="${txCls(t.type)}">${escapeHtml((t.type || '—').slice(0, 4))}</td>
      <td class="mono">${escapeHtml(t.amount || '—')}</td>
    </tr>`;
  }
  function congressRowFull(t) {
    const chamCls = t.chamber === 'senate' ? 'hld-chip-senate' : 'hld-chip-house';
    const badge = (window.OC_NOTABLE && window.OC_NOTABLE.notableBadge)
      ? window.OC_NOTABLE.notableBadge(t.name) : '';
    return `<tr>
      <td class="mono">${escapeHtml(t.date || '—')}</td>
      <td class="mono hld-dim">${escapeHtml(t.disclosed || '—')}</td>
      <td>${escapeHtml(t.name || '—')}${badge}</td>
      <td><span class="hld-chip ${chamCls}">${escapeHtml((t.chamber || '—').toUpperCase())}</span></td>
      <td class="mono">${escapeHtml(t.district || '—')}</td>
      <td class="${txCls(t.type)}">${escapeHtml(t.type || '—')}</td>
      <td class="mono">${escapeHtml(t.amount || '—')}</td>
      <td>${t.link ? `<a href="${escapeHtml(t.link)}" target="_blank" rel="noopener" class="hld-sec-link">Filing ↗</a>` : '—'}</td>
    </tr>`;
  }

  function fmtMoney(v) {
    if (v == null || isNaN(v)) return '—';
    const abs = Math.abs(v);
    const sign = v < 0 ? '-$' : '$';
    if (abs >= 1e9) return sign + (abs / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return sign + (abs / 1e6).toFixed(2) + 'M';
    if (abs >= 1e3) return sign + (abs / 1e3).toFixed(1) + 'K';
    return sign + abs.toFixed(0);
  }
  function fmtCount(v) {
    if (v == null || isNaN(v)) return '—';
    const abs = Math.abs(v);
    if (abs >= 1e9) return (v / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return (v / 1e6).toFixed(2) + 'M';
    if (abs >= 1e3) return (v / 1e3).toFixed(1) + 'K';
    return String(v);
  }

  function renderTab(tab, d) {
    switch (tab) {
      case 'summary':  return renderSummary(d);
      case 'holders':  return renderHolders(d);
      case 'insiders': return renderInsiders(d);
      case 'congress': return renderCongress(d);
      case '13f':      return render13F(d);
      default:         return `<div class="mod-loading">Unknown tab: ${tab}</div>`;
    }
  }

  async function loadHolders(body, d, sym) {
    try {
      const h = await fetchJSON(holdersUrl(sym, 100), { ttl: 12 * 3600 * 1000 });
      d.holdersData = h;
      d.holdersError = null;
    } catch (e) {
      const msg = (e && e.message) || String(e);
      d.holdersError = {
        title: 'Could not load 13F holders',
        detail: msg.includes('404') ? 'No CUSIP resolvable — likely a non-US ticker (13F only applies to US-listed equities).'
              : msg.includes('502') ? 'Upstream 13f.info scrape failed. The fallback link below opens the same view.'
              : msg,
      };
    }
    // Only re-render if Holders is still the active tab
    const activeTab = body.querySelector('.fin-subtab-btn[data-hldtab].active')?.dataset.hldtab;
    if (activeTab === 'holders') {
      const bodyEl = body.querySelector('#hldBody');
      if (bodyEl) bodyEl.innerHTML = renderTab('holders', d);
      attachHoldersSort(body, d);
    }
  }

  function attachHoldersSort(body, d) {
    body.querySelectorAll('.hld-sort[data-sort-col]').forEach((th) => {
      th.addEventListener('click', () => {
        const col = th.dataset.sortCol;
        if (col === 'rank') return;  // rank is a derived column, not sortable
        const s = getHoldersSort();
        if (s.col === col) s.dir = s.dir === 'desc' ? 'asc' : 'desc';
        else { s.col = col; s.dir = col === 'manager' ? 'asc' : 'desc'; }
        const bodyEl = body.querySelector('#hldBody');
        if (bodyEl) bodyEl.innerHTML = renderTab('holders', d);
        attachHoldersSort(body, d);
      });
    });
  }

  /* ── Shell ───────────────────────────────────────────────── */
  async function loadAndRender(body, ticker, market, initialTab) {
    const sym = (ticker || 'AAPL').toUpperCase();
    market = market || 'US';
    const tab = initialTab || 'summary';

    body.innerHTML = `
      <div class="fin-head-row">
        <form class="stk-tickform" id="hldForm">
          <input class="stk-tick-input" id="hldTick" value="${sym}" maxlength="8" autocomplete="off" spellcheck="false">
          <select class="stk-market" id="hldMarket">
            <option value="US" ${market==='US'?'selected':''}>US</option>
            <option value="HK" ${market==='HK'?'selected':''}>HK</option>
            <option value="CA" ${market==='CA'?'selected':''}>CA</option>
          </select>
          <button type="submit" class="stk-go">GO</button>
        </form>
        <span class="chip chip-dim" id="hldMeta">loading ${sym}…</span>
      </div>
      <div class="mod-loading">Fetching ${sym} holdings…</div>
    `;
    attachForm(body);

    const [analysisRes, insiderRes, congressRes] = await Promise.allSettled([
      fetchJSON(analysisUrl(sym, market), { ttl: 10 * 60 * 1000 }),
      fetchJSON(insiderUrl(sym),           { ttl: 10 * 60 * 1000 }).catch(() => ({ trades: [], summary: {} })),
      fetchJSON(congressUrl(sym),          { ttl: 10 * 60 * 1000 }).catch(() => ({ trades: [] })),
    ]);

    if (analysisRes.status === 'rejected') {
      renderError(body, sym, market, analysisRes.reason);
      return;
    }
    const d = {
      analysis: analysisRes.value || {},
      insider:  insiderRes.status === 'fulfilled' ? insiderRes.value : { trades: [], summary: {} },
      congress: congressRes.status === 'fulfilled' ? congressRes.value : { trades: [] },
    };

    const info = d.analysis?.info || {};
    const metaParts = [
      info.symbol || sym,
      info.exchange,
      info.sector,
      info.industry,
    ].filter(Boolean).join(' · ');

    body.innerHTML = `
      <div class="fin-head-row">
        <form class="stk-tickform" id="hldForm">
          <input class="stk-tick-input" id="hldTick" value="${sym}" maxlength="8" autocomplete="off" spellcheck="false">
          <select class="stk-market" id="hldMarket">
            <option value="US" ${market==='US'?'selected':''}>US</option>
            <option value="HK" ${market==='HK'?'selected':''}>HK</option>
            <option value="CA" ${market==='CA'?'selected':''}>CA</option>
          </select>
          <button type="submit" class="stk-go">GO</button>
        </form>
        <div class="fin-head-meta">
          <span class="chip" title="${escapeHtml(metaParts)}">${metaParts.length > 80 ? metaParts.slice(0, 78) + '…' : metaParts}</span>
          <a href="#" class="fin-open-eq"  data-tk="${sym}">Open in EQ ↗</a>
          <a href="#" class="fin-open-fin" data-tk="${sym}">Open in FIN ↗</a>
        </div>
      </div>

      <div class="fin-subtabs">
        ${TABS.map((t) => `<button class="fin-subtab-btn${t.id === tab ? ' active' : ''}" data-hldtab="${t.id}">${t.label}</button>`).join('')}
      </div>

      <div class="fin-body" id="hldBody">${renderTab(tab, d)}</div>
    `;

    attachForm(body);
    attachSubTabs(body, d);
    attachHandoffLinks(body, sym, market);
    attachCongressFilter(body, d);
  }

  function renderError(body, sym, market, err) {
    const msg = (err && err.message) || String(err);
    body.innerHTML = `
      <div class="fin-head-row">
        <form class="stk-tickform" id="hldForm">
          <input class="stk-tick-input" id="hldTick" value="${sym}" maxlength="8" autocomplete="off" spellcheck="false">
          <select class="stk-market" id="hldMarket">
            <option value="US" ${market==='US'?'selected':''}>US</option>
            <option value="HK" ${market==='HK'?'selected':''}>HK</option>
            <option value="CA" ${market==='CA'?'selected':''}>CA</option>
          </select>
          <button type="submit" class="stk-go">GO</button>
        </form>
      </div>
      <div class="mod-err">Failed to load holdings for ${sym}: ${escapeHtml(msg)}</div>
    `;
    attachForm(body);
  }

  function attachForm(body) {
    const form = body.querySelector('#hldForm');
    if (!form) return;
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const t = (body.querySelector('#hldTick')?.value || '').trim().toUpperCase();
      const mk = body.querySelector('#hldMarket')?.value || 'US';
      if (!t) return;
      loadAndRender(body, t, mk);
    });
  }

  function attachSubTabs(body, d) {
    body.querySelectorAll('.fin-subtab-btn[data-hldtab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.hldtab;
        body.querySelectorAll('.fin-subtab-btn[data-hldtab]').forEach((b) => b.classList.toggle('active', b === btn));
        const bodyEl = body.querySelector('#hldBody');
        if (bodyEl) bodyEl.innerHTML = renderTab(tab, d);
        attachCongressFilter(body, d);
        if (tab === 'holders') {
          attachHoldersSort(body, d);
          if (!d.holdersData && !d.holdersError) {
            const sym = body.querySelector('#hldTick')?.value?.trim().toUpperCase() || '';
            if (sym) loadHolders(body, d, sym);
          }
        }
      });
    });
  }

  function attachHandoffLinks(body, sym, market) {
    const eq = body.querySelector('.fin-open-eq');
    if (eq) eq.addEventListener('click', (ev) => {
      ev.preventDefault();
      if (window.OC_OPEN_MODULE) window.OC_OPEN_MODULE('stock-analysis', { ticker: sym, market });
    });
    const fin = body.querySelector('.fin-open-fin');
    if (fin) fin.addEventListener('click', (ev) => {
      ev.preventDefault();
      if (window.OC_OPEN_MODULE) window.OC_OPEN_MODULE('financials', { ticker: sym, market });
    });
  }

  function attachCongressFilter(body, d) {
    body.querySelectorAll('.hld-cg-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        window._hldChamber = btn.dataset.chamber;
        const activeTab = body.querySelector('.fin-subtab-btn[data-hldtab].active')?.dataset.hldtab;
        if (activeTab !== 'congress') return;
        const bodyEl = body.querySelector('#hldBody');
        if (bodyEl) bodyEl.innerHTML = renderTab('congress', d);
        attachCongressFilter(body, d);
      });
    });
    body.querySelectorAll('.hld-cg-ntbtn').forEach((btn) => {
      btn.addEventListener('click', () => {
        window._hldCgNotable = btn.dataset.notable;
        const activeTab = body.querySelector('.fin-subtab-btn[data-hldtab].active')?.dataset.hldtab;
        if (activeTab !== 'congress') return;
        const bodyEl = body.querySelector('#hldBody');
        if (bodyEl) bodyEl.innerHTML = renderTab('congress', d);
        attachCongressFilter(body, d);
      });
    });
  }

  async function render(body, ctx) {
    const p = ctx?.params || {};
    await loadAndRender(body, p.ticker, p.market, p.tab);
  }

  window.OC_MODULES = window.OC_MODULES || {};
  window.OC_MODULES['holdings'] = { render };
})();
