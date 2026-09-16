# Delivery host contract

`/run-issue-workflow <Spec-ID>` remains the sole Start and re-entry authority. Its delivery host is the
pi-workflow bundle at `workflows/deliver-tracker-spec/` inside this skill package. The bundle owns
scheduling facts and durable run records only: it never decides scope, grants, budgets, retries, repair
routing, close eligibility, or stop classification.

## Bundle

- `spec.json` — one `dynamic` stage with `uses: "./helpers/controller.mjs"` and an explicit read/write
  policy: `defaults.readOnly: false` with the declared tool ceiling. Every declared ref is a `./` path
  inside the bundle directory.
- `helpers/controller.mjs` — the trusted controller. It is transport only: it reads one reconciled
  round, asks `scripts/pi-workflow-host.mjs` what the Domain action reducer authorizes, and materializes
  exactly that.
- `helpers/round-input.mjs` — validates the runtime task (one JSON object, optionally pointing at a
  round-input file) and reads the recorded host operations back from a run record.
- `helpers/host-runs.mjs` — reads pi-workflow run records back for one Spec and target.

Validate and launch by path:

```text
/workflow validate <skill>/workflows/deliver-tracker-spec/spec.json
/workflow run <skill>/workflows/deliver-tracker-spec/spec.json "<round JSON>"
```

The bundle loads the authority surface through `scripts/delivery-authority.mjs`. Its only outward
reference is that bundle-local authority entry and the domain host half beside it; no workflow ref
(`uses`, `helpers`, `workflows`) leaves the bundle directory.

## One round

The runtime task is one JSON object:

```json
{ "facts": "<dag-run-facts:v1>", "recorded": [], "blockedHostRun": null, "gitCommonDir": "...", "at": "<ISO instant>", "stageId": "delivery" }
```

- `facts` is the reconciled `dag-run-facts:v1` input. `inputPath` may point at the same evidence in a
  file instead of inlining it.
- `recorded` lists the host operations the run already materialized, in recorded order.
- `blockedHostRun` is a prior host run read back for convergence, or `null` on a fresh run.

The controller returns `{ control, analysis, refs }`. `control.status` is `dispatched`, `idle`,
`terminal`, `awaiting_entry`, `superseded`, or `blocked`.

## The reducer owns the actions

Each legal action from the reducer becomes exactly one materialization with a deterministic id, so a
resumed host run re-issues a recorded operation rather than dispatching a second one:

| Reducer action | Materialization |
| --- | --- |
| `dispatch_issue`, `recover_issue`, `repair_issue`, `upgrade_issue` | one generated `worker` task that follows `execute-issue` |
| `close_issue`, `close_parent` | one generated `worker` task that follows `close-issue` |
| `wait_repository_close_lease`, `wait_target_writer` | a host-side bounded wait on the reducer's own `timeoutMs`, consuming no generated agent |
| `settle_pause`, `settle_stop` | a domain-owned `pause.transitioned` / `stop.transitioned` journal append |
| `reconcile_run`, `remediate_environment` | handed back to the entry as `pendingOperations`; the bundle has no reconciliation or environment adapter and does not invent one |

A generated task's tools are always a subset of the declared ceiling, and no lane borrows authority
from its agent name alone.

The round stops without dispatching anything when the reducer returns a contradictory or unavailable
action set, when an action has no declared materialization, when a recorded operation is no longer
authorized or changed its request shape, when a settled operation recurs, or when a dispatch attempt is
not accounted by the journal. It never escapes a contradiction by opening a second host run.

## Blocked-run convergence

When a host run for this Spec and target is no longer terminal, the entry reads it back with
`helpers/host-runs.mjs` and hands it to the controller as `blockedHostRun`. The domain half then decides:

- `NO_ACTION` — the host run is already terminal.
- `CONTINUE_SAME_RUN` — the host run can re-issue its recorded operations in order; resume it.
- `NEW_RUN` — the host run cannot be replayed. The controller first appends exactly one
  `run.superseded` event to the authority journal naming the blocked host run, then returns
  `status: "superseded"` and dispatches nothing. The journal event is the authority fact that proves the
  superseding host run did not re-dispatch an attempt the blocked run already owned; the control
  projection carries only the journal sequence.
- `STOP` — evidence contradicts itself or an attempt is unaccounted. The lane is preserved and the
  human repairs the owning source before re-running the same command.

Zero matching host runs select none, and more than one is an ambiguity the entry must resolve rather
than guess.
