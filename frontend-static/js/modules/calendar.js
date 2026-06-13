/* CAL — Calendar
 * 4 tabs: Economic · Earnings · M&A · IPO
 * Today's date row highlighted in each tab.
 * Economic tab keeps impact filter (ALL / MEDIUM+ / HIGH-only).
 */
(function () {
  'use strict';
  const { fetchJSON, fmt } = window.OC_DATA;

  const IMPACT_FILTERS = [
    { id: 'all',    label: 'ALL',     min: 1 },
    { id: 'medium', label: 'MEDIUM+', min: 2 },
    { id: 'high',   label: '●●● HIGH ONLY', min: 3 },
  ];

  function escCal(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // Today's date in America/New_York (ET) as YYYY-MM-DD
  function _etDate() {
    try {
      const parts = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/New_York' }).formatToParts(new Date());
      const y = parts.find(p => p.type === 'year').value;
      const m = parts.find(p => p.type === 'month').value;
      const day = parts.find(p => p.type === 'day').value;
      return `${y}-${m}-${day}`;
    } catch (e) { return new Date().toISOString().slice(0, 10); }
  }

  function impactDots(n) {
    const c = Math.max(0, Math.min(3, Number(n) || 0));
    return '<span class="cal-impact">' + '●'.repeat(c) + '<span class="cal-impact-dim">' + '●'.repeat(3 - c) + '</span></span>';
  }
  function sentCls(s) {
    // calendar.json sentiment is the string 'beat'/'miss'/'inline'
    // (direction-aware: beat = good news). Numeric path kept as fallback.
    if (s == null) return '';
    if (s === 'beat') return 'num-up';
    if (s === 'miss') return 'num-dn';
    if (typeof s !== 'number') return '';
    return s > 0.2 ? 'num-up' : s > 0 ? 'num-up-soft' : s < -0.2 ? 'num-dn' : s < 0 ? 'num-dn-soft' : '';
  }

  // Date-group helper: group [{date, ...}] by date, return ordered list [{date, items}]
  function groupByDate(arr, dateKey) {
    const buckets = {};
    arr.forEach(x => {
      const d = x[dateKey || 'date'];
      if (!d) return;
      if (!buckets[d]) buckets[d] = [];
      buckets[d].push(x);
    });
    return Object.keys(buckets).sort().map(d => ({ date: d, items: buckets[d] }));
  }
  // Friendly weekday label for a YYYY-MM-DD date string
  function weekdayLabel(ymd) {
    try {
      const dt = new Date(ymd + 'T12:00:00Z');
      return dt.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
    } catch (e) { return ''; }
  }

  async function render(body, ctx) {
    body.innerHTML = `<div class="mod-loading">Loading calendar…</div>`;
    try {
      // Fetch all 4 calendar sources + 2 reference sources for sector/industry
      // enrichment (earnings calendar doesn't include sector data; we join from
      // heatmap + screener which together cover ~600 unique major tickers).
      const [eco, earn, ma, ipo, hm, scr] = await Promise.all([
        fetchJSON('https://stocks.clawmo.tech/data/calendar.json'),
        fetchJSON('https://stocks.clawmo.tech/data/earnings-calendar.json').catch(() => null),
        fetchJSON('https://stocks.clawmo.tech/data/ma-calendar.json').catch(() => null),
        fetchJSON('https://stocks.clawmo.tech/data/ipo-calendar.json').catch(() => null),
        fetchJSON('https://stocks.clawmo.tech/data/heatmap.json').catch(() => null),
        fetchJSON('https://stocks.clawmo.tech/data/screener_index.json').catch(() => null),
      ]);

      // Build ticker → {sector, industry} lookup. Prefer screener data
      // (more deliberate categorization) over heatmap (broader coverage).
      const tickerInfo = {};
      if (hm && hm.sectors) {
        Object.values(hm.sectors).forEach(secObj => {
          (secObj.stocks || []).forEach(s => {
            if (s.ticker) tickerInfo[s.ticker] = { sector: s.sector, industry: s.subSector };
          });
        });
      }
      if (scr && Array.isArray(scr.stocks)) {
        scr.stocks.forEach(s => {
          if (s.ticker) tickerInfo[s.ticker] = { sector: s.sector, industry: s.industry };
        });
      }

      const today = _etDate();
      const initialTab = (ctx && ctx.params && ctx.params.calTab) || 'economic';
      const initialImpact = (ctx && ctx.params && ctx.params.calImpact) || 'all';
      const initialEarnRegion = (ctx && ctx.params && ctx.params.calEarnRegion) || 'us';
      const state = { tab: initialTab, impact: initialImpact, earnRegion: initialEarnRegion };

      // Region detection: Canadian listings have specific suffixes; everything
      // else (including ADRs + bare-ticker foreign names) treated as US since
      // they trade on US exchanges.
      function isCanadian(ticker) {
        if (!ticker) return false;
        return /\.(TO|V|CN|NE|TSX)$/i.test(ticker);
      }
      // Normalize company names to dedupe preferred share classes (e.g. AGNC,
      // AGNCL, AGNCM all → "agnc investment"). Strips legal-entity suffixes
      // and punctuation.
      function normalizeName(s) {
        return String(s || '').toLowerCase()
          .replace(/[,.()]/g, ' ')
          .replace(/\b(corporation|incorporated|company|limited|holdings?|group|trust)\b/g, '')
          .replace(/\b(corp|inc|co|ltd|llc|plc|sa|nv|ag|adr)\b/g, '')
          .replace(/\s+/g, ' ').trim();
      }

      // Pre-compute counts for the tab pills
      const dayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
      const ecoEvents = [];
      dayOrder.forEach(day => {
        const events = (eco.days?.[day]?.events) || [];
        events.forEach(e => ecoEvents.push({ ...e, _date: eco.days[day].date }));
      });
      const earnAll = [];
      if (earn && earn.days) {
        dayOrder.forEach(day => {
          const events = (earn.days[day]?.events) || [];
          events.forEach(e => earnAll.push(e));
        });
      }
      const maAll = (ma && ma.deals) || [];
      const ipoAll = (ipo && ipo.ipos) || [];

      const counts = {
        economic: ecoEvents.length,
        earnings: earnAll.length,
        ma: maAll.length,
        ipo: ipoAll.length,
      };
      const todayCounts = {
        economic: ecoEvents.filter(e => e._date === today).length,
        earnings: earnAll.filter(e => e.date === today).length,
        ma: maAll.filter(d => d.date === today).length,
        ipo: ipoAll.filter(i => i.date === today).length,
      };

      // ── Economic content (preserves the existing 5-day column layout) ──
      function buildEconomic() {
        const filterRow = IMPACT_FILTERS.find(f => f.id === state.impact) || IMPACT_FILTERS[0];
        const minImpact = filterRow.min;
        const cnt = { all: 0, medium: 0, high: 0 };
        ecoEvents.forEach(e => {
          const imp = Number(e.impact) || 0;
          cnt.all++;
          if (imp >= 2) cnt.medium++;
          if (imp >= 3) cnt.high++;
        });
        const filterBtns = IMPACT_FILTERS.map(f => `
          <button class="cal-filter-btn${f.id === state.impact ? ' active' : ''}" data-cal-impact="${f.id}" type="button">${f.label} · ${cnt[f.id]}</button>
        `).join(' ');
        const dayCols = dayOrder.map(day => {
          const info = eco.days?.[day] || {};
          const events = (Array.isArray(info.events) ? info.events : [])
            .filter(e => (Number(e.impact) || 0) >= minImpact);
          const isToday = info.date === today;
          const items = events.map(e => `
            <div class="cal-item cal-evt">
              <span class="cal-time">${escCal(e.time || '—')}</span>
              <span class="cal-evt-body ${sentCls(e.sentiment)}">${escCal(e.event || '—')}</span>
              ${impactDots(e.impact)}
              <span class="cal-nums">
                ${e.actual    != null ? `<span class="mono">act ${escCal(String(e.actual))}${escCal(e.unit || '')}</span>`  : ''}
                ${e.estimate  != null ? `<span class="mono">est ${escCal(String(e.estimate))}${escCal(e.unit || '')}</span>` : ''}
                ${e.previous  != null ? `<span class="mono cal-prev">prev ${escCal(String(e.previous))}${escCal(e.unit || '')}</span>` : ''}
              </span>
            </div>
          `).join('');
          const totalForDay = (Array.isArray(info.events) ? info.events : []).length;
          const shownNote = events.length < totalForDay ? ` <span style="color:var(--fg-dim)">(${events.length}/${totalForDay})</span>` : '';
          const todayMark = isToday ? '<span class="cal-today-pill">▼ TODAY</span> ' : '';
          return `
            <div class="mod-panel cal-day${isToday ? ' cal-day-today' : ''}">
              <div class="mod-panel-title">${todayMark}${day} · ${escCal(info.date || '')} · ${events.length} events${shownNote}</div>
              ${items || '<div class="cal-empty">no events match filter</div>'}
            </div>
          `;
        }).join('');
        return `
          <div class="cal-toolbar">
            <span class="cal-toolbar-lbl">IMPACT FILTER</span>
            ${filterBtns}
          </div>
          <div class="cal-week">${dayCols}</div>
        `;
      }

      // ── Earnings content ──
      function buildEarnings() {
        if (!earn || !earnAll.length) return '<div class="cal-empty">no earnings data</div>';

        // Region filter
        const region = state.earnRegion;
        const filtered = earnAll.filter(e => {
          if (region === 'us') return !isCanadian(e.symbol);
          if (region === 'ca') return isCanadian(e.symbol);
          return true; // 'all'
        });
        // Region sub-tab counts (from full earnAll, ignoring region filter)
        const regionCounts = {
          all: earnAll.length,
          us:  earnAll.filter(e => !isCanadian(e.symbol)).length,
          ca:  earnAll.filter(e => isCanadian(e.symbol)).length,
        };
        const regionTabs = [
          { id: 'us',  label: 'US' },
          { id: 'ca',  label: 'Canada' },
          { id: 'all', label: 'All' },
        ];
        const regionBar = `
          <div class="cal-toolbar">
            <span class="cal-toolbar-lbl">MARKET</span>
            ${regionTabs.map(r => `<button class="cal-filter-btn${r.id === region ? ' active' : ''}" data-cal-earn-region="${r.id}" type="button">${r.label} · ${regionCounts[r.id]}</button>`).join(' ')}
          </div>
        `;

        // Dedup by normalized company name within each date group.
        // Keep shortest ticker as primary; collect other tickers as siblings.
        function dedupByName(items) {
          const seen = new Map();
          items.forEach(e => {
            const key = normalizeName(e.name) || e.symbol;
            const existing = seen.get(key);
            if (!existing) {
              seen.set(key, { primary: e, siblings: [] });
            } else {
              // pick the shorter ticker as primary
              if ((e.symbol || '').length < (existing.primary.symbol || '').length) {
                existing.siblings.push(existing.primary.symbol);
                existing.primary = e;
              } else {
                existing.siblings.push(e.symbol);
              }
            }
          });
          return [...seen.values()];
        }

        const grouped = groupByDate(filtered, 'date');
        const tables = grouped.map(g => {
          const isToday = g.date === today;
          const wk = weekdayLabel(g.date);
          const todayMark = isToday ? '<span class="cal-today-pill">▼ TODAY</span> ' : '';
          const dedupGroup = dedupByName(g.items);
          // Sort by sector for clustering visibility, then by symbol
          dedupGroup.sort((a, b) => {
            const sa = (tickerInfo[a.primary.symbol] || {}).sector || 'zzz';
            const sb = (tickerInfo[b.primary.symbol] || {}).sector || 'zzz';
            if (sa !== sb) return sa.localeCompare(sb);
            return (a.primary.symbol || '').localeCompare(b.primary.symbol || '');
          });
          const rows = dedupGroup.map(grp => {
            const e = grp.primary;
            const sym = e.symbol || '—';
            const info = tickerInfo[sym] || {};
            const sector = info.sector || '—';
            const industry = info.industry || '—';
            const sibBadge = grp.siblings.length > 0
              ? `<span class="cal-share-badge" title="Also: ${escCal(grp.siblings.join(', '))}">+${grp.siblings.length}</span>`
              : '';
            const surpCls = e.surprisePct == null ? '' : e.surprisePct > 0 ? 'num-up' : e.surprisePct < 0 ? 'num-dn' : '';
            return `
              <tr>
                <td><span class="tk clickable" data-tk="${escCal(sym)}">${escCal(sym)}</span>${sibBadge}</td>
                <td class="pat">${escCal((e.name || '—').slice(0, 32))}</td>
                <td class="pat" style="font-size:10px">${escCal(sector)}</td>
                <td class="pat" style="font-size:10px;color:var(--fg-dim)">${escCal((industry || '').slice(0, 28))}</td>
                <td class="mono">${e.epsEstimated != null ? '$' + Number(e.epsEstimated).toFixed(2) : '—'}</td>
                <td class="mono">${e.epsActual != null ? '$' + Number(e.epsActual).toFixed(2) : '—'}</td>
                <td class="mono ${surpCls}">${e.surprisePct != null ? (e.surprisePct >= 0 ? '+' : '') + Number(e.surprisePct).toFixed(1) + '%' : '—'}</td>
                <td class="mono">${e.revenueEstimated != null ? '$' + fmt.compact(e.revenueEstimated) : '—'}</td>
                <td class="mono">${e.revenueActual != null ? '$' + fmt.compact(e.revenueActual) : '—'}</td>
              </tr>
            `;
          }).join('');
          const dedupNote = dedupGroup.length < g.items.length
            ? ` <span style="color:var(--fg-dim);font-weight:400">(${dedupGroup.length} unique, ${g.items.length - dedupGroup.length} share-class duplicates collapsed)</span>`
            : '';
          return `
            <div class="mod-panel${isToday ? ' cal-day-today' : ''}">
              <div class="mod-panel-title">${todayMark}${wk} · ${escCal(g.date)} · ${dedupGroup.length} earnings${dedupNote}</div>
              <div class="tbl-wrap"><table class="tbl-dense">
                <thead><tr>
                  <th>SYM</th><th>COMPANY</th><th>SECTOR</th><th>INDUSTRY</th>
                  <th class="num">EPS EST</th><th class="num">EPS ACT</th><th class="num">SURP%</th>
                  <th class="num">REV EST</th><th class="num">REV ACT</th>
                </tr></thead>
                <tbody>${rows}</tbody>
              </table></div>
            </div>
          `;
        }).join('');
        return regionBar + tables;
      }

      // ── M&A content ──
      function buildMA() {
        if (!ma || !maAll.length) return '<div class="cal-empty">no M&amp;A data</div>';
        const sorted = [...maAll].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        // groupByDate sorts date groups ascending — reverse for newest-first
        const grouped = groupByDate(sorted, 'date').reverse();
        return grouped.map(g => {
          const isToday = g.date === today;
          const wk = weekdayLabel(g.date);
          const todayMark = isToday ? '<span class="cal-today-pill">▼ TODAY</span> ' : '';
          const rows = g.items.map(deal => `
            <tr>
              <td class="tk clickable" data-tk="${escCal(deal.acquirer)}">${escCal(deal.acquirer)}</td>
              <td class="pat">${escCal((deal.acquirerName || '—').slice(0, 32))}</td>
              <td style="color:var(--fg-dim);font-family:var(--font-mono);font-size:10px">→ acquires</td>
              <td class="tk clickable" data-tk="${escCal(deal.target)}">${escCal(deal.target)}</td>
              <td class="pat">${escCal((deal.targetName || '—').slice(0, 32))}</td>
              <td>${deal.secLink ? `<a href="${escCal(deal.secLink)}" target="_blank" rel="noopener" class="cal-sec-link">SEC ↗</a>` : ''}</td>
            </tr>
          `).join('');
          return `
            <div class="mod-panel${isToday ? ' cal-day-today' : ''}">
              <div class="mod-panel-title">${todayMark}${wk} · ${escCal(g.date)} · ${g.items.length} deals</div>
              <div class="tbl-wrap"><table class="tbl-dense">
                <thead><tr><th>ACQUIRER</th><th>NAME</th><th></th><th>TARGET</th><th>NAME</th><th>FILING</th></tr></thead>
                <tbody>${rows}</tbody>
              </table></div>
            </div>
          `;
        }).join('');
      }

      // ── IPO content ──
      function buildIPO() {
        if (!ipo || !ipoAll.length) return '<div class="cal-empty">no IPO data</div>';
        const sorted = [...ipoAll].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        const grouped = groupByDate(sorted, 'date');
        return grouped.map(g => {
          const isToday = g.date === today;
          const wk = weekdayLabel(g.date);
          const todayMark = isToday ? '<span class="cal-today-pill">▼ TODAY</span> ' : '';
          const rows = g.items.map(i => {
            const statusCls = i.status === 'Priced' ? 'num-up' : i.status === 'Withdrawn' ? 'num-dn' : '';
            return `<tr>
              <td class="tk clickable" data-tk="${escCal(i.symbol)}">${escCal(i.symbol)}</td>
              <td class="pat">${escCal((i.company || '—').slice(0, 36))}</td>
              <td class="mono">${escCal(i.exchange || '—')}</td>
              <td class="mono">${escCal(i.priceRange || '—')}</td>
              <td class="mono">${i.shares != null ? fmt.compact(i.shares) : '—'}</td>
              <td class="mono">${i.marketCap != null ? '$' + fmt.compact(i.marketCap) : '—'}</td>
              <td class="mono ${statusCls}">${escCal(i.status || '—')}</td>
            </tr>`;
          }).join('');
          return `
            <div class="mod-panel${isToday ? ' cal-day-today' : ''}">
              <div class="mod-panel-title">${todayMark}${wk} · ${escCal(g.date)} · ${g.items.length} IPOs</div>
              <div class="tbl-wrap"><table class="tbl-dense">
                <thead><tr><th>SYM</th><th>COMPANY</th><th>EXCH</th><th>PRICE</th><th class="num">SHARES</th><th class="num">MCAP</th><th>STATUS</th></tr></thead>
                <tbody>${rows}</tbody>
              </table></div>
            </div>
          `;
        }).join('');
      }

      function buildContent() {
        switch (state.tab) {
          case 'earnings': return buildEarnings();
          case 'ma':       return buildMA();
          case 'ipo':      return buildIPO();
          default:         return buildEconomic();
        }
      }

      const tabs = [
        { id: 'economic', label: 'Economic' },
        { id: 'earnings', label: 'Earnings' },
        { id: 'ma',       label: 'M&A' },
        { id: 'ipo',      label: 'IPO' },
      ];
      const tabBtns = tabs.map(t => `
        <button class="cal-tab-btn${t.id === state.tab ? ' active' : ''}" data-cal-tab="${t.id}" type="button">
          ${t.label} · <span class="mono">${counts[t.id]}</span>${todayCounts[t.id] > 0 ? ` · <span class="cal-tab-today">${todayCounts[t.id]} today</span>` : ''}
        </button>
      `).join('');

      const weekRange = (eco.week_start && eco.week_end) ? `${eco.week_start} → ${eco.week_end}` :
                        (ipo && ipo.month_start) ? `${ipo.month_start} → ${ipo.month_end}` : '';

      body.innerHTML = `
        <style>
          [data-mod-panel="cal"] .cal-tabs { display:flex; gap:4px; margin-bottom:8px; flex-wrap:wrap; }
          [data-mod-panel="cal"] .cal-tab-btn {
            background:var(--bg-card); color:var(--fg-dim); border:1px solid var(--border);
            padding:4px 10px; font-size:10px; font-family:var(--font-mono);
            cursor:pointer; border-radius:3px; letter-spacing:0.4px;
          }
          [data-mod-panel="cal"] .cal-tab-btn:hover { color:var(--fg); border-color:#555; }
          [data-mod-panel="cal"] .cal-tab-btn.active { background:var(--accent); color:#0d1117; border-color:var(--accent); }
          [data-mod-panel="cal"] .cal-tab-today { color:var(--accent); font-weight:700; }
          [data-mod-panel="cal"] .cal-tab-btn.active .cal-tab-today { color:#0d1117; }

          [data-mod-panel="cal"] .cal-toolbar {
            display:flex; gap:6px; align-items:center; margin-bottom:8px; flex-wrap:wrap;
          }
          [data-mod-panel="cal"] .cal-toolbar-lbl {
            font-size:9px; color:var(--fg-dim); text-transform:uppercase; letter-spacing:0.5px; margin-right:4px;
          }
          [data-mod-panel="cal"] .cal-filter-btn {
            background:#0d1117; color:var(--fg-dim); border:1px solid #30363d;
            padding:2px 8px; font-size:9px; font-family:var(--font-mono);
            cursor:pointer; border-radius:3px; letter-spacing:0.4px;
          }
          [data-mod-panel="cal"] .cal-filter-btn:hover { color:var(--fg); border-color:#555; }
          [data-mod-panel="cal"] .cal-filter-btn.active { background:var(--accent); color:#0d1117; border-color:var(--accent); }

          [data-mod-panel="cal"] .cal-day-today {
            border-left:3px solid var(--accent) !important;
            box-shadow: 0 0 0 1px rgba(229,185,76,0.18);
          }
          [data-mod-panel="cal"] .cal-today-pill {
            display:inline-block; background:var(--accent); color:#0d1117;
            padding:1px 6px; border-radius:2px; font-size:9px; font-weight:700;
            font-family:var(--font-mono); letter-spacing:0.5px; margin-right:4px;
          }
          [data-mod-panel="cal"] .cal-sec-link {
            color:var(--accent); font-family:var(--font-mono); font-size:9px;
            text-decoration:none; padding:1px 4px; border:1px solid rgba(229,185,76,0.35); border-radius:2px;
          }
          [data-mod-panel="cal"] .cal-sec-link:hover { background:rgba(229,185,76,0.12); }
          [data-mod-panel="cal"] .cal-more-note {
            font-size:10px; color:var(--fg-dim); padding:4px 8px; font-style:italic;
          }
          [data-mod-panel="cal"] .cal-share-badge {
            display:inline-block; margin-left:4px; padding:0 4px; font-size:9px;
            background:rgba(140,140,140,0.22); color:var(--fg-dim); border-radius:2px;
            font-family:var(--font-mono); cursor:help;
          }
        </style>

        <div class="mod-head" data-mod-panel="cal">
          <div class="mod-title">${window.OC_TITLE('calendar')} · ${escCal(weekRange)}</div>
          <div class="mod-meta">
            <span class="chip chip-dim">today: ${escCal(today)}</span>
            <span class="chip chip-dim">${fmt.ago(eco.generated_at)}</span>
          </div>
        </div>

        <div data-mod-panel="cal">
          <div class="cal-tabs">${tabBtns}</div>
          <div class="cal-content" data-cal-content>${buildContent()}</div>
        </div>
      `;

      function repaint() {
        const wrap = body.querySelector('[data-cal-content]');
        if (wrap) wrap.innerHTML = buildContent();
        body.querySelectorAll('.cal-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.calTab === state.tab));
        bindClicks();
      }

      function bindClicks() {
        body.querySelectorAll('.cal-filter-btn[data-cal-impact]').forEach(btn => {
          btn.addEventListener('click', () => {
            state.impact = btn.dataset.calImpact;
            if (window.OC_UPDATE_PANE_PARAMS) window.OC_UPDATE_PANE_PARAMS({ calImpact: state.impact });
            repaint();
          });
        });
        body.querySelectorAll('.cal-filter-btn[data-cal-earn-region]').forEach(btn => {
          btn.addEventListener('click', () => {
            state.earnRegion = btn.dataset.calEarnRegion;
            if (window.OC_UPDATE_PANE_PARAMS) window.OC_UPDATE_PANE_PARAMS({ calEarnRegion: state.earnRegion });
            repaint();
          });
        });
        body.querySelectorAll('.tk.clickable').forEach(el => {
          el.addEventListener('click', () => {
            const t = el.dataset.tk;
            if (t && window.OC_OPEN_MODULE) window.OC_OPEN_MODULE('stock-analysis', { ticker: t });
          });
        });
      }

      body.querySelectorAll('.cal-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          state.tab = btn.dataset.calTab;
          if (window.OC_UPDATE_PANE_PARAMS) window.OC_UPDATE_PANE_PARAMS({ calTab: state.tab });
          repaint();
        });
      });

      bindClicks();
    } catch (e) { body.innerHTML = `<div class="mod-err">${e.message}</div>`; }
  }

  window.OC_MODULES = window.OC_MODULES || {};
  window.OC_MODULES['calendar'] = { render };
})();
