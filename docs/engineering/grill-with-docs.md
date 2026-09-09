## What it does

`grill-with-docs` binds one proposed [Spec](https://www.aihero.dev/ai-coding-dictionary/spec) and target to the current task, then interviews you and the [agent](https://www.aihero.dev/ai-coding-dictionary/agent) toward a shared understanding, one material decision at a time. It is the same interview [grill-me](https://aihero.dev/skills-grill-me) runs, pointed at a codebase. Only accepted glossary or ADR writes require an isolated planning worktree.

Accepted decisions are **[stateful](https://www.aihero.dev/ai-coding-dictionary/stateful)**: resolved terms and ADRs are recorded in an owned planning worktree, isolated from the target checkout and other lanes. That worktree stays with the task through the later `to-spec` handoff. An explicit empty change list carries tracker-only settled scope without creating files or inferring ownership from target dirt.

## When to reach for it

You invoke this by typing `/grill-with-docs`; the agent will not reach for it on its own.

Reach for it at the start of a change, in a repo, when the plan is still fuzzy and the words for the thing are not settled yet. It is the single-session tool. Which grilling skill you want depends on what is in front of you:

| What you have | Reach for |
| --- | --- |
| You aren't working in a working directory at all | [grill-me](https://aihero.dev/skills-grill-me) |
| A repo, and a change you can settle in one session | `grill-with-docs` |
| An effort too big to hold in one session (a greenfield build, a large feature) | [wayfinder](https://aihero.dev/skills-wayfinder) |
| A repo with no domain docs at all, and no particular feature in mind | `grill-with-docs`, aimed at the repo rather than a change |
| A decision blocked on knowledge in someone else's head | [to-questionnaire](https://aihero.dev/skills-to-questionnaire) |

The wayfinder split comes down to session count: `/grill-with-docs` for single-session planning, `/wayfinder` for multi-session planning.

## Prerequisites

The skill reads a Git repository; before accepted document writes, the task must own one isolated planning worktree. Resolved terms go to a `CONTEXT.md` glossary inside that worktree, or to the relevant context's `CONTEXT.md` if a `CONTEXT-MAP.md` marks the repo as multi-context. Decisions go to its `docs/adr/`. Both are created lazily; the target checkout is not the writing surface.

It also needs two other skills present: [grilling](https://aihero.dev/skills-grilling) supplies the interview, and [domain-modeling](https://aihero.dev/skills-domain-modeling) supplies the writing discipline. Both receive the same settled scope and, for accepted document writes, the same task, proposed Spec, target, baseline, and worktree identity.

Each permitted dependency loads separately through the host:

- With a generic Skill tool, the agent uses it for the named dependency.
- Without that tool, host-supported named-skill loading reads and follows the required `SKILL.md`; this alone needs no repeated invocation from you.
- Missing or inaccessible content, conflicting source identities, or a host restriction still require the actual limitation to be reported. Loading preserves explicit-only invocation rules and any selected immutable package; a newer local owner is not a substitute. Generic helpers follow the current host catalog.

## The planning lane

One lane belongs to one task, one proposed Spec, and one target. Multiple lanes may use the same target without a shared planning checkout or global workflow lock. A lane-identity mismatch is a Recoverable blocker that reports the lane registry, observed evidence, smallest human action, preserved stages, and the same `/grill-with-docs` retry.

- Accepted document writes stay in the exact registered worktree; preserve it through partial publication and dispose only that clean worktree after successful `to-spec` handoff read-back.
- Read-only design and tracker-only scope use an explicit empty accepted-change list; no worktree is created or retained.

## The paper trail

Three things come out of a session, and they are not equal.

| What resolved | Where it lands |
| --- | --- |
| A term: the project's own word for a thing | `CONTEXT.md`, inline, the moment it resolves |
| A decision that is hard to reverse, surprising without context, and a real trade-off | An ADR under `docs/adr/` |
| Everything else you decided | The conversation, and nowhere else |

That third row is the one that catches people out. `CONTEXT.md` is a glossary and is deliberately kept as one: no implementation details, no spec, no scratch notes. ADRs are gated on all three conditions at once, so most decisions do not qualify and most sessions produce none. A session that yields a sharper glossary and zero ADRs is working as designed, but it means the bulk of what you agreed exists only in the [context window](https://www.aihero.dev/ai-coding-dictionary/context-window) you agreed it in. Hand that same conversation to [to-spec](https://aihero.dev/skills-to-spec) rather than [clearing](https://www.aihero.dev/ai-coding-dictionary/clearing) it.

The glossary is the point. Domain language is the thing this skill is actually building: the project's own words, agreed once, so you, the agent and your colleagues stop paying to re-derive them. It is worth saying that not everyone agrees this buys you agent performance: the sharpest public pushback is that a term and its plain-English expansion get the same result from the [model](https://www.aihero.dev/ai-coding-dictionary/model), and that the vocabulary really compresses communication between the humans who share it. That reading still leaves the glossary valuable; it just moves the value.

## Common questions

**Should I use this or `/wayfinder`?**
Scope decides it. Use this for anything you can settle in one session; use [wayfinder](https://aihero.dev/skills-wayfinder) when the effort is too big to hold in one, and it charts the work as a map of decision [tickets](https://www.aihero.dev/ai-coding-dictionary/ticket) first. Wayfinder is slower and denser, and reaching for it on a well-scoped feature is the common mistake. It does not replace this skill: it can drop into a grilling session for the parts of the map that suit one.

**It ran, but no `CONTEXT.md` and no ADRs appeared.**
Read-only or tracker-only planning can finish with an explicit empty accepted-change list. ADRs need all three gates, and a session with no new vocabulary may have no glossary changes either. If you accepted a qualifying document change, the handoff should identify its path or hunk and content identity in the registered isolated worktree. A missing dependency or lane mismatch must be reported rather than silently dropping that write.

**It asked everything at once, with no recommendations, and never mentioned `CONTEXT.md`.**
That is the skill failing to load one of its two dependencies. Without [grilling](https://aihero.dev/skills-grilling), you get an undifferentiated question dump; without [domain-modeling](https://aihero.dev/skills-domain-modeling), you get a good interview with no paper trail. Partial loading correlates with model and [effort](https://www.aihero.dev/ai-coding-dictionary/effort) level, and it is the most reported problem with this skill. If you suspect it, ask the agent which skills and lane identity it loaded.

**Where did all my other decisions go?**
Into the conversation only. This is the most substantive open complaint about the skill: the glossary is not a spec, most answers do not earn an ADR, and there is no ledger tying each resolved answer through to a spec, a ticket and a test. Precise answers (ordering guarantees, negative requirements, numeric defaults) get softened into weaker prose downstream, and the result can look complete while missing the thing you actually decided. The mitigation available today is to keep the session and feed it straight to [to-spec](https://aihero.dev/skills-to-spec), and to re-read the spec against your own answers rather than assuming it captured them.

**Can I point it at an existing repo that has no docs at all?**
Yes. This is the right skill for a codebase with no ADRs, no domain language and no design principles: invoke it and say "help me document my repo". The community pattern pairs it with [improve-codebase-architecture](https://aihero.dev/skills-improve-codebase-architecture) for building or repairing a `CONTEXT.md`. Expect to steer it: it will read code and ask you about what it finds, and you are the one who says which of the words already in the codebase are the right ones.

**What should I do when the session ends?**
Keep the exact handoff packet in the same conversation: task identity, proposed Spec, target, current baseline, and the accepted-change evidence. Then explicitly run `/to-spec` with that packet; finishing the interview does not invoke it automatically or reopen settled design.

- For read-only or tracker-only work, the packet carries an explicit empty accepted-change list.
- For document writes, it carries the owned worktree and every accepted glossary or ADR path or hunk with its content identity. Your accepted documents remain available through publication or an interrupted handoff.

[to-spec](https://aihero.dev/skills-to-spec) publishes the next command: a Single-Issue Spec continues to `run-issue-workflow`; a Multi-Issue Spec goes through `to-tickets` first.

**Why is it called that?**
Nobody is happy with the name. There is an open suggestion to rename it `grill-domain-model`, which describes the behaviour more honestly. Nothing has moved on it. If a rename ever lands, the docs page moves with it and the URL changes.

## It's working if

- Accepted glossary changes appear *during* the session, term by term; a session with no accepted document changes finishes with an explicit empty list.
- Accepted files change only in the task's isolated planning worktree; the target checkout and other lanes stay untouched.
- The glossary reads as pure vocabulary (your project's words with tight definitions) and contains no implementation detail or spec-like prose.
- Questions the codebase can answer get answered by reading the codebase, not asked of you.
- You get few or no ADRs, and the ones you get are decisions you would be annoyed to have to re-litigate.
- It challenges a word you used because your existing glossary defines it differently.
- The closing message gives you the exact handoff and the later `/to-spec` command.

## Where it fits

`grill-with-docs` is the design head of the main build chain:

```txt
grill-with-docs → to-spec → [to-tickets] → run-issue-workflow → verify-target-before-push → push-target
```

It comes before anything is written down as a spec: it produces the shared understanding and settled vocabulary that [to-spec](https://aihero.dev/skills-to-spec) then synthesises without interviewing you again. Its close neighbours are [grill-me](https://aihero.dev/skills-grill-me), the same interview with no repo and no files, and [domain-modeling](https://aihero.dev/skills-domain-modeling), the glossary-and-ADR discipline it drives; both sit on the [grilling](https://aihero.dev/skills-grilling) primitive. Upstream of it, [wayfinder](https://aihero.dev/skills-wayfinder) charts efforts too large for one session and can hand parts of the map back down to it. When you're unsure which skill or flow fits, [ask-matt](https://aihero.dev/skills-ask-matt) routes you.
