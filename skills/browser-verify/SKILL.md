---
name: browser-verify
description: Use after implementing a UI-affecting change, before generating the merge-readiness report or declaring the work ready — walk the feature in a real browser and capture screenshot evidence. Also triggers on "browser test", "e2e 驗證", "截圖驗證", "走一遍畫面".
---

# Browser Verify

## Overview

Execute the feature's verification steps in a real browser via a **Playwright script** and capture evidence, so the reviewer looks at screenshots instead of clicking through everything themselves. The script is saved with the evidence, so the walkthrough is replayable. Evidence feeds the merge-readiness report.

## When NOT to use

Non-UI changes (backend-only, tooling, docs). If the change has no visible surface, skip and say so.

## Steps

1. **Run the repo's e2e suite first** if one exists (Playwright/Cypress/MSW e2e tests). Failures block — fix before capturing evidence. This pass is evidence capture, not a substitute for the suite.

2. **Launch the app — print the launch manifest FIRST**. Port resolution is deterministic and must be shown, never silent:
   1. Read the workspace's `.env` for the app's port (and the host app's port, in a micro-frontend setup). This is the only source of port truth — isolated worktrees get a dedicated range, unwired ones sit on the framework defaults.
   2. `lsof -i :<port> -sTCP:LISTEN` each port: free → will start; already served by this workspace's dev server → reuse (hard-reload, don't restart); held by something else → do NOT kill it — reassign this workspace to a free range, or stop and report.
   3. Start with the repo's own dev script only. Never override ports ad hoc (`PORT=x yarn dev`) — in a Module Federation setup the host's remote URL follows `.env`, so an ad-hoc port silently breaks the wiring and the host quietly loads the last deployed bundle instead of your code.

   Before starting anything, print:
   ```
   | app  | dir            | port (from .env) | status                    | action          |
   |------|----------------|------------------|---------------------------|-----------------|
   | host | ~/wt/host-x    | 3200             | free                      | start: yarn dev |
   | app  | ~/wt/app-x     | 3201             | already running (this wt)  | reuse           |
   ```
   Note: in-process e2e tests (real API fn → Request → MSW) need NO dev server or port — only the browser walkthrough does. If the repo uses MSW in dev, confirm it is active and note which scenario key is selected. Confirm the page loads before walking.

3. **Derive the walkthrough** from the feature's manual-verification / acceptance steps. Each step = action + expected visible result. **Error tracks are mandatory, not optional**: for every mocked error scenario the change touches, include a step that triggers it and asserts the UI shows the failure. Wire-layer failure modes (e.g. HTTP 200 + ok-status body that actually carries validation errors) are invisible on the happy path — a walkthrough with only success-state screenshots proves nothing about the riskiest branch.

4. **Write and run the Playwright script** (`verify.mjs`, saved into the evidence directory):
   - use the repo's own `playwright` if it's a dependency; otherwise `npm install playwright` in a scratch dir and point the script at the dev-server URL (browsers are shared via the ms-playwright cache — no re-download)
   - collect `page.on('console')` errors and failed responses (`page.on('response')`, status >= 400 or known error-body shapes) for the whole walk — a clean-looking screen with console errors is NOT a pass
   - screenshot each step's key state (`01-<step-slug>.png` numbering); before/after for state changes; error-track states included
   - assert each step's expected result in the script (`waitForFunction`/`expect`), don't just screenshot blind

   If a browser-automation extension is available, it may be used for exploratory walking, but the saved evidence must still come from the replayable script.

5. **Save evidence** to `reports/evidence-{branch-slug}/` (or `.specify/reports/evidence-{branch-slug}/` in a spec-kit repo): numbered PNGs, `verify.mjs`, and `index.md` mapping step → screenshot → pass/fail → console/network status → mock scenario used.

6. **Verdict**: any failed assertion, console error, or missing error-track step = not ready; report it with the screenshot instead of proceeding. All pass = merge-readiness report may embed this evidence.

## Common mistakes

- Happy-path-only walkthroughs — the silent-failure branch is exactly the one that needs a screenshot; walk every error scenario the change touches.
- Declaring pass without reading console/network capture — silent JS errors are the most common miss.
- Screenshotting without asserting — a screenshot of the wrong state still looks like evidence; assert the expected result first, then capture.
- Walking a stale build — restart the dev server after the final code change; the script should hard-navigate, not reuse a warm tab.
