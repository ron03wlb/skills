# Delivery host contract

`/run-issue-workflow <Spec-ID>` remains the sole Start and re-entry authority. Its delivery host is the
pi-workflow bundle at `workflows/deliver-tracker-spec/` inside this skill package. The bundle owns
scheduling facts and durable run records only: it never decides scope, grants, budgets, retries, repair
routing, close eligibility, or stop classification.

This contract owns reducer-action materialization on the pi-workflow substrate. While the Codex-native
coordinator is still present, [the coordinator lifecycle](coordinator-lifecycle.md) describes that
separate substrate; where the two describe the same reducer action, this page governs the delivery host
and the coordinator lifecycle governs only the retired path until Issue 102 removes it.

## Bundle

- `spec.json` — one `dynamic` stage with `uses: "./helpers/controller.mjs"` and an explicit read/write
  policy: `defaults.readOnly: false` with the declared tool ceiling. Every declared ref is a `./` path
  inside the bundle directory. Its only budget is `maxConcurrency: 3`, the host expression of the
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

Validate and launch by path:

```text
/workflow validate <skill>/workflows/deliver-tracker-spec/spec.json
/workflow run <skill>/workflows/deliver-tracker-spec/spec.json "<round JSON>"
```

Trusted controller code reaches the domain through two Node imports beside the bundle directory:
`scripts/pi-workflow-host.mjs` (the domain half of the host) and, through it,
`scripts/delivery-authority.mjs` (the bundle-local authority entry). Neither is a pi-workflow ref: every
declared ref (`uses`, `helpers`, `workflows`) is a `./` path inside the bundle directory. The enforced
import rule is narrower than "nobody else may import the entry": production modules of this package may
import `delivery-authority.mjs`, but they may not import one of the owner modules inside its closure
directly.

## The Issue lane

One executable Issue owns exactly one lane: one isolated worker and one dedicated Issue worktree. The
bundle declares `defaults.worktreePolicy: "on"`, so every generated lane task runs in its own managed
worktree, and the shared checkout stays read-only apart from ordinary worktree registration.

The lane's worker is the agent named by `defaults.agent` (shipped here as `agents/worker.md`). pi-workflow
resolves a generated agent name only from the project `.pi/agents/` directory, the user agent root, or
its own bundled agents, so a delivery repository or user agent root must provide that definition. The
controller proves resolution before it materializes any lane and otherwise stops with
`lane_agent_unresolved`, naming both roots and this canonical source.

For each planned lane the domain half decides exactly one action from the observed lane evidence:

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
`dispatch.recorded` for the same lane, and the host run is resumed rather than re-dispatched. A
replacement carries a `retry.recorded` supersession link whose authorized task reference is exactly the
lane the host then materializes. A close lane owns close authority rather than a dispatch attempt, so it
carries no new dispatch reservation.

A lane's tools are always a subset of the declared ceiling and of the ceiling its agent definition
declares for itself. Its prompt invokes exactly one contract skill — an implementation lane never
closes, and a close lane never implements — so no worker can grant itself scope, a DAG Run Grant, or
close authority.

## One round

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

## The reducer owns the actions

Each legal action from the reducer becomes exactly one materialization with a deterministic id, so a
resumed host run re-issues a recorded operation rather than dispatching a second one:

| Reducer action | Materialization |
| --- | --- |
| `dispatch_issue`, `recover_issue`, `repair_issue`, `upgrade_issue` | one generated `worker` task that follows `execute-issue` |
| `close_issue`, `close_parent` | one generated `worker` task that follows `close-issue` |
| `wait_repository_close_lease`, `wait_target_writer` | a host-side bounded wait on the reducer's own `timeoutMs`, attributed to the reducer's own lease owner and consuming no generated agent |
| `settle_pause`, `settle_stop` | a domain-owned `pause.transitioned` / `stop.transitioned` journal append |
| `reconcile_run`, `remediate_environment` | handed back to the entry as `pendingOperations`; the bundle has no reconciliation or environment adapter and does not invent one |

A generated task's tools are always a subset of the declared ceiling, and no lane borrows authority
from its agent name alone.

An empty action set is not by itself a failure. When the reducer has classified the Run as paused,
stopping, idle, or terminated it returns no action, and the round reports `idle` or `terminal` and
dispatches nothing. A Run the reducer classifies `BLOCKED` with no legal action reports `blocked` with
reason `blocked_run` — unless blocked-run convergence has just decided `CONTINUE_SAME_RUN`, in which
case the round reports `idle` and the entry resumes the same host run.

The round reports `blocked` and dispatches nothing when the reducer returns a contradictory action set,
when an action cannot be materialized, when a re-issued operation changed its recorded request shape or
its recorded order, when a settled operation recurs, when a newer dispatch would bypass an unsettled
recorded attempt, or when a dispatch attempt is not accounted by the journal. It never escapes a
contradiction by opening a second host run, and the re-issue proof only governs a round that actually
materializes something: an idle or blocked round dispatches nothing.

## Blocked-run convergence

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
