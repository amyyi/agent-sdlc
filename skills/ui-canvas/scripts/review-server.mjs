#!/usr/bin/env node
import http from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLedger, mutateLedger } from './review-store.mjs';
import { normalizeManifest } from './review-layout.mjs';

const assets = path.join(path.dirname(fileURLToPath(import.meta.url)), 'review-web');
const files = new Map([
  ['/', ['index.html', 'text/html']], ['/app.js', ['app.js', 'text/javascript']],
  ['/style.css', ['style.css', 'text/css']], ['/bridge.js', ['bridge.js', 'text/javascript']],
]);
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const thumbMime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

// The legacy single-preview options (--preview/--screen/--state/--target-revision) become a one-board
// manifest whose sole board is id "main", for backward compatibility with pre-manifest callers/tests.
function legacyManifest({ previewUrl, screen = 'preview', state = 'default', targetRevision = 'v1' }) {
  if (!previewUrl) throw fail('At least one review target is required');
  return { version: 1, targetRevision, boards: [{ id: 'main', title: screen, screen, state, previewUrl, targetRevision, flow: 1 }] };
}

export function createReviewServer({ featureDir, manifest, ...legacyOptions }) {
  const raw = manifest ?? legacyManifest(legacyOptions);
  const normalized = normalizeManifest(raw, featureDir);
  // Single source of truth: reconcile the ledger against this manifest's board revisions before
  // serving anything, so a reviewer never sees a stale note/approval next to a board that already moved.
  try {
    mutateLedger(featureDir, { type: 'reconcileBoards', version: normalized.targetRevision, sourceRevision: normalized.sourceRevision,
      boards: normalized.boards.map(board => ({ screen: board.screen, state: board.state, targetRevision: board.targetRevision })) });
  } catch (error) {
    if (error.statusCode === 409) {
      throw fail(`feedback-ledger.json.lock exists in ${featureDir}; another process is writing. Remove it only after confirming no writer is active.`, 409);
    }
    throw error;
  }
  const [primary] = normalized.boards;
  const frameOrigins = [...new Set(normalized.boards.map(board => new URL(board.previewUrl).origin))].join(' ');
  const publicBoards = normalized.boards.map(({ thumbnailPath, ...board }) => board);
  const boardsById = new Map(normalized.boards.map(board => [board.id, board]));
  const config = {
    version: 1,
    feature: path.basename(featureDir),
    sourceRevision: normalized.sourceRevision,
    boards: publicBoards,
    // Backward-compat convenience fields mirror the first board (pre-manifest clients read a single preview).
    previewUrl: primary.previewUrl,
    screen: primary.screen,
    state: primary.state,
    targetRevision: primary.targetRevision,
  };
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const json = (code, value) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
    try {
      const port = server.address().port;
      const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
      if (!hosts.includes(req.headers.host)) throw fail('Invalid local Host', 403);
      const origin = `http://${req.headers.host}`;
      const pathname = new URL(req.url, origin).pathname;
      if (req.method === 'GET' && files.has(pathname)) {
        const [name, mime] = files.get(pathname);
        if (pathname === '/') res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; frame-src ${frameOrigins}; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`);
        res.writeHead(200, { 'Content-Type': `${mime}; charset=utf-8` });
        res.end(readFileSync(path.join(assets, name)));
      } else if (req.method === 'GET' && pathname === '/api/state') {
        if (req.headers.origin && req.headers.origin !== origin) throw fail('Foreign origin', 403);
        json(200, { ledger: readLedger(featureDir), config });
      } else if (req.method === 'GET' && pathname.startsWith('/thumb/')) {
        if (req.headers.origin && req.headers.origin !== origin) throw fail('Foreign origin', 403);
        // Serves only the manifest-validated thumbnailPath (realpath-confined to the feature dir at
        // startup); the request supplies a board id, never a filesystem path.
        const board = boardsById.get(decodeURIComponent(pathname.slice('/thumb/'.length)));
        if (!board || !board.thumbnailPath) { json(404, { error: 'Not found' }); return; }
        const mime = thumbMime[path.extname(board.thumbnailPath).toLowerCase()] || 'application/octet-stream';
        res.setHeader('Cache-Control', 'no-store');
        res.writeHead(200, { 'Content-Type': mime });
        res.end(readFileSync(board.thumbnailPath));
      } else if (req.method === 'POST' && ['/api/notes', '/api/approve'].includes(pathname)) {
        if (req.headers.origin !== origin) throw fail('Same-origin request required', 403);
        if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw fail('JSON required', 415);
        const chunks = [];
        let bytes = 0;
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > 65536) throw fail('Request too large', 413);
          chunks.push(chunk);
        }
        let operation;
        try { operation = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw fail('Invalid JSON'); }
        const allowed = pathname === '/api/notes' ? ['create', 'edit'] : ['approveVersion'];
        if (!operation || !allowed.includes(operation.type)) throw fail('Unsupported reviewer operation');
        if (pathname === '/api/notes' && operation && (operation.agentQuestion !== undefined || operation.options !== undefined || operation.source !== undefined)) {
          throw fail('agentQuestion is CLI-only');
        }
        if (operation.type === 'create' && !normalized.boards.some(board => board.screen === operation.screen && board.state === operation.state && board.targetRevision === operation.targetRevision)) {
          throw fail('Unknown review target; reload the review page');
        }
        if (operation.type === 'approveVersion') {
          // The client's scope is advisory at best; the server stamps the authoritative board list
          // and current targetRevision so an approval can never silently outlive a board's revision.
          operation.scope = normalized.boards.map(board => ({ screen: board.screen, state: board.state, targetRevision: board.targetRevision }));
        }
        json(200, mutateLedger(featureDir, operation));
      } else json(404, { error: 'Not found' });
    } catch (error) {
      if (!res.headersSent) json(error.statusCode || 500, { error: error.message });
      else res.end();
    }
  });
  server.reviewBoards = normalized.boards; // normalized once, here; the CLI startup log reads this instead of re-normalizing.
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const flags = new Map();
    for (let i = 0; i < args.length; i += 2) {
      if (!['--feature', '--manifest', '--targets', '--preview', '--screen', '--state', '--target-revision', '--port'].includes(args[i]) || !args[i + 1]) throw fail('Invalid arguments');
      flags.set(args[i], args[i + 1]);
    }
    const usage = 'Usage: node review-server.mjs --feature DIR [--manifest manifest.json | --targets review-targets.json | --preview URL [--screen NAME --state NAME --target-revision REV]] [--port 4318]\n' +
      'When --manifest, --targets, and --preview are all omitted, <feature>/review-manifest.json then <feature>/review-targets.json is auto-discovered.';
    if (!flags.has('--feature')) throw fail(usage);
    const inputFlags = ['--manifest', '--targets', '--preview'].filter(flag => flags.has(flag));
    if (inputFlags.length > 1) throw fail(`${inputFlags.join(' and ')} are mutually exclusive`);
    if (!flags.has('--preview') && (flags.has('--screen') || flags.has('--state') || flags.has('--target-revision'))) {
      throw fail('--screen/--state/--target-revision are only valid together with --preview');
    }
    const port = Number(flags.get('--port') || 4318);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw fail('Invalid port');
    const featureDir = path.resolve(flags.get('--feature'));
    readLedger(featureDir); // Fail before listening when persisted state is corrupt.
    const readJson = (file, label) => {
      try { return JSON.parse(readFileSync(file, 'utf8')); } catch (error) { throw fail(`Cannot read ${label}: ${error.message}`); }
    };
    let raw;
    if (flags.has('--manifest')) {
      raw = readJson(path.resolve(flags.get('--manifest')), 'manifest');
    } else if (flags.has('--targets')) {
      raw = readJson(path.resolve(flags.get('--targets')), 'targets');
    } else if (flags.has('--preview')) {
      raw = legacyManifest({ previewUrl: flags.get('--preview'), screen: flags.get('--screen'), state: flags.get('--state'), targetRevision: flags.get('--target-revision') });
    } else {
      const discoveredManifest = path.join(featureDir, 'review-manifest.json');
      const discoveredTargets = path.join(featureDir, 'review-targets.json');
      if (existsSync(discoveredManifest)) raw = readJson(discoveredManifest, 'manifest');
      else if (existsSync(discoveredTargets)) raw = readJson(discoveredTargets, 'targets');
      else throw fail(usage);
    }
    // createReviewServer normalizes `raw` itself; normalizing here too would run validation (and the
    // thumbnail/board checks) twice against two different object shapes — see resolveThumbnail's note.
    const server = createReviewServer({ featureDir, manifest: raw });
    server.on('error', error => { console.error(error.message); process.exitCode = 1; });
    server.listen(port, '127.0.0.1', () => console.log(`UI Canvas review: http://127.0.0.1:${port}\nFeature: ${featureDir}\nBoards: ${server.reviewBoards.length} (${server.reviewBoards.map(board => board.id).join(', ')})\nNo agent is started; use the original CLI session to process notes.`));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
