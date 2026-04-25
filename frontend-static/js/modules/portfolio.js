/* PTF Portfolio — auth-gated. Nothing rendered until token verified.
   Full feature parity with stocks.clawmo.tech/portfolio.html:
   per-account holdings tabs, Buy/Sell/Deposit/Withdraw/Dividend modals,
   VaR table, MCR per-account, Fundamentals & Alerts, Recalculate, Transactions. */
(function () {
  'use strict';
  const { fmt } = window.OC_DATA;
  const API      = 'https://stocks.clawmo.tech';
  const STOR_KEY = 'portfolio_token';

  /* ── State ──────────────────────────────────────────────── */
  let TOKEN       = '';
  let DATA        = null;
  let _body       = null;
  let _holdTab    = null;   // active holdings account tab key
  let _mcrTab     = null;   // active MCR account tab name
  let _txnAcct    = '';
  let _txnType    = '';
  let _recalcEl   = null;   // recalc panel DOM node
  let _recalcPoll = null;

  /* ── Token storage ──────────────────────────────────────── */
  function getToken()   { try { return sessionStorage.getItem(STOR_KEY) || ''; } catch(e) { return ''; } }
  function setToken(t)  { try { sessionStorage.setItem(STOR_KEY, t); }           catch(e) {} }
  function clearToken() { try { sessionStorage.removeItem(STOR_KEY); }            catch(e) {} }

  /* ── API helper ─────────────────────────────────────────── */
  async function api(method, path, body) {
    const opts = {
      method,
      mode: 'cors',
      credentials: 'omit',
      headers: { 'Authorization': 'Bearer ' + TOKEN, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(API + path, opts);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.detail || r.statusText || ('HTTP ' + r.status));
    }
    return r.json();
  }

  /* ── Action icons (inline SVG glyphs, currentColor) ─────── */
  const ICO = {
    buy:      '<svg width="10" height="10" viewBox="0 0 10 10" style="vertical-align:-1px;flex-shrink:0"><polygon points="5,1 9.3,8.5 0.7,8.5" fill="currentColor"/></svg>',
    sell:     '<svg width="10" height="10" viewBox="0 0 10 10" style="vertical-align:-1px;flex-shrink:0"><polygon points="5,9 0.7,1.5 9.3,1.5" fill="currentColor"/></svg>',
    deposit:  '<svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;flex-shrink:0"><line x1="5.5" y1="1" x2="5.5" y2="8"/><polyline points="3,5.5 5.5,8 8,5.5"/><line x1="2" y1="10.5" x2="9" y2="10.5"/></svg>',
    withdraw: '<svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;flex-shrink:0"><line x1="5.5" y1="8" x2="5.5" y2="1"/><polyline points="3,3.5 5.5,1 8,3.5"/><line x1="2" y1="10.5" x2="9" y2="10.5"/></svg>',
    dividend: '<svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" style="vertical-align:-2px;flex-shrink:0"><circle cx="5.5" cy="5.5" r="4.2"/><path d="M5.5 3.2v4.6"/><path d="M7.2 4.2c0-.6-1.7-.8-1.7 0s1.7.6 1.7 1.2-1.7.8-1.7 0"/></svg>',
  };

  /* ── Formatters ──────────────────────────────────────────── */
  function escH(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function pnlCls(v) { return (v == null || isNaN(v)) ? '' : v > 0 ? 'num-up' : v < 0 ? 'num-dn' : ''; }
  function riskCls(l) {
    if (!l) return '';
    const s = String(l).toUpperCase();
    if (s.includes('HIGH')) return 'risk-high';
    if (s.includes('MED'))  return 'risk-med';
    if (s.includes('LOW'))  return 'risk-low';
    return '';
  }
  function riskTxt(l) {
    if (!l) return '—';
    return String(l).replace(/[\u{1F534}\u{1F7E1}\u{1F7E2}]/gu, '').trim() || String(l);
  }
  function today() { return new Date().toISOString().split('T')[0]; }

  /* ── Modal shell ─────────────────────────────────────────── */
  function mkModal(title, html) {
    const ov = document.createElement('div');
    ov.className = 'ptf-overlay';
    ov.innerHTML =
      '<div class="ptf-modal">' +
        '<div class="ptf-modal-title">' + escH(title) + '</div>' +
        '<div class="ptf-modal-body">' + html + '</div>' +
      '</div>';
    const close = () => ov.remove();
    ov.addEventListener('click', e => { if (e.target === ov) close(); });
    ov.addEventListener('keydown', e => {
      if (e.key === 'Escape') { close(); return; }
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
        e.preventDefault();
        const s = ov.querySelector('[data-submit]');
        if (s && !s.disabled) s.click();
      }
    });
    document.body.appendChild(ov);
    return { ov, close };
  }

  /* Wrap submit button to prevent double-fires */
  function guard(btn, fn) {
    const orig = btn.textContent;
    return async () => {
      if (btn.disabled) return;
      btn.disabled = true; btn.textContent = '…';
      try { await fn(); }
      catch (e) { alert('Error: ' + (e.message || e)); }
      finally { if (document.contains(btn)) { btn.disabled = false; btn.textContent = orig; } }
    };
  }

  /* ── Transaction modals ──────────────────────────────────── */
  const ASSET_TYPES = ['stock','stock_etf','metal_etf','crypto_etf','crypto_stock','bond','money_market'];

  function showBuyModal(acctKey) {
    const acct = (DATA?.positions?.accounts || []).find(a => a.key === acctKey);
    const isCad = acct?.currency === 'CAD';
    const hint  = isCad ? '<div class="ptf-hint">CAD acct: US tickers auto-map to CDR (NVDA → NVDA.NE). For other CA tickers type full yf symbol (XEQT.TO).</div>' : '';
    const typeOpts = ASSET_TYPES.map(t => '<option>' + t + '</option>').join('');
    const { ov, close } = mkModal('BUY · ' + acctKey,
      '<div class="ptf-err" id="bErr"></div>' +
      '<label>Ticker</label>' +
      '<input id="bTk" placeholder="' + (isCad ? 'NVDA or XEQT.TO' : 'e.g. AAPL') + '">' +
      hint +
      '<label>Qty</label><input id="bQty" type="number" step="any">' +
      '<label>Price per Share</label><input id="bPx" type="number" step="any">' +
      '<label>Date</label><input id="bDt" type="date" value="' + today() + '">' +
      '<label>Fees (optional)</label><input id="bFee" type="number" step="any" value="0">' +
      '<label>Asset Type</label><select id="bType">' + typeOpts + '</select>' +
      '<label>Note (optional)</label><input id="bNote">' +
      '<div class="ptf-modal-actions">' +
        '<button type="button" class="ptf-btn" id="bCancel">Cancel</button>' +
        '<button type="button" class="ptf-btn ptf-btn-buy" id="bSub" data-submit="1">BUY</button>' +
      '</div>');
    ov.querySelector('#bCancel').onclick = close;
    setTimeout(() => ov.querySelector('#bTk')?.focus(), 50);
    const btn = ov.querySelector('#bSub');
    btn.onclick = guard(btn, async () => {
      const err    = ov.querySelector('#bErr');
      const ticker = ov.querySelector('#bTk').value.trim().toUpperCase();
      const qty    = parseFloat(ov.querySelector('#bQty').value);
      const price  = parseFloat(ov.querySelector('#bPx').value);
      if (!ticker || !(qty > 0) || !(price > 0)) { err.textContent = 'Ticker, qty, and price are required.'; return; }
      await api('POST', '/api/portfolio/transactions', {
        account_key: acctKey, type: 'BUY', ticker, qty, price,
        date: ov.querySelector('#bDt').value,
        fees: parseFloat(ov.querySelector('#bFee').value) || 0,
        asset_type: ov.querySelector('#bType').value,
        note: ov.querySelector('#bNote').value.trim() || undefined,
      });
      close(); await reloadPositions();
    });
  }

  function showSellModal(acctKey, presetTk, presetQty) {
    const acct    = (DATA?.positions?.accounts || []).find(a => a.key === acctKey);
    const tickers = (acct?.holdings || []).map(h => h.ticker);
    const tkOpts  = tickers.map(t => '<option value="' + t + '"' + (t === presetTk ? ' selected' : '') + '>' + t + '</option>').join('');
    const maxHint = presetQty ? ' (max: ' + presetQty + ')' : '';
    const { ov, close } = mkModal('SELL · ' + acctKey,
      '<div class="ptf-err" id="sErr"></div>' +
      '<label>Ticker</label><select id="sTk">' + tkOpts + '</select>' +
      '<label>Qty' + maxHint + '</label><input id="sQty" type="number" step="any" value="' + (presetQty || '') + '">' +
      '<label>Price per Share</label><input id="sPx" type="number" step="any">' +
      '<label>Date</label><input id="sDt" type="date" value="' + today() + '">' +
      '<label>Fees (optional)</label><input id="sFee" type="number" step="any" value="0">' +
      '<label>Note (optional)</label><input id="sNote">' +
      '<div class="ptf-modal-actions">' +
        '<button type="button" class="ptf-btn" id="sCancel">Cancel</button>' +
        '<button type="button" class="ptf-btn ptf-btn-sell" id="sSub" data-submit="1">SELL</button>' +
      '</div>');
    ov.querySelector('#sCancel').onclick = close;
    const btn = ov.querySelector('#sSub');
    btn.onclick = guard(btn, async () => {
      const err   = ov.querySelector('#sErr');
      const ticker = ov.querySelector('#sTk').value;
      const qty    = parseFloat(ov.querySelector('#sQty').value);
      const price  = parseFloat(ov.querySelector('#sPx').value);
      if (!ticker || !(qty > 0) || !(price > 0)) { err.textContent = 'Ticker, qty, and price are required.'; return; }
      await api('POST', '/api/portfolio/transactions', {
        account_key: acctKey, type: 'SELL', ticker, qty, price,
        date: ov.querySelector('#sDt').value,
        fees: parseFloat(ov.querySelector('#sFee').value) || 0,
        note: ov.querySelector('#sNote').value.trim() || undefined,
      });
      close(); await reloadPositions();
    });
  }

  function showCashModal(type, acctKey) {
    const acct   = (DATA?.positions?.accounts || []).find(a => a.key === acctKey);
    const cur    = acct?.currency || '';
    const emojis = { DEPOSIT: '↓', WITHDRAW: '↑', DIVIDEND: '⬡' };
    const klss   = { DEPOSIT: 'ptf-btn-buy', WITHDRAW: 'ptf-btn-sell', DIVIDEND: 'ptf-btn-div' };
    const divRow = type === 'DIVIDEND'
      ? '<label>Ticker (optional)</label><input id="cTk" placeholder="e.g. GOOGL">'
      : '';
    const { ov, close } = mkModal((emojis[type] || '') + ' ' + type + ' · ' + acctKey,
      '<div class="ptf-err" id="cErr"></div>' +
      '<label>Amount (' + cur + ')</label><input id="cAmt" type="number" step="any">' +
      '<label>Date</label><input id="cDt" type="date" value="' + today() + '">' +
      divRow +
      '<label>Note (optional)</label><input id="cNote">' +
      '<div class="ptf-modal-actions">' +
        '<button type="button" class="ptf-btn" id="cCancel">Cancel</button>' +
        '<button type="button" class="ptf-btn ' + (klss[type] || '') + '" id="cSub" data-submit="1">' + type + '</button>' +
      '</div>');
    ov.querySelector('#cCancel').onclick = close;
    setTimeout(() => ov.querySelector('#cAmt')?.focus(), 50);
    const btn = ov.querySelector('#cSub');
    btn.onclick = guard(btn, async () => {
      const err    = ov.querySelector('#cErr');
      const amount = parseFloat(ov.querySelector('#cAmt').value);
      if (!(amount > 0)) { err.textContent = 'Positive amount required.'; return; }
      const body = { account_key: acctKey, type, amount, date: ov.querySelector('#cDt').value,
                     note: ov.querySelector('#cNote').value.trim() || undefined };
      if (type === 'DIVIDEND') {
        const tk = ov.querySelector('#cTk')?.value.trim().toUpperCase();
        if (tk) body.ticker = tk;
      }
      await api('POST', '/api/portfolio/transactions', body);
      close(); await reloadPositions();
    });
  }

  async function reverseTransaction(id, label) {
    if (!confirm('Reverse "' + label + '"?\n\nAppends an inverse entry. Original is preserved.')) return;
    try {
      await api('POST', '/api/portfolio/transactions/' + encodeURIComponent(id) + '/reverse');
      await reloadPositions();
    } catch (e) { alert('Reverse failed: ' + e.message); }
  }

  /* ── Recalculate panel ───────────────────────────────────── */
  function toggleRecalcPanel() {
    if (_recalcEl) { _recalcEl.style.display = _recalcEl.style.display === 'none' ? '' : 'none'; return; }
    const SCRIPTS = ['prices','var','mcr','fundamentals','sectors','alerts','news','report'];
    _recalcEl = document.createElement('div');
    _recalcEl.className = 'ptf-recalc-panel';
    _recalcEl.innerHTML =
      '<div class="ptf-recalc-hdr">' +
        '<span>RECALCULATE</span>' +
        '<button class="ptf-btn" id="rcClose">✕</button>' +
      '</div>' +
      '<div class="ptf-recalc-checks">' +
        SCRIPTS.map(s => '<label class="ptf-chk"><input type="checkbox" data-k="' + s + '" checked><span>' + s + '</span></label>').join('') +
      '</div>' +
      '<div style="display:flex;gap:6px;align-items:center;margin-top:8px">' +
        '<button class="ptf-btn ptf-btn-recalc" id="rcRun">Run Selected</button>' +
        '<button class="ptf-btn" id="rcAll">Run All</button>' +
        '<span class="ptf-recalc-status" id="rcStatus"></span>' +
      '</div>' +
      '<div id="rcProgress" style="margin-top:6px"></div>';
    const strip = _body.querySelector('.acct-strip');
    if (strip) _body.insertBefore(_recalcEl, strip);
    else _body.appendChild(_recalcEl);

    _recalcEl.querySelector('#rcClose').onclick = () => { _recalcEl.style.display = 'none'; };
    _recalcEl.querySelector('#rcRun').onclick   = () => startRecalc(false);
    _recalcEl.querySelector('#rcAll').onclick   = () => startRecalc(true);
  }

  async function startRecalc(all) {
    if (!_recalcEl) return;
    const statusEl   = _recalcEl.querySelector('#rcStatus');
    const progressEl = _recalcEl.querySelector('#rcProgress');
    statusEl.textContent = 'Starting…';
    progressEl.innerHTML = '';
    try {
      const scripts = all ? null : [..._recalcEl.querySelectorAll('[data-k]:checked')].map(c => c.dataset.k);
      await api('POST', '/api/portfolio/recalculate', scripts ? { scripts } : {});
      statusEl.textContent = 'Running…';
      if (_recalcPoll) clearInterval(_recalcPoll);
      _recalcPoll = setInterval(pollRecalc, 1500);
    } catch (e) { statusEl.textContent = 'Error: ' + e.message; }
  }

  async function pollRecalc() {
    try {
      const s       = await api('GET', '/api/portfolio/recalculate/status');
      const statEl  = _recalcEl?.querySelector('#rcStatus');
      const progEl  = _recalcEl?.querySelector('#rcProgress');
      if (!statEl) { clearInterval(_recalcPoll); return; }

      const steps = Object.entries(s.steps || {});
      progEl.innerHTML = steps.map(([k, st]) => {
        const cls = st.status === 'done' ? 'ptf-dot-done' :
                    st.status === 'running' ? 'ptf-dot-run' :
                    st.status === 'error'   ? 'ptf-dot-err' : 'ptf-dot-pend';
        return '<div class="ptf-recalc-step"><span class="ptf-dot ' + cls + '"></span>' + escH(st.label || k) + '</div>';
      }).join('');

      if (!s.running && s.finished_at) {
        clearInterval(_recalcPoll);
        statEl.textContent = s.error ? '✗ Error' : '✓ Done';
        if (!s.error) {
          setTimeout(async () => {
            try {
              DATA = await api('GET', '/api/portfolio/dashboard');
              renderAll();
            } catch (_) {}
          }, 800);
        }
      }
    } catch (_) { clearInterval(_recalcPoll); }
  }

  /* ── reloadPositions (fast post-CRUD refresh) ────────────── */
  async function reloadPositions() {
    try {
      const [rawPos, rawState, rawTxns] = await Promise.all([
        api('GET', '/api/portfolio/positions'),
        api('GET', '/api/portfolio/ledger-state'),
        api('GET', '/api/portfolio/transactions?limit=200'),
      ]);

      /* Rebuild DATA.positions.accounts from raw lots + fresh cash */
      const cashBy = {};
      for (const [k, a] of Object.entries(rawState?.accounts || {})) cashBy[k] = a.cash;

      const accounts = [];
      for (const [key, acct] of Object.entries(rawPos?.accounts || {})) {
        const agg = {};
        for (const p of acct.positions || []) {
          if (!agg[p.ticker]) agg[p.ticker] = { ticker: p.ticker, quantity: 0, total_cost: 0, type: p.type || 'stock' };
          agg[p.ticker].quantity   += p.quantity;
          agg[p.ticker].total_cost += p.quantity * p.entry_price;
        }
        const holdings = Object.values(agg).map(h => ({
          ticker: h.ticker,
          quantity:        Math.round(h.quantity * 1e4) / 1e4,
          avg_entry_price: Math.round((h.total_cost / h.quantity) * 100) / 100,
          cost_basis:      Math.round(h.total_cost * 100) / 100,
          type:            h.type,
        }));
        accounts.push({ key, label: acct.label, currency: acct.currency,
                        positions_count: holdings.length, holdings, cash: cashBy[key] ?? 0 });
      }
      if (DATA) {
        DATA.positions = { ...(DATA.positions || {}), accounts };
        /* Update ledger cash from live ledger-state */
        if (DATA.ledger?.accounts) {
          DATA.ledger.accounts = DATA.ledger.accounts.map(L => ({ ...L, cash: cashBy[L.key] ?? L.cash }));
        }
        if (rawTxns) DATA.transactions_recent = rawTxns.transactions || [];
      }

      renderSummaryStrip();
      renderHoldings();
      renderLedger();
      renderTransactions();
    } catch (e) { console.error('PTF reloadPositions:', e); }
  }

  /* ── Render: account strip ───────────────────────────────── */
  function renderSummaryStrip() {
    const strip = _body.querySelector('#ptfAcctStrip');
    if (!strip) return;
    const accts   = DATA?.positions?.accounts || [];
    const varBy   = {};  (DATA?.var?.accounts  || []).forEach(v => { varBy[v.account_name] = v; });
    const mcrBy   = {};  (DATA?.mcr?.accounts  || []).forEach(m => { mcrBy[m.account_name] = m; });
    const ledgBy  = {};  (DATA?.ledger?.accounts || []).forEach(L => { ledgBy[L.key] = L; });

    strip.innerHTML = accts.map(a => {
      const v    = varBy[a.label]  || {};
      const m    = mcrBy[a.label]  || {};
      const cash = a.cash ?? ledgBy[a.key]?.cash;
      return (
        '<div class="acct-card">' +
          '<div class="acct-name">' + escH(a.label) + '</div>' +
          '<div class="acct-val"><span class="ccy">' + escH(a.currency) + '</span>' +
          '<span class="mono">' + fmt.compact(v.portfolio_value) + '</span></div>' +
          '<div class="acct-meta">' +
            '<span>N=' + a.positions_count + '</span>·' +
            '<span>VaR<sub>1w</sub> ' + (v.var_weekly_pct != null ? v.var_weekly_pct.toFixed(1) + '%' : '—') + '</span>·' +
            '<span class="' + riskCls(v.risk_level) + '">' + riskTxt(v.risk_level) + '</span>' +
          '</div>' +
          '<div class="acct-meta sub">' +
            '<span>cash <span class="mono' + ((cash != null && cash < 0) ? ' num-dn' : '') + '">' + (cash != null ? fmt.compact(cash) : '—') + '</span></span>·' +
            '<span>vol ' + (m.portfolio_volatility_pct != null ? m.portfolio_volatility_pct.toFixed(1) + '%' : '—') + '</span>·' +
            '<span>driver: <span class="tk-inline">' + escH(m.primary_risk_driver || '—') + '</span></span>' +
          '</div>' +
        '</div>'
      );
    }).join('');
  }

  /* ── Render: holdings (per-account tabs) ─────────────────── */
  function renderHoldings() {
    const panel = _body.querySelector('#ptfHoldingsPanel');
    if (!panel) return;
    const accts = DATA?.positions?.accounts || [];
    if (!accts.length) { panel.innerHTML = '<div class="empty">no accounts</div>'; return; }

    if (!_holdTab || !accts.find(a => a.key === _holdTab)) _holdTab = accts[0].key;
    const acct = accts.find(a => a.key === _holdTab) || accts[0];

    const varBy  = {};  (DATA?.var?.accounts || []).forEach(v => { varBy[v.account_name] = v; });
    const fundBy = {};  (DATA?.fundamentals?.positions || []).forEach(f => { fundBy[f.ticker] = f; });
    const acctVal = (varBy[acct.label] || {}).portfolio_value;

    const tabs = accts.map(a =>
      '<button class="ptf-tab' + (a.key === _holdTab ? ' active' : '') + '" data-key="' + escH(a.key) + '">' +
        escH(a.key) + '<span class="ptf-tab-n">' + a.positions_count + '</span>' +
      '</button>'
    ).join('');

    const hrows = (acct.holdings || []).map(h => {
      const f    = fundBy[h.ticker] || {};
      const last = h.current_price_acct ?? f.current_price;
      const val  = h.current_value ?? (last != null ? h.quantity * last : null);
      const pnlD = h.unrealized_pnl ?? (val != null && h.cost_basis != null ? val - h.cost_basis : null);
      const pnlP = (last != null && h.avg_entry_price) ? (last / h.avg_entry_price - 1) * 100 : null;
      const wt   = (val != null && acctVal) ? (val / acctVal) * 100 : null;
      return (
        '<tr>' +
          '<td class="tk clickable" data-tk="' + h.ticker + '">' + h.ticker + '</td>' +
          '<td class="mono">' + fmt.num(h.quantity, h.quantity % 1 === 0 ? 0 : 2) + '</td>' +
          '<td class="mono">' + fmt.num(h.avg_entry_price, 2) + '</td>' +
          '<td class="mono">' + (last != null ? fmt.num(last, 2) : '—') + '</td>' +
          '<td class="mono">' + (val  != null ? fmt.compact(val) : '—') + '</td>' +
          '<td class="mono ' + pnlCls(pnlD) + '">' + (pnlD != null ? (pnlD >= 0 ? '+' : '') + fmt.compact(pnlD) : '—') + '</td>' +
          '<td class="mono ' + pnlCls(pnlP) + '">' + fmt.pct(pnlP) + '</td>' +
          '<td class="mono">' + (wt != null ? wt.toFixed(1) + '%' : '—') + '</td>' +
          '<td><button class="ptf-btn ptf-btn-sell ptf-sell-row" data-acct="' + escH(acct.key) + '" data-tk="' + h.ticker + '" data-qty="' + h.quantity + '">' + ICO.sell + ' Sell</button></td>' +
        '</tr>'
      );
    }).join('');

    panel.innerHTML =
      '<div class="ptf-tab-strip">' + tabs + '</div>' +
      '<div class="ptf-crud-bar">' +
        '<button class="ptf-btn ptf-btn-buy"  data-acct="' + escH(acct.key) + '" data-action="buy">' + ICO.buy      + ' Buy</button>' +
        '<button class="ptf-btn ptf-btn-sell" data-acct="' + escH(acct.key) + '" data-action="wdw">' + ICO.withdraw + ' Withdraw</button>' +
        '<button class="ptf-btn"              data-acct="' + escH(acct.key) + '" data-action="dep">' + ICO.deposit  + ' Deposit</button>' +
        '<button class="ptf-btn ptf-btn-div"  data-acct="' + escH(acct.key) + '" data-action="div">' + ICO.dividend + ' Dividend</button>' +
        '<span class="ptf-acct-ccy">' + escH(acct.currency) + '</span>' +
      '</div>' +
      '<div class="tbl-wrap">' +
        '<table class="tbl-dense">' +
          '<thead><tr><th>TICKER</th><th>QTY</th><th data-glossary="avg-cost">AVG</th><th>LAST</th><th>VALUE</th><th>P&amp;L$</th><th>P&amp;L%</th><th>WT%</th><th></th></tr></thead>' +
          '<tbody>' + (hrows || '<tr><td colspan="9" class="empty">no holdings</td></tr>') + '</tbody>' +
        '</table>' +
      '</div>';

    panel.querySelectorAll('.ptf-tab').forEach(tab => {
      tab.addEventListener('click', () => { _holdTab = tab.dataset.key; renderHoldings(); });
    });
    panel.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const k = btn.dataset.acct;
        const a = btn.dataset.action;
        if (a === 'buy') showBuyModal(k);
        else if (a === 'dep') showCashModal('DEPOSIT', k);
        else if (a === 'wdw') showCashModal('WITHDRAW', k);
        else if (a === 'div') showCashModal('DIVIDEND', k);
      });
    });
    panel.querySelectorAll('.ptf-sell-row').forEach(btn => {
      btn.addEventListener('click', () => showSellModal(btn.dataset.acct, btn.dataset.tk, parseFloat(btn.dataset.qty)));
    });
    panel.querySelectorAll('.tk.clickable').forEach(el => {
      el.addEventListener('click', () => { if (el.dataset.tk && window.OC_OPEN_MODULE) window.OC_OPEN_MODULE('stock-analysis', { ticker: el.dataset.tk }); });
    });
  }

  /* ── VaR chart: build SVG + crosshair, return {html, pts, W} ── */
  function buildVaRChart(hist) {
    const W = 760, H = 160, padL = 40, padR = 14, padT = 12, padB = 24;
    const innerW = W - padL - padR, innerH = H - padT - padB;
    const n = hist.length;
    const COLORS = ['var(--accent)', 'var(--pnl-up)', '#60A5FA', '#A78BFA'];

    /* Collect per-account series in stable order */
    const acctNames = [];
    (hist[0]?.accounts || []).forEach(a => {
      if (!acctNames.includes(a.account_name)) acctNames.push(a.account_name);
    });
    const series = acctNames.map((name, i) => ({
      name,
      color: COLORS[i % COLORS.length],
      values: hist.map(snap => {
        const a = (snap.accounts || []).find(x => x.account_name === name);
        return (a && a.var_weekly_pct != null) ? Math.abs(a.var_weekly_pct) : null;
      }),
    }));

    /* Y range: always from 0, top = max + 10% headroom */
    const allVals = series.flatMap(s => s.values.filter(v => v != null));
    const yMin = 0;
    let yMax = allVals.length ? Math.max(...allVals) : 10;
    if (yMax === 0) yMax = 10;
    yMax *= 1.12;

    const sx = i => padL + (n > 1 ? (i / (n - 1)) * innerW : innerW / 2);
    const sy = v => padT + (1 - (v - yMin) / (yMax - yMin)) * innerH;

    /* Points for crosshair hit-test */
    const pts = hist.map((snap, i) => ({
      date: snap.date || '',
      _x: sx(i),
      vals: series.map(s => ({
        name: s.name, color: s.color, value: s.values[i],
        _y: s.values[i] != null ? sy(s.values[i]) : null,
      })),
    }));

    let svg = '<svg class="ptf-var-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" style="width:100%;aspect-ratio:' + W + '/' + H + ';display:block">';

    /* Grid + y labels */
    for (let g = 0; g <= 4; g++) {
      const v = yMin + (g / 4) * (yMax - yMin);
      const y = sy(v).toFixed(1);
      svg += '<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '" stroke="rgba(255,255,255,0.05)" stroke-width="0.4"/>';
      svg += '<text x="' + (padL - 4) + '" y="' + (parseFloat(y) + 3).toFixed(1) + '" fill="var(--fg-faint)" font-size="9" text-anchor="end" font-family="var(--font-mono)">' + v.toFixed(1) + '%</text>';
    }

    /* Series lines + dots */
    series.forEach(s => {
      const linePts = [];
      s.values.forEach((v, i) => { if (v != null) linePts.push({ x: sx(i), y: sy(v) }); });
      if (linePts.length) {
        const d = window.OC_CHART ? window.OC_CHART.smoothPath(linePts) : linePts.map((p, j) => (j === 0 ? 'M ' : 'L ') + p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' ');
        svg += '<path d="' + d + '" fill="none" stroke="' + s.color + '" stroke-width="1.6"/>';
      }
      s.values.forEach((v, i) => {
        if (v == null) return;
        svg += '<circle cx="' + sx(i).toFixed(1) + '" cy="' + sy(v).toFixed(1) + '" r="2.5" fill="' + s.color + '"/>';
      });
    });

    /* X labels */
    const xLabels = hist.map(s => (s.date || '').slice(5));
    const step = Math.max(1, Math.floor(n / 7));
    const shown = new Set();
    for (let i = 0; i < n; i += step) {
      if (!shown.has(i)) {
        shown.add(i);
        const anchor = i === 0 ? 'start' : 'middle';
        svg += '<text x="' + sx(i).toFixed(1) + '" y="' + (H - 6) + '" fill="var(--fg-faint)" font-size="9" text-anchor="' + anchor + '" font-family="var(--font-mono)">' + escH(xLabels[i]) + '</text>';
      }
    }
    const last = n - 1;
    if (!shown.has(last)) {
      svg += '<text x="' + sx(last).toFixed(1) + '" y="' + (H - 6) + '" fill="var(--fg-faint)" font-size="9" text-anchor="end" font-family="var(--font-mono)">' + escH(xLabels[last]) + '</text>';
    }

    /* Crosshair elements (initially hidden) */
    svg += '<line class="ptf-var-cx" x1="0" y1="' + padT + '" x2="0" y2="' + (padT + innerH) + '" style="stroke:var(--fg);stroke-width:0.6;opacity:0;pointer-events:none;stroke-dasharray:2 2"></line>';
    series.forEach((s, i) => {
      svg += '<circle class="ptf-var-cd" data-si="' + i + '" cx="0" cy="0" r="3.5" style="fill:' + s.color + ';stroke:var(--fg);stroke-width:0.8;opacity:0;pointer-events:none"></circle>';
    });
    /* Transparent hit rect over the plot area */
    svg += '<rect class="ptf-var-hit" x="' + padL + '" y="' + padT + '" width="' + innerW + '" height="' + innerH + '" style="fill:transparent;cursor:crosshair"></rect>';
    svg += '</svg>';

    /* Legend */
    const legend = series.map(s =>
      '<span class="ptf-legend-item" style="color:' + s.color + '">■ ' + escH(s.name.split(/[\s(]/)[0]) + '</span>'
    ).join('');

    const html =
      '<div class="ptf-chart-wrap">' +
        '<div class="ptf-chart-legend">' + legend + '</div>' +
        '<div class="ptf-var-wrap">' + svg + '<div class="ptf-var-tt" style="display:none"></div></div>' +
      '</div>';

    return { html, pts, W };
  }

  /* ── Wire VaR crosshair after innerHTML is set ──────────── */
  function wireVaRChart(panel, pts, W) {
    const wrap  = panel.querySelector('.ptf-var-wrap');
    const svgEl = wrap && wrap.querySelector('.ptf-var-svg');
    const cxLine = wrap && wrap.querySelector('.ptf-var-cx');
    const cdots  = wrap ? [...wrap.querySelectorAll('.ptf-var-cd')] : [];
    const hit    = wrap && wrap.querySelector('.ptf-var-hit');
    const tt     = wrap && wrap.querySelector('.ptf-var-tt');
    if (!svgEl || !cxLine || !hit || !tt || !pts.length) return;

    function nearestIdx(xVB) {
      let best = 0, bd = Infinity;
      pts.forEach((p, i) => { const d = Math.abs(p._x - xVB); if (d < bd) { bd = d; best = i; } });
      return best;
    }

    function onMove(ev) {
      const rect = svgEl.getBoundingClientRect();
      if (!rect.width) return;
      const xVB = ((ev.clientX - rect.left) / rect.width) * W;
      const p   = pts[nearestIdx(xVB)];

      cxLine.setAttribute('x1', p._x); cxLine.setAttribute('x2', p._x);
      cxLine.style.opacity = '0.7';

      cdots.forEach(dot => {
        const v = p.vals[parseInt(dot.dataset.si)];
        if (v && v._y != null) {
          dot.setAttribute('cx', p._x); dot.setAttribute('cy', v._y);
          dot.style.opacity = '1';
        } else {
          dot.style.opacity = '0';
        }
      });

      const ttX = (p._x / W) * rect.width;
      tt.innerHTML =
        '<div class="ptf-tt-row"><span class="ptf-tt-k">DATE</span><span class="ptf-tt-v">' + escH(p.date) + '</span></div>' +
        p.vals.map(v =>
          '<div class="ptf-tt-row"><span class="ptf-tt-k" style="color:' + v.color + '">' +
            escH(v.name.split(/[\s(]/)[0]) + '</span>' +
          '<span class="ptf-tt-v">' + (v.value != null ? v.value.toFixed(1) + '%' : '—') + '</span></div>'
        ).join('');
      tt.style.display = 'block';
      const ttW = tt.offsetWidth || 130;
      let left = ttX + 12;
      if (left + ttW > rect.width - 4) left = ttX - ttW - 12;
      if (left < 4) left = 4;
      tt.style.left = left + 'px';
      tt.style.top  = '8px';
    }

    function onLeave() {
      cxLine.style.opacity = '0';
      cdots.forEach(d => { d.style.opacity = '0'; });
      tt.style.display = 'none';
    }

    hit.addEventListener('mousemove', onMove);
    hit.addEventListener('mouseleave', onLeave);
  }

  /* ── Render: VaR ─────────────────────────────────────────── */
  function renderVaR() {
    const panel = _body.querySelector('#ptfVarPanel');
    if (!panel) return;
    const varAccts = DATA?.var?.accounts || [];
    if (!varAccts.length) { panel.innerHTML = '<div class="empty">no VaR data — run Recalculate</div>'; return; }

    const rows = varAccts.map(v =>
      '<tr>' +
        '<td>' + escH(v.account_name) + '</td>' +
        '<td class="ccy">' + escH(v.currency || '') + '</td>' +
        '<td class="mono">' + (v.portfolio_value != null ? fmt.compact(v.portfolio_value) : '—') + '</td>' +
        '<td class="mono">' + (v.var_daily_amount != null ? fmt.compact(v.var_daily_amount) : (v.var_1day_95 != null ? fmt.compact(v.var_1day_95) : '—')) + '</td>' +
        '<td class="mono">' + (v.var_daily_pct != null ? v.var_daily_pct.toFixed(2) + '%' : (v.var_1day_pct != null ? v.var_1day_pct.toFixed(2) + '%' : '—')) + '</td>' +
        '<td class="mono">' + (v.var_weekly_amount != null ? fmt.compact(v.var_weekly_amount) : (v.var_weekly_95 != null ? fmt.compact(v.var_weekly_95) : '—')) + '</td>' +
        '<td class="mono">' + (v.var_weekly_pct != null ? v.var_weekly_pct.toFixed(2) + '%' : '—') + '</td>' +
        '<td class="' + riskCls(v.risk_level) + '">' + riskTxt(v.risk_level) + '</td>' +
      '</tr>'
    ).join('');

    const hist = DATA?.var_history || [];
    let chartHtml = '';
    let chartPts = [], chartW = 760;
    if (hist.length >= 2) {
      const built = buildVaRChart(hist);
      chartHtml = built.html;
      chartPts  = built.pts;
      chartW    = built.W;
    }

    panel.innerHTML =
      chartHtml +
      '<div class="tbl-wrap"><table class="tbl-dense">' +
        '<thead><tr><th>ACCOUNT</th><th>CCY</th><th>VALUE</th><th>VaR 1D $</th><th>VaR 1D %</th><th>VaR 1W $</th><th>VaR 1W %</th><th>RISK</th></tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table></div>';

    if (chartPts.length) wireVaRChart(panel, chartPts, chartW);
  }

  /* ── Render: MCR ─────────────────────────────────────────── */
  function renderMCR() {
    const panel    = _body.querySelector('#ptfMcrPanel');
    if (!panel) return;
    const mcrAccts = DATA?.mcr?.accounts || [];
    if (!mcrAccts.length) { panel.innerHTML = '<div class="empty">no MCR data</div>'; return; }

    if (!_mcrTab || !mcrAccts.find(m => m.account_name === _mcrTab)) _mcrTab = mcrAccts[0].account_name;
    const macct = mcrAccts.find(m => m.account_name === _mcrTab) || mcrAccts[0];

    const tabs = mcrAccts.map(m =>
      '<button class="ptf-tab' + (m.account_name === _mcrTab ? ' active' : '') + '" data-name="' + escH(m.account_name) + '">' +
        escH(m.account_name) +
      '</button>'
    ).join('');

    const mrows = (macct.mcr_rows || []).slice(0, 15).map(r =>
      '<tr>' +
        '<td class="tk clickable" data-tk="' + r.ticker + '">' + r.ticker + '</td>' +
        '<td class="mono">' + (r.weight  != null ? r.weight.toFixed(1) + '%' : '—') + '</td>' +
        '<td class="mono">' + (r.mcr_pct != null ? r.mcr_pct.toFixed(1) + '%' : '—') + '</td>' +
        '<td class="mono ' + (r.difference > 0 ? 'num-dn' : r.difference < 0 ? 'num-up' : '') + '">' +
          (r.difference != null ? (r.difference > 0 ? '+' : '') + r.difference.toFixed(1) : '—') + '</td>' +
        '<td class="' + riskCls(r.status) + '">' + riskTxt(r.status) + '</td>' +
      '</tr>'
    ).join('');

    panel.innerHTML =
      '<div class="ptf-tab-strip">' + tabs + '</div>' +
      '<div class="tbl-wrap"><table class="tbl-dense">' +
        '<thead><tr><th>TICKER</th><th>WT</th><th>MCR</th><th title="Over/under relative to weight">Δ</th><th>STATUS</th></tr></thead>' +
        '<tbody>' + (mrows || '<tr><td colspan="5" class="empty">no data</td></tr>') + '</tbody>' +
      '</table></div>';

    panel.querySelectorAll('.ptf-tab').forEach(tab => {
      tab.addEventListener('click', () => { _mcrTab = tab.dataset.name; renderMCR(); });
    });
    panel.querySelectorAll('.tk.clickable').forEach(el => {
      el.addEventListener('click', () => { if (el.dataset.tk && window.OC_OPEN_MODULE) window.OC_OPEN_MODULE('stock-analysis', { ticker: el.dataset.tk }); });
    });
  }

  /* ── Render: Cash & P&L ledger ───────────────────────────── */
  function renderLedger() {
    const panel = _body.querySelector('#ptfLedgerPanel');
    if (!panel) return;
    const accts = DATA?.ledger?.accounts || [];
    const ytd   = DATA?.ledger?.ytd || {};

    const rows = accts.map(L => {
      const real  = L.realized_pnl_lifetime ?? 0;
      const unrel = L.unrealized_pnl        ?? 0;
      const tot   = L.total_pnl             ?? (real + unrel);
      const divs  = L.dividends_lifetime    ?? 0;
      return (
        '<tr>' +
          '<td class="acct">' + escH(L.key) + '</td>' +
          '<td class="ccy">' + escH(L.currency || '—') + '</td>' +
          '<td class="mono' + ((L.cash || 0) < 0 ? ' num-dn' : '') + '">' + (L.cash != null ? fmt.compact(L.cash) : '—') + '</td>' +
          '<td class="mono ' + pnlCls(real) + '">' + (real  >= 0 ? '+' : '') + fmt.compact(real)  + '</td>' +
          '<td class="mono ' + pnlCls(unrel) + '">' + (unrel >= 0 ? '+' : '') + fmt.compact(unrel) + '</td>' +
          '<td class="mono ' + pnlCls(tot) + '" style="font-weight:600">' + (tot >= 0 ? '+' : '') + fmt.compact(tot) + '</td>' +
          '<td class="mono" style="color:var(--accent)">' + fmt.compact(divs) + '</td>' +
        '</tr>'
      );
    }).join('');

    panel.innerHTML =
      '<div class="ptf-panel-sub">YTD ' + (ytd.year || '') + ' · ' + (ytd.closed_trades_count || 0) + ' closed trades</div>' +
      '<div class="tbl-wrap"><table class="tbl-dense">' +
        '<thead><tr><th>ACCT</th><th>CCY</th><th>CASH</th><th>REALIZED</th><th>UNREALIZED</th><th>TOTAL</th><th>DIVS</th></tr></thead>' +
        '<tbody>' + (rows || '<tr><td colspan="7" class="empty">no ledger data</td></tr>') + '</tbody>' +
      '</table></div>';
  }

  /* ── Render: Transactions ────────────────────────────────── */
  function renderTransactions() {
    const panel = _body.querySelector('#ptfTxnPanel');
    if (!panel) return;
    const all      = DATA?.transactions_recent || [];
    const acctKeys = [...new Set(all.map(t => t.account_key).filter(Boolean))].sort();
    const TYPES    = ['BUY','SELL','DEPOSIT','WITHDRAW','DIVIDEND','FEE','REVERSAL'];

    const shown = all.filter(t => {
      if (_txnAcct && t.account_key !== _txnAcct) return false;
      if (_txnType && t.type !== _txnType) return false;
      return true;
    }).slice(0, 60);

    const reversedIds = new Set(all.filter(t => t.ref_id).map(t => t.ref_id));
    const colFor = { BUY: 'var(--pnl-up)', SELL: 'var(--pnl-dn)', DEPOSIT: 'var(--accent)',
                     WITHDRAW: '#E6B84A', DIVIDEND: 'var(--pnl-up)', FEE: 'var(--fg-faint)', REVERSAL: 'var(--fg-faint)' };

    const rows = shown.map(t => {
      const col    = colFor[t.type] || 'var(--fg)';
      const dim    = reversedIds.has(t.id) ? 'opacity:0.38;' : '';
      const dollar = t.amount ?? (t.qty != null && t.price != null ? t.qty * t.price : null);
      const label  = escH((t.type || '') + ' ' + (t.ticker || t.amount || ''));
      return (
        '<tr style="' + dim + '">' +
          '<td class="mono" style="font-size:0.68rem">' + escH(t.date || '') + '</td>' +
          '<td class="acct">' + escH((t.account_key || '').slice(0, 5)) + '</td>' +
          '<td class="mono" style="color:' + col + ';font-weight:600">' + escH(t.type || '') + '</td>' +
          '<td class="tk">' + escH(t.ticker || '') + '</td>' +
          '<td class="mono">' + (t.qty != null ? fmt.num(t.qty, t.qty % 1 === 0 ? 0 : 2) : '') + '</td>' +
          '<td class="mono">' + (dollar != null ? fmt.compact(dollar) : '') + '</td>' +
          '<td>' + (!reversedIds.has(t.id) ?
            '<button class="ptf-btn ptf-btn-rev" data-id="' + escH(t.id) + '" data-lbl="' + label + '">↩</button>' : '') +
          '</td>' +
        '</tr>'
      );
    }).join('');

    const acctOpts = '<option value="">All Accts</option>' +
      acctKeys.map(k => '<option value="' + k + '"' + (k === _txnAcct ? ' selected' : '') + '>' + escH(k) + '</option>').join('');
    const typeOpts = '<option value="">All Types</option>' +
      TYPES.map(t => '<option value="' + t + '"' + (t === _txnType ? ' selected' : '') + '>' + t + '</option>').join('');

    panel.innerHTML =
      '<div class="ptf-crud-bar">' +
        '<select class="ptf-select" id="txnFA">' + acctOpts + '</select>' +
        '<select class="ptf-select" id="txnFT">' + typeOpts + '</select>' +
        '<span style="flex:1"></span>' +
        '<span class="ptf-panel-sub">' + shown.length + ' / ' + all.length + '</span>' +
      '</div>' +
      '<div class="tbl-wrap"><table class="tbl-dense">' +
        '<thead><tr><th>DATE</th><th>ACCT</th><th>TYPE</th><th>TK</th><th>QTY</th><th>$</th><th></th></tr></thead>' +
        '<tbody>' + (rows || '<tr><td colspan="7" class="empty">no transactions</td></tr>') + '</tbody>' +
      '</table></div>';

    panel.querySelector('#txnFA').onchange = e => { _txnAcct = e.target.value; renderTransactions(); };
    panel.querySelector('#txnFT').onchange = e => { _txnType = e.target.value; renderTransactions(); };
    panel.querySelectorAll('.ptf-btn-rev').forEach(btn => {
      btn.addEventListener('click', () => reverseTransaction(btn.dataset.id, btn.dataset.lbl));
    });
  }

  /* ── Render: Fundamentals & Alerts ──────────────────────── */
  function renderFundamentals() {
    const panel = _body.querySelector('#ptfFundPanel');
    if (!panel) return;
    const fund = DATA?.fundamentals;
    if (!fund) { panel.innerHTML = '<div class="empty">no fundamentals data — run Recalculate</div>'; return; }

    /* Formatters local to this section */
    function fv(v, dec) {                     // generic number
      if (v == null || v === 'N/A') return '—';
      return Number(v).toFixed(dec != null ? dec : 2);
    }
    function fp(v) {                           // fraction → percent string
      if (v == null || v === 'N/A') return '—';
      return (Number(v) * 100).toFixed(1) + '%';
    }
    function fmc(v) {                          // market cap compact
      if (v == null || v === 'N/A' || isNaN(v)) return v || '—';
      const n = Number(v);
      if (n >= 1e12) return (n / 1e12).toFixed(1) + 'T';
      if (n >= 1e9)  return (n / 1e9).toFixed(1)  + 'B';
      if (n >= 1e6)  return (n / 1e6).toFixed(0)  + 'M';
      return String(n);
    }

    /* Build alert index: ticker → array of alert objects */
    const alertBy = {};
    (fund.alerts || []).forEach(a => {
      if (!alertBy[a.ticker]) alertBy[a.ticker] = [];
      (a.alerts || []).forEach(al => alertBy[a.ticker].push(al));
    });

    /* Banner */
    const alertCount = fund.total_issues || 0;
    let banner = '';
    if (alertCount > 0) {
      const msgs = [];
      (fund.alerts || []).forEach(a => { (a.alerts || []).forEach(al => msgs.push(al.message || '')); });
      banner =
        '<div class="ptf-alert-banner ptf-alert-warn">' +
          '<strong>' + alertCount + ' alert' + (alertCount > 1 ? 's' : '') + ' across ' + (fund.alert_count || 0) + ' positions</strong>' +
          '<ul>' + msgs.map(m => '<li>' + escH(m) + '</li>').join('') + '</ul>' +
        '</div>';
    } else {
      banner = '<div class="ptf-alert-banner ptf-alert-ok">No significant fundamental changes detected.</div>';
    }

    /* Split active vs skipped */
    const active  = (fund.positions || []).filter(p => !p.skipped);
    const skipped = (fund.positions || []).filter(p => p.skipped);

    /* Main fundamentals table */
    const frows = active.map(f => {
      const alts   = alertBy[f.ticker] || [];
      const maxSev = alts.some(a => a.severity === 'high')   ? 'high' :
                     alts.some(a => a.severity === 'medium') ? 'medium' : '';
      const badge  = alts.length
        ? ' <span class="ptf-alert-dot ' + (maxSev === 'high' ? 'risk-high' : maxSev === 'medium' ? 'risk-med' : '') + '">!</span>'
        : '';

      /* Color rules */
      const peNum   = (f.pe  != null && f.pe  !== 'N/A') ? Number(f.pe)  : null;
      const roeNum  = (f.roe != null && f.roe !== 'N/A') ? Number(f.roe) : null;
      const crNum   = (f.current_ratio != null && f.current_ratio !== 'N/A') ? Number(f.current_ratio) : null;
      const revNum  = (f.revenue_growth != null && f.revenue_growth !== 'N/A') ? Number(f.revenue_growth) : null;

      const peStyle  = peNum  != null && peNum > 100     ? ' class="num-dn"' : '';
      const roeStyle = roeNum != null && roeNum < 0      ? ' class="num-dn"' :
                       roeNum != null && roeNum > 0.15   ? ' class="num-up"' : '';
      const crStyle  = crNum  != null && crNum  < 1      ? ' class="num-dn" style="font-weight:600"' : '';
      const revStyle = revNum != null && revNum > 0      ? ' class="num-up"' :
                       revNum != null && revNum < 0      ? ' class="num-dn"' : '';

      /* Row-level highlight if any HIGH alert */
      const rowCls = maxSev === 'high' ? ' class="ptf-row-alert-high"' : maxSev === 'medium' ? ' class="ptf-row-alert-med"' : '';

      return (
        '<tr' + rowCls + '>' +
          '<td class="tk clickable" data-tk="' + f.ticker + '">' + f.ticker + badge + '</td>' +
          '<td class="ptf-name-col">' + escH((f.name || '').trim()) + '</td>' +
          '<td class="ptf-sector-col">' + escH(f.sector || '—') + '</td>' +
          '<td class="mono">' + (f.current_price != null ? fv(f.current_price, 2) : '—') + (f.currency && f.currency !== 'USD' ? '<span class="ptf-ccy-tag">' + f.currency + '</span>' : '') + '</td>' +
          '<td class="mono"' + peStyle  + '>' + fv(f.pe, 1) + '</td>' +
          '<td class="mono"' + roeStyle + '>' + fp(f.roe) + '</td>' +
          '<td class="mono">' + fp(f.profit_margin) + '</td>' +
          '<td class="mono"' + revStyle + '>' + fp(f.revenue_growth) + '</td>' +
          '<td class="mono">' + fv(f.debt_to_equity, 1) + '</td>' +
          '<td class="mono"' + crStyle  + '>' + fv(f.current_ratio, 2) + '</td>' +
          '<td class="mono">' + fv(f.beta, 2) + '</td>' +
          '<td class="mono">' + fmc(f.market_cap) + '</td>' +
        '</tr>'
      );
    }).join('');

    /* Skipped row */
    const skippedRow = skipped.length
      ? '<tr><td colspan="12" class="ptf-skipped-row">Skipped: ' +
          skipped.map(p => escH(p.ticker)).join(', ') +
          (skipped[0]?.reason ? ' (' + escH(skipped[0].reason) + ')' : '') +
        '</td></tr>'
      : '';

    /* Alert details sub-table */
    let alertDetails = '';
    if ((fund.alerts || []).length) {
      const drows = [];
      fund.alerts.forEach(a => {
        (a.alerts || []).forEach(al => {
          const sevCls = al.severity === 'high' ? 'risk-high' : al.severity === 'medium' ? 'risk-med' : '';
          drows.push(
            '<tr>' +
              '<td class="tk">' + escH(a.ticker) + '</td>' +
              '<td class="ptf-sector-col">' + escH(al.type || '') + '</td>' +
              '<td class="' + sevCls + '" style="font-weight:600">' + (al.severity || '').toUpperCase() + '</td>' +
              '<td>' + escH(al.message || '') + '</td>' +
            '</tr>'
          );
        });
      });
      alertDetails =
        '<div class="mod-panel-title" style="margin-top:10px">ALERT DETAILS</div>' +
        '<div class="tbl-wrap"><table class="tbl-dense">' +
          '<thead><tr><th>TICKER</th><th>TYPE</th><th>SEV</th><th>MESSAGE</th></tr></thead>' +
          '<tbody>' + drows.join('') + '</tbody>' +
        '</table></div>';
    }

    panel.innerHTML =
      banner +
      '<div class="tbl-wrap"><table class="tbl-dense ptf-fund-tbl">' +
        '<thead><tr>' +
          '<th>TICKER</th><th>NAME</th><th>SECTOR</th><th class="mono">PRICE</th>' +
          '<th class="mono">P/E</th><th class="mono">ROE</th><th class="mono">MARGIN</th>' +
          '<th class="mono">REV GRW</th><th class="mono">D/E</th><th class="mono">CUR RATIO</th>' +
          '<th class="mono">BETA</th><th class="mono">MKT CAP</th>' +
        '</tr></thead>' +
        '<tbody>' + (frows || '<tr><td colspan="12" class="empty">no data</td></tr>') + skippedRow + '</tbody>' +
      '</table></div>' +
      alertDetails;

    panel.querySelectorAll('.tk.clickable').forEach(el => {
      el.addEventListener('click', () => { if (el.dataset.tk && window.OC_OPEN_MODULE) window.OC_OPEN_MODULE('stock-analysis', { ticker: el.dataset.tk }); });
    });
  }

  /* ── renderAll ───────────────────────────────────────────── */
  function renderAll() {
    renderSummaryStrip();
    renderHoldings();
    renderVaR();
    renderMCR();
    renderLedger();
    renderTransactions();
    renderFundamentals();
    /* Update header chips */
    const accts = DATA?.positions?.accounts || [];
    const nHold = accts.reduce((s, a) => s + a.positions_count, 0);
    const last  = DATA?.positions?.last_updated || '—';
    const el    = _body.querySelector('#ptfChipLast');
    if (el) el.textContent = 'LAST · ' + last;
    const el2 = _body.querySelector('#ptfChipHold');
    if (el2) el2.textContent = 'HOLDINGS · ' + nHold;
  }

  /* ── renderUnlocked: scaffold + first render ─────────────── */
  async function renderUnlocked(body) {
    body.innerHTML = '<div class="mod-loading">Loading portfolio…</div>';
    _recalcEl  = null;
    clearInterval(_recalcPoll);

    let p;
    try {
      p = await api('GET', '/api/portfolio/dashboard');
    } catch (e) {
      clearToken(); TOKEN = '';
      return renderGate(body, 'Auth failed: ' + e.message + '. Re-enter token.');
    }
    DATA  = p;
    _body = body;

    const accts = p?.positions?.accounts || [];
    const nHold = accts.reduce((s, a) => s + a.positions_count, 0);
    const last  = p?.positions?.last_updated || '—';

    body.innerHTML =
      '<div class="mod-head">' +
        '<div class="mod-title">' + window.OC_TITLE('portfolio') + '</div>' +
        '<div class="mod-meta">' +
          '<span class="chip chip-unlocked">🔓 UNLOCKED</span>' +
          '<span class="chip">ACCTS · ' + accts.length + '</span>' +
          '<span class="chip" id="ptfChipHold">HOLDINGS · ' + nHold + '</span>' +
          '<span class="chip" id="ptfChipLast">LAST · ' + escH(last) + '</span>' +
          '<span class="chip chip-dim">' + fmt.ago(p?.generated_at) + '</span>' +
          '<button class="chip chip-btn" id="pfRecalc">⟳ RECALC</button>' +
          '<button class="chip chip-btn" id="pfLock">🔒 LOCK</button>' +
        '</div>' +
      '</div>' +

      '<div class="acct-strip" id="ptfAcctStrip"></div>' +

      '<div class="mod-grid-2">' +
        '<div class="mod-panel">' +
          '<div class="mod-panel-title">HOLDINGS</div>' +
          '<div id="ptfHoldingsPanel"></div>' +
        '</div>' +
        '<div class="mod-side">' +
          '<div class="mod-panel">' +
            '<div class="mod-panel-title">CASH &amp; P&amp;L</div>' +
            '<div id="ptfLedgerPanel"></div>' +
          '</div>' +
          '<div class="mod-panel">' +
            '<div class="mod-panel-title">MCR · RISK CONTRIBUTORS</div>' +
            '<div id="ptfMcrPanel"></div>' +
          '</div>' +
          '<div class="mod-panel">' +
            '<div class="mod-panel-title">TRANSACTIONS</div>' +
            '<div id="ptfTxnPanel"></div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="mod-panel">' +
        '<div class="mod-panel-title">VALUE AT RISK · 95% CONFIDENCE</div>' +
        '<div id="ptfVarPanel"></div>' +
      '</div>' +

      '<div class="mod-panel">' +
        '<div class="mod-panel-title">FUNDAMENTALS &amp; ALERTS</div>' +
        '<div id="ptfFundPanel"></div>' +
      '</div>';

    body.querySelector('#pfLock').onclick = () => {
      clearToken(); TOKEN = ''; DATA = null;
      renderGate(body, '');
    };
    body.querySelector('#pfRecalc').onclick = toggleRecalcPanel;

    renderAll();
  }

  /* ── Auth gate ───────────────────────────────────────────── */
  function renderGate(body, errMsg) {
    body.innerHTML =
      '<div class="auth-gate">' +
        '<div class="auth-lock">🔒</div>' +
        '<div class="auth-title">PORTFOLIO · LOCKED</div>' +
        '<div class="auth-sub">Enter access token to unlock. Data is not loaded until verified.</div>' +
        '<form class="auth-form" id="pfForm" autocomplete="off">' +
          '<input type="password" id="pfTok" class="auth-input" placeholder="access token" autocomplete="off" spellcheck="false">' +
          '<label class="auth-remember"><input type="checkbox" id="pfRemem" checked> remember for this session</label>' +
          '<button type="submit" class="auth-submit">UNLOCK</button>' +
        '</form>' +
        '<div class="auth-err" id="pfErr">' + escH(errMsg || '') + '</div>' +
        '<div class="auth-note">Token: env <code>PORTFOLIO_API_TOKEN</code> on stocks-app backend. Stored in sessionStorage only — cleared on tab close when "remember" is off.</div>' +
      '</div>';

    const form  = body.querySelector('#pfForm');
    const input = body.querySelector('#pfTok');
    const err   = body.querySelector('#pfErr');
    setTimeout(() => input?.focus(), 50);

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const token = input.value.trim();
      if (!token) { err.textContent = 'Token required.'; return; }
      err.textContent = 'verifying…';
      try {
        const r = await fetch(API + '/api/portfolio/verify-token', {
          headers: { 'Authorization': 'Bearer ' + token }, mode: 'cors', credentials: 'omit',
        });
        if (!r.ok) { err.textContent = 'Invalid token.'; return; }
        if (body.querySelector('#pfRemem')?.checked) setToken(token);
        TOKEN = token;
        await renderUnlocked(body);
      } catch (e2) { err.textContent = 'Error: ' + (e2.message || e2); }
    });
  }

  /* ── Entry ───────────────────────────────────────────────── */
  async function render(body) {
    const saved = getToken();
    if (!saved) return renderGate(body, '');
    TOKEN = saved;
    try {
      const r = await fetch(API + '/api/portfolio/verify-token', {
        headers: { 'Authorization': 'Bearer ' + TOKEN }, mode: 'cors', credentials: 'omit',
      });
      if (!r.ok) { clearToken(); TOKEN = ''; return renderGate(body, 'Stored token is invalid. Re-enter.'); }
      await renderUnlocked(body);
    } catch (e) {
      renderGate(body, 'Network error: ' + e.message);
    }
  }

  window.OC_MODULES = window.OC_MODULES || {};
  window.OC_MODULES.portfolio = { render };
})();
