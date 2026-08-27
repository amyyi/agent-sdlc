---
name: blind-spot-pass
description: Use before planning or modifying an unfamiliar module, repo, or subsystem — before grilling/interview rounds, before writing a plan, or when entering code the user or agent has not worked in recently. Also triggers on "blind spot", "unknown unknowns", "盲點掃描", "陌生模組".
---

# Blind Spot Pass

## Overview

Surface **unknown unknowns** before entering unfamiliar code: hidden couplings, unwritten conventions, and constraints nobody thought to mention. Interviews and plans only cover questions someone knew to ask; this pass finds the rest. Output feeds grilling/planning as facts.

## When NOT to use

Modules you (or the user) touched recently, or changes fully contained in one well-understood file.

## Steps

1. **Define the entry surface**: the files/symbols the task will touch, plus their direct callers and callees.

2. **Run the sweep** — if a code-graph MCP server is connected (one that can index a repo and answer structural queries), prefer it and ask for:
   - couplings that don't follow from the module's name or directory structure
   - the impact radius of the entry surface — who else breaks if this changes
   - under-documented hot spots
   - load-bearing hub/bridge code near the entry surface

   **Fallback (no such server available)**: dispatch parallel read-only explore agents, each with one lens:
   - who imports/calls the entry surface from *outside* this module
   - shared mutable state, globals, caches, event buses the module reads or writes
   - conventions: how do sibling modules solve the same problem (naming, error handling, transactions)
   - landmines: TODO/FIXME/HACK comments, suppressed lint rules, retry/timeout magic numbers, feature flags

3. **Write the blind-spot list** — 5–10 items max, each in this shape:
   - **Finding**: the fact (with `file:line`)
   - **Why it bites**: the failure that happens if ignored
   - **Decision needed?**: yes → becomes a grilling question for the user; no → becomes a plan constraint

4. **Hand off**: feed "Decision needed" items into the grilling frontier (architecture-changing ones first); feed constraints into the plan. Do not start planning until the list is delivered.

## Common mistakes

- Listing things you already knew — the pass is only for findings that would NOT have appeared in a naive plan.
- Dumping 30 findings — cap at 10, ranked by blast radius; a long list gets skimmed and defeats the purpose.
- Running it after the plan is written — constraints found late force rework; this pass is a pre-planning gate.
- Treating "no findings" as success without checking sweep coverage — say which lenses ran and found nothing.
