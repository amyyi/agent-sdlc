// ui-canvas local review — preview-only bridge loader. Copy into the PREVIEW harness
// (Storybook preview-head.html / a story import / a dev-only template script). Inert unless this
// page runs inside an iframe whose URL carries ?uiCanvasOrigin=http://127.0.0.1:<port>. Never ship to production.
(() => {
  try {
    const raw = new URLSearchParams(location.search).get('uiCanvasOrigin');
    if (!raw || window.parent === window) return;
    const origin = new URL(raw);
    if (origin.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(origin.hostname)) return;
    if (origin.origin !== raw || document.querySelector('[data-ui-canvas-bridge]')) return;
    const script = document.createElement('script');
    script.src = `${origin.origin}/bridge.js`;
    script.dataset.uiCanvasBridge = 'true';
    document.head.appendChild(script);
  } catch {
    // Malformed uiCanvasOrigin: stay inert.
  }
})();
