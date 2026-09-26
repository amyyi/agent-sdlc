import { existsSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';

const fail = message => { throw Object.assign(new Error(`Invalid manifest: ${message}`), { statusCode: 400 }); };
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const THUMBNAIL_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
// The UI uses these ids for its filter chips, so a board may not claim them.
const RESERVED_BOARD_IDS = new Set(['all', 'focused']);
const COLS = 3;
const GAP_X = 80;
const GAP_Y = 120;
const DEFAULT_W = 1280;
const DEFAULT_H = 800;

function localPreview(value) {
  let url;
  try { url = new URL(value); } catch { fail('previewUrl must be a local HTTP URL'); }
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password) {
    fail('previewUrl must be a local HTTP URL');
  }
  return url;
}

function nonEmptyString(value, label) {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} must be a nonempty string`);
  return value;
}

function positiveIntInRange(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) fail(`${label} must be an integer between ${min} and ${max}`);
  return value;
}

function resolveThumbnail(board, featureDir) {
  if (board.thumbnail === undefined) return { thumbnail: false, thumbnailPath: undefined };
  // board.thumbnail is always the raw manifest string here: createReviewServer normalizes the raw
  // manifest exactly once and never re-normalizes an already-normalized object (see review-server.mjs),
  // so a boolean value has no legitimate source and must be rejected rather than trusted.
  nonEmptyString(board.thumbnail, 'thumbnail');
  if (!THUMBNAIL_EXTENSIONS.has(path.extname(board.thumbnail).toLowerCase())) fail('thumbnail must be .png, .jpg, .jpeg, or .webp');
  const resolved = path.resolve(featureDir, board.thumbnail);
  if (!existsSync(resolved)) fail('thumbnail file does not exist');
  // realpath the FILE itself (not just its parent): a symlink inside the feature dir pointing at
  // /etc/passwd would otherwise pass the containment check and be served verbatim by /thumb/<id>.
  let realFeatureDir, real, stats;
  try {
    realFeatureDir = realpathSync(featureDir);
    real = realpathSync(resolved);
    stats = statSync(real);
  } catch { fail('thumbnail path could not be resolved'); }
  if (real !== realFeatureDir && !real.startsWith(realFeatureDir + path.sep)) fail('thumbnail must resolve inside the feature dir');
  // Re-check the extension on the real path: the manifest string's extension says nothing about the target.
  if (!THUMBNAIL_EXTENSIONS.has(path.extname(real).toLowerCase())) fail('thumbnail must be .png, .jpg, .jpeg, or .webp');
  if (!stats.isFile()) fail('thumbnail must be a regular file');
  return { thumbnail: true, thumbnailPath: real };
}

// Pure: places boards that lack an explicit x/y into rows of COLS, honoring `flow` order (ties by array
// order); explicit x/y are kept untouched. Returns a new array; the input array/objects are never mutated.
export function layoutBoards(boards) {
  const indexed = boards.map((board, index) => ({ board, index }));
  const hasPosition = ({ board }) => Number.isInteger(board.x) && Number.isInteger(board.y);
  const placed = new Map();
  for (const entry of indexed.filter(hasPosition)) placed.set(entry.index, { ...entry.board });
  const toPlace = indexed.filter(entry => !hasPosition(entry)).sort((a, b) => {
    const flowA = a.board.flow ?? (a.index + 1);
    const flowB = b.board.flow ?? (b.index + 1);
    return flowA !== flowB ? flowA - flowB : a.index - b.index;
  });
  let cursorX = 0, cursorY = 0, rowHeight = 0, col = 0;
  for (const { board, index } of toPlace) {
    placed.set(index, { ...board, x: cursorX, y: cursorY });
    rowHeight = Math.max(rowHeight, board.h);
    col += 1;
    if (col === COLS) {
      col = 0;
      cursorX = 0;
      cursorY += rowHeight + GAP_Y;
      rowHeight = 0;
    } else {
      cursorX += board.w + GAP_X;
    }
  }
  return boards.map((_, index) => placed.get(index));
}

// Converts the parallel `review-targets.json` shape ({ targets: [{ id, screen, state, label, preview,
// targetRevision }] }) into a raw manifest object so it can flow through the same normalizeManifest
// validation + auto-layout: label -> title (default id), preview -> previewUrl, per-target
// targetRevision is kept on the board, and the manifest-level targetRevision is the first target's.
export function targetsToManifest(rawTargets) {
  if (!rawTargets || typeof rawTargets !== 'object' || Array.isArray(rawTargets)) fail('targets manifest must be an object');
  if (!Array.isArray(rawTargets.targets) || rawTargets.targets.length === 0) fail('targets must be a non-empty array');
  const boards = rawTargets.targets.map((target, index) => {
    if (!target || typeof target !== 'object' || Array.isArray(target)) fail('target must be an object');
    const board = { id: target.id, screen: target.screen, state: target.state, previewUrl: target.preview, flow: index + 1 };
    if (target.label !== undefined) board.title = target.label;
    if (target.targetRevision !== undefined) board.targetRevision = target.targetRevision;
    return board;
  });
  return { version: 1, targetRevision: rawTargets.targets[0]?.targetRevision, sourceRevision: null, boards };
}

// Validates a raw manifest against the local-review v2 contract, applies
// defaults, runs layoutBoards, and returns { version:1, sourceRevision, targetRevision, boards }.
// Also accepts the review-targets.json shape ({ targets: [...] }, no `boards` key) and converts it first.
export function normalizeManifest(raw, featureDir) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('manifest must be an object');
  if (raw.boards === undefined && Array.isArray(raw.targets)) raw = targetsToManifest(raw);
  if (raw.version !== 1) fail('version must be 1');
  const targetRevision = nonEmptyString(raw.targetRevision, 'targetRevision');
  let sourceRevision = null;
  if (raw.sourceRevision !== undefined && raw.sourceRevision !== null) {
    if (typeof raw.sourceRevision !== 'string') fail('sourceRevision must be a string');
    sourceRevision = raw.sourceRevision;
  }
  if (!Array.isArray(raw.boards) || raw.boards.length === 0) fail('boards must be a non-empty array');
  const ids = new Set();
  const screenStates = new Map();
  const prepared = raw.boards.map((board, index) => {
    if (!board || typeof board !== 'object' || Array.isArray(board)) fail('board must be an object');
    if (typeof board.id !== 'string' || !ID_PATTERN.test(board.id)) fail('board.id must match /^[A-Za-z0-9_-]{1,64}$/');
    if (RESERVED_BOARD_IDS.has(board.id.toLowerCase())) fail(`board id "${board.id}" is reserved`);
    if (ids.has(board.id)) fail(`duplicate board id: ${board.id}`);
    ids.add(board.id);
    const screen = nonEmptyString(board.screen, 'board.screen');
    const state = nonEmptyString(board.state, 'board.state');
    // The ledger attributes notes by screen+state, so a duplicate pair would silently collide.
    const screenState = `${screen}\u0000${state}`;
    if (screenStates.has(screenState)) fail(`boards "${screenStates.get(screenState)}" and "${board.id}" share screen/state`);
    screenStates.set(screenState, board.id);
    const preview = localPreview(board.previewUrl);
    const title = board.title !== undefined ? nonEmptyString(board.title, 'board.title') : board.id;
    const boardTargetRevision = board.targetRevision !== undefined ? nonEmptyString(board.targetRevision, 'board.targetRevision') : targetRevision;
    const w = board.w !== undefined ? positiveIntInRange(board.w, 'board.w', 40, 8000) : DEFAULT_W;
    const h = board.h !== undefined ? positiveIntInRange(board.h, 'board.h', 40, 8000) : DEFAULT_H;
    let x, y;
    if (board.x !== undefined || board.y !== undefined) {
      if (!Number.isInteger(board.x) || !Number.isInteger(board.y)) fail('board.x and board.y must both be integers when either is given');
      x = board.x; y = board.y;
    }
    const flow = board.flow !== undefined ? positiveIntInRange(board.flow, 'board.flow', 1, Number.MAX_SAFE_INTEGER) : index + 1;
    const { thumbnail, thumbnailPath } = resolveThumbnail(board, featureDir);
    const out = { id: board.id, title, screen, state, previewUrl: preview.href, targetRevision: boardTargetRevision, w, h, flow, thumbnail };
    if (x !== undefined) { out.x = x; out.y = y; }
    if (thumbnailPath !== undefined) out.thumbnailPath = thumbnailPath;
    return out;
  });
  return { version: 1, sourceRevision, targetRevision, boards: layoutBoards(prepared) };
}
