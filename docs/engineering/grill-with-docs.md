## What it does

`grill-with-docs` binds one proposed [Spec](https://www.aihero.dev/ai-coding-dictionary/spec) and target to the current task, then runs a **boundary-first** interview. The [agent](https://www.aihero.dev/ai-coding-dictionary/agent) asks about persistence boundaries, major directions and costly commitments, while ordinary business and implementation details follow project evidence or suitable established practice. Only accepted glossary or ADR writes require an isolated planning worktree.

Accepted decisions are **[stateful](https://www.aihero.dev/ai-coding-dictionary/stateful)**: resolved terms and ADRs are recorded in an owned planning worktree, isolated from the target checkout and other lanes. Each decision retains its inherited, human-confirmed, or delegated basis and source. The worktree stays with the task through the later `to-spec` handoff. An explicit empty change list carries tracker-only settled scope without creating files or inferring ownership from target dirt.

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

The skill reads a Git repository; before accepted document writes, the task must own one isolated planning worktree. Resolved terms go to a `CONTEXT.md` glossary inside that worktree, or to the relevant context's glossary if a `CONTEXT-MAP.md` exists. ADRs follow the project's location and format, falling back to `docs/adr/`. Files are created lazily; the target checkout is not the writing surface.

It also needs two other skills present: [grilling](https://aihero.dev/skills-grilling) supplies the interview, and [domain-modeling](https://aihero.dev/skills-domain-modeling) supplies the writing discipline. Both receive the same settled scope and, for accepted document writes, the same task, proposed Spec, target, baseline, and worktree identity.

Each permitted dependency loads separately through the host:

- With a generic Skill tool, the agent uses it for the named dependency.
- Without that tool, host-supported named-skill loading reads and follows the required `SKILL.md`; this alone needs no repeated invocation from you.
- Missing or inaccessible content, conflicting source identities, or a host restriction still require the actual limitation to be reported. Loading preserves explicit-only invocation rules and any selected immutable package; a newer local owner is not a substitute. Generic helpers follow the current host catalog.

## The planning lane

One lane belongs to one task, one proposed Spec, and one target. Multiple lanes may use the same target without a shared planning checkout or global workflow lock. A lane-identity mismatch is a Recoverable blocker that reports the lane registry, observed evidence, smallest human action, preserved stages, and the same `/grill-with-docs` retry.

- Accepted document writes stay in the exact registered worktree; preserve it through partial publication and dispose only that clean worktree after successful `to-spec` handoff read-back.
- Read-only design and tracker-only scope use an explicit empty accepted-change list; no worktree is created or retained.

## The boundary-first interview

The skill still maps the whole design, but its decision aperture controls what reaches you:

| Choice | Handling |
| --- | --- |
| Create, split or merge a table; change ownership, aggregate, system-of-record, destructive lifecycle or migration boundaries | Ask when evidence cannot settle it |
| Set a major module, system, external-contract, trust or authorization direction | Ask when evidence cannot settle it |
| Add scope, operation permission, or a costly or irreversible commitment | Ask for the missing decision or approval |
| Choose ordinary business or implementation detail inside settled boundaries | Follow explicit decisions, project contracts, source conventions, then suitable established practice |
| Prepare SQL columns, types, indexes, queries, bindings and validation | Derive the details, then ask once for the coherent exact change set before editing SQL |

Multiple plausible answers alone do not create a question. Delegated defaults retain their basis, reversal and verification assumptions in the handoff.

## The paper trail

The recording destination follows the kind of decision, independently of whether you needed to approve it.

| What resolved | Where it lands |
| --- | --- |
| A term: the project's own word for a thing | `CONTEXT.md`, inline, the moment it resolves |
| A decision whose rationale has lasting value, including a reversible trade-off | An ADR using the project's conventions |
| Routine adoption of an existing convention | A reference to that convention |
| Exact behavior, numeric defaults, exclusions, and verification needs | The settled scope in the handoff, then the Spec |

`CONTEXT.md` stays a glossary. Related decisions can share one ADR; routine choices need no new file. The visible handoff carries requirements that do not belong in an ADR so a later [to-spec](https://aihero.dev/skills-to-spec) invocation can retain their exact meaning.

SQL adjustments need prior approval even when the change is a local file or an embedded read query. The agent first inspects the current design and presents the proposed effect, then prepares and validates the approved SQL before dependent application implementation. Independent work can continue. Database execution retains its own permissions and any declared Manual prerequisite process.

## Common questions

**Should I use this or `/wayfinder`?**
Scope decides it. Use this for anything you can settle in one session; use [wayfinder](https://aihero.dev/skills-wayfinder) when the effort is too big to hold in one, and it charts the work as a map of decision [tickets](https://www.aihero.dev/ai-coding-dictionary/ticket) first. Wayfinder is slower and denser, and reaching for it on a well-scoped feature is the common mistake. It does not replace this skill: it can drop into a grilling session for the parts of the map that suit one.

**It ran, but no `CONTEXT.md` and no ADRs appeared.**
Read-only or tracker-only planning can finish with an explicit empty accepted-change list. A session that only reuses existing conventions may need no new documents. A qualifying decision within the delegated writing scope is recorded directly, and the handoff identifies its path or hunk and content identity in the registered isolated worktree.

**It asked everything at once, with no recommendations, and never mentioned `CONTEXT.md`.**
That is the skill failing to load one of its two dependencies. Without [grilling](https://aihero.dev/skills-grilling), you get an undifferentiated question dump; without [domain-modeling](https://aihero.dev/skills-domain-modeling), you get a good interview with no paper trail. Partial loading correlates with model and [effort](https://www.aihero.dev/ai-coding-dictionary/effort) level, and it is the most reported problem with this skill. If you suspect it, ask the agent which skills and lane identity it loaded.

**Where did all my other decisions go?**
The handoff carries exact non-ADR requirements, including ordering, negative requirements, numeric defaults, and verification assumptions. `to-spec` preserves those in the Spec and retains each decision's basis. The packet is visible conversation content, so carry it into a new task explicitly; it is not a hidden persistent ledger.

**Can it finish without asking me to approve every choice?**
Yes. Ordinary business and implementation details inside settled boundaries follow evidence and delegated authority, even when several plausible answers exist. You receive their reasoning and one closing handoff without a second confirmation. Boundary choices that evidence cannot settle, missing scope or permission, and costly commitments still require a concrete question. SQL comes as one exact change-set approval. An explicit request for your review still applies.

**Why is it still asking me implementation-level questions?**
It should not ask merely because two detailed implementations are plausible. Check whether the choice changes a persistence, ownership, system, contract, trust or authorization boundary, or creates a costly commitment. If it does not, the skill should choose from project evidence or established practice and record the default in the handoff.

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
- Ordinary details inside settled boundaries appear as delegated defaults rather than questions.
- Durable rationale is recorded directly in your project's ADR format, with the decision's actual basis visible.
- It challenges a word you used because your existing glossary defines it differently.
- The closing message gives you the exact handoff and the later `/to-spec` command.
- Independent boundary questions can share a round; a design with only delegated details needs no approval round.

## Where it fits

`grill-with-docs` is the design head of the main build chain:

```txt
grill-with-docs → to-spec → [to-tickets] → run-issue-workflow → verify-target-before-push → push-target
```

It comes before anything is written down as a spec: it produces the shared understanding and settled vocabulary that [to-spec](https://aihero.dev/skills-to-spec) then synthesises without interviewing you again. Its close neighbours are [grill-me](https://aihero.dev/skills-grill-me), the same interview with no repo and no files, and [domain-modeling](https://aihero.dev/skills-domain-modeling), the glossary-and-ADR discipline it drives; both sit on the [grilling](https://aihero.dev/skills-grilling) primitive. Upstream of it, [wayfinder](https://aihero.dev/skills-wayfinder) charts efforts too large for one session and can hand parts of the map back down to it. When you're unsure which skill or flow fits, [ask-matt](https://aihero.dev/skills-ask-matt) routes you.
