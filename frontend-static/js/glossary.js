/* terminal.clawmo.tech — Glossary of abbreviated labels
   Single source of truth for the tooltip-auto helper.

   Format:
     KEY: { full: "Full Name",  def: "one-line definition" }

   KEY matching rules (in tooltip-auto.js):
     1. Explicit [data-glossary="key"] on an element — wins over text match.
     2. Whole-text match (trimmed, case-sensitive): e.g. `<th>WR</th>` → `WR`.
     3. First-word match: e.g. `<span>ENT $164.33</span>` → `ENT`.
     4. Uppercase fallback: e.g. `<span>avg ret</span>` → tries `avg ret`, then `AVG RET`.

   Add new entries here; do NOT inline title="…" in modules.
   For ambiguous labels, prefer per-module `data-glossary="foo-daily"` on the
   element and a keyed entry below (e.g. `chg-daily`).
*/
(function (g) {
  'use strict';

  const GLOSSARY = {
    /* ── Setups / signals pipeline (unique-to-us) ──────────── */
    'GD':        { full: 'Grade',                    def: 'Letter grade A–D based on profit factor (A ≥ 1.2, B ≥ 1.1, C ≥ 1.0, D < 1.0)' },
    'PAT':       { full: 'Pattern',                  def: 'Signal pattern name (e.g. VCP, bos, liquidity_sweep)' },
    'PATTERN':   { full: 'Pattern',                  def: 'Signal pattern name (e.g. VCP, bos, liquidity_sweep)' },
    'TOT':       { full: 'Total',                    def: 'Total signals fired for this pattern (active + closed)' },
    'CLS':       { full: 'Closed',                   def: 'Trades that have hit stop or target' },
    'WR':        { full: 'Win Rate',                 def: '% of closed trades that hit the target' },
    'AVG':       { full: 'Average',                  def: 'Average return per closed trade (not cumulative)' },
    'avg ret':   { full: 'Average Return',           def: 'Average return per closed trade' },
    'CONF':      { full: 'Confidence',               def: 'Model-scored setup confidence 0–100' },
    'DIR':       { full: 'Direction',                def: 'Long (▲) or short (▼) bias' },
    'TF':        { full: 'Timeframe',                def: 'Candle interval (1H, 4H, 1D, 1W)' },
    'ENT':       { full: 'Entry',                    def: 'Trigger price to enter the setup' },
    'ENTRY':     { full: 'Entry Price',              def: 'Trigger price to enter the setup' },
    'LAST':      { full: 'Last Price',               def: 'Most recent closing price; compare to entry, stop, and target to see where the trade stands' },
    'STP':       { full: 'Stop Loss',                def: 'Exit price if trade moves against us' },
    'STOP':      { full: 'Stop Loss',                def: 'Exit price if trade moves against us; below entry for longs, above for shorts' },
    'TGT':       { full: 'Take Profit',              def: 'Target exit price for a winning trade' },
    'R:R':       { full: 'Risk : Reward Ratio',      def: '(target − entry) ÷ (entry − stop); higher is better, ≥ 2 preferred' },
    'occ':       { full: 'Occurrences',              def: 'Number of times this pattern has fired historically' },
    'P&L%':      { full: 'Profit & Loss %',          def: 'Return % since entry (live setups) or at close (closed setups)' },
    'POS $':     { full: 'Position Size ($)',         def: 'Dollar amount allocated to this trade: shares × entry price' },
    'RISK $':    { full: 'Dollar Risk',               def: 'Maximum dollar loss if price reaches the stop: (entry − stop) × shares' },
    'SHARES':    { full: 'Share Count',               def: 'Number of shares (shares offered in an IPO; position-sizer allocation in trade tables)' },
    'UNRL %':    { full: 'Unrealized P&L %',          def: 'Open trade return %: (last price − entry) ÷ entry × 100; negative = underwater' },
    'UNRL $':    { full: 'Unrealized P&L ($)',        def: 'Open trade profit/loss in dollars: (last price − entry) × shares' },
    'EXIT':      { full: 'Exit Type',                 def: 'How the trade was closed: TP = take-profit hit, SL = stop-loss hit, MANUAL = forced close, EARLY = pre-target exit' },
    'EXIT $':    { full: 'Exit Price ($)',             def: 'Price at which the trade was closed (capped at TP or SL level)' },
    'RET %':     { full: 'Return %',                  def: 'Realized return % for this closed trade: (exit − entry) ÷ entry × 100' },
    'P&L $':     { full: 'Profit & Loss ($)',         def: 'Realized dollar gain or loss for this closed trade: (exit − entry) × shares' },
    'OUTCOME':   { full: 'Trade Outcome',             def: 'WIN = hit take-profit, LOSS = hit stop-loss, BE = breakeven, MANUAL = closed before target or stop' },

    /* ── Backtest / performance statistics ───────────────── */
    'PF':          { full: 'Profit Factor',            def: 'Gross profit ÷ gross loss across all closed trades; ≥ 1.1 passes our quality gate, ≥ 1.2 earns grade A' },
    'BT N':        { full: 'Backtest Sample Size',     def: 'Number of historical occurrences used in the backtest (the more, the more reliable the PF estimate)' },
    'BT PF':       { full: 'Backtest Profit Factor',   def: 'Profit factor from historical simulation only (no live trades); the starting point before live data adjusts the blend' },
    'BT WR':       { full: 'Backtest Win Rate',        def: 'Win rate from historical simulation only; % of backtest trades that hit the take-profit target' },
    'LIVE N':      { full: 'Live Trades Closed',       def: 'Trades closed since real-time signal tracking went live; most patterns start at 0 and fill over time' },
    'LIVE PF':     { full: 'Live Profit Factor',       def: 'Profit factor from actual closed trades since tracking went live; given more weight as sample size grows' },
    'LIVE WR':     { full: 'Live Win Rate',            def: 'Win rate from actual closed live trades; % that hit the take-profit target in real-time' },
    'LIVE AVG':    { full: 'Live Average Return',      def: 'Mean return % per closed live trade (positive = profitable on average)' },
    'BLEND PF':    { full: 'Blended Profit Factor',    def: 'Weighted average of backtest PF and live PF; weight shifts toward live data as live sample size grows' },
    'BLEND WR':    { full: 'Blended Win Rate',         def: 'Weighted average of backtest WR and live WR using the same blend weights as BLEND PF' },
    'WEIGHTS':     { full: 'Blend Weights',            def: 'Fraction of backtest vs live data used in the blended score, e.g. "80/20" = 80% backtest, 20% live' },
    'EXP':         { full: 'Expectancy',               def: 'Average P&L per trade: (WR × avg win) − ((1 − WR) × avg loss); positive = edge exists' },
    'AVG WIN':     { full: 'Average Winning Return',   def: 'Mean return % of trades that hit the take-profit target' },
    'AVG LOSS':    { full: 'Average Losing Return',    def: 'Mean return % of trades that hit the stop-loss (negative number)' },
    'SHARPE':      { full: 'Sharpe Ratio',             def: 'Risk-adjusted return: avg trade return ÷ std-dev of returns; > 0.5 considered decent, > 1 strong' },
    'MAX DD':      { full: 'Maximum Drawdown',         def: 'Largest peak-to-trough equity decline across the backtest; lower (less negative) is better' },
    'HOLD':        { full: 'Average Holding Period',   def: 'Mean number of trading days a position was open before hitting target or stop' },
    'REGIME LOCK': { full: 'Regime Lock',              def: 'Pattern is restricted to fire only in the named market regime (BULL / CAUTION / BEAR); fires are suppressed in other regimes' },
    'BULL ↗':      { full: 'Bull Regime PF',           def: 'Profit factor for this pattern when it fired during a BULL regime (breadth score ≥ 65, all 4 health checks passing)' },
    'CAUTION →':   { full: 'Caution Regime PF',        def: 'Profit factor for this pattern when it fired during a CAUTION regime (mixed health checks, transitional market)' },
    'BEAR ↘':      { full: 'Bear Regime PF',           def: 'Profit factor for this pattern when it fired during a BEAR regime (breadth score < 40, multiple health checks failing)' },
    'NOTES':       { full: 'Notes',                    def: 'Downgrade reason or status flag — shown when a pattern\'s grade has been adjusted from its raw PF-based grade' },

    /* ── Chart / trend lights ─────────────────────────────── */
    'vs ENT':    { full: 'vs Entry',                 def: 'Distance from the entry trigger price, %' },
    'vs STP':    { full: 'vs Stop',                  def: 'Distance from the stop-loss level, %' },
    'vs TGT':    { full: 'vs Target',                def: 'Distance from the take-profit target, %' },
    'vs SMA':    { full: 'vs SMA 200',               def: 'Distance from the 200-day simple moving average, %' },
    'vs LAST':   { full: 'vs Last Close',            def: 'Distance from the latest available close, %' },
    'TREND':     { full: 'Trend',                    def: 'Directional trend: green = improving / bullish alignment (EMA+RSI+MACD up in TA tables; indicator deteriorating → better in macro tables), red = worsening / bearish' },

    /* ── Technical indicators (common-finance + clarifications) */
    'SMA50':     { full: '50-Day Simple Moving Average' },
    'SMA200':    { full: '200-Day Simple Moving Average' },
    'MA50':      { full: '50-Day Moving Average' },
    'MA100':     { full: '100-Day Moving Average' },
    'MA200':     { full: '200-Day Moving Average' },
    'RSI(14)':   { full: 'Relative Strength Index (14-period)', def: '0–100 momentum; > 70 overbought, < 30 oversold' },
    'MACD':      { full: 'Moving Average Convergence/Divergence', def: '12 EMA − 26 EMA; > 0 = bullish' },
    'MACD sig':  { full: 'MACD Signal Line',         def: '9-day EMA of MACD' },
    'MACD hist': { full: 'MACD Histogram',           def: 'MACD − signal line; > 0 = momentum up' },
    'ATR':       { full: 'Average True Range',       def: '14-day volatility; used for stop sizing' },
    'BB upper':  { full: 'Bollinger Band Upper',     def: '+2σ above the 20-day SMA' },
    'BB mid':    { full: 'Bollinger Band Middle',    def: '20-day SMA' },
    'BB lower':  { full: 'Bollinger Band Lower',     def: '−2σ below the 20-day SMA' },
    'Vol ratio': { full: 'Volume Ratio',             def: 'Current volume ÷ 20-day average volume' },
    'RVOL':      { full: 'Relative Volume',          def: 'Volume ÷ average volume over prior periods; > 1 = heavy' },
    'MFI':       { full: 'Money Flow Index',         def: 'Volume-weighted RSI (0–100); > 80 overbought, < 20 oversold' },
    'CMF':       { full: 'Chaikin Money Flow',       def: 'Smart-money flow (−1 to +1); positive = accumulation' },
    'POC':       { full: 'Point of Control',         def: 'Volume-weighted modal price over the last 3 months — where the most shares actually changed hands. A proxy for the institutional cost basis.' },
    'POC ZONE':  { full: 'POC Zone',                 def: 'Price is within ±5% of the 3-month Point of Control — you would be entering at the same price the volume-weighted majority paid. Adds +10 to score.' },
    'CLUSTER':   { full: 'Insider Cluster',          def: '≥2 distinct insiders bought ≥$250K total in the last 7 trading days. Stronger conviction than a single insider buy. Adds +5 to score.' },
    'INS CLUSTER': { full: 'Insider Cluster',        def: '≥2 distinct insiders bought ≥$250K total in the last 7 trading days. Stronger conviction than a single insider buy. Adds +5 to score.' },
    'β':         { full: 'Beta',                     def: 'Sensitivity to the market; 1.0 = moves with the market' },

    /* ── Valuation (common-finance) ───────────────────────── */
    'P/E':         { full: 'Price-to-Earnings' },
    'Forward P/E': { full: 'Forward Price-to-Earnings', def: 'Price ÷ next-year EPS estimate' },
    'P/B':         { full: 'Price-to-Book' },
    'P/S':         { full: 'Price-to-Sales' },
    'PEG':         { full: 'P/E to Growth',          def: 'Forward P/E ÷ expected earnings growth; < 1 attractive' },
    'EPS':         { full: 'Earnings Per Share' },
    'Div yield':   { full: 'Dividend Yield',         def: 'Annual dividend ÷ price' },
    'Rev (B)':     { full: 'Revenue (Billions USD)' },
    'Rev growth':  { full: 'Revenue Growth YoY' },
    'Gross margin':{ full: 'Gross Margin',           def: '(Revenue − COGS) ÷ Revenue' },
    'Profit margin':{ full: 'Net Profit Margin',     def: 'Net income ÷ Revenue' },
    'ROE':         { full: 'Return on Equity' },
    'ROA':         { full: 'Return on Assets' },
    'Debt/Eq':     { full: 'Debt-to-Equity Ratio' },
    'Curr ratio':  { full: 'Current Ratio',          def: 'Current assets ÷ current liabilities' },
    'Book val':    { full: 'Book Value per Share' },
    'MCAP':        { full: 'Market Capitalization' },
    'MKT CAP':     { full: 'Market Capitalization',      def: 'Total market value of all outstanding shares (share price × shares outstanding)' },
    'MARGIN':      { full: 'Net Profit Margin',          def: 'Net income ÷ revenue; how much of each dollar of revenue flows to profit' },
    'REV GRW':     { full: 'Revenue Growth (YoY)',       def: 'Year-over-year revenue growth rate' },
    'D/E':         { full: 'Debt-to-Equity Ratio',       def: 'Total debt ÷ shareholders\' equity; < 1 conservative, > 2 high leverage' },
    'CUR RATIO':   { full: 'Current Ratio',              def: 'Current assets ÷ current liabilities; < 1 = potential short-term liquidity stress, > 2 = comfortable buffer' },

    // ── Sector Rotation (RRG / JdK) ──
    'RRG_ETF':     { full: 'Sector ETF',                 def: 'SPDR sector ETF ticker (XLK Tech, XLV Health Care, XLF Financials, XLY Consumer Disc, XLC Comm Svcs, XLI Industrials, XLP Cons Staples, XLE Energy, XLRE Real Estate, XLB Materials, XLU Utilities)' },
    'RRG_Q':       { full: 'Rotation Quadrant',          def: 'Leading (R≥100, M≥100): outperforming and accelerating. Improving (R<100, M≥100): underperforming but turning up. Weakening (R≥100, M<100): outperforming but decelerating. Lagging (R<100, M<100): underperforming and falling further' },
    'RRG_RATIO':   { full: 'JdK RS-Ratio',               def: 'Relative-strength of the sector vs the benchmark (SPY), normalized so 100 = neutral. > 100 = outperforming the benchmark, < 100 = underperforming. Trend component of RRG (x-axis)' },
    'RRG_MOM':     { full: 'JdK RS-Momentum',            def: 'Rate-of-change of the RS-Ratio, normalized so 100 = neutral. > 100 = relative strength is accelerating, < 100 = decelerating. Momentum component of RRG (y-axis)' },
    'RRG_WKS':     { full: 'Weeks in Quadrant',          def: 'Consecutive weeks the sector has remained in its current rotation quadrant. Long runs in Leading or Lagging tend to mean-revert; fresh entries (1–2 wks) often signal active rotation' },
    'RRG_CROSS':   { full: 'Just-Crossed Flag',          def: 'Marks sectors whose rotation quadrant changed in the last 1–2 weeks — the alpha events of an RRG. Examples: Lagging→Improving (early reversal), Leading→Weakening (loss of momentum)' },
    'BETA':        { full: 'Beta',                       def: 'Sensitivity to the broad market; 1.0 = moves in lockstep, > 1 = amplified moves, < 1 = dampened, < 0 = inverse' },
    'EV/EBITDA':   { full: 'Enterprise Value ÷ EBITDA' },
    'GM%':         { full: 'Gross Margin %' },
    'OM%':         { full: 'Operating Margin %' },
    'NM%':         { full: 'Net Margin %' },
    'DIV':         { full: 'Dividend Yield' },
    'SCTR':        { full: 'StockCharts Technical Rank', def: 'Composite TA rank (0–100) across long/medium/short-term components' },
    '%ILE':        { full: 'Percentile',              def: 'Rank as percentile within the universe (0–100)' },
    'RS':          { full: 'Relative Strength',       def: 'Price return vs. the benchmark (usually SPY); > 0 = outperforming' },
    'SP500 P/E':   { full: 'S&P 500 Price-to-Earnings' },
    'Shiller CAPE':{ full: 'Shiller Cyclically Adjusted P/E', def: 'Price ÷ 10-year inflation-adjusted avg earnings' },
    'Buffett Indicator': { full: 'Buffett Indicator', def: 'Market Cap ÷ GDP; > 150% typically considered expensive' },

    /* ── Portfolio / risk (unique-to-us) ──────────────────── */
    'avg-cost':    { full: 'Average Cost Basis',         def: 'Average price paid per share across all lots (weighted by quantity); compare to LAST to gauge unrealized P&L direction' },
    'ACCOUNT':     { full: 'Account',                    def: 'Brokerage account name (RRSP, TFSA, LIRA, US)' },
    'CCY':         { full: 'Currency',                   def: 'Account or position currency (CAD or USD); values are shown in this currency' },
    'VaR 1D $':    { full: '1-Day Value at Risk ($)',    def: 'Maximum expected 1-day dollar loss at 95% confidence; 1-in-20 chance of losing more than this in a single day' },
    'VaR 1D %':    { full: '1-Day Value at Risk (%)',    def: 'VaR 1D expressed as % of account value; easier to compare across accounts of different sizes' },
    'VaR 1W $':    { full: '1-Week Value at Risk ($)',   def: 'Maximum expected 1-week dollar loss at 95% confidence (≈ 1D VaR × √5)' },
    'VaR 1W %':    { full: '1-Week Value at Risk (%)',   def: 'VaR 1W expressed as % of account value' },
    'RISK':        { full: 'Risk Level',                 def: 'Overall risk rating for this account derived from VaR relative to account size (LOW / MED / HIGH)' },
    'CASH':        { full: 'Cash Balance',               def: 'Uninvested cash in the account (settled funds)' },
    'REALIZED':    { full: 'Realized P&L',               def: 'Cumulative profit/loss locked in by closing positions; not affected by current market prices' },
    'UNREALIZED':  { full: 'Unrealized P&L',             def: 'Mark-to-market gain/loss on open positions; changes with every price move' },
    'TOTAL':       { full: 'Total P&L',                  def: 'Realized + unrealized P&L combined' },
    'DIVS':        { full: 'Dividends',                  def: 'Dividend income received in this account' },
    'TK':          { full: 'Ticker',                     def: 'Stock ticker symbol (abbreviated column header)' },
    '$':           { full: 'Dollar Amount',              def: 'Dollar value of the transaction (price × quantity)' },
    'SEV':         { full: 'Severity',                   def: 'Alert severity level: INFO (informational), WARN (attention needed), ERROR (action required)' },
    'MESSAGE':     { full: 'Alert Message',              def: 'Description of the alert condition' },
    'ACCT':        { full: 'Account',                 def: 'Brokerage account name (RRSP / TFSA / US / …)' },
    'QTY':         { full: 'Quantity',                def: 'Number of shares or units held' },
    'WT':          { full: 'Weight',                  def: 'Portfolio weight (% of total capital in this position)' },
    'WT%':         { full: 'Weight %',                def: 'Position size as % of this account' },
    'MCR':         { full: 'Marginal Contribution to Risk', def: 'How much this position drives total portfolio VaR' },
    'P&L$':        { full: 'Profit & Loss ($)',       def: 'Realized + unrealized P&L in account currency' },
    'VaR₁w':       { full: 'Value at Risk (1 week)',  def: 'Maximum 1-week expected loss at 95% confidence' },

    /* ── Breadth / market (common + shorthand) ────────────── */
    'SP':          { full: 'S&P 500 Breadth',         def: '% of S&P 500 constituents above 50-day MA' },
    'QQ':          { full: 'Nasdaq 100 Breadth',      def: '% of Nasdaq 100 constituents above 50-day MA' },
    'EW':          { full: 'Equal-Weighted',          def: 'Index variant where every stock has equal weight' },
    'CW':          { full: 'Cap-Weighted',            def: 'Index variant where weights scale with market cap' },
    'EW / CW SPREAD': { full: 'Equal-weight vs Cap-weight Spread', def: 'Positive = equal-weight beating cap-weight (broad rally); negative = mega-caps dragging breadth' },
    '20D TREND':   { full: '20-Day Trend',            def: 'Sparkline of the last 20 trading days' },

    /* ── Stockbee Market Monitor ─────────────────────────── */
    'T2108':       { full: 'T2108 (% Above 40-Day MA)', def: '% of NYSE stocks trading above their 40-day moving average; contrarian — < 20 = oversold bounce setup, > 80 = overbought pullback risk' },
    'UP 4%':       { full: 'Stocks Up ≥4% Today',     def: 'Count of US stocks gaining ≥4% on the day; spikes mark momentum thrust / breadth surge days' },
    'DN 4%':       { full: 'Stocks Down ≥4% Today',   def: 'Count of US stocks falling ≥4% on the day; spikes mark distribution or panic days' },
    'R5D':         { full: '5-Day Up/Down Ratio',      def: 'Cumulative ≥4%-up movers ÷ ≥4%-down movers over the last 5 sessions; ≥ 1.5 = up thrust, ≤ 0.67 = down thrust' },
    'R10D':        { full: '10-Day Up/Down Ratio',     def: 'Same as R5D but measured over the last 10 trading sessions; smoother signal, same thrust thresholds' },
    'UP 25%M':     { full: 'Stocks Up ≥25% in Month', def: 'Count of US stocks up ≥25% over the last calendar month; elevated = strong trend-following / speculative participation' },
    'DN 25%M':     { full: 'Stocks Down ≥25% in Month', def: 'Count of US stocks down ≥25% over the last calendar month; elevated = broad distribution or sector washout' },

    /* ── Sentiment / macro ───────────────────────────────── */
    'CNN F&G':     { full: 'CNN Fear & Greed Index',  def: '0–100 composite US-market sentiment (0 extreme fear, 100 extreme greed)' },
    'Crypto F&G':  { full: 'Crypto Fear & Greed Index', def: '0–100 crypto-market sentiment' },
    'AAII bull-bear spread': { full: 'AAII Bull-Bear Spread', def: 'AAII survey: bullish % − bearish %' },
    '10Y UST':     { full: '10-Year US Treasury Yield' },
    '10y-2y':      { full: '10y–2y Yield Spread',     def: '10-year − 2-year Treasury; negative = inverted (classic recession signal)' },
    'earnings yield': { full: 'Earnings Yield',       def: '1 / (Forward P/E); comparable to bond yields' },

    /* ── Precious metals / central bank holdings ────────── */
    'RANK':        { full: 'Rank',                       def: 'Position in the ranking (1 = largest holder)' },
    'COUNTRY':     { full: 'Country',                    def: 'Country or institution holding the gold reserves' },
    'TONNES':      { full: 'Gold Holdings (Metric Tonnes)', def: 'Total official gold reserves in metric tonnes; source: World Gold Council / IMF IFS' },
    '% RESERVES':  { full: '% of Total Reserves',        def: 'Gold as a share of the country\'s total foreign exchange reserves; high % = greater reliance on gold as reserve asset' },
    'AS OF':       { full: 'Data As Of',                 def: 'Date of the most recent data for this row; WGC/IMF figures are reported monthly with a 1–2 month lag' },

    /* ── COT (CFTC Commitments of Traders) ──────────────── */
    'INSTRUMENT':  { full: 'Futures Instrument',         def: 'The futures contract being tracked (e.g. 10Y T-Note, E-mini S&P 500, Gold)' },
    'CATEGORY':    { full: 'Asset Category',             def: 'Asset class of this futures instrument (Rates, Equity, Commodities, FX, etc.)' },
    'OI':          { full: 'Open Interest',              def: 'Total number of outstanding (unsettled) futures contracts; proxy for market participation and liquidity' },
    'NET SPEC':    { full: 'Net Speculator Position',    def: 'Speculator longs − speculator shorts; positive = net long (bullish bias), negative = net short (bearish). Extreme readings are contrarian signals' },
    'NET COMM':    { full: 'Net Commercial Position',    def: 'Commercial longs − commercial shorts; commercials are hedgers/producers. Net-comm ≈ −net-spec (COT is zero-sum across all participants)' },
    'SPEC L':      { full: 'Speculator Longs',           def: 'Number of long contracts held by non-commercial speculators (hedge funds, CTAs, managed money)' },
    'SPEC S':      { full: 'Speculator Shorts',          def: 'Number of short contracts held by non-commercial speculators; rising spec shorts = bearish positioning' },
    'COMM L':      { full: 'Commercial Longs',           def: 'Number of long contracts held by commercials (producers, end-users, hedgers with direct exposure to the underlying)' },
    'COMM S':      { full: 'Commercial Shorts',          def: 'Number of short contracts held by commercials; elevated comm shorts = producers hedging into strength (often contrarian bullish)' },

    /* ── Options / GEX (jargon-heavy) ────────────────────── */
    'SPOT':        { full: 'Spot Price',              def: 'Current underlying price' },
    'P/C':         { full: 'Put/Call Ratio',          def: 'Puts ÷ calls open interest; > 1 = bearish skew' },
    'IV':          { full: 'Implied Volatility',      def: 'Option-implied annualized σ; higher = bigger expected move' },
    'IVR':         { full: 'IV Rank',                 def: 'Where current IV sits in its 52-week range: (IV − 52w low) ÷ (52w high − 52w low) × 100. >80 = expensive (sell premium), <20 = cheap (buy premium)' },
    'IVP':         { full: 'IV Percentile',           def: '% of past 252 trading days where IV was below today\'s level. 70 = IV was cheaper on 70% of days — currently elevated' },
    'GEX':         { full: 'Gamma Exposure',          def: 'Total dealer gamma in $; positive = price-pinning, negative = trend-amplifying' },
    'TOTAL POSITIVE GEX': { full: 'Total Positive GEX', def: 'Sum of strikes where dealers are long gamma (stabilizing)' },
    'TOTAL NEGATIVE GEX': { full: 'Total Negative GEX', def: 'Sum of strikes where dealers are short gamma (amplifying)' },
    'NET MARKET GEX': { full: 'Net Market GEX',       def: 'Positive − negative; sign determines regime' },
    'POS / NEG RATIO': { full: 'Positive / Negative GEX Ratio' },

    /* ── Calendar: Earnings tab ──────────────────────────── */
    'EPS EST':     { full: 'EPS Estimate',               def: 'Consensus analyst estimate for earnings per share this quarter' },
    'EPS ACT':     { full: 'Actual EPS',                 def: 'Earnings per share as reported by the company; compare to EPS EST for surprise direction' },
    'SURP%':       { full: 'Earnings Surprise %',        def: '(Actual EPS − Estimated EPS) ÷ |Estimated EPS| × 100; positive = beat, negative = miss' },
    'REV EST':     { full: 'Revenue Estimate',           def: 'Consensus analyst estimate for quarterly revenue' },
    'REV ACT':     { full: 'Actual Revenue',             def: 'Revenue as reported by the company for the quarter' },

    /* ── Calendar (economic events) ──────────────────────── */
    'act':         { full: 'Actual',                  def: 'Actual reported value' },
    'est':         { full: 'Estimate',                def: 'Consensus analyst estimate' },
    'prev':        { full: 'Previous',                def: 'Previous period value' },

    /* ── News / external ─────────────────────────────────── */
    'CNT':         { full: 'Count',                   def: 'Mention count in this period' },
    'SENT':        { full: 'Sentiment Score',         def: 'Average article sentiment: −1 bearish → +1 bullish' },
    'DISC':        { full: 'Discount',                def: '% below the sector-median valuation ratio' },
    'MED':         { full: 'Median',                  def: 'Sector median of this ratio' },

    /* ── Time-range headers (appear widely) ──────────────── */
    'YTD':         { full: 'Year-to-Date' },
    '1D':          { full: '1-Day Change' },
    '1W':          { full: '1-Week Change' },
    '1M':          { full: '1-Month Change' },
    '1H':          { full: '1-Hour Change' },
    '24H':         { full: '24-Hour Change' },
    '7D':          { full: '7-Day Change' },
    'CUM':         { full: 'Cumulative',              def: 'Sum/compound across the full period' },
    'rebased 100': { full: 'Rebased to 100',          def: 'Series scaled so the starting value = 100, for clean cross-series comparison' },

    /* ── FIN DCF (discounted cash flow) ─────────────────── */
    'WACC':        { full: 'Weighted Average Cost of Capital', def: 'Blended cost of equity + after-tax cost of debt; the discount rate applied to future cash flows' },
    'GROWTH':      { full: 'Growth Rate (Year 1)',            def: 'Expected FCF growth in year 1 of the projection; fades toward terminal growth over subsequent years' },
    'FADE':        { full: 'Fade Rate',                       def: 'Each year, growth moves this fraction of the way from current growth toward terminal growth (smooths the convergence)' },
    'TGROWTH':     { full: 'Terminal Growth Rate',            def: 'Long-run perpetual growth (typically 2-3% ≈ GDP) used in the Gordon-growth terminal value formula' },
    'NPV':         { full: 'Net Present Value',               def: 'Sum of future cash flows discounted back to today' },
    'EV':          { full: 'Enterprise Value',                def: 'Market cap + total debt − cash; value of the whole business regardless of capital structure' },
    'TV':          { full: 'Terminal Value',                  def: 'Gordon-growth perpetuity capturing all cash flows past the explicit projection horizon' },
    'FCF':         { full: 'Free Cash Flow',                  def: 'Operating cash flow minus capital expenditure; the cash truly available to investors' },

    /* ── HLD module: institutional holdings + insider + Congress ── */
    '13F':         { full: 'Form 13F',                        def: 'SEC quarterly filing disclosing US equity holdings of institutional investment managers with $100M+ AUM; filed 45 days post-quarter-end' },
    'CUSIP':       { full: 'CUSIP Number',                    def: 'Committee on Uniform Securities ID (9-char US/Canada securities identifier); used to link a ticker to its 13F filings' },
    'INSIDER SENTIMENT': { full: 'Insider Sentiment',         def: 'Aggregate direction of recent Form 4 filings: bullish if net-buying, bearish if net-selling' },
    'INSIDER NET FLOW':  { full: 'Insider Net $ Flow',        def: 'Total insider buy value minus sell value over the observed window' },
    'CONGRESS ACTIVITY': { full: 'Congressional Trading',     def: 'Senate + House disclosed trades in this ticker (STOCK Act); 1-3 week disclosure lag' },
    'TX':          { full: 'Transaction Type',                def: 'Buy / Sale / Exercise; derived from SEC Form 4 or Congressional disclosure' },
    'RANGE':       { full: 'Disclosed Dollar Range',          def: 'Congress discloses trade size in bands (e.g. $1,001–$15,000), not exact amounts' },
    'DIST':        { full: 'District',                        def: 'Congressional district (e.g. CA31 = California 31st) or state for senators' },
    'SEC':         { full: 'SEC Form 4',                      def: 'Statement of Changes in Beneficial Ownership — mandatory within 2 business days of an insider transaction' },
    'CHAMBER':     { full: 'Congressional Chamber',           def: 'Senate (100 members) or House (435 members)' },
    'DISCLOSED':   { full: 'Disclosure Date',                 def: 'Date the trade was disclosed to the public (typically 1-3 weeks after the actual trade)' },

    /* ── FIN module: statement line items + ratios ──────── */
    'R&D':         { full: 'Research & Development',  def: 'Expenditure on R&D; flows through operating expenses' },
    'SG&A':        { full: 'Selling, General & Administrative', def: 'Overhead: sales, marketing, admin, rent — non-R&D operating cost' },
    'EBIT':        { full: 'Earnings Before Interest & Tax',    def: 'Operating income before interest expense and taxes' },
    'EBITDA':      { full: 'Earnings Before Interest, Tax, Depreciation & Amortization', def: 'Cash-like operating profit; removes accounting depreciation' },
    'D&A':         { full: 'Depreciation & Amortization',       def: 'Non-cash expense spreading asset cost over useful life' },
    'SBC':         { full: 'Stock-Based Compensation',          def: 'Non-cash compensation via shares/options; dilutes existing shareholders' },
    'CapEx':       { full: 'Capital Expenditure',               def: 'Cash spent on long-term assets (PP&E); subtracts from OCF to get FCF' },
    'PP&E':        { full: 'Property, Plant & Equipment',       def: 'Physical long-term assets on the balance sheet' },
    'ROIC':        { full: 'Return on Invested Capital',        def: 'Operating profit ÷ (equity + debt); measures efficiency of all capital' },
    'ROCE':        { full: 'Return on Capital Employed' },
    'FCF':         { full: 'Free Cash Flow',                    def: 'Operating CF − CapEx; cash available to shareholders/creditors' },
    'OCF':         { full: 'Operating Cash Flow',               def: 'Cash generated from core business operations' },

    /* ── Screener result columns ────────────────────────────── */
    'REV 1Y':      { full: 'Revenue Growth (1 Year)',           def: 'Year-over-year revenue growth rate over the trailing 12 months' },
    'RET 1Y':      { full: '1-Year Price Return',               def: 'Total price return over the past 12 months (not annualized)' },
    'SECTOR':      { full: 'Industry Sector',                   def: 'GICS sector classification (e.g. Technology, Healthcare, Industrials)' },
    'PE':          { full: 'P/E Ratio',                         def: 'Price ÷ trailing 12-month earnings per share; compare to sector median (MED) to assess relative cheapness' },
    'DE':          { full: 'Debt-to-Equity Ratio',              def: 'Total debt ÷ shareholders\' equity; < 1 conservative, > 2 high leverage' },
    'WEIGHT':      { full: 'Portfolio Weight',                  def: 'Fraction of simulated capital allocated to this position by the portfolio optimizer' },
    'RC%':         { full: 'Risk Contribution %',               def: 'This position\'s share of total portfolio variance; high RC% = concentrated risk, used to cap individual positions' },
    'VOL':         { full: 'Annualized Volatility',             def: 'Annualized standard deviation of daily returns; used for position sizing and risk budgeting' },

    /* ── Deep Value score composition ───────────────────────── */
    'COMPOSITE':   { full: 'Composite Score',                   def: 'Weighted aggregate of VAL, ROE, GROWTH, and HEALTH sub-scores (0–100); ≥ 75 qualifies as a deep-value pick' },
    'dv-val':      { full: 'Valuation Sub-score',               def: '0–100 score measuring cheapness vs sector peers on P/E, P/B, P/S; higher = trading at a bigger discount to peers' },
    'dv-growth':   { full: 'Growth Sub-score',                  def: '0–100 score measuring revenue and earnings growth quality; penalizes negative or sharply decelerating growth' },
    'HEALTH':      { full: 'Financial Health Sub-score',        def: '0–100 score based on balance sheet strength: current ratio, debt levels, and interest coverage' },
    'DCF RATIO':   { full: 'DCF Value Ratio',                   def: 'DCF intrinsic value ÷ current market price; > 1 = price below fair value (margin of safety), < 1 = overvalued vs DCF' },
    'DCF PENALTY': { full: 'DCF Overvaluation Penalty',         def: 'Score reduction applied to COMPOSITE when the stock looks overvalued vs DCF (ratio < 1); larger = more overvalued' },

    /* ── Value Traps ─────────────────────────────────────────── */
    'TYPE':        { full: 'Type',                              def: 'Category label (transaction type, alert type, trap type — depends on the table)' },
    'trap-type':   { full: 'Value Trap Type',                   def: 'Category of trap flag: momentum (price below 200d SMA), altman_z (bankruptcy risk), negative_equity, dividend_trap, forward_pe_revision, legacy' },
    'FLAG REASON': { full: 'Flag Reason',                       def: 'Plain-text explanation of why this stock was flagged as a potential value trap and excluded from picks' },

    /* Returns period labels (FIN Returns tab) */
    '1Y':          { full: '1-Year Total Return',               def: 'Price-plus-dividend return, 1 year (cumulative, not annualized)' },
    '3Y':          { full: '3-Year Total Return' },
    '5Y':          { full: '5-Year Total Return' },
    '10Y':         { full: '10-Year Total Return' },
    'ALPHA':       { full: 'Alpha vs Benchmark',                def: 'Return in excess of the S&P 500 over the same period (ticker return − SPY return)' },
    'TICKER':      { full: 'Ticker Symbol',                     def: 'Exchange-listed stock symbol (e.g. AAPL, NVDA)' },
    'ticker-return': { full: 'Ticker Return',                   def: 'Total return for this ticker (price + dividends) over the period' },

    /* FIN ratio category headers */
    'PROFITABILITY': { full: 'Profitability Ratios',            def: 'How efficiently the company converts revenue into profit' },
    'LIQUIDITY':     { full: 'Liquidity Ratios',                def: 'Ability to cover short-term obligations' },
    'SOLVENCY':      { full: 'Solvency Ratios',                 def: 'Ability to cover long-term debt obligations' },
    'EFFICIENCY':    { full: 'Efficiency Ratios',               def: 'How well the company uses its assets' },

    /* ── Recession / macro indicator columns ────────────────── */
    'INDICATOR':   { full: 'Indicator Name',             def: 'Name of the leading economic indicator (e.g. Yield Curve, Sahm Rule, HY OAS)' },
    'VALUE':       { full: 'Current Value',              def: 'Latest reading of the indicator or series' },

    /* ── Common table columns ───────────────────────────────── */
    'DATE':        { full: 'Date',                       def: 'Date of the event or signal' },
    'PRICE':       { full: 'Price',                      def: 'Per-share price (offer price for IPOs; closing price at signal date for smart-money signals)' },
    'COMPANY':     { full: 'Company Name',               def: 'Full legal or trading name of the company' },
    'INDUSTRY':    { full: 'Industry',                   def: 'Finviz/GICS industry sub-group within a sector (more granular than sector)' },
    'EXCH':        { full: 'Exchange',                   def: 'Exchange where the stock is listed or will begin trading (NYSE, NASDAQ, AMEX, etc.)' },

    /* ── Generic fallbacks for terms that show up in many tables ── */
    'CHG':         { full: 'Change',                  def: '% change vs. prior close (unless the table header specifies a window)' },
    'VAL':         { full: 'Value',                   def: 'Current value of the series' },
    'Δ':           { full: 'Delta',                   def: 'Difference from expected / benchmark value' },
    'NAME':        { full: 'Name',                    def: 'Full company or series name' },
    'SCORE':       { full: 'Signal Score',            def: 'Composite strength of the signal (higher = stronger)' },
    'STATUS':      { full: 'Status',                  def: 'Current state of the position or signal' },
    'SYMBOL':      { full: 'Symbol',                  def: 'Trading symbol' },
    'SYM':         { full: 'Symbol' },
    'YIELD':       { full: 'Yield',                   def: 'Annualized yield of the bond at the current price' },
    'MATURITY':    { full: 'Maturity',                def: 'Years until the bond principal is repaid' },
    'SIGNAL':      { full: 'Signal',                  def: 'Categorical state or indicator label' },

    /* ── Smart Money module — composite score interpretation ── */
    'SMY-SCORE':   { full: 'Smart Money Composite Score', def: '0–100 institutional flow strength. Inputs: volume spike + MFI + OBV + CMF + relative volume, with +10 for POC zone and +5 for insider cluster. ≥80 strong accumulation, ≥65 accumulation, ≤35 distribution, ≤20 strong distribution.' },
    'SMY-SIGNAL':  { full: 'Smart Money Signal Label', def: 'Categorical bucket for the composite score: STRONG ACCUMULATION (≥80), ACCUMULATION (≥65), NEUTRAL (50–64), DISTRIBUTION (≤35), STRONG DISTRIBUTION (≤20). Hover the cell for the full reason.' },
    'SMY-POC':     { full: 'Distance from 3M Point of Control (%)', def: 'Signed % from price to 3-month POC. 0 = at the institutional cost basis. Negative = price below POC (you would buy cheaper than the volume-weighted average). |distance| ≤ 5% triggers POC ZONE and a +10 score boost.' },
    'SMY-CLUSTER': { full: 'Insider Cluster Flag',    def: '✓ when ≥2 insiders bought ≥$250K of this ticker in the last 7 days. — when no cluster detected. Source: latest_buys in insider-trades.json.' },
    /* ── v3.1 Wyckoff distribution + ETF flow ── */
    'FLOW-SCORE':  { full: 'Distribution Warning Score', def: 'v3.1: 0–100 distribution warning. High Flow⚠ + high Score = ORDERLY DISTRIBUTION (Heaton signal). Inputs: 18d vol-vs-price slope divergence, Wyckoff churn bars, extension streak, ETF flow %.' },
    'ORDERLY-DIST':{ full: 'Orderly Distribution',       def: 'Smart money distributing while keeping price elevated. Detected when accumulation Score ≥65 AND Flow Warning ≥60 simultaneously. Classic Heaton/Wyckoff late-stage distribution.' },
    'VOL-DIV':     { full: 'Volume Trend Divergence',    def: '18-day price slope positive AND volume slope negative >1%/day. Rally on shrinking participation — APs distributing into retail bid. Rising price + falling volume = demand exhaustion.' },
    'CHURN':       { full: 'Wyckoff Churn Bars',         def: 'Heavy volume (≥1.5× 20d avg) + tight body/range (<30%) + close in lower half. Supply absorbing demand at top. ≥2 in 10 sessions = late-stage warning.' },
    'STREAK':      { full: 'Up-Day Streak',              def: 'Consecutive up-days ending today. ≥10 = stretched (late-stage), ≥14 = extreme (4σ rare). SOXX hit 18 days in April 2026 — the probability under fair odds is 1-in-262,000.' },
    'ETF-FLOW-5D': { full: 'ETF 5-Day Net Flow',         def: 'ETFs only: net creation/redemption as % of AUM over 5 days. Negative = APs redeeming = smart money exit. <−5% = significant outflow. Collects daily 16:31 ET; meaningful from day 7.' },
    'SECTOR-FLOW': { full: 'Sector ETF Flow Override',   def: 'For stocks: 5-day flow on the parent sector ETF (e.g. SOXX for semis, XLK for tech). When sector bleeds >3% AUM, individual stock conviction downgrades one tier regardless of OBV.' },
    'SECTOR-ROTATION': { full: 'Sector Rotation Δ (S/F)', def: 'Day-over-day delta in the heatmap. S±N = accumulation score change vs prior day (green=rising, red=falling). F±N = distribution warning change — INVERTED color: rising F = sector entering distribution (red=bad), falling F = warning easing (green=good). Available from day 2 onward.' },

    'TAG':         { full: 'Universe Tag',            def: 'PORTFOLIO = your holdings · MACRO = sector/market ETFs · RADAR = S&P 500 + top 50 foreign ADRs by market cap' },
    'SECTOR':      { full: 'GICS Sector',             def: 'Global Industry Classification Standard sector (e.g. Technology, Healthcare, Financials). Useful for spotting which sectors are seeing institutional flows.' },

    /* ── Trump Monitor ───────────────────────────────────── */
    'SHARE':       { full: 'Share of Total',             def: '% of all signals in the 60-day window accounted for by this signal type' },
    'trp-wt':      { full: 'Market-Impact Weight',       def: 'ClawMo\'s scoring of the signal\'s directional market impact: positive (red) = bearish, negative (green) = bullish (deals/negotiation), zero = neutral' },
    'START (UTC)': { full: 'Silence Start (UTC)',        def: 'Timestamp when the posting gap began (UTC); convert to ET by subtracting 4–5 hours' },
    'END (UTC)':   { full: 'Silence End (UTC)',          def: 'Timestamp when posting resumed after the gap' },
    'DURATION':    { full: 'Silence Duration',           def: 'Length of the posting gap in hours; gaps > 24h (red) often precede market-moving announcements' },

    /* ── Ambiguous: resolved by data-glossary attribute ──── */
    'chg-daily':   { full: 'Daily Change',            def: '% change vs. prior close' },
    'chg-weekly':  { full: 'Weekly Change',           def: '% change over the last 5 trading days' },
    'chg-ytd':     { full: 'Year-to-Date Change',     def: '% change since Jan 1' },
    'avg-return-per-trade': { full: 'Average Return per Trade', def: 'Mean return across all closed trades (not compounded)' },
    'risk-delta':  { full: 'Risk Delta',              def: 'Deviation of this position\'s risk contribution from the target risk budget' },
    'position-count': { full: 'Position Count',       def: 'Number of positions held in this account' },
    'val-current': { full: 'Current Value',           def: 'Most recent value of the series' },
    'rs-rank':     { full: 'Relative Strength Rank',  def: 'Percentile rank of price return vs. benchmark' },

    /* ── Prediction markets (Kalshi / Polymarket) ───────── */
    'MARKET':      { full: 'Market Question',            def: 'The event or question being traded on (e.g. "Will the Fed cut in June?"); resolves YES or NO' },
    'ODDS':        { full: 'Implied Probability',        def: 'Market-derived probability the event resolves YES (0–100%); derived from the last traded contract price' },
    '24H VOL':     { full: '24-Hour Volume',             def: 'Dollar value of contracts traded in the last 24 hours; higher = more liquid and more conviction behind the current odds' },
    'CLOSE':       { full: 'Resolution Date',            def: 'Date this market closes and contracts settle (YES pays $1, NO pays $0)' },

    /* ── Crypto derivatives ─────────────────────────────── */
    'funding rate':      { full: 'Funding Rate',       def: 'Perpetual futures funding payment; positive = longs pay shorts (crowded long)' },
    'long/short ratio':  { full: 'Long / Short Ratio', def: 'Long positions ÷ short positions on major venues' },
    'BTC DOMINANCE':     { full: 'Bitcoin Dominance',  def: 'BTC market cap ÷ total crypto market cap' },

    /* ── GEO module (Strait of Hormuz AIS) ──────────────── */
    'MMSI':         { full: 'Maritime Mobile Service Identity', def: '9-digit IMO-standardized number uniquely assigned to each vessel\'s AIS transponder; format: MID (3 digits) + 6 digits' },
    'LAT':          { full: 'Latitude',                def: 'Position in decimal degrees North; Hormuz ranges roughly 23.5°–28.0°N' },
    'LON':          { full: 'Longitude',               def: 'Position in decimal degrees East; Hormuz ranges roughly 53.5°–58.5°E' },
    'geo-ship-type':{ full: 'AIS Ship Type',           def: 'Vessel category derived from the VesselFinder ht field (mp2 flags bits 4–7): Tanker, Cargo, Special (tugs/service), Military, or Unknown' },
    'geo-count':    { full: 'Named Vessel Count',      def: 'Number of vessels of this type identified by name in the current AIS snapshot (unnamed vessels tracked separately in SFL pings)' },
    'geo-share':    { full: 'Share of Named Vessels',  def: '% of identified vessels belonging to this ship type in the current snapshot' },
    'geo-avg-spd':  { full: 'Average Speed (kts)',     def: 'Mean speed over ground in knots for vessels of this type; VesselFinder public API does not expose speed — shown where available only' },
    'SFL':          { full: 'SFL Position Pings',      def: 'VesselFinder sfl endpoint: total AIS transponder pings in the bounding box including unnamed vessels; more complete than the named mp2 count' },
    'COG':          { full: 'Course Over Ground',      def: 'True compass bearing of the vessel\'s actual movement (0° = North, 90° = East, 180° = South, 270° = West); derived from GPS track, not compass heading' },
    'geo-flow':     { full: 'Transit Flow',            def: 'Entering = westbound through Hormuz into the Persian Gulf (COG 225°–315°); Leaving = eastbound out to Gulf of Oman (COG 45°–135°); — = in-port, intra-Gulf run, or no heading data' },
  };

  g.OC_GLOSSARY = {
    /* Lookup a key. Returns { full, def } or null. */
    get: function (key) {
      if (!key) return null;
      return GLOSSARY[key] || GLOSSARY[key.toUpperCase()] || GLOSSARY[key.toLowerCase()] || null;
    },
    /* Render a browser-tooltip string (shown in the native title="…" box). */
    format: function (entry) {
      if (!entry) return '';
      return entry.def ? (entry.full + ' — ' + entry.def) : entry.full;
    },
    /* Raw table for anyone who wants to build a /glossary.html page later. */
    all: function () { return GLOSSARY; },
  };
})(window);
