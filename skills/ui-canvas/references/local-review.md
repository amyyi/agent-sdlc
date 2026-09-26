# Local browser review, original CLI session

Use the bundled tool when native comments would require another AI conversation. Node.js 20 or newer (built-in modules only; the offline suite passes on 20 and 24, the live walkthroughs ran on 24). No npm install or model/API key is needed for this tool; the target project's preview still needs its own dependencies. Browser operations and polling do not call a model.

## Start

1. Inspect and start the actual project preview. Add stable `data-anchor` attributes to preview regions, including modal/error content. Never reconstruct shared components merely for annotations.
2. Load `scripts/review-web/bridge.js` in that preview only when the iframe URL contains `uiCanvasOrigin`. Example preview-only loader:

```js
const raw = new URLSearchParams(location.search).get('uiCanvasOrigin');
if (raw && parent !== window) {
  const origin = new URL(raw);
  if (origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname)
      && origin.origin === raw && !document.querySelector('[data-ui-canvas-bridge]')) {
    const script = document.createElement('script');
    script.src = `${origin.origin}/bridge.js`;
    script.dataset.uiCanvasBridge = 'true';
    document.head.append(script);
  }
}
```

The same loader ships as `scripts/review-web/bridge-loader.snippet.js`; copy it rather than retyping it.

3. Run from the installed skill directory, substituting the real feature directory. `--feature` must point at the feature directory inside the **application repository** whose preview, story and bridge run — even when the PRD and the current working directory are a spec repository (the spec repository gets one link line, never a second copy). List every reviewable screen/state as a **board** in `<feature>/review-manifest.json`:

```json
{ "version": 1, "sourceRevision": "abc1234", "targetRevision": "canvas-v1",
  "boards": [
    { "id": "list-ready", "title": "訂單列表", "screen": "orders", "state": "ready",
      "previewUrl": "http://127.0.0.1:6006/iframe.html?id=your-story&viewMode=story",
      "thumbnail": "screens/evidence/01-list-ready.png", "w": 1280, "h": 800, "flow": 1 }
  ] }
```

`id` is unique (`[A-Za-z0-9_-]`, ≤64 chars) and is stamped, along with the board's `screen`/`state`, on every note made on that board. `screen` + `state` must also be unique per board — notes are attributed to a board by that pair, so two boards sharing it are rejected at startup (`Invalid manifest: boards "<a>" and "<b>" share screen/state`); use a different `state` label for each variant of the same screen (e.g. `ready`, `edit-open`, `save-error`). Board ids `all` and `focused` are reserved (used by the review panel's filters) and rejected. `previewUrl` must be a loopback `http` URL. `title` defaults to `id`. A board's `targetRevision` is optional and defaults to the manifest's own `targetRevision`. `thumbnail` is optional; when present it must be a path string relative to the feature directory, must stay inside it, and must be png/jpg/webp — `thumbnail: true` or any other non-string value is rejected at startup, not silently coerced. The easiest source is the PNGs `browser-verify` already produced. `x`/`y` are optional; boards without them are auto-laid out in `flow` order, rows of 3, 80px between frames and 120px between rows. `w`/`h` default to 1280×800. `flow` is the board's position in the flow strip and defaults to its array order.

```sh
node scripts/review-server.mjs --feature /path/to/app-repo/.ui-canvas/feature \
  --manifest /path/to/app-repo/.ui-canvas/feature/review-manifest.json --port 4318
```

When `--manifest`, `--targets` and `--preview` are all omitted, the server auto-discovers `<feature>/review-manifest.json`, then `<feature>/review-targets.json`. An existing `review-targets.json` (`{ "targets": [{ "id", "screen", "state", "label", "preview", "targetRevision" }] }`) is accepted as-is via `--targets PATH` or auto-discovery and shown as boards without thumbnails (`label` becomes the title); prefer `review-manifest.json` for new work because it carries thumbnails and layout. For a single board only, the legacy shorthand still works and is mutually exclusive with `--manifest` and `--targets`: `--preview URL --screen NAME --state NAME --target-revision REV`.

