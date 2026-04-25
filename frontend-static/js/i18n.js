/* terminal.clawmo.tech — i18n helpers
   Scope: module labels + titles. Panel titles and column headers stay English
   per terminal convention (Bloomberg/Refinitiv also keep those English for CN locales). */
(function () {
  'use strict';

  let LANG = 'EN';
  try { LANG = localStorage.getItem('ocLang') || 'EN'; } catch (e) {}

  const DICT = {
    EN: {
      LOADING: 'Loading',
      UPDATED: 'updated',
      LAST: 'last',
      LIVE: 'LIVE',
      LOCKED: 'LOCKED',
      UNLOCKED: 'UNLOCKED',
      EMPTY: 'Empty pane',
      OPEN_HINT: 'press ⌘K or click a rail button',
    },
    CN: {
      LOADING: '載入中',
      UPDATED: '更新於',
      LAST: '最近',
      LIVE: '即時',
      LOCKED: '鎖定',
      UNLOCKED: '已解鎖',
      EMPTY: '空面板',
      OPEN_HINT: '按 ⌘K 或點擊左側模組',
    },
  };

  function t(key) {
    return (DICT[LANG] && DICT[LANG][key]) || (DICT.EN[key]) || key;
  }
  function getLang() { return LANG; }
  function setLang(l) {
    if (l !== 'EN' && l !== 'CN') return;
    LANG = l;
    try { localStorage.setItem('ocLang', l); } catch (e) {}
    document.documentElement.dataset.lang = l;
    window.dispatchEvent(new CustomEvent('oc-lang-change', { detail: { lang: l } }));
  }

  /* Returns a module's header title using its registered label.
     EN → label.toUpperCase(), CN → labelCN (or label if missing). */
  function title(id) {
    const mod = (window.OC_MODULES_META && window.OC_MODULES_META[id]);
    if (!mod) return id;
    return LANG === 'CN' ? (mod.labelCN || mod.label) : String(mod.label || '').toUpperCase();
  }

  /* Returns a module's rail label (sentence case for EN, CN label for CN). */
  function railLabel(id) {
    const mod = (window.OC_MODULES_META && window.OC_MODULES_META[id]);
    if (!mod) return id;
    return LANG === 'CN' ? (mod.labelCN || mod.label) : mod.label;
  }

  document.documentElement.dataset.lang = LANG;

  window.OC_T = t;
  window.OC_LANG = getLang;
  window.OC_SET_LANG = setLang;
  window.OC_TITLE = title;
  window.OC_RAIL_LABEL = railLabel;
})();
