# Delivery host contract

`/run-issue-workflow <Spec-ID>` remains the sole Start and re-entry authority. Its delivery host is split
into an authority layer that decides and replaceable execution material that performs: execution material
owns the Run's scheduling, durable task records, and Issue worker lifecycle only as the authority layer
authorizes, and no single materialization is required. The delivery path materializes one native subagent
lane per authorized action, and the `pi-workflow` bundle stays one optional materialization of the same
facts.

This contract owns reducer-action materialization. The Codex-native coordinator was removed with the host
boundary in Issue 102; [the coordinator lifecycle](coordinator-lifecycle.md) keeps only its retired
compact-outcome and no-repair boundaries for historical reconciliation. This page governs the delivery
host everywhere the two once overlapped.

## The authority layer

The authority layer decides every legal action and owns every authority fact:

- The **Domain action reducer** computes the one legal action set from reconciled tracker, Git, worktree,
  completion, and journal evidence. It never invents, reorders, or reclassifies an action, and no
  materialization substitutes a decision the reducer did not return.
- The per-Run journal owns grants, control revisions, dispatch-attempt references, execution budgets,
  bounded-remediation records, closeout-wait observations, and pause or stop transitions.
- The **Issue lane** guards own one lane per executable Issue: the tool and prompt scope checks, the
  recorded dispatch reservation that makes a lost launch response readable, and the supersession draft a
  replacement carries.
- The leaves keep their own contracts. `execute-issue` owns its Issue worktree, verification, independent
  review, and candidate; `close-issue` alone acquires the repository close lease and then the target
  mutation writer.
- `scripts/pi-workflow-host.mjs` plans exactly the legal actions the Domain action reducer returns, and
  `scripts/run-authority-adapters.mjs` reduces the tracker, reconciliation, target, checkpoint, handoff,
  and writer facts that planning reads. `scripts/issue-lane.mjs` holds the lane decision and its scope
  checks. None of them replaces a leaf contract.

The authority layer invents no delivery budget. `max_parallel` keeps its preserved default of three, and
the journal-owned six-hour per-Issue execution budget stays with its owner.

## The execution material

Execution material is replaceable. On the delivery path it is one native subagent lane per authorized
action: one isolated `worker` child in its own managed Issue worktree, whose prompt invokes exactly one
contract skill. Every materialization carries the same obligations:

- Journal the dispatch reservation before the lane exists, so a lost launch response reads the lane back
  instead of creating a second one.
- Derive lane liveness and completion from the lane's own run record, the tracker completion note, and Git
  state. A materialization whose only delivery evidence is a raw artifact publication is not lane
  evidence.
- Materialize only the actions the reducer returned, each with a deterministic id, so a resumed Run
  re-issues a recorded operation rather than dispatching a second one.
- Hand every fact it does not own back to its owner instead of guessing it, and never decide scope,
  grants, budgets, retries, repair routing, close eligibility, or stop classification.

Materialization adds no budget of its own: it never restates the journal-owned six-hour per-Issue budget
as its own wall-clock cap, so healthy close contention may still exceed twelve hours. It must also be
able to settle a mutation-capable lane in its own managed worktree, because a lane that finishes its work
without a settled terminal outcome can never be closed; readiness reads that capability as a required
surface (`scripts/lane-settlement-capability.mjs`).

## The Issue lane

One executable Issue owns exactly one lane: one isolated worker and one dedicated Issue worktree. Every
lane runs in its own managed worktree, so the shared checkout stays read-only apart from ordinary
worktree registration.

The lane's worker is the agent shipped here as `agents/worker.md`. A materialization resolves that worker
from the roots its own harness searches and proves the resolution before it materializes any lane, so a
delivery repository or user agent root must provide the definition. An unresolved worker stops with
`lane_agent_unresolved`, naming the roots searched and this canonical source.

For each planned lane the authority layer decides exactly one action from the observed lane evidence:

| Observed lane | Decision |
| --- | --- |
| none, no creation intent | `CREATE` — an implementation lane journals its dispatch reservation before native delivery |
| none, a reserved creation intent | stop `creation_intent_unresolved` — a lost response is read back, never re-created |
| one `RESUMABLE` lane at this attempt, journaled | `REUSE` — the recorded request is the reservation; an unjournaled re-use stops |
| one `RESUMABLE` lane one attempt behind | `RESUME` — the retry is accounted with `replacement: null` and the same lane is resumed |
| one `ACTIVE` lane | `OBSERVE` — an active lane is never re-dispatched or replaced |
| one `INACTIVE` lane with exact inactive evidence | `REPLACE` — the supersession link is journaled first |
| one `INACTIVE` lane without evidence or without a prior attempt, one `UNKNOWN` lane, one lane that cannot account the planned attempt, or two observed lanes | stop |

