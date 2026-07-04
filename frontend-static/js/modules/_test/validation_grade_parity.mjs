#!/usr/bin/env node
// Drift-parity guard (GLM impl-review O1, 2026-06-30): the Overfit-Graveyard scatter
// colors each pattern by a STATIC seed grade map that MUST stay identical across the
// web (signals.html PATTERN_GRADES) and the terminal (signals.js VG_PATTERN_GRADES),
// or the "same" panel colors patterns differently across surfaces. This asserts they
// match. Run: node js/modules/_test/validation_grade_parity.mjs
import fs from 'fs';
import assert from 'assert';

const WEB = '/opt/stocks-app/frontend-static/signals.html';
const TERM = '/opt/terminal-app/frontend-static/js/modules/signals.js';

function extractObj(src, varName) {
  const i = src.indexOf(varName);
  assert.ok(i >= 0, `${varName} not found`);
  const open = src.indexOf('{', i);
  let d = 0, end = -1;
  for (let k = open; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) { end = k; break; } }
  }
  // eslint-disable-next-line no-eval
  return eval('(' + src.slice(open, end + 1) + ')');
}

const web  = extractObj(fs.readFileSync(WEB, 'utf8'),  'PATTERN_GRADES = ');
const term = extractObj(fs.readFileSync(TERM, 'utf8'), 'VG_PATTERN_GRADES = ');

try {
  assert.deepStrictEqual(term, web);
  console.log(`PASS — seed grade maps identical (${Object.keys(web).length} patterns).`);
  process.exit(0);
} catch (e) {
  const wk = new Set(Object.keys(web)), tk = new Set(Object.keys(term));
  console.error('FAIL — seed grade maps DIVERGED:');
  for (const k of wk) if (!tk.has(k)) console.error(`  web-only: ${k}=${web[k]}`);
  for (const k of tk) if (!wk.has(k)) console.error(`  term-only: ${k}=${term[k]}`);
  for (const k of wk) if (tk.has(k) && web[k] !== term[k]) console.error(`  mismatch: ${k} web=${web[k]} term=${term[k]}`);
  process.exit(1);
}
