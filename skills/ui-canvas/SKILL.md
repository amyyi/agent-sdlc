---
name: ui-canvas
description: Use when a developer has a PRD, spec, or ticket but no design file and needs to discuss a Web UI through an interactive preview, discover existing shared components, and produce an implementation-ready UI spec and layout.
---

# UI Canvas

Help a developer who does not know the frontend architecture converge on a UI using the existing project's components. Start from a PRD, spec, ticket, or acceptance criteria; the layout need not already be decided. Support any Web stack by inspecting the project rather than assuming a framework or component library.

The deliverable is a UI spec and executable layout for later implementation. Preview-only composition and mocks are in scope; production feature implementation, new backend contract design, deployment, and automatic commits are not.

## Shared rules

1. Business behavior comes from the requirement source or an explicit decision by its authorized owner. Missing behavior becomes options with consequences and a named decision owner; continue independent design work and keep unresolved parts visibly marked.
2. Before drawing, inspect the owning application's actual framework, shared components, theme, and comparable screens. The developer need not identify CSS properties or component names.
3. Render actual project components with their theme/providers and mock data. A visual reimplementation is not component reuse. If runtime setup is blocked, explain the missing prerequisite; a labeled static reference does not satisfy the interactive-preview requirement.
4. Prefer composing existing components. Propose additions only when composition is inadequate; changes to shared behavior affecting other screens need the designated maintainer's confirmation.
5. Claude Code and Codex use the same feedback lifecycle in [references/feedback.md](references/feedback.md). Native interfaces differ; the meaning of a note does not. Never require deletion to approve a change.
6. Keep source changes, rendering inspection, and whole-version reviewer approval as separate claims. An agent's completed note is not whole-version approval.
7. Default agent explanations, UI spec, and status labels to Traditional Chinese (`zh-TW`) unless the project or user chooses another language. Preserve source UI copy; label proposed copy rather than presenting it as existing text.
8. Never delete, move, empty or recreate anything already under `.ui-canvas/` — other features, `acceptance-*`, `_backup-*`, evidence directories. Before writing into an existing feature directory, read its `feedback-ledger.json` and `UI-HANDOFF.md` and continue from them. A deliberate regeneration first copies the directory to `.ui-canvas/_backup-<feature>-<YYYYMMDD-HHMMSS>/`. The directory is git-ignored, so there is no git recovery, and the ledger holds human decisions.

## Workflow

### 0. Restate the request before touching anything

Before exploring the project, restate in 3 lines or fewer: the PRD path (or pasted text), the output directory, and the review mode (bundled local review or another named lane). This catches a truncated paste immediately, before any work starts.

### 1. Discover the project before design

Read [references/source-mining.md](references/source-mining.md) and [references/live-preview.md](references/live-preview.md). Establish the scoped FE/BE repositories and owning app from routes/imports. Inspect framework and installed versions, package manager, startup scripts, routing, theme/providers, shared components and local variants, form/data/permission/i18n conventions, and existing mock/preview infrastructure.

Give the developer a short, plain-language account of what will be reused, why, and what is missing. Record source paths and rejected alternatives in the handoff. Explicit project standards take precedence; otherwise follow conventions in the owning feature area. Do not require the developer to research facts the agent can inspect.

### 2. Expose decisions and draft one representative screen

Extract known requirements and unresolved behavior. Present options and visible consequences for consequential decisions; the BE may confirm only decisions within their authority. Record other decisions as pending with their owner. Do not silently invent permissions, validation, retry behavior, endpoints, or response fields.

When layout direction is open, show a small number of meaningful alternatives using the same project components and explain the tradeoffs. Keep this discussion inside the workflow; do not send the user away merely because they have only a PRD. Optional design skills may help internally when available, but are not prerequisites.

Select the screen exposing the most consequential decisions. Start its actual project runtime as described in [references/live-preview.md](references/live-preview.md). Use stable screen and element anchors, such as `M-03` and `data-anchor="M-03"`. Keep review controls and mock-state selectors outside the depicted product UI.

### 3. Choose the review interface

Read [references/lanes.md](references/lanes.md). Choose an interface that preserves the live component runtime and the developer's working session. For CLI workflows, use the bundled [local review tool](references/local-review.md) so browser comments and agent replies share the project ledger without opening another AI session. Native browser comments or compatible artifact notes remain options when delivery back to the working session is verified. Verify read/reply/persistence independently; reuse the bundled tool rather than generating a new editor for every project.

