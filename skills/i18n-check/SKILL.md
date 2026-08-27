---
name: i18n-check
description: Use after implementing a UI change in a localized app, before the pre-commit code-review self-pass — verifies every i18n key used in the diff exists in the translation export. Also triggers on "i18n check", "驗 key", "key 存不存在", missing-translation symptoms (UI renders a short camelCase key instead of text).
---

# i18n Check (translation key existence)

## Overview

A missing translation key renders as the raw key, silently — screenshots look "fine" and no lint or CI catches it. This check compares every key the change uses against the project's flat translation export before commit. The script verifies literals; the agent resolves dynamic call sites; missing keys come back as a ready-to-create list.

Written against a Tolgee-style flat export (`{"namespace.key": "text"}`), but works with any translation platform that can produce one.

## Export file (single file, overwrite — never accumulates)

- Canonical path: `~/.agents/i18n/en-US.json` — the flat export of your source locale (source locale is canonical for *existence*; all locales share the keyspace).
- Missing → **BLOCKED**: ask the user to download it; never guess against stale knowledge. Older than 7 days → warn and suggest re-download, but proceed if the user says so.

## Steps

1. **Collect changed files**: `git diff --name-only <base>...HEAD` (plus staged), filtered to `.ts`/`.tsx`.

2. **Run the script**:
   ```bash
   node <skills-dir>/i18n-check/scripts/check-keys.mjs \
     --export ~/.agents/i18n/en-US.json --files <changed files>
   ```
   It resolves keys with the convention `t('a:b')` → `a.b` (first colon only), otherwise `<hook namespace>.<key>` with a namespace-less hook defaulting to `common` — adjust the resolver to your i18n wrapper. It prints a verdict table: ✅ exists / ❌ missing / ⚠️ dynamic / ⚠️ ambiguous.

3. **Resolve every ⚠️ yourself** (the script cannot):
   - `` t(`ns:${enumVar}`) `` → read the enum/union definition, enumerate all candidate keys, re-run with `--keys ns:V1,ns:V2,...`. Watch for transforms like `.toLowerCase()` applied to the variable.
   - `t(constMapValue)` → expand the const map's values and verify each via `--keys`.
   - Keys arriving from API responses → mark **backend-owned, not statically verifiable**; list them in an ignore section with the reason. Never report them as verified.
   - `ambiguous` (multiple namespaces in one file) → read the component scope to pick the right hook, then re-verify.

4. **Produce the fixed output format** (embed in the merge-readiness report / MR description — no standalone report file):

   ```markdown
   ### i18n-check
   ✅ N verified · ❌ M missing · ignore: K backend-owned (reasons below)

   #### Keys to create
   | key | 使用位置 | 重用建議 |
   |-----|---------|---------|
   | `common.newKey` | `src/...:42` | 近似 key：`common.similarExisting`（建議改用）/ 無 → 待建 |

   #### 文案草稿（使用者確認後才進翻譯平台）
   | key | lang | 文案 | 來源 |
   |-----|------|-----|------|
   | `common.newKey` | en-US | ... | [spec 已定義] spec.md §x.y |
   | `common.newKey` | <locale> | ... | [AI 草擬待確認] |
   ```
   Rules: reuse beats create — always search the export for near-matches first (the script suggests same-short-key hits; also check semantically similar `common.*`). Drafts cover **every locale the project ships**. Every draft line carries its source tag: `[spec 已定義]` with the citation when the copy exists in spec/design docs, `[AI 草擬待確認]` when drafted — drafted copy never reaches the translation platform without the user's confirmation.

5. **Gate**: ❌ missing or unresolved ⚠️ = not ready to commit. Either switch to a reused key in code, or hand the user the keys-to-create list, wait for key creation + a fresh export download, then re-run to green.

## Common mistakes

- Verifying only the hook-namespace form and missing `ns:key` colon literals (or vice versa).
- Treating a clean happy-path screenshot as proof — misses render the short key, which can look like intentional text.
- Reporting backend-owned keys as verified instead of ignored-with-reason.
- Creating a new key when a `common.*` equivalent exists — check reuse suggestions first.
