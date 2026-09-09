## What it does

`grilling` stress-tests a plan, decision, or idea by resolving unresolved material decisions within the agreed scope. Its decision tree contains questions that could change product behavior, scope, authority, or material risk; routine implementation details follow source and existing conventions.

Each round contains only material questions whose prerequisites are already settled: the current **frontier**. The [agent](https://www.aihero.dev/ai-coding-dictionary/agent) looks up available facts and recommends an answer for each decision. Once all material decisions are settled, it asks you to confirm the shared understanding before acting. Silence is not agreement or approval.

## When to reach for it

Type `/grilling`, or the agent reaches for it automatically when a task fits — this is the underlying primitive, not a user-only entry point.

Reach for it when a plan or design still has material uncertainties you want surfaced before acting. Its two wrappers shape the [session](https://www.aihero.dev/ai-coding-dictionary/session):

- For a plain interview, use [grill-me](https://aihero.dev/skills-grill-me).
- To record accepted glossary or ADR changes in a codebase, use [grill-with-docs](https://aihero.dev/skills-grill-with-docs).

## The decision tree

The **decision tree** tracks material decisions and their dependencies inside the agreed scope. After you answer a round, `grilling` recomputes the frontier. A pending background fact-finding task holds only the decisions that depend on it; other ready questions can proceed. An empty ready frontier while material decisions await evidence is not completion.

Accepted decisions remain settled on continuation and re-entry. A decision returns to the frontier only when new evidence invalidates its basis; the agent identifies that evidence and the affected decision. Unrelated hypothetical branches do not extend the interview.

The calling skill can narrow the round:

- [grill-me](https://aihero.dev/skills-grill-me) uses the full available frontier.
- [grill-with-docs](https://aihero.dev/skills-grill-with-docs) keeps its explicit limit of one material decision at a time while recording accepted domain changes.

## Pulled out on purpose

`grilling` is the **single source of truth** for the interview technique, split out as a [model](https://www.aihero.dev/ai-coding-dictionary/model)-invoked **primitive** so every skill that needs an interview can reach it instead of reinventing one. [grill-me](https://aihero.dev/skills-grill-me) and [grill-with-docs](https://aihero.dev/skills-grill-with-docs) are its two user-invoked front doors, but [improve-codebase-architecture](https://aihero.dev/skills-improve-codebase-architecture) and [triage](https://aihero.dev/skills-triage) also lean on it to pressure-test their own decisions.

Keeping the technique in one place means you can also reach for it directly when you just want the interview — without the ADR-writing or [ticket](https://www.aihero.dev/ai-coding-dictionary/ticket)-shaping that its wrappers add on top.

For an Issue workflow, the decision tree includes actual installation, task/message, local integration/cleanup and tracker permissions. The agent prepares concrete operations and looks up host capabilities before asking once for missing approval. Declared SQL brings environment, effect, rights, operator, recovery and outcome validation into planning; no SQL is recorded as N/A. Later leaves reuse unchanged decisions and scoped approvals. Final confirmation grants no new scope and leaves actual permission and Manual prerequisite requirements intact.

## It's working if

- Each [turn](https://www.aihero.dev/ai-coding-dictionary/turn) numbers the currently answerable questions and recommends an answer for each, within the calling skill's decision limit.
- Later questions follow the dependencies created by answers already settled.
- Accepted decisions stay settled unless the agent identifies new evidence that invalidates them.
- Facts available from the [environment](https://www.aihero.dev/ai-coding-dictionary/environment) and routine repository choices are resolved from evidence; material decisions still come back to you.
- Once the material decisions are settled, you see a final confirmation instead of questions about unrelated possibilities.
- No implementation starts until you confirm the shared understanding.

## Where it fits

`grilling` is the interview **primitive** under the main build chain: [grill-with-docs](https://aihero.dev/skills-grill-with-docs) runs it to sharpen [context](https://www.aihero.dev/ai-coding-dictionary/context) before [to-spec](https://aihero.dev/skills-to-spec) writes the [spec](https://www.aihero.dev/ai-coding-dictionary/spec). When you're unsure which entry point fits, [ask-matt](https://aihero.dev/skills-ask-matt) routes you.
