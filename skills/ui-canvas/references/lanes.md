# Review interfaces

Select by observed capabilities, not Claude Code versus Codex branding. The live project runtime and the note interface are separate concerns: an annotation surface is useful only if the actual project components remain executable. Both runtimes use [feedback.md](feedback.md).

## Capability check

Independently verify that the current interface can show the running preview, select a region, deliver reviewer text/ID to the agent, display a reply, and retain feedback across refresh. Tool presence or a screenshot does not prove any other capability. Record supported operations and limitations in the handoff. Do not promise a native note API that is not exposed by the current tools.

## Local browser review for CLI workflows

Use the bundled [local review tool](local-review.md) when developers work in Codex CLI or Claude Code and want to keep that session. It shows the actual preview alongside anchored comments and stores the shared ledger in the project. The bundled tool shows every screen/state of the feature as artboards on one pannable canvas with pinned comments, so a reviewer sees the whole flow at once. The original agent reads actionable notes and writes replies through the bundled CLI. Browser updates require no model calls; processing still needs a prompt in the original session. Verify the project's preview bridge before claiming support. This avoids requiring a separate desktop AI conversation.

## Browser preview with native comments

Use this when it can host the actual project's local runtime, provide region-linked comments, and deliver feedback to the working agent session. Requiring a separate desktop conversation is not seamless CLI integration. Open the preview visibly, then let the developer point to an area and write naturally. Map received comments to stable screen/anchor IDs, preserving native IDs/links and exact text.

Use the available comment content/tool to obtain the latest version; never infer edited note text from old screenshots. If native replies are writable, reply in that thread. Otherwise reply in the Codex/Claude conversation with the note ID, original text, status and visible result, and persist that same record in the ledger. Clearly state that native write-back is unavailable; do not claim the reply appeared on the page. The user need not learn another status rule.

For an append-only host, explicitly associate a follow-up with the original note ID rather than creating unrelated work. If comments are not accessible at all, accept a selected-region message or annotated screenshot and map it to the same ledger. Do not claim durable native comments were verified in this fallback.

## Artifact/canvas with pinned notes

Use when its runtime can preserve real project components, or alongside a linked live project preview. A static artboard alone cannot meet the executable-preview requirement.

Save editable sources in the feature directory and preserve stable anchors. Discover the currently installed artifact/canvas helper; never hardcode a historical versioned path. After the reviewer saves, extract the latest notes using `scripts/read-notes.mjs` before editing, and recheck for new reviewer edits before publishing. Never republish stale sources over human edits. On Claude Code, a Claude Artifact cannot embed a live external page via <iframe> (claude.ai's CSP blocks it at the platform level; a local file:// render falsely appears to work) — verify embed claims only by opening the real artifact URL, and prefer the bundled local browser review lane above.

## In-conversation visual alternatives

Use native interactive visualization only when it can honor the source/runtime requirements. A sandboxed HTML reconstruction may help explain alternatives, but is not verified component reuse. Do not assume private project packages or a localhost runtime can load in a sandbox. Keep the live project preview as the fidelity reference.

## Static reference fallback

If runtime prerequisites or interactive surfaces are unavailable, follow [static-html.md](static-html.md) for a clearly labeled reference. Keep the missing executable-preview requirement visible; do not silently downgrade completion criteria.

## Resume or move between interfaces

Read the latest ledger, UI spec, source revision and version approvals first. Preserve IDs, reviewer history and work states; map new native comment IDs explicitly. Host-resolved/deleted markers never override shared approval rules. Persist all handoff files in the project rather than only in host storage.
