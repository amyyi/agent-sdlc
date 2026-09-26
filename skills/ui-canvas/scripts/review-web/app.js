'use strict';
const $ = id => document.getElementById(id);
const FALLBACK_W = 1280, FALLBACK_H = 800;
const MAX_ACTIVE = 3;
const MIN_K = 0.1, MAX_K = 2;
const STRIP_H = 36; // must match --strip-h in style.css; keeps .frame-body an exact board.w x board.h viewport

let ledger = null;
let config = null;
let boards = [];
let staleNotice = null; // set by render() when a board was reloaded; refresh() reports it once
let boardById = new Map();
const boardEls = new Map(); // id -> refs
const windowToBoard = new Map(); // contentWindow -> boardId
let focusedBoardId = null;
let inFocusMode = false;
let focusModeBoardId = null;
let savedViewport = null;
let viewport = { px: 0, py: 0, k: 1 };
let viewportInitialized = false;
let selecting = false;
let draft = { id: null, revision: null, boardId: null, anchor: null };
let saving = false;
let loading = false;
let conflicted = false;
let mutationEpoch = 0;
let filter = 'all';
let dragging = null;
let pendingSelectBoardId = null; // board being auto-activated on demand by #select-mode

const labels = { pending: '待處理', 'needs-clarification': '待釐清', handled: '已處理' };
const order = { pending: 0, 'needs-clarification': 1, handled: 2 };
const element = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
const report = (text, failed = false) => { $('connection').textContent = text; $('connection').classList.toggle('failed', failed); };
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

async function api(path, body) {
  const response = await fetch(path, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : {}, ...(body ? { body: JSON.stringify(body) } : {}), cache: 'no-store' });
  let data;
  try { data = await response.json(); } catch { throw new Error('伺服器回應無法讀取，請稍後重試。'); }
  if (!response.ok) { const error = new Error(data.error || `儲存失敗（${response.status}）`); error.status = response.status; throw error; }
  return data;
}

// ---------- contract / board bookkeeping ----------
function buildBoards(state) {
  const c = state.config;
  const list = Array.isArray(c.boards) && c.boards.length ? c.boards
    : [{ id: 'main', title: c.screen, screen: c.screen, state: c.state, previewUrl: c.previewUrl, targetRevision: c.targetRevision, x: 0, y: 0, w: FALLBACK_W, h: FALLBACK_H, flow: 1, thumbnail: false }];
  return list.map(b => ({ ...b, x: b.x ?? 0, y: b.y ?? 0, w: b.w ?? FALLBACK_W, h: b.h ?? FALLBACK_H, flow: b.flow ?? 0, thumbnail: Boolean(b.thumbnail) }));
}
function mergeBoards(list) {
  const nextById = new Map();
  const next = [];
  for (const b of list) {
    const prev = boardById.get(b.id);
    const stale = Boolean(prev && (prev.previewUrl !== b.previewUrl || prev.targetRevision !== b.targetRevision));
    const merged = prev
      ? { ...b, active: prev.active, bridgeReady: prev.bridgeReady, anchors: prev.anchors, previewOrigin: prev.previewOrigin, lastUsed: prev.lastUsed, readyAt: prev.readyAt, stale }
      : { ...b, active: false, bridgeReady: false, anchors: [], previewOrigin: null, lastUsed: 0, readyAt: null, stale: false };
    next.push(merged); nextById.set(b.id, merged);
  }
  boards = next; boardById = nextById;
  for (const [win, id] of windowToBoard) if (!boardById.has(id)) windowToBoard.delete(win);
  if (focusedBoardId && !boardById.has(focusedBoardId)) focusedBoardId = null;
  if (focusModeBoardId && !boardById.has(focusModeBoardId)) { inFocusMode = false; focusModeBoardId = null; }
}
function boardIdForNote(note) { const b = boards.find(x => x.screen === note.screen && x.state === note.state); return b ? b.id : null; }
// Mirrors isOpenQuestion in review-store.mjs: the server enforces the same rule on approval.
function unansweredAgentNotes() { return ledger ? ledger.entries.filter(n => n.source === 'agent' && n.status === 'needs-clarification' && n.presence !== 'board-removed') : []; }
function noteCountFor(id) { return ledger ? ledger.entries.filter(n => boardIdForNote(n) === id).length : 0; }
function pendingCountFor(id) { return ledger ? ledger.entries.filter(n => boardIdForNote(n) === id && n.status !== 'handled').length : 0; }
function normalizeAnchors(list) {
  return list.map(a => typeof a === 'string' ? { anchor: a, rect: null }
    : (a && typeof a === 'object' && typeof a.anchor === 'string' ? { anchor: a.anchor, rect: a.rect || null } : null)).filter(Boolean);
}
function activeIds() { return boards.filter(b => b.active).map(b => b.id); }

