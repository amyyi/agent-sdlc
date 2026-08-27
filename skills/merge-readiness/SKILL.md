---
name: merge-readiness
description: Use when implementation is complete, all tasks are done, and you are about to commit or declare the work ready for review/merge. Also triggers on "merge readiness", "出 quiz", "考我", "ready to commit", "準備 commit".
---

# Merge Readiness Report + Quiz

## Overview

Before declaring work ready, produce an HTML report that lets the author verify **understanding** instead of reading the code. The quiz is the acceptance artifact: passing it means you can own this change without having read the implementation line by line.

## When NOT to use

Trivial/mechanical changes (typo, config bump, doc edit, pattern-apply across files). Report only feature-level completions.

## Steps

1. **Gather inputs**: current branch name; `git diff <base>...HEAD` (or staged diff); `implementation-notes.md` if it exists; the plan/spec/tasks docs for this feature.

2. **Generate the HTML report** with these sections, in order:
   - **Context**: why this change exists, what problem it solves.
   - **Architecture decisions**: what was chosen and why — especially anything non-obvious. Include rejected alternatives.
   - **What changed**: file-by-file summary **grouped by concern** (never alphabetical). Each group = one responsibility.
   - **Deviations**: pull from `implementation-notes.md` if it exists; otherwise note "none recorded".
   - **Intuition**: "If you had to debug this in 6 months, here's where to look" — entry points, state owners, the one file that matters.
   - **Visual evidence** (UI changes only): if a browser-verify evidence directory exists for this branch, embed its screenshots via relative paths with step captions and pass/fail from its `index.md`; note any steps that lack evidence.
   - **Quiz**: 8–12 questions (see below).

3. **Quiz requirements** — test understanding, not trivia:
   - data/state flow (who owns state, what triggers what)
   - why a specific approach was chosen over alternatives
   - what would break if a key piece were removed or changed
   - edge cases the implementation handles
   - Each answer hidden behind `<details><summary>` with an explanation referencing `file:line`.
   - Scale to risk: high-risk change (cross-module contract, shared state, external writes) → full 8–12; low-risk → 4–6.

4. **Save** as `reports/merge-readiness-{branch-name}.html` (or `.specify/reports/...` in a spec-kit repo; create the directory, slugify slashes in branch names).

5. **Offer the in-session quiz**: present the 3–5 highest-value questions in chat. The user may answer or say skip. Grade answers, explain gaps with file references. If a wrong answer reveals an unfamiliar domain concept, record it in a learning-concepts memory if one exists.

6. **Generate the MR/PR description** (`reports/mr-description-{branch-name}.md`, paste-ready) — a reviewer-audience projection of the report, in plain conversational language, never a diff restatement:
   - **One line**: what this change does and why, as you would say it out loud to a teammate
   - **Suggested review order**: which file to read first and why (reuse the Intuition section — the reviewer's entry point is the same as the debugger's)
   - **Key decisions**: each non-obvious choice + the alternative it beat, one line each
   - **Deviations**: from the report, verbatim
   - **Tests & evidence**: repo-relative link to the e2e test file(s) guarding this change; key screenshots from the browser-verify evidence dir — upload via `glab api projects/:id/uploads` (GitLab) or drag into the PR (GitHub) and embed the returned markdown; fallback if the CLI is unauthenticated: reference the evidence path and offer the HTML report. State which mocked error-track scenarios were walked.
   - **i18n-check result** (localized UI changes only): the i18n-check block — all ✅, or the keys-to-create list plus backend-owned ignore items with reasons.
   - **Self-review result**: if a pre-commit self-review ran (`review-{branch}.md` exists), cite it — final verdict (e.g. "Needs Changes → all findings fixed"), which standards were applied, blast-radius highlights, and the report file reference. This tells reviewers what the machine already checked and where to focus.
   - Match the repo's review-language convention.

7. Only after the report and MR description are saved (and the quiz offered) declare the work ready / proceed to commit. Do not create or update the MR itself unless asked — the description is handed to the user to paste or to pass to `glab mr create --description-file` / `gh pr create --body-file`.

## HTML requirements

Self-contained (inline CSS/JS, no CDN), readable in light and dark, prose in the user's language with technical terms in English. Quiz answers collapsed by default.

## Common mistakes

- Alphabetical file lists — group by concern or the report teaches nothing.
- Trivia questions ("what is this function named") — every question must probe flow, trade-off, breakage, or edge case.
- Writing the report from the diff alone — read the plan/spec too, or Context and Deviations will be guesses.
- Skipping the save step and only pasting inline — the report must exist on disk for reviewers.
- MR description that restates the diff file-by-file — reviewers can read the diff; give them the why, the review order, and the trade-offs instead.
