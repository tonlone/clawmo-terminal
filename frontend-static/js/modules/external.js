/* News · Trump Monitor · Deep Value (cross-subdomain) */
(function () {
  'use strict';
  const { fetchJSON, fmt } = window.OC_DATA;

  function sentCls(score) {
    if (score == null) return '';
    if (score > 0.2)  return 'num-up';
    if (score > 0)    return 'num-up-soft';
    if (score < -0.2) return 'num-dn';
    if (score < 0)    return 'num-dn-soft';
    return '';
  }
  function pctNum(v) { return v == null ? '' : v > 0 ? 'num-up' : v < 0 ? 'num-dn' : ''; }

  /* ── News helpers ──────────────────────────────────────── */

  function escNws(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // Sentiment score → red/amber/green color (for heatmap cells, KPI numbers).
  function sentColor(score, alpha) {
    if (score == null) return `rgba(140,140,140,${alpha != null ? alpha : 0.6})`;
    const a = alpha != null ? alpha : Math.max(0.25, Math.min(1, Math.abs(score)));
    if (score > 0.05)  return `rgba(74,222,128,${a})`;
    if (score < -0.05) return `rgba(248,113,113,${a})`;
    return `rgba(140,140,140,${a})`;
  }

  // Current ET time helpers — used by heatmaps to draw a "▼ NOW" marker
  // and to highlight the (today, current-hour) cell. ET because both data
  // pipelines normalize timestamps to America/New_York.
  function _etHour() {
    try {
      const parts = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/New_York' }).formatToParts(new Date());
      const h = parts.find(p => p.type === 'hour');
      return h ? parseInt(h.value, 10) % 24 : null;
    } catch (e) { return null; }
  }
  function _etDayName() {
    try {
      return new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'America/New_York' }).format(new Date());
    } catch (e) { return null; }
  }
  function _etDate() {
    try {
      const parts = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/New_York' }).formatToParts(new Date());
      const y = parts.find(p => p.type === 'year').value;
      const m = parts.find(p => p.type === 'month').value;
      const day = parts.find(p => p.type === 'day').value;
      return `${y}-${m}-${day}`;
    } catch (e) { return null; }
  }
  // "HH:MM" in America/New_York from any ISO 8601 timestamp (null → null)
  function _etTime(isoStr) {
    if (!isoStr) return null;
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return null;
    try {
      const parts = new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/New_York' }).formatToParts(d);
      const hh = parts.find(p => p.type === 'hour').value;
      const mm = parts.find(p => p.type === 'minute').value;
      return `${hh}:${mm}`;
    } catch (e) { return null; }
  }
  // Like _etTime but prepends "MMM DD" when the timestamp's ET date is
  // not today. Used in Topic Watch where items can span several days and
  // HH:MM alone is ambiguous.
  function _etTimeDated(isoStr) {
    const hhmm = _etTime(isoStr);
    if (!hhmm) return null;
    try {
      const d = new Date(isoStr);
      const dateParts = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/New_York' }).formatToParts(d);
      const etDateStr = `${dateParts.find(p => p.type === 'year').value}-${dateParts.find(p => p.type === 'month').value}-${dateParts.find(p => p.type === 'day').value}`;
      if (etDateStr === _etDate()) return hhmm;
      const mdy = new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', timeZone: 'America/New_York' }).format(d);
      return `${mdy} ${hhmm}`;
    } catch (e) { return hhmm; }
  }

  // 7-day × 24-hour headline heatmap. cells = [{day, hour, date, count, sentiment}]
  // Source has day 0 = oldest, day 6 = today (ET). We render TODAY ON TOP so
  // the most relevant row is the first thing visible on mobile, then yesterday,
  // 2 days ago, etc. Time within a row still flows left→right (universal
  // chronology preserved). A "▼ NOW" marker points at the current ET hour
  // column, and the (today, current-hour) cell gets an accent halo.
  function buildNewsHeatmap(cells) {
    if (!Array.isArray(cells) || !cells.length) return '';
    const byKey = {}; // "d-h" → cell
    let maxCount = 0;
    cells.forEach(c => {
      if (c.day == null || c.hour == null) return;
      byKey[`${c.day}-${c.hour}`] = c;
      if (c.count > maxCount) maxCount = c.count;
    });
    if (!maxCount) return '';
    const dayDates = {};
    cells.forEach(c => { if (c.day != null && !dayDates[c.day]) dayDates[c.day] = c.date; });
    const fmtDay = (d) => {
      const ds = dayDates[d];
      if (!ds) return '';
      const dt = new Date(ds + 'T12:00:00Z');
      return dt.toUTCString().slice(0, 7); // "Mon DD"
    };
    // Identify "today" by matching ET date string against the source's day dates
    const todayET = _etDate();
    const nowHour = _etHour();
    let todayIdx = null;
    Object.entries(dayDates).forEach(([k, v]) => { if (v === todayET) todayIdx = parseInt(k, 10); });
    if (todayIdx == null) {
      // Fall back to the highest day index (source convention: 6 = today)
      const max = Math.max(...Object.keys(dayDates).map(Number));
      todayIdx = isFinite(max) ? max : null;
    }

    const W = 820, padL = 64, padR = 12, padT = 32, padB = 16;
    const innerW = W - padL - padR;
    const cellW = innerW / 24;
    const rowH = 30;  // taller rows so heatmap stays readable at natural aspect
    const days = 7;
    const H = padT + days * rowH + padB;
    // CSS aspect-ratio matches viewBox so X/Y scale uniformly under
    // preserveAspectRatio="none" — text glyphs stay aligned with cells.
    let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;aspect-ratio:${W}/${H};height:auto;display:block">`;
    // Hour x-axis labels (every 3 hours)
    for (let h = 0; h <= 24; h += 3) {
      const x = padL + h * cellW;
      const lab = h === 24 ? '24' : (h < 10 ? '0' + h : String(h));
      svg += `<text x="${x}" y="${padT - 10}" fill="#8b949e" font-size="11" text-anchor="middle" font-family="var(--font-mono)">${lab}</text>`;
    }
    svg += `<text x="${padL - 6}" y="${padT - 10}" fill="#8b949e" font-size="10" text-anchor="end" font-family="var(--font-mono)">HOUR ET →</text>`;
    // "▼ NOW" marker pointing at current-hour column (above the grid)
    if (nowHour != null) {
      const xNow = padL + (nowHour + 0.5) * cellW;
      svg += `<text x="${xNow}" y="${padT - 22}" fill="var(--accent)" font-size="11" text-anchor="middle" font-weight="700" font-family="var(--font-mono)">▼ NOW</text>`;
    }
    // Day rows: TODAY at top (row 0), going backwards in time top-to-bottom
    for (let row = 0; row < days; row++) {
      const d = (todayIdx != null) ? Math.max(0, todayIdx - row) : (days - 1 - row);
      const y = padT + row * rowH;
      const isToday = (todayIdx != null) && (d === todayIdx) && (row === 0);
      const labelColor = isToday ? 'var(--accent)' : '#c9d1d9';
      const labelTxt = isToday ? `${escNws(fmtDay(d))} ●` : escNws(fmtDay(d));
      svg += `<text x="${padL - 6}" y="${y + rowH / 2 + 4}" fill="${labelColor}" font-size="11" text-anchor="end" font-weight="${isToday ? '700' : '400'}" font-family="var(--font-mono)">${labelTxt}</text>`;
      for (let h = 0; h < 24; h++) {
        const c = byKey[`${d}-${h}`];
        const x = padL + h * cellW;
        if (c && c.count > 0) {
          const intensity = Math.max(0.18, Math.min(1, c.count / maxCount));
          const fill = sentColor(c.sentiment, intensity);
          svg += `<rect x="${x + 0.5}" y="${y + 1}" width="${cellW - 1}" height="${rowH - 2}" fill="${fill}"><title>${escNws(c.date || '')} ${h}:00 · ${c.count} hl · sent ${c.sentiment != null ? c.sentiment.toFixed(2) : '—'}</title></rect>`;
          if (cellW > 14) {
            svg += `<text x="${x + cellW / 2}" y="${y + rowH / 2 + 3}" fill="rgba(0,0,0,0.85)" font-size="10" text-anchor="middle" font-family="var(--font-mono)">${c.count}</text>`;
          }
        } else {
          svg += `<rect x="${x + 0.5}" y="${y + 1}" width="${cellW - 1}" height="${rowH - 2}" fill="rgba(255,255,255,0.03)"/>`;
        }
      }
    }
    // Highlight (today, current-hour) cell with an accent halo on top of everything
    if (todayIdx != null && nowHour != null) {
      const xNow = padL + nowHour * cellW;
      svg += `<rect x="${xNow + 0.5}" y="${padT + 1}" width="${cellW - 1}" height="${rowH - 2}" fill="none" stroke="var(--accent)" stroke-width="2" pointer-events="none"/>`;
    }
    svg += '</svg>';
    return svg;
  }

  // Sorted horizontal bar chart for category counts (Finviz-style).
  function buildCategoryBars(categories) {
    const entries = Object.entries(categories || {})
      .filter(([_k, v]) => typeof v === 'number' && v > 0)
      .sort((a, b) => b[1] - a[1]);
    if (!entries.length) return '';
    const W = 820, rowH = 18, padT = 8, padB = 8, padR = 12;
    const labelW = 130, valueW = 36;
    const barAreaW = W - padR - labelW - 6 - valueW;
    const max = Math.max(...entries.map(([, v]) => v));
    const H = padT + entries.length * rowH + padB;
    let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:${H * 1.4}px">`;
    entries.forEach(([k, v], i) => {
      const y = padT + i * rowH;
      const w = (v / max) * barAreaW;
      svg += `<text x="${labelW - 4}" y="${y + 13}" fill="#c9d1d9" font-size="10" text-anchor="end" font-family="var(--font-mono)">${escNws(k)}</text>`;
      svg += `<rect x="${labelW + 2}" y="${y + 3}" width="${w}" height="${rowH - 6}" fill="rgba(96,165,250,0.85)"/>`;
      svg += `<text x="${W - padR}" y="${y + 13}" fill="#60A5FA" font-size="10" text-anchor="end" font-weight="700" font-family="var(--font-mono)">${v}</text>`;
    });
    svg += '</svg>';
    return svg;
  }

  /* ── News Intel ────────────────────────────────────────── */
  async function renderNews(body) {
    body.innerHTML = `<div class="mod-loading">Loading news…</div>`;
    try {
      const [d, tw] = await Promise.all([
        fetchJSON('https://news.clawmo.tech/data/dashboard.json'),
        fetchJSON('https://news.clawmo.tech/data/topic-watch.json').catch(() => null),
      ]);
      const s = d.sentiment || {};
      const h = d.headlines || {};
      const recent = (h.recent || []).slice(0, 25);
      const tickers = (d.tickers || []).slice(0, 15);
      const alerts = [...(d.alerts || [])]
        .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
        .slice(0, 12);
      const xs = d.x_signals || {};
      const xSignals = (xs.signals || []).slice(0, 12);
      const trend = s.trend_7d || [];
      const trendChart = trend.length >= 2 && window.OC_CHART
        ? window.OC_CHART.lineAbs(
            [{ name: 'sent', values: trend.map(p => p.score), color: 'var(--accent)' }],
            { w: 540, h: 140, gridY: 3, xLabels: trend.map(p => (p.date || '').slice(5)), yFmt: v => v.toFixed(2) }
          )
        : '';
      const heatmapSvg = buildNewsHeatmap(d.heatmap || []);
      const categoryBars = buildCategoryBars(d.categories || {});
      const totalCat = Object.values(d.categories || {}).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0);

      // Topic-watch matches: group by topic for accordion display
      const twMatches = (tw && Array.isArray(tw.matches)) ? tw.matches : [];
      const twByTopic = {};
      twMatches.forEach(m => {
        const k = m.topic_name || m.topic || 'unknown';
        if (!twByTopic[k]) twByTopic[k] = { name: k, priority: m.priority, items: [] };
        twByTopic[k].items.push(m);
      });
      const twGroups = Object.values(twByTopic).sort((a, b) => b.items.length - a.items.length);

      body.innerHTML = `
        <style>
          [data-mod-panel="nws"] .nws-kpi-strip {
            display:grid; grid-template-columns:repeat(6,1fr); gap:6px; margin-bottom:8px;
          }
          [data-mod-panel="nws"] .nws-kpi {
            background:var(--bg-card); border:1px solid var(--border); border-radius:3px;
            padding:6px 8px;
          }
          [data-mod-panel="nws"] .nws-kpi-lbl {
            font-size:9px; color:var(--fg-dim); text-transform:uppercase; letter-spacing:0.6px;
          }
          [data-mod-panel="nws"] .nws-kpi-val {
            font-size:16px; font-weight:700; font-family:var(--font-mono); margin-top:2px;
          }
          [data-mod-panel="nws"] .nws-kpi-sub {
            font-size:9px; color:var(--fg-dim); margin-top:2px; font-family:var(--font-mono);
          }
          [data-mod-panel="nws"] .nws-charts-2 {
            display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-top:6px;
          }
          @media (max-width: 1100px) { [data-mod-panel="nws"] .nws-charts-2 { grid-template-columns:1fr; } }
          [data-mod-panel="nws"] .tw-group { border:1px solid var(--border); border-radius:3px; margin-bottom:6px; }
          [data-mod-panel="nws"] .tw-head {
            padding:5px 8px; cursor:pointer; display:flex; gap:8px; align-items:center;
            background:var(--bg-card); font-size:11px;
          }
          [data-mod-panel="nws"] .tw-head:hover { background:#1a1d22; }
          [data-mod-panel="nws"] .tw-pill {
            font-size:9px; padding:1px 5px; border-radius:2px; font-family:var(--font-mono);
            background:#30363d; color:#c9d1d9;
          }
          [data-mod-panel="nws"] .tw-pill.high { background:rgba(248,113,113,0.25); color:#f87171; }
          [data-mod-panel="nws"] .tw-body { display:none; padding:6px 8px; font-size:10px; }
          [data-mod-panel="nws"] .tw-group.open .tw-body { display:block; }
          [data-mod-panel="nws"] .tw-group.open .tw-arrow { transform:rotate(90deg); }
          [data-mod-panel="nws"] .tw-arrow { display:inline-block; transition:transform 0.15s; color:var(--fg-dim); }
          [data-mod-panel="nws"] .tw-item {
            padding:3px 0; border-bottom:1px dashed rgba(255,255,255,0.05);
            display:flex; gap:8px; align-items:baseline;
          }
          [data-mod-panel="nws"] .tw-item:last-child { border-bottom:none; }
          [data-mod-panel="nws"] .tw-age { font-family:var(--font-mono); color:var(--fg-faint); font-size:9px; min-width:42px; }
          [data-mod-panel="nws"] .tw-src { font-family:var(--font-mono); color:var(--fg-dim); font-size:9px; }
          [data-mod-panel="nws"] .tw-impact { font-family:var(--font-mono); color:#A78BFA; font-size:9px; }
          [data-mod-panel="nws"] .nws-search-link {
            color:var(--fg-faint); font-size:11px; margin:0 4px;
            text-decoration:none; opacity:0.55; cursor:pointer;
          }
          [data-mod-panel="nws"] .nws-search-link:hover { opacity:1; }
        </style>

        <div class="mod-head" data-mod-panel="nws">
          <div class="mod-title">${window.OC_TITLE('news')} · NEWS INTEL</div>
          <div class="mod-meta">
            <span class="chip chip-dim">${escNws(d.generated_at_et || fmt.ago(d.generated_at))}</span>
          </div>
        </div>

        <div data-mod-panel="nws">

          <div class="nws-kpi-strip">
            <div class="nws-kpi">
              <div class="nws-kpi-lbl">Composite Sentiment</div>
              <div class="nws-kpi-val ${sentCls(s.composite_score)}">${fmt.num(s.composite_score, 2)}</div>
              <div class="nws-kpi-sub ${pctNum(s.delta_24h)}">${s.delta_24h != null ? (s.delta_24h >= 0 ? '+' : '') + fmt.num(s.delta_24h, 2) : '—'} vs 24h ago</div>
            </div>
            <div class="nws-kpi">
              <div class="nws-kpi-lbl">Bull / Bear / Neutral</div>
              <div class="nws-kpi-val mono"><span class="num-up">${s.bullish_count ?? '—'}</span> · <span class="num-dn">${s.bearish_count ?? '—'}</span> · <span style="color:var(--fg-dim)">${s.neutral_count ?? '—'}</span></div>
              <div class="nws-kpi-sub">last 24h headline tally</div>
            </div>
            <div class="nws-kpi">
              <div class="nws-kpi-lbl">Headline Volume</div>
              <div class="nws-kpi-val mono">${h.volume_24h ?? '—'}</div>
              <div class="nws-kpi-sub">${h.volume_1h ?? '—'} in last 1h · ${(h.sources || []).length} sources</div>
            </div>
            <div class="nws-kpi">
              <div class="nws-kpi-lbl">CNN Fear &amp; Greed</div>
              <div class="nws-kpi-val mono">${s.cnn_fg ?? '—'}</div>
              <div class="nws-kpi-sub">crypto F&amp;G ${s.crypto_fg ?? '—'} · cross-ref SEN tab</div>
            </div>
            <div class="nws-kpi" style="cursor:pointer" data-nws-open-twt>
              <div class="nws-kpi-lbl">X Signals (24h)</div>
              <div class="nws-kpi-val mono">${xs.total_signals ?? '—'}</div>
              <div class="nws-kpi-sub" style="color:var(--accent)">${xs.viral_count ?? 0} viral · open TWT ↗</div>
            </div>
            <div class="nws-kpi">
              <div class="nws-kpi-lbl">Topic Watch</div>
              <div class="nws-kpi-val mono">${tw && tw.match_count != null ? tw.match_count : '—'}</div>
              <div class="nws-kpi-sub">${tw && tw.topic_count != null ? tw.topic_count : 0} topics · ${tw && tw.alert_count != null ? tw.alert_count : 0} alerts</div>
            </div>
          </div>

          <div class="nws-charts-2">
            ${trendChart ? `
              <div class="mod-panel">
                <div class="mod-panel-title">7-DAY SENTIMENT TREND · composite score</div>
                <div class="chart-wrap">${trendChart}</div>
              </div>
            ` : ''}
            ${categoryBars ? `
              <div class="mod-panel">
                <div class="mod-panel-title">CATEGORY BREAKDOWN · 24h · ${totalCat} headlines</div>
                <div class="chart-wrap">${categoryBars}</div>
              </div>
            ` : ''}
          </div>

          ${heatmapSvg ? `
            <div class="mod-panel">
              <div class="mod-panel-title">HEADLINE HEATMAP · 7 days × 24 hours ET · density &amp; sentiment</div>
              <div class="chart-wrap">${heatmapSvg}</div>
              <div class="chart-legend">
                <span><span class="lg-line" style="background:rgba(74,222,128,0.85)"></span>positive sentiment</span>
                <span><span class="lg-line" style="background:rgba(248,113,113,0.85)"></span>negative sentiment</span>
                <span><span class="lg-line" style="background:rgba(140,140,140,0.6)"></span>neutral</span>
                <span class="chart-note">cell opacity = headline volume vs week max · hover for exact count + sentiment</span>
              </div>
            </div>
          ` : ''}

          <div class="mod-grid-2">
            <div class="mod-panel">
              <div class="mod-panel-title">RECENT HEADLINES · ${recent.length} · ET</div>
              <div class="hl-list">
                ${recent.map(x => {
                  const tks = Array.isArray(x.tickers) ? x.tickers.slice(0, 3).join(' ') : '';
                  const tm = _etTime(x.timestamp || x.time) || '——';
                  // Source data has no article URLs — fall back to a Google News
                  // search for the title so the user can still find the original.
                  const searchHref = `https://www.google.com/search?q=${encodeURIComponent((x.title || '') + ' ' + (x.source || ''))}&tbm=nws`;
                  return `
                    <div class="hl-item">
                      <span class="hl-sent ${sentCls(x.score)}">${tm}</span>
                      <span class="hl-text">${escNws(x.title || '—')}${tks ? ` <span class="hl-tkrs">${escNws(tks)}</span>` : ''}</span>
                      <a class="nws-search-link" href="${searchHref}" target="_blank" rel="noopener" title="Search this headline on Google News">🔍</a>
                      <span class="hl-src">${escNws(x.source || '')}</span>
                    </div>
                  `;
                }).join('') || '<div class="cal-empty">no headlines</div>'}
              </div>
            </div>
            <div class="mod-side">
              <div class="mod-panel">
                <div class="mod-panel-title">MENTIONS · 24h</div>
                <div class="tbl-wrap"><table class="tbl-dense">
                  <thead><tr><th>MENTION</th><th>CNT</th><th>SENT</th></tr></thead>
                  <tbody>${tickers.map(t => `
                    <tr>
                      <td class="tk clickable" data-tk="${escNws(t.ticker)}">${escNws(t.ticker)}</td>
                      <td class="mono">${t.count}</td>
                      <td class="mono ${sentCls(t.avg_sentiment)}">${fmt.num(t.avg_sentiment, 2)}</td>
                    </tr>
                  `).join('') || '<tr><td colspan="3" class="empty">no mentions</td></tr>'}</tbody>
                </table></div>
              </div>
              <div class="mod-panel">
                <div class="mod-panel-title">ALERTS · 24h · ET</div>
                <div class="alert-list">
                  ${alerts.map(a => {
                    const sentScore = typeof a.sentiment === 'string'
                      ? (a.sentiment === 'POSITIVE' ? 1 : a.sentiment === 'NEGATIVE' ? -1 : 0)
                      : a.sentiment;
                    const searchHref = `https://www.google.com/search?q=${encodeURIComponent((a.message || '') + ' ' + (a.source || ''))}&tbm=nws`;
                    const tm = _etTimeDated(a.timestamp);
                    const srcTxt = escNws(a.source || '') + (tm ? ` · ${tm}` : '');
                    return `
                      <div class="hl-item">
                        <span class="hl-sent ${sentCls(sentScore)}">${escNws((a.type || '').slice(0, 5).toUpperCase())}</span>
                        <span class="hl-text">${escNws(a.message || '')}</span>
                        <a class="nws-search-link" href="${searchHref}" target="_blank" rel="noopener" title="Search this alert on Google News">🔍</a>
                        <span class="hl-src">${srcTxt}</span>
                      </div>
                    `;
                  }).join('') || '<div class="cal-empty">no alerts</div>'}
                </div>
              </div>
            </div>
          </div>

          ${twGroups.length ? `
            <div class="mod-panel">
              <div class="mod-panel-title">TOPIC WATCH · ${twGroups.length} topics · ${twMatches.length} matches · ET</div>
              ${twGroups.map(g => `
                <div class="tw-group" data-tw-group>
                  <div class="tw-head">
                    <span class="tw-arrow">▶</span>
                    <span><b>${escNws(g.name)}</b></span>
                    <span class="tw-pill ${g.priority === 'high' ? 'high' : ''}">${escNws(g.priority || 'med')}</span>
                    <span class="tw-pill">${g.items.length} matches</span>
                  </div>
                  <div class="tw-body">
                    ${g.items.slice(0, 12).map(m => {
                      const tm = _etTimeDated(m.published) || (m.age_hours != null ? m.age_hours.toFixed(1) + 'h' : '——');
                      const ageTitle = m.age_hours != null ? `${m.age_hours.toFixed(1)}h ago` : '';
                      return `
                      <div class="tw-item">
                        <span class="tw-age" title="${ageTitle}">${tm}</span>
                        <a class="hl-text" href="${m.url || '#'}" target="_blank" rel="noopener">${escNws(m.headline || '—')}</a>
                        <span class="tw-src">${escNws(m.source || '')}</span>
                        ${Array.isArray(m.asset_impact) && m.asset_impact.length ? `<span class="tw-impact">→ ${escNws(m.asset_impact.slice(0, 4).join(', '))}</span>` : ''}
                      </div>
                    `;
                    }).join('')}
                  </div>
                </div>
              `).join('')}
            </div>
          ` : ''}

        </div>
      `;

      // Topic-watch accordion toggle
      body.querySelectorAll('[data-tw-group] .tw-head').forEach(head => {
        head.addEventListener('click', () => {
          head.parentElement.classList.toggle('open');
        });
      });

      // X Signals KPI tile → open TWT module
      body.querySelectorAll('[data-nws-open-twt]').forEach(el => {
        el.addEventListener('click', () => {
          if (window.OC_OPEN_MODULE) window.OC_OPEN_MODULE('twitter');
        });
      });

      // Ticker click-throughs
      body.querySelectorAll('.tk.clickable').forEach(el => {
        el.addEventListener('click', () => {
          const t = el.dataset.tk;
          if (t && window.OC_OPEN_MODULE) window.OC_OPEN_MODULE('stock-analysis', { ticker: t });
        });
      });
    } catch (e) { body.innerHTML = `<div class="mod-err">${e.message}</div>`; }
  }

  /* ── Trump posting-time heatmap (day-of-week × 24h ET) ─
     Source data shape: { DayName: { hour_str: count } } — this is a 60-day
     AGGREGATE by day-of-week, NOT a rolling 7-day window. So a "Tuesday at
     22:00 ET" cell = total posts across every Tuesday-22:00 in the 60d window.
     Days are kept in fixed Mon→Sun order. Today's row is highlighted (so you
     can see the typical pattern for today's day-of-week), and a "▼ NOW"
     marker points at the current ET hour column with an accent halo on the
     (today, now) cell. */
  function buildTrumpHeatmap(hourly) {
    if (!hourly || typeof hourly !== 'object') return '';
    const dayOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const todayName = _etDayName();
    const nowHour = _etHour();
    const todayPos = todayName ? dayOrder.indexOf(todayName) : -1;
    let maxCount = 0;
    dayOrder.forEach(d => {
      const row = hourly[d] || {};
      Object.values(row).forEach(v => { if (typeof v === 'number' && v > maxCount) maxCount = v; });
    });
    if (!maxCount) return '';
    const W = 820, padL = 64, padR = 12, padT = 32, padB = 16;
    const innerW = W - padL - padR;
    const cellW = innerW / 24;
    const rowH = 30;
    const H = padT + dayOrder.length * rowH + padB;
    let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;aspect-ratio:${W}/${H};height:auto;display:block">`;
    for (let h = 0; h <= 24; h += 3) {
      const x = padL + h * cellW;
      const lab = h === 24 ? '24' : (h < 10 ? '0' + h : String(h));
      svg += `<text x="${x}" y="${padT - 10}" fill="#8b949e" font-size="11" text-anchor="middle" font-family="var(--font-mono)">${lab}</text>`;
    }
    svg += `<text x="${padL - 6}" y="${padT - 10}" fill="#8b949e" font-size="10" text-anchor="end" font-family="var(--font-mono)">HOUR ET →</text>`;
    if (nowHour != null) {
      const xNow = padL + (nowHour + 0.5) * cellW;
      svg += `<text x="${xNow}" y="${padT - 22}" fill="var(--accent)" font-size="11" text-anchor="middle" font-weight="700" font-family="var(--font-mono)">▼ NOW</text>`;
    }
    dayOrder.forEach((dayName, dIdx) => {
      const y = padT + dIdx * rowH;
      const isToday = (dIdx === todayPos);
      const labelColor = isToday ? 'var(--accent)' : '#c9d1d9';
      const labelTxt = isToday ? `${dayName} ●` : dayName;
      svg += `<text x="${padL - 6}" y="${y + rowH / 2 + 4}" fill="${labelColor}" font-size="11" text-anchor="end" font-weight="${isToday ? '700' : '400'}" font-family="var(--font-mono)">${labelTxt}</text>`;
      const row = hourly[dayName] || {};
      for (let h = 0; h < 24; h++) {
        const count = row[String(h)] || 0;
        const x = padL + h * cellW;
        if (count > 0) {
          const intensity = Math.max(0.18, Math.min(1, count / maxCount));
          const fill = `rgba(229,185,76,${intensity})`;
          svg += `<rect x="${x + 0.5}" y="${y + 1}" width="${cellW - 1}" height="${rowH - 2}" fill="${fill}"><title>${dayName} ${h}:00 ET · ${count} posts (60d aggregate)</title></rect>`;
          if (cellW > 14) {
            svg += `<text x="${x + cellW / 2}" y="${y + rowH / 2 + 3}" fill="rgba(0,0,0,0.85)" font-size="10" text-anchor="middle" font-family="var(--font-mono)">${count}</text>`;
          }
        } else {
          svg += `<rect x="${x + 0.5}" y="${y + 1}" width="${cellW - 1}" height="${rowH - 2}" fill="rgba(255,255,255,0.03)"/>`;
        }
      }
    });
    if (todayPos >= 0 && nowHour != null) {
      const xNow = padL + nowHour * cellW;
      const yNow = padT + todayPos * rowH;
      svg += `<rect x="${xNow + 0.5}" y="${yNow + 1}" width="${cellW - 1}" height="${rowH - 2}" fill="none" stroke="var(--accent)" stroke-width="2" pointer-events="none"/>`;
    }
    svg += '</svg>';
    return svg;
  }

  /* ── Trump Monitor ─────────────────────────────────────── */
  async function renderTrump(body) {
    body.innerHTML = `<div class="mod-loading">Loading Trump monitor…</div>`;
    try {
      const d = await fetchJSON('https://trumpsocial.clawmo.tech/data/dashboard.json');
      const r = d.risk || {};
      const sigTotals = d.signal_totals || {};
      const sigMeta = d.signal_meta || {};
      const volSeries = d.volume_series || [];
      const sigSeries = d.signal_series || {};
      const streaks = d.silence_streaks || [];
      const posts = (d.recent_posts || []).filter(p => (p.text || '').trim().length > 0);

      const riskCls = r.level && /high/i.test(r.level) ? 'num-dn'
                    : r.level && /low/i.test(r.level) ? 'num-up' : 'num-warn';

      // Signal distribution: sort by count, show bar + emoji + label + weight pill
      const sigSorted = Object.entries(sigTotals)
        .filter(([_k, v]) => typeof v === 'number' && v > 0)
        .sort((a, b) => b[1] - a[1]);
      const sigMax = sigSorted.length ? sigSorted[0][1] : 1;
      const sigRows = sigSorted.map(([k, v]) => {
        const meta = sigMeta[k] || {};
        const w = meta.weight;
        const wCls = w > 0 ? 'num-dn' : w < 0 ? 'num-up' : '';
        const wLabel = w != null ? (w > 0 ? '+' + w : String(w)) : '';
        const barPct = (v / sigMax) * 100;
        const barColor = w > 1 ? 'rgba(248,113,113,0.85)' : w > 0 ? 'rgba(251,191,36,0.85)' : w < 0 ? 'rgba(74,222,128,0.85)' : 'rgba(140,140,140,0.6)';
        return `<tr>
          <td class="pat">${meta.emoji || ''} ${escNws(meta.label || k)}</td>
          <td class="mono">${v}</td>
          <td><div style="position:relative;background:rgba(255,255,255,0.05);height:10px;border-radius:2px;overflow:hidden"><div style="position:absolute;left:0;top:0;bottom:0;width:${barPct}%;background:${barColor}"></div></div></td>
          <td class="mono ${wCls}">${wLabel}</td>
        </tr>`;
      }).join('');

      // Volume chart (60d)
      const volChart = volSeries.length >= 2 && window.OC_CHART
        ? window.OC_CHART.lineAbs(
            [{ name: 'posts', values: volSeries.map(p => p.count), color: 'var(--accent)' }],
            { w: 540, h: 160, gridY: 3, xLabels: volSeries.map(p => (p.date || '').slice(5)), yFmt: v => v.toFixed(0) }
          )
        : '';

      // Signal-series multi-line: top 5 by total count, each as a series
      const top5Sigs = sigSorted.slice(0, 5).map(([k]) => k);
      const sigTrendColors = ['#f87171', '#60A5FA', '#A78BFA', '#FB923C', '#5BB77A'];
      const sigTrendSeries = top5Sigs.map((k, i) => ({
        name: (sigMeta[k] && sigMeta[k].label) || k,
        values: (sigSeries[k] || []).map(p => p.count),
        color: sigTrendColors[i % sigTrendColors.length],
      })).filter(s => s.values.length >= 2);
      const sigTrendXLabels = sigSeries[top5Sigs[0]] ? sigSeries[top5Sigs[0]].map(p => (p.date || '').slice(5)) : [];
      const sigTrendChart = sigTrendSeries.length && window.OC_CHART
        ? window.OC_CHART.lineAbs(sigTrendSeries, { w: 540, h: 160, gridY: 3, xLabels: sigTrendXLabels, yFmt: v => v.toFixed(0) })
        : '';
      const sigTrendLegend = top5Sigs.map((k, i) => {
        const meta = sigMeta[k] || {};
        return `<span><span class="lg-line" style="background:${sigTrendColors[i % sigTrendColors.length]}"></span>${meta.emoji || ''} ${escNws(meta.label || k)}</span>`;
      }).join('');

      // Posting-time heatmap
      const heatmap = buildTrumpHeatmap(d.hourly_heatmap);

      // Silence streaks (>=8h) — source is sorted oldest-first; show newest-first
      const streakRows = streaks.slice(-12).reverse().map(s => {
        const start = _etTimeDated(s.start) || '—';
        const end = _etTimeDated(s.end) || '—';
        const hcls = s.hours > 24 ? 'num-dn' : s.hours > 12 ? 'num-warn' : '';
        return `<tr>
          <td class="mono">${escNws(start)}</td>
          <td class="mono">${escNws(end)}</td>
          <td class="mono ${hcls}">${fmt.num(s.hours, 1)}h</td>
        </tr>`;
      }).join('');

      // Recent posts (with real Truth Social URLs)
      const postRows = posts.slice(0, 10).map(p => {
        const tm = _etTimeDated(p.created_at) || '——';
        const sigs = (p.signals || []).map(s => {
          const meta = sigMeta[s] || {};
          return `<span class="trp-sigchip">${meta.emoji || ''} ${escNws(s)}</span>`;
        }).join(' ');
        const txt = (p.text || '').slice(0, 360);
        return `<div class="trp-post">
          <div class="trp-post-head">
            <span class="mono trp-post-time">${escNws(tm)}</span>
            ${sigs}
            <a class="trp-post-link" href="${escNws(p.url || '#')}" target="_blank" rel="noopener">view post ↗</a>
            <span class="trp-post-eng">♥${fmt.compact(p.favourites)} ↻${fmt.compact(p.reblogs)} 💬${fmt.compact(p.replies)}</span>
          </div>
          <div class="trp-post-text">${escNws(txt)}${(p.text || '').length > 360 ? '…' : ''}</div>
        </div>`;
      }).join('') || '<div class="cal-empty">no recent posts</div>';

      const wyckoffAlert = r.distribution_risk ? `
        <div class="trp-wyckoff-alert">
          <div class="trp-wyckoff-title">⚠️ WYCKOFF DISTRIBUTION DETECTED</div>
          <div class="trp-wyckoff-body">Pattern signature: high MARKET_BRAG signal volume + elevated overall posting volume = classic distribution-phase behavior. Historically associated with near-term market top risk (ClawMo's rule). Watch for follow-through with TARIFF or THREAT signals to confirm.</div>
        </div>
      ` : '';

      body.innerHTML = `
        <style>
          [data-mod-panel="trp"] .trp-kpi-strip {
            display:grid; grid-template-columns:repeat(5,1fr); gap:6px; margin-bottom:8px;
          }
          [data-mod-panel="trp"] .trp-kpi {
            background:var(--bg-card); border:1px solid var(--border); border-radius:3px;
            padding:6px 8px;
          }
          [data-mod-panel="trp"] .trp-kpi.accent { border-color: var(--accent); border-width: 1px; }
          [data-mod-panel="trp"] .trp-kpi-lbl { font-size:9px; color:var(--fg-dim); text-transform:uppercase; letter-spacing:0.6px; }
          [data-mod-panel="trp"] .trp-kpi-val { font-size:18px; font-weight:700; font-family:var(--font-mono); margin-top:2px; }
          [data-mod-panel="trp"] .trp-kpi-sub { font-size:9px; color:var(--fg-dim); margin-top:2px; font-family:var(--font-mono); }
          [data-mod-panel="trp"] .trp-charts-2 { display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-top:6px; }
          @media (max-width:1100px) { [data-mod-panel="trp"] .trp-charts-2 { grid-template-columns:1fr; } }
          [data-mod-panel="trp"] .trp-wyckoff-alert {
            background:rgba(248,113,113,0.12); border:1px solid rgba(248,113,113,0.55);
            border-left:3px solid #f87171; padding:8px 12px; margin-bottom:10px; border-radius:3px;
          }
          [data-mod-panel="trp"] .trp-wyckoff-title { color:#f87171; font-weight:700; font-size:12px; letter-spacing:0.5px; margin-bottom:4px; }
          [data-mod-panel="trp"] .trp-wyckoff-body { color:#c9d1d9; font-size:10px; line-height:1.45; }
          [data-mod-panel="trp"] .trp-sigchip {
            display:inline-block; padding:1px 5px; font-size:9px; border-radius:2px;
            background:rgba(229,185,76,0.18); color:var(--accent); font-family:var(--font-mono); margin-right:3px;
          }
          [data-mod-panel="trp"] .trp-post {
            border-bottom:1px solid rgba(255,255,255,0.06); padding:6px 0;
          }
          [data-mod-panel="trp"] .trp-post:last-child { border-bottom:none; }
          [data-mod-panel="trp"] .trp-post-head { display:flex; align-items:baseline; gap:6px; flex-wrap:wrap; font-size:10px; }
          [data-mod-panel="trp"] .trp-post-time { color:var(--fg-dim); font-size:10px; min-width:120px; }
          [data-mod-panel="trp"] .trp-post-link {
            color:var(--accent); font-family:var(--font-mono); font-size:9px;
            text-decoration:none; padding:1px 4px; border:1px solid rgba(229,185,76,0.35); border-radius:2px;
          }
          [data-mod-panel="trp"] .trp-post-link:hover { background:rgba(229,185,76,0.12); }
          [data-mod-panel="trp"] .trp-post-eng {
            color:var(--fg-faint); font-family:var(--font-mono); font-size:9px; margin-left:auto;
          }
          [data-mod-panel="trp"] .trp-post-text {
            color:#c9d1d9; font-size:11px; line-height:1.5; margin-top:3px; padding-left:4px;
            border-left:2px solid rgba(229,185,76,0.25);
          }
          [data-mod-panel="trp"] .trp-research {
            font-size:10px; color:var(--fg-dim); line-height:1.55;
            background:var(--bg-card); border-left:2px solid var(--accent);
            padding:6px 10px;
          }
          [data-mod-panel="trp"] .trp-research b { color:var(--fg); }
          [data-mod-panel="trp"] .trp-sig-tbl td:nth-child(3) { width: 30%; }
        </style>

        <div class="mod-head" data-mod-panel="trp">
          <div class="mod-title">${window.OC_TITLE('trump')} · TRUTH SOCIAL MARKET RISK</div>
          <div class="mod-meta">
            <span class="chip chip-dim">last post ${fmt.ago(d.last_post_date)}</span>
            <span class="chip chip-dim">${fmt.ago(d.generated_at)}</span>
          </div>
        </div>

        <div data-mod-panel="trp">

          ${wyckoffAlert}

          <div class="trp-kpi-strip">
            <div class="trp-kpi accent">
              <div class="trp-kpi-lbl">Risk Score</div>
              <div class="trp-kpi-val ${riskCls}">${r.score ?? '—'}</div>
              <div class="trp-kpi-sub ${riskCls}">${escNws(r.level || '—')}</div>
            </div>
            <div class="trp-kpi">
              <div class="trp-kpi-lbl">Silence (Last Post)</div>
              <div class="trp-kpi-val mono">${fmt.num(d.silence_hours, 1)}h</div>
              <div class="trp-kpi-sub">silence is signal — long pauses precede major posts</div>
            </div>
            <div class="trp-kpi">
              <div class="trp-kpi-lbl">Posts Today</div>
              <div class="trp-kpi-val mono">${d.posts_today ?? 0}</div>
              <div class="trp-kpi-sub">vs typical 5-15/day</div>
            </div>
            <div class="trp-kpi">
              <div class="trp-kpi-lbl">Posts Tracked (60d)</div>
              <div class="trp-kpi-val mono">${fmt.compact(d.total_posts)}</div>
              <div class="trp-kpi-sub">${volSeries.length} days observed</div>
            </div>
            <div class="trp-kpi">
              <div class="trp-kpi-lbl">Distribution Risk</div>
              <div class="trp-kpi-val mono ${r.distribution_risk ? 'num-dn' : 'num-up'}">${r.distribution_risk ? 'YES' : 'NO'}</div>
              <div class="trp-kpi-sub">Wyckoff rule (see banner / glossary)</div>
            </div>
          </div>

          <div class="trp-charts-2">
            ${volChart ? `
              <div class="mod-panel">
                <div class="mod-panel-title">DAILY POSTING VOLUME · 60 DAYS</div>
                <div class="chart-wrap">${volChart}</div>
                <div class="chart-legend"><span class="chart-note">spikes often coincide with policy announcements / market-moving events</span></div>
              </div>
            ` : ''}
            ${sigTrendChart ? `
              <div class="mod-panel">
                <div class="mod-panel-title">TOP 5 SIGNAL TRENDS · 60 DAYS</div>
                <div class="chart-wrap">${sigTrendChart}</div>
                <div class="chart-legend">${sigTrendLegend}</div>
              </div>
            ` : ''}
          </div>

          ${heatmap ? `
            <div class="mod-panel">
              <div class="mod-panel-title">POSTING-TIME HEATMAP · day-of-week × 24h ET · 60-DAY AGGREGATE</div>
              <div class="chart-wrap">${heatmap}</div>
              <div class="chart-legend">
                <span><span class="lg-line" style="background:rgba(229,185,76,0.85)"></span>cell opacity = post count vs 60d peak</span>
                <span class="chart-note">aggregate of all posts in the last 60 days bucketed by day-of-week + hour ET (NOT a rolling 7-day view) · today's row is highlighted to show the typical pattern for today's day-of-week · the ▼ NOW marker + halo show the current hour</span>
              </div>
            </div>
          ` : ''}

          <div class="mod-grid-2">
            <div class="mod-panel">
              <div class="mod-panel-title">SIGNAL DISTRIBUTION · 60 DAYS · weight column = ClawMo's market-impact score</div>
              <div class="tbl-wrap"><table class="tbl-dense trp-sig-tbl">
                <thead><tr><th>SIGNAL</th><th class="num">CNT</th><th>SHARE</th><th class="num" data-glossary="trp-wt">WT</th></tr></thead>
                <tbody>${sigRows || '<tr><td colspan="4" class="empty">no signals</td></tr>'}</tbody>
              </table></div>
              <div class="chart-legend"><span class="chart-note">positive weight (red bar) = bearish for market; negative weight (green) = bullish (deals/negotiation); zero = neutral. Wyckoff rule fires when MARKET_BRAG count is high alongside elevated total volume.</span></div>
            </div>
            <div class="mod-panel">
              <div class="mod-panel-title">SILENCE STREAKS · gaps &gt; 8 hours · 60d window · ET</div>
              <div class="tbl-wrap"><table class="tbl-dense">
                <thead><tr><th>START (UTC)</th><th>END (UTC)</th><th class="num">DURATION</th></tr></thead>
                <tbody>${streakRows || '<tr><td colspan="3" class="empty">no significant gaps</td></tr>'}</tbody>
              </table></div>
              <div class="chart-legend"><span class="chart-note">long silences (&gt;24h, red) often precede market-moving announcements — quiet → loud is the pattern</span></div>
            </div>
          </div>

          <div class="mod-panel">
            <div class="mod-panel-title">RECENT POSTS · ${posts.length} most recent · ET · with signal tags</div>
            ${postRows}
          </div>

          <div class="mod-panel">
            <div class="mod-panel-title">RESEARCH BASIS · what these signals mean</div>
            <div class="trp-research">
              <p style="margin-bottom:4px"><b>Wyckoff Distribution Rule</b> (ClawMo): when MARKET_BRAG signal volume is elevated alongside high overall posting frequency, the pattern matches Wyckoff's distribution-phase behavior — heavy promotion of recent gains coinciding with smart-money exit. Historically associated with near-term market-top risk.</p>
              <p style="margin:3px 0"><b>Silence-as-signal</b>: extended silences (&gt;24h) frequently precede major announcements. Quiet-to-loud transitions are higher-information than continuous chatter.</p>
              <p style="margin:3px 0"><b>Signal weights</b>: each signal has a market-impact weight assigned by analysis of historical posts vs subsequent S&amp;P 500 moves. <span class="num-dn">+3 (TARIFF)</span> = strongly bearish; <span class="num-up">−1 (DEAL)</span> = mildly bullish. Composite risk score = weighted sum of recent signals × volume modifier.</p>
              <p style="margin:3px 0"><b>Source</b>: posts pulled from <a href="https://trumpsocial.clawmo.tech/" target="_blank" rel="noopener" style="color:var(--accent)">trumpsocial.clawmo.tech</a> via Mastodon API on truthsocial.com (no auth required for public posts).</p>
            </div>
          </div>

        </div>
      `;
    } catch (e) { body.innerHTML = `<div class="mod-err">${e.message}</div>`; }
  }

  /* ── X Signals (TWT) ───────────────────────────────────── */
  // Filter state cached on window so re-renders within the session keep it.
  function _twtFiltersGet() {
    return window._twtFilters || (window._twtFilters = { category: 'all', priority: 'all', viralOnly: false, portfolioOnly: false });
  }

  function _twtApplyFilters(signals, f) {
    return signals.filter(s => {
      if (f.category !== 'all' && s.category !== f.category) return false;
      if (f.priority !== 'all' && s.priority !== f.priority) return false;
      if (f.viralOnly && !s.is_viral) return false;
      if (f.portfolioOnly && (!s.portfolio_match || !s.portfolio_match.length)) return false;
      return true;
    });
  }

  function _twtSigRow(s, accountsByHandle, fmt, escFn) {
    const eng = s.engagement_parsed || s.engagement || {};
    const acc = accountsByHandle[s.handle] || {};
    const avgL = acc.avg_likes || 0, avgR = acc.avg_retweets || 0;
    const curL = eng.likes || 0, curR = eng.retweets || 0;
    // Anomaly ratio: current vs baseline (if baseline exists)
    const ratio = avgL > 0 ? (curL / avgL) : null;
    const ratioCls = ratio == null ? '' : ratio >= 2 ? 'num-dn' : ratio >= 1.3 ? 'num-warn' : ratio < 0.5 ? 'num-up' : '';
    const ratioLbl = ratio == null ? '' : `${ratio.toFixed(1)}× avg`;
    const tags = (s.signals || []).slice(0, 4);
    const tagsHtml = tags.map(t => `<span class="twt-sigtag${s.is_viral ? ' viral' : ''}">${escFn(t)}</span>`).join('');
    const tickers = (s.tickers || []).slice(0, 6);
    const tickersHtml = tickers.map(t => `<span class="tk clickable twt-ticker" data-tk="${escFn(t)}">${escFn(t)}</span>`).join(' ');
    const portMatch = (s.portfolio_match && s.portfolio_match.length)
      ? `<span class="twt-portfolio">📊 PORTFOLIO: ${escFn(s.portfolio_match.slice(0, 3).join(', '))}</span>`
      : '';
    const tweetUrl = s.url || `https://x.com/${encodeURIComponent(s.handle || '')}`;
    const profileUrl = `https://x.com/${encodeURIComponent(s.handle || '')}`;
    // Timestamps render in America/New_York (same convention as NWS feed).
    // If post is older than today (ET), prefix the month-day so HH:MM stays unambiguous.
    let tm = '——';
    if (s.timestamp) {
      const dt = new Date(s.timestamp);
      const hhmm = dt.toLocaleString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false });
      const dayEt = dt.toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' });
      const todayEt = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' });
      tm = dayEt === todayEt ? hhmm : `${dayEt} ${hhmm}`;
    }
    return `<div class="twt-sig">
      <div class="twt-sig-head">
        <a class="twt-handle" href="${profileUrl}" target="_blank" rel="noopener">@${escFn(s.handle || '')}</a>
        <span class="twt-cat-pill twt-cat-${escFn((s.category || 'other').replace(/[^a-z]/g, ''))}">${escFn(s.category || '—')}</span>
        ${s.priority === 'high' ? '<span class="twt-pri-pill twt-pri-high">HIGH</span>' : ''}
        ${s.is_viral ? '<span class="twt-pri-pill twt-pri-viral">VIRAL</span>' : ''}
        ${portMatch}
        <span class="twt-time">${escFn(tm)} ET</span>
        <span class="twt-eng">♥${fmt.compact(curL)} ↻${fmt.compact(curR)} 👁${fmt.compact(eng.views)}${ratio != null ? ` <span class="${ratioCls}">${ratioLbl}</span>` : ''}</span>
        <a href="${tweetUrl}" target="_blank" rel="noopener" class="twt-link">view post ↗</a>
      </div>
      <div class="twt-sig-text">${escFn((s.text || '').slice(0, 360))}${(s.text || '').length > 360 ? '…' : ''}</div>
      <div class="twt-sig-foot">
        ${tagsHtml}
        ${tickersHtml ? `<span class="twt-tickers">${tickersHtml}</span>` : ''}
      </div>
    </div>`;
  }

  function _twtRenderFeed(body, allSignals, accountsByHandle, fmt, escFn) {
    const f = _twtFiltersGet();
    const filtered = _twtApplyFilters(allSignals, f);
    const wrap = body.querySelector('.twt-feed-wrap');
    const cnt = body.querySelector('.twt-feed-count');
    if (cnt) cnt.textContent = `${filtered.length} of ${allSignals.length}`;
    if (!wrap) return;
    if (!filtered.length) {
      wrap.innerHTML = '<div class="cal-empty">no signals match current filters</div>';
    } else {
      wrap.innerHTML = filtered.slice(0, 50).map(s => _twtSigRow(s, accountsByHandle, fmt, escFn)).join('');
    }
    // Re-bind ticker clicks (innerHTML wipes listeners)
    wrap.querySelectorAll('.tk.clickable').forEach(el => {
      el.addEventListener('click', () => {
        const t = el.dataset.tk;
        if (t && window.OC_OPEN_MODULE) window.OC_OPEN_MODULE('stock-analysis', { ticker: t });
      });
    });
  }

  async function renderTwitter(body) {
    body.innerHTML = `<div class="mod-loading">Loading X signals…</div>`;
    try {
      const d = await fetchJSON('https://news.clawmo.tech/data/dashboard.json');
      const xs = d.x_signals || {};
      const signals = xs.signals || [];
      const accounts = xs.accounts || [];
      const accountsByHandle = Object.fromEntries(accounts.map(a => [a.handle, a]));

      // Compute available filter values
      const cats = [...new Set(signals.map(s => s.category).filter(Boolean))].sort();
      const viralCount = signals.filter(s => s.is_viral).length;
      const portfolioMatchCount = signals.filter(s => s.portfolio_match && s.portfolio_match.length).length;
      const highPriCount = signals.filter(s => s.priority === 'high').length;
      const viralRate = signals.length ? (viralCount / signals.length * 100) : 0;

      // Account scoreboard sort: by recent activity (last_tweet_time desc)
      const accountsSorted = [...accounts].sort((a, b) => {
        const at = a.last_tweet_time ? new Date(a.last_tweet_time).getTime() : 0;
        const bt = b.last_tweet_time ? new Date(b.last_tweet_time).getTime() : 0;
        return bt - at;
      });
      const accountCards = accountsSorted.map(a => {
        const lastT = a.last_tweet_time ? Math.max(0, (Date.now() - new Date(a.last_tweet_time).getTime()) / 36e5) : null;
        const silentCls = lastT == null ? '' : lastT > 168 ? 'num-dn' : lastT > 48 ? 'num-warn' : 'num-up';
        const silentLbl = lastT == null ? '——' : lastT < 1 ? Math.round(lastT * 60) + 'm' : lastT < 24 ? lastT.toFixed(1) + 'h' : (lastT / 24).toFixed(1) + 'd';
        const profileUrl = `https://x.com/${encodeURIComponent(a.handle || '')}`;
        const desc = (a.description || '').replace(/"/g, '&quot;');
        const reason = (a.why_monitor || '').replace(/"/g, '&quot;');
        const tip = `${desc}${reason ? '\n\nWhy monitor: ' + reason : ''}`;
        return `<div class="twt-acct-card" title="${escNws(tip)}">
          <div class="twt-acct-head">
            <a class="twt-acct-handle" href="${profileUrl}" target="_blank" rel="noopener">@${escNws(a.handle || '')}</a>
            ${a.priority === 'high' ? '<span class="twt-pri-pill twt-pri-high">HIGH</span>' : ''}
          </div>
          <div class="twt-acct-cat">${escNws(a.category || '—')}</div>
          <div class="twt-acct-meta">
            <span class="${silentCls}">last ${silentLbl}</span>
            <span style="color:var(--fg-faint)">avg ♥${fmt.compact(a.avg_likes)} ↻${fmt.compact(a.avg_retweets)}</span>
          </div>
          ${a.latest_text ? `<div class="twt-acct-latest">${escNws((a.latest_text || '').slice(0, 100))}${(a.latest_text || '').length > 100 ? '…' : ''}</div>` : ''}
        </div>`;
      }).join('');

      const f = _twtFiltersGet();

      body.innerHTML = `
        <style>
          [data-mod-panel="twt"] .twt-kpi-strip { display:grid; grid-template-columns:repeat(5,1fr); gap:6px; margin-bottom:8px; }
          [data-mod-panel="twt"] .twt-kpi { background:var(--bg-card); border:1px solid var(--border); border-radius:3px; padding:6px 8px; }
          [data-mod-panel="twt"] .twt-kpi.accent { border-color:var(--accent); }
          [data-mod-panel="twt"] .twt-kpi-lbl { font-size:9px; color:var(--fg-dim); text-transform:uppercase; letter-spacing:0.6px; }
          [data-mod-panel="twt"] .twt-kpi-val { font-size:18px; font-weight:700; font-family:var(--font-mono); margin-top:2px; }
          [data-mod-panel="twt"] .twt-kpi-sub { font-size:9px; color:var(--fg-dim); margin-top:2px; font-family:var(--font-mono); }

          [data-mod-panel="twt"] .twt-acct-grid {
            display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr));
            gap:6px; margin-top:6px;
          }
          [data-mod-panel="twt"] .twt-acct-card {
            background:var(--bg-card); border:1px solid var(--border); border-radius:3px;
            padding:6px 8px; cursor:help;
          }
          [data-mod-panel="twt"] .twt-acct-card:hover { border-color:var(--accent); }
          [data-mod-panel="twt"] .twt-acct-head { display:flex; align-items:center; gap:6px; }
          [data-mod-panel="twt"] .twt-acct-handle {
            color:#60A5FA; font-family:var(--font-mono); font-size:11px; font-weight:700; text-decoration:none;
          }
          [data-mod-panel="twt"] .twt-acct-handle:hover { text-decoration:underline; }
          [data-mod-panel="twt"] .twt-acct-cat {
            font-size:9px; color:var(--fg-dim); text-transform:uppercase; letter-spacing:0.5px; margin-top:2px;
          }
          [data-mod-panel="twt"] .twt-acct-meta {
            font-size:9px; font-family:var(--font-mono); margin-top:3px; display:flex; justify-content:space-between; gap:6px;
          }
          [data-mod-panel="twt"] .twt-acct-latest {
            font-size:10px; color:#c9d1d9; line-height:1.4; margin-top:4px;
            padding-top:4px; border-top:1px dashed rgba(255,255,255,0.06);
          }

          [data-mod-panel="twt"] .twt-filter-bar {
            display:flex; flex-wrap:wrap; gap:4px; margin-bottom:6px; align-items:center;
            padding:6px; background:var(--bg-card); border-radius:3px; border:1px solid var(--border);
          }
          [data-mod-panel="twt"] .twt-filter-lbl {
            font-size:9px; color:var(--fg-dim); text-transform:uppercase; letter-spacing:0.5px; margin-right:4px;
          }
          [data-mod-panel="twt"] .twt-filter-btn {
            background:#0d1117; color:var(--fg-dim); border:1px solid #30363d;
            padding:2px 8px; font-size:9px; font-family:var(--font-mono);
            cursor:pointer; border-radius:3px; letter-spacing:0.4px;
          }
          [data-mod-panel="twt"] .twt-filter-btn:hover { color:var(--fg); border-color:#555; }
          [data-mod-panel="twt"] .twt-filter-btn.active { background:var(--accent); color:#0d1117; border-color:var(--accent); }
          [data-mod-panel="twt"] .twt-feed-count { color:var(--fg-dim); font-family:var(--font-mono); font-size:10px; margin-left:auto; }

          [data-mod-panel="twt"] .twt-sig {
            padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.06);
          }
          [data-mod-panel="twt"] .twt-sig:last-child { border-bottom:none; }
          [data-mod-panel="twt"] .twt-sig-head {
            display:flex; flex-wrap:wrap; align-items:baseline; gap:6px; font-size:10px;
          }
          [data-mod-panel="twt"] .twt-handle {
            color:#60A5FA; font-family:var(--font-mono); font-weight:700; font-size:11px; text-decoration:none;
          }
          [data-mod-panel="twt"] .twt-handle:hover { text-decoration:underline; }
          [data-mod-panel="twt"] .twt-cat-pill {
            font-size:9px; padding:1px 5px; border-radius:2px;
            background:rgba(140,140,140,0.18); color:#c9d1d9; font-family:var(--font-mono);
          }
          [data-mod-panel="twt"] .twt-pri-pill {
            font-size:9px; padding:1px 5px; border-radius:2px; font-family:var(--font-mono); font-weight:700;
          }
          [data-mod-panel="twt"] .twt-pri-high { background:rgba(248,113,113,0.22); color:#f87171; }
          [data-mod-panel="twt"] .twt-pri-viral { background:rgba(229,185,76,0.22); color:#E5B94C; }
          [data-mod-panel="twt"] .twt-portfolio {
            font-size:9px; padding:1px 5px; border-radius:2px;
            background:rgba(74,222,128,0.18); color:#4ADE80; font-family:var(--font-mono); font-weight:700;
          }
          [data-mod-panel="twt"] .twt-time { color:var(--fg-faint); font-family:var(--font-mono); font-size:9px; }
          [data-mod-panel="twt"] .twt-eng { color:var(--fg-faint); font-family:var(--font-mono); font-size:9px; margin-left:auto; }
          [data-mod-panel="twt"] .twt-link {
            color:var(--accent); font-family:var(--font-mono); font-size:9px;
            text-decoration:none; padding:1px 4px; border:1px solid rgba(229,185,76,0.35); border-radius:2px;
          }
          [data-mod-panel="twt"] .twt-link:hover { background:rgba(229,185,76,0.12); }
          [data-mod-panel="twt"] .twt-sig-text {
            color:#c9d1d9; font-size:11px; line-height:1.5; margin-top:3px;
            padding-left:4px; border-left:2px solid rgba(96,165,250,0.25);
          }
          [data-mod-panel="twt"] .twt-sig-foot {
            margin-top:3px; display:flex; flex-wrap:wrap; gap:4px; align-items:center;
          }
          [data-mod-panel="twt"] .twt-sigtag {
            font-size:8.5px; padding:1px 4px; border-radius:2px;
            background:rgba(251,191,36,0.18); color:#fbbf24; font-family:var(--font-mono);
          }
          [data-mod-panel="twt"] .twt-sigtag.viral { background:rgba(229,185,76,0.22); color:#E5B94C; }
          [data-mod-panel="twt"] .twt-tickers { display:inline-flex; gap:3px; flex-wrap:wrap; margin-left:4px; }
          [data-mod-panel="twt"] .twt-ticker {
            font-size:9px; padding:1px 5px; border-radius:2px; cursor:pointer;
            background:rgba(96,165,250,0.18); color:#60A5FA; font-family:var(--font-mono);
          }
          [data-mod-panel="twt"] .twt-ticker:hover { background:rgba(96,165,250,0.32); }
        </style>

        <div class="mod-head" data-mod-panel="twt">
          <div class="mod-title">${window.OC_TITLE('twitter')} · X SIGNAL MONITOR</div>
          <div class="mod-meta">
            <span class="chip chip-dim">${escNws(d.generated_at_et || fmt.ago(d.generated_at))}</span>
          </div>
        </div>

        <div data-mod-panel="twt">

          <div class="twt-kpi-strip">
            <div class="twt-kpi accent">
              <div class="twt-kpi-lbl">Total Signals (24h)</div>
              <div class="twt-kpi-val mono">${xs.total_signals ?? signals.length}</div>
              <div class="twt-kpi-sub">recent feed: ${signals.length} of which ${highPriCount} HIGH</div>
            </div>
            <div class="twt-kpi">
              <div class="twt-kpi-lbl">Viral Count</div>
              <div class="twt-kpi-val mono num-warn">${viralCount}</div>
              <div class="twt-kpi-sub">${viralRate.toFixed(0)}% of feed · cumulative ${xs.viral_count ?? '—'}</div>
            </div>
            <div class="twt-kpi">
              <div class="twt-kpi-lbl">Portfolio Matches</div>
              <div class="twt-kpi-val mono ${portfolioMatchCount > 0 ? 'num-up' : ''}">${portfolioMatchCount}</div>
              <div class="twt-kpi-sub">posts mentioning your tickers</div>
            </div>
            <div class="twt-kpi">
              <div class="twt-kpi-lbl">Accounts Watched</div>
              <div class="twt-kpi-val mono">${accounts.length}</div>
              <div class="twt-kpi-sub">${cats.length} categories</div>
            </div>
            <div class="twt-kpi">
              <div class="twt-kpi-lbl">Most Active Account</div>
              <div class="twt-kpi-val mono" style="font-size:13px">@${escNws(((accountsSorted[0] || {}).handle || '—').slice(0, 18))}</div>
              <div class="twt-kpi-sub">latest of all watched handles</div>
            </div>
          </div>

          <div class="mod-panel">
            <div class="mod-panel-title">ACCOUNT SCOREBOARD · ${accounts.length} watched · sorted by recent activity</div>
            <div class="twt-acct-grid">
              ${accountCards || '<div class="cal-empty">no accounts</div>'}
            </div>
            <div class="chart-legend"><span class="chart-note">hover for description + why-monitor reason · "last X" colour: green &lt;48h · amber 2-7d · red &gt;7d (silent)</span></div>
          </div>

          <div class="mod-panel">
            <div class="mod-panel-title">SIGNAL FEED</div>
            <div class="twt-filter-bar">
              <span class="twt-filter-lbl">Category</span>
              <button class="twt-filter-btn${f.category === 'all' ? ' active' : ''}" data-twt-filter="category" data-twt-val="all">all</button>
              ${cats.map(c => `<button class="twt-filter-btn${f.category === c ? ' active' : ''}" data-twt-filter="category" data-twt-val="${escNws(c)}">${escNws(c)}</button>`).join('')}
              <span class="twt-filter-lbl" style="margin-left:10px">Priority</span>
              <button class="twt-filter-btn${f.priority === 'all' ? ' active' : ''}" data-twt-filter="priority" data-twt-val="all">all</button>
              <button class="twt-filter-btn${f.priority === 'high' ? ' active' : ''}" data-twt-filter="priority" data-twt-val="high">high</button>
              <button class="twt-filter-btn${f.priority === 'medium' ? ' active' : ''}" data-twt-filter="priority" data-twt-val="medium">medium</button>
              <span class="twt-filter-lbl" style="margin-left:10px">Toggles</span>
              <button class="twt-filter-btn${f.viralOnly ? ' active' : ''}" data-twt-filter="viralOnly">viral only</button>
              <button class="twt-filter-btn${f.portfolioOnly ? ' active' : ''}" data-twt-filter="portfolioOnly">portfolio matches</button>
              <span class="twt-feed-count">— of ${signals.length}</span>
            </div>
            <div class="twt-feed-wrap"></div>
          </div>

        </div>
      `;

      // Initial feed render
      _twtRenderFeed(body, signals, accountsByHandle, fmt, escNws);

      // Wire filter buttons
      body.querySelectorAll('[data-twt-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
          const filter = btn.dataset.twtFilter;
          const val = btn.dataset.twtVal;
          const state = _twtFiltersGet();
          if (filter === 'viralOnly' || filter === 'portfolioOnly') {
            state[filter] = !state[filter];
          } else {
            state[filter] = val;
          }
          // Update active states only within the same filter group
          if (filter === 'viralOnly' || filter === 'portfolioOnly') {
            btn.classList.toggle('active', state[filter]);
          } else {
            body.querySelectorAll(`[data-twt-filter="${filter}"]`).forEach(b => {
              b.classList.toggle('active', b.dataset.twtVal === state[filter]);
            });
          }
          _twtRenderFeed(body, signals, accountsByHandle, fmt, escNws);
        });
      });

    } catch (e) { body.innerHTML = `<div class="mod-err">${e.message}</div>`; }
  }

  /* ── Deep Value (DVL) ────────────────────────────────────
     Pre-baked institutional value-investing pipeline output. Different from
     SCR (which is ad-hoc fundamentals filtering): DVL is the algorithm's
     actual recommendation including position sizing, risk metrics, and
     trap-filtered universe. */
  async function renderDeepValue(body, ctx) {
    const idx = (ctx?.params?.index || 'SPY').toUpperCase();
    body.innerHTML = `<div class="mod-loading">Loading deep value · ${idx}…</div>`;
    try {
      const [d, alpha] = await Promise.all([
        fetchJSON(`https://stocks.clawmo.tech/api/deep-value-data/${idx}_data.json`),
        fetchJSON('https://stocks.clawmo.tech/api/deep-value-data/alpha/alpha-history.json').catch(() => null),
      ]);
      const pf = d.portfolio || {};
      const pl = d.pipeline || {};
      const stocks = d.top10 || [];
      const traps = d.value_traps || [];
      const trapStats = (d.trap_stats && d.trap_stats.by_type) || {};

      // Pipeline funnel — show stage-to-stage narrowing
      const funnelStages = [
        { lbl: 'Universe',         val: pl.total },
        { lbl: 'Base filter',      val: pl.base_filtered },
        { lbl: 'Sector filter',    val: pl.sector_filtered },
        { lbl: 'Scored',           val: pl.scored },
        { lbl: 'Clean (post-trap)', val: pl.clean },
      ].filter(s => s.val != null);
      const funnelMax = funnelStages.length ? funnelStages[0].val : 1;
      const funnelHtml = funnelStages.map((s, i) => {
        const pct = funnelMax ? (s.val / funnelMax * 100) : 0;
        const pctOfPrev = i === 0 ? 100 : (funnelStages[i - 1].val ? (s.val / funnelStages[i - 1].val * 100) : 0);
        const cls = i === funnelStages.length - 1 ? 'num-up' : '';
        return `<div class="dvl-funnel-row">
          <div class="dvl-funnel-lbl">${s.lbl}</div>
          <div class="dvl-funnel-bar"><div class="dvl-funnel-fill" style="width:${pct}%"></div></div>
          <div class="dvl-funnel-val mono ${cls}">${s.val}</div>
          <div class="dvl-funnel-pct mono">${i === 0 ? '100%' : pctOfPrev.toFixed(0) + '% kept'}</div>
        </div>`;
      }).join('');

      // Top 10 main table — fundamentals + scores + position sizing
      const topRows = stocks.map(s => {
        const p = s.position || {};
        const discCls = (s.discount_pct || 0) > 0 ? 'num-up' : 'num-dn';
        const scoreCls = (s.score || 0) >= 75 ? 'num-up' : (s.score || 0) >= 60 ? 'num-warn' : '';
        return `<tr>
          <td class="mono">${s.rank ?? '—'}</td>
          <td class="tk clickable" data-tk="${escNws(s.ticker)}">${escNws(s.ticker)}</td>
          <td class="pat">${escNws((s.sector || '—').slice(0, 12))}</td>
          <td class="mono ${scoreCls}">${fmt.num(s.score, 1)}</td>
          <td class="mono">${fmt.num(s.pe, 1)}</td>
          <td class="mono">${fmt.num(s.median_pe, 1)}</td>
          <td class="mono ${discCls}">${(s.discount_pct >= 0 ? '+' : '') + fmt.num(s.discount_pct, 1)}%</td>
          <td class="mono">${fmt.num(s.roe, 1)}%</td>
          <td class="mono">${s.growth != null ? (s.growth >= 0 ? '+' : '') + fmt.num(s.growth, 0) + '%' : '—'}</td>
          <td class="mono">${fmt.num(s.de_ratio, 2)}</td>
          <td class="mono">${p.shares != null ? p.shares : '—'}</td>
          <td class="mono">${p.weight_pct != null ? fmt.num(p.weight_pct, 1) + '%' : '—'}</td>
          <td class="mono">${p.rc_pct != null ? fmt.num(p.rc_pct, 1) + '%' : '—'}</td>
          <td class="mono">${p.vol != null ? fmt.num(p.vol, 1) + '%' : '—'}</td>
        </tr>`;
      }).join('');

      // Score-composition table: shows the 4 sub-scores that compose `score`
      const scoreRows = stocks.map(s => `
        <tr>
          <td class="mono">${s.rank ?? '—'}</td>
          <td class="tk clickable" data-tk="${escNws(s.ticker)}">${escNws(s.ticker)}</td>
          <td class="mono">${fmt.num(s.score, 1)}</td>
          <td class="mono">${fmt.num(s.valuation_score, 0)}</td>
          <td class="mono">${fmt.num(s.roe_score, 0)}</td>
          <td class="mono">${fmt.num(s.growth_score, 0)}</td>
          <td class="mono">${fmt.num(s.health_score, 0)}</td>
          <td class="mono">${fmt.num(s.dcf_ratio, 2)}</td>
          <td class="mono ${s.dcf_penalty > 0 ? 'num-dn' : ''}">${fmt.num(s.dcf_penalty, 1)}</td>
        </tr>
      `).join('');

      // Trap type breakdown bars
      const trapTypeOrder = ['legacy', 'momentum', 'altman_z', 'negative_equity', 'dividend_trap', 'forward_pe_revision'];
      const trapTypeColors = {
        legacy: '#888', momentum: '#FB923C', altman_z: '#f87171',
        negative_equity: '#A78BFA', dividend_trap: '#fbbf24', forward_pe_revision: '#60A5FA',
      };
      const trapTotal = (d.trap_stats && d.trap_stats.total) || 0;
      const trapBars = trapTypeOrder
        .filter(t => (trapStats[t] || 0) > 0)
        .map(t => {
          const cnt = trapStats[t];
          const pct = trapTotal ? (cnt / trapTotal * 100) : 0;
          return `<div class="dvl-trap-bar">
            <div class="dvl-trap-lbl">${escNws(t)}</div>
            <div class="dvl-trap-fill-wrap"><div class="dvl-trap-fill" style="width:${pct}%;background:${trapTypeColors[t] || '#888'}"></div></div>
            <div class="dvl-trap-cnt mono">${cnt}</div>
            <div class="dvl-trap-pct mono">${pct.toFixed(0)}%</div>
          </div>`;
        }).join('');

      // Trap list (top 20, sorted by type then ticker)
      const trapRows = traps.slice(0, 20).map(t => {
        const c = trapTypeColors[t.trap_type] || '#888';
        return `<tr>
          <td class="tk clickable" data-tk="${escNws(t.ticker)}">${escNws(t.ticker)}</td>
          <td class="pat">${escNws((t.sector || '—').slice(0, 14))}</td>
          <td><span class="dvl-trap-pill" style="background:${c}22;color:${c};border:1px solid ${c}55">${escNws(t.trap_type || '—')}</span></td>
          <td class="mono">${fmt.num(t.pe, 1)}</td>
          <td class="mono">${fmt.num(t.roe, 1)}%</td>
          <td class="mono">${fmt.num(t.de_ratio, 2)}</td>
          <td class="pat" style="font-size:10px;color:var(--fg-dim)">${escNws(t.flag_reason || '—')}</td>
        </tr>`;
      }).join('');

      // Alpha tracker card (forward cohort tracking from snapshot_picks.py + compute_alpha.py cron)
      const basket = alpha && alpha.baskets && alpha.baskets[idx];
      const cohorts = (basket && basket.cohorts) || [];
      const recentCohort = cohorts.length ? cohorts[cohorts.length - 1] : null;
      const alphaHtml = recentCohort ? `
        <div class="mod-panel">
          <div class="mod-panel-title">FORWARD ALPHA · cohort tracking · ${escNws(alpha.asof_date || '—')} · vs ${escNws(basket.benchmark || idx)}</div>
          <div class="dvl-alpha-row">
            <div class="dvl-alpha-card">
              <div class="dvl-alpha-lbl">Latest Cohort</div>
              <div class="dvl-alpha-val mono">${escNws(recentCohort.date || '—')}</div>
              <div class="dvl-alpha-sub">${recentCohort.picks_count ?? '—'} picks · age ${recentCohort.age_days ?? 0}d</div>
            </div>
            <div class="dvl-alpha-card">
              <div class="dvl-alpha-lbl">Basket Return</div>
              <div class="dvl-alpha-val mono ${(recentCohort.basket_return || 0) >= 0 ? 'num-up' : 'num-dn'}">${recentCohort.basket_return != null ? (recentCohort.basket_return >= 0 ? '+' : '') + (recentCohort.basket_return * 100).toFixed(2) + '%' : '—'}</div>
            </div>
            <div class="dvl-alpha-card">
              <div class="dvl-alpha-lbl">Benchmark Return</div>
              <div class="dvl-alpha-val mono ${(recentCohort.benchmark_return || 0) >= 0 ? 'num-up' : 'num-dn'}">${recentCohort.benchmark_return != null ? (recentCohort.benchmark_return >= 0 ? '+' : '') + (recentCohort.benchmark_return * 100).toFixed(2) + '%' : '—'}</div>
            </div>
            <div class="dvl-alpha-card accent">
              <div class="dvl-alpha-lbl">Alpha</div>
              <div class="dvl-alpha-val mono ${(recentCohort.alpha || 0) >= 0 ? 'num-up' : 'num-dn'}">${recentCohort.alpha != null ? (recentCohort.alpha >= 0 ? '+' : '') + (recentCohort.alpha * 100).toFixed(2) + '%' : '—'}</div>
            </div>
            <div class="dvl-alpha-card">
              <div class="dvl-alpha-lbl">Win Rate</div>
              <div class="dvl-alpha-val mono">${recentCohort.win_rate != null ? (recentCohort.win_rate * 100).toFixed(0) + '%' : '—'}</div>
              <div class="dvl-alpha-sub">${recentCohort.best ? 'best ' + escNws(recentCohort.best.ticker) + ' +' + (recentCohort.best.return * 100).toFixed(1) + '%' : ''}</div>
            </div>
          </div>
          <div class="chart-legend">
            <span class="chart-note">forward-alpha cohort tracking from snapshot_picks.py + compute_alpha.py (22:30 ET Mon-Fri cron)</span>
          </div>
        </div>
      ` : '';

      body.innerHTML = `
        <style>
          [data-mod-panel="dvl"] .dvl-kpi-strip { display:grid; grid-template-columns:repeat(7,1fr); gap:6px; margin-bottom:8px; }
          [data-mod-panel="dvl"] .dvl-kpi { background:var(--bg-card); border:1px solid var(--border); border-radius:3px; padding:6px 8px; }
          [data-mod-panel="dvl"] .dvl-kpi.accent { border-color:var(--accent); }
          [data-mod-panel="dvl"] .dvl-kpi-lbl { font-size:9px; color:var(--fg-dim); text-transform:uppercase; letter-spacing:0.6px; }
          [data-mod-panel="dvl"] .dvl-kpi-val { font-size:16px; font-weight:700; font-family:var(--font-mono); margin-top:2px; }
          [data-mod-panel="dvl"] .dvl-kpi-sub { font-size:9px; color:var(--fg-dim); margin-top:2px; font-family:var(--font-mono); }
          @media (max-width: 1100px) { [data-mod-panel="dvl"] .dvl-kpi-strip { grid-template-columns:repeat(3,1fr); } }

          [data-mod-panel="dvl"] .dvl-funnel { padding:4px 0; }
          [data-mod-panel="dvl"] .dvl-funnel-row { display:grid; grid-template-columns: 130px 1fr 60px 80px; gap:8px; align-items:center; padding:3px 0; font-size:10px; }
          [data-mod-panel="dvl"] .dvl-funnel-lbl { color:#c9d1d9; font-family:var(--font-mono); text-align:right; }
          [data-mod-panel="dvl"] .dvl-funnel-bar { background:rgba(255,255,255,0.05); height:14px; border-radius:2px; overflow:hidden; }
          [data-mod-panel="dvl"] .dvl-funnel-fill { background:linear-gradient(90deg, var(--accent), rgba(229,185,76,0.5)); height:100%; }
          [data-mod-panel="dvl"] .dvl-funnel-val { text-align:right; font-weight:700; }
          [data-mod-panel="dvl"] .dvl-funnel-pct { color:var(--fg-dim); text-align:right; font-size:9px; }

          [data-mod-panel="dvl"] .dvl-trap-bar { display:grid; grid-template-columns: 140px 1fr 50px 50px; gap:6px; align-items:center; padding:3px 0; font-size:10px; }
          [data-mod-panel="dvl"] .dvl-trap-lbl { color:#c9d1d9; font-family:var(--font-mono); text-align:right; text-transform:capitalize; }
          [data-mod-panel="dvl"] .dvl-trap-fill-wrap { background:rgba(255,255,255,0.05); height:12px; border-radius:2px; overflow:hidden; }
          [data-mod-panel="dvl"] .dvl-trap-fill { height:100%; }
          [data-mod-panel="dvl"] .dvl-trap-cnt { text-align:right; font-weight:700; }
          [data-mod-panel="dvl"] .dvl-trap-pct { color:var(--fg-dim); text-align:right; font-size:9px; }
          [data-mod-panel="dvl"] .dvl-trap-pill { font-size:9px; padding:1px 6px; border-radius:2px; font-family:var(--font-mono); display:inline-block; }

          [data-mod-panel="dvl"] .dvl-alpha-row { display:grid; grid-template-columns:repeat(5,1fr); gap:6px; margin-top:4px; }
          [data-mod-panel="dvl"] .dvl-alpha-card { background:var(--bg-card); border:1px solid var(--border); border-radius:3px; padding:6px 8px; }
          [data-mod-panel="dvl"] .dvl-alpha-card.accent { border-color:var(--accent); border-width:1px; }
          [data-mod-panel="dvl"] .dvl-alpha-lbl { font-size:9px; color:var(--fg-dim); text-transform:uppercase; letter-spacing:0.5px; }
          [data-mod-panel="dvl"] .dvl-alpha-val { font-size:14px; font-weight:700; font-family:var(--font-mono); margin-top:2px; }
          [data-mod-panel="dvl"] .dvl-alpha-sub { font-size:9px; color:var(--fg-dim); margin-top:2px; font-family:var(--font-mono); }
          @media (max-width: 1100px) { [data-mod-panel="dvl"] .dvl-alpha-row { grid-template-columns:repeat(2,1fr); } }
        </style>

        <div class="mod-head" data-mod-panel="dvl">
          <div class="mod-title">${window.OC_TITLE('deep-value')} · ${idx} · DEEP VALUE PIPELINE</div>
          <div class="mod-meta">
            ${['SPY','QQQ','IWM','IWM-EXT'].map(i => `<button class="chip ${i === idx ? 'chip-unlocked' : ''} chip-btn" data-idx="${i}">${i}</button>`).join('')}
            <span class="chip chip-dim">${fmt.ago(d.timestamp)}</span>
          </div>
        </div>

        <div data-mod-panel="dvl">

          <div class="dvl-kpi-strip">
            <div class="dvl-kpi accent">
              <div class="dvl-kpi-lbl">Backtest Return</div>
              <div class="dvl-kpi-val mono ${pf.return >= 0 ? 'num-up' : 'num-dn'}">${pf.return != null ? (pf.return >= 0 ? '+' : '') + fmt.num(pf.return, 2) + '%' : '—'}</div>
              <div class="dvl-kpi-sub">$${fmt.compact(pf.capital)} simulated capital</div>
            </div>
            <div class="dvl-kpi">
              <div class="dvl-kpi-lbl">Sharpe</div>
              <div class="dvl-kpi-val mono">${fmt.num(pf.sharpe, 2)}</div>
              <div class="dvl-kpi-sub">rf ${pf.risk_free_rate != null ? (pf.risk_free_rate * 100).toFixed(1) + '%' : '—'}</div>
            </div>
            <div class="dvl-kpi">
              <div class="dvl-kpi-lbl">Sortino</div>
              <div class="dvl-kpi-val mono">${fmt.num(pf.sortino, 2)}</div>
              <div class="dvl-kpi-sub">downside-deviation Sharpe</div>
            </div>
            <div class="dvl-kpi">
              <div class="dvl-kpi-lbl">Vol</div>
              <div class="dvl-kpi-val mono">${fmt.num(pf.vol, 1)}%</div>
              <div class="dvl-kpi-sub">annualized</div>
            </div>
            <div class="dvl-kpi">
              <div class="dvl-kpi-lbl">Max Drawdown</div>
              <div class="dvl-kpi-val mono num-dn">${fmt.num(pf.max_dd, 2)}%</div>
            </div>
            <div class="dvl-kpi">
              <div class="dvl-kpi-lbl">VaR 95%</div>
              <div class="dvl-kpi-val mono num-dn">${fmt.num(pf.var_95, 2)}%</div>
              <div class="dvl-kpi-sub">${pf.var_amount != null ? '-$' + fmt.compact(Math.abs(pf.var_amount)) : ''} 1d loss</div>
            </div>
            <div class="dvl-kpi">
              <div class="dvl-kpi-lbl">CVaR 95%</div>
              <div class="dvl-kpi-val mono num-dn">${fmt.num(pf.cvar_95, 2)}%</div>
              <div class="dvl-kpi-sub">expected shortfall</div>
            </div>
          </div>

          ${funnelHtml ? `
            <div class="mod-panel">
              <div class="mod-panel-title">PIPELINE FUNNEL · how the universe narrows · ${pl.total} → ${pl.clean} surviving</div>
              <div class="dvl-funnel">${funnelHtml}</div>
              <div class="chart-legend"><span class="chart-note">stages: universe → base liquidity/size filter → sector-level filter → composite scoring → post-trap clean list. Final list goes to portfolio simulator for sizing.</span></div>
            </div>
          ` : ''}

          <div class="mod-panel">
            <div class="mod-panel-title">TOP ${stocks.length} · FUNDAMENTALS + POSITION SIZING · the algo's actual picks</div>
            <div class="tbl-wrap"><table class="tbl-dense">
              <thead><tr>
                <th>#</th><th>TICKER</th><th>SECTOR</th>
                <th class="num">SCORE</th>
                <th class="num">PE</th><th class="num">MED</th><th class="num">DISC</th>
                <th class="num">ROE</th><th class="num" data-glossary="dv-growth">GROWTH</th><th class="num">DE</th>
                <th class="num">SHARES</th><th class="num">WEIGHT</th><th class="num">RC%</th><th class="num">VOL</th>
              </tr></thead>
              <tbody>${topRows || '<tr><td colspan="14" class="empty">no picks</td></tr>'}</tbody>
            </table></div>
            <div class="chart-legend"><span class="chart-note"><b>SCORE</b> ≥75 green · <b>DISC</b> = current PE vs sector median (positive = trading at discount) · <b>SHARES/WEIGHT</b> = portfolio simulator allocation on $${fmt.compact(pf.capital)} capital · <b>RC%</b> = risk contribution vs portfolio · <b>VOL</b> = annualized vol</span></div>
          </div>

          <div class="mod-panel">
            <div class="mod-panel-title">SCORE COMPOSITION · 4 sub-scores → composite + DCF check</div>
            <div class="tbl-wrap"><table class="tbl-dense">
              <thead><tr>
                <th>#</th><th>TICKER</th>
                <th class="num">COMPOSITE</th>
                <th class="num" data-glossary="dv-val">VAL</th><th class="num">ROE</th><th class="num" data-glossary="dv-growth">GROWTH</th><th class="num">HEALTH</th>
                <th class="num">DCF RATIO</th><th class="num">DCF PENALTY</th>
              </tr></thead>
              <tbody>${scoreRows}</tbody>
            </table></div>
            <div class="chart-legend"><span class="chart-note">sub-scores 0-100 · DCF ratio &gt;1 = market price below intrinsic value · DCF penalty &gt;0 trims composite when stock looks overvalued vs DCF</span></div>
          </div>

          ${trapBars ? `
            <div class="mod-panel">
              <div class="mod-panel-title">VALUE TRAPS · ${trapTotal} flagged in this universe · by trap type</div>
              <div style="margin-bottom:8px">${trapBars}</div>
              <div class="tbl-wrap"><table class="tbl-dense">
                <thead><tr>
                  <th>TICKER</th><th>SECTOR</th><th data-glossary="trap-type">TYPE</th>
                  <th class="num">PE</th><th class="num">ROE</th><th class="num">DE</th>
                  <th>FLAG REASON</th>
                </tr></thead>
                <tbody>${trapRows || '<tr><td colspan="7" class="empty">no traps</td></tr>'}</tbody>
              </table></div>
              <div class="chart-legend"><span class="chart-note"><b>legacy</b> = older heuristic flag · <b>momentum</b> = price &gt;15% below 200-day SMA (cheap because falling, not because mispriced) · <b>altman_z</b> = bankruptcy risk · <b>negative_equity</b> = liabilities &gt; assets · <b>dividend_trap</b> = unsustainable yield · <b>forward_pe_revision</b> = downgraded earnings estimates</span></div>
            </div>
          ` : ''}

          ${alphaHtml}

        </div>
      `;
      body.querySelectorAll('[data-idx]').forEach(btn => {
        btn.addEventListener('click', () => {
          const newIdx = btn.dataset.idx;
          if (window.OC_UPDATE_PANE_PARAMS) window.OC_UPDATE_PANE_PARAMS({ index: newIdx });
          renderDeepValue(body, { params: { index: newIdx } });
        });
      });
      body.querySelectorAll('.tk.clickable').forEach(el => {
        el.addEventListener('click', () => {
          const t = el.dataset.tk;
          if (t && window.OC_OPEN_MODULE) window.OC_OPEN_MODULE('stock-analysis', { ticker: t });
        });
      });
    } catch (e) { body.innerHTML = `<div class="mod-err">${e.message}</div>`; }
  }

  window.OC_MODULES = window.OC_MODULES || {};
  window.OC_MODULES['news']        = { render: renderNews };
  window.OC_MODULES['twitter']     = { render: renderTwitter };
  window.OC_MODULES['trump']       = { render: renderTrump };
  window.OC_MODULES['deep-value']  = { render: renderDeepValue };
})();