Verify the chosen port is free first. If occupied, choose another explicit port; never kill an unrelated service. Open the printed loopback URL in an ordinary browser. The preview iframe receives its parent origin automatically. The bridge validates message origin AND window; the local service rejects foreign browser mutations. Keep the tool local, not publicly hosted.

4. Verify bridge-ready status, actual product interaction in operation mode, anchor selection in comment mode, save, reply, and refresh persistence. Missing bridge/anchor is a visible limitation, not successful annotation. First release selects anchored elements only; drag-box arbitrary-region selection and automatic relocation are not implemented. Cross-origin iframe restrictions require a bridge; CSP may require a preview-only allowance. Do not weaken production CSP.

A cold Storybook can take 3–10 seconds to report bridge-ready on first load. Wait for the toolbar to show "已連接 · N 個可留言區域" (N > 0) rather than retrying immediately or restarting the server after a few hundred milliseconds.

## Canvas

Thumbnails must be regular image files inside the feature directory; a symlink whose target lies outside the feature directory is rejected at startup.

The reviewer opens on an overview of every board as a thumbnail/placeholder card, laid out in flow order. Wheel pans; ⌘/Ctrl+wheel zooms; dragging empty canvas pans; buttons give 全部顯示 / 100% / ± zoom. A flow strip along the top lists boards in order — click pans to that board, Enter focuses it. 「開啟即時畫面」, or double-clicking a board, turns it into a live iframe of the real components; at most 3 boards are live at once, and opening a fourth returns the least-recently-used board to its thumbnail. Focus mode fills the view with one board; Esc returns to the overview. Comment mode is per live board: 選取區域留言 → click an anchored region → a pin appears on the frame and the composer opens. Existing notes show as pins on their board — a collapsed pin appears in the title strip when the anchor is not currently rendered. The note panel filters by the selected board. Version approval covers every board in the manifest at once.

Pressing 選取區域留言 on a focused board that is still a thumbnail opens its live preview first and enters comment mode once the bridge reports ready; a single click on a thumbnail also opens it. If a live board reports zero anchors for more than a few seconds, the toolbar warns that the preview rendered no content — typically a stuck dev server (e.g. Storybook HMR desync); restart that preview and reload the review page.

## Not in this release

No dragging frames to re-layout from the UI — edit the manifest instead. No drag-box arbitrary-region comments — anchored elements only. No arrows between boards. No pages.

## Process a round in the original agent session

The developer says “已留言” (or “處理本輪留言” — any short signal that new notes exist) in the existing CLI. Never ask them to paste notes or to spell out the steps below; they are the skill's job. The skill runs:

```sh
node scripts/review-notes.mjs list --feature /path/to/feature
```

Only pending/clarification notes are returned by default; `--all` includes handled notes. Preserve original reviewer text. Make the preview change, inspect actual rendering, then write a reply operation file and apply it:

```json
{
  "type": "reply",
  "id": "ID_FROM_LIST",
  "expectedRevision": 1,
  "expectedTargetRevision": "editor-v1",
  "status": "handled",
  "agentReply": "已調整；窄視窗也確認過沒有重疊。",
  "reviewedVersion": "v1",
  "evidence": {
    "change": "screens/Editor.stories.tsx:42",
    "render": "screens/evidence/v1-editor.png"
  }
}
```

```sh
node scripts/review-notes.mjs apply --feature /path/to/feature --input /path/to/reply.json
```

## Agent questions

For a rule the requirement source leaves open, create the note yourself instead of waiting for a reviewer to raise it:

```sh
node scripts/review-notes.mjs ask --feature DIR --input FILE [--manifest FILE]
```