// ---------- board DOM ----------
function ensureBoardEl(board) {
  let refs = boardEls.get(board.id);
  if (refs) return refs;
  const root = element('article', 'frame');
  root.dataset.testid = `board-${board.id}`;
  root.dataset.boardId = board.id;
  const strip = element('div', 'frame-strip');
  const titleText = element('strong', 'frame-title', board.title);
  const metaText = element('span', 'frame-meta');
  const countText = element('span', 'frame-count');
  const pinTray = element('span', 'pin-tray');
  const activateBtn = element('button', 'activate');
  activateBtn.type = 'button';
  activateBtn.addEventListener('click', event => { event.stopPropagation(); toggleActive(board.id); });
  strip.append(titleText, metaText, countText, pinTray, activateBtn);
  strip.addEventListener('dblclick', () => enterFocusMode(board.id));
  const body = element('div', 'frame-body');
  const pins = element('div', 'pins');
  body.append(pins);
  body.addEventListener('dblclick', () => { const current = boardById.get(board.id); if (current && !current.active) activate(board.id); });
  let clickStart = null;
  body.addEventListener('pointerdown', event => { clickStart = { x: event.clientX, y: event.clientY }; });
  body.addEventListener('pointerup', event => {
    if (!clickStart) return;
    const dx = event.clientX - clickStart.x, dy = event.clientY - clickStart.y;
    clickStart = null;
    if (Math.hypot(dx, dy) < 4) { const current = boardById.get(board.id); if (current && !current.active) activate(board.id); }
  });
  body.addEventListener('pointercancel', () => { clickStart = null; });
  root.append(strip, body);
  root.addEventListener('pointerdown', () => { if (focusedBoardId !== board.id) { setFocused(board.id); updateToolbar(); renderFlow(); } });
  $('stage').append(root);
  refs = { root, strip, body, pins, titleText, metaText, countText, activateBtn, pinTray, iframe: null };
  boardEls.set(board.id, refs);
  return refs;
}
function positionBoard(board, refs) {
  // frame top is offset by the title strip so the BODY's top-left lands exactly at (board.x, board.y);
  // pin rect math and manifest config coordinates are expressed in body space.
  refs.root.style.setProperty('left', `${board.x}px`);
  refs.root.style.setProperty('top', `${board.y - STRIP_H}px`);
  refs.root.style.setProperty('width', `${board.w}px`);
  refs.root.style.setProperty('height', `${board.h + STRIP_H}px`);
}
function setBoardActive(board, refs, active) {
  const desiredMode = active ? 'live' : 'inactive';
  if (refs.body.dataset.mode === desiredMode) { board.active = active; return; }
  refs.body.replaceChildren();
  refs.body.dataset.mode = desiredMode;
  if (active) {
    const iframe = document.createElement('iframe');
    iframe.title = board.title;
    const url = new URL(board.previewUrl);
    url.searchParams.set('uiCanvasOrigin', location.origin);
    board.previewOrigin = url.origin;
    iframe.src = url.href;
    iframe.addEventListener('load', () => {
      board.bridgeReady = false; board.anchors = []; board.readyAt = null;
      windowToBoard.set(iframe.contentWindow, board.id);
      post(board.id, 'ui-canvas:mode', { enabled: selecting && focusedBoardId === board.id });
      updateFrameChrome(board, boardEls.get(board.id));
      renderPins(board.id); updateToolbar();
    });
    refs.pins = element('div', 'pins');
    refs.body.append(iframe, refs.pins);
    refs.iframe = iframe;
    windowToBoard.set(iframe.contentWindow, board.id);
    board.lastUsed = Date.now();
  } else {
    if (refs.iframe) for (const [win, id] of windowToBoard) if (id === board.id) windowToBoard.delete(win);
    refs.iframe = null;
    board.bridgeReady = false; board.anchors = []; board.readyAt = null;
    if (board.thumbnail) {
      const img = document.createElement('img'); img.className = 'thumb'; img.alt = `${board.title} 縮圖`; img.src = `/thumb/${encodeURIComponent(board.id)}`;
      refs.body.append(img);
    } else {
      const ph = element('div', 'placeholder');
      ph.append(element('strong', '', board.title), element('span', '', [board.screen, board.state].filter(Boolean).join(' · ')), element('span', 'hint', '點「開啟即時畫面」載入真實元件'));
      refs.body.append(ph);
    }
    refs.pins = element('div', 'pins');
    refs.body.append(refs.pins);
  }
  board.active = active;
}
function updateFrameChrome(board, refs) {
  if (!refs) return;
  refs.titleText.textContent = board.title;
  refs.metaText.textContent = [board.screen, board.state, board.targetRevision ? `rev ${board.targetRevision}` : null].filter(Boolean).join(' · ');
  refs.countText.textContent = `${noteCountFor(board.id)} 則`;
  refs.activateBtn.textContent = board.active ? '收起' : '開啟即時畫面';
  positionBoard(board, refs);
}

