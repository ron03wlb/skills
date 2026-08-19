Quickstart:

```bash
npx skills add mattpocock/skills --skill=to-tickets
```

```bash
npx skills update to-tickets
```

[Source](https://github.com/mattpocock/skills/tree/main/skills/engineering/to-tickets)

## What it does

`to-tickets` breaks a plan, spec, or the current conversation into a set of **tickets** — each a tracer-bullet vertical slice — and publishes them to your configured tracker, with every ticket declaring the tickets that block it.

Every ticket is a **tracer bullet** — a thin *vertical* slice that cuts through all integration layers end-to-end (schema, API, UI, tests), never a horizontal slice of one layer. A completed slice is demoable or verifiable on its own, which is what makes each ticket safe to hand to an agent.

## When to reach for it

You invoke this by typing `/to-tickets` — the agent won't reach for it on its own.

Reach for it once you have an approved plan, a written Spec, or an approved conversation and want it split into tickets. An approved plan or conversation can go directly to `to-tickets`; when a Spec or Issue reference exists, pass it so the skill can fetch the full body and comments. Use [to-spec](https://aihero.dev/skills-to-spec) when you need formal Spec publication or when ticket refinement changes public behavior, acceptance, target, or exclusions.

## Prerequisites

`to-tickets` publishes into your issue tracker, so [setup-matt-pocock-skills](https://aihero.dev/skills-setup-matt-pocock-skills) must have configured the tracker and its triage label vocabulary for this repo first. On a real tracker it applies the ready-for-agent label as it publishes.

## One artifact, two readings

The blocking edges are the whole point. They make one set of tickets read two ways, depending on the tracker:

- **Local files** → one file per ticket under `.scratch/<feature>/issues/`, numbered blockers-first, the edges written as text. You work them top-to-bottom, by hand, staying in the loop.
- **A real tracker (GitHub, Linear)** → one issue per ticket, the edges as native blocking links (or sub-issues). Any ticket whose blockers are all done is on the **frontier** and can be grabbed — so several agents can run at once.

The edges live in the ticket regardless of medium; the medium only decides whether anything acts on them in parallel. `to-tickets` produces the artifact — how you run it (sequential by hand, or a parallel fleet) is up to you.

Ticket granularity is not new product scope. No relevant planning-artifact delta means the existing seal is reused; an exact approved in-Spec refinement may advance it without touching unrelated dirt. New public behaviour, acceptance, target, or exclusions belong in a revised Spec rather than a child-ticket commit.

With a linked Spec, `to-tickets` first requires the inherited seal commit to exist locally and be an ancestor of the target. Invalid lineage stops before successor creation or publication and tells the human to invoke `/to-spec`.

If publication or read-back fails after a successor seal is selected, the partial-state report records its full SHA. A retry verifies and reuses that exact seal before considering the current delta; it never falls back to the inherited seal.

When `to-tickets` starts directly from an approved plan or conversation with no linked Spec, that approved breakdown is its scope authority and it may establish the primary seal under the same exact-delta rules, recorded as `created`.

## Vertical slices, not horizontal ones

The whole skill turns on one distinction. A **horizontal** slice ships one layer of the change — all the schema, or all the API — and nothing works until every layer lands. A **vertical** slice, the tracer bullet, ships one narrow path through *every* layer at once, so it can be demoed the moment it's done.

Before slicing, `to-tickets` looks for prefactoring — "make the change easy, then make the easy change" — and orders that work first. It then quizzes you on the breakdown (granularity, blocking edges, what to merge or split) before publishing anything, and publishes blockers first so each ticket's "Blocked by" can reference a real ticket. It reads every published ticket back so the approved body, Planning baseline, blocking edges, and ready state are proven rather than assumed.

## The wide-refactor exception

One shape breaks the tracer-bullet rule: a **wide refactor** — a single mechanical change (rename a column, retype a shared symbol) whose **blast radius** fans across the whole codebase, so one edit breaks thousands of call sites at once and no vertical slice can land green. `to-tickets` slices it as **expand–contract** instead: expand (add the new form beside the old so nothing breaks), migrate (move call sites over in batches sized by blast radius, one ticket per batch, CI green throughout because the old form still exists), then contract (delete the old form once no caller remains). When even the batches can't stay green alone, they share an integration branch that all block a final integrate-and-verify ticket, and green is promised only there.

## Where it fits

`to-tickets` is a step in the main build chain:

```txt
grill-with-docs → [to-spec] → to-tickets → implement → code-review
```

It usually follows [to-spec](https://aihero.dev/skills-to-spec), inheriting its Planning Seal, but it can also start from an approved plan or conversation. It hands each frontier Issue to [implement](https://aihero.dev/skills-implement), which drives [tdd](https://aihero.dev/skills-tdd) before its [code-review](https://aihero.dev/skills-code-review) pass. Work the frontier one Issue per fresh context. When you're unsure which skill or flow fits, [ask-matt](https://aihero.dev/skills-ask-matt) routes you.
