/* terminal.clawmo.tech — Health Check engine
   Ported from stocks.clawmo.tech app.js runHealthChecks (2026-04-20).
   Pure function: takes the /api/stock/{t}/financials JSON + mode
   ('annual' | 'quarterly') and returns a scored health report.

   Each check contributes 0-4 points; each category caps at 20.
   Five categories: earnings, balance, cashflow, dividend, growth.
   Total max score: 100. */
(function (g) {
  'use strict';

  function getField(obj, f) { return obj && obj[f] != null ? obj[f] : null; }
  function yoyDelta(curr, prev) {
    return prev && prev !== 0 ? (curr - prev) / Math.abs(prev) : null;
  }
  function fmtCurrency(v) {
    if (v == null || isNaN(v)) return '—';
    const abs = Math.abs(v);
    const sign = v < 0 ? '-$' : '$';
    if (abs >= 1e12) return sign + (abs / 1e12).toFixed(2) + 'T';
    if (abs >= 1e9)  return sign + (abs / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6)  return sign + (abs / 1e6).toFixed(1) + 'M';
    if (abs >= 1e3)  return sign + (abs / 1e3).toFixed(1) + 'K';
    return sign + abs.toFixed(2);
  }

  function runHealthChecks(data, mode) {
    mode = mode || 'annual';
    const stmts = data.statements || {};
    let incA, balA, cfA;
    if (mode === 'quarterly') {
      incA = (stmts.income_statement || {}).quarterly || [];
      balA = (stmts.balance_sheet || {}).quarterly || [];
      cfA  = (stmts.cash_flow || {}).quarterly || [];
    } else {
      incA = (stmts.income_statement || {}).annual || [];
      balA = (stmts.balance_sheet || {}).annual || [];
      cfA  = (stmts.cash_flow || {}).annual || [];
    }
    const ps = data.per_share || {};
    const sector = (data.profile || {}).sector || '';
    const isFinancial = sector === 'Financial Services';

    if (!incA.length || !balA.length || !cfA.length) return null;

    const latest = { inc: incA[incA.length - 1], bal: balA[balA.length - 1], cf: cfA[cfA.length - 1] };
    const prior = {
      inc: incA.length > 1 ? incA[incA.length - 2] : null,
      bal: balA.length > 1 ? balA[balA.length - 2] : null,
      cf:  cfA.length > 1 ? cfA[cfA.length - 2] : null,
    };

    const dps = ps.dividend_per_share || [];
    const latestDPS = dps.length > 1 ? dps[dps.length - 1] : null;
    const paysDividend = latestDPS != null && latestDPS > 0.001;

    const latestEquity = getField(latest.bal, 'totalStockholdersEquity');
    const hasNegativeEquity = latestEquity != null && latestEquity <= 0;

    const checks = [];
    function addCheck(id, category, title, scoreFn, why, what, highlights) {
      const result = scoreFn();
      if (result === null) return;
      checks.push({
        id, category, title,
        status: result.status, score: result.score,
        detail: result.detail || '',
        why, what,
        highlights: highlights || [],
      });
    }

    /* ── Earnings Quality ── */
    addCheck(1, 'earnings', 'Operating Cash Flow vs Net Income', function () {
      const ocf = getField(latest.cf, 'operatingCashFlow'), ni = getField(latest.inc, 'netIncome');
      if (ocf == null || ni == null) return null;
      const d = 'OCF: ' + fmtCurrency(ocf) + ' vs NI: ' + fmtCurrency(ni);
      if (ni > 0 && ocf > ni) return { score: 4, status: 'pass', detail: d };
      if (ni > 0 && ocf > 0.7 * ni) return { score: 2, status: 'warn', detail: d };
      return { score: 0, status: 'fail', detail: d };
    },
    'If a company reports high profits but doesn\'t generate matching cash, the earnings may be inflated by accounting entries. Real profits produce real cash.',
    'Look at the trend over 3-5 years. A single year gap may be timing. A persistent gap is a red flag.',
    [{ stmt: 'cashflow', field: 'operatingCashFlow' }, { stmt: 'income', field: 'netIncome' }]);

    addCheck(2, 'earnings', 'Accruals Ratio', function () {
      const ocf = getField(latest.cf, 'operatingCashFlow'), ni = getField(latest.inc, 'netIncome'), ta = getField(latest.bal, 'totalAssets');
      if (ocf == null || ni == null || ta == null || ta === 0) return null;
      const accruals = Math.abs(ni - ocf) / ta;
      const d = 'Accruals: ' + (accruals * 100).toFixed(1) + '% of total assets';
      if (accruals < 0.05) return { score: 4, status: 'pass', detail: d };
      if (accruals < 0.10) return { score: 2, status: 'warn', detail: d };
      return { score: 0, status: 'fail', detail: d };
    },
    'Accruals measure the gap between reported earnings and actual cash. High accruals suggest profits are more "on paper" than in the bank.',
    'Compare accruals ratio over multiple years. A sudden spike warrants investigation into which accounting items changed.',
    [{ stmt: 'cashflow', field: 'operatingCashFlow' }, { stmt: 'income', field: 'netIncome' }]);

    addCheck(3, 'earnings', 'Revenue Quality (Receivables vs Revenue)', function () {
      const rev = getField(latest.inc, 'revenue'), prevRev = prior.inc ? getField(prior.inc, 'revenue') : null;
      const rec = getField(latest.bal, 'netReceivables'), prevRec = prior.bal ? getField(prior.bal, 'netReceivables') : null;
      if (rev == null || prevRev == null || rec == null || prevRec == null || prevRev === 0 || prevRec === 0) return null;
      const revGr = yoyDelta(rev, prevRev), recGr = yoyDelta(rec, prevRec);
      const ratio = recGr != null && revGr != null && revGr !== 0 ? recGr / revGr : null;
      const d = 'Receivables ' + ((recGr >= 0 ? '+' : '') + (recGr * 100).toFixed(1)) + '% vs Revenue ' + ((revGr >= 0 ? '+' : '') + (revGr * 100).toFixed(1)) + '%';
      if (ratio == null) return null;
      if (ratio <= 1.0) return { score: 4, status: 'pass', detail: d };
      if (ratio <= 1.5) return { score: 2, status: 'warn', detail: d };
      return { score: 0, status: 'fail', detail: d };
    },
    'When receivables grow much faster than revenue, it may mean the company is selling to customers who can\'t pay, or booking revenue prematurely.',
    'Check if this is a one-time spike (large contract) or a persistent trend. Look at days-sales-outstanding if available.',
    [{ stmt: 'income', field: 'revenue' }, { stmt: 'balance', field: 'netReceivables' }]);

    addCheck(4, 'earnings', 'Consistent Positive Net Income', function () {
      let count = 0;
      const total = Math.min(5, incA.length);
      for (let i = incA.length - 1; i >= Math.max(0, incA.length - 5); i--) {
        if (getField(incA[i], 'netIncome') > 0) count++;
      }
      const d = count + ' of last ' + total + ' years profitable';
      if (count >= total) return { score: 4, status: 'pass', detail: d };
      if (count >= total - 1) return { score: 2, status: 'warn', detail: d };
      return { score: 0, status: 'fail', detail: d };
    },
    'Consistent profitability shows a reliable business model. Frequent losses indicate the company struggles to earn money.',
    'Check if losses were due to one-time charges (restructuring, write-downs) or recurring operational issues.',
    [{ stmt: 'income', field: 'netIncome' }]);

    addCheck(5, 'earnings', 'Effective Tax Rate Stability', function () {
      const tax = getField(latest.inc, 'incomeTaxExpense'), pretax = getField(latest.inc, 'incomeBeforeTax');
      if (tax == null || pretax == null || pretax === 0) return null;
      const rate = tax / pretax;
      const d = 'Effective tax rate: ' + (rate * 100).toFixed(1) + '%';
      if (rate < 0) return { score: 0, status: 'fail', detail: d + ' (negative)' };
      if (rate >= 0.15 && rate <= 0.35) return { score: 4, status: 'pass', detail: d };
      return { score: 2, status: 'warn', detail: d + ' (outside 15-35% range)' };
    },
    'Unusual tax rates can signal one-time events or aggressive tax strategies. A suddenly low tax rate might flatter earnings temporarily.',
    'Compare the tax rate over 3-5 years. Large swings often relate to tax credits, loss carryforwards, or jurisdictional shifts.',
    [{ stmt: 'income', field: 'incomeTaxExpense' }, { stmt: 'income', field: 'incomeBeforeTax' }]);

    /* ── Balance Sheet Strength ── */
    if (!isFinancial) {
      addCheck(6, 'balance', 'Current Ratio', function () {
        const ca = getField(latest.bal, 'totalCurrentAssets'), cl = getField(latest.bal, 'totalCurrentLiabilities');
        if (ca == null || cl == null || cl === 0) return null;
        const r = ca / cl;
        const d = 'Current ratio: ' + r.toFixed(2) + 'x';
        if (r >= 1.5) return { score: 4, status: 'pass', detail: d };
        if (r >= 1.0) return { score: 2, status: 'warn', detail: d };
        return { score: 0, status: 'fail', detail: d };
      },
      'The current ratio measures whether a company can pay its bills due within 12 months. Below 1.0 means a liquidity crisis risk.',
      'Look at the trend. A declining current ratio even above 1.0 may signal deteriorating liquidity.',
      [{ stmt: 'balance', field: 'totalCurrentAssets' }, { stmt: 'balance', field: 'totalCurrentLiabilities' }]);
    }

    addCheck(7, 'balance', 'Debt-to-Equity Ratio', function () {
      const debt = getField(latest.bal, 'totalDebt'), eq = getField(latest.bal, 'totalStockholdersEquity');
      if (debt == null || eq == null) return null;
      if (eq <= 0) return { score: 0, status: 'fail', detail: 'Negative equity (' + fmtCurrency(eq) + ') — D/E not meaningful' };
      const r = debt / eq;
      const d = 'D/E: ' + r.toFixed(2) + ' (Debt: ' + fmtCurrency(debt) + ', Equity: ' + fmtCurrency(eq) + ')';
      if (r < 0.5) return { score: 4, status: 'pass', detail: d };
      if (r <= 1.0) return { score: 2, status: 'warn', detail: d };
      return { score: 0, status: 'fail', detail: d };
    },
    'High debt amplifies both gains and losses. D/E over 1.0 means the company owes more than its net worth.',
    'Some industries (utilities, REITs) naturally carry higher debt. Compare to sector peers.',
    [{ stmt: 'balance', field: 'totalDebt' }, { stmt: 'balance', field: 'totalStockholdersEquity' }]);

    addCheck(8, 'balance', 'Interest Coverage', function () {
      const oi = getField(latest.inc, 'operatingIncome'), ie = getField(latest.inc, 'interestExpense');
      if (oi == null || ie == null || ie === 0) return { score: 4, status: 'pass', detail: 'No interest expense' };
      const r = oi / ie;
      const d = 'Interest coverage: ' + r.toFixed(1) + 'x';
      if (r > 8) return { score: 4, status: 'pass', detail: d };
      if (r >= 3) return { score: 2, status: 'warn', detail: d };
      return { score: 0, status: 'fail', detail: d };
    },
    'Interest coverage shows how easily a company can pay its debt interest. Below 3x is dangerous — a small earnings dip could make debt unserviceable.',
    'Watch the trend. Declining coverage even if above 3x signals growing debt burden.',
    [{ stmt: 'income', field: 'operatingIncome' }, { stmt: 'income', field: 'interestExpense' }]);

    addCheck(9, 'balance', 'Debt Trend', function () {
      const curr = getField(latest.bal, 'totalDebt'), prev = prior.bal ? getField(prior.bal, 'totalDebt') : null;
      if (curr == null || prev == null || prev === 0) return null;
      const ch = yoyDelta(curr, prev);
      const d = 'Debt ' + (ch >= 0 ? '+' : '') + (ch * 100).toFixed(1) + '% YoY (' + fmtCurrency(prev) + ' → ' + fmtCurrency(curr) + ')';
      if (ch <= 0) return { score: 4, status: 'pass', detail: d };
      if (ch < 0.10) return { score: 2, status: 'warn', detail: d };
      return { score: 0, status: 'fail', detail: d };
    },
    'Rapidly growing debt suggests the company is borrowing to fund operations — an unsustainable pattern.',
    'Is the debt funding growth (CapEx, acquisitions) or covering losses? Check the cash flow statement.',
    [{ stmt: 'balance', field: 'totalDebt' }]);

    if (!isFinancial) {
      addCheck(10, 'balance', 'Goodwill-to-Assets', function () {
        const gw = getField(latest.bal, 'goodwill'), ta = getField(latest.bal, 'totalAssets');
        if (gw == null || ta == null || ta === 0) return null;
        if (gw === 0) return { score: 4, status: 'pass', detail: 'No goodwill' };
        const r = gw / ta;
        const d = 'Goodwill: ' + (r * 100).toFixed(1) + '% of assets (' + fmtCurrency(gw) + ')';
        if (r < 0.20) return { score: 4, status: 'pass', detail: d };
        if (r < 0.40) return { score: 2, status: 'warn', detail: d };
        return { score: 0, status: 'fail', detail: d };
      },
      'High goodwill means the company paid a premium for acquisitions. If those underperform, massive write-downs can destroy equity.',
      'Check if goodwill has been impaired (written down) recently. Look at acquisitions history.',
      [{ stmt: 'balance', field: 'goodwill' }, { stmt: 'balance', field: 'totalAssets' }]);
    }

    /* ── Cash Flow Health ── */
    addCheck(11, 'cashflow', 'Free Cash Flow Positive', function () {
      let count = 0;
      const total = Math.min(3, cfA.length);
      for (let i = cfA.length - 1; i >= Math.max(0, cfA.length - 3); i--) {
        if (getField(cfA[i], 'freeCashFlow') > 0) count++;
      }
      const d = 'FCF positive ' + count + ' of last ' + total + ' years';
      if (count >= total) return { score: 4, status: 'pass', detail: d };
      if (count >= 1) return { score: 2, status: 'warn', detail: d };
      return { score: 0, status: 'fail', detail: d };
    },
    'Free cash flow is the cash left after running the business. Negative FCF means the company is burning cash.',
    'Is negative FCF due to heavy investment (growth CapEx) or operational weakness? Check CapEx ratio.',
    [{ stmt: 'cashflow', field: 'freeCashFlow' }]);

    addCheck(12, 'cashflow', 'FCF Trend', function () {
      const curr = getField(latest.cf, 'freeCashFlow'), prev = prior.cf ? getField(prior.cf, 'freeCashFlow') : null;
      if (curr == null || prev == null || prev === 0) return null;
      const ch = yoyDelta(curr, prev);
      const d = 'FCF ' + (ch >= 0 ? '+' : '') + (ch * 100).toFixed(1) + '% YoY';
      if (ch > 0.05) return { score: 4, status: 'pass', detail: d };
      if (ch >= -0.05) return { score: 2, status: 'warn', detail: d };
      return { score: 0, status: 'fail', detail: d };
    },
    'Growing FCF means the company is becoming a better cash machine. Shrinking FCF is an early warning.',
    'One-year FCF dips can be caused by lumpy CapEx or working capital swings. Look at 3-year trend.',
    [{ stmt: 'cashflow', field: 'freeCashFlow' }]);

    addCheck(13, 'cashflow', 'CapEx-to-OCF Ratio', function () {
      const capex = getField(latest.cf, 'capitalExpenditure'), ocf = getField(latest.cf, 'operatingCashFlow');
      if (capex == null || ocf == null || ocf === 0) return null;
      const r = Math.abs(capex) / ocf;
      const d = 'CapEx uses ' + (r * 100).toFixed(0) + '% of operating cash flow';
      if (r < 0.40) return { score: 4, status: 'pass', detail: d };
      if (r < 0.70) return { score: 2, status: 'warn', detail: d };
      return { score: 0, status: 'fail', detail: d };
    },
    'When CapEx consumes most of operating cash flow, there\'s little left for shareholders.',
    'High CapEx can be fine for growth companies (AMZN). For mature companies it\'s concerning.',
    [{ stmt: 'cashflow', field: 'capitalExpenditure' }, { stmt: 'cashflow', field: 'operatingCashFlow' }]);

    addCheck(14, 'cashflow', 'Stock-Based Compensation', function () {
      const sbc = getField(latest.cf, 'stockBasedCompensation'), rev = getField(latest.inc, 'revenue');
      if (sbc == null || rev == null || rev === 0) return null;
      const r = sbc / rev;
      const d = 'SBC: ' + (r * 100).toFixed(1) + '% of revenue (' + fmtCurrency(sbc) + ')';
      if (r < 0.05) return { score: 4, status: 'pass', detail: d };
      if (r < 0.15) return { score: 2, status: 'warn', detail: d };
      return { score: 0, status: 'fail', detail: d };
    },
    'Stock-based compensation dilutes existing shareholders. Many tech companies give 10-20% of revenue in stock to employees.',
    'Compare SBC to total compensation expense. Also check if share count is growing (dilution) or shrinking (buybacks offset).',
    [{ stmt: 'cashflow', field: 'stockBasedCompensation' }, { stmt: 'income', field: 'revenue' }]);

    addCheck(15, 'cashflow', 'OCF-to-Debt Coverage', function () {
      const ocf = getField(latest.cf, 'operatingCashFlow'), debt = getField(latest.bal, 'totalDebt');
      if (ocf == null || debt == null) return null;
      if (debt === 0) return { score: 4, status: 'pass', detail: 'No debt' };
      const r = ocf / debt;
      const d = 'OCF covers ' + (r * 100).toFixed(0) + '% of total debt per year';
      if (r > 0.25) return { score: 4, status: 'pass', detail: d };
      if (r > 0.10) return { score: 2, status: 'warn', detail: d };
      return { score: 0, status: 'fail', detail: d };
    },
    'This measures how many years of cash flow it would take to pay off all debt. OCF < 10% of debt means 10+ years.',
    'Combine with interest coverage. A company can have low OCF/Debt but still be fine if refinancing is easy.',
    [{ stmt: 'cashflow', field: 'operatingCashFlow' }, { stmt: 'balance', field: 'totalDebt' }]);

    /* ── Dividend Safety (conditional) ── */
    if (paysDividend) {
      const latestFCFps = ps.fcf_per_share && ps.fcf_per_share.length > 1 ? ps.fcf_per_share[ps.fcf_per_share.length - 1] : null;
      const latestEPS = ps.eps_diluted && ps.eps_diluted.length > 1 ? ps.eps_diluted[ps.eps_diluted.length - 1] : null;

      addCheck(16, 'dividend', 'Dividend Coverage (FCF)', function () {
        if (latestFCFps == null || latestDPS == null || latestDPS === 0) return null;
        const r = latestFCFps / latestDPS;
        const d = 'FCF/Share: $' + latestFCFps.toFixed(2) + ' vs DPS: $' + latestDPS.toFixed(2) + ' (' + r.toFixed(1) + 'x coverage)';
        if (r > 1.5) return { score: 4, status: 'pass', detail: d };
        if (r >= 1.0) return { score: 2, status: 'warn', detail: d };
        return { score: 0, status: 'fail', detail: d };
      },
      'When dividends exceed free cash flow, the company must borrow or sell assets to pay shareholders. Not sustainable.',
      'Look at the trend — is FCF/share growing or shrinking? If growing, the gap may close.',
      [{ stmt: 'cashflow', field: 'freeCashFlow' }]);

      addCheck(17, 'dividend', 'Dividend Coverage (Earnings)', function () {
        if (latestEPS == null || latestDPS == null || latestDPS === 0) return null;
        const r = latestEPS / latestDPS;
        const d = 'EPS: $' + latestEPS.toFixed(2) + ' vs DPS: $' + latestDPS.toFixed(2) + ' (' + r.toFixed(1) + 'x coverage)';
        if (r > 1.5) return { score: 4, status: 'pass', detail: d };
        if (r >= 1.0) return { score: 2, status: 'warn', detail: d };
        return { score: 0, status: 'fail', detail: d };
      },
      'If even earnings can\'t cover the dividend, a cut is almost certain.',
      'Earnings include non-cash items. FCF coverage is a better measure.',
      [{ stmt: 'income', field: 'netIncome' }]);

      addCheck(18, 'dividend', 'Dividend Growth Consistency', function () {
        const years = Math.min(5, dps.length - 1);
        if (years < 2) return null;
        let streak = 0;
        for (let i = dps.length - 1; i >= dps.length - years + 1 && i >= 2; i--) {
          if (dps[i] > dps[i - 1] && dps[i - 1] > 0) streak++; else break;
        }
        const d = streak + ' consecutive years of dividend increases';
        if (streak >= 4) return { score: 4, status: 'pass', detail: d };
        if (streak >= 1) return { score: 2, status: 'warn', detail: d };
        return { score: 0, status: 'fail', detail: d + ' (flat or cut)' };
      },
      'Companies that consistently raise dividends have strong businesses. Flat or cut dividends signal trouble.',
      'Look for "Dividend Aristocrats" (25+ years of increases) as quality markers.',
      []);

      addCheck(19, 'dividend', 'Payout Ratio Trend', function () {
        if (dps.length < 3 || !ps.eps_diluted || ps.eps_diluted.length < 3) return null;
        const currPR = latestEPS > 0 ? latestDPS / latestEPS : null;
        const prevEPS = ps.eps_diluted[ps.eps_diluted.length - 2];
        const prevDPS = dps[dps.length - 2];
        const prevPR = prevEPS > 0 && prevDPS != null ? prevDPS / prevEPS : null;
        if (currPR == null || prevPR == null) return null;
        const change = currPR - prevPR;
        const d = 'Payout ratio: ' + (currPR * 100).toFixed(1) + '% (was ' + (prevPR * 100).toFixed(1) + '%)';
        if (change <= 0) return { score: 4, status: 'pass', detail: d };
        if (change < 0.05) return { score: 2, status: 'warn', detail: d };
        return { score: 0, status: 'fail', detail: d };
      },
      'A rising payout ratio means less profit retained for growth or safety margin.',
      'Compare payout ratio to sector average. Utilities typically pay 60-80%, tech companies 20-40%.',
      []);

      addCheck(20, 'dividend', 'Dividend Funded by Debt?', function () {
        const fcf = getField(latest.cf, 'freeCashFlow'), divPaid = getField(latest.cf, 'commonDividendsPaid');
        const currDebt = getField(latest.bal, 'totalDebt'), prevDebt = prior.bal ? getField(prior.bal, 'totalDebt') : null;
        if (fcf == null || divPaid == null) return null;
        const fcfAfterDiv = fcf + divPaid;  // divPaid is negative
        const debtGrowing = currDebt != null && prevDebt != null && currDebt > prevDebt;
        const d = 'FCF after dividends: ' + fmtCurrency(fcfAfterDiv);
        if (fcfAfterDiv > 0 && !debtGrowing) return { score: 4, status: 'pass', detail: d };
        if (fcfAfterDiv > 0) return { score: 2, status: 'warn', detail: d + ' (but debt rising)' };
        return { score: 0, status: 'fail', detail: d + ' (negative — borrowing to pay dividends)' };
      },
      'The worst case: borrowing money to pay dividends. This destroys shareholder value.',
      'Check if this is temporary (one-time CapEx spike) or structural.',
      [{ stmt: 'cashflow', field: 'freeCashFlow' }, { stmt: 'cashflow', field: 'commonDividendsPaid' }, { stmt: 'balance', field: 'totalDebt' }]);
    }

    /* ── Growth & Margins ── */
    addCheck(21, 'growth', 'Revenue Growth', function () {
      const curr = getField(latest.inc, 'revenue'), prev = prior.inc ? getField(prior.inc, 'revenue') : null;
      if (curr == null || prev == null || prev === 0) return null;
      const ch = yoyDelta(curr, prev);
      const d = 'Revenue ' + (ch >= 0 ? '+' : '') + (ch * 100).toFixed(1) + '% YoY';
      if (ch > 0.05) return { score: 4, status: 'pass', detail: d };
      if (ch >= 0) return { score: 2, status: 'warn', detail: d };
      return { score: 0, status: 'fail', detail: d };
    },
    'Revenue is the top line — if it\'s shrinking, the company is losing customers or market share.',
    'Is the decline sector-wide or company-specific? Check competitors\' revenue trends.',
    [{ stmt: 'income', field: 'revenue' }]);

    addCheck(22, 'growth', 'Gross Margin Trend (3yr)', function () {
      if (incA.length < 3) return null;
      const margins = [];
      for (let i = Math.max(0, incA.length - 3); i < incA.length; i++) {
        const gp = getField(incA[i], 'grossProfit'), rev = getField(incA[i], 'revenue');
        if (gp != null && rev != null && rev !== 0) margins.push(gp / rev); else margins.push(null);
      }
      if (margins[0] == null || margins[margins.length - 1] == null) return null;
      const change = margins[margins.length - 1] - margins[0];
      const d = 'Gross margin: ' + (margins[0] * 100).toFixed(1) + '% → ' + (margins[margins.length - 1] * 100).toFixed(1) + '% (' + (change >= 0 ? '+' : '') + (change * 100).toFixed(1) + 'pp)';
      if (change >= 0) return { score: 4, status: 'pass', detail: d };
      if (change > -0.03) return { score: 2, status: 'warn', detail: d };
      return { score: 0, status: 'fail', detail: d };
    },
    'Declining gross margin means less pricing power — costs rising faster than prices.',
    'Is this input cost inflation (temporary) or competitive pressure (structural)?',
    [{ stmt: 'income', field: 'grossProfit' }, { stmt: 'income', field: 'revenue' }]);

    addCheck(23, 'growth', 'Operating Margin Trend (3yr)', function () {
      if (incA.length < 3) return null;
      const margins = [];
      for (let i = Math.max(0, incA.length - 3); i < incA.length; i++) {
        const oi = getField(incA[i], 'operatingIncome'), rev = getField(incA[i], 'revenue');
        if (oi != null && rev != null && rev !== 0) margins.push(oi / rev); else margins.push(null);
      }
      if (margins[0] == null || margins[margins.length - 1] == null) return null;
      const change = margins[margins.length - 1] - margins[0];
      const d = 'Op margin: ' + (margins[0] * 100).toFixed(1) + '% → ' + (margins[margins.length - 1] * 100).toFixed(1) + '% (' + (change >= 0 ? '+' : '') + (change * 100).toFixed(1) + 'pp)';
      if (change >= 0) return { score: 4, status: 'pass', detail: d };
      if (change > -0.03) return { score: 2, status: 'warn', detail: d };
      return { score: 0, status: 'fail', detail: d };
    },
    'Operating margin shows how efficiently the company converts revenue to profit. A declining trend means costs are out of control.',
    'Look at SGA and R&D expense trends separately to identify which cost line is growing.',
    [{ stmt: 'income', field: 'operatingIncome' }, { stmt: 'income', field: 'revenue' }]);

    if (!isFinancial) {
      addCheck(24, 'growth', 'SGA Efficiency', function () {
        const sga = getField(latest.inc, 'sellingGeneralAndAdministrativeExpenses');
        const prevSGA = prior.inc ? getField(prior.inc, 'sellingGeneralAndAdministrativeExpenses') : null;
        const rev = getField(latest.inc, 'revenue'), prevRev = prior.inc ? getField(prior.inc, 'revenue') : null;
        if (sga == null || prevSGA == null || rev == null || prevRev == null || prevSGA === 0 || prevRev === 0) return null;
        const sgaGr = yoyDelta(sga, prevSGA), revGr = yoyDelta(rev, prevRev);
        if (revGr == null || revGr === 0) return null;
        const ratio = sgaGr / revGr;
        const d = 'SGA ' + (sgaGr >= 0 ? '+' : '') + (sgaGr * 100).toFixed(1) + '% vs Revenue ' + (revGr >= 0 ? '+' : '') + (revGr * 100).toFixed(1) + '%';
        if (ratio <= 1.0) return { score: 4, status: 'pass', detail: d };
        if (ratio <= 1.5) return { score: 2, status: 'warn', detail: d };
        return { score: 0, status: 'fail', detail: d };
      },
      'SGA costs should grow slower than revenue — that\'s operating leverage. If faster, the company is becoming less efficient.',
      'One-time costs (lawsuits, restructuring) can spike SGA temporarily. Check if it\'s recurring.',
      [{ stmt: 'income', field: 'sellingGeneralAndAdministrativeExpenses' }, { stmt: 'income', field: 'revenue' }]);

      addCheck(25, 'growth', 'Inventory Efficiency', function () {
        const inv = getField(latest.bal, 'inventory'), prevInv = prior.bal ? getField(prior.bal, 'inventory') : null;
        const rev = getField(latest.inc, 'revenue'), prevRev = prior.inc ? getField(prior.inc, 'revenue') : null;
        if (inv == null || inv === 0 && (prevInv == null || prevInv === 0)) return null;
        if (prevInv == null || prevRev == null || prevInv === 0 || prevRev === 0) return null;
        const invGr = yoyDelta(inv, prevInv), revGr = yoyDelta(rev, prevRev);
        if (revGr == null || revGr === 0) return null;
        const ratio = invGr / revGr;
        const d = 'Inventory ' + (invGr >= 0 ? '+' : '') + (invGr * 100).toFixed(1) + '% vs Revenue ' + (revGr >= 0 ? '+' : '') + (revGr * 100).toFixed(1) + '%';
        if (ratio <= 1.0) return { score: 4, status: 'pass', detail: d };
        if (ratio <= 2.0) return { score: 2, status: 'warn', detail: d };
        return { score: 0, status: 'fail', detail: d };
      },
      'Inventory growing much faster than sales signals products aren\'t selling. Leads to markdowns and write-offs.',
      'Seasonality can cause temporary inventory build-up. Compare to the same quarter last year if possible.',
      [{ stmt: 'balance', field: 'inventory' }, { stmt: 'income', field: 'revenue' }]);
    }

    /* ── Aggregate ── */
    const cats = { earnings: [], balance: [], cashflow: [], dividend: [], growth: [] };
    const CAT_LABELS = {
      earnings: 'Earnings Quality',
      balance:  'Balance Sheet Strength',
      cashflow: 'Cash Flow Health',
      dividend: 'Dividend Safety',
      growth:   'Growth & Margins',
    };
    checks.forEach((c) => { if (cats[c.category]) cats[c.category].push(c); });

    if (!paysDividend) {
      cats.dividend = [{ id: 0, category: 'dividend', title: 'N/A — No dividends paid', status: 'pass', score: 4, detail: '', why: '', what: '', highlights: [] }];
    }

    let totalScore = 0, maxScore = 0;
    const catScores = {};
    for (const cat in cats) {
      const items = cats[cat];
      let catTotal = 0, catMax = 0;
      items.forEach((c) => { catTotal += c.score; catMax += 4; });
      if (!paysDividend && cat === 'dividend') { catTotal = 20; catMax = 20; }
      catScores[cat] = {
        score: catMax > 0 ? Math.round(catTotal / catMax * 20) : 0,
        max: 20,
        label: CAT_LABELS[cat],
        items,
      };
      totalScore += catScores[cat].score;
      maxScore += 20;
    }

    // Penalty: negative equity or extreme leverage caps the balance-sheet score
    const latestDebt = getField(latest.bal, 'totalDebt');
    const deRatio = (latestEquity && latestEquity > 0 && latestDebt) ? latestDebt / latestEquity : null;
    const hasExtremeLeverage = deRatio != null && deRatio > 3.0;
    if ((hasNegativeEquity || hasExtremeLeverage) && catScores.balance) {
      const capAt = hasNegativeEquity ? 5 : 8;
      if (catScores.balance.score > capAt) {
        const balPenalty = catScores.balance.score - capAt;
        totalScore -= balPenalty;
        catScores.balance.score = capAt;
      }
    }

    return {
      totalScore, maxScore,
      categories: catScores,
      checks,
      paysDividend,
      negativeEquity: hasNegativeEquity,
      extremeLeverage: hasExtremeLeverage,
      deRatio,
      passCount: checks.filter((c) => c.status === 'pass').length,
      warnCount: checks.filter((c) => c.status === 'warn').length,
      failCount: checks.filter((c) => c.status === 'fail').length,
    };
  }

  g.OC_HEALTH = { runHealthChecks };
})(window);