// ---------- LRU activation ----------
function toggleActive(id) { const board = boardById.get(id); if (!board) return; board.active ? deactivate(id) : activate(id); }
// Moves focus and, if comment mode is on, tells the outgoing/incoming boards so exactly one
// board has ui-canvas:mode enabled:true at a time.
function setFocused(id) {
  if (focusedBoardId === id) return;
  const prevId = focusedBoardId;
  if (selecting) {
    if (prevId) post(prevId, 'ui-canvas:mode', { enabled: false });
    if (id) post(id, 'ui-canvas:mode', { enabled: true });
  }
  if (pendingSelectBoardId && pendingSelectBoardId !== id) pendingSelectBoardId = null;
  focusedBoardId = id;
}
function activate(id) {
  const board = boardById.get(id);
  if (!board) return;
  if (board.active) { board.lastUsed = Date.now(); setFocused(id); updateToolbar(); renderFlow(); return; }
  const active = activeIds();
  if (active.length >= MAX_ACTIVE) {
    let victim = null;
    for (const otherId of active) { const other = boardById.get(otherId); if (!victim || other.lastUsed < victim.lastUsed) victim = other; }
    if (victim) deactivate(victim.id);
  }
  const refs = ensureBoardEl(board);
  setBoardActive(board, refs, true);
  setFocused(id);
  updateFrameChrome(board, refs);
  renderPins(id);
  updateToolbar(); renderFlow();
}
function deactivate(id) {
  const board = boardById.get(id);
  if (!board || !board.active) return;
  const refs = boardEls.get(id);
  if (pendingSelectBoardId === id) pendingSelectBoardId = null;
  if (selecting && focusedBoardId === id) {
    // this board owned comment mode — turn it off before tearing the iframe down so the
    // toolbar doesn't get stuck on "結束選取" with nothing left to disable it.
    mode(false);
    if (draft.boardId === id && draft.anchor && !draft.id) { draft.anchor = null; updateComposer(); }
  }
  setBoardActive(board, refs, false);
  if (focusedBoardId === id) focusedBoardId = activeIds()[0] || null;
  updateFrameChrome(board, refs);
  renderPins(id);
  updateToolbar(); renderFlow(); renderNotes();
}

// ---------- pins ----------
function renderPins(boardId) {
  const board = boardById.get(boardId); const refs = boardEls.get(boardId);
  if (!board || !refs) return;
  const notes = ledger ? ledger.entries.filter(n => boardIdForNote(n) === boardId) : [];
  const anchorMap = new Map((board.anchors || []).map(a => [a.anchor, a.rect]));
  refs.pins.replaceChildren();
  refs.pinTray.replaceChildren();
  notes.forEach((note, index) => {
    if (note.presence === 'board-removed') return; // moved off the board; no pin to show
    const rect = board.active ? anchorMap.get(note.anchor) : null;
    const unanswered = note.source === 'agent' && !(note.reviewerText || '').trim();
    const classes = [rect ? 'pin' : 'pin collapsed', `status-${note.status}`];
    if (unanswered) classes.push('pin-question');
    const pin = element('button', classes.join(' '), unanswered ? '?' : (rect ? String(index + 1) : '•'));
    pin.type = 'button';
    pin.dataset.testid = `pin-${note.id}`;
    pin.title = note.reviewerText;
    pin.addEventListener('click', () => focusNoteInPanel(note.id));
    if (rect) { pin.style.setProperty('left', `${rect.x + rect.w / 2}px`); pin.style.setProperty('top', `${rect.y}px`); refs.pins.append(pin); }
    else refs.pinTray.append(pin);
  });
  if (draft.boardId === boardId && draft.anchor && !draft.id) {
    const rect = anchorMap.get(draft.anchor);
    if (rect) {
      const pin = element('button', 'pin provisional', '+');
      pin.type = 'button'; pin.disabled = true;
      pin.style.setProperty('left', `${rect.x + rect.w / 2}px`); pin.style.setProperty('top', `${rect.y}px`);
      refs.pins.append(pin);
    }
  }
}
function focusNoteInPanel(id) {
  const el = document.querySelector(`#notes [data-note-id="${CSS.escape(id)}"]`);
  if (!el) return;
  el.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
  el.classList.add('highlight');
  setTimeout(() => el.classList.remove('highlight'), 1500);
}

// ---------- flow strip ----------
function renderFlow() {
  const strip = $('flow'); strip.replaceChildren();
  const ordered = [...boards].sort((a, b) => (a.flow ?? 0) - (b.flow ?? 0));
  ordered.forEach((board, index) => {
    const chip = element('button', 'chip');
    chip.type = 'button';
    chip.dataset.testid = `chip-${board.id}`;
    chip.setAttribute('aria-pressed', String(focusedBoardId === board.id));
    if (focusedBoardId === board.id) chip.classList.add('active');
    chip.append(element('span', 'chip-index', String(index + 1)), element('span', 'chip-title', board.title));
    const pending = pendingCountFor(board.id);
    if (pending) chip.append(element('span', 'chip-badge', String(pending)));
    chip.addEventListener('click', () => panToBoard(board.id));
    chip.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); enterFocusMode(board.id); } });
    strip.append(chip);
  });
}

