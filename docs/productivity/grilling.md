## What it does

`grilling` stress-tests a plan, decision, or idea by resolving unresolved material decisions within the agreed scope. A caller can supply a **decision aperture**: the subset that must reach you. The [agent](https://www.aihero.dev/ai-coding-dictionary/agent) resolves reversible choices outside it from evidence, while reserved, costly and irreversible decisions still come to you.

Each round contains only human questions whose prerequisites are already settled: the current **frontier**. Once decisions and required evidence are settled, you receive one summary with their bases and assumptions. Already settled choices need no blanket reconfirmation; an explicit request for your review still applies. Silence is not agreement or approval.

## When to reach for it

Type `/grilling`, or the agent reaches for it automatically when a task fits — this is the underlying primitive, not a user-only entry point.

Reach for it when a plan or design still has material uncertainties you want surfaced before acting. Its two wrappers shape the [session](https://www.aihero.dev/ai-coding-dictionary/session):

- For a plain interview, use [grill-me](https://aihero.dev/skills-grill-me).
- To record accepted glossary or ADR changes in a codebase, use [grill-with-docs](https://aihero.dev/skills-grill-with-docs).

## Decide or ask

| Situation | What happens |
| --- | --- |
| An applicable accepted decision or consistent convention settles the choice | Reuse it and cite its source |
| The goal is clear and the reversible choice sits outside a supplied aperture | Choose directly, explain the evidence and reversal, and identify the delegated basis |
| No aperture was supplied and business meaning remains unclear | Ask the smallest question that resolves it |
| Evidence cannot settle a choice reserved by the aperture | Prepare its effects and recommendation, then ask |
| A proposal adds scope, permission, or a costly commitment | Prepare its effect and recommendation, then ask only for missing approval |
| Any SQL adjustment, including an embedded read query or local SQL file | Derive the details, ask once for a coherent exact change set, then prepare and validate approved SQL before dependent implementation |

Reversibility is about consequences: reverting code does not undo data damage or a commitment made to another system. SQL preparation does not grant permission to apply it to a database. Read-only inspection of existing SQL needs no adjustment approval.

## The decision tree

The **decision tree** tracks material decisions and their dependencies inside the agreed scope. The decision aperture filters its ready frontier into delegated choices and a human frontier; it does not remove design work. Independent human questions can share a concise round with recommendations, while dependent questions wait. A pending fact lookup or human answer holds only dependent work. An empty ready frontier while material decisions await evidence is not completion.

Accepted decisions remain settled on continuation and re-entry. A decision returns to the frontier only when new evidence invalidates its basis; the agent identifies that evidence and the affected decision. Unrelated hypothetical branches do not extend the interview.

An explicit user or caller pacing limit still applies. `grill-with-docs` adds scoped document writes and a planning handoff; it does not force independent decisions into separate rounds.

## Pulled out on purpose

`grilling` is the **single source of truth** for the interview technique, split out as a [model](https://www.aihero.dev/ai-coding-dictionary/model)-invoked **primitive** so every skill that needs an interview can reach it instead of reinventing one. [grill-me](https://aihero.dev/skills-grill-me) and [grill-with-docs](https://aihero.dev/skills-grill-with-docs) are its two user-invoked front doors, but [improve-codebase-architecture](https://aihero.dev/skills-improve-codebase-architecture) and [triage](https://aihero.dev/skills-triage) also lean on it to pressure-test their own decisions.

Keeping the technique in one place means you can also reach for it directly when you just want the interview — without the ADR-writing or [ticket](https://www.aihero.dev/ai-coding-dictionary/ticket)-shaping that its wrappers add on top.

For an Issue workflow, the decision tree includes actual installation, task/message, local integration/cleanup and tracker permissions. The agent prepares concrete operations and looks up host capabilities before asking once for missing approval. Declared SQL brings environment, effect, rights, operator, recovery and outcome validation into planning; no SQL is recorded as N/A. Later leaves reuse unchanged decisions and scoped approvals. A settled design grants no new execution scope and leaves operation permissions and Manual prerequisite requirements intact.

## It's working if

- A routine or outside-aperture design can finish without a question, with the chosen approach and its evidence visible.
- A [turn](https://www.aihero.dev/ai-coding-dictionary/turn) that needs your decision gives a concrete recommendation and explains why your input is missing.
- Later questions follow the dependencies created by answers already settled.
- Accepted decisions stay settled unless the agent identifies new evidence that invalidates them.
- Facts available from the [environment](https://www.aihero.dev/ai-coding-dictionary/environment) are investigated before you are asked.
- A multi-part SQL proposal comes to you as one exact change set before the artifact is edited, and previously approved adjustments are not asked again without a changed scope or basis.
- The closing summary distinguishes human decisions from delegated choices and preserves the next step's actual authority.

## Where it fits

`grilling` is the interview **primitive** under the main build chain: [grill-with-docs](https://aihero.dev/skills-grill-with-docs) runs it to sharpen [context](https://www.aihero.dev/ai-coding-dictionary/context) before [to-spec](https://aihero.dev/skills-to-spec) writes the [spec](https://www.aihero.dev/ai-coding-dictionary/spec). When you're unsure which entry point fits, [ask-matt](https://aihero.dev/skills-ask-matt) routes you.
