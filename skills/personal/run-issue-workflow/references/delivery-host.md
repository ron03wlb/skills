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

## One round

The runtime task is one JSON object:

```json
{ "facts": "<dag-run-facts:v1>", "cwd": "<project checkout>", "gitCommonDir": "...", "at": "<ISO instant>", "stageId": "delivery" }
```

Add `"blockedHostRun": null` to declare a fresh run that must not look for a prior host run, and
`"recorded": [...]` to assert the recorded operations yourself.

- `facts` is the reconciled `dag-run-facts:v1` input. `inputPath` may point at the same evidence in a
  file instead of inlining it.
- `recorded` lists the host operations the run already materialized, in recorded order. When the
  controller reads a blocked host run back itself, that run's recorded operations supply this list; a
  round that also names an explicit empty `recorded` is refused rather than allowed to discard them.
  An explicit non-empty `recorded` is authoritative.
- `blockedHostRun` is a prior host run read back for convergence, or `null` on a fresh run. When the
  field is absent and `cwd` names the project checkout, the controller reads the prior host run back
  itself; more than one candidate is an ambiguity it refuses rather than guesses.

The controller returns `{ control, analysis, refs }`. `control.status` is `dispatched`, `idle`,
`terminal`, `awaiting_entry`, `superseded`, or `blocked`. The entry performs every item in
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
stopping, idle, or terminal it returns no action, and the round reports `idle` or `terminal` and
dispatches nothing.

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
