Quickstart:

```bash
npx skills add mattpocock/skills --skill=ask-matt
```

```bash
npx skills update ask-matt
```

[Source](https://github.com/mattpocock/skills/tree/main/skills/engineering/ask-matt)

## What it does

`ask-matt` is the router over the skills in this repo. You describe the situation you're in; it tells you which skill or flow fits and in what order to run them.

It **does no work itself**. It doesn't grill, write a spec, or fix anything — it only orients. It exists for the **user-invoked** skills above all: nothing fires those for you, so *you* have to remember they exist, and `ask-matt` is the memory you offload that to. It also points at the model-invoked skills you'd reach for by name — `/tdd`, `/diagnosing-bugs`, `/prototype`, `/code-review`, and the two vocabulary references, `/domain-modeling` and `/codebase-design`. It answers "which one, and when", then hands you off to the skill that actually does the job.
For material security, data, concurrency, migration, contract, or cross-module risk, it maps the pre-integration gate to /code-review even when you did not explicitly ask for review.

## When to reach for it

You invoke this by typing `/ask-matt` — the agent won't reach for it on its own.

Reach for it whenever you're unsure which skill or flow a situation calls for: you have an idea and don't know where to start, a pile of bug reports and don't know if they're for `/triage`, or two skills that look interchangeable and you can't tell them apart. If you already know the skill you want, skip the router and invoke it directly.

## Flows, not just skills

The idea `ask-matt` gives you to think with is the **flow** — a path *through* the skills rather than a single one. Most work runs along one **main flow** (idea → ship: grill → spec and Planning Seal → optional tickets → implement → review), two **on-ramps** merge onto it, and everything else is a **standalone** you reach for on its own. Ask a question and you get placed on the right flow, at the right step — not just handed a tool.

The main flow uses [to-spec](https://aihero.dev/skills-to-spec) to create or reuse a **Planning Seal** before tracker work becomes executable. When `grill-with-docs` produced an owned planning-artifact delta, even a small build invokes `/to-spec`; the bounded Spec can then go directly to [implement](https://aihero.dev/skills-implement), which remains the default implementation path. Larger work continues through [to-tickets](https://aihero.dev/skills-to-tickets), which validates or advances the seal before fan-out. An approved plan or conversation may skip `/to-spec` and invoke `/to-tickets` directly when no formal Spec is needed. Only when you explicitly select a dedicated-worktree alternative does implement become [execute-issue](https://aihero.dev/skills-execute-issue) followed by [close-issue](https://aihero.dev/skills-close-issue). Those Issue worktrees may proceed concurrently; only integration into the same target branch is serialized. The independent [wiki](https://aihero.dev/skills-wiki) and [remove-ron](https://aihero.dev/skills-remove-ron) controls remain outside delivery.

## Where it fits

`ask-matt` is the **router** — the standalone map that sits over the whole set. It is the node every other docs page links back to as [ask-matt](https://aihero.dev/skills-ask-matt), so it never sits *in* a chain; it points *into* every chain. From here you'll most often land on [grill-with-docs](https://aihero.dev/skills-grill-with-docs), the head of the main flow, [triage](https://aihero.dev/skills-triage), the on-ramp for work you didn't create, or the explicitly selected [execute-issue](https://aihero.dev/skills-execute-issue) alternative when work needs an isolated review-repair and integration path. When even the router's own picture is stale, its [Source](https://github.com/mattpocock/skills/tree/main/skills/engineering/ask-matt) is the map of record.
