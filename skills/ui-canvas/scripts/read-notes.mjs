#!/usr/bin/env node
// Extract artifact annotations or a normalized browser/dialogue note snapshot.
//
// Why: reading the artifact directly dumps ~40k tokens of editor code into the
// conversation. Everything actually needed lives in canvas.json inside the page's
// state block. This prints only that — roughly 500 tokens.
//
//   node read-notes.mjs <saved-artifact.html> [--json] [--ledger <ledger.json>]
//
// --json    machine-readable output
// --ledger  compare against feedback-ledger.json and classify each note as
//           pending / needs-clarification / handled. Missing is not approval.

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const args = process.argv.slice(2);
let file;
let asJson = false;
let ledgerPath = null;
const usage = () => {
  console.error('usage: read-notes.mjs <saved-artifact.html|notes.json> [--json] [--ledger <file>]');
  process.exit(2);
};
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--json') asJson = true;
  else if (arg === '--ledger') {
    ledgerPath = args[++i];
    if (!ledgerPath || ledgerPath.startsWith('--')) usage();
  } else if (arg.startsWith('--') || file) usage();
  else file = arg;
}
if (!file) usage();

const raw = readFileSync(file, 'utf8');

function readCanvas(raw) {
  if (raw.trimStart().startsWith('{')) {
    const snapshot = JSON.parse(raw);
    if (!Array.isArray(snapshot.notes)) throw new Error('Snapshot requires notes[]');
    return { artboards: snapshot.artboards ?? [], annotations: snapshot.notes, complete: snapshot.complete !== false };
  }

// The state block is <script type="application/json" id="appifact-doc">, HTML-escaped.
const marker = raw.indexOf('id="appifact-doc"');
if (marker === -1) {
  console.error('No appifact-doc state block found — is this a design-canvas page?');
  process.exit(1);
}
const bodyStart = raw.indexOf('>', marker) + 1;
const bodyEnd = raw.indexOf('</script>', bodyStart);

const unescapeHtml = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

let doc;
try {
  doc = JSON.parse(unescapeHtml(raw.slice(bodyStart, bodyEnd)));
} catch (err) {
  console.error('State block did not parse as JSON:', err.message);
  process.exit(1);
}

// Layout has moved between runtime versions; accept either shape.
const files = doc?.content?.files ?? doc?.files ?? {};
if (!files['canvas.json']) {
  console.error(`No canvas.json in the state block. Keys: ${Object.keys(files).join(', ')}`);
  process.exit(1);
}

return JSON.parse(files['canvas.json']);
}
const canvas = readCanvas(raw);
const artboards = canvas.artboards ?? [];
const notes = canvas.annotations ?? [];

// Which artboard is a canvas-space point sitting on?
const locate = (x, y) => {
  for (const a of artboards) {
    if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) {
      return { file: a.file, localX: x - a.x, localY: y - a.y };
    }
  }
  return null;
};

// Strip the status line and reply lines this skill adds, in ANY language, so the
// hash tracks only what the human wrote. Replies are written in the reader's
// language (see references/feedback.md), so these patterns must not assume English.
// Strip what this skill added, so the hash tracks only the human's words.
// Language-agnostic by construction: the status line is bracketed, and every
// reply sits below a fixed delimiter. Never pattern-match reply prose — the
// reply is written in the reader's language and will not match English cues.
const REPLY_DELIMITER = '\u2014\u2014\u2014'; // three em dashes on their own line
// Status wording is deliberately opaque to the parser. The skill owns one
// square-bracketed first line; its contents may be written in any language.
// Restricting removal to that position avoids mistaking bracketed reviewer text
// elsewhere in the note for agent-owned metadata.
const STATUS_LINE = /^\s*\[[^\]\r\n]+\]\s*$/;
const humanText = (text) => {
  let lines = String(text ?? '').split('\n');
  const cut = lines.findIndex((l) => l.trim() === REPLY_DELIMITER);
  if (cut !== -1) lines = lines.slice(0, cut);
  if (cut !== -1 && lines.length > 0 && STATUS_LINE.test(lines[0])) lines = lines.slice(1);
  return lines.join('\n').trim();
};