Every new implementation lane journals one `dispatch.recorded` attempt reference before the worker
exists, so a lost creation response, a restart, or a retry cannot produce a second lane and no attempt
goes uncounted. A transient retry journals `retry.recorded` with `replacement: null` and a
`dispatch.recorded` for the same lane, and the same lane is resumed rather than re-dispatched. A
replacement carries a `retry.recorded` supersession link whose authorized task reference is exactly the
lane the materialization then launches. A close lane owns close authority rather than a dispatch attempt,
so it carries no new dispatch reservation.

A lane's tools are always a subset of the declared ceiling and of the ceiling its agent definition
declares for itself. Its prompt invokes exactly one contract skill — an implementation lane never
closes, and a close lane never implements — so no worker can grant itself scope, a DAG Run Grant, or
close authority.

## One lane per authorized action

Each legal action from the reducer becomes exactly one lane with a deterministic id, so a resumed Run
re-issues a recorded operation rather than dispatching a second one:

| Reducer action | Materialization |
| --- | --- |
| `dispatch_issue`, `recover_issue`, `repair_issue`, `upgrade_issue` | one native lane whose worker follows `execute-issue` |
| `close_issue`, `close_parent` | one native lane whose worker follows `close-issue` |
| `wait_repository_close_lease`, `wait_target_writer` | an authority-side bounded wait on the reducer's own `timeoutMs`, attributed to the reducer's own lease owner and consuming no lane |
| `settle_pause`, `settle_stop` | a domain-owned `pause.transitioned` / `stop.transitioned` journal append |
| `reconcile_run`, `remediate_environment` | handed back to the entry as `pendingOperations`; execution material has no reconciliation or environment adapter and does not invent one |

A lane's tools are always a subset of the declared ceiling, and no lane borrows authority from its agent
name alone.

An empty action set is not by itself a failure. When the reducer has classified the Run as paused,
stopping, idle, or terminated it returns no action, and materialization launches nothing. A Run the
reducer classifies `BLOCKED` with no legal action stops with reason `blocked_run` — unless blocked-run
convergence has just decided `CONTINUE_SAME_RUN`, in which case the same Run resumes its recorded
operations and launches no new lane.

Materialization stops and launches nothing when the reducer returns a contradictory action set,
when an action cannot be materialized, when a re-issued operation changed its recorded request shape or
its recorded order, when a settled operation recurs, when a newer dispatch would bypass an unsettled
recorded attempt, or when a dispatch attempt is not accounted by the journal. It never escapes a
contradiction by opening a second run, and the re-issue proof only governs materialization that actually
performs something: an empty or refused action set launches nothing.

## Optional materialization: the `pi-workflow` bundle

