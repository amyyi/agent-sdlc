# Executable project preview

## Discover before composing

Inspect the scoped repositories and project instructions. Record the owning app, actual framework/version from imports and lockfile, package manager/start scripts, component entry points, theme/global styles, providers, routes, form/data handling, permissions, i18n, and mock infrastructure. Inspect BE contracts only to understand documented UI dependencies; do not implement the backend.

Use existing Storybook stories, development routes, or the framework's preview harness when available. Otherwise add a feature-scoped preview entry using the same framework, dependency versions, and providers. Keep preview code isolated from production routes and changes. Do not install a different UI library or translate Vue/Angular/server templates into React just for review.

The agent handles routine environment setup. Record setup failures and exact missing prerequisites. Do not read unrelated credentials or connect mocks to a production backend. Do not make the developer identify component names or manually configure the preview when the agent can do it.

## Real components, mock data

Import/render the chosen actual component/template sources, using their real stylesheet/theme and required providers. Trace the preview's imports to those sources. A screenshot, copied CSS, or a component with the same name is not proof of reuse. Verify an interaction (open/select/validate) in the running preview, not merely import resolution.

Use existing fixtures/mock handlers or local view-model data for proposed UI states. Record them as simulation, not an API contract. Keep API calls intercepted in preview; simulate writes locally. Unknown endpoints/fields/retry rules remain gaps. Proposed UI behavior can be shown as a clearly labeled option without claiming it is a confirmed product rule.

If the project has no shared library, use its existing local components/templates and styles. If the feature needs a new component, first show whether composition suffices, then propose a feature-local preview implementation. Do not disguise new work as shared reuse or change shared behavior across pages without maintainer confirmation.

## Reviewable and repeatable

- Persist preview source, mocks, dependency references, launch command, URL/route, and shutdown instructions. Prefer the existing lockfile; do not commit generated dependencies or secrets. For local browser review also persist `review-manifest.json` (every board's preview URL and thumbnail) and record its path in `UI-HANDOFF.md`.
- Keep mock-state selectors, region anchors and review notes in review chrome, not customer-facing product controls. Native comments can select regions without adding a custom editor.
- Show one representative layout first, then inspect all consequential states per async operation. Capture happy-path and error-path screenshots and a replayable browser verification script; use project-required browser-verify and MSW error scenarios when applicable.
- Name evidence files by board id (e.g. `list-ready.png`), not a sequence number; the manifest's `thumbnail` for that board points at the same file. Only recapture boards whose `targetRevision` actually changed — not the whole set on every round — and record in UI-HANDOFF.md which boards were recaptured at which version.
- Verify note round-trip separately from preview rendering: point to a region, receive feedback, map it to its stable anchor, reply/record, modify the note, and confirm that it reopens. If the agent cannot write a native reply, use the linked dialogue reply described in lanes.md and disclose the limitation.
- A successful framework build is not proof of rendering or reviewer approval. List exactly which states and interactions were inspected.
- `.ui-canvas/<feature>/` lives in the application repository whose preview, story and bridge run — even when the PRD and the working directory are a spec repository. The spec repository gets one link line; never a second copy. Never delete or recreate existing `.ui-canvas/` contents; back up to `.ui-canvas/_backup-<feature>-<timestamp>/` before a deliberate regeneration.

For local browser review, the preview must also load the opt-in bridge: copy `scripts/review-web/bridge-loader.snippet.js` into the preview harness (never production) so `bridge.js` is injected only when the iframe URL carries `uiCanvasOrigin`. See the "Start" steps and the adapter checklist in [local-review.md](local-review.md).

**When this host's interactive browser tool isn't connected** (e.g. Claude Code's Claude-in-Chrome extension): this is not a stopping condition. Install `playwright` in a scratch directory (it reuses any browser binaries already cached on the machine — no re-download) and script the walkthrough per `browser-verify`: navigate, assert the expected DOM state, screenshot. This produces the same class of evidence (real rendering, real interaction, console/network capture) the host's own browser tool would have given directly, and works the same way regardless of host.

If a separate review harness (e.g. an isolated Storybook story) is built alongside the actual in-app integration change to dodge an auth/permission wall, they are now two independent sources of truth for the same structural decisions — diff them explicitly before treating either as final (see traps.md).

The preview is a design deliverable, not completed production FE/BE implementation. Keep it versionable under `.ui-canvas/<feature>/screens/`, or link exact versioned harness files from that directory when the framework requires another location.
