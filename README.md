# agent-sdlc

A software delivery pipeline for coding agents, expressed as eight skills.

Not a toolbox — a **process**. Each skill's output is the next one's input, from "there is no design file" through to "here is the MR description, with screenshot evidence for every error path."

It has been in daily use on a production frontend codebase, running identically under two agent runtimes.

---

## The premise

Most agent workflows optimize the wrong thing: making the agent write more code, faster. That runs into a wall almost immediately, because the bottleneck was never typing speed — it was **verification**. If you have to read every line the agent wrote to trust it, you have not saved anything.

This pipeline takes the opposite position:

> **The human's job is to make decisions and accept work. Everything else is automatic.**

Which means the pipeline's real product is not code. It is **evidence** — enough of it, in the right form, that a decision can be made without reading the implementation.

Three consequences shape every skill here:

1. **Verification is the deliverable.** A screenshot of the happy path proves nothing. An error-track walkthrough with asserted state proves something.
2. **The gate belongs to a human, and only at decision points.** The pipeline never blocks waiting for permission to think, and never proceeds past a real decision without asking.
3. **Outward actions stay manual.** Agents prepare MR commands; the human runs them.

---

## The pipeline

```
ux-draft ──────────► no design file? interview → state matrix → 2-4 directions
       │                                          ↓ user picks by looking
ui-canvas ─────────► PRD + project discovery → live component preview → feedback → UI spec + layout
       │
blind-spot-pass ───► unfamiliar module? surface the unknown unknowns first
       │
   ( grilling )      interview until the design tree has no unvisited branches   ← third-party
       │
    [ plan ]         decision-bearing tasks first, mechanical refactors last
       │
    [ implement ]    deviations → implementation-notes.md, never silent redesign
       │
browser-verify ────► Playwright walkthrough, error tracks mandatory, evidence saved
       │
i18n-check ────────► every translation key in the diff actually exists
       │
    [ self-review ]  run your review standards against the diff before commit
       │
merge-readiness ───► HTML report + quiz + paste-ready MR description
       │
    [ MR ]           ← the human presses this button
       │
   ( handoff )       cross-session / cross-agent continuity                      ← third-party
```

`visual-review` runs after `browser-verify` when the change needs design polish.
`hotfix-propagate` is a parallel track for fixes that must land on several release branches.