`@gwab/pi-workflow` is one optional materialization of these same facts, never a requirement. ADR-0080
retired it from the delivery path because `@gwab/pi-workflow@0.13.8` could not settle a mutation-capable
managed-worktree lane — `establishRawOwner` requires `realpath(task.cwd) === project` while its worktree
module makes the worktree `task.cwd` and its dynamic generated-task runtime forces that worktree for any
non-read-only capability — so an implemented, verified, committed Issue could still never settle, and
[Agwab/pi-workflow#16](https://github.com/AgwaB/pi-workflow/issues/16) records the defect
(`docs/agents/pi-workflow-fit-evidence.md`, AC-2). It may be re-adopted without changing the journal,
the reducer, or the Grant. While a repository still selects it, this section describes its transport.

### Bundle

- `deliver-tracker-spec.json` — one `dynamic` stage with `uses:
  "./workflows/deliver-tracker-spec/helpers/controller.mjs"` and an explicit read/write policy:
  `defaults.readOnly: false` with the declared tool ceiling. The launch spec sits at the package root,
  which is the bundle root `pi-workflow` enforces, and every declared ref is a `./` path inside it. Its only budget is `maxConcurrency: 3`, the host expression of the
  preserved `max_parallel` default; every other host resource limit keeps pi-workflow's own default, so
  the bundle never invents a delivery budget and never restates the journal-owned six-hour per-Issue
  budget as a stage wall-clock cap. Healthy close contention may therefore exceed twelve hours.
- `helpers/controller.mjs` — the trusted controller. It is transport only: it reads one reconciled
  round, asks `scripts/pi-workflow-host.mjs` what the Domain action reducer authorizes, and materializes
  exactly that.
- `helpers/round-input.mjs` — validates the runtime task (one JSON object, optionally pointing at a
  round-input file). When the round does not name a blocked host run and supplies the project checkout,
  it calls the reader itself and refuses an ambiguous match.
- `helpers/host-runs.mjs` — reads pi-workflow run records back for one Spec and target. The selected
  host run comes with its recorded operations in recorded order (`recordedFromRunRecord`), so the
  re-issue proof runs against exactly what the blocked run already owns.
- `helpers/lane-agent.mjs` — proves the lane's worker agent resolves from the roots pi-workflow itself
  searches, and reads that agent's own declared tool ceiling.
- `scripts/issue-lane.mjs` (beside this bundle) — the one-lane-per-Issue decision, the tool and prompt
  scope checks, and the supersession draft a replacement carries.

This bundle materializes its lanes through `defaults.worktreePolicy: "on"` and the agent named by
`defaults.agent` (shipped here as `agents/worker.md`). pi-workflow resolves a generated agent name only
from the project `.pi/agents/` directory, the user agent root, or its own bundled agents, so the
controller proves resolution before it materializes any lane and otherwise stops with
`lane_agent_unresolved`, naming both roots and this canonical source.

Validate and launch by path:

```text
/workflow validate <skill>/deliver-tracker-spec.json
/workflow run <skill>/deliver-tracker-spec.json "<round JSON>"
```

Trusted controller code reaches the domain through two Node imports beside the stage directory:
`scripts/pi-workflow-host.mjs` (the domain half of the host) and, through it,
`scripts/delivery-authority.mjs` (the bundle-local authority entry). `pi-workflow` refuses a launched
bundle whose module graph escapes the directory holding its spec, and that graph reaches `scripts/` and
`agents/`, so the bundle root is the package root: the launch spec lives there and its one declared stage
names `./workflows/deliver-tracker-spec/helpers/controller.mjs`. The enforced import rule is narrower than
"nobody else may import the entry": production modules of this package may import `delivery-authority.mjs`,
but they may not import one of the owner modules inside its closure directly.

### One round

The runtime task is one JSON object:

```json
{
  "facts": "<dag-run-facts:v1>",
  "cwd": "<project checkout>",
  "homeDir": "<user home, for lane agent resolution>",
  "gitCommonDir": "...",
  "at": "<ISO instant>",
  "stageId": "delivery",
  "lanes": { "observed": [], "creationIntents": [] }
}
```

Add `"blockedHostRun": null` to declare a fresh run that must not look for a prior host run, and
`"recorded": [...]` to assert the recorded operations yourself. `lanes.observed` lists the lanes the host
run record already owns, and `lanes.creationIntents` the reserved creations whose native response is not
yet proven.

- `facts` is the reconciled `dag-run-facts:v1` input. `inputPath` may point at the same evidence in a
  file instead of inlining it.
- `recorded` lists the host operations the run already materialized, in recorded order. When the
  controller reads a blocked host run back itself, that run's recorded operations supply this list; a
  round that also names an explicit empty `recorded` is refused rather than allowed to discard them.
  An explicit non-empty `recorded` is authoritative.
- `blockedHostRun` is a prior host run read back for convergence, or `null` on a fresh run. When the
  field is absent and `cwd` names the project checkout, the controller reads the prior host run back
  itself; more than one candidate is an ambiguity it refuses rather than guesses.

The controller returns `{ control, analysis, refs }`. `control.status` is `dispatched` when it
materialized lanes, `idle` when the round has no legal action, `terminal` for a finished Run,
`resume_same_run` when a transient retry reuses a recorded lane and the host run must be resumed,
`awaiting_entry` when the entry owes a host step, `superseded` for a journaled new host run, and
`blocked` with a `stopCode` when a domain owner refused the round. The entry performs every item in
`control.pendingOperations` before the next round; the projection is never authority.

### Blocked-run convergence

When a host run for this Spec and target is no longer terminal, the controller reads it back with
`helpers/host-runs.mjs` and hands it to the domain half as `blockedHostRun`. A host run is only
`DIVERGED` when its own record proves the host replay-invariant failure (`dynamic agent request
changed`); an ordinary `failed` run stays replayable, and an `interrupted` run is `UNKNOWN`. The domain
half then decides:

- `NO_ACTION` — the host run is already terminal.
- `CONTINUE_SAME_RUN` — the host run can re-issue its recorded operations in order; resume it.
- `NEW_RUN` — the host run cannot be replayed. The controller first appends exactly one
  `run.superseded` event to the authority journal whose `supersededHostRunId` is the blocked
  pi-workflow host run identity (deliberately not this journal's logical DAG Run id), then returns
  `status: "superseded"` and dispatches nothing. The journal event is the authority fact that proves the
  superseding host run did not re-dispatch an attempt the blocked run already owned; the control
  projection carries only the journal sequence.
- `STOP` — evidence contradicts itself or an attempt is unaccounted. The lane is preserved and the
  human repairs the owning source before re-running the same command.

Zero matching host runs select none, and more than one is an ambiguity the entry must resolve rather
than guess.

## Cutover and measurement evidence

The substrate cutover read-back, the carried Issue #91 recovery/delivery matrix, the per-phase
measurement ontology, and the bounded reproducible-evidence report are published in
[the delivery measurement reference](delivery-measurement.md).