// ---------- viewport / canvas ----------
function viewportKey() { return `ui-canvas:viewport:${(config && config.feature) || 'default'}`; }
function saveViewport() { try { localStorage.setItem(viewportKey(), JSON.stringify(viewport)); } catch { /* ignore */ } }
function loadViewport() { try { const raw = localStorage.getItem(viewportKey()); const parsed = raw ? JSON.parse(raw) : null; return parsed && typeof parsed.px === 'number' && typeof parsed.py === 'number' && typeof parsed.k === 'number' ? parsed : null; } catch { return null; } }
function applyViewport() { $('stage').style.setProperty('transform', `translate(${viewport.px}px, ${viewport.py}px) scale(${viewport.k})`); saveViewport(); }
function animateViewport(target) {
  if (reducedMotion()) { viewport = target; applyViewport(); return; }
  const start = { ...viewport }; const t0 = performance.now(); const duration = 220;
  function step(now) {
    const t = Math.min(1, (now - t0) / duration);
    const ease = 1 - Math.pow(1 - t, 3);
    viewport = { px: start.px + (target.px - start.px) * ease, py: start.py + (target.py - start.py) * ease, k: start.k + (target.k - start.k) * ease };
    applyViewport();
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
function boundsOfAll() {
  if (!boards.length) return { x: 0, y: 0, w: FALLBACK_W, h: FALLBACK_H };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of boards) { minX = Math.min(minX, b.x); minY = Math.min(minY, b.y); maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h); }
  return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
}
function fitToBounds(bounds, padding = 40) {
  const vp = $('viewport'); const vw = vp.clientWidth || 800, vh = vp.clientHeight || 600;
  const k = Math.max(MIN_K, Math.min(MAX_K, Math.min((vw - padding * 2) / bounds.w, (vh - padding * 2) / bounds.h) || 1));
  const px = (vw - bounds.w * k) / 2 - bounds.x * k;
  const py = (vh - bounds.h * k) / 2 - bounds.y * k;
  animateViewport({ px, py, k });
}
function fitAll() { fitToBounds(boundsOfAll()); }
function setZoom100() { const vp = $('viewport'); zoomAt(vp.clientWidth / 2, vp.clientHeight / 2, 1); }
function zoomAt(cursorX, cursorY, newK) {
  const k = Math.max(MIN_K, Math.min(MAX_K, newK));
  const worldX = (cursorX - viewport.px) / viewport.k;
  const worldY = (cursorY - viewport.py) / viewport.k;
  viewport = { px: cursorX - worldX * k, py: cursorY - worldY * k, k };
  applyViewport();
}
function zoomBy(factor) { const vp = $('viewport'); zoomAt(vp.clientWidth / 2, vp.clientHeight / 2, viewport.k * factor); }
function panToBoard(id) {
  const board = boardById.get(id); if (!board) return;
  setFocused(id);
  const vp = $('viewport');
  const cx = board.x + board.w / 2, cy = board.y + board.h / 2;
  animateViewport({ px: vp.clientWidth / 2 - cx * viewport.k, py: vp.clientHeight / 2 - cy * viewport.k, k: viewport.k });
  updateToolbar(); renderFlow();
}
function enterFocusMode(id) {
  const board = boardById.get(id); if (!board) return;
  if (!inFocusMode) savedViewport = { ...viewport };
  inFocusMode = true; focusModeBoardId = id; setFocused(id);
  activate(id);
  fitToBounds({ x: board.x, y: board.y, w: board.w, h: board.h });
  updateToolbar(); renderFlow();
}
function exitFocusMode() {
  if (!inFocusMode) return;
  inFocusMode = false; focusModeBoardId = null;
  if (savedViewport) animateViewport(savedViewport);
  savedViewport = null;
  updateToolbar(); renderFlow();
}

// ---------- bridge messaging ----------
function post(boardId, type, extra = {}) {
  const board = boardById.get(boardId); const refs = boardEls.get(boardId);
  if (!board || !board.active || !refs || !refs.iframe || !board.previewOrigin) return;
  refs.iframe.contentWindow.postMessage({ type, ...extra }, board.previewOrigin);
}
function mode(value) {
  selecting = value;
  if (value) pendingSelectBoardId = null;
  for (const board of boards) if (board.active) post(board.id, 'ui-canvas:mode', { enabled: value && board.id === focusedBoardId });
  updateToolbar();
}
window.addEventListener('message', event => {
  if (event.source === window || !event.data || typeof event.data !== 'object') return;
  const boardId = windowToBoard.get(event.source);
  if (!boardId) return;
  const board = boardById.get(boardId);
  if (!board || event.origin !== board.previewOrigin) return;
  const data = event.data;
  if (['ui-canvas:ready', 'ui-canvas:anchors', 'ui-canvas:rects'].includes(data.type) && Array.isArray(data.anchors)) {
    board.anchors = normalizeAnchors(data.anchors);
    if (data.type !== 'ui-canvas:rects') {
      if (!board.bridgeReady) board.readyAt = Date.now();
      board.bridgeReady = true;
      updateFrameChrome(board, boardEls.get(boardId));
    }
    renderPins(boardId);
    if (focusedBoardId === boardId) updateToolbar();
    if (data.type === 'ui-canvas:ready' && pendingSelectBoardId === boardId && focusedBoardId === boardId) {
      pendingSelectBoardId = null;
      mode(true);
    }
  }
  if (data.type === 'ui-canvas:select' && selecting && focusedBoardId === boardId && !draft.id && typeof data.anchor === 'string') {
    const present = (board.anchors || []).some(a => a.anchor === data.anchor);
    if (present) { draft = { id: null, revision: null, boardId, anchor: data.anchor }; mode(false); updateComposer(); renderPins(boardId); $('reviewer-text').focus(); }
  }
});

