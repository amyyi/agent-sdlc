#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { readLedger, mutateLedger, isOpenQuestion } from './review-store.mjs';
import { normalizeManifest } from './review-layout.mjs';

const statuses = ['pending', 'needs-clarification', 'handled'];
const emptyCounts = () => Object.fromEntries(statuses.map(status => [status, 0]));

try {
  const [command, ...args] = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--all') options.all = true;
    else if (['--feature', '--input', '--manifest'].includes(args[i])) {
      const key = args[i].slice(2);
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Missing ${args[i]} value`);
      options[key] = args[++i];
    } else throw new Error(`Unknown argument: ${args[i]}`);
  }
  if (!options.feature || !['list', 'apply', 'summary', 'sync', 'ask'].includes(command)) {
    throw new Error('usage: review-notes.mjs list --feature DIR [--all] | apply --feature DIR --input FILE | summary --feature DIR | sync --feature DIR --manifest FILE | ask --feature DIR --input FILE [--manifest FILE]');
  }
  if (command === 'list') {
    const ledger = readLedger(options.feature);
    const notes = ledger.entries.filter(note => options.all || ['pending', 'needs-clarification'].includes(note.status))
      .map(({ id, revision, screen, anchor, state, targetRevision, reviewerText, status, agentReply, presence, source, agentQuestion, options: choices }) =>
        ({ id, revision, screen, anchor, state, targetRevision, reviewerText, status, agentReply,
          ...(presence ? { presence } : {}), ...(source ? { source } : {}), ...(agentQuestion !== undefined ? { agentQuestion } : {}),
          ...(choices !== undefined ? { options: choices } : {}) }));
    const questions = ledger.entries.filter(isOpenQuestion).length;
    console.log(JSON.stringify({ version: ledger.version, sourceRevision: ledger.sourceRevision ?? null, boards: ledger.boards, notes, questions }, null, 2));
  } else if (command === 'summary') {
    // Ledger-derived status for handoffs: never hand-write approval or pending counts.
    const ledger = readLedger(options.feature);
    const counts = emptyCounts();
    const byTarget = {};
    for (const note of ledger.entries) {
      counts[note.status] = (counts[note.status] ?? 0) + 1;
      const key = `${note.screen ?? '?'} · ${note.state ?? '?'}`;
      byTarget[key] ??= emptyCounts();
      byTarget[key][note.status] = (byTarget[key][note.status] ?? 0) + 1;
    }
    const approvals = ledger.approvals.map(({ reviewer, confirmation, version, scope, gaps, noGapsConfirmed, invalidations, createdAt }) =>
      ({ reviewer, confirmation, version, scope, gaps: gaps ?? [], noGapsConfirmed: Boolean(noGapsConfirmed),
        invalidations: (invalidations ?? []).length, invalidatedScope: (invalidations ?? []).flatMap(record => record.scope ?? []), createdAt: createdAt ?? null }));
    const openQuestions = ledger.entries.filter(isOpenQuestion).length;
    const removedBoardKeys = new Set(ledger.entries.filter(note => note.presence === 'board-removed').map(note => `${note.screen ?? '?'} · ${note.state ?? '?'}`));
    console.log(JSON.stringify({ version: ledger.version, sourceRevision: ledger.sourceRevision ?? null, boards: ledger.boards, approvals, counts, byTarget,
      openQuestions, removedBoards: [...removedBoardKeys], generatedAt: new Date().toISOString() }, null, 2));
  } else if (command === 'ask') {
    if (!options.input) throw new Error('ask requires --input FILE');
    const input = JSON.parse(readFileSync(options.input, 'utf8'));
    for (const key of ['screen', 'state', 'anchor', 'agentQuestion']) {
      if (typeof input[key] !== 'string' || !input[key].trim()) throw new Error(`ask input requires nonempty ${key}`);
    }
    let targetRevision = input.targetRevision;
    // Even with an explicit targetRevision, the board must exist wherever we can check (manifest or synced ledger).
    if (targetRevision !== undefined) {
      const known = options.manifest
        ? normalizeManifest(JSON.parse(readFileSync(options.manifest, 'utf8')), options.feature).boards
        : (readLedger(options.feature).boards ?? []);
      if (known.length && !known.some(candidate => candidate.screen === input.screen && candidate.state === input.state)) {
        throw new Error(`ask input targets an unknown board: ${input.screen} · ${input.state}`);
      }
    }
    if (targetRevision === undefined) {
      if (options.manifest) {
        const raw = JSON.parse(readFileSync(options.manifest, 'utf8'));
        const normalized = normalizeManifest(raw, options.feature);
        const board = normalized.boards.find(candidate => candidate.screen === input.screen && candidate.state === input.state);
        if (!board) throw new Error(`ask input targets an unknown board: ${input.screen} · ${input.state}`);
        targetRevision = board.targetRevision;
      } else {
        const ledger = readLedger(options.feature);
        const board = (ledger.boards ?? []).find(candidate => candidate.screen === input.screen && candidate.state === input.state);
        if (!board) throw new Error(`ask input targetRevision could not be resolved; pass --manifest or targetRevision, or run sync first`);
        targetRevision = board.targetRevision;
      }
    }
    const operation = { type: 'create', screen: input.screen, anchor: input.anchor, state: input.state, targetRevision,
      reviewerText: '', agentQuestion: input.agentQuestion, ...(input.options !== undefined ? { options: input.options } : {}) };
    const ledger = mutateLedger(options.feature, operation);
    const entry = ledger.entries.at(-1);
    console.log(JSON.stringify({ id: entry.id, status: entry.status, saved: true }, null, 2));
  } else if (command === 'sync') {
    // Manual trigger for the same reconcileBoards operation createReviewServer runs at startup —
    // useful for scripts/tests that want to advance the ledger without spinning up the HTTP server.
    if (!options.manifest) throw new Error('sync requires --manifest FILE');
    const raw = JSON.parse(readFileSync(options.manifest, 'utf8'));
    const normalized = normalizeManifest(raw, options.feature);
    const before = readLedger(options.feature);
    const ledger = mutateLedger(options.feature, { type: 'reconcileBoards', version: normalized.targetRevision, sourceRevision: normalized.sourceRevision,
      boards: normalized.boards.map(board => ({ screen: board.screen, state: board.state, targetRevision: board.targetRevision })) });
    console.log(JSON.stringify({ version: ledger.version, boards: normalized.boards.length, saved: ledger.updatedAt !== before.updatedAt }, null, 2));
  } else {
    if (!options.input) throw new Error('apply requires --input FILE');
    const ledger = mutateLedger(options.feature, JSON.parse(readFileSync(options.input, 'utf8')));
    console.log(JSON.stringify({ version: ledger.version, saved: true, entries: ledger.entries.length }, null, 2));
  }
} catch (error) {
  console.error(JSON.stringify({ error: error.message, statusCode: error.statusCode ?? 400 }));
  process.exitCode = 1;
}
