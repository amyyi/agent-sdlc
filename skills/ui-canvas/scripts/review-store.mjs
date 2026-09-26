import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';

const statuses = ['pending', 'needs-clarification', 'handled'];
const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
const string = (value, label, empty = false) => {
  if (typeof value !== 'string' || (!empty && !value.trim())) fail(`${label} must be a ${empty ? '' : 'nonempty '}string`);
  return value;
};
const hash = text => 'sha256:' + createHash('sha256').update(text).digest('hex').slice(0, 12);
const revision = entry => entry.revision ?? 1;
const ledgerPath = directory => path.join(directory, 'feedback-ledger.json');
const unchanged = Symbol('unchanged'); // set by apply() when an operation is a no-op; the file is then left untouched

// One rule for "open agent question", shared by the store, the CLI and (mirrored) the browser:
// an agent-created note still awaiting a decision, on a board that still exists.
export const isOpenQuestion = entry => entry.source === 'agent' && entry.status === 'needs-clarification' && entry.presence !== 'board-removed';

export function readLedger(featureDir) {
  let ledger;
  try { ledger = JSON.parse(readFileSync(ledgerPath(featureDir), 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return { schemaVersion: 2, version: 'v1', entries: [], approvals: [] };
    fail(`Cannot read feedback ledger: ${error.message}`);
  }
  if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger) ||
      (ledger.schemaVersion !== undefined && ledger.schemaVersion !== 2) ||
      !Array.isArray(ledger.entries) || (ledger.approvals !== undefined && !Array.isArray(ledger.approvals))) fail('Invalid feedback ledger');
  if (ledger.version !== undefined) string(ledger.version, 'ledger version');
  if (ledger.versionHistory !== undefined && !Array.isArray(ledger.versionHistory)) fail('Invalid version history');
  const ids = new Set();
  for (const entry of ledger.entries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) fail('Invalid ledger entry');
    string(entry.id, 'entry id');
    if (entry.textHash === undefined && typeof entry.reviewerText === 'string') entry.textHash = hash(entry.reviewerText);
    // A legacy entry with neither text nor hash is kept verbatim and flagged; it must not block the whole ledger.
    if (entry.textHash === undefined) entry.presence ??= 'legacy';
    else string(entry.textHash, 'entry textHash');
    if (ids.has(entry.id)) fail('Duplicate ledger entry id');
    ids.add(entry.id);
    if ((entry.status !== undefined && !statuses.includes(entry.status)) ||
        !Number.isSafeInteger(revision(entry)) || revision(entry) < 1 ||
        (entry.history !== undefined && !Array.isArray(entry.history)) ||
        (entry.reviewerText !== undefined && typeof entry.reviewerText !== 'string')) fail('Invalid ledger entry metadata');
    if (entry.agentQuestion !== undefined) string(entry.agentQuestion, 'entry agentQuestion');
    if (entry.options !== undefined && (!Array.isArray(entry.options) || entry.options.some(option => typeof option !== 'string' || !option.trim())))
      fail('Invalid ledger entry options');
    if (entry.source !== undefined) string(entry.source, 'entry source');
    if (entry.presence !== undefined) string(entry.presence, 'entry presence');
  }
  for (const approval of ledger.approvals ?? []) {
    if (!approval || typeof approval !== 'object' || Array.isArray(approval) ||
        !Array.isArray(approval.scope) || (approval.invalidations !== undefined && !Array.isArray(approval.invalidations))) fail('Invalid approval record');
    for (const item of approval.scope) {
      if (!item || typeof item !== 'object') fail('Invalid approval scope');
      string(item.screen, 'approval scope screen'); string(item.state, 'approval scope state');
    }
  }
  if (ledger.previewVersion !== undefined) string(ledger.previewVersion, 'previewVersion');
  if (ledger.boards !== undefined) {
    if (!Array.isArray(ledger.boards)) fail('Invalid ledger boards');
    for (const board of ledger.boards) {
      if (!board || typeof board !== 'object' || Array.isArray(board)) fail('Invalid ledger board');
      string(board.screen, 'board screen'); string(board.state, 'board state'); string(board.targetRevision, 'board targetRevision');
    }
  }
  return { ...ledger, schemaVersion: 2, version: ledger.version ?? ledger.previewVersion ?? 'v1', approvals: ledger.approvals ?? [],
    boards: ledger.boards ?? [],
    entries: ledger.entries.map(entry => ({ ...entry, revision: revision(entry), status: entry.status ?? 'pending' })) };
}