const reviewerText = (note) => typeof note.reviewerText === 'string' ? note.reviewerText : humanText(note.text);
const hashOf = (note) => 'sha256:' + createHash('sha256').update(reviewerText(note)).digest('hex').slice(0, 12);

let ledger = null;
if (ledgerPath) {
  try {
    ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    ledger = { entries: [] }; // first round — no ledger yet
  }
  if (!Array.isArray(ledger?.entries)) throw new Error('Ledger requires entries[]');
  const ids = new Set();
  for (const entry of ledger.entries) {
    if (!entry || typeof entry.id !== 'string' || !entry.id || ids.has(entry.id) ||
        typeof entry.textHash !== 'string' ||
        (entry.status !== undefined && !['pending', 'needs-clarification', 'handled'].includes(entry.status))) {
      throw new Error('Invalid or duplicate ledger entry');
    }
    ids.add(entry.id);
  }
}
const byId = new Map((ledger?.entries ?? []).map((e) => [e.id, e]));

const classify = (note) => {
  if (reviewerText(note).trim() === '') return 'needs-clarification';
  const prev = byId.get(note.id);
  if (!prev || prev.textHash !== hashOf(note)) return 'pending';
  for (const key of ['screen', 'anchor', 'targetRevision']) {
    if (prev[key] !== undefined && prev[key] !== note[key]) return 'pending';
  }
  return ['pending', 'needs-clarification', 'handled'].includes(prev.status) ? prev.status : 'pending';
};

const result = notes.map((n) => {
  const at = Number.isFinite(n.x) && Number.isFinite(n.y) ? locate(n.x, n.y) : null;
  const target = {
    ...n,
    screen: n.screen ?? at?.file ?? null,
    anchor: n.anchor ?? null,
    targetRevision: n.targetRevision ?? null,
  };
  return {
    id: n.id,
    screen: n.screen ?? at?.file ?? null,
    anchor: n.anchor ?? null,
    targetRevision: n.targetRevision ?? null,
    artboard: at?.file ?? null,
    local: at ? { x: Math.round(at.localX), y: Math.round(at.localY) } : null,
    canvas: { x: n.x, y: n.y },
    color: n.color ?? null,
    text: n.text ?? '',
    humanText: reviewerText(n),
    textHash: hashOf(n),
    status: classify(target),
  };
});

const unobservedIds = ledger
  ? (ledger.entries ?? []).filter((e) => !notes.some((n) => n.id === e.id)).map((e) => e.id)
  : [];
const vanished = canvas.complete === false ? [] : unobservedIds;
const missingNotes = vanished.map((id) => ({ ...byId.get(id), presence: 'missing' }));

if (asJson) {
  console.log(JSON.stringify({ artboards: artboards.length, notes: result, vanished, missingNotes, ...(canvas.complete === false ? { complete: false, unobservedIds } : {}) }, null, 2));
} else {
  console.log(`${artboards.length} artboards · ${result.length} annotations\n`);
  for (const n of result) {
    const where = n.artboard ? `${n.artboard} @ ${n.local.x},${n.local.y}` : 'canvas background';
    console.log(`[${n.id}] ${where}${n.status ? `  ·  ${n.status}` : ''}${n.color ? `  ·  ${n.color}` : ''}`);
    console.log(n.text || n.humanText);
    console.log('-'.repeat(68));
  }
  if (canvas.complete === false && unobservedIds.length) {
    console.log(`\nNot observed in partial snapshot (presence unknown): ${unobservedIds.join(', ')}`);
  }
  if (vanished.length) {
    console.log(`\nMissing from snapshot (keep history; not approval): ${vanished.join(', ')}`);
  }
}
