# Generated UI traps

Check the relevant items before presenting a draft.

## 1. Flex children do not shrink by default

For text beside fixed actions, the text container generally needs `min-width: 0`; truncation or wrapping alone does not prevent overflow.

## 2. Truncation needs the complete mechanism

Single-line ellipsis requires nowrap, hidden overflow, and text overflow. Multi-line clamping requires the line-clamp display/orientation properties plus hidden overflow.

## 3. Coordinates drift when content height changes

Connectors and absolutely positioned controls detach when text wraps. Derive positions from shared geometry or re-check every dependent coordinate after content or padding changes.

## 4. Do not replace a sourced minimum height with a fixed height

A fixed height clips variable content. Preserve `min-height` unless the source proves deterministic fixed geometry.

## 5. Static viewports can clip meaningful content

A real app may scroll or pan while a static draft cannot. Size the frame to content or make intentional clipping obvious.

## 6. Resolve framework defaults

An unset radius, colour, or spacing value may come from the framework. Inspect the installed implementation instead of treating omission as zero.

## 7. Resolve named colour tokens to actual values

Do not infer one ramp step from its neighbours. Record where the resolved value came from.

## 8. Prefer inline SVG over emoji or icon fonts

Use the project's existing icon source when available. If substituting an editable SVG, disclose the substitution.

## 9. Keep reviewer-adjustable visual properties easy to inspect

For static or canvas-oriented HTML, use inline style where the editing environment depends on it. Do not override the project's implementation convention in application code.

## 10. Use layout gaps for sibling spacing

Margins attached to individual siblings are fragile when reviewers reorder or remove items.

## 11. A successful text replacement may be a no-op

`replace()` and `sed` can exit successfully without matching. Assert every insertion anchor before writing and verify the expected output afterward. For class-based HTML, check that every class used resolves to a selector, accounting for compound and descendant selectors.

Do not trust a mechanical check until a known-good fixture passes and a known-broken fixture fails.

## 12. The same widget may have multiple implementations

Search for the shared implementation and all local feature variants. Record both the chosen source and rejected alternatives. A closer functional match may be legacy or encode assumptions that do not apply. When variants disagree, record the conflict rather than debugging a faithful copy of the wrong source.

## 13. A checker is not evidence until tested both ways

A checker and the generated artifact may share the same false assumption. Demonstrate the checker with one known-good and one known-broken input. Treat an unconfirmed negative result as a hypothesis, not a finding.

## 14. Two harnesses for one feature drift apart

When a feature's review preview lives somewhere other than the actual code change (a Storybook-only canvas built to skip login, a sandboxed copy, etc.), nothing keeps them in sync automatically. Re-check every structural decision — which component/pattern was chosen, which affordances exist — against the real integration before publishing either as final. A `browser-verify` pass that only screenshots the isolated harness will not catch this; deliberately compare the two.

## 15. An undecided behavior stays inert

Adding a plausible-looking control (a retry button, a default value, a permission gate) for a behavior the spec leaves open is not a neutral placeholder — it's a decision made without a source. If no FR/rule/explicit user decision justifies it, the failure/empty/edge state should stay a message with no action, marked `GAP`, even when that looks visually unfinished.

## 16. A regenerated feature directory erases human decisions

`.ui-canvas/` is git-ignored, so nothing under it comes back from git, and its ledger is where reviewer decisions live. A fresh run that deletes, moves or recreates an existing feature directory (or its siblings: other features, `acceptance-*`, evidence) silently discards those decisions and the next draft reverts them. A new run once wiped a real project's `.ui-canvas/` directory: a copy decision the reviewer had confirmed the day before and a complete acceptance run's evidence were lost, and the regenerated story reverted the copy to "pending" without anyone noticing. Before writing into an existing feature directory, read its ledger and handoff and continue from them; if regeneration is really intended, copy the directory to `.ui-canvas/_backup-<feature>-<YYYYMMDD-HHMMSS>/` first and never touch sibling directories.

## 17. Removing a board without cleaning up its evidence

Editing a board out of `review-manifest.json` and restarting is not the whole removal. If the old thumbnail/evidence file stays on disk and reconcile isn't triggered, the deleted board's screenshot becomes an orphan and any earlier whole-version approval still claims to cover that board. Delete the board's thumbnail/evidence files in the same step as editing the manifest, say in the reply which files were deleted, and restart so reconcile marks that board's approval scope invalidated (`Board removed`) — do this in one pass, not "edit manifest now, clean up files later."

## 18. Anchors set through forwarded props may never reach the DOM

`data-anchor` passed through a component prop (e.g. spreading `confirmButtonProps={{ 'data-anchor': 'E-05' }}`) silently does nothing if that component doesn't forward unknown props to its DOM node. The evidence script must assert the attribute is actually present on the rendered element — individually for each such forwarded anchor — not just that the prop was passed in source.

