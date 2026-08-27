---
name: ux-draft
description: Use when UI work starts without a Figma or design file — a screen/flow needs to be designed from scratch, the UI direction is unclear, or the user says "沒有設計稿", "幫我想 UI/UX", "這頁要長怎樣", "design this screen". Runs before spec/implementation.
---

# UX Draft (no-Figma design pipeline)

## Overview

Turn "no design file" from a blocker into a four-step pipeline: a short UX interview → a state matrix → 2–4 direction mockups the user refines visually → a locked draft that feeds the spec, the FE plan, and browser-verify. The user decides by looking, never by reading descriptions of UI.

## Steps

### 1. UX micro-interview (grilling style, max 2 rounds)

Ask the frontier together, numbered, each with a recommended answer. Cover only what changes the design:
- Who uses this and what job are they completing? Entry point and where they land after success?
- Data shape: list / form / multi-step wizard / dashboard? Expected volume (3 rows or 3000)?
- Frequency: high-frequency work tool (density wins) or occasional flow (guidance wins)?
- What must the user NOT be able to do (permissions, irreversible actions)?

### 2. Constraints inventory (do this yourself, don't ask)

- **Reuse first**: find 2-3 existing screens in the same app solving a similar shape (grep pages, look at sibling modules) — house patterns beat invention; the repo's documented patterns are binding.
- The project's component library and theme tokens — no raw px/hex inventions.
- Every user-visible string will need a translation key (i18n-check downstream).
- **Check the user's recorded design taste** (a `design-taste` memory, if the harness has one): previously approved/rejected directions and the reasons — don't re-propose a rejected pattern.

### 2.5. No design system? Run design-baseline first (one-time per repo)

If the repo has neither documented styling standards nor a `DESIGN.md`: pause the feature flow and establish the baseline once —
1. Understand the product's audience and tone; look at 2-3 reference products.
2. Propose the baseline: type scale, color system (light/dark), spacing scale, radius/shadow, and shape conventions for recurring components (buttons, tables, forms, empty states).
3. Render 2-3 font×color combinations as an actual preview page — the user picks by looking.
4. Write the result to `DESIGN.md` at repo root. It is a team asset — goes through an MR, not a silent commit.

From then on, step 2 reads `DESIGN.md` as the styling source of truth.

### 3. State matrix BEFORE any visual

For each screen: `loading / empty / error / success / no-permission` × each async flow it contains. Present as a table; the user confirms which states are real. This is the cheapest moment to find a missing state — a UX-completeness review will demand them later anyway.

### 4. Direction mockups (2–4) — user refines visually

Publish a canvas (or a set of standalone HTML pages): one artboard group per direction, key states included (not just the happy screen). Each direction must embody a **real trade-off** (density vs guidance, single-page vs stepper, table vs cards, modal vs inline edit) — never the same layout with different colors. Label each artboard with its trade-off in one line.

The user clicks, edits, and picks. Iterate on the canvas — do not regenerate from scratch on small feedback.

**Structured feedback**: collect the user's verdict on every direction along the same dimensions (information density / guidance / consistency / preference and why) — not free-form per direction. **Record the outcome** in the design-taste memory: chosen direction, rejected ones, and the stated reasons — future drafts converge on this instead of re-exploring settled taste.

**Optional design panel** (high-stakes UI, or the user asks for one): before the user looks, dispatch parallel agents each scoring all directions through one lens — a11y (keyboard, contrast, focus order), efficiency (clicks for the high-frequency action, scan path), consistency (vs sibling screens / `DESIGN.md`), copy/i18n (translatability, overflow risk). Annotate the canvas or table with their findings.

**Fallback without a canvas tool**: self-contained HTML files, one per direction, opened in the browser.

### 5. Lock and hand off

The chosen direction + confirmed state matrix become:
- input to the spec / FE plan (and its diagrams, where the flow warrants them)
- the manual-verification steps browser-verify will walk later (each confirmed state = one step)
- the strings inventory for i18n-check (draft keys early, reuse-first)

## Common mistakes

- Mockups before the state matrix — the happy path always looks fine; the design decisions live in empty/error/loading.
- Fake variety — four directions that differ only in styling. If you can't name each direction's trade-off in one line, they aren't directions.
- Inventing layout patterns when a sibling screen already solved the same shape — check reuse first (step 2).
- Describing UI in prose and asking the user to imagine it — publish something viewable, always.
