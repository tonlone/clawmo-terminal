/* dcf-core.js — canonical DCF model shared by stocks.clawmo.tech and
   terminal.clawmo.tech. MUST stay byte-identical across both apps; enforced by
   backend/check_shared_frontend_parity.sh (stocks-app is canonical).

   Model: years 1-5 grow at `growth`; years 6-10 fade linearly from `growth` to
   `fade` (the year-10 growth rate); terminal value = Gordon growth at `terminal`.
   Fixed 10-year explicit horizon. `fade` is a growth TARGET (the year-10 rate),
   not a decay speed.

   _dcfCalc(params):
     params  = { baseFCF, growth, fade, terminal, wacc, debt, cash, shares }
     returns = { projections:[{year,growth,fcf,df,pv}], pvFCF, tv, pvTV, ev,
                 equity, fairValue, tvPct } */
function _dcfCalc(params) {
  var baseFCF = params.baseFCF, gr = params.growth, fade = params.fade;
  var tg = params.terminal, wacc = params.wacc;
  var debt = params.debt, cash = params.cash, shares = params.shares;

  // Guard: terminal must be < wacc
  if (tg >= wacc) tg = wacc - 0.005;

  var projections = [];
  var fcf = baseFCF;

  // Years 1-5: high growth
  for (var yr = 1; yr <= 5; yr++) {
    fcf = fcf * (1 + gr);
    var df = 1 / Math.pow(1 + wacc, yr);
    projections.push({ year: yr, growth: gr, fcf: fcf, df: df, pv: fcf * df });
  }

  // Years 6-10: growth fades linearly from the high growth rate (gr) to the Fade
  // Rate slider (the year-10 growth). Terminal growth (tg) applies only to the
  // perpetuity below — matches the help text and makes the Fade slider live.
  for (var yr2 = 6; yr2 <= 10; yr2++) {
    var fp = (yr2 - 5) / 5;
    var cg = gr + (fade - gr) * fp;
    fcf = fcf * (1 + cg);
    var df2 = 1 / Math.pow(1 + wacc, yr2);
    projections.push({ year: yr2, growth: cg, fcf: fcf, df: df2, pv: fcf * df2 });
  }

  // Terminal value (Gordon Growth)
  var tvFCF = fcf * (1 + tg);
  var tv = tvFCF / (wacc - tg);
  var pvTV = tv / Math.pow(1 + wacc, 10);

  var pvFCF = 0;
  for (var i = 0; i < projections.length; i++) pvFCF += projections[i].pv;
  var ev = pvFCF + pvTV;
  var equity = ev - (debt || 0) + (cash || 0);
  var fairValue = shares ? equity / shares : 0;

  return {
    projections: projections, pvFCF: pvFCF,
    tv: tv, pvTV: pvTV, ev: ev,
    equity: equity, fairValue: fairValue,
    tvPct: ev > 0 ? (pvTV / ev * 100) : 0
  };
}

function _dcfFmtCurrency(v) {
  if (v == null) return '—';
  var abs = Math.abs(v);
  var sign = v < 0 ? '-' : '';
  if (abs >= 1e12) return sign + '$' + (abs / 1e12).toFixed(1) + 'T';
  if (abs >= 1e9) return sign + '$' + (abs / 1e9).toFixed(1) + 'B';
  if (abs >= 1e6) return sign + '$' + (abs / 1e6).toFixed(1) + 'M';
  return sign + '$' + abs.toLocaleString();
}
