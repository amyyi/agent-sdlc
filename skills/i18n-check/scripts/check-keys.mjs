#!/usr/bin/env node
// Verify i18n keys used in source files exist in a flat Tolgee export JSON.
// Resolution rule (adjust to your i18n wrapper): 't(a:b)' -> 'a.b' (first
// colon only); otherwise '<hook namespace>.<key>', with a namespace-less
// hook defaulting to 'common'.
// Usage:
//   check-keys.mjs --export <en-US.json> [--files f1.tsx f2.ts ...] [--keys k1,k2] [--stale-days 7]
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = { export: null, files: [], keys: [], staleDays: 7 };
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--export') opt.export = args[++i];
  else if (args[i] === '--keys') opt.keys = args[++i].split(',').map(s => s.trim()).filter(Boolean);
  else if (args[i] === '--stale-days') opt.staleDays = Number(args[++i]);
  else if (args[i] === '--files') { while (args[i + 1] && !args[i + 1].startsWith('--')) opt.files.push(args[++i]); }
  else { console.error(`unknown arg: ${args[i]}`); process.exit(1); }
}
if (!opt.export) { console.error('required: --export <flat tolgee json>'); process.exit(1); }
if (!fs.existsSync(opt.export)) { console.error(`BLOCKED: export file not found: ${opt.export} — download the flat en-US export from Tolgee to this path.`); process.exit(2); }

const ageDays = (Date.now() - fs.statSync(opt.export).mtimeMs) / 86400000;
if (ageDays > opt.staleDays) console.error(`WARN: export is ${ageDays.toFixed(1)} days old (> ${opt.staleDays}) — consider re-downloading.`);
// Sibling language exports that are expected to live alongside the canonical
// one; anything else in that directory is flagged as a possible stale download.
// Set I18N_LANG_FILES="en-US.json,xx-YY.json" to match your project's locales.
const LANG_FILES = new Set(
  (process.env.I18N_LANG_FILES ?? 'en-US.json').split(',').map(s => s.trim()).filter(Boolean)
);
const stale = fs.readdirSync(path.dirname(opt.export)).filter(f => f.endsWith('.json') && f !== path.basename(opt.export) && !LANG_FILES.has(f));
if (stale.length) console.error(`WARN: other json files in ${path.dirname(opt.export)} (stale downloads?): ${stale.join(', ')} — safe to delete.`);

const exportKeys = new Set(Object.keys(JSON.parse(fs.readFileSync(opt.export, 'utf-8'))));

const resolveColon = k => { const i = k.indexOf(':'); return i === -1 ? null : k.slice(0, i) + '.' + k.slice(i + 1); };

function suggest(fullKey) {
  const short = fullKey.split('.').slice(1).join('.');
  if (!short) return [];
  const out = [];
  for (const k of exportKeys) {
    const kShort = k.slice(k.indexOf('.') + 1);
    if (kShort === short || kShort.toLowerCase() === short.toLowerCase()) out.push(k);
    if (out.length >= 3) break;
  }
  return out;
}

const findings = []; // {key, file, line, verdict, note}
const push = (key, file, line, verdict, note = '') => findings.push({ key, file, line, verdict, note });

// direct key list
for (const k of opt.keys) {
  const full = k.includes(':') ? resolveColon(k) : k;
  push(full, '(--keys)', 0, exportKeys.has(full) ? 'exists' : 'missing', exportKeys.has(full) ? '' : `suggest: ${suggest(full).join(' | ') || 'none'}`);
}

for (const file of opt.files) {
  if (!/\.(ts|tsx)$/.test(file)) continue;
  if (!fs.existsSync(file)) { console.error(`WARN: file not found (wrong cwd?): ${file}`); push('(file not found)', file, 0, 'ambiguous', 'path did not resolve — rerun from the repo root'); continue; }
  const src = fs.readFileSync(file, 'utf-8');
  const lines = src.split('\n');
  const lineOf = idx => src.slice(0, idx).split('\n').length;

  // namespaces in this file
  const nsSet = new Set();
  for (const m of src.matchAll(/useI18n(?:Multiple)?\(\s*(?:'([^']*)'|"([^"]*)"|\[([^\]]*)\]|\))/g)) {
    if (m[3] !== undefined) m[3].split(',').forEach(s => { const v = s.trim().replace(/['"]/g, ''); if (v) nsSet.add(v); });
    else if (m[1] || m[2]) nsSet.add(m[1] || m[2]);
    else nsSet.add('common'); // bare useI18n()
  }
  if (src.includes('useI18n()')) nsSet.add('common');
  const nsList = [...nsSet];

  // t(...) call sites
  for (const m of src.matchAll(/\bt\(\s*(?:'([^']+)'|"([^"]+)"|(`)|([A-Za-z_$][\w$]*(?:[.\[][^)]*)?))/g)) {
    const line = lineOf(m.index);
    const snippet = lines[line - 1].trim().slice(0, 100);
    if (m[3]) { push('(template literal)', file, line, 'dynamic', snippet); continue; }
    if (m[4]) { push(`(variable: ${m[4]})`, file, line, 'dynamic', snippet); continue; }
    const lit = m[1] ?? m[2];
    const colonKey = resolveColon(lit);
    if (colonKey) {
      push(colonKey, file, line, exportKeys.has(colonKey) ? 'exists' : 'missing', exportKeys.has(colonKey) ? '' : `suggest: ${suggest(colonKey).join(' | ') || 'none'}`);
    } else if (nsList.length === 0) {
      push(`common.${lit}`, file, line, exportKeys.has(`common.${lit}`) ? 'exists' : 'missing', 'no useI18n found; assumed common');
    } else if (nsList.length === 1 || nsList.every(n => n === nsList[0])) {
      const full = `${nsList[0]}.${lit}`;
      push(full, file, line, exportKeys.has(full) ? 'exists' : 'missing', exportKeys.has(full) ? '' : `suggest: ${suggest(full).join(' | ') || 'none'}`);
    } else {
      const hit = nsList.find(n => exportKeys.has(`${n}.${lit}`));
      if (hit) push(`${hit}.${lit}`, file, line, 'exists', `matched among namespaces [${nsList.join(', ')}]`);
      else push(`{${nsList.join('|')}}.${lit}`, file, line, 'ambiguous', 'multiple namespaces in file, none has this key — resolve scope manually');
    }
  }

  // map-style values ('x:y' string values) in i18nMap files
  if (/i18nMap/.test(file)) {
    for (const m of src.matchAll(/:\s*'([\w-]+:[\w.-]+)'/g)) {
      const full = resolveColon(m[1]);
      push(full, file, lineOf(m.index), exportKeys.has(full) ? 'exists' : 'missing', 'map-style value');
    }
  }
}

// output
const order = { missing: 0, ambiguous: 1, dynamic: 2, exists: 3 };
findings.sort((a, b) => order[a.verdict] - order[b.verdict]);
const icon = { exists: '✅', missing: '❌', dynamic: '⚠️', ambiguous: '⚠️' };
console.log('| verdict | key | location | note |');
console.log('|---------|-----|----------|------|');
for (const f of findings) console.log(`| ${icon[f.verdict]} ${f.verdict} | \`${f.key}\` | ${f.file}:${f.line} | ${f.note} |`);
const c = v => findings.filter(f => f.verdict === v).length;
console.log(`\ntotals: ${c('exists')} exists · ${c('missing')} missing · ${c('dynamic')} dynamic · ${c('ambiguous')} ambiguous`);
process.exit(c('missing') + c('ambiguous') > 0 ? 3 : 0);