FILE is `{ screen, state, anchor, agentQuestion, options?: string[], targetRevision? }` (`targetRevision` defaults from `--manifest`/the ledger's board record when omitted). The entry is created with `source: 'agent'`, the given `agentQuestion`, `options`, empty `reviewerText`, and status `needs-clarification`. The browser shows it as a question-mark pin with a "AI 想問你" card and clickable options. Answers come back the same way any reviewer edit does: the reviewer picks an option or types text into the note, which fills `reviewerText`; a non-empty edit flips status to `pending`, and the agent then processes it like any other note.

The browser polls persisted state and displays replies. No second agent is started. A stale revision returns an error without changing the note; re-read and address the newest request, never retry blindly with a new revision. Status `handled` requires both change and render evidence; missing business decisions use `needs-clarification` with the decision owner/options in the reply. After changing a preview, bump that board's `targetRevision` (see Versions below) and restart the server before replying `handled`; `reviewedVersion` in the reply must equal the ledger's `version` after reconcile.

## Versions

There is no separate publish step. To signal that a screen changed: edit that board's `targetRevision` in `review-manifest.json` (and the manifest's top-level `targetRevision` too, if you want a new version label), then restart the server. On startup the server runs `reconcileBoards` against the ledger: for each board whose `targetRevision` differs from the ledger's last-seen value (or, when the ledger has no record of that board yet, from the revision stored on any of its notes), notes on that board with an older revision go back to `pending` — or `needs-clarification` when their text is empty — (history event `target-changed`), and approval scope items for that board are invalidated (`invalidations[]`, reason `Board revision changed`); a legacy approval scope item without a stored `targetRevision` is invalidated conservatively when its board changes. Everything else — other boards' notes and approvals — is left untouched. If the manifest's top-level revision changed, `version` and `versionHistory` are updated; `sourceRevision` is updated whenever the manifest provides one. An approval scope item is invalidated at most once. If nothing changed, nothing is written. Run it manually without restarting via `node scripts/review-notes.mjs sync --feature DIR --manifest FILE`; `list`/`summary` output now include `boards`. One server instance serves every board in the manifest; changing `--target-revision` or a board's `targetRevision` requires restarting the server with the updated manifest. A state label identifies the configured starting scenario, not automatic inference of all interactive UI states.

When a board disappears from the manifest entirely (not just a revision bump), the same startup reconcile marks that board's approval scope items invalidated with reason `Board removed` (shown as a badge "已失效 · <title>（畫面已移除）"), and its notes get `presence: 'board-removed'` (shown as "畫面已移除", kept with full history — never deleted). Reappearing in a later manifest clears it. Removing a board is not just an edit: delete its thumbnail/evidence files in the same step, say in the reply which files were deleted, then restart so reconcile actually runs — never leave orphan screenshots on disk after a board leaves the manifest (see traps.md).

Startup refuses to run while `feedback-ledger.json.lock` exists; the message asks you to confirm no other writer is active before removing the lock file manually — it is never deleted automatically.

## Approval

The server, not the browser, stamps approval scope: every board currently in the manifest, each with its own `targetRevision`. The browser submits `gaps` (always an array, possibly empty, of accepted open-item strings) and `noGapsConfirmed` (a boolean); `gaps` must be non-empty or `noGapsConfirmed` must be true, or the request is rejected. It never clears pending notes. Later preview changes invalidate approval scope per affected board (see Versions above), retaining full history; unaffected boards' approvals stand. Reviewer edits reopen notes; unchanged notes preserve work state. Nobody must delete a note to approve.

The approval panel lists every unanswered agent question first — "還有 N 件事沒決定", one line per question (board · question) — before the gaps/no-gaps fields. Two bulk actions cover them without answering one by one: "全部照目前畫面定案" writes the reviewer answer "採用目前畫面（整版確認時決定）" to every unanswered question (through the normal edit path, so each flips to `pending` — the agent must then update UI-SPEC and reply `handled` with evidence for each); "全部列為未決事項" copies each question's text into the gaps textarea as its own line. The "沒有需要保留的未決事項" checkbox stays disabled while any agent question is unanswered. The server enforces the same rule: an approval with `noGapsConfirmed: true` is rejected while any agent question is still open (open = `source: 'agent'`, status `needs-clarification`, board still in the manifest), so a stale tick in the browser cannot slip through.

### Design note: single source of change

