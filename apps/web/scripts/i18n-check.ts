// Lists English texts used with t('...') in src/ that have no Filipino in
// src/i18n/fil.ts, and placeholders that differ. Run: npm run i18n:check
import fs from 'node:fs';
import path from 'node:path';
import fil from '../src/i18n/fil';

const SRC = path.join(import.meta.dirname, '..', 'src');
const files: string[] = [];
(function walk(dir: string) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) {
      if (!['generated', 'server', 'i18n'].includes(f) && !p.includes(`${path.sep}api${path.sep}`)) walk(p);
    } else if (/\.tsx?$/.test(f) && !/\.test\./.test(f)) files.push(p);
  }
})(SRC);

const keys = new Set<string>();
const re = /\bt(?:\.error)?\(\s*(?:(['"`])((?:\\.|(?!\1).)*)\1|[^)]*?\?\s*(['"])((?:\\.|(?!\3).)*)\3\s*:\s*(['"])((?:\\.|(?!\5).)*)\5)/g;
for (const f of files) {
  for (const m of fs.readFileSync(f, 'utf8').matchAll(re)) {
    for (const k of [m[2], m[4], m[6]]) {
      if (k !== undefined && !k.includes('${')) keys.add(k.replace(/\\'/g, "'").replace(/\\"/g, '"'));
    }
  }
}

const missing = [...keys].filter((k) => !(k in fil));
console.log(`${keys.size} texts used, ${Object.keys(fil).length} in fil.ts, ${missing.length} missing.`);
for (const k of missing) console.log('  missing: ' + JSON.stringify(k));

let bad = 0;
for (const [k, v] of Object.entries(fil)) {
  const a = (k.match(/\{\w+\}/g) ?? []).sort().join();
  const b = (v.match(/\{\w+\}/g) ?? []).sort().join();
  if (a !== b) {
    bad++;
    console.log('  placeholder mismatch: ' + JSON.stringify(k) + ' -> ' + JSON.stringify(v));
  }
}
if (missing.length || bad) process.exitCode = 1;