Stages in `( parentheses )` are third-party skills this pipeline composes with — see [Composes with](#composes-with).
Stages in `[ brackets ]` are ordinary agent work, shaped by the conventions below rather than by a skill.

---

## What the human actually does

The entire required-action list, for one feature:

| When | You do |
|---|---|
| UI with no design file | Answer a short UX interview (≤2 rounds), pick a direction on the canvas |
| UI direction is settled | Review the representative screen and leave design feedback in the available review surface |
| Design questions | Answer the interview rounds — each question comes with a recommended answer, so "agree with Q1-Q3, change Q4 to X" is a complete reply |
| Localized UI | Keep the translation export fresh; confirm copy for new keys |
| Before commit | Read the merge-readiness report; answer 3-5 quiz questions on high-risk changes |
| Opening the MR | Run the prepared command |
| Recurring review findings | When the same finding appears twice, promote it to a written standard |
| After merge | Confirm worktree cleanup |

This is the complete decision list. Everything else should be handled by the agent and recorded as evidence.

---

## The skills

| Skill | What it does |
|---|---|
| [`ux-draft`](skills/ux-draft) | No-Figma design pipeline: UX interview → state matrix → 2-4 direction mockups embodying real trade-offs |
| [`ui-canvas`](skills/ui-canvas) | Turn a PRD/spec into a real-component Web preview, shared feedback loop, and implementation-ready UI spec and layout |
| [`blind-spot-pass`](skills/blind-spot-pass) | Surface unknown unknowns before entering unfamiliar code — hidden couplings, unwritten conventions, landmines |
| [`browser-verify`](skills/browser-verify) | Playwright walkthrough with asserted steps and screenshot evidence; error tracks mandatory; console errors fail the run |
| [`i18n-check`](skills/i18n-check) | Verify every translation key in the diff exists in the export; resolve dynamic call sites; draft copy for missing keys |
| [`merge-readiness`](skills/merge-readiness) | HTML report (context, decisions, changes grouped by concern, deviations, debugging intuition) + comprehension quiz + paste-ready MR description |
| [`visual-review`](skills/visual-review) | Designer's-eye QA against a written criteria source — consistency, hierarchy, AI-slop patterns, state completeness |
| [`hotfix-propagate`](skills/hotfix-propagate) | One fix, several release branches, zero forgotten targets — checklist-driven cherry-pick with per-target tests |

---

## Composes with

Two stages of this pipeline are already covered well by existing skills, so I did not rebuild them. Install them alongside these:

- **[`grilling` / `grill-me`](https://github.com/mattpocock/skills)** (Matt Pocock, MIT) — the interview stage. Maps a plan as a design tree and works it in rounds: ask the whole settled frontier at once, order questions by blast radius, supply a recommended answer for each, and treat finding *facts* as the agent's job while *decisions* stay the user's. `ux-draft`'s micro-interview and `blind-spot-pass`'s "decision needed?" output are both written to feed this.
- **[`handoff`](https://github.com/mattpocock/skills)** (Matt Pocock, MIT) — cross-session continuity. Compacts a conversation into a document another agent can pick up, referencing existing artifacts by path instead of duplicating them.

Install with `npx skills@latest add mattpocock/skills`, or through his Claude Code plugin.

---

## Design principles

These recur across the skills here, and are the actually transferable part.

**Evidence over assertion.** "Ready" is a claim that requires artifacts. Screenshots with assertions, a replayable script, a report on disk. `browser-verify` fails a run on a console error even when every screenshot looks correct.

**The error track is the point.** Happy-path verification is theater. Wire-layer failures — HTTP 200 carrying a validation error in the body — are invisible unless you deliberately walk them. Every mocked error scenario the change touches gets a step.

**Checklists with no optional rows.** `hotfix-propagate` is not done when the urgent MR is up — it is done when every target branch has one. Partial completion is the failure mode being defended against.

**Criteria over taste.** `visual-review` cites a written standard for every fix. Anything beyond the standard is a suggestion, not a silent change.

**Find the unknowns before planning, not during.** Constraints discovered after the plan is written force rework, so `blind-spot-pass` is a gate rather than a lookup.

**Deviate, record, continue.** When the plan does not survive contact with the code: write down what deviated and which conservative option was taken, then keep going. Never silently redesign, never block waiting.

**Outward actions are human-gated.** MRs, pushes, anything visible to other people: the command is prepared, the human runs it.

---

## Portability

The pipeline is deliberately runtime-agnostic and runs under more than one coding agent. Where a skill depends on a capability that may not exist (a code-graph server, a canvas tool, a browser extension), it names an explicit fallback rather than failing.

Project-specific pieces — component library, translation platform, branch model, styling standards — are marked as substitution points rather than hard-coded.

`ui-canvas` discovers the owning application, component layer, and design conventions from the project it is run in. Example project names in fixtures or handoff documents are context, not dependencies; the skill does not require any particular component library or framework.

---

## Using `ui-canvas`

Use it when a developer has a PRD, spec, or ticket and needs to discuss a Web UI without knowing the frontend architecture or CSS vocabulary. Supply scoped FE/BE repository paths; the agent discovers the framework, actual shared components, theme and existing conventions before composing a preview.

```text
# Claude Code
/ui-canvas 根據 PRD 與 FE/BE repo，先了解專案並用現有元件討論 layout，最後產出 UI spec。

# Codex
$ui-canvas 根據 PRD 與 FE/BE repo，先了解專案並用現有元件討論 layout，最後產出 UI spec。
```

The agent starts the project's preview with actual components and mock data. Point at a region and leave a plain-language note; edit that note if the result needs more work. Both runtimes use the same pending / needs-clarification / handled states. Clearing or deleting a note never approves the design. Confirm the whole reviewed version once after layout and key states are settled.

Native notes are used when available. If the current host cannot accept an agent reply, the agent gives an ID-linked reply in the conversation and persists it in the project ledger. A static drawing is labeled as a reference, not verified component reuse.

```text
.ui-canvas/<feature>/
├── UI-SPEC.md
├── UI-HANDOFF.md
├── feedback-ledger.json
└── screens/
```

The UI spec describes layout, interactions and per-operation states, linking business rules back to the PRD. The handoff records component choices, source evidence, preview startup instructions, screenshots and unresolved integration dependencies. These files are versionable; commits are not automatic. Production FE/BE implementation is a separate task.

Agent-authored text defaults to Traditional Chinese (`zh-TW`) unless the project defines another policy. Existing UI copy remains sourced; new copy and unknown business behavior stay clearly proposed until decided by an authorized owner.

---

## Installing

第一次使用或準備手動驗收，請從 [UI Canvas 安裝與使用指南（繁體中文）](skills/ui-canvas/GETTING-STARTED.zh-TW.md) 開始：包含安裝、可直接貼給 AI 的需求範例、留言往返、版本確認與常見問題。

Install only the skills you want. List the available skills, then install `ui-canvas` for Claude Code and Codex:

```bash
npx skills add amyyi/agent-sdlc --list
npx skills add amyyi/agent-sdlc --skill ui-canvas -g -a claude-code -a codex -y
```

These commands install from the published default branch; the branch must contain
`skills/ui-canvas`. Local, unpushed changes are not included. To share a reviewed
feature revision before merging, distribute a checkout of that revision and use the
manual installation below.

Invoke it as `/ui-canvas` in Claude Code or `$ui-canvas` in Codex. Start a new session
after updating so it loads the installed revision. Install both runtimes from the
same checkout to keep their feedback rules aligned.

For a manual install, copy only the selected skill directory into the location used by each agent:

```bash
# Claude Code
mkdir -p ~/.claude/skills/ui-canvas
cp -R skills/ui-canvas/. ~/.claude/skills/ui-canvas/

# Codex
mkdir -p ~/.agents/skills/ui-canvas
cp -R skills/ui-canvas/. ~/.agents/skills/ui-canvas/
```

`ui-canvas` is self-contained: copy its entire directory, including `references/`
and `scripts/`. Its note reader, review server and offline checks use Node.js 20 or newer (verified on 20 and 24);
live previews also require the target project's own dependencies and startup environment.
Native preview/comment capabilities depend on the host and are checked at runtime.
No Claude-only artifact package is required for the browser review path.

For an existing CLI session, the bundled [local review interface](skills/ui-canvas/references/local-review.md)
adds anchored comments beside the real project preview in an ordinary browser.
The same CLI session reads and replies through the project ledger; there is no
automatic agent wake-up or desktop-session synchronization. The tool itself has
no npm dependencies. Project-specific preview bridge setup is required.
Every screen/state of a feature appears as an artboard on one pannable canvas with pinned comments, so the whole flow can be reviewed at once.

The offline test suite (note semantics, fixture structure, internal links, both
installation layouts, and the local review tool's store, server, and
payload-measurement tests) and the runtime acceptance plan are maintained
outside this repository so that an installed skill contains only what it needs
to run. They do not launch Claude Code/Codex or prove real component rendering.

Two shared conventions the skills expect:

- `~/.agents/handoffs/` — handoff documents, agent-neutral so any tool can read or write them
- `~/.agents/i18n/en-US.json` — the flat translation export, if you use `i18n-check`

---

## License

MIT — see [LICENSE](LICENSE). The third-party skills named under [Composes with](#composes-with) are not included in this repository; install them from their own source.