Note state, what the agent reported changing, and whether a screen actually changed used to be tracked as three independent signals (note revisions, a separate publish-time target list, and approval scope by screen name); they could drift apart. The tool now trusts exactly one signal per board — its `targetRevision` in the manifest — for whether that screen changed, and reconciles notes and approval scope from that alone on every server startup. The tool does not detect actual visual change; a revision bump with no real preview change reconciles as if it changed, and an unbumped revision after a real change reconciles as if nothing changed. Audit trail: `sourceRevision` records the commit the preview was built from, and each `handled` note's change/render evidence records what was actually inspected — bumping the revision without bumping the evidence is the failure mode to watch for.

Existing compatible schema-2 ledgers retain unknown fields/history; missing hashes are derived from exact reviewer text, and `previewVersion` is recognized. Corrupt data is not reset. All writes use a lock, re-read, revision checks, and atomic rename. If a process crashes leaving a `.lock`, confirm no writer is active before manual lock recovery; do not delete locks automatically.

## Delivery limits

Keep tool startup, preview adapter, source revision, feedback ledger, and evidence links in the handoff. The handoff records start/stop commands and the review manifest (`review-manifest.json`, or a legacy `review-targets.json`), never "currently running"; copy approval and pending counts from `node scripts/review-notes.mjs summary --feature DIR` at write time and state that `feedback-ledger.json` is authoritative. CLI tools synchronize project data, not two AI conversation histories. This release must not claim universal framework verification, automatic CLI wake-up, or measured token savings without corresponding evidence.

Headline counts in UI-SPEC.md/UI-HANDOFF.md (board count, note count, approval state) are taken at write time from `review-notes.mjs summary` and the manifest, never from memory or an earlier draft; any earlier figure kept for context is labeled "（核准當時）" ("at approval time"). Start/stop commands in the handoff use `<skill>` and `<repo>` placeholders, never the author's actual machine paths, with one line noting the skill's usual install locations (`~/.claude/skills/ui-canvas` or `~/.agents/skills/ui-canvas`).

## Adapter checklist — any project, any stack

The tool is project-agnostic: the only inputs are the CLI flags (`--feature`, `--manifest` or `--targets`, `--port`, or the legacy `--preview`, `--screen`, `--state`, `--target-revision`), the `review-manifest.json` (or legacy `review-targets.json`) file, and the `data-anchor` attributes it finds at runtime. Adapting a project means satisfying these six points; nothing in the tool is edited.

1. A preview of the real components reachable at `http://localhost:<port>` or `http://127.0.0.1:<port>` — a Storybook story, a dev route, a Vite page, a server-rendered template. Any stack; the tool only iframes it.
2. `data-anchor="…"` on every region a reviewer might point at, including content rendered through portals (modals, drawers, toasts). Anchor generously: this release selects anchored elements only, and a region without an anchor cannot be commented on (the UI shows that limitation). When an anchor is applied via a component prop rather than written directly (e.g. a `confirmButtonProps` spread), assert in the evidence script that it actually landed on the DOM element — individually, per such anchor — rather than trusting the prop was forwarded (see traps.md).
3. The opt-in loader placed where the *preview* harness allows a script — `scripts/review-web/bridge-loader.snippet.js` is the copy-ready file (Storybook `preview-head.html` or a story import; a Vite dev-only plugin; a dev-only `<script>` in a template). It is inert without `?uiCanvasOrigin=` and must never reach a production bundle.
4. The dev server's CSP must allow the loopback `bridge.js` (a preview-only allowance if needed; never weaken production CSP).
5. Node 20 or newer for the tool itself (verified on 20 and 24); the project's own runtime and language are irrelevant.
6. One server instance serves one manifest. List every reviewable screen/state as a board in `review-manifest.json`; record the manifest path in `UI-HANDOFF.md` so the review can be restarted on the right stories. Bump a board's `targetRevision` whenever its preview changes; the server reconciles notes and approvals from that alone.

Verified so far on one React 18 / Storybook 10 project with a shared component library; multi-board review is verified there only. Other stacks remain an architecture target until an adapter has actually run; do not claim cross-stack support without that evidence. See the repository's implementation-notes for the latest verified round.
