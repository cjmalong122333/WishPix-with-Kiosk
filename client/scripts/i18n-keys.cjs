// Lists the English keys used with t('...') in client/src, and (with --check)
// the ones missing from fil.js. Usage: node scripts/i18n-keys.cjs (list), npm run i18n:check
const fs = require('fs')
const path = require('path')
const SRC = path.join(__dirname, '..', 'src')
const files = []
;(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f)
    if (fs.statSync(p).isDirectory()) walk(p)
    else if (/\.(jsx?|mjs)$/.test(f) && !p.includes('i18n') && !p.includes('intro') && !p.includes('DevPanel')) files.push(p)
  }
})(SRC)

const keys = new Set()
const re = /\bt(?:\.error)?\(\s*(?:(['"`])((?:\\.|(?!\1).)*)\1|[^)]*?\?\s*(['"])((?:\\.|(?!\3).)*)\3\s*:\s*(['"])((?:\\.|(?!\5).)*)\5)/g
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  for (const m of src.matchAll(re)) {
    for (const k of [m[2], m[4], m[6]]) if (k !== undefined && !k.includes('${')) keys.add(k.replace(/\\'/g, "'").replace(/\\"/g, '"'))
  }
}

if (process.argv.includes('--check')) {
  const filSrc = fs.readFileSync(path.join(SRC, 'i18n/fil.js'), 'utf8')
  const fil = eval(filSrc.replace(/^[\s\S]*?export default/, '(').replace(/\s*$/, ')'))
  const missing = [...keys].filter((k) => !(k in fil))
  console.log(`${keys.size} keys used with a literal, ${Object.keys(fil).length} in fil.js, ${missing.length} missing:`)
  for (const k of missing) console.log('  ' + JSON.stringify(k))
  // Placeholders must match, or a value would show as {name}.
  for (const [k, v] of Object.entries(fil)) {
    const a = (k.match(/\{\w+\}/g) ?? []).sort().join()
    const b = (v.match(/\{\w+\}/g) ?? []).sort().join()
    if (a !== b) console.log('PLACEHOLDER MISMATCH', JSON.stringify(k), '->', JSON.stringify(v))
  }
} else {
  console.log([...keys].sort().map((k) => JSON.stringify(k)).join('\n'))
  console.error(keys.size + ' keys')
}
