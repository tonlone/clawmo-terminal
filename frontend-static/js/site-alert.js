/* Terminal site-alert chip. Reads stocks.clawmo.tech site-alerts.json and renders
 * a compact colored chip inside .topbar-right when an alert is active. Dense aesthetic
 * vs. the stocks-app full-width banner — terminal's #app uses height:100vh so a full
 * banner would push content off-screen.
 *
 * Dismissible (24h via localStorage). Click chip → opens bonds module.
 */
(function () {
  'use strict';

  const ENDPOINT = 'https://stocks.clawmo.tech/data/site-alerts.json';
  const DISMISS_KEY = 'siteAlert.terminal.dismissed';
  const DISMISS_HOURS = 24;
  const POLL_MS = 5 * 60 * 1000;

  const TIER_STYLE = {
    WATCH: { color: '#fbbf24', bg: 'rgba(251, 191, 36, 0.16)', border: 'rgba(251, 191, 36, 0.5)', icon: '⚡' },
    WARN:  { color: '#fb923c', bg: 'rgba(251, 146, 60, 0.20)', border: 'rgba(251, 146, 60, 0.6)', icon: '⚠' },
    ALERT: { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.25)',  border: 'rgba(239, 68, 68, 0.75)', icon: '🚨' },
  };

  function isDismissed(alert) {
    try {
      const raw = localStorage.getItem(DISMISS_KEY);
      if (!raw) return false;
      const { generated_at, until } = JSON.parse(raw);
      if (alert.generated_at !== generated_at) return false;
      return Date.now() < until;
    } catch { return false; }
  }

  function dismiss(alert) {
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify({
        generated_at: alert.generated_at,
        until: Date.now() + DISMISS_HOURS * 3600 * 1000,
      }));
    } catch {}
  }

  function shortHeadline(alert) {
    const dir = alert.change_bps > 0 ? '+' : '';
    return `10Y ${dir}${Math.round(alert.change_bps)}bps · ${alert.value.toFixed(2)}%`;
  }

  function render(alert) {
    const existing = document.getElementById('term-site-alert');
    if (!alert || !alert.active || isDismissed(alert)) {
      if (existing) existing.remove();
      return;
    }

    const style = TIER_STYLE[alert.level] || TIER_STYLE.WATCH;
    const headline = shortHeadline(alert);
    const fullText = alert.headline || headline;

    let chip = existing;
    if (!chip) {
      chip = document.createElement('div');
      chip.id = 'term-site-alert';
      chip.style.cssText = `
        display: inline-flex; align-items: center; gap: 4px;
        padding: 2px 8px; margin-right: 6px;
        font-family: var(--font-mono, monospace);
        font-size: 0.68rem; font-weight: 600; line-height: 1.4;
        border-radius: 3px;
        cursor: pointer;
      `;
      const anchor = document.querySelector('.topbar-right');
      if (anchor) {
        anchor.insertBefore(chip, anchor.firstChild);
      } else {
        document.body.appendChild(chip);
      }
    }

    chip.style.background = style.bg;
    chip.style.color = style.color;
    chip.style.border = `1px solid ${style.border}`;
    chip.title = `${fullText}\n\nUpdated ${new Date(alert.generated_at).toLocaleString()}\nClick to open BND module · ✕ to hide 24h`;
    chip.innerHTML = `
      <span style="font-size:0.7rem">${style.icon}</span>
      <span style="letter-spacing:0.04em">${alert.level}</span>
      <span style="opacity:0.85;font-weight:500">${headline}</span>
      <span id="term-site-alert-x" style="margin-left:4px;opacity:0.7;font-size:0.78rem;line-height:0.9;padding:0 3px">×</span>
    `;

    chip.onclick = (e) => {
      if (e.target.id === 'term-site-alert-x') {
        e.stopPropagation();
        dismiss(alert);
        chip.remove();
        return;
      }
      if (window.OC_OPEN_MODULE) {
        window.OC_OPEN_MODULE('bonds');
      } else {
        location.hash = '#module=bonds';
      }
    };
  }

  function refresh() {
    fetch(ENDPOINT + '?_=' + Date.now())
      .then(r => r.ok ? r.json() : null)
      .then(render)
      .catch(() => {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refresh);
  } else {
    refresh();
  }
  setInterval(refresh, POLL_MS);
})();
