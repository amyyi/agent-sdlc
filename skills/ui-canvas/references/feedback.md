# Shared feedback lifecycle

Claude Code and Codex share this contract. Only reading, positioning, and displaying notes differ by interface. Keep the developer's gesture simple: point to an area, leave a note, and edit the same note if the result needs adjustment. Never require deletion or per-note approval.

## Three work states, separate version approval

| State | Meaning | Transition |
|---|---|---|
| `pending` / 待處理 | New, changed, or invalidated feedback | Agent starts work or identifies a missing decision |
| `needs-clarification` / 待釐清 | A specific decision or intelligible request is missing | Reviewer clarifies; changed reviewer text becomes pending |
| `handled` / 已處理 | Intended changes landed and the actual result was inspected | Changed reviewer text or affected target revision reopens it |

Unchanged text **preserves the recorded state**. Merely seeing a note is not handling it. The agent records `handled` only with change/render evidence, and replies with the visible outcome and reviewed version. If inspection cannot run, keep pending and explain what remains.

Empty or missing notes do not approve anything. A cleared visible note needs clarification; a missing note retains its previous state/history with `presence: missing` until restored or explicitly withdrawn. Partial comment snapshots must be labeled: absence from a partial snapshot is not deletion. Explicit withdrawal is recorded as a disposition, not as handled or approved.

The developer approves a whole version once, e.g. 「這版可以，作為實作參考」. Record exact words, reviewer, version, per-screen/state scope with the revision it was approved against, and either the accepted gaps or an explicit "no gaps" confirmation — one of the two is required. Version approval never silently resolves pending work or changes its state. Unknown decisions outside the reviewer's authority remain open. Invalidation happens per board: when a board's revision changes, only that board's approval scope is invalidated and its notes reopen; unaffected scope and history are retained.

## Agent questions

An open rule the requirement source never fixed is not a silent decision — file it as a note with `source: 'agent'` (see local-review.md's `ask` command). It stays `needs-clarification` until the reviewer answers (the store and the CLI count a question as open by that status while its board is still in the manifest); the answer is whatever text lands in `reviewerText` (a picked option or typed text), and once non-empty it becomes `pending` like any other note. Whole-version approval never answers a question implicitly: unanswered agent questions block the no-gaps confirmation. The bulk "全部照目前畫面定案" action is not a workaround around that rule — it is an explicit reviewer answer recorded per question, through the same edit path, not a silent close.

## Preserve the conversation

Read the latest saved notes before every edit. Preserve original reviewer text verbatim in history, including earlier revisions. Do not overwrite a new user edit with a stale agent reply. Before changing the preview, restate the expected visible outcome in 1–3 plain-language statements; clarify ambiguous or conflicting requests. Provide alternatives rather than asking for CSS terminology.

For native threaded comments, keep reviewer text and agent replies separate and use stable comment IDs. When the interface supports editing the combined note, use this portable display:

```text
[第 2 輪 · 已處理 · v3]
這裡分成兩排
———
已分成兩排，窄視窗下也沒有重疊。畫面證據：screens/evidence/v3-form.png
```

The delimiter is exactly three em dashes (`———`) on its own line. In legacy combined notes, the reader strips a square-bracketed first line only when this reply delimiter is present; otherwise that line remains reviewer text. Even with the delimiter, legacy text cannot reliably distinguish a human-authored bracketed heading from agent metadata, so prefer structured reviewer text and preserve the complete raw note in history when converting. Never interpret words such as “已完成” in free text as a state transition. Hash only reviewer text, excluding recognized agent status and reply; the durable ledger, not the displayed heading, determines work state.

## Durable ledger

Maintain `.ui-canvas/<feature>/feedback-ledger.json` even when the host retains notes, so another conversation or runtime can resume. Store:

- `schemaVersion: 2`, current preview version and source revision;
- `entries[]`: stable `id`, interface/source ID, screen, anchor, `targetRevision`, exact `reviewerText`, `textHash`, `status`, round, agent reply, change/render evidence, and append-only history;
- `approvals[]`: reviewer, exact confirmation, version, covered screens/states, gaps and later invalidations.

A target revision changes when that note's area or dependencies change, not for unrelated screen edits. Preserve stable anchors across reordering and interface migration. A screen/anchor move requires checking whether the note still targets the same thing. Use an explicit ID mapping when the new host changes IDs; do not match by text alone.

Write status transitions and prior reviewer/reply versions to history before saving the latest entry. Read the latest source immediately before replying. Store a temporary ledger then rename it atomically; do not replace a corrupt ledger with empty history. Do not silently import legacy confirmation as whole-version approval: retain the old record and require explicit version confirmation. Hash-only legacy entries need evidence review before being marked handled.

## Shared reader

`scripts/read-notes.mjs` accepts a saved artifact page **or normalized JSON** from browser comments/dialogue:

```json
{
  "complete": false,
  "notes": [{
    "id": "F-01",
    "screen": "role-editor",
    "anchor": "M-03",
    "targetRevision": "v3-form",
    "reviewerText": "這裡分成兩排",
    "agentReply": "已分成兩排"
  }]
}
```

```sh
node scripts/read-notes.mjs latest-notes.json --json --ledger feedback-ledger.json
```

Normalized JSON uses `complete: false` for a partial comment snapshot; absent notes in that snapshot are not marked missing. Omitted `complete` defaults to `true` (a full snapshot), so adapters must set it explicitly when fetching only a subset.

The reader classifies against the last ledger; it does not fetch native comments, mark work complete, overwrite history, or grant approval. Merge its observations into the ledger without dropping evidence/history. Missing notes are returned separately. For artifact combined text it retains the historical trim/hash convention; for structured `reviewerText` it hashes exact text.

## Reviewer-facing summary

Present pending and clarification items first, identified by screen/region with their original words. Handled notes can be collapsed but remain discoverable with the agent reply. When all actionable notes are handled, summarize the version and gaps and request whole-version confirmation. Do not repeatedly reopen unchanged handled notes or escalate merely because the user has not individually approved them.
