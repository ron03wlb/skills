Quickstart:

```bash
npx skills add mattpocock/skills --skill=to-spec
```

```bash
npx skills update to-spec
```

[Source](https://github.com/mattpocock/skills/tree/main/skills/engineering/to-spec)

## What it does

`to-spec` turns the current conversation and your codebase understanding into a spec (you may know this document as a PRD), then publishes it to your issue tracker.

It does **not** interview you again. By the time you reach for it, the alignment work is done — `to-spec` synthesises what is already known rather than asking a fresh round of questions.

## When to reach for it

You invoke this by typing `/to-spec` — the agent won't reach for it on its own.

Reach for it once a change has been talked through and the domain language is settled, and you want that shared understanding written down before any code is written. If you *haven't* aligned yet, grill first — for that, use [grill-with-docs](https://aihero.dev/skills-grill-with-docs). To split the finished spec into tickets, use [to-tickets](https://aihero.dev/skills-to-tickets).

## Prerequisites

`to-spec` publishes into your issue tracker, so [setup-matt-pocock-skills](https://aihero.dev/skills-setup-matt-pocock-skills) must have configured the tracker and triage labels for this repo first. It applies the `ready-for-agent` label itself — no separate triage pass needed.

## Planning Seal

The seal turns the design paper trail into a committed planning baseline before `ready-for-agent` is applied. If the conversation produced no relevant planning-artifact delta, `to-spec` reuses the current target commit instead of creating an empty one. Ambiguous ownership or mixed unrelated hunks stops publication.

For an existing Spec, `to-spec` updates the same tracker record in revision mode and records the mode, commit, and seal. Any create or update, label, or read-back failure reports the exact partial tracker state with the selected seal's full SHA. Before reconsidering the current delta, a retry recovers and verifies that SHA from tracker read-back or the prior partial-state report; missing or conflicting evidence stops instead of selecting a different seal.

The published Spec records the baseline commit and whether the seal was created or reused, so a later Issue worktree can prove it started from committed planning context.

## What the spec includes

- **Problem statement** — what is broken or missing, and why it's worth solving, in the project's own vocabulary.
- **Solution** — the shape of the fix at a high level, before any implementation detail.
- **User stories** — an extensive, numbered list of the concrete behaviours the change must support, each one independently checkable.
- **Implementation decisions** — the choices already settled during the conversation, so they aren't relitigated later.
- **Testing decisions** — the seams the feature will be tested at, and what "done" looks like.
- **Out-of-scope items** — what this change deliberately does *not* cover, to keep the ticket bounded.
- **Further notes** — anything else worth carrying forward that doesn't fit the sections above.

## Deep modules

Before writing the spec, `to-spec` sketches the **seams** at which the feature will be tested and looks for **deep module** opportunities — a lot of functionality hidden behind a small, stable interface. It prefers existing seams to new ones and the highest seam possible, ideally just one across the whole change.

That matters for agentic development: a good interface gives tests something durable to target, so the code underneath can change without the tests moving.

## It's working if

- It starts writing the spec instead of asking you a fresh round of questions.
- It checks the seams with you before writing, and proposes as few as possible.
- The spec comes back in your project's domain vocabulary, not generic boilerplate.
- It records a Planning Seal commit before the Spec becomes `ready-for-agent`, without absorbing unrelated dirt.

## Where it fits

`to-spec` is a step in the main build chain:

```txt
grill-with-docs → to-spec → [to-tickets] → implement → code-review
```

Reach for it after the plan and domain language are resolved. A bounded Spec can go directly to [implement](https://aihero.dev/skills-implement) or the explicit Issue-worktree route; use [to-tickets](https://aihero.dev/skills-to-tickets) when the Spec needs multiple tracer-bullet Issues. Its upstream neighbour is [grill-with-docs](https://aihero.dev/skills-grill-with-docs), which produces the glossary and ADR changes that the Planning Seal commits. When you're unsure which skill or flow fits, [ask-matt](https://aihero.dev/skills-ask-matt) routes you.
