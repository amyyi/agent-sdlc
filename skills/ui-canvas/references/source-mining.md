# Source mining

Use evidence from the current project. Product names found in examples or tests are not defaults.

## Two authorities

| Decision | Authority |
|---|---|
| Fields, actions, conditions, labels, business states | Approved spec, ticket, acceptance criteria, or explicit user decision |
| Layout, spacing, type, colour, component anatomy | Shipping screen, shared component, theme, and installed framework defaults |

When requirements and implementation disagree about behavior, do not silently make the implementation the new requirement. Record the conflict. With a PRD-only input, propose choices and consequences for missing behavior, identify who may decide, and keep pending decisions visible while independent layout work continues.

## Styling hierarchy

Use the highest source that exists and applies:

1. explicit applicable project design/component standards;
2. screen being extended;
3. nearest comparable shipping screen;
4. shared component actually imported by the owning app;
5. owning app theme/tokens and resolved framework defaults;
6. committed prototype or mockup, for structure only;
7. design-system documentation;
8. screenshot.

In a spec-only repository, application-code tiers may be absent by construction. Use the available docs as authority, state that actual component rendering is blocked, and inspect a sibling repository only when it was placed in scope. Do not call a static reconstruction a completed executable preview.

## Identify the owning application

Match the feature's route, domain nouns, or imports. Same-named screens such as Settings or Roles may exist in several apps. State the selected app and evidence in the handoff. Determine the actual UI stack from source imports, not only a dependency manifest.

## Compare every widget implementation

Search for all implementations of each needed widget, including shared libraries and local feature copies. A functional resemblance does not automatically outrank the shared convention.

Keep a decision table:

| UI element | Chosen source | Why | Rejected alternative | Conflict/gap |
|---|---|---|---|---|
| Results table | `path/to/shared-table` | Shared convention used by current list screens | Feature-local fixed table | Local and shared padding differ |

Use real paths and useful line references. If sources conflict, preserve both findings. If no source exists, mark the layout choice as a proposed design decision rather than presenting it as established project behavior.

## Contract safety

Never infer these from naming conventions or typical applications:

- endpoint path or HTTP method;
- request or response fields;
- permission names or role behavior;
- retry, timeout, or idempotency behavior;
- validation timing, constraints, or exact messages.

If the UI needs one of them and no source defines it, add it to the handoff's unresolved-contract section and keep the screen copy neutral or explicitly marked `TBD`.

