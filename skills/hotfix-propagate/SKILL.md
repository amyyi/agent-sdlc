---
name: hotfix-propagate
description: Use when a fix must land on multiple release branches — a staging-blocking bug ("hotfix") or an emergency production fix ("emergency"). Also triggers on "hotfix", "emergency fix", "緊急修復", "cherry-pick 到 main/uat/prod", "prod 壞了".
---

# Hotfix / Emergency Propagation

## Overview

One fix, multiple release branches, zero forgotten targets. Two modes, same mechanism:

| Mode | Cut fix branch from | Targets (MRs/PRs) | Situation |
|---|---|---|---|
| **hotfix** | `origin/uat` | `uat`, `main` | Bug blocking staging acceptance |
| **emergency** | `origin/prod` | `prod`, `uat`, `main` | Emergency production fix |

Adjust the branch names to your release model — what matters is the shape: the fix is authored once on the branch cut from the **most urgent** environment, then cherry-picked to a separate branch per remaining target. Every target gets its own MR. **The job is not done until every target on the checklist has a prepared MR.**

## Steps

1. **Confirm mode and bases**: verify each target branch exists (`git fetch origin` first). Never commit directly on the release branches.

2. **Cut the fix branch**: `{mode}/{ticket-or-slug}` from the mode's source base (hotfix → `origin/uat`; emergency → `origin/prod`).

3. **Implement the fix** on that branch. Bug discipline applies: root cause first, a regression test that fails before / passes after, deviations recorded to `implementation-notes.md`. Run browser-verify if UI-affecting — the bug's error track is the mandatory scenario.

4. **Print the propagation checklist** before touching other branches, and keep it updated in every subsequent message:

   ```
   | Target | Branch | Cherry-pick | Tests | MR prepared |
   |--------|--------|-------------|-------|-------------|
   | uat    | emergency/x-to-uat | ⬜ | ⬜ | ⬜ |
   ```

5. **Propagate to each remaining target**: cut `{mode}/{slug}-to-{target}` from `origin/{target}`, then `git cherry-pick <fix commits>`.
   - **Conflict** → stop that target, report the conflicted files and both sides' intent; never auto-resolve or force. Other targets continue.
   - **Semantic drift** (file renamed/refactored on the target so the patch applies cleanly but wrongly) → check the surrounding code after cherry-pick, not just exit status.
   - Run the test suite (at minimum the regression test) **on every propagated branch** — a clean cherry-pick is not a verified fix.

6. **Prepare one MR per target** (merge-readiness produces the descriptions): title carries the same ticket ref + `[→ target]` suffix; description states the origin branch, cherry-picked SHAs, and why this target needs it. Hand the user the ready `glab mr create --source-branch ... --target-branch ... --description-file ...` commands (`gh pr create --base ... --head ... --body-file ...` on GitHub) — **do not create MRs without explicit confirmation**.

7. **Recommend merge order**: most-broken environment first (emergency: prod → uat → main; hotfix: uat → main), and state that all targets must merge — a skipped one regresses on the next release.

## Common mistakes

- Fixing on a branch cut from `main` then cherry-picking "down" to uat/prod — wrong direction: main has unreleased code the fix would drag along. Always cut from the branch that needs it most urgently.
- Declaring done when the urgent MR is up but the main-bound MR isn't — that is exactly how the next release regresses. The checklist has no optional rows.
- Trusting a clean cherry-pick without running tests on the propagated branch.
- Cherry-picking merge commits or multiple tangled commits — keep the fix to minimal, clean commits before propagating.