// ---------- composer / notes / approval ----------
function draftError(text = '') { $('draft-error').textContent = text; $('draft-error').hidden = !text; }
function updateComposer() {
  const board = draft.boardId ? boardById.get(draft.boardId) : null;
  $('draft-title').textContent = draft.id ? `編輯留言 ${draft.id}` : '新增留言';
  $('target').textContent = board && draft.anchor ? `${board.title} · ${draft.anchor}` : '尚未選取區域';
  const present = board ? (board.anchors || []).some(a => a.anchor === draft.anchor) : false;
  const focusedBoard = focusedBoardId ? boardById.get(focusedBoardId) : null;
  $('target-status').textContent = !draft.anchor && focusedBoard && !focusedBoard.active
    ? '按「選取區域留言」，畫面會自動開啟，再點要討論的區域。'
    : !draft.anchor ? '要留言：先按上方「選取區域留言」，再點畫面上的區塊。'
    : !board ? '找不到對應畫面。'
    : !board.bridgeReady ? '等待預覽連線；留言草稿已保留。'
    : present ? '留言會保留在此區域，重新整理後仍可讀取。'
    : '目前狀態找不到此區域。請切回對應畫面；此版本尚不支援重新定位既有留言。';
  $('save-note').disabled = saving || conflicted || !draft.anchor || (!draft.id && !present);
  $('save-note').textContent = saving ? '儲存中…' : draft.id ? '儲存修改' : '儲存留言';
  $('reviewer-text').disabled = saving;
  $('cancel-edit').hidden = !draft.id;
  $('reload-conflict').hidden = !conflicted;
  updateToolbar();
}
function resetDraft() { draft = { id: null, revision: null, boardId: null, anchor: null }; $('reviewer-text').value = ''; conflicted = false; draftError(); updateComposer(); }
function checkEmptyRenderWarning(board) {
  return Boolean(board && board.bridgeReady && board.readyAt && (board.anchors || []).length === 0 && Date.now() - board.readyAt >= 3000);
}
function updateToolbar() {
  const board = focusedBoardId ? boardById.get(focusedBoardId) : null;
  const pending = Boolean(pendingSelectBoardId && pendingSelectBoardId === focusedBoardId);
  const btn = $('select-mode');
  btn.disabled = !board || Boolean(draft.id) || saving;
  if (pending) {
    btn.setAttribute('aria-pressed', 'true');
    btn.textContent = '開啟中…';
    btn.classList.add('pending');
  } else {
    btn.classList.remove('pending');
    btn.setAttribute('aria-pressed', String(selecting));
    btn.textContent = selecting ? '結束選取' : '選取區域留言';
  }
  const warn = checkEmptyRenderWarning(board);
  $('bridge-status').classList.toggle('warn', warn);
  $('bridge-status').textContent = !board ? '尚未開啟畫面'
    : pending ? '正在開啟即時畫面…'
    : warn ? '預覽已連線但沒有畫面內容（0 個可留言區域）— 請確認該 Storybook／預覽正常，必要時重啟'
    : board.active ? (board.bridgeReady ? `已連接 · ${(board.anchors || []).length} 個可留言區域` : '等待預覽連線')
    : '按「選取區域留言」會先開啟即時畫面';
  $('screen-title').textContent = inFocusMode && board ? board.title : '總覽';
}
function renderFilters() {
  const bar = $('filter'); bar.replaceChildren();
  bar.append(makeFilterChip('all', '全部'), makeFilterChip('focused', '聚焦中'));
  const n = unansweredAgentNotes().length;
  if (n > 0) bar.append(makeFilterChip('agent-needs-answer', `待你決定 · ${n}`));
  for (const board of boards) bar.append(makeFilterChip(board.id, board.title));
}
function makeFilterChip(id, label) {
  const btn = element('button', 'filter-chip', label);
  btn.type = 'button';
  btn.dataset.testid = `filter-${id}`;
  btn.setAttribute('aria-pressed', String(filter === id));
  if (filter === id) btn.classList.add('active');
  btn.addEventListener('click', () => { filter = id; renderFilters(); renderNotes(); });
  return btn;
}
function openComposerForNote(note, board, text) {
  if (saving) return;
  if ($('reviewer-text').value.trim() && !window.confirm('目前有尚未儲存的草稿。要放棄草稿並編輯這則留言嗎？')) return;
  draft = { id: note.id, revision: note.revision, boardId: board ? board.id : null, anchor: note.anchor };
  $('reviewer-text').value = text || ''; conflicted = false; draftError(); mode(false); updateComposer(); $('reviewer-text').focus();
}
function renderNotes() {
  const container = $('notes'); container.replaceChildren();
  const all = ledger ? [...ledger.entries].sort((a, b) => (order[a.status] ?? 0) - (order[b.status] ?? 0)) : [];
  const entries = filter === 'all' ? all
    : filter === 'focused' ? all.filter(n => boardIdForNote(n) === focusedBoardId)
    : filter === 'agent-needs-answer' ? all.filter(n => n.source === 'agent' && !(n.reviewerText || '').trim())
    : all.filter(n => boardIdForNote(n) === filter);
  $('note-count').textContent = `${entries.length} 則${filter !== 'all' ? ` · 全部 ${all.length}` : ''}`;
  if (!entries.length) container.append(element('p', 'empty', all.length ? '此篩選條件下沒有留言。' : '選取區域，留下第一則留言。'));
  for (const note of entries) {
    const board = boardById.get(boardIdForNote(note));
    const isAgent = note.source === 'agent';
    const unanswered = isAgent && !(note.reviewerText || '').trim();
    const article = element('article', isAgent ? 'note note-agent' : 'note'); article.dataset.noteId = note.id;
    const heading = element('div', 'note-header');
    heading.append(element('strong', '', isAgent ? 'AI 想問你' : note.id), element('span', `status ${note.status}`, labels[note.status] || note.status));
    article.append(heading);
    article.append(element('p', 'note-meta', [board?.title, note.anchor].filter(Boolean).join(' · ')));
    if (isAgent) article.append(element('p', 'agent-question', note.agentQuestion || ''));
    if (unanswered) {
      if (Array.isArray(note.options) && note.options.length) {
        const optWrap = element('div', 'agent-options');
        for (const option of note.options) {
          const optBtn = element('button', 'agent-option', option);
          optBtn.type = 'button';
          optBtn.addEventListener('click', () => openComposerForNote(note, board, option));
          optWrap.append(optBtn);
        }
        article.append(optWrap);
      }
      const answerBtn = element('button', 'agent-answer', '回答');
      answerBtn.type = 'button'; answerBtn.setAttribute('aria-label', `回答 ${note.id}`);
      answerBtn.addEventListener('click', () => openComposerForNote(note, board, ''));
      article.append(answerBtn);
    } else {
      article.append(element('p', 'note-text', isAgent ? `你的回答：${note.reviewerText}` : note.reviewerText));
    }
    const collapsed = !board || !board.active || !(board.anchors || []).some(a => a.anchor === note.anchor);
    if (note.presence === 'board-removed') article.append(element('p', 'removed-notice', '畫面已移除'));
    else if (collapsed) article.append(element('p', 'missing', '此區域不在目前預覽狀態中'));
    if (note.agentReply) {
      const reply = element('div', 'reply');
      reply.append(element('strong', '', '代理回覆'), element('p', 'reply-text', typeof note.agentReply === 'string' ? note.agentReply : JSON.stringify(note.agentReply)));
      article.append(reply);
    }
    const actions = element('div', 'note-actions');
    const locate = element('button', '', '查看區域'); locate.type = 'button'; locate.disabled = !board;
    locate.addEventListener('click', () => { if (!board) return; enterFocusMode(board.id); post(board.id, 'ui-canvas:focus', { anchor: note.anchor }); });
    const edit = element('button', '', '編輯留言'); edit.type = 'button'; edit.setAttribute('aria-label', `編輯留言 ${note.id}`);
    edit.addEventListener('click', () => openComposerForNote(note, board, note.reviewerText));
    actions.append(locate, edit); article.append(actions); container.append(article);
  }
}
function render() {
  $('version').textContent = `版本 ${ledger.version ?? '未指定'}`;
  $('source-revision').textContent = config && config.sourceRevision ? `來源 ${config.sourceRevision}` : '';
  renderFlow();
  for (const board of boards) {
    const refs = ensureBoardEl(board);
    if (!refs.body.dataset.mode) {
      setBoardActive(board, refs, board.active);
    } else if (board.stale) {
      if (board.active) {
        setBoardActive(board, refs, false);
        setBoardActive(board, refs, true);
      } else if (board.thumbnail) {
        const img = refs.body.querySelector('img.thumb');
        if (img) img.src = `/thumb/${encodeURIComponent(board.id)}?v=${encodeURIComponent(board.targetRevision || Date.now())}`;
      }
      board.stale = false;
      staleNotice = `畫面版本已更新，已重新載入「${board.title}」`;
    }
    updateFrameChrome(board, refs);
    renderPins(board.id);
  }
  for (const [id, refs] of boardEls) {
    if (!boardById.has(id)) {
      refs.root.remove(); boardEls.delete(id);
      for (const [win, bid] of windowToBoard) if (bid === id) windowToBoard.delete(win);
    }
  }
  if (filter === 'agent-needs-answer' && !unansweredAgentNotes().length) filter = 'all';
  renderFilters(); renderNotes(); updateComposer(); updateToolbar();
  updateApprovalPending(); updateApprovalOpen(); updateApprovalForm();
  const history = $('approvals'); history.replaceChildren();
  const titleFor = item => {
    const board = boards.find(b => b.screen === item.screen && b.state === item.state);
    return board ? board.title : `${item.screen} · ${item.state}`;
  };
  for (const approval of ledger.approvals ?? []) {
    const rec = element('div', 'approval-record');
    const header = element('p', '', `${approval.reviewer || '審閱者'} · ${approval.confirmation || approval.exactWords || ''}`);
    const invalidations = approval.invalidations || [];
    const boardRemoved = invalidations.filter(record => record.reason === 'Board removed');
    const other = invalidations.filter(record => record.reason !== 'Board removed');
    if (other.length > 0) {
      const scopes = other.flatMap(record => record.scope || []).map(titleFor);
      header.append(element('span', 'badge', `已失效 · ${[...new Set(scopes)].join('、')}`));
    }
    for (const title of [...new Set(boardRemoved.flatMap(record => record.scope || []).map(titleFor))]) {
      header.append(element('span', 'badge', `已失效 · ${title}（畫面已移除）`));
    }
    const gaps = Array.isArray(approval.gaps) ? approval.gaps.filter(Boolean) : [];
    const gapsLine = element('p', 'gaps', `未決事項：${gaps.length ? gaps.join('；') : '無'}`);
    rec.append(header, gapsLine);
    history.append(rec);
  }
}

