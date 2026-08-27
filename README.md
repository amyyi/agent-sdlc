# agent-sdlc

A complete software delivery pipeline for coding agents, expressed as ten skills.

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
blind-spot-pass ───► unfamiliar module? surface the unknown unknowns first
       │
grilling ──────────► interview until the design tree has no unvisited branches
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
handoff ───────────► cross-session / cross-agent continuity
```

`visual-review` runs after `browser-verify` when the change needs design polish.
`hotfix-propagate` is a parallel track for fixes that must land on several release branches.

---

## What the human actually does

The entire required-action list, for one feature:

| When | You do |
|---|---|
| UI with no design file | Answer a short UX interview (≤2 rounds), pick a direction on the canvas |
| Design questions | Answer the grilling rounds — each question comes with a recommended answer, so "agree with Q1-Q3, change Q4 to X" is a complete reply |
| Localized UI | Keep the translation export fresh; confirm copy for new keys |
| Before commit | Read the merge-readiness report; answer 3-5 quiz questions on high-risk changes |
| Opening the MR | Run the prepared command |
| Recurring review findings | When the same finding appears twice, promote it to a written standard |
| After merge | Confirm worktree cleanup |

Seven items. That is the design target, not an accident.

---

## The skills

| Skill | What it does |
|---|---|
| [`ux-draft`](skills/ux-draft) | No-Figma design pipeline: UX interview → state matrix → 2-4 direction mockups embodying real trade-offs |
| [`blind-spot-pass`](skills/blind-spot-pass) | Surface unknown unknowns before entering unfamiliar code — hidden couplings, unwritten conventions, landmines |
| [`grilling`](skills/grilling) | Interview the user as a design tree, worked in rounds; architecture-changing questions first, each with a recommended answer |
| [`grill-me`](skills/grill-me) | Manual entry point for `grilling` |
| [`browser-verify`](skills/browser-verify) | Playwright walkthrough with asserted steps and screenshot evidence; error tracks mandatory; console errors fail the run |
| [`i18n-check`](skills/i18n-check) | Verify every translation key in the diff exists in the export; resolve dynamic call sites; draft copy for missing keys |
| [`merge-readiness`](skills/merge-readiness) | HTML report (context, decisions, changes grouped by concern, deviations, debugging intuition) + comprehension quiz + paste-ready MR description |
| [`visual-review`](skills/visual-review) | Designer's-eye QA against a written criteria source — consistency, hierarchy, AI-slop patterns, state completeness |
| [`hotfix-propagate`](skills/hotfix-propagate) | One fix, several release branches, zero forgotten targets — checklist-driven cherry-pick with per-target tests |
| [`handoff`](skills/handoff) | Agent-neutral handoff documents so any coding agent can pick up where another stopped |

---

## Design principles

These recur across every skill, and are the actually transferable part.

**Evidence over assertion.** "Ready" is a claim that requires artifacts. Screenshots with assertions, a replayable script, a report on disk. `browser-verify` fails a run on a console error even when every screenshot looks correct.

**The error track is the point.** Happy-path verification is theater. Wire-layer failures — HTTP 200 carrying a validation error in the body — are invisible unless you deliberately walk them. Every mocked error scenario the change touches gets a step.

**Questions in rounds, ordered by blast radius.** Interviews are a frontier over a design tree, not a queue. Ask everything currently answerable at once; ask architecture-changing questions before cosmetic ones; supply a recommended answer for each so agreeing is cheap.

**Facts are the agent's job, decisions are the user's.** Never ask a human for something that can be looked up. Never decide something on their behalf that changes the architecture.

**Checklists with no optional rows.** `hotfix-propagate` is not done when the urgent MR is up — it is done when every target branch has one. Partial completion is the failure mode being defended against.

**Criteria over taste.** `visual-review` cites a written standard for every fix. Anything beyond the standard is a suggestion, not a silent change.

**Deviate, record, continue.** When the plan does not survive contact with the code: write down what deviated and which conservative option was taken, then keep going. Never silently redesign, never block waiting.

**Outward actions are human-gated.** MRs, pushes, anything visible to other people: the command is prepared, the human runs it.

---

## Portability

The pipeline is deliberately runtime-agnostic and runs under more than one coding agent. Where a skill depends on a capability that may not exist (a code-graph server, a canvas tool, a browser extension), it names an explicit fallback rather than failing.

Project-specific pieces — component library, translation platform, branch model, styling standards — are marked as substitution points rather than hard-coded.

---

## Installing

Copy `skills/` into wherever your agent looks for them:

```bash
# Claude Code
cp -r skills/* ~/.claude/skills/

# Codex
cp -r skills/* ~/.codex/skills/
```

Two shared conventions the skills expect:

- `~/.agents/handoffs/` — handoff documents, agent-neutral so any tool can read or write them
- `~/.agents/i18n/en-US.json` — the flat translation export, if you use `i18n-check`

---

## License

MIT
