/* terminal.clawmo.tech — data fetch helper
   In-memory TTL cache, one inflight dedup, consistent error shape. */

(function () {
  'use strict';

  const CACHE = new Map(); // url -> { data, ts, err }
  const INFLIGHT = new Map(); // url -> Promise
  const DEFAULT_TTL_MS = 60 * 1000; // 60s

  async function fetchJSON(url, opts) {
    opts = opts || {};
    const ttl = opts.ttl != null ? opts.ttl : DEFAULT_TTL_MS;
    const now = Date.now();

    // cache hit
    const cached = CACHE.get(url);
    if (cached && (now - cached.ts) < ttl && !cached.err) {
      return cached.data;
    }

    // dedup inflight
    if (INFLIGHT.has(url)) return INFLIGHT.get(url);

    const p = (async () => {
      try {
        const res = await fetch(url, { mode: 'cors', credentials: 'omit', cache: 'no-cache' });
        if (!res.ok) {
          const err = new Error('HTTP ' + res.status + ' on ' + url);
          throw err;
        }
        const data = await res.json();
        CACHE.set(url, { data, ts: Date.now(), err: null });
        return data;
      } catch (e) {
        // Enrich network errors ("Failed to fetch") with the URL for diagnostics
        const msg = (e && e.message) || String(e);
        const enriched = msg.includes(url) ? e : new Error(msg + ' — ' + url);
        CACHE.set(url, { data: null, ts: Date.now(), err: enriched });
        throw enriched;
      } finally {
        INFLIGHT.delete(url);
      }
    })();
    INFLIGHT.set(url, p);
    return p;
  }

  function invalidate(urlOrPrefix) {
    if (!urlOrPrefix) { CACHE.clear(); return; }
    for (const k of Array.from(CACHE.keys())) {
      if (k === urlOrPrefix || k.startsWith(urlOrPrefix)) CACHE.delete(k);
    }
  }

  /* Formatting helpers shared by modules */
  const fmt = {
    num: (v, d = 2) => {
      if (v == null || isNaN(v)) return '—';
      return Number(v).toFixed(d);
    },
    money: (v, d = 2) => {
      if (v == null || isNaN(v)) return '—';
      return '$' + Number(v).toFixed(d);
    },
    pct: (v, d = 1) => {
      if (v == null || isNaN(v)) return '—';
      return (v >= 0 ? '+' : '') + Number(v).toFixed(d) + '%';
    },
    pctRaw: (v, d = 2) => {  // assumes v is already a fraction e.g. 0.012 -> 1.20
      if (v == null || isNaN(v)) return '—';
      return (v * 100).toFixed(d) + '%';
    },
    compact: (v) => {
      if (v == null || isNaN(v)) return '—';
      const n = Math.abs(v);
      if (n >= 1e12) return (v/1e12).toFixed(1) + 'T';
      if (n >= 1e9)  return (v/1e9).toFixed(1) + 'B';
      if (n >= 1e6)  return (v/1e6).toFixed(1) + 'M';
      if (n >= 1e3)  return (v/1e3).toFixed(1) + 'K';
      return String(v);
    },
    dateShort: (s) => {
      if (!s) return '—';
      // "2026-04-17" -> "Apr 17" ;  "2026-04-17 13:52:15" -> "Apr 17 13:52"
      const parts = String(s).split(' ');
      const d = new Date(parts[0]);
      if (isNaN(d)) return s;
      const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()];
      const day = String(d.getUTCDate()).padStart(2, '0');
      return m + ' ' + day + (parts[1] ? ' ' + parts[1].slice(0,5) : '');
    },
    ago: (s) => {
      if (!s) return '—';
      const d = new Date(String(s).replace(' ', 'T'));
      if (isNaN(d)) return s;
      const mins = Math.floor((Date.now() - d.getTime()) / 60000);
      if (mins < 1) return 'just now';
      if (mins < 60) return mins + 'm ago';
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return hrs + 'h ago';
      const days = Math.floor(hrs / 24);
      return days + 'd ago';
    },
  };

  window.OC_DATA = { fetchJSON, invalidate, fmt };
})();