// ---------- approval form ----------
function gapsList() { return $('gaps').value.split('\n').map(s => s.trim()).filter(Boolean); }
function updateApprovalPending() {
  const n = boards.reduce((sum, b) => sum + pendingCountFor(b.id), 0);
  $('approval-pending').textContent = n > 0 ? `目前還有 ${n} 則待處理／待釐清留言，確認不會關閉它們。` : '';
}
function updateApprovalOpen() {
  const list = unansweredAgentNotes();
  const n = list.length;
  $('approval-open').hidden = n === 0;
  if (n > 0) {
    $('approval-open-heading').textContent = `還有 ${n} 件事沒決定`;
    const ul = $('approval-open-list'); ul.replaceChildren();
    for (const note of list) {
      const board = boardById.get(boardIdForNote(note));
      const title = board ? board.title : [note.screen, note.state].filter(Boolean).join(' · ');
      ul.append(element('li', '', `${title} · ${note.agentQuestion || ''}`));
    }
  }
  $('no-gaps').disabled = n > 0 || saving;
  if (n > 0) $('no-gaps').checked = false; // a question that arrives after ticking must not leave a stale "no gaps"
  $('no-gaps-hint').hidden = n === 0;
  $('no-gaps-hint').textContent = n > 0 ? `先處理上面 ${n} 件，或按『全部列為未決事項』` : '';
}
function updateApprovalForm() {
  const reviewer = $('reviewer').value.trim(), confirmation = $('confirmation').value.trim();
  const noGaps = $('no-gaps').checked && !$('no-gaps').disabled;
  const hasGaps = gapsList().length > 0 || noGaps;
  $('gaps-hint').hidden = hasGaps;
  $('gaps-hint').textContent = hasGaps ? '' : '請填未決事項，或勾選「沒有需要保留的未決事項」';
  $('approve').disabled = saving || !reviewer || !confirmation || !hasGaps;
}
async function fetchLedger() { const state = await api('/api/state'); return state.ledger; }

