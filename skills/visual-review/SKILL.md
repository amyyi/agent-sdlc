---
name: visual-review
description: Use after browser-verify passes on a UI change, when the user wants design polish — visual inconsistency, spacing/hierarchy issues, AI-slop patterns. Also triggers on "design review", "視覺 QA", "看起來對不對", "design polish", "抓 AI slop".
---

# Visual Review (designer's-eye QA)

## Overview

browser-verify proves the feature works; this pass judges whether it looks right. Criteria come from the repo's design source of truth — documented styling standards + theme tokens + sibling screens, or `DESIGN.md`. Never from personal taste alone. Fix issues atomically with before/after screenshots.

## Steps

1. **Load criteria**: the repo's styling standards / `DESIGN.md`; open 1-2 sibling screens as the consistency reference. Reuse the browser-verify evidence screenshots as the starting corpus; capture more states if coverage is thin.

2. **Audit each screenshot against the checklist**:
   - **Consistency**: spacing/typography/color match tokens and sibling screens; same control = same shape everywhere.
   - **Hierarchy**: primary action visually dominant; scan order matches task order; no two elements fighting for attention.
   - **AI-slop patterns**: uniform card grids where a table belongs; gratuitous gradients/emoji/icons; placeholder-flavored copy; centered-everything layouts; over-rounded oversized controls; inconsistent icon sets.
   - **States**: empty/error/loading states styled, not raw; truncation and overflow at long-content extremes (translated copy can be 2-3× longer or shorter than the source locale — check both directions).
   - **Interaction cost**: high-frequency action within one click/keystroke; focus visible; touch targets adequate.

3. **Fix atomically**: one issue = one commit-sized change; re-capture the after screenshot; keep a before/after pair per fix. Anything that contradicts the criteria source gets fixed; anything that's taste beyond the criteria gets listed as a suggestion for the user, not silently applied.

4. **Report**: table of issue / criterion violated / fix / before→after screenshots, appended to the browser-verify evidence dir (`index.md`). Unfixed suggestions listed separately for the user's call.

## Common mistakes

- Reviewing against personal aesthetics when the repo has a criteria source — cite the standards/`DESIGN.md` line for every fix.
- Polishing the happy path only — slop hides in empty/error states and long-content edges.
- Batch-fixing ten issues in one blob — before/after pairs become meaningless.
- Running before browser-verify — never polish a feature that doesn't work yet.
