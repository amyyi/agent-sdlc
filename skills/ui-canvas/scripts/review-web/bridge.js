/* Preview-only bridge. Inert outside a marked local review iframe. */
(() => {
  if (window.parent === window || window.__uiCanvasBridge) return;
  const requested = new URLSearchParams(location.search).get('uiCanvasOrigin');
  let origin;
  try {
    const candidate = new URL(requested);
    if (candidate.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(candidate.hostname) || candidate.origin !== requested) return;
    origin = candidate.origin;
  } catch { return; }
  window.__uiCanvasBridge = true;
  let enabled = false;
  let selected = null;
  let known = '';
  let scheduled = false;
  let rectsTimer = null;
  const highlight = document.createElement('div');
  highlight.setAttribute('aria-hidden', 'true');
  Object.assign(highlight.style, { position: 'fixed', pointerEvents: 'none', zIndex: '2147483647', border: '2px solid #298267', background: '#29826712', borderRadius: '4px', display: 'none' });
  const send = (type, extra = {}) => parent.postMessage({ type, ...extra }, origin);
  const rectOf = el => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }; };
  const anchorEls = () => [...document.querySelectorAll('[data-anchor]')].filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
  const anchors = () => {
    const seen = new Set();
    const list = [];
    for (const el of anchorEls()) {
      const value = el.getAttribute('data-anchor');
      if (value && !seen.has(value)) { seen.add(value); list.push({ anchor: value, rect: rectOf(el) }); }
    }
    return list;
  };
  const draw = () => {
    if (!selected?.isConnected || !selected.getClientRects().length) { highlight.style.display = 'none'; return; }
    const rect = selected.getBoundingClientRect();
    Object.assign(highlight.style, { display: 'block', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
  };
  const announce = (force = false) => {
    const list = anchors();
    const next = JSON.stringify(list.map(item => item.anchor));
    if (force || next !== known) { known = next; send(force ? 'ui-canvas:ready' : 'ui-canvas:anchors', { anchors: list }); }
    draw();
  };
  const sendRectsThrottled = () => {
    if (rectsTimer) return;
    rectsTimer = setTimeout(() => {
      rectsTimer = null;
      requestAnimationFrame(() => send('ui-canvas:rects', { anchors: anchors() }));
    }, 100);
  };
  window.addEventListener('message', event => {
    if (event.source !== parent || event.origin !== origin || !event.data || typeof event.data !== 'object') return;
    if (event.data.type === 'ui-canvas:mode' && typeof event.data.enabled === 'boolean') {
      enabled = event.data.enabled;
      if (!enabled) { selected = null; draw(); }
      announce(true);
    }
    if (event.data.type === 'ui-canvas:focus' && typeof event.data.anchor === 'string') {
      selected = [...document.querySelectorAll('[data-anchor]')].find(el => el.getAttribute('data-anchor') === event.data.anchor) ?? null;
      selected?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      draw();
    }
  });
  document.addEventListener('pointermove', event => {
    if (!enabled) return;
    selected = event.target instanceof Element ? event.target.closest('[data-anchor]') : null;
    draw();
  }, true);
  document.addEventListener('click', event => {
    if (!enabled) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const el = event.target instanceof Element ? event.target.closest('[data-anchor]') : null;
    if (el) { selected = el; draw(); send('ui-canvas:select', { anchor: el.getAttribute('data-anchor'), rect: rectOf(el) }); }
  }, true);
  // Prevent pointer-down handlers from operating product controls while selecting.
  document.addEventListener('pointerdown', event => { if (enabled) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
  document.addEventListener('keydown', event => { if (enabled && ['Enter', ' '].includes(event.key)) { event.preventDefault(); event.stopImmediatePropagation(); const el = event.target instanceof Element ? event.target.closest('[data-anchor]') : null; if (el) send('ui-canvas:select', { anchor: el.getAttribute('data-anchor'), rect: rectOf(el) }); } }, true);
  window.addEventListener('scroll', () => { draw(); sendRectsThrottled(); }, true);
  window.addEventListener('resize', () => { announce(); sendRectsThrottled(); });
  const start = () => {
    document.body.append(highlight);
    new MutationObserver(records => {
      if (records.every(record => record.target === highlight)) return;
      sendRectsThrottled();
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => { scheduled = false; announce(); });
    }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-anchor', 'style', 'hidden', 'class'] }); // whole document: portals may mount outside <body>

    // catches layout shifts with no matching mutation, e.g. an image finishing load.
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => sendRectsThrottled()).observe(document.documentElement);

    announce(true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