async function refresh() {
  if (loading || saving) return false;
  loading = true;
  const epoch = mutationEpoch;
  try {
    const state = await api('/api/state');
    if (epoch !== mutationEpoch || saving) return false;
    ledger = state.ledger; config = state.config;
    mergeBoards(buildBoards(state));
    if (!focusedBoardId && boards.length) focusedBoardId = boards[0].id;
    if (!viewportInitialized) {
      const saved = loadViewport();
      if (saved) { viewport = saved; applyViewport(); } else fitAll();
      viewportInitialized = true;
    }
    render();
    if (staleNotice) { report(staleNotice); staleNotice = null; }
    else {
      const n = unansweredAgentNotes().length;
      report(n > 0 ? `已連線 · 留言儲存於專案中，代理回覆會自動更新 · 還有 ${n} 個問題等你決定` : '已連線 · 留言儲存於專案中，代理回覆會自動更新');
    }
    return true;
  } catch (error) { report(`無法同步：${error.message} 草稿已保留。`, true); return false; }
  finally { loading = false; }
}

// ---------- canvas interaction ----------
$('viewport').addEventListener('wheel', event => {
  event.preventDefault();
  if (event.ctrlKey || event.metaKey) {
    const rect = $('viewport').getBoundingClientRect();
    zoomAt(event.clientX - rect.left, event.clientY - rect.top, viewport.k * (1 - event.deltaY * 0.001));
  } else {
    viewport = { ...viewport, px: viewport.px - event.deltaX, py: viewport.py - event.deltaY };
    applyViewport();
  }
}, { passive: false });
$('viewport').addEventListener('pointerdown', event => {
  if (event.target.closest('.frame')) return;
  dragging = { x: event.clientX, y: event.clientY, px: viewport.px, py: viewport.py, id: event.pointerId };
  $('viewport').setPointerCapture(event.pointerId);
});
$('viewport').addEventListener('pointermove', event => {
  if (!dragging || dragging.id !== event.pointerId) return;
  viewport = { ...viewport, px: dragging.px + (event.clientX - dragging.x), py: dragging.py + (event.clientY - dragging.y) };
  applyViewport();
});
function endDrag(event) { if (dragging && dragging.id === event.pointerId) dragging = null; }
$('viewport').addEventListener('pointerup', endDrag);
$('viewport').addEventListener('pointercancel', endDrag);
document.addEventListener('keydown', event => {
  if (event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;
  if (event.key === 'f') fitAll();
  else if (event.key === '0') setZoom100();
  else if (event.key === 'Escape') exitFocusMode();
});
$('zoom-out').addEventListener('click', () => zoomBy(1 / 1.2));
$('zoom-in').addEventListener('click', () => zoomBy(1.2));
$('zoom-fit').addEventListener('click', fitAll);
$('zoom-100').addEventListener('click', setZoom100);
$('select-mode').addEventListener('click', () => {
  if (pendingSelectBoardId) { pendingSelectBoardId = null; selecting = false; updateToolbar(); return; }
  if (selecting) { mode(false); return; }
  if (!focusedBoardId) return;
  const board = boardById.get(focusedBoardId);
  if (!board) return;
  if (board.active && board.bridgeReady) { mode(true); return; }
  activate(focusedBoardId);
  pendingSelectBoardId = focusedBoardId;
  updateToolbar();
});

$('note-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (saving || conflicted || !draft.anchor || !draft.boardId) return;
  const board = boardById.get(draft.boardId); if (!board) return;
  const reviewerText = $('reviewer-text').value;
  if (!reviewerText.trim()) { draftError('請先填寫留言。'); return; }
  const body = draft.id
    ? { type: 'edit', id: draft.id, expectedRevision: draft.revision, reviewerText }
    : { type: 'create', screen: board.screen, state: board.state, anchor: draft.anchor, targetRevision: board.targetRevision, reviewerText };
  saving = true; mutationEpoch++; updateComposer(); draftError();
  try { ledger = await api('/api/notes', body); resetDraft(); render(); report('留言已儲存。代理可在原本的 CLI 讀取與回覆。'); }
  catch (error) { conflicted = error.status === 409; draftError(conflicted ? '這則留言已有較新版本。草稿已保留；請重新讀取後核對，再儲存。' : `儲存失敗：${error.message} 草稿已保留。`); }
  finally { saving = false; updateComposer(); }
});
$('cancel-edit').addEventListener('click', () => { if (!saving && (!$('reviewer-text').value.trim() || window.confirm('要放棄這則留言的未儲存修改嗎？'))) resetDraft(); });
$('reload-conflict').addEventListener('click', async () => {
  if (!await refresh()) return;
  const latest = ledger.entries.find(note => note.id === draft.id);
  if (!latest) { draftError('找不到原留言。草稿已保留，請先核對討論紀錄。'); return; }
  draft.revision = latest.revision; conflicted = false;
  draftError(`已讀取最新版本，草稿未改動。最新留言：${latest.reviewerText}。請核對後再儲存。`); updateComposer();
});
$('reviewer').addEventListener('input', updateApprovalForm);
$('confirmation').addEventListener('input', updateApprovalForm);
$('gaps').addEventListener('input', updateApprovalForm);
$('no-gaps').addEventListener('change', updateApprovalForm);
$('approval-form').addEventListener('submit', async event => {
  event.preventDefault(); if (!ledger || saving || !boards.length) return;
  const reviewer = $('reviewer').value.trim(), confirmation = $('confirmation').value.trim();
  const gaps = gapsList(); const noGapsConfirmed = $('no-gaps').checked && !$('no-gaps').disabled;
  if (!gaps.length && !noGapsConfirmed) { updateApprovalForm(); return; }
  if (!reviewer || !confirmation || (!gaps.length && !noGapsConfirmed)) { updateApprovalForm(); return; }
  mutationEpoch++; saving = true; updateComposer();
  $('approve').disabled = true; $('reviewer').disabled = true; $('confirmation').disabled = true; $('gaps').disabled = true; $('no-gaps').disabled = true;
  try {
    ledger = await api('/api/approve', { type: 'approveVersion', expectedVersion: ledger.version, reviewer, confirmation, gaps, noGapsConfirmed });
    $('approval-result').textContent = `已記錄此版本與 ${boards.length} 個畫面的確認；留言狀態保持不變。`;
    $('confirmation').value = ''; $('gaps').value = ''; $('no-gaps').checked = false;
    render();
  } catch (error) { $('approval-result').textContent = `確認未儲存：${error.message} 請核對最新版本後重試。`; }
  finally { $('approve').disabled = false; $('reviewer').disabled = false; $('confirmation').disabled = false; $('gaps').disabled = false; saving = false; updateComposer(); updateApprovalOpen(); updateApprovalForm(); }
});

