/* F13 Financials — deep-dive 10-year financial analysis
   Mirrors stocks.clawmo.tech /api/stock/{t}/financials with 10 sub-tabs:
   Summary · Income · Balance · Cash Flow · Ratios · Valuation · Health · Returns · Peers · DCF
   Pass {ticker} via params; default to AAPL. */
(function () {
  'use strict';
  const { fetchJSON, fmt } = window.OC_DATA;

  const API = 'https://stocks.clawmo.tech/api/stock';
  function finUrl(sym, market) {
    return `${API}/${encodeURIComponent(sym)}/financials?market=${market || 'US'}`;
  }

  /* ── Helpers ─────────────────────────────────────────────── */
  function pctCls(v) {
    if (v == null || isNaN(v)) return '';
    if (v > 0) return 'num-up';
    if (v < 0) return 'num-dn';
    return '';
  }
  function $money(v, decimals) {
    if (v == null || isNaN(v)) return '—';
    return '$' + fmt.compact(v);
  }
  function $signed(v) {
    if (v == null || isNaN(v)) return '—';
    return (v >= 0 ? '' : '-$') + (v >= 0 ? '$' + fmt.compact(v) : fmt.compact(Math.abs(v)));
  }
  function $pct(v) {
    if (v == null || isNaN(v)) return '—';
    return (v >= 0 ? '+' : '') + (v * (Math.abs(v) < 1 ? 100 : 1)).toFixed(2) + '%';
  }
  function $fraction(v) {
    // For ratios already expressed as a fraction (0.0 – 1.0 range)
    if (v == null || isNaN(v)) return '—';
    return (v * 100).toFixed(2) + '%';
  }
  function $num(v, d) {
    if (v == null || isNaN(v)) return '—';
    return Number(v).toFixed(d == null ? 2 : d);
  }
  function yoy(cur, prev) {
    if (cur == null || prev == null || prev === 0) return null;
    return ((cur - prev) / Math.abs(prev)) * 100;
  }

  /* Small vertical-bar SVG helper for "stacked" year comparisons inside
     the summary strip. One series only; rankBars is horizontal, so roll
     our own here to keep it dense and year-labeled. */
  function yearlyBars(years, values, opts) {
    opts = opts || {};
    const W = opts.w || 780, H = opts.h || 140, padL = 8, padR = 8, padT = 10, padB = 22;
    if (!values || !values.length) return '';
    const clean = values.map((v) => typeof v === 'number' && isFinite(v) ? v : 0);
    const maxAbs = Math.max(...clean.map(Math.abs), 1);
    const zero = padT + (H - padT - padB) / 2;
    const plotH = H - padT - padB;
    const half = plotH / 2;
    const n = clean.length;
    const bw = (W - padL - padR) / n * 0.78;
    const step = (W - padL - padR) / n;
    const bars = clean.map((v, i) => {
      const x = padL + step * i + (step - bw) / 2;
      const h = Math.abs(v) / maxAbs * half;
      const y = v >= 0 ? zero - h : zero;
      const color = v >= 0 ? 'var(--pnl-up)' : 'var(--pnl-dn)';
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(h, 0.5).toFixed(1)}" style="fill:${color};opacity:0.78"></rect>`;
    }).join('');
    const xLabels = years.map((y, i) => {
      const x = padL + step * i + step / 2;
      // show short year (last 2 digits) when dense
      const short = String(y).slice(-2);
      return `<text class="oc-xlabel" x="${x.toFixed(1)}" y="${(H - 6).toFixed(1)}" text-anchor="middle">'${short}</text>`;
    }).join('');
    const zeroLine = `<line x1="${padL}" y1="${zero.toFixed(1)}" x2="${W - padR}" y2="${zero.toFixed(1)}" style="stroke:var(--fg-faint);stroke-width:0.5;opacity:0.4"></line>`;
    return `<svg class="oc-chart fin-barchart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${zeroLine}${bars}${xLabels}</svg>`;
  }

  /* ── Multi-period statement table (annual or quarterly) ─── */
  function labelPeriod(p, period) {
    if (period === 'quarterly') {
      const q = (p.period || '').replace(/[^0-9]/g, '');
      const yr = String(p.fiscalYear || (p.date || '').slice(0, 4)).slice(-2);
      return (p.period || 'Q?') + ' \'' + yr;
    }
    return p.fiscalYear || (p.date || '').slice(0, 4) || '—';
  }

  function sortPeriodsDesc(periods, period) {
    // Use ISO date for deterministic ordering; falls back to fiscalYear
    return [...periods].sort((a, b) => {
      const ad = a.date || a.fiscalYear || '';
      const bd = b.date || b.fiscalYear || '';
      return ad < bd ? 1 : ad > bd ? -1 : 0;
    });
  }

  // For quarterly YoY: find same-period prior-year match (Q1 2024 vs Q1 2023).
  // For annual YoY: sequential prior year (2024 vs 2023).
  function priorPeriodFor(sorted, idx, period) {
    const cur = sorted[idx];
    if (!cur) return null;
    if (period === 'quarterly') {
      const curQ = cur.period;
      const curYr = Number(cur.fiscalYear);
      if (!curQ || !isFinite(curYr)) return sorted[idx + 1] || null;
      return sorted.find((p) => p.period === curQ && Number(p.fiscalYear) === curYr - 1) || null;
    }
    return sorted[idx + 1] || null;
  }

  function renderStatementTable(lines, periods, opts) {
    opts = opts || {};
    const mode = opts.mode || 'dollar';              // 'dollar' or 'yoy'
    const period = opts.period || 'annual';          // 'annual' or 'quarterly'
    const sorted = sortPeriodsDesc(periods, period);
    const headers = `<tr><th class="fin-line-label">LINE ITEM</th>${
      sorted.map((p, i) => `<th class="num${i === 0 ? ' latest-col' : ''}">${labelPeriod(p, period)}</th>`).join('')
    }</tr>`;

    const yoyLabel = period === 'quarterly' ? 'YoY % (vs same quarter last year)' : 'YoY %';
    const rowsHtml = lines.map((line) => {
      const cls = [];
      if (line.parent) cls.push('fin-row-parent');
      if (line.child) cls.push('fin-row-child');
      if (line.border) cls.push('fin-border-' + line.border);
      if (line.highlight) cls.push('fin-row-highlight');
      const labelTt = line.glossary ? ` data-glossary="${line.glossary}"` : '';
      const cells = sorted.map((p, i) => {
        const raw = p[line.key];
        if (mode === 'yoy') {
          const prev = priorPeriodFor(sorted, i, period);
          const prevVal = prev ? prev[line.key] : null;
          const yv = yoy(raw, prevVal);
          const cls = pctCls(yv);
          return `<td class="mono ${cls}${i === 0 ? ' latest-col' : ''}">${yv == null ? '—' : (yv >= 0 ? '+' : '') + yv.toFixed(1) + '%'}</td>`;
        }
        let txt;
        if (line.fmt === 'perShare') {
          txt = raw == null ? '—' : '$' + Number(raw).toFixed(2);
        } else if (line.fmt === 'pct') {
          txt = raw == null ? '—' : (Number(raw) * 100).toFixed(2) + '%';
        } else if (line.fmt === 'num') {
          txt = raw == null ? '—' : Number(raw).toFixed(2);
        } else {
          txt = $money(raw);
        }
        // Inline YoY for parent / highlight rows in dollar mode
        let yoyHtml = '';
        if ((line.parent || line.highlight) && !line.fmt && raw != null) {
          const prev = priorPeriodFor(sorted, i, period);
          const prevVal = prev ? prev[line.key] : null;
          const yv = yoy(raw, prevVal);
          if (yv != null) {
            const yc = yv >= 0 ? 'num-up' : 'num-dn';
            yoyHtml = `<span class="fin-yoy-sub ${yc}">${yv >= 0 ? '+' : ''}${yv.toFixed(1)}%</span>`;
          }
        }
        return `<td class="mono${i === 0 ? ' latest-col' : ''}">${txt}${yoyHtml}</td>`;
      }).join('');
      return `<tr class="${cls.join(' ')}" data-field="${line.key}"${labelTt}><td class="fin-line-label">${line.label}</td>${cells}</tr>`;
    }).join('');

    return `<table class="tbl-dense fin-stmt-table" data-yoy-label="${yoyLabel}">
      <thead>${headers}</thead>
      <tbody>${rowsHtml}</tbody>
    </table>`;
  }

  /* ── Cross-statement highlight: switch tab, scroll to row, flash ───
     Duration ~10s total: 0.4s attention flash, 7s readable hold, 3s fade.
     Highlight auto-clears early if the user clicks another Show-in-
     Statements button or switches sub-tab, so rapid exploration stays clean.

     Implementation: we keep a per-body handle on the active timeout +
     animation-end listeners so we can cancel cleanly. */
  function clearActiveHighlights(body) {
    body.querySelectorAll('.fin-hc-highlight').forEach((r) => r.classList.remove('fin-hc-highlight'));
    if (body._hcTimeout) { clearTimeout(body._hcTimeout); body._hcTimeout = null; }
    if (body._hcDismissHandlers) {
      document.removeEventListener('keydown', body._hcDismissHandlers.key, true);
      document.removeEventListener('click', body._hcDismissHandlers.click, true);
      body._hcDismissHandlers = null;
    }
  }

  /* Attach Option-A dismiss handlers:
     • ESC key anywhere → clear highlight
     • Click anywhere outside the highlighted row(s) → clear highlight
     Clicking within the highlighted row itself is preserved (e.g. to select
     text/values without losing reference).
     Handlers use capture phase + are removed the moment the highlight clears,
     so they never accumulate across multiple Show-in-Statements clicks. */
  function armDismissHandlers(body) {
    const onKey = (ev) => {
      if (ev.key === 'Escape') clearActiveHighlights(body);
    };
    const onClick = (ev) => {
      // If click target is inside a highlighted row, preserve it.
      const row = ev.target.closest ? ev.target.closest('.fin-hc-highlight') : null;
      if (row) return;
      // Also preserve clicks that _start_ a new highlight, otherwise the new
      // highlight would be dismissed on the same click that created it.
      const showBtn = ev.target.closest ? ev.target.closest('.hc-show-btn, .hc-show-secondary') : null;
      if (showBtn) return;
      clearActiveHighlights(body);
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('click', onClick, true);
    body._hcDismissHandlers = { key: onKey, click: onClick };
  }

  function switchTabAndHighlight(body, d, highlights) {
    if (!highlights || !highlights.length) return;
    clearActiveHighlights(body);
    const primary = highlights[0];
    const targetTab = primary.stmt === 'income' ? 'income'
                    : primary.stmt === 'balance' ? 'balance'
                    : primary.stmt === 'cashflow' ? 'cashflow'
                    : null;
    if (!targetTab) return;
    // Activate the target sub-tab (re-renders the body)
    const btn = body.querySelector(`.fin-subtab-btn[data-fintab="${targetTab}"]`);
    if (btn) btn.click();
    // Wait one frame so the new table is in the DOM before querying
    setTimeout(() => {
      const wrap = body.querySelector('#fin-stmt-wrap') || body.querySelector('#finBody');
      if (!wrap) return;
      const matches = highlights.filter((h) => h.stmt === primary.stmt);
      const rows = [];
      matches.forEach((h) => {
        const r = wrap.querySelector(`tr[data-field="${h.field}"]`);
        if (r) rows.push(r);
      });
      if (!rows.length) return;
      rows.forEach((r) => r.classList.add('fin-hc-highlight'));
      rows[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
      armDismissHandlers(body);
      body._hcTimeout = setTimeout(() => clearActiveHighlights(body), 10000);
    }, 80);
  }

  /* ── Chart configs for statement tabs ───────────────────── */
  const STMT_CHART_CONF = {
    income: { series: [
      { key: 'revenue',          name: 'Sales / Revenue',   color: '#A78BFA' },
      { key: 'grossProfit',      name: 'Gross Profit',      color: '#4ADE80' },
      { key: 'operatingIncome',  name: 'Operating Income',  color: '#60A5FA' },
      { key: 'netIncome',        name: 'Net Income',        color: '#F87171' },
    ]},
    balance: { series: [
      { key: 'totalAssets',              name: 'Total Assets',      color: '#60A5FA' },
      { key: 'totalLiabilities',         name: 'Total Liabilities', color: '#F87171' },
      { key: 'totalStockholdersEquity',  name: 'Total Equity',      color: '#A78BFA' },
    ]},
    cashflow: { series: [
      { key: 'operatingCashFlow',                      name: 'Cash from Ops',       color: '#4ADE80' },
      { key: 'netCashProvidedByInvestingActivities',   name: 'Cash from Investing', color: '#60A5FA' },
      { key: 'netCashProvidedByFinancingActivities',   name: 'Cash from Financing', color: '#FB923C' },
      { key: 'freeCashFlow',                           name: 'Free Cash Flow',      color: '#A78BFA' },
    ]},
  };

  /* ── Line definitions ────────────────────────────────────── */
  const INCOME_LINES = [
    { key: 'revenue',                                     label: 'Sales / Revenue',        parent: true,  border: 'purple' },
    { key: 'costOfRevenue',                               label: 'Cost of Revenue',        child: true },
    { key: 'grossProfit',                                 label: 'Gross Profit',           parent: true,  border: 'teal' },
    { key: 'researchAndDevelopmentExpenses',              label: 'R&D',                    child: true,   glossary: 'R&D' },
    { key: 'sellingGeneralAndAdministrativeExpenses',     label: 'SG&A',                   child: true,   glossary: 'SG&A' },
    { key: 'operatingExpenses',                           label: 'Total Operating Expenses', child: true },
    { key: 'operatingIncome',                             label: 'Operating Income',       parent: true,  border: 'blue' },
    { key: 'interestExpense',                             label: 'Interest Expense',       child: true },
    { key: 'incomeBeforeTax',                             label: 'Income Before Tax',      child: true },
    { key: 'incomeTaxExpense',                            label: 'Income Tax',             child: true },
    { key: 'netIncome',                                   label: 'Net Income',             parent: true,  border: 'purple', highlight: true },
    { key: 'ebitda',                                      label: 'EBITDA',                 child: true,   glossary: 'EBITDA' },
    { key: 'eps',                                         label: 'EPS (basic)',            child: true,   fmt: 'perShare' },
    { key: 'epsDiluted',                                  label: 'EPS (diluted)',          child: true,   fmt: 'perShare' },
    { key: 'weightedAverageShsOut',                       label: 'Shares Outstanding',     child: true },
  ];

  const BALANCE_LINES = [
    { key: 'totalAssets',                      label: 'Total Assets',                 parent: true,  border: 'purple' },
    { key: 'cashAndShortTermInvestments',      label: 'Cash & ST Investments',        child: true },
    { key: 'netReceivables',                   label: 'Net Receivables',              child: true },
    { key: 'inventory',                        label: 'Inventory',                    child: true },
    { key: 'propertyPlantEquipmentNet',        label: 'PP&E (net)',                   child: true,   glossary: 'PP&E' },
    { key: 'goodwill',                         label: 'Goodwill',                     child: true },
    { key: 'intangibleAssets',                 label: 'Intangibles',                  child: true },
    { key: 'totalLiabilities',                 label: 'Total Liabilities',            parent: true,  border: 'red' },
    { key: 'shortTermDebt',                    label: 'Short-Term Debt',              child: true },
    { key: 'longTermDebt',                     label: 'Long-Term Debt',               child: true },
    { key: 'totalDebt',                        label: 'Total Debt',                   child: true },
    { key: 'accountPayables',                  label: 'Accounts Payable',             child: true },
    { key: 'deferredRevenue',                  label: 'Deferred Revenue',             child: true },
    { key: 'totalStockholdersEquity',          label: 'Shareholder Equity',           parent: true,  border: 'green', highlight: true },
    { key: 'retainedEarnings',                 label: 'Retained Earnings',            child: true },
    { key: 'commonStock',                      label: 'Common Stock',                 child: true },
    { key: 'netDebt',                          label: 'Net Debt',                     parent: true,  border: 'blue' },
  ];

  const CASHFLOW_LINES = [
    { key: 'netIncome',                                label: 'Net Income',                   parent: true,  border: 'purple' },
    { key: 'depreciationAndAmortization',              label: 'D&A',                          child: true,   glossary: 'D&A' },
    { key: 'stockBasedCompensation',                   label: 'Stock-Based Comp',             child: true,   glossary: 'SBC' },
    { key: 'changeInWorkingCapital',                   label: 'Δ Working Capital',            child: true },
    { key: 'operatingCashFlow',                        label: 'Cash from Operations',         parent: true,  border: 'green', highlight: true },
    { key: 'capitalExpenditure',                       label: 'CapEx',                        child: true,   glossary: 'CapEx' },
    { key: 'acquisitionsNet',                          label: 'Acquisitions',                 child: true },
    { key: 'netCashProvidedByInvestingActivities',     label: 'Cash from Investing',          parent: true,  border: 'blue' },
    { key: 'commonDividendsPaid',                      label: 'Dividends Paid',               child: true },
    { key: 'commonStockRepurchased',                   label: 'Buybacks',                     child: true },
    { key: 'netDebtIssuance',                          label: 'Debt Issuance (net)',          child: true },
    { key: 'netCashProvidedByFinancingActivities',     label: 'Cash from Financing',          parent: true,  border: 'orange' },
    { key: 'freeCashFlow',                             label: 'Free Cash Flow',               parent: true,  border: 'purple', highlight: true },
    { key: 'netChangeInCash',                          label: 'Net Δ Cash',                   parent: true },
  ];

  /* ── Sub-tabs (in display order) ─────────────────────────── */
  const TABS = [
    { id: 'summary',   label: 'Summary' },
    { id: 'income',    label: 'Income' },
    { id: 'balance',   label: 'Balance Sheet' },
    { id: 'cashflow',  label: 'Cash Flow' },
    { id: 'ratios',    label: 'Ratios' },
    { id: 'valuation', label: 'Valuation' },
    { id: 'health',    label: 'Health' },
    { id: 'returns',   label: 'Returns' },
    { id: 'peers',     label: 'Peers' },
    { id: 'dcf',       label: 'DCF' },
  ];

  /* ── Tab renderers ───────────────────────────────────────── */

  function renderKeyFinancialsTable(a, ps) {
    if (!a || !a.years || !a.years.length) return '';
    const years = a.years;
    const lastIdx = years.length - 1;
    const ttm = a.ttm || {};
    const hasTTM = Object.keys(ttm).length > 0;

    function kfFmt(v, type) {
      if (v == null || (typeof v === 'number' && isNaN(v))) return '—';
      switch (type) {
        case 'currency': return $money(v);
        case 'percent':  return (v * 100).toFixed(1) + '%';
        case 'growth':   return (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%';
        case 'eps':      return '$' + Number(v).toFixed(2);
        case 'ratio':    return Number(v).toFixed(1) + 'x';
        case 'shares':   return fmt.compact(v);
        default:         return String(v);
      }
    }
    function kfCls(v, type) {
      if (v == null) return '';
      if (type === 'growth' || type === 'percent') return pctCls(v);
      return '';
    }

    const sections = [
      { label: 'REVENUE & PROFITABILITY', rows: [
        { label: 'Revenue',          field: 'revenue',           type: 'currency', ttmField: 'revenue' },
        { label: 'Rev Growth',       field: 'revenue_growth',    type: 'growth',   ttmField: null },
        { label: 'Gross Profit',     field: 'gross_profit',      type: 'currency', ttmField: null },
        { label: 'Gross Margin',     field: 'gross_margin',      type: 'percent',  ttmField: 'gross_margin' },
        { label: 'Operating Income', field: 'operating_income',  type: 'currency', ttmField: null },
        { label: 'Operating Margin', field: 'operating_margin',  type: 'percent',  ttmField: 'operating_margin' },
        { label: 'Net Income',       field: 'net_income',        type: 'currency', ttmField: null },
        { label: 'Net Margin',       field: 'net_margin',        type: 'percent',  ttmField: 'net_margin' },
        { label: 'EPS (Diluted)',    field: 'eps_diluted',       type: 'eps',      ttmField: null },
      ]},
      { label: 'PER SHARE', source: 'ps', rows: [
        { label: 'Revenue / Share',    field: 'revenue_per_share',          type: 'eps' },
        { label: 'EPS (Diluted)',      field: 'eps_diluted',                type: 'eps' },
        { label: 'Div / Share',        field: 'dividend_per_share',         type: 'eps' },
        { label: 'FCF / Share',        field: 'fcf_per_share',              type: 'eps' },
        { label: 'OCF / Share',        field: 'ocf_per_share',              type: 'eps' },
        { label: 'Book Value / Share', field: 'book_value_per_share',       type: 'eps' },
        { label: 'Cash / Share',       field: 'cash_per_share',             type: 'eps' },
      ]},
      { label: 'CASH FLOW', rows: [
        { label: 'Operating Cash Flow', field: 'operating_cash_flow', type: 'currency', ttmField: null },
        { label: 'CapEx',               field: 'capex',               type: 'currency', ttmField: null },
        { label: 'Free Cash Flow',      field: 'free_cash_flow',      type: 'currency', ttmField: null },
        { label: 'FCF Margin',          field: 'fcf_margin',          type: 'percent',  ttmField: null },
      ]},
      { label: 'BALANCE SHEET', rows: [
        { label: 'Total Assets',         field: 'total_assets',         type: 'currency', ttmField: null },
        { label: 'Total Debt',           field: 'total_debt',           type: 'currency', ttmField: null },
        { label: 'Cash & Equivalents',   field: 'cash_and_investments', type: 'currency', ttmField: null },
        { label: 'Net Debt',             field: 'net_debt',             type: 'currency', ttmField: null },
        { label: 'Shareholders Equity',  field: 'shareholders_equity',  type: 'currency', ttmField: null },
      ]},
      { label: 'RETURNS & VALUATION', rows: [
        { label: 'ROE',       field: 'roe',            type: 'percent', ttmField: 'roe' },
        { label: 'ROA',       field: 'roa',            type: 'percent', ttmField: 'roa' },
        { label: 'ROIC',      field: 'roic',           type: 'percent', ttmField: 'roic' },
        { label: 'P/E',       field: 'pe_ratio',       type: 'ratio',   ttmField: 'pe_ratio' },
        { label: 'P/S',       field: 'ps_ratio',       type: 'ratio',   ttmField: 'ps_ratio' },
        { label: 'EV/EBITDA', field: 'ev_ebitda',      type: 'ratio',   ttmField: 'ev_ebitda' },
        { label: 'Div Yield', field: 'dividend_yield', type: 'percent', ttmField: 'dividend_yield' },
      ]},
    ];

    const totalCols = 1 + (hasTTM ? 1 : 0) + years.length;
    let thead = '<tr><th class="fin-line-label">METRIC</th>';
    if (hasTTM) thead += '<th class="num fin-kf-ttm">TTM</th>';
    for (let yi = lastIdx; yi >= 0; yi--) {
      thead += `<th class="num${yi === lastIdx ? ' latest-col' : ''}">FY${years[yi]}</th>`;
    }
    thead += '</tr>';

    let tbody = '';
    sections.forEach((sec) => {
      tbody += `<tr class="fin-kf-hdr"><td colspan="${totalCols}">${sec.label}</td></tr>`;
      if (sec.source === 'ps') {
        sec.rows.forEach((row) => {
          const vals = (ps && ps[row.field]) || [];
          tbody += `<tr><td class="fin-line-label">${row.label}</td>`;
          if (hasTTM) {
            const v = vals.length > 0 ? vals[0] : null;
            const c = kfCls(v, row.type);
            tbody += `<td class="mono fin-kf-ttm${c ? ' ' + c : ''}">${kfFmt(v, row.type)}</td>`;
          }
          // ps.field[1] = oldest year (matches a.years[0]), ps.field[N] = most recent (matches a.years[lastIdx])
          for (let yi = lastIdx; yi >= 0; yi--) {
            const psIdx = yi + 1;
            const v = psIdx < vals.length ? vals[psIdx] : null;
            const c = kfCls(v, row.type);
            tbody += `<td class="mono${yi === lastIdx ? ' latest-col' : ''}${c ? ' ' + c : ''}">${kfFmt(v, row.type)}</td>`;
          }
          tbody += '</tr>';
        });
      } else {
        sec.rows.forEach((row) => {
          const vals = a[row.field] || [];
          tbody += `<tr><td class="fin-line-label">${row.label}</td>`;
          if (hasTTM) {
            const v = row.ttmField ? ttm[row.ttmField] : null;
            const c = kfCls(v, row.type);
            tbody += `<td class="mono fin-kf-ttm${c ? ' ' + c : ''}">${kfFmt(v, row.type)}</td>`;
          }
          for (let yi = lastIdx; yi >= 0; yi--) {
            const v = yi < vals.length ? vals[yi] : null;
            const c = kfCls(v, row.type);
            tbody += `<td class="mono${yi === lastIdx ? ' latest-col' : ''}${c ? ' ' + c : ''}">${kfFmt(v, row.type)}</td>`;
          }
          tbody += '</tr>';
        });
      }
    });

    return `
      <div class="mod-panel">
        <div class="mod-panel-title">KEY FINANCIALS · 10Y</div>
        <div class="tbl-wrap">
          <table class="tbl-dense fin-kf-table">
            <thead>${thead}</thead>
            <tbody>${tbody}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderQuarterlyTables(q) {
    if (!q || !q.quarters || !q.quarters.length) return '';

    function makeQTable(title, values, growths, type) {
      let rows = '';
      for (let i = q.quarters.length - 1; i >= 0; i--) {
        const v = values?.[i];
        const g = growths?.[i];
        const gCls = g != null ? pctCls(g) : '';
        const gTxt = g != null ? (g >= 0 ? '+' : '') + (g * 100).toFixed(1) + '%' : '—';
        const vTxt = v == null ? '—' : type === 'eps' ? '$' + Number(v).toFixed(2) : $money(v);
        rows += `<tr>
          <td class="mono">${q.quarters[i]}</td>
          <td class="mono">${vTxt}</td>
          <td class="mono ${gCls}">${gTxt}</td>
        </tr>`;
      }
      const col2 = type === 'eps' ? 'EPS' : 'REVENUE';
      return `
        <div class="mod-panel">
          <div class="mod-panel-title">${title}</div>
          <div class="tbl-wrap">
            <table class="tbl-dense">
              <thead><tr><th>QUARTER</th><th class="num">${col2}</th><th class="num">YoY</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
      `;
    }

    return `<div class="fin-qtr-grid">
      ${makeQTable('QUARTERLY REVENUE', q.revenue, q.revenue_yoy_growth, 'currency')}
      ${makeQTable('QUARTERLY EPS', q.eps_diluted, q.eps_yoy_growth, 'eps')}
    </div>`;
  }

  function renderCapStructureCards(cs) {
    if (!cs || !cs.market_cap) return '';
    const ndStyle = cs.net_debt != null
      ? (cs.net_debt < 0 ? ' style="color:var(--pnl-up)"' : cs.net_debt > 0 ? ' style="color:var(--pnl-dn)"' : '')
      : '';
    const items = [
      { label: 'MARKET CAP',      val: $money(cs.market_cap),              style: '' },
      { label: 'ENTERPRISE VALUE', val: $money(cs.enterprise_value),        style: '' },
      { label: 'TOTAL DEBT',      val: $money(cs.total_debt),              style: '' },
      { label: 'CASH & EQUIV',    val: $money(cs.cash_and_investments),    style: '' },
      { label: 'NET DEBT',        val: $money(cs.net_debt),                style: ndStyle },
      { label: 'DEBT / EQUITY',   val: $num(cs.debt_equity, 2) + 'x',     style: '' },
      { label: 'INT COVERAGE',    val: $num(cs.interest_coverage, 1) + 'x', style: '' },
    ];

    const debt   = cs.total_debt || 0;
    const cash   = cs.cash_and_investments || 0;
    const equity = Math.max(0, (cs.market_cap || 0) - debt - cash);
    const total  = debt + equity + cash;
    let stackedBar = '';
    if (total > 0) {
      const dPct = (debt / total * 100).toFixed(1);
      const ePct = (equity / total * 100).toFixed(1);
      const cPct = (cash / total * 100).toFixed(1);
      stackedBar = `<div class="fin-cap-bar">
        ${debt > 0 ? `<div class="fin-cap-seg fin-cap-debt" style="width:${dPct}%">Debt&nbsp;${dPct}%</div>` : ''}
        ${equity > 0 ? `<div class="fin-cap-seg fin-cap-equity" style="width:${ePct}%">Equity&nbsp;${ePct}%</div>` : ''}
        ${cash > 0 ? `<div class="fin-cap-seg fin-cap-cash" style="width:${cPct}%">Cash&nbsp;${cPct}%</div>` : ''}
      </div>`;
    }

    return `
      <div class="mod-panel">
        <div class="mod-panel-title">CAPITAL STRUCTURE</div>
        <div class="fin-cap-cards">
          ${items.map((it) => `
            <div class="fin-kpi">
              <div class="fin-kpi-lbl">${it.label}</div>
              <div class="fin-kpi-val mono"${it.style}>${it.val}</div>
            </div>
          `).join('')}
        </div>
        ${stackedBar}
      </div>
    `;
  }

  function renderSummary(d) {
    const a = d.annual || {};
    const ps = d.per_share || {};
    const years = a.years || [];
    const profile = d.profile || {};
    const cs = d.capital_structure || {};
    const gr = d.growth_rates || {};
    const q = d.quarterly || {};

    const latestIdx = years.length - 1;
    const latest = {
      revenue:   a.revenue?.[latestIdx],
      netIncome: a.net_income?.[latestIdx],
      fcf:       a.free_cash_flow?.[latestIdx],
      nm:        a.net_margin?.[latestIdx],
    };
    const rtab = d.ratios || {};
    if (rtab.profitability) {
      const rp = rtab.profitability;
      latest.roe = rp.roe?.[rp.roe?.length - 1];
      latest.roa = rp.roa?.[rp.roa?.length - 1];
    }

    return `
      <div class="fin-summary-strip">
        <div class="fin-kpi">
          <div class="fin-kpi-lbl">REVENUE (TTM)</div>
          <div class="fin-kpi-val mono">${a.ttm?.revenue != null ? $money(a.ttm.revenue) : $money(latest.revenue)}</div>
          <div class="fin-kpi-sub mono ${pctCls(gr.revenue?.['1y'])}">${$pct(gr.revenue?.['1y'])} yoy</div>
        </div>
        <div class="fin-kpi">
          <div class="fin-kpi-lbl">NET INCOME</div>
          <div class="fin-kpi-val mono">${$money(latest.netIncome)}</div>
          <div class="fin-kpi-sub mono ${pctCls(latest.nm)}">margin ${latest.nm != null ? (latest.nm * 100).toFixed(1) + '%' : '—'}</div>
        </div>
        <div class="fin-kpi">
          <div class="fin-kpi-lbl">FREE CASH FLOW</div>
          <div class="fin-kpi-val mono">${$money(latest.fcf)}</div>
          <div class="fin-kpi-sub mono">${latest.revenue && latest.fcf ? 'fcf margin ' + (latest.fcf / latest.revenue * 100).toFixed(1) + '%' : '—'}</div>
        </div>
        <div class="fin-kpi">
          <div class="fin-kpi-lbl">MARKET CAP / EV</div>
          <div class="fin-kpi-val mono">${$money(cs.market_cap)} / ${$money(cs.enterprise_value)}</div>
          <div class="fin-kpi-sub mono">net debt ${$money(cs.net_debt)}</div>
        </div>
        <div class="fin-kpi">
          <div class="fin-kpi-lbl">ROE · ROA</div>
          <div class="fin-kpi-val mono">${latest.roe != null ? (latest.roe * 100).toFixed(1) + '%' : '—'} · ${latest.roa != null ? (latest.roa * 100).toFixed(1) + '%' : '—'}</div>
          <div class="fin-kpi-sub mono">debt/eq ${$num(cs.debt_equity, 2)}</div>
        </div>
        <div class="fin-kpi" id="finAnalystKpi" data-fin-analyst-kpi>
          <div class="fin-kpi-lbl">ANALYST CONSENSUS</div>
          <div class="fin-kpi-val mono" style="color:var(--fg-faint);font-size:14px">…</div>
          <div class="fin-kpi-sub mono" style="color:var(--fg-faint)">loading</div>
        </div>
      </div>

      ${renderKeyFinancialsTable(a, ps)}

      <div class="mod-grid-2 fin-summary-grid">
        <div class="mod-panel">
          <div class="mod-panel-title">REVENUE · 10Y</div>
          <div class="fin-chart-wrap">${yearlyBars(years, a.revenue || [])}</div>
        </div>
        <div class="mod-panel">
          <div class="mod-panel-title">NET INCOME · 10Y</div>
          <div class="fin-chart-wrap">${yearlyBars(years, a.net_income || [])}</div>
        </div>
        <div class="mod-panel">
          <div class="mod-panel-title">FREE CASH FLOW · 10Y</div>
          <div class="fin-chart-wrap">${yearlyBars(years, a.free_cash_flow || [])}</div>
        </div>
        <div class="mod-panel">
          <div class="mod-panel-title">GROSS MARGIN · 10Y</div>
          <div class="fin-chart-wrap">${yearlyBars(years, (a.gross_margin || []).map((v) => v == null ? null : v * 100))}</div>
        </div>
      </div>

      <div class="mod-panel">
        <div class="mod-panel-title">GROWTH RATES · CAGR</div>
        <div class="tbl-wrap">
          <table class="tbl-dense">
            <thead><tr><th>METRIC</th><th>1Y</th><th>3Y</th><th>5Y</th><th>10Y</th></tr></thead>
            <tbody>
              ${(() => {
                // growth_rates.dividend is always null from the API — compute from per_share instead
                const divVals = (ps.dividend_per_share || []).slice(1); // drop TTM (index 0), keep FY values
                function divCagr(n) {
                  const len = divVals.length;
                  if (len < n + 1) return null;
                  const recent = divVals[len - 1];
                  const base   = divVals[len - 1 - n];
                  if (!recent || !base || base <= 0) return null;
                  return Math.pow(recent / base, 1 / n) - 1;
                }
                const computedDivGr = { '1y': divCagr(1), '3y': divCagr(3), '5y': divCagr(5), '10y': divCagr(10) };

                return ['revenue','eps','net_income','fcf','dividend'].map((m) => {
                  const g = m === 'dividend' ? computedDivGr : (gr[m] || {});
                  const cell = (v) => v == null ? '<td class="mono">—</td>' : `<td class="mono ${pctCls(v)}">${(v >= 0 ? '+' : '') + (v * 100).toFixed(1)}%</td>`;
                  const label = m === 'net_income' ? 'NET INCOME' : m === 'fcf' ? 'FCF' : m.toUpperCase();
                  return `<tr>
                    <td>${label}</td>
                    ${cell(g['1y'])}${cell(g['3y'])}${cell(g['5y'])}${cell(g['10y'])}
                  </tr>`;
                }).join('');
              })()}
            </tbody>
          </table>
        </div>
      </div>

      ${renderQuarterlyTables(q)}

      ${renderCapStructureCards(cs)}

      ${profile.description ? `
      <div class="mod-panel">
        <div class="mod-panel-title">BUSINESS SUMMARY · ${profile.sector || ''} · ${profile.industry || ''}${profile.employees ? ' · ' + profile.employees.toLocaleString() + ' employees' : ''}</div>
        <div class="fin-biz-summary">${profile.description}</div>
      </div>
      ` : ''}
    `;
  }

  function statementFor(d, tabId, period) {
    const stmts = d.statements || {};
    let lines, raw, key;
    if (tabId === 'income')        { lines = INCOME_LINES;  key = 'income_statement'; }
    else if (tabId === 'balance')  { lines = BALANCE_LINES; key = 'balance_sheet'; }
    else                           { lines = CASHFLOW_LINES; key = 'cash_flow'; }
    raw = stmts[key]?.[period] || [];
    return { lines, data: raw };
  }

  function renderStatementTab(d, tabId, period, mode) {
    period = period || 'annual';
    mode = mode || 'dollar';
    const { lines, data: stmtData } = statementFor(d, tabId, period);
    const title = (tabId === 'income' ? 'INCOME STATEMENT' : tabId === 'balance' ? 'BALANCE SHEET' : 'CASH FLOW') +
      (period === 'annual' ? ' · 10Y ANNUAL' : ' · 8Q QUARTERLY');

    if (!stmtData.length) return `<div class="mod-loading">No ${period} ${tabId} data available</div>`;

    // Multi-series grouped bar chart
    const sortedAsc = [...stmtData].sort((a, b) => {
      const ad = a.date || a.fiscalYear || '';
      const bd = b.date || b.fiscalYear || '';
      return ad < bd ? -1 : ad > bd ? 1 : 0;
    });
    const xLabels = sortedAsc.map((p) => labelPeriod(p, period));
    const chartConf = STMT_CHART_CONF[tabId];
    let chartHtml = '';
    if (chartConf && window.OC_CHART && window.OC_CHART.groupedBars) {
      const series = chartConf.series.map((s) => ({
        name:   s.name,
        color:  s.color,
        values: sortedAsc.map((p) => p[s.key] != null ? p[s.key] : null),
      }));
      chartHtml = window.OC_CHART.groupedBars(series, xLabels);
    }

    return `
      <div class="mod-panel">
        <div class="mod-panel-title">${title}</div>
        <div class="fin-chart-wrap">${chartHtml}</div>
      </div>

      <div class="mod-panel">
        <div class="mod-panel-title">
          ${title} · DETAIL
          <span class="fin-stmt-toggles">
            <button class="fin-period-btn${period === 'annual' ? ' active' : ''}" data-period="annual">ANN</button>
            <button class="fin-period-btn${period === 'quarterly' ? ' active' : ''}" data-period="quarterly">QTR</button>
            <span class="fin-toggle-sep">│</span>
            <button class="fin-mode-btn${mode === 'dollar' ? ' active' : ''}" data-mode="dollar">$ + YoY</button>
            <button class="fin-mode-btn${mode === 'yoy' ? ' active' : ''}" data-mode="yoy">YoY % only</button>
          </span>
        </div>
        <div class="tbl-wrap" id="fin-stmt-wrap">
          ${renderStatementTable(lines, stmtData, { mode, period })}
        </div>
      </div>
    `;
  }

  function renderRatios(d) {
    const r = d.ratios || {};
    if (!r.years) return `<div class="mod-loading">No ratios data available</div>`;
    const years = r.years;
    const RATIO_GROUPS = [
      { key: 'profitability', label: 'PROFITABILITY',
        rows: [
          { key: 'gross_margin',     label: 'Gross Margin',     fmt: 'pct' },
          { key: 'operating_margin', label: 'Operating Margin', fmt: 'pct' },
          { key: 'net_margin',       label: 'Net Margin',       fmt: 'pct' },
          { key: 'roe',              label: 'ROE',              fmt: 'pct', glossary: 'ROE' },
          { key: 'roa',              label: 'ROA',              fmt: 'pct', glossary: 'ROA' },
          { key: 'roic',             label: 'ROIC',             fmt: 'pct', glossary: 'ROIC' },
        ] },
      { key: 'liquidity', label: 'LIQUIDITY',
        rows: [
          { key: 'current_ratio', label: 'Current Ratio', glossary: 'Curr ratio' },
          { key: 'quick_ratio',   label: 'Quick Ratio' },
          { key: 'cash_ratio',    label: 'Cash Ratio' },
        ] },
      { key: 'solvency', label: 'SOLVENCY',
        rows: [
          { key: 'debt_to_equity',    label: 'Debt / Equity',     glossary: 'Debt/Eq' },
          { key: 'debt_to_assets',    label: 'Debt / Assets' },
          { key: 'debt_to_ebitda',    label: 'Debt / EBITDA' },
          { key: 'interest_coverage', label: 'Interest Coverage' },
        ] },
      { key: 'efficiency', label: 'EFFICIENCY',
        rows: [
          { key: 'asset_turnover',       label: 'Asset Turnover' },
          { key: 'inventory_turnover',   label: 'Inventory Turnover' },
          { key: 'days_inventory',       label: 'Days Inventory' },
          { key: 'days_sales',           label: 'Days Sales Outstanding' },
          { key: 'days_payables',        label: 'Days Payables' },
        ] },
    ];

    // Reverse years: latest first
    const ordered = years.map((y, i) => ({ y, i })).sort((a, b) => b.y - a.y);
    const headerCells = ordered.map(({ y }, i) => `<th class="num${i === 0 ? ' latest-col' : ''}">${y}</th>`).join('');

    const sections = RATIO_GROUPS.map((g) => {
      const grp = r[g.key] || {};
      const rowsHtml = g.rows.map((row) => {
        const series = grp[row.key] || [];
        const cells = ordered.map(({ i }, ci) => {
          const v = series[i];
          let txt = '—';
          if (v != null) {
            if (row.fmt === 'pct') txt = (v * 100).toFixed(2) + '%';
            else txt = v.toFixed(2);
          }
          return `<td class="mono${ci === 0 ? ' latest-col' : ''}">${txt}</td>`;
        }).join('');
        const lbl = row.glossary ? `<td class="fin-line-label" data-glossary="${row.glossary}">${row.label}</td>` : `<td class="fin-line-label">${row.label}</td>`;
        return `<tr>${lbl}${cells}</tr>`;
      }).join('');
      return `<div class="mod-panel">
        <div class="mod-panel-title">${g.label}</div>
        <div class="tbl-wrap">
          <table class="tbl-dense fin-stmt-table">
            <thead><tr><th class="fin-line-label">METRIC</th>${headerCells}</tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      </div>`;
    }).join('');

    return sections;
  }

  function renderValuation(d, mode) {
    mode = mode || 'normalized';  // 'normalized' | 'absolute'
    const vh = d.valuation_history || {};
    const avg = vh.averages || {};
    const q = vh.quarterly || {};
    const years = d.annual?.years || [];

    // 3 KPI rows showing current vs 5y and 10y averages for PE, PS, PB, EV/EBITDA
    function kpi(label, cur, av, glossary) {
      const d5 = av?.avg_5y;
      const d10 = av?.avg_10y;
      const vs5 = (cur != null && d5) ? ((cur - d5) / d5) * 100 : null;
      const vs10 = (cur != null && d10) ? ((cur - d10) / d10) * 100 : null;
      const attr = glossary ? ` data-glossary="${glossary}"` : '';
      return `<div class="fin-kpi"${attr}>
        <div class="fin-kpi-lbl">${label}</div>
        <div class="fin-kpi-val mono">${$num(cur, 2)}</div>
        <div class="fin-kpi-sub mono">5y ${$num(d5, 2)} · 10y ${$num(d10, 2)}</div>
        <div class="fin-kpi-sub mono ${pctCls(vs10)}">vs 10y avg: ${vs10 == null ? '—' : (vs10 >= 0 ? '+' : '') + vs10.toFixed(1) + '%'}</div>
      </div>`;
    }

    // Latest quarterly point for "current"
    const lastIdx = (q.dates || []).length - 1;
    const curPE = q.pe_ratio?.[lastIdx];
    const curPS = q.ps_ratio?.[lastIdx];
    const curPB = q.pb_ratio?.[lastIdx];
    const curEV = q.ev_ebitda?.[lastIdx];

    // Build a multi-series line chart from valuation_history.quarterly.
    // P/E, P/S, P/B live on very different scales (e.g. P/E ~15-30, P/S ~2-10,
    // P/B ~1-5), so plotting them on a shared absolute Y axis flattens the
    // lower-magnitude lines. Use overlayNorm: each series is min-max scaled
    // to its own 0-100 range, so direction + relative moves stay visible.
    const dates = q.dates || [];
    const chartSeries = [
      { name: 'P/E', values: q.pe_ratio || [], color: 'var(--accent)' },
      { name: 'P/S', values: q.ps_ratio || [], color: '#A78BFA' },
      { name: 'P/B', values: q.pb_ratio || [], color: '#4FD1C5' },
    ].filter((s) => s.values.length >= 2);

    // Per-series range labels for the legend (since normalized Y hides scale)
    function seriesRange(vals) {
      const nums = vals.filter((v) => typeof v === 'number' && isFinite(v));
      if (nums.length < 2) return '';
      return nums.length ? `${Math.min(...nums).toFixed(1)} – ${Math.max(...nums).toFixed(1)}` : '';
    }
    const legend = chartSeries.map((s) => {
      const rng = seriesRange(s.values);
      const last = s.values[s.values.length - 1];
      return `<span><span class="fin-legend-swatch" style="background:${s.color}"></span>${s.name} · last ${last != null ? last.toFixed(1) : '—'} <span class="fin-legend-range">(${rng})</span></span>`;
    }).join('');

    let chart;
    if (!chartSeries.length) {
      chart = '<div class="mod-loading">No quarterly valuation history</div>';
    } else if (mode === 'absolute') {
      const xLabels = dates.map((ds) => String(ds).slice(0, 7));
      chart = window.OC_CHART.lineAbs(chartSeries, { w: 900, h: 220, xLabels, yFmt: (v) => v.toFixed(1) });
    } else {
      chart = window.OC_CHART.overlayNorm(chartSeries, { w: 900, h: 220, pad: 26 });
    }

    const titleSuffix = mode === 'absolute'
      ? 'ABSOLUTE (shared Y axis — useful for single-metric vs 10Y avg)'
      : 'NORMALIZED (each series scaled to its own min-max)';

    return `
      <div class="fin-summary-strip">
        ${kpi('P/E ratio',    curPE, avg.pe_ratio,    'P/E')}
        ${kpi('P/S ratio',    curPS, avg.ps_ratio,    'P/S')}
        ${kpi('P/B ratio',    curPB, avg.pb_ratio,    'P/B')}
        ${kpi('EV / EBITDA',  curEV, avg.ev_ebitda,   'EV/EBITDA')}
      </div>

      <div class="mod-panel">
        <div class="mod-panel-title">
          VALUATION MULTIPLES · QUARTERLY · ${titleSuffix}
          <span class="fin-stmt-toggles">
            <button class="fin-val-btn${mode === 'normalized' ? ' active' : ''}" data-valmode="normalized">NORM</button>
            <button class="fin-val-btn${mode === 'absolute'   ? ' active' : ''}" data-valmode="absolute">ABS</button>
          </span>
        </div>
        <div class="fin-chart-wrap" id="fin-val-chart">${chart}</div>
        <div class="fin-legend">${legend}</div>
      </div>
    `;
  }

  function healthStatusIcon(status) {
    if (status === 'pass') return '<span class="hc-icon hc-pass" title="Pass">✓</span>';
    if (status === 'warn') return '<span class="hc-icon hc-warn" title="Warning">!</span>';
    if (status === 'fail') return '<span class="hc-icon hc-fail" title="Fail">✕</span>';
    return '<span class="hc-icon">·</span>';
  }
  function healthScoreCls(score, max) {
    const pct = max ? score / max : 0;
    if (pct >= 0.75) return 'hc-score-good';
    if (pct >= 0.5)  return 'hc-score-ok';
    return 'hc-score-bad';
  }
  function stmtLabel(s) {
    return s === 'income' ? 'Income' : s === 'balance' ? 'Balance' : s === 'cashflow' ? 'Cash Flow' : s;
  }

  function renderHealth(d, period) {
    period = period === 'quarterly' ? 'quarterly' : 'annual';
    if (!window.OC_HEALTH) {
      return `<div class="mod-err">Health-check engine not loaded</div>`;
    }
    const result = window.OC_HEALTH.runHealthChecks(d, period);
    if (!result) {
      return `<div class="mod-loading">Insufficient data for ${period} health check — the financials JSON lacks one or more of income / balance / cash-flow ${period} statements.</div>`;
    }
    const periodLabel = period === 'annual' ? '10Y ANNUAL' : '8Q QUARTERLY';

    const pct = result.maxScore ? Math.round((result.totalScore / result.maxScore) * 100) : 0;
    const gradeCls = healthScoreCls(result.totalScore, result.maxScore);

    // Category pills
    const catOrder = ['earnings', 'balance', 'cashflow', 'dividend', 'growth'];
    const catPills = catOrder.map((cat) => {
      const c = result.categories[cat];
      if (!c) return '';
      return `<div class="hc-cat-pill ${healthScoreCls(c.score, c.max)}">
        <div class="hc-cat-pill-lbl">${c.label.toUpperCase()}</div>
        <div class="hc-cat-pill-val mono">${c.score}<span class="hc-cat-pill-max">/${c.max}</span></div>
      </div>`;
    }).join('');

    // Category sections
    const sections = catOrder.map((cat) => {
      const c = result.categories[cat];
      if (!c) return '';
      const rowsHtml = c.items.map((chk) => {
        const hasDetail = chk.why || chk.what || (chk.highlights && chk.highlights.length);
        const hasLink = chk.highlights && chk.highlights.length && ['income','balance','cashflow'].includes(chk.highlights[0].stmt);
        const secondaryLinks = (chk.highlights || []).slice(1)
          .filter((h) => ['income','balance','cashflow'].includes(h.stmt))
          .map((h) => `<a href="#" class="hc-show-secondary" data-stmt="${h.stmt}" data-field="${h.field}">Also on ${stmtLabel(h.stmt)}: ${h.field} ↗</a>`)
          .join(' · ');
        return `<div class="hc-row hc-${chk.status}" data-hc-id="${chk.id}">
          <div class="hc-row-head" ${hasDetail ? 'data-expandable="1"' : ''}>
            ${healthStatusIcon(chk.status)}
            <div class="hc-row-title">${chk.title}</div>
            <div class="hc-row-detail mono">${chk.detail}</div>
            ${hasLink ? `<button class="hc-show-btn" data-primary-stmt="${chk.highlights[0].stmt}" data-fields="${chk.highlights.filter((h) => h.stmt === chk.highlights[0].stmt).map((h) => h.field).join(',')}">Show in ${stmtLabel(chk.highlights[0].stmt)} →</button>` : ''}
            ${hasDetail ? '<span class="hc-caret">▸</span>' : ''}
          </div>
          ${hasDetail ? `<div class="hc-row-body">
            ${chk.why ? `<div class="hc-why"><span class="hc-why-lbl">Why it matters</span><span class="hc-why-txt">${chk.why}</span></div>` : ''}
            ${chk.what ? `<div class="hc-what"><span class="hc-what-lbl">What to check</span><span class="hc-what-txt">${chk.what}</span></div>` : ''}
            ${secondaryLinks ? `<div class="hc-secondary">${secondaryLinks}</div>` : ''}
          </div>` : ''}
        </div>`;
      }).join('');
      return `<div class="mod-panel hc-cat-panel">
        <div class="mod-panel-title hc-cat-title">
          ${c.label} <span class="hc-cat-score ${healthScoreCls(c.score, c.max)}">${c.score}/${c.max}</span>
        </div>
        <div class="hc-rows">${rowsHtml}</div>
      </div>`;
    }).join('');

    const warnBanner = (result.negativeEquity || result.extremeLeverage)
      ? `<div class="hc-warn-banner">
          ${result.negativeEquity ? '⚠ <b>Negative shareholder equity</b> — balance-sheet score capped at 5/20. ' : ''}
          ${result.extremeLeverage ? '⚠ <b>Extreme leverage</b> (D/E &gt; 3.0) — balance-sheet score capped at 8/20.' : ''}
        </div>`
      : '';

    return `
      <div class="mod-panel hc-overall">
        <div class="mod-panel-title">
          FINANCIAL HEALTH · ${periodLabel}
          <span class="fin-stmt-toggles">
            <button class="fin-period-btn${period === 'annual' ? ' active' : ''}" data-period="annual">ANN</button>
            <button class="fin-period-btn${period === 'quarterly' ? ' active' : ''}" data-period="quarterly">QTR</button>
          </span>
        </div>
        <div class="hc-overall-grid">
          <div class="hc-total">
            <div class="hc-total-lbl">${period === 'annual' ? 'ANNUAL SCORE' : 'QUARTERLY SCORE'}</div>
            <div class="hc-total-val mono ${gradeCls}">${result.totalScore}<span class="hc-total-max">/${result.maxScore}</span></div>
            <div class="hc-total-sub mono">${pct}% · ${result.passCount} pass · ${result.warnCount} warn · ${result.failCount} fail</div>
          </div>
          <div class="hc-cat-strip">${catPills}</div>
        </div>
      </div>

      ${warnBanner}

      ${sections}
    `;
  }

  function renderReturns(d) {
    const rv = d.returns_vs_sp500?.periods || {};
    const periods = ['1y', '3y', '5y', '10y'];
    return `
      <div class="mod-panel">
        <div class="mod-panel-title">TOTAL RETURN · TICKER vs S&amp;P 500</div>
        <div class="tbl-wrap">
          <table class="tbl-dense">
            <thead><tr><th>PERIOD</th><th class="num" data-glossary="ticker-return">TICKER</th><th class="num">S&amp;P 500</th><th class="num">ALPHA</th></tr></thead>
            <tbody>
              ${periods.map((p) => {
                const r = rv[p] || {};
                return `<tr>
                  <td>${p.toUpperCase()}</td>
                  <td class="mono ${pctCls(r.stock)}">${r.stock != null ? (r.stock >= 0 ? '+' : '') + r.stock.toFixed(2) + '%' : '—'}</td>
                  <td class="mono ${pctCls(r.sp500)}">${r.sp500 != null ? (r.sp500 >= 0 ? '+' : '') + r.sp500.toFixed(2) + '%' : '—'}</td>
                  <td class="mono ${pctCls(r.alpha)}"><b>${r.alpha != null ? (r.alpha >= 0 ? '+' : '') + r.alpha.toFixed(2) + '%' : '—'}</b></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
      <div class="mod-panel">
        <div class="mod-panel-title">ALPHA · 4 PERIODS</div>
        <div class="fin-chart-wrap">${yearlyBars(periods.map(p => p.toUpperCase()), periods.map((p) => rv[p]?.alpha))}</div>
      </div>
    `;
  }

  /* ── Peers ─────────────────────────────────────────────────
     Extract the 18 comparison metrics from a financials JSON.
     Works for both the primary ticker and any peer fetched on demand.
     Direction is applied later (bigger-is-better vs smaller-is-better). */
  function extractPeerMetrics(fin) {
    const a = fin?.annual || {};
    const cs = fin?.capital_structure || {};
    const r = fin?.ratios || {};
    const prof = r.profitability || {};
    const latestIdx = (a.years || []).length - 1;
    const rIdx = (r.years || []).length - 1;
    const rvs = fin?.returns_vs_sp500?.periods?.['1y'] || {};
    const rev = a.revenue?.[latestIdx];
    const prevRev = latestIdx > 0 ? a.revenue?.[latestIdx - 1] : null;
    const revGrowth = (rev != null && prevRev != null && prevRev !== 0) ? (rev - prevRev) / Math.abs(prevRev) : null;
    return {
      symbol: fin?.ticker || '',
      name: fin?.profile?.name || fin?.ticker || '',
      marketCap:       cs.market_cap,
      revenue:         rev,
      revenueGrowth:   revGrowth,
      grossMargin:     a.gross_margin?.[latestIdx],
      operatingMargin: a.operating_margin?.[latestIdx],
      netMargin:       a.net_margin?.[latestIdx],
      fcfMargin:       a.fcf_margin?.[latestIdx],
      roe:             prof.roe?.[rIdx],
      roic:            prof.roic?.[rIdx],
      pe:              a.pe_ratio?.[latestIdx],
      ps:              a.ps_ratio?.[latestIdx],
      evEbitda:        a.ev_ebitda?.[latestIdx],
      divYield:        a.dividend_yield?.[latestIdx],
      debtEquity:      cs.debt_equity,
      return1y:        rvs.stock,
      alpha1y:         rvs.alpha,
    };
  }

  /* Metric definitions for the peer-comparison table.
     dir: +1 bigger-is-better, -1 smaller-is-better. */
  const PEER_METRICS = [
    { key: 'marketCap',       label: 'Market Cap',       section: 'Growth',        dir: +1, fmt: 'money' },
    { key: 'revenue',         label: 'Revenue',          section: 'Growth',        dir: +1, fmt: 'money' },
    { key: 'revenueGrowth',   label: 'Revenue Growth',   section: 'Growth',        dir: +1, fmt: 'pct',    glossary: 'Rev growth' },
    { key: 'grossMargin',     label: 'Gross Margin',     section: 'Profitability', dir: +1, fmt: 'pct',    glossary: 'Gross margin' },
    { key: 'operatingMargin', label: 'Operating Margin', section: 'Profitability', dir: +1, fmt: 'pct' },
    { key: 'netMargin',       label: 'Net Margin',       section: 'Profitability', dir: +1, fmt: 'pct',    glossary: 'Profit margin' },
    { key: 'fcfMargin',       label: 'FCF Margin',       section: 'Profitability', dir: +1, fmt: 'pct' },
    { key: 'roe',             label: 'ROE',              section: 'Returns',       dir: +1, fmt: 'pct',    glossary: 'ROE' },
    { key: 'roic',            label: 'ROIC',             section: 'Returns',       dir: +1, fmt: 'pct',    glossary: 'ROIC' },
    { key: 'pe',              label: 'P/E',              section: 'Valuation',     dir: -1, fmt: 'num',    glossary: 'P/E' },
    { key: 'ps',              label: 'P/S',              section: 'Valuation',     dir: -1, fmt: 'num',    glossary: 'P/S' },
    { key: 'evEbitda',        label: 'EV/EBITDA',        section: 'Valuation',     dir: -1, fmt: 'num',    glossary: 'EV/EBITDA' },
    { key: 'divYield',        label: 'Dividend Yield',   section: 'Valuation',     dir: +1, fmt: 'pct',    glossary: 'Div yield' },
    { key: 'debtEquity',      label: 'Debt / Equity',    section: 'Health',        dir: -1, fmt: 'num',    glossary: 'Debt/Eq' },
    { key: 'return1y',        label: '1Y Return',        section: 'Performance',   dir: +1, fmt: 'pctRaw' },
    { key: 'alpha1y',         label: '1Y Alpha',         section: 'Performance',   dir: +1, fmt: 'pctRaw' },
  ];

  function fmtPeerCell(val, fmt) {
    if (val == null || (typeof val === 'number' && isNaN(val))) return '—';
    if (fmt === 'money') return $money(val);
    if (fmt === 'pct')   return (val * 100).toFixed(2) + '%';
    if (fmt === 'pctRaw') return (val >= 0 ? '+' : '') + Number(val).toFixed(2) + '%';
    return Number(val).toFixed(2);
  }

  function renderPeers(d) {
    const suggested = d.peers || [];
    const selected = window._finSelectedPeers || (window._finSelectedPeers = suggested.slice(0, 3));
    return `
      <div class="mod-panel">
        <div class="mod-panel-title">PEERS · ADD UP TO 4 TICKERS TO COMPARE</div>
        <div class="fin-peer-controls">
          <div class="fin-peer-selected" id="fin-peer-selected">
            ${selected.length
              ? selected.map((t) => `<span class="fin-peer-chip-active">${t} <button class="fin-peer-remove" data-tk="${t}" title="Remove">×</button></span>`).join('')
              : '<span class="fin-peer-hint-inline">no peers selected · click a suggestion below or type a ticker</span>'}
          </div>
          <form class="fin-peer-add-form" id="fin-peer-add-form">
            <input class="fin-peer-add-input" id="fin-peer-add-input" placeholder="+ ticker" maxlength="8" autocomplete="off" spellcheck="false">
            <button type="submit" class="fin-peer-add-btn">ADD</button>
          </form>
        </div>
        <div class="fin-peer-suggested">
          <span class="fin-peer-suggest-lbl">suggested:</span>
          ${suggested.length
            ? suggested.map((t) => {
                const on = selected.includes(t);
                return `<button class="fin-peer-chip${on ? ' fin-peer-chip-on' : ''}" data-tk="${t}">${t}${on ? ' ✓' : ''}</button>`;
              }).join('')
            : '<span class="fin-peer-hint-inline">no FMP peers available for this ticker</span>'}
        </div>
      </div>

      <div class="mod-panel">
        <div class="mod-panel-title">COMPARISON · BEST-IN-CLASS HIGHLIGHTED</div>
        <div id="fin-peer-table-wrap" class="tbl-wrap">
          <div class="fin-peer-loading">Loading peer data…</div>
        </div>
      </div>
    `;
  }

  async function loadPeersTable(body, d) {
    const wrap = body.querySelector('#fin-peer-table-wrap');
    if (!wrap) return;
    const selected = window._finSelectedPeers || [];

    // Fetch peer financials in parallel. Graceful on partial failures.
    const peerResults = await Promise.allSettled(
      selected.map((t) => fetchJSON(finUrl(t, 'US'), { ttl: 10 * 60 * 1000 }))
    );
    const primary = extractPeerMetrics(d);
    const peerMetrics = peerResults.map((r, i) => {
      if (r.status === 'fulfilled') return extractPeerMetrics(r.value);
      return { symbol: selected[i], name: selected[i], __error: true };
    });
    const allColumns = [primary, ...peerMetrics];

    // Group metrics by section
    const bySection = {};
    PEER_METRICS.forEach((m) => {
      if (!bySection[m.section]) bySection[m.section] = [];
      bySection[m.section].push(m);
    });

    // Per-row best-in-class index
    function bestIdx(metric) {
      let bi = -1, bv = null;
      allColumns.forEach((col, i) => {
        const v = col[metric.key];
        if (v == null || typeof v !== 'number' || !isFinite(v)) return;
        if (bv == null || (metric.dir > 0 ? v > bv : v < bv)) { bv = v; bi = i; }
      });
      return bi;
    }

    const header = `<tr>
      <th class="fin-peer-metric-col">METRIC</th>
      ${allColumns.map((col, i) => `<th class="num${i === 0 ? ' latest-col' : ''}">${col.symbol || '—'}</th>`).join('')}
    </tr>`;

    const sections = Object.keys(bySection).map((section) => {
      const rows = bySection[section].map((metric) => {
        const best = bestIdx(metric);
        const labelAttr = metric.glossary ? ` data-glossary="${metric.glossary}"` : '';
        const cells = allColumns.map((col, i) => {
          const v = col[metric.key];
          const isBest = i === best && best >= 0;
          const dirCls = (metric.fmt === 'pct' || metric.fmt === 'pctRaw') ? pctCls(v) : '';
          return `<td class="mono ${dirCls}${i === 0 ? ' latest-col' : ''}${isBest ? ' fin-peer-best' : ''}"${isBest ? ' title="best in group"' : ''}>${fmtPeerCell(v, metric.fmt)}${isBest ? ' <span class="fin-peer-best-dot">●</span>' : ''}</td>`;
        }).join('');
        return `<tr><td class="fin-peer-metric-col"${labelAttr}>${metric.label}</td>${cells}</tr>`;
      }).join('');
      return `<tr class="fin-peer-section-head"><td colspan="${1 + allColumns.length}">${section.toUpperCase()}</td></tr>${rows}`;
    }).join('');

    wrap.innerHTML = `<table class="tbl-dense fin-peer-table">
      <thead>${header}</thead>
      <tbody>${sections}</tbody>
    </table>`;
  }

  function attachPeersUI(body, d) {
    // "add custom" form
    const form = body.querySelector('#fin-peer-add-form');
    if (form) form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const v = body.querySelector('#fin-peer-add-input')?.value?.trim().toUpperCase();
      if (!v) return;
      const sel = window._finSelectedPeers || [];
      if (sel.includes(v) || v === (d.ticker || '').toUpperCase()) return;
      if (sel.length >= 4) return;
      window._finSelectedPeers = [...sel, v];
      // Re-render peers tab
      const bodyEl = body.querySelector('#finBody');
      if (bodyEl) bodyEl.innerHTML = renderTab('peers', d);
      attachPeersUI(body, d);
      loadPeersTable(body, d);
    });
    // suggested-peer click toggle
    body.querySelectorAll('.fin-peer-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const t = btn.dataset.tk;
        const sel = window._finSelectedPeers || [];
        if (sel.includes(t)) {
          window._finSelectedPeers = sel.filter((x) => x !== t);
        } else {
          if (sel.length >= 4) return;
          window._finSelectedPeers = [...sel, t];
        }
        const bodyEl = body.querySelector('#finBody');
        if (bodyEl) bodyEl.innerHTML = renderTab('peers', d);
        attachPeersUI(body, d);
        loadPeersTable(body, d);
      });
    });
    // remove button
    body.querySelectorAll('.fin-peer-remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        const t = btn.dataset.tk;
        window._finSelectedPeers = (window._finSelectedPeers || []).filter((x) => x !== t);
        const bodyEl = body.querySelector('#finBody');
        if (bodyEl) bodyEl.innerHTML = renderTab('peers', d);
        attachPeersUI(body, d);
        loadPeersTable(body, d);
      });
    });
  }

  /* ── DCF ───────────────────────────────────────────────────
     Dual-model: FMP's Wall Street DCF vs your own model with 4 sliders
     (Growth · Fade · Terminal · WACC) + scenario buttons + 5×5 sensitivity.
     FMP data is fetched from /api/stock/{t}/fmp-dcf; user inputs drive a
     pure dcfCalc() that recomputes projections + fair value on any change. */
  function defaultDcfInputs(d) {
    const cs = d.capital_structure || {};
    const gr = d.growth_rates || {};
    const revGrowth5y = gr.revenue?.['5y'];
    return {
      baseFcfMode: 'latest',       // 'latest' | 'avg3y' | 'fmpNextYear'
      growthRate: revGrowth5y != null ? Math.max(-0.05, Math.min(0.25, revGrowth5y)) : 0.05,
      fadeRate: 0.10,
      terminalGrowth: 0.025,
      wacc: 0.09,
      years: 10,
    };
  }

  function resolveBaseFcf(d, mode, fmp) {
    const a = d.annual || {};
    const fcfs = a.free_cash_flow || [];
    const latest = fcfs.length ? fcfs[fcfs.length - 1] : null;
    if (mode === 'avg3y') {
      const tail = fcfs.slice(-3).filter((v) => typeof v === 'number');
      if (tail.length >= 2) return tail.reduce((s, v) => s + v, 0) / tail.length;
      return latest;
    }
    if (mode === 'fmpNextYear' && fmp && fmp.projections && fmp.projections[0]) {
      const v = fmp.projections[0].fcf;
      return typeof v === 'number' ? v : latest;
    }
    return latest;
  }

  function dcfCalc(d, inputs, fmp) {
    const cs = d.capital_structure || {};
    const a = d.annual || {};
    const shares = a.shares_outstanding?.[a.shares_outstanding.length - 1] || 0;
    // Convert financials from reporting currency to USD if needed
    const fxRate = (d.reporting_currency && d.reporting_currency !== 'USD' && d.usd_fx_rate)
      ? d.usd_fx_rate : 1.0;
    const debt = (cs.total_debt || 0) * fxRate;
    const cash = (cs.cash_and_investments || 0) * fxRate;

    const _rawFcf = resolveBaseFcf(d, inputs.baseFcfMode, fmp);
    if (_rawFcf == null) return null;
    // FMP projections are assumed already in USD; historical FCF needs conversion
    const baseFcf = inputs.baseFcfMode === 'fmpNextYear' ? _rawFcf : _rawFcf * fxRate;

    // Project years=N FCF growing at growthRate, fading each year toward terminalGrowth
    // at fadeRate. Growth_i = growth_{i-1} * (1 - fade) + terminal * fade.
    const rows = [];
    let fcf = baseFcf;
    let g = inputs.growthRate;
    let evDcf = 0;
    for (let i = 1; i <= inputs.years; i++) {
      fcf = fcf * (1 + g);
      const disc = Math.pow(1 + inputs.wacc, i);
      const pv = fcf / disc;
      evDcf += pv;
      rows.push({ year: i, growth: g, fcf, discount: disc, pv });
      // fade growth
      g = g * (1 - inputs.fadeRate) + inputs.terminalGrowth * inputs.fadeRate;
    }
    // Terminal value: Gordon growth at the end of projection
    const finalFcf = rows[rows.length - 1].fcf;
    const tvFcf = finalFcf * (1 + inputs.terminalGrowth);
    const tvRaw = tvFcf / (inputs.wacc - inputs.terminalGrowth);
    const tvDiscount = Math.pow(1 + inputs.wacc, inputs.years);
    const tvPv = inputs.wacc > inputs.terminalGrowth ? tvRaw / tvDiscount : null;
    const ev = evDcf + (tvPv || 0);
    const equity = ev - debt + cash;
    const fairValue = shares > 0 ? equity / shares : null;
    const compositionPct = ev > 0 ? (tvPv || 0) / ev * 100 : null;

    return { baseFcf, rows, tvPv, ev, equity, fairValue, compositionPct, shares, debt, cash };
  }

  function renderDCF(d) {
    const fmp = window._finDcfFmp || null;
    const inputs = window._finDcfInputs || (window._finDcfInputs = defaultDcfInputs(d));
    const result = dcfCalc(d, inputs, fmp);
    // Prefer FMP's stockPrice (USD) over market_cap/shares which returns JPY for foreign ADRs like SONY
    const curPrice = fmp?.stockPrice != null
      ? fmp.stockPrice
      : (d.capital_structure?.market_cap && d.annual?.shares_outstanding
          ? d.capital_structure.market_cap / (d.annual.shares_outstanding[d.annual.shares_outstanding.length - 1] || 1)
          : null);
    const upside = (result && curPrice) ? ((result.fairValue - curPrice) / curPrice) * 100 : null;
    const fmpUpside = (fmp && fmp.dcfValue && fmp.stockPrice) ? ((fmp.dcfValue - fmp.stockPrice) / fmp.stockPrice) * 100 : null;

    function verdict(upPct) {
      if (upPct == null) return { cls: '', txt: '—' };
      if (upPct >= 15)  return { cls: 'num-up',   txt: 'UNDERVALUED' };
      if (upPct <= -15) return { cls: 'num-dn',   txt: 'OVERVALUED' };
      return                  { cls: 'num-warn', txt: 'FAIR' };
    }
    const vFmp = verdict(fmpUpside);
    const vYou = verdict(upside);

    const gr = d.growth_rates?.revenue || {};
    const refGrowth = `1Y ${gr['1y']!=null?(gr['1y']*100).toFixed(1)+'%':'—'} · 3Y ${gr['3y']!=null?(gr['3y']*100).toFixed(1)+'%':'—'} · 5Y ${gr['5y']!=null?(gr['5y']*100).toFixed(1)+'%':'—'}`;

    const projRows = (result?.rows || []).map((r) => `
      <tr>
        <td class="mono">Y${r.year}</td>
        <td class="mono ${pctCls(r.growth)}">${(r.growth >= 0 ? '+' : '') + (r.growth * 100).toFixed(1)}%</td>
        <td class="mono">${$money(r.fcf)}</td>
        <td class="mono">${r.discount.toFixed(3)}</td>
        <td class="mono">${$money(r.pv)}</td>
      </tr>
    `).join('');

    // 5×5 sensitivity matrix
    const sensGrowthDelta = [-0.05, -0.025, 0, 0.025, 0.05];
    const sensWaccDelta = [-0.02, -0.01, 0, 0.01, 0.02];
    const sensRows = sensGrowthDelta.map((dg) => {
      const g = inputs.growthRate + dg;
      const cells = sensWaccDelta.map((dw) => {
        const w = inputs.wacc + dw;
        if (w <= inputs.terminalGrowth) return '<td class="mono">—</td>';
        const r = dcfCalc(d, { ...inputs, growthRate: g, wacc: w }, fmp);
        if (!r || r.fairValue == null) return '<td class="mono">—</td>';
        const isCenter = dg === 0 && dw === 0;
        const upP = curPrice ? ((r.fairValue - curPrice) / curPrice) * 100 : null;
        const cls = upP == null ? '' : upP >= 0 ? 'num-up' : 'num-dn';
        return `<td class="mono ${cls}${isCenter ? ' fin-dcf-sens-center' : ''}">$${r.fairValue.toFixed(2)}</td>`;
      }).join('');
      const gLbl = (g >= 0 ? '+' : '') + (g * 100).toFixed(1) + '%';
      return `<tr><th class="mono num">${gLbl}</th>${cells}</tr>`;
    }).join('');
    const sensHeader = sensWaccDelta.map((dw) => {
      const w = inputs.wacc + dw;
      return `<th class="num">${(w * 100).toFixed(1)}%</th>`;
    }).join('');

    const fxBadge = (d.reporting_currency && d.reporting_currency !== 'USD')
      ? `<div class="fin-dcf-fx-note">Financials in ${d.reporting_currency}${d.usd_fx_rate ? ' → USD @ ' + d.usd_fx_rate.toFixed(5) : ' · FX rate unavailable, Your Model disabled'}</div>`
      : '';

    return `
      ${fxBadge}
      <div class="fin-dcf-compare">
        <div class="fin-dcf-card fin-dcf-fmp">
          <div class="fin-dcf-card-lbl">WALL STREET DCF · FMP</div>
          <div class="fin-dcf-card-val mono">${fmp?.dcfValue != null ? '$' + fmp.dcfValue.toFixed(2) : 'loading…'}</div>
          <div class="fin-dcf-card-sub mono">WACC ${fmp?.wacc != null ? fmp.wacc.toFixed(2) + '%' : '—'} · terminal ${fmp?.terminalGrowth != null ? fmp.terminalGrowth.toFixed(2) + '%' : '—'} · β ${fmp?.beta != null ? fmp.beta.toFixed(2) : '—'}</div>
          <div class="fin-dcf-card-verdict mono ${vFmp.cls}">${fmpUpside != null ? (fmpUpside >= 0 ? '+' : '') + fmpUpside.toFixed(1) + '% · ' + vFmp.txt : '—'}</div>
        </div>

        <div class="fin-dcf-card fin-dcf-curprice">
          <div class="fin-dcf-card-lbl">CURRENT PRICE</div>
          <div class="fin-dcf-card-val mono">${curPrice != null ? '$' + curPrice.toFixed(2) : '—'}</div>
          <div class="fin-dcf-card-sub mono">shares ${result ? fmtCountCompact(result.shares) : '—'}</div>
        </div>

        <div class="fin-dcf-card fin-dcf-you">
          <div class="fin-dcf-card-lbl">YOUR MODEL</div>
          <div class="fin-dcf-card-val mono">${result?.fairValue != null ? '$' + result.fairValue.toFixed(2) : '—'}</div>
          <div class="fin-dcf-card-sub mono">WACC ${(inputs.wacc * 100).toFixed(1)}% · growth ${(inputs.growthRate * 100).toFixed(1)}% · tv ${(inputs.terminalGrowth * 100).toFixed(1)}%</div>
          <div class="fin-dcf-card-verdict mono ${vYou.cls}">${upside != null ? (upside >= 0 ? '+' : '') + upside.toFixed(1) + '% · ' + vYou.txt : '—'}</div>
        </div>
      </div>

      <div class="mod-panel">
        <div class="mod-panel-title">
          YOUR MODEL · INPUTS
          <span class="fin-stmt-toggles">
            <button class="fin-dcf-scn-btn" data-scn="bull">BULL</button>
            <button class="fin-dcf-scn-btn" data-scn="base">BASE</button>
            <button class="fin-dcf-scn-btn" data-scn="bear">BEAR</button>
            <button class="fin-dcf-scn-btn" data-scn="reset">RESET</button>
          </span>
        </div>
        <div class="fin-dcf-inputs">
          <div class="fin-dcf-input-row">
            <div class="fin-dcf-input-lbl">BASE FCF</div>
            <div class="fin-dcf-input-ctrl">
              <button class="fin-dcf-mode-btn${inputs.baseFcfMode === 'latest' ? ' active' : ''}"        data-fcfmode="latest">LATEST</button>
              <button class="fin-dcf-mode-btn${inputs.baseFcfMode === 'avg3y' ? ' active' : ''}"         data-fcfmode="avg3y">3Y AVG</button>
              <button class="fin-dcf-mode-btn${inputs.baseFcfMode === 'fmpNextYear' ? ' active' : ''}"   data-fcfmode="fmpNextYear"${fmp?.projections?.[0]?.fcf ? '' : ' disabled'}>FMP NEXT</button>
              <span class="fin-dcf-input-val mono">${result?.baseFcf != null ? $money(result.baseFcf) : '—'}</span>
            </div>
          </div>
          <div class="fin-dcf-input-row" data-glossary="GROWTH">
            <div class="fin-dcf-input-lbl">GROWTH RATE · year 1</div>
            <div class="fin-dcf-input-ctrl">
              <input type="range" class="fin-dcf-slider" data-slider="growthRate" min="-0.10" max="0.50" step="0.005" value="${inputs.growthRate}">
              <span class="fin-dcf-input-val mono">${(inputs.growthRate * 100).toFixed(1)}%</span>
            </div>
            <div class="fin-dcf-input-ref">hist. ${refGrowth}</div>
          </div>
          <div class="fin-dcf-input-row" data-glossary="FADE">
            <div class="fin-dcf-input-lbl">FADE RATE · per year</div>
            <div class="fin-dcf-input-ctrl">
              <input type="range" class="fin-dcf-slider" data-slider="fadeRate" min="0" max="0.30" step="0.01" value="${inputs.fadeRate}">
              <span class="fin-dcf-input-val mono">${(inputs.fadeRate * 100).toFixed(0)}%</span>
            </div>
            <div class="fin-dcf-input-ref">how fast growth converges to terminal</div>
          </div>
          <div class="fin-dcf-input-row" data-glossary="TGROWTH">
            <div class="fin-dcf-input-lbl">TERMINAL GROWTH</div>
            <div class="fin-dcf-input-ctrl">
              <input type="range" class="fin-dcf-slider" data-slider="terminalGrowth" min="0" max="0.05" step="0.0025" value="${inputs.terminalGrowth}">
              <span class="fin-dcf-input-val mono">${(inputs.terminalGrowth * 100).toFixed(2)}%</span>
            </div>
            <div class="fin-dcf-input-ref">long-run GDP-like growth · typically 2-3%</div>
          </div>
          <div class="fin-dcf-input-row" data-glossary="WACC">
            <div class="fin-dcf-input-lbl">WACC · discount rate</div>
            <div class="fin-dcf-input-ctrl">
              <input type="range" class="fin-dcf-slider" data-slider="wacc" min="0.05" max="0.20" step="0.0025" value="${inputs.wacc}">
              <span class="fin-dcf-input-val mono">${(inputs.wacc * 100).toFixed(2)}%</span>
            </div>
            <div class="fin-dcf-input-ref">FMP CAPM ${fmp?.wacc != null ? fmp.wacc.toFixed(2) + '%' : '—'}</div>
          </div>
        </div>
      </div>

      <div class="mod-panel">
        <div class="mod-panel-title">EV BRIDGE · COMPOSITION</div>
        <div class="fin-dcf-bridge">
          <div class="fin-dcf-bridge-row">
            <span>Enterprise Value</span><span class="mono">${result?.ev != null ? $money(result.ev) : '—'}</span>
          </div>
          <div class="fin-dcf-bridge-row">
            <span class="fin-dcf-bridge-sub">− Total Debt</span><span class="mono num-dn">-${$money(result?.debt || 0)}</span>
          </div>
          <div class="fin-dcf-bridge-row">
            <span class="fin-dcf-bridge-sub">+ Cash & Investments</span><span class="mono num-up">+${$money(result?.cash || 0)}</span>
          </div>
          <div class="fin-dcf-bridge-row fin-dcf-bridge-total">
            <span>Equity Value</span><span class="mono">${result?.equity != null ? $money(result.equity) : '—'}</span>
          </div>
          <div class="fin-dcf-bridge-row">
            <span class="fin-dcf-bridge-sub">÷ Shares Outstanding</span><span class="mono">${result ? fmtCountCompact(result.shares) : '—'}</span>
          </div>
          <div class="fin-dcf-bridge-row fin-dcf-bridge-total">
            <span>Fair Value / share</span><span class="mono ${vYou.cls}">${result?.fairValue != null ? '$' + result.fairValue.toFixed(2) : '—'}</span>
          </div>
        </div>
        <div class="fin-dcf-composition">
          <div class="fin-dcf-comp-lbl">Terminal Value represents <b>${result?.compositionPct != null ? result.compositionPct.toFixed(0) + '%' : '—'}</b> of enterprise value. The rest is the explicit ${inputs.years}-year projection.</div>
          <div class="fin-dcf-comp-bar">
            <div class="fin-dcf-comp-proj" style="width:${result?.compositionPct != null ? (100 - result.compositionPct).toFixed(1) : 50}%"></div>
            <div class="fin-dcf-comp-tv"   style="width:${result?.compositionPct != null ? result.compositionPct.toFixed(1) : 50}%"></div>
          </div>
          <div class="fin-dcf-comp-legend"><span><span class="fin-legend-swatch" style="background:var(--accent)"></span>projection (${inputs.years}y)</span><span><span class="fin-legend-swatch" style="background:#A78BFA"></span>terminal value</span></div>
        </div>
      </div>

      <div class="mod-panel">
        <div class="mod-panel-title">PROJECTION · ${inputs.years} YEARS</div>
        <div class="tbl-wrap">
          <table class="tbl-dense">
            <thead><tr><th>YEAR</th><th class="num">GROWTH</th><th class="num">FCF</th><th class="num">DISC FACTOR</th><th class="num">PRESENT VALUE</th></tr></thead>
            <tbody>
              ${projRows}
              <tr class="fin-row-parent">
                <td>TERMINAL</td>
                <td class="mono num-warn">${(inputs.terminalGrowth * 100).toFixed(2)}%</td>
                <td class="mono">—</td>
                <td class="mono">—</td>
                <td class="mono">${result?.tvPv != null ? $money(result.tvPv) : '—'}</td>
              </tr>
              <tr class="fin-row-parent fin-row-highlight">
                <td>TOTAL EV</td>
                <td class="mono">—</td><td class="mono">—</td><td class="mono">—</td>
                <td class="mono"><b>${result?.ev != null ? $money(result.ev) : '—'}</b></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="mod-panel">
        <div class="mod-panel-title">SENSITIVITY · GROWTH × WACC · current highlighted</div>
        <div class="tbl-wrap">
          <table class="tbl-dense fin-dcf-sens">
            <thead><tr><th>GROWTH\\WACC</th>${sensHeader}</tr></thead>
            <tbody>${sensRows}</tbody>
          </table>
        </div>
      </div>

      <div class="mod-panel">
        <div class="mod-panel-title">HOW TO READ THIS</div>
        <div class="fin-dcf-about">
          <p>A DCF projects future cash flows and discounts them back to today using WACC. The core tension is between the <b>explicit projection</b> (years 1-N, where growth is visible) and the <b>terminal value</b> (everything after year N, captured as a Gordon-growth perpetuity). When terminal value is more than ~70% of EV, small WACC or terminal-growth tweaks move the answer a lot — treat the fair value as a range, not a point.</p>
          <p>Use the sensitivity matrix to see how ± 2% WACC and ± 5pp growth swing the result. If the whole matrix stays above the current price, the stock is probably undervalued across reasonable assumptions. If the matrix straddles current price, you have no edge from DCF alone — look elsewhere.</p>
          <p>FMP's Wall Street DCF uses its own CAPM (cost of equity + tax-adjusted cost of debt) and 5-year analyst-style projections. Your Model uses a smoother fading-growth curve, which tends to be more conservative than Wall Street for growth companies and more aggressive for mature ones.</p>
        </div>
      </div>
    `;
  }

  function fmtCountCompact(v) {
    if (v == null || isNaN(v)) return '—';
    const abs = Math.abs(v);
    if (abs >= 1e9) return (v / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (abs >= 1e3) return (v / 1e3).toFixed(1) + 'K';
    return String(v);
  }

  function attachDCFUI(body, d) {
    // Scenario buttons
    body.querySelectorAll('.fin-dcf-scn-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const scn = btn.dataset.scn;
        const base = defaultDcfInputs(d);
        if (scn === 'bull') {
          window._finDcfInputs = { ...base, growthRate: base.growthRate + 0.05, fadeRate: 0.08, wacc: Math.max(0.07, base.wacc - 0.01) };
        } else if (scn === 'bear') {
          window._finDcfInputs = { ...base, growthRate: Math.max(-0.10, base.growthRate - 0.05), fadeRate: 0.15, wacc: base.wacc + 0.01 };
        } else {
          window._finDcfInputs = base;  // 'base' or 'reset'
        }
        rerenderDCF(body, d);
      });
    });
    // Base-FCF mode buttons
    body.querySelectorAll('.fin-dcf-mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.hasAttribute('disabled')) return;
        window._finDcfInputs = { ...(window._finDcfInputs || defaultDcfInputs(d)), baseFcfMode: btn.dataset.fcfmode };
        rerenderDCF(body, d);
      });
    });
    // Sliders — re-render on input (live) with debounce so it's not jank
    let rafPending = false;
    body.querySelectorAll('.fin-dcf-slider').forEach((slider) => {
      slider.addEventListener('input', () => {
        const key = slider.dataset.slider;
        const cur = window._finDcfInputs || defaultDcfInputs(d);
        window._finDcfInputs = { ...cur, [key]: Number(slider.value) };
        if (rafPending) return;
        rafPending = true;
        requestAnimationFrame(() => {
          rafPending = false;
          rerenderDCF(body, d);
        });
      });
    });
  }

  function rerenderDCF(body, d) {
    const bodyEl = body.querySelector('#finBody');
    if (bodyEl) bodyEl.innerHTML = renderTab('dcf', d);
    attachDCFUI(body, d);
  }

  async function loadFmpDcf(body, d, ticker) {
    try {
      const fmp = await fetchJSON(`${API}/${encodeURIComponent(ticker)}/fmp-dcf`, { ttl: 30 * 60 * 1000 });
      window._finDcfFmp = fmp;
      // Pre-populate WACC from FMP's CAPM value the first time (if user hasn't changed it)
      const defaultW = defaultDcfInputs(d).wacc;
      if (fmp?.wacc && fmp.wacc > 3 && fmp.wacc < 20 && window._finDcfInputs?.wacc === defaultW) {
        window._finDcfInputs.wacc = fmp.wacc / 100;
      }
    } catch (e) {
      window._finDcfFmp = null;
    }
    // Re-render only if DCF is still the active tab
    const activeTab = body.querySelector('.fin-subtab-btn.active')?.dataset.fintab;
    if (activeTab === 'dcf') rerenderDCF(body, d);
  }

  function renderTab(tab, d, period) {
    switch (tab) {
      case 'summary':   return renderSummary(d);
      case 'income':    return renderStatementTab(d, 'income',   period);
      case 'balance':   return renderStatementTab(d, 'balance',  period);
      case 'cashflow':  return renderStatementTab(d, 'cashflow', period);
      case 'ratios':    return renderRatios(d);
      case 'valuation': return renderValuation(d, window._finValMode || 'normalized');
      case 'health':    return renderHealth(d);
      case 'returns':   return renderReturns(d);
      case 'peers':     return renderPeers(d);
      case 'dcf':       return renderDCF(d);
      default:          return `<div class="mod-loading">Unknown tab: ${tab}</div>`;
    }
  }

  /* ── Error panel ─────────────────────────────────────────── */
  function renderFinError(body, sym, market, err) {
    const msg = (err && err.message) || String(err);
    const m = msg.match(/HTTP\s+(\d{3})/);
    const status = m ? Number(m[1]) : null;
    const isClientErr = status && status >= 400 && status < 500;  // 404/405 ≈ "no data for this"
    const isServerErr = status && status >= 500;
    const isNonUS = market && market !== 'US';

    let title, body_, fallback;
    if (isNonUS && isClientErr) {
      title = `FIN not available for ${market} tickers yet`;
      body_ = `
        The Financials module currently covers <b>US-listed equities only</b> (FMP data source).
        <br>Hong Kong (HK) and Canada (CA) tickers don't have multi-year financial statements wired in yet.
      `;
      fallback = `Use <a href="#" class="fin-fallback-eq">EQ (Stock Analysis)</a> for ${sym} — it supports HK and CA with basic technicals + price charts.`;
    } else if (isClientErr) {
      title = `No financial data for ${sym}`;
      body_ = `
        The backend couldn't find 10-year financials for this ticker. Common reasons:
        <ul style="margin: 8px 0 0 20px; padding: 0;">
          <li>Ticker is OTC / micro-cap and not covered by FMP</li>
          <li>Ticker was recently IPO'd or delisted</li>
          <li>Symbol is misspelled — try ${sym.replace(/[^A-Z]/g, '') || 'a valid US ticker'}</li>
        </ul>
      `;
      fallback = `Try a different ticker, or use <a href="#" class="fin-fallback-eq">EQ</a> which has broader coverage.`;
    } else if (isServerErr) {
      title = `Backend error fetching ${sym}`;
      body_ = `The stocks-api service returned ${status}. This is usually transient — the cache may rebuild in a minute.`;
      fallback = `<a href="#" class="fin-fallback-retry">Retry</a>, or use <a href="#" class="fin-fallback-eq">EQ</a> in the meantime.`;
    } else {
      title = `Failed to load ${sym}`;
      body_ = `Network error: ${msg.replace(/ — https?:.+$/, '')}`;
      fallback = `Check your connection and <a href="#" class="fin-fallback-retry">retry</a>.`;
    }

    body.innerHTML = `
      <div class="fin-head-row">
        <form class="stk-tickform" id="finForm">
          <input class="stk-tick-input" id="finTick" value="${sym}" maxlength="8" autocomplete="off" spellcheck="false">
          <select class="stk-market" id="finMarket">
            <option value="US" ${market==='US'?'selected':''}>US</option>
            <option value="HK" ${market==='HK'?'selected':''}>HK</option>
            <option value="CA" ${market==='CA'?'selected':''}>CA</option>
          </select>
          <button type="submit" class="stk-go">GO</button>
        </form>
      </div>
      <div class="mod-panel">
        <div class="fin-empty-panel">
          <div class="fin-empty-title">${title}</div>
          <div class="fin-empty-sub">${body_}</div>
          <div class="fin-empty-sub" style="margin-top: 12px; opacity: 0.9;">${fallback}</div>
        </div>
      </div>
    `;
    attachForm(body);
    const eqLink = body.querySelector('.fin-fallback-eq');
    if (eqLink) {
      eqLink.addEventListener('click', (ev) => {
        ev.preventDefault();
        if (window.OC_OPEN_MODULE) window.OC_OPEN_MODULE('stock-analysis', { ticker: sym, market });
      });
    }
    const retryLink = body.querySelector('.fin-fallback-retry');
    if (retryLink) {
      retryLink.addEventListener('click', (ev) => {
        ev.preventDefault();
        window.OC_DATA.invalidate(finUrl(sym, market));
        loadAndRender(body, sym, market);
      });
    }
  }

  /* ── Shell ───────────────────────────────────────────────── */
  async function loadAndRender(body, ticker, market, initialTab) {
    const sym = (ticker || 'AAPL').toUpperCase();
    market = market || 'US';
    const tab = initialTab || 'summary';
    if (window.OC_UPDATE_PANE_PARAMS) window.OC_UPDATE_PANE_PARAMS({ ticker: sym, market });

    body.innerHTML = `
      <div class="fin-head-row">
        <form class="stk-tickform" id="finForm">
          <input class="stk-tick-input" id="finTick" value="${sym}" maxlength="8" autocomplete="off" spellcheck="false">
          <select class="stk-market" id="finMarket">
            <option value="US" ${market==='US'?'selected':''}>US</option>
            <option value="HK" ${market==='HK'?'selected':''}>HK</option>
            <option value="CA" ${market==='CA'?'selected':''}>CA</option>
          </select>
          <button type="submit" class="stk-go">GO</button>
        </form>
        <div class="fin-head-meta">
          <span class="chip chip-dim" id="finMeta">loading ${sym}…</span>
          <a href="#" class="fin-open-eq"  data-tk="${sym}">Open in EQ ↗</a>
          <a href="#" class="fin-open-hld" data-tk="${sym}">Open in HLD ↗</a>
        </div>
      </div>
      <div class="mod-loading">Fetching ${sym} financials…</div>
    `;
    attachForm(body);

    let d;
    try {
      d = await fetchJSON(finUrl(sym, market), { ttl: 10 * 60 * 1000 });
    } catch (e) {
      renderFinError(body, sym, market, e);
      return;
    }

    const profile = d.profile || {};
    const metaParts = [
      profile.name || sym,
      profile.sector,
      profile.industry,
      profile.employees ? profile.employees.toLocaleString() + ' employees' : null,
    ].filter(Boolean).join(' · ');

    body.innerHTML = `
      <div class="fin-head-row">
        <form class="stk-tickform" id="finForm">
          <input class="stk-tick-input" id="finTick" value="${sym}" maxlength="8" autocomplete="off" spellcheck="false">
          <select class="stk-market" id="finMarket">
            <option value="US" ${market==='US'?'selected':''}>US</option>
            <option value="HK" ${market==='HK'?'selected':''}>HK</option>
            <option value="CA" ${market==='CA'?'selected':''}>CA</option>
          </select>
          <button type="submit" class="stk-go">GO</button>
        </form>
        <div class="fin-head-meta">
          <span class="chip" title="${metaParts}">${metaParts.length > 80 ? metaParts.slice(0, 78) + '…' : metaParts}</span>
          <span class="chip chip-dim">updated ${fmt.ago(d.fetched_at)}</span>
          <a href="#" class="fin-open-eq"  data-tk="${sym}">Open in EQ ↗</a>
          <a href="#" class="fin-open-hld" data-tk="${sym}">Open in HLD ↗</a>
        </div>
      </div>

      <div class="fin-subtabs" id="finSubtabs">
        ${TABS.map((t) => `<button class="fin-subtab-btn${t.id === tab ? ' active' : ''}" data-fintab="${t.id}">${t.label}</button>`).join('')}
      </div>

      <div class="fin-body" id="finBody">${renderTab(tab, d)}</div>
    `;

    attachForm(body);
    attachSubTabs(body, d);
    attachEqLink(body, sym, market);
    attachStatementToggles(body, d);
    attachPeerClicks(body);
    attachHealthHandlers(body, d);
    attachValuationHandlers(body, d);
    if (tab === 'peers') {
      attachPeersUI(body, d);
      loadPeersTable(body, d);
    }
    if (tab === 'dcf') {
      attachDCFUI(body, d);
      loadFmpDcf(body, d, sym);
    }
    if (tab === 'summary') {
      loadFinAnalystKpi(body, sym);
    }
  }

  /* ── Async populate the ANALYST CONSENSUS KPI tile on the summary tab ── */
  async function loadFinAnalystKpi(body, ticker) {
    const tile = body.querySelector('#finAnalystKpi');
    if (!tile) return;
    let a = null;
    try {
      const resp = await fetch(`https://stocks.clawmo.tech/data/analyst/${ticker}.json`, { cache: 'no-cache' });
      if (resp.ok) a = await resp.json();
    } catch (e) {}
    if (!a) {
      tile.innerHTML = `
        <div class="fin-kpi-lbl">ANALYST CONSENSUS</div>
        <div class="fin-kpi-val mono" style="color:var(--fg-faint);font-size:14px">—</div>
        <div class="fin-kpi-sub mono" style="color:var(--fg-faint)">no coverage</div>`;
      return;
    }
    const c = a.consensus || {}, pt = a.price_target || {};
    const lblColor = c.score >= 4.0 ? '#4ade80' : c.score >= 3.0 ? '#facc15' : '#f87171';
    const retClr = pt.return_potential_pct == null ? 'var(--fg-dim)'
                : pt.return_potential_pct >= 0 ? '#4ade80' : '#f87171';
    const retTxt = pt.return_potential_pct != null
      ? (pt.return_potential_pct >= 0 ? '+' : '') + pt.return_potential_pct.toFixed(1) + '%'
      : '—';
    tile.innerHTML = `
      <div class="fin-kpi-lbl">ANALYST CONSENSUS</div>
      <div class="fin-kpi-val mono" style="color:${lblColor};font-size:15px" title="Score ${c.score != null ? c.score.toFixed(2) : '—'}/5 · ${c.n_analysts || 0} analysts">${c.label || '—'}</div>
      <div class="fin-kpi-sub mono" title="Median 12-month target / current">${pt.median != null ? '$' + pt.median.toFixed(2) : '—'} <span style="color:${retClr}">${retTxt}</span> · n=${c.n_analysts || 0}</div>`;
  }

  function attachForm(body) {
    const form = body.querySelector('#finForm');
    if (!form) return;
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const t = (body.querySelector('#finTick')?.value || '').trim().toUpperCase();
      const mk = body.querySelector('#finMarket')?.value || 'US';
      if (!t) return;
      loadAndRender(body, t, mk);
    });
  }

  function attachSubTabs(body, d) {
    body.querySelectorAll('.fin-subtab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.fintab;
        // Read period BEFORE re-render so Health QTR/ANN carries into the statement tab
        const { period } = currentStatementState(body);
        body.querySelectorAll('.fin-subtab-btn').forEach((b) => b.classList.toggle('active', b === btn));
        const bodyEl = body.querySelector('#finBody');
        // Cancel any pending highlight-remove timer (its rows are about to be wiped)
        if (body._hcTimeout) { clearTimeout(body._hcTimeout); body._hcTimeout = null; }
        if (bodyEl) bodyEl.innerHTML = renderTab(tab, d, period);
        attachStatementToggles(body, d);
        attachPeerClicks(body);
        attachHealthHandlers(body, d);
        attachValuationHandlers(body, d);
        if (tab === 'peers') {
          attachPeersUI(body, d);
          loadPeersTable(body, d);
        }
        if (tab === 'dcf') {
          attachDCFUI(body, d);
          const sym = body.querySelector('#finTick')?.value?.trim().toUpperCase() || '';
          if (sym) loadFmpDcf(body, d, sym);
        }
      });
    });
  }

  function attachValuationHandlers(body, d) {
    body.querySelectorAll('.fin-val-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        window._finValMode = btn.dataset.valmode;
        // Only re-render if we're actually on the valuation sub-tab
        const activeTab = body.querySelector('.fin-subtab-btn.active')?.dataset.fintab;
        if (activeTab !== 'valuation') return;
        const bodyEl = body.querySelector('#finBody');
        if (bodyEl) bodyEl.innerHTML = renderTab('valuation', d);
        attachValuationHandlers(body, d);
      });
    });
  }

  function attachHealthHandlers(body, d) {
    // Row head click → toggle accordion (don't toggle when clicking the button)
    body.querySelectorAll('.hc-row-head[data-expandable="1"]').forEach((head) => {
      head.addEventListener('click', (ev) => {
        if (ev.target.closest('.hc-show-btn') || ev.target.closest('a')) return;
        const row = head.closest('.hc-row');
        if (row) row.classList.toggle('hc-open');
      });
    });
    // Primary "Show in Statements" button
    body.querySelectorAll('.hc-show-btn').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const stmt = btn.dataset.primaryStmt;
        const fields = (btn.dataset.fields || '').split(',').filter(Boolean);
        const highlights = fields.map((f) => ({ stmt, field: f }));
        switchTabAndHighlight(body, d, highlights);
      });
    });
    // Secondary "Also on X: field ↗" links
    body.querySelectorAll('.hc-show-secondary').forEach((a) => {
      a.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        switchTabAndHighlight(body, d, [{ stmt: a.dataset.stmt, field: a.dataset.field }]);
      });
    });
  }

  function currentStatementState(body) {
    const activeTab = body.querySelector('.fin-subtab-btn.active')?.dataset.fintab;
    const mode   = body.querySelector('.fin-mode-btn.active')?.dataset.mode   || 'dollar';
    const period = body.querySelector('.fin-period-btn.active')?.dataset.period || 'annual';
    return { activeTab, mode, period };
  }

  function attachStatementToggles(body, d) {
    // Period: ANN / QTR — changes BOTH the chart above and the table below,
    // since the bar-chart headline series length differs (10y vs 8q).
    body.querySelectorAll('.fin-period-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const { activeTab, mode } = currentStatementState(body);
        const period = btn.dataset.period;
        const bodyEl = body.querySelector('#finBody');
        if (['income', 'balance', 'cashflow'].includes(activeTab)) {
          if (bodyEl) bodyEl.innerHTML = renderStatementTab(d, activeTab, period, mode);
          attachStatementToggles(body, d);
        } else if (activeTab === 'health') {
          if (bodyEl) bodyEl.innerHTML = renderHealth(d, period);
          attachStatementToggles(body, d);
          attachHealthHandlers(body, d);
        }
      });
    });
    // Mode: $ / YoY % — keeps the chart as-is, swaps only the table body.
    body.querySelectorAll('.fin-mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const { activeTab, period } = currentStatementState(body);
        if (!['income', 'balance', 'cashflow'].includes(activeTab)) return;
        const mode = btn.dataset.mode;
        const { lines, data: stmtData } = statementFor(d, activeTab, period);
        const wrap = body.querySelector('#fin-stmt-wrap');
        if (wrap) wrap.innerHTML = renderStatementTable(lines, stmtData, { mode, period });
        body.querySelectorAll('.fin-mode-btn').forEach((b) => b.classList.toggle('active', b === btn));
      });
    });
  }

  function attachEqLink(body, sym, market) {
    const a = body.querySelector('.fin-open-eq');
    if (a) {
      a.addEventListener('click', (ev) => {
        ev.preventDefault();
        if (window.OC_OPEN_MODULE) window.OC_OPEN_MODULE('stock-analysis', { ticker: sym, market });
      });
    }
    const h = body.querySelector('.fin-open-hld');
    if (h) {
      h.addEventListener('click', (ev) => {
        ev.preventDefault();
        if (window.OC_OPEN_MODULE) window.OC_OPEN_MODULE('holdings', { ticker: sym, market });
      });
    }
  }

  function attachPeerClicks(body) {
    body.querySelectorAll('.fin-peer-pill').forEach((a) => {
      a.addEventListener('click', (ev) => {
        ev.preventDefault();
        const t = a.dataset.tk;
        if (t && window.OC_OPEN_MODULE) window.OC_OPEN_MODULE('financials', { ticker: t });
      });
    });
  }

  async function render(body, ctx) {
    const p = ctx?.params || {};
    await loadAndRender(body, p.ticker, p.market, p.tab);
  }

  window.OC_MODULES = window.OC_MODULES || {};
  window.OC_MODULES['financials'] = { render };
})();