Before showing the draft, check key dimensions and rendered behavior, and relevant [references/traps.md](references/traps.md). Cite component sources for structural choices; identify proposed choices that lack a source.

### 4. Iterate on layout, then walk the states

Read [references/feedback.md](references/feedback.md) before each feedback round. A short signal from the developer such as 「已留言」 or 「處理本輪留言」 starts a round — list the notes yourself, never ask for them to be pasted or for the steps to be spelled out. Preserve reviewer text, restate the expected visible outcome, make the change, inspect the rendered result, and reply to that note. After changing a preview, bump that board's `targetRevision` in `review-manifest.json` and restart the review server so notes and approvals are reconciled; never reply `handled` on a stale revision. Show pending and clarification items first; handled items remain available but do not need individual approval.

Once the representative layout direction is confirmed, expand by screen family and complete the per-operation 11-column matrix in [references/async-state-matrix.md](references/async-state-matrix.md). Walk meaningful interactions and loading, success, empty, validation, permission, and failure states with mocks. Unknown behavior remains a clearly labeled proposal or gap, not an accepted rule. Reuse MSW where available and required by the project; otherwise use its native mock mechanism.

Follow project-required browser verification and capture screenshot evidence for happy and error tracks. A successful build or a generated file alone is not rendering evidence. If a renderer or runtime is unavailable, record the limitation and do not claim the preview is verified.

Every rule the requirement source leaves open (retry behavior, clearing, permissions, copy, and similar) gets filed as an agent question with `review-notes.mjs ask` (see [references/local-review.md](references/local-review.md)), anchored to the most relevant board/region — before handing over the review URL. UI-SPEC's decision table is a summary of that ledger, not the source of record. When the answering reviewer lacks authority for that decision, record the answer with "由 <角色> 決定，審閱者代答".

### 5. Confirm the version and deliver

Summarize the reviewed version and unresolved items; ask for one explicit whole-version confirmation. Approval is recorded only through the browser's 確認整個版本 form; "ok"/"可以" typed in the CLI is not approval — point the reviewer to the form for the reviewer name, exact confirmation words, and gaps or an explicit no-gaps confirmation. Approval records who confirmed, their exact words, the version, scope, and accepted gaps. Unrelated confirmed areas retain their history; subsequent affected layout/behavior changes require renewed review of those areas. Silence, unchanged notes, resolved comments, or deleted notes cannot approve a version.

Persist the following under the owning repository's `.ui-canvas/<feature>/` and make them eligible for version control (no automatic commit). The owning repository is the application repository whose preview, story and bridge actually run — the app identified in Step 1 source mining — **even when the PRD and the current working directory are a spec repository**. The spec repository receives one link line in its spec document pointing at that directory and nothing else. Never split a master copy and a runtime copy across two repositories.

```text
.ui-canvas/<feature>/
├── UI-SPEC.md
├── UI-HANDOFF.md
├── feedback-ledger.json
└── screens/
```

- `UI-SPEC.md`: requirement links; screen/flow inventory; approved layout and interactions; the complete async-state matrix; relevant responsive/accessibility/content decisions; explicit proposals, gaps, owners, and review scope. Describe UI decisions without duplicating or replacing the PRD's business rules.
- `UI-HANDOFF.md`: entry point linking the UI spec, executable preview, screenshots and ledger; owning app/stack; component source decisions and rejected alternatives; preview startup instructions, mock scenarios, and source revision; applicable integration dependencies and unresolved contracts; separate implementation/render/approval evidence. An existing handoff may keep its matrix in place; link it from the spec rather than duplicate it. Record start/stop commands and the targets manifest, never "currently running"; copy approval and pending counts from `node scripts/review-notes.mjs summary --feature DIR` at write time and state that `feedback-ledger.json` is authoritative.
- `screens/`: persistent preview sources and mock scenarios, or an entry manifest linking the versioned preview harness when framework constraints require it elsewhere. Include exact commands and paths; a localhost URL alone is not a durable deliverable.
- `feedback-ledger.json`: portable original notes, replies, statuses, history, anchors and version approvals per the feedback reference.

Stop at this handoff. Subsequent FE/BE implementation is a separate task.