$('accept-current').addEventListener('click', async () => {
  if (saving) return;
  const list = unansweredAgentNotes();
  if (!list.length) return;
  saving = true; mutationEpoch++; updateComposer();
  $('accept-current').disabled = true; $('defer-all').disabled = true;
  let done = 0, errorMessage = null;
  for (const note of list) {
    let current = ledger.entries.find(entry => entry.id === note.id);
    if (!current) { done++; continue; }
    if ((current.reviewerText || '').trim()) { done++; continue; } // already answered since this run started
    let retried = false;
    for (;;) {
      try {
        ledger = await api('/api/notes', { type: 'edit', id: current.id, expectedRevision: current.revision, reviewerText: '採用目前畫面（整版確認時決定）' });
        done++;
        break;
      } catch (error) {
        if (error.status === 409 && !retried) {
          retried = true;
          try { ledger = await fetchLedger(); } catch { /* keep the last known ledger; fall through and report the original failure */ }
          current = ledger.entries.find(entry => entry.id === note.id);
          if (current && !(current.reviewerText || '').trim()) continue;
          done++; break; // resolved by someone else while we were retrying
        }
        errorMessage = error.message;
        break;
      }
    }
    if (errorMessage) break;
  }
  saving = false;
  render();
  $('approval-result').textContent = errorMessage
    ? `已處理 ${done}/${list.length} 件；發生錯誤：${errorMessage}`
    : `已將 ${done} 件待決事項標記為採用目前畫面。`;
  $('accept-current').disabled = false; $('defer-all').disabled = false;
});
$('defer-all').addEventListener('click', () => {
  const list = unansweredAgentNotes();
  if (!list.length) return;
  const present = new Set(gapsList());
  const lines = [...new Set(list.map(note => (note.agentQuestion || '').trim()).filter(Boolean))].filter(line => !present.has(line));
  if (!lines.length) return;
  const existing = $('gaps').value;
  $('gaps').value = existing.trim() ? `${existing}\n${lines.join('\n')}` : lines.join('\n');
  updateApprovalForm();
});

refresh();
setInterval(refresh, 2000);