function updateEntry(entry, changes, now, event) {
  const { history = [], ...prior } = entry;
  return { ...entry, ...changes, revision: revision(entry) + 1, updatedAt: now,
    history: [...history, { ...prior, recordedAt: now, event }] };
}

function apply(ledger, operation) {
  if (!operation || typeof operation !== 'object' || Array.isArray(operation)) fail('Operation must be an object');
  const now = new Date().toISOString();
  if (operation.type === 'create') {
    for (const key of ['screen', 'anchor', 'state', 'targetRevision']) string(operation[key], key);
    string(operation.reviewerText, 'reviewerText', true);
    let agentQuestion, options;
    if (operation.options !== undefined && operation.agentQuestion === undefined) fail('options require agentQuestion');
    if (operation.agentQuestion !== undefined) {
      agentQuestion = string(operation.agentQuestion, 'agentQuestion');
      if (operation.reviewerText.trim()) fail('An agent question must start unanswered (empty reviewerText)');
      if (operation.options !== undefined) {
        if (!Array.isArray(operation.options) || operation.options.length > 8 ||
            operation.options.some(option => typeof option !== 'string' || !option.trim())) fail('options must be an array of up to 8 nonempty strings');
        options = [...new Set(operation.options.map(option => option.trim()))];
      }
    }
    ledger.entries.push({ id: randomUUID(), screen: operation.screen, anchor: operation.anchor, state: operation.state,
      targetRevision: operation.targetRevision, reviewerText: operation.reviewerText, textHash: hash(operation.reviewerText),
      status: agentQuestion !== undefined ? 'needs-clarification' : (operation.reviewerText.trim() ? 'pending' : 'needs-clarification'), revision: 1,
      createdAt: now, updatedAt: now, history: [], source: agentQuestion !== undefined ? 'agent' : 'local-review',
      ...(agentQuestion !== undefined ? { agentQuestion } : {}), ...(options !== undefined ? { options } : {}) });
  } else if (operation.type === 'edit' || operation.type === 'reply') {
    const index = ledger.entries.findIndex(entry => entry.id === operation.id);
    if (index < 0) fail('Unknown note');
    const entry = ledger.entries[index];
    if (operation.expectedRevision !== revision(entry)) fail('Note changed; reload the latest note before saving', 409);
    if (operation.type === 'edit') {
      string(operation.reviewerText, 'reviewerText', true);
      if (operation.reviewerText === entry.reviewerText) return Object.defineProperty(ledger, unchanged, { value: true });
      ledger.entries[index] = updateEntry(entry, { reviewerText: operation.reviewerText,
        textHash: hash(operation.reviewerText), status: operation.reviewerText.trim() ? 'pending' : 'needs-clarification' }, now, 'edit');
    } else {
      if (operation.expectedTargetRevision !== entry.targetRevision) fail('Note target changed; inspect it again', 409);
      if (!statuses.includes(operation.status)) fail('Invalid reply status');
      string(operation.agentReply, 'agentReply');
      if (operation.status === 'handled') {
        string(operation.evidence?.change, 'evidence.change');
        string(operation.evidence?.render, 'evidence.render');
        if (operation.reviewedVersion !== ledger.version) fail('Reviewed version is stale', 409);
        if (!entry.reviewerText?.trim()) fail('Empty or legacy reviewer text requires clarification before handling');
      }
      ledger.entries[index] = updateEntry(entry, { status: operation.status, agentReply: operation.agentReply,
        evidence: operation.evidence ?? null, reviewedVersion: operation.reviewedVersion ?? null }, now, 'reply');
    }
  } else if (operation.type === 'reconcileBoards') {
    // Single source of truth: a screen/state pair "changed" iff its board.targetRevision moved.
    // Called by createReviewServer on every startup (and by `review-notes.mjs sync`), never by the
    // reviewer's browser — the manifest, not the UI, decides what changed.
    string(operation.version, 'version');
    if (operation.sourceRevision !== undefined && operation.sourceRevision !== null) string(operation.sourceRevision, 'sourceRevision');
    if (!Array.isArray(operation.boards)) fail('boards must be an array');
    const boards = operation.boards.map(board => {
      if (!board || typeof board !== 'object' || Array.isArray(board)) fail('Invalid board');
      for (const key of ['screen', 'state', 'targetRevision']) string(board[key], `board.${key}`);
      return { screen: board.screen, state: board.state, targetRevision: board.targetRevision };
    });
    const boardKey = board => JSON.stringify([board.screen, board.state]);
    const priorBoards = ledger.boards ?? [];
    const priorByKey = new Map(priorBoards.map(board => [boardKey(board), board]));
    const newKeys = new Set(boards.map(boardKey));
    const boardsIdentical = priorBoards.length === boards.length &&
      boards.every(board => priorByKey.get(boardKey(board))?.targetRevision === board.targetRevision) &&
      priorBoards.every(board => newKeys.has(boardKey(board)));
    const versionChanged = operation.version !== ledger.version;
    const sourceRevisionChanged = operation.sourceRevision !== undefined && operation.sourceRevision !== ledger.sourceRevision;
    const staleOutsideManifest = priorBoards.length > 0 && (
      ledger.entries.some(entry => !newKeys.has(boardKey(entry)) && entry.presence !== 'board-removed') ||
      ledger.approvals.some(approval => {
        const already = new Set((approval.invalidations ?? []).flatMap(record => (record.scope ?? []).map(boardKey)));
        return approval.scope.some(item => !newKeys.has(boardKey(item)) && !already.has(boardKey(item)));
      }));
    if (boardsIdentical && !versionChanged && !sourceRevisionChanged && !staleOutsideManifest) return Object.defineProperty(ledger, unchanged, { value: true });
    for (const board of boards) {
      const prior = priorByKey.get(boardKey(board));
      // No prior record and no notes referencing a different revision yet: nothing to reopen, just record.
      const changed = prior ? prior.targetRevision !== board.targetRevision
        : ledger.entries.some(entry => entry.screen === board.screen && entry.state === board.state && entry.targetRevision !== board.targetRevision);
      if (!changed) continue;
      ledger.entries = ledger.entries.map(entry => {
        if (entry.screen !== board.screen || entry.state !== board.state || entry.targetRevision === board.targetRevision) return entry;
        return updateEntry(entry, { targetRevision: board.targetRevision,
          status: entry.reviewerText?.trim() ? 'pending' : 'needs-clarification' }, now, 'target-changed');
      });
      ledger.approvals = ledger.approvals.map(approval => {
        // A legacy scope item with no targetRevision cannot be proven still-current: invalidate conservatively.
        // An item already listed in an earlier invalidation is not invalidated again (idempotent across syncs).
        const already = new Set((approval.invalidations ?? []).flatMap(record => (record.scope ?? []).map(boardKey)));
        const invalidated = approval.scope.filter(item => item.screen === board.screen && item.state === board.state &&
          !already.has(boardKey(item)) && (item.targetRevision === undefined || item.targetRevision !== board.targetRevision));
        if (!invalidated.length) return approval;
        return { ...approval, invalidations: [...(approval.invalidations ?? []),
          { at: now, version: operation.version, scope: invalidated, reason: 'Board revision changed' }] };
      });
    }
    // Boards no longer present in the manifest are dropped from ledger.boards; their approval scope items
    // are invalidated once ('Board removed', idempotent via the same `already` set as a revision change)
    // and their notes get presence:'board-removed' (status/revision untouched — set the field directly,
    // never through updateEntry, so this never counts as a reviewer-visible edit).
    // Only once the ledger has ever recorded boards (not a legacy ledger): anything the manifest no
    // longer lists counts as removed — whether it was in the last recorded list or dropped earlier.
    if (priorBoards.length > 0) {
      ledger.approvals = ledger.approvals.map(approval => {
        const already = new Set((approval.invalidations ?? []).flatMap(record => (record.scope ?? []).map(boardKey)));
        const invalidated = approval.scope.filter(item => !newKeys.has(boardKey(item)) && !already.has(boardKey(item)));
        if (!invalidated.length) return approval;
        return { ...approval, invalidations: [...(approval.invalidations ?? []),
          { at: now, version: operation.version, scope: invalidated, reason: 'Board removed' }] };
      });
      ledger.entries = ledger.entries.map(entry =>
        !newKeys.has(boardKey(entry)) && entry.presence !== 'board-removed' ? { ...entry, presence: 'board-removed' } : entry);
    }
    // A board that reappears clears the board-removed presence marker from its notes.
    for (const board of boards) {
      const key = boardKey(board);
      if (priorByKey.has(key)) continue; // was already present last reconcile; nothing to clear
      ledger.entries = ledger.entries.map(entry => {
        if (entry.screen !== board.screen || entry.state !== board.state || entry.presence !== 'board-removed') return entry;
        const { presence, ...rest } = entry;
        return rest;
      });
    }
    ledger.boards = boards;
    if (versionChanged) {
      ledger.versionHistory = [...(ledger.versionHistory ?? []), { version: ledger.version, sourceRevision: ledger.sourceRevision ?? null, supersededAt: now }];
      ledger.version = operation.version;
      if (Object.hasOwn(ledger, 'previewVersion')) ledger.previewVersion = operation.version;
    }
    if (operation.sourceRevision !== undefined) ledger.sourceRevision = operation.sourceRevision;
  } else if (operation.type === 'approveVersion') {
    if (operation.expectedVersion !== ledger.version) fail('Preview version changed; review the current version', 409);
    string(operation.reviewer, 'reviewer');
    string(operation.confirmation, 'confirmation');
    if (!Array.isArray(operation.scope) || !operation.scope.length) fail('Approval requires screen/state scope');
    for (const item of operation.scope) {
      if (!item || typeof item !== 'object') fail('Invalid approval scope');
      string(item.screen, 'scope.screen'); string(item.state, 'scope.state'); string(item.targetRevision, 'scope.targetRevision');
    }
    if (!Array.isArray(operation.gaps) || operation.gaps.some(gap => typeof gap !== 'string' || !gap.trim())) fail('gaps must be an array of nonempty strings');
    if (!(operation.gaps.length > 0 || operation.noGapsConfirmed === true)) fail('Approval requires gaps or an explicit no-gaps confirmation');
    const open = ledger.entries.filter(isOpenQuestion).length;
    if (operation.noGapsConfirmed === true && open > 0) fail(`Cannot confirm "no gaps" while ${open} agent question(s) are unanswered; answer them or list them as gaps`);
    ledger.approvals.push({ id: randomUUID(), reviewer: operation.reviewer, confirmation: operation.confirmation,
      version: ledger.version, scope: operation.scope, gaps: operation.gaps, noGapsConfirmed: Boolean(operation.noGapsConfirmed),
      createdAt: now, invalidations: [] });
  } else fail('Unknown operation type');
  ledger.updatedAt = now;
  return ledger;
}

export function mutateLedger(featureDir, operation) {
  mkdirSync(featureDir, { recursive: true });
  const destination = ledgerPath(featureDir);
  const lock = destination + '.lock';
  let descriptor;
  try { descriptor = openSync(lock, 'wx', 0o600); }
  catch (error) { if (error.code === 'EEXIST') fail('Feedback is being saved by another process; retry shortly', 409); throw error; }
  const temporary = destination + '.' + randomUUID() + '.tmp';
  try {
    const ledger = apply(readLedger(featureDir), operation);
    if (ledger[unchanged]) return ledger; // no-op: leave the file, its mtime and updatedAt exactly as they were
    writeFileSync(temporary, JSON.stringify(ledger, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    renameSync(temporary, destination);
    return ledger;
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
    closeSync(descriptor);
    unlinkSync(lock);
  }
}
