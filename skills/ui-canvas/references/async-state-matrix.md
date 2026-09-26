# Per-operation async-state matrix

A screen-level list such as “loading / empty / error / success” is insufficient. One screen can load a list, search options, submit a form, and delete a row independently. Model each operation separately.

Use these **exact 11 columns** in one authoritative matrix, normally in `UI-SPEC.md` with a link from `UI-HANDOFF.md`. An existing handoff may retain its matrix; link to it from the UI spec instead of duplicating it:

| Operation | Trigger | Loading | Success | Empty | Validation | Permission denied | Recoverable error | Non-recoverable error | Retry | Evidence |
|---|---|---|---|---|---|---|---|---|---|---|

One row represents one asynchronous operation.

- **Operation:** stable, human-readable identifier, such as “load list” or “search assignee options”.
- **Trigger:** first render, query change, button click, page change, and so on.
- **Loading / Success / Empty:** visible UI, affected region, and allowed actions in that state. Avoid freezing the whole page without evidence.
- **Validation:** sourced client or server validation behavior; otherwise a scoped `GAP — <reason>`.
- **Permission denied:** distinguish hidden, disabled, forbidden response, and inaccessible route only when sourced. Otherwise a scoped gap.
- **Recoverable error:** visible failure that preserves a route to recovery.
- **Non-recoverable error:** terminal state for this operation, or a reasoned `N/A — <reason>`.
- **Retry:** only a documented retry, refresh, edit-and-resubmit, or navigation route. Otherwise a scoped gap.
- **Evidence:** spec section, API contract, implementation path, plus concise unresolved questions.

## Rules

- “No results” from a successful search is not a request failure.
- Initial loading, background refresh, and submitting are separate when they affect different regions or actions.
- Dependent dropdowns and autocomplete searches are operations, not static fields.
- Every cell must be concrete or use `N/A — <reason>` / `GAP — <reason>`; a bare `N/A` or `GAP` hides the decision.
- Partial failure needs its own row or an explicit sourced branch.
- Do not create a retry button, optimistic update, validation message, or permission rule merely because it would be good UX. Mark the missing decision.
- If an operation is purely local and synchronous, exclude it and say so in the flow notes.
