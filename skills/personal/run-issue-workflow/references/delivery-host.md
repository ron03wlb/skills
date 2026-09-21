# Delivery host contract

`/run-issue-workflow <Spec-ID>` remains the sole Start and re-entry authority. Its delivery host is split
into an authority layer that decides and replaceable execution material that performs: execution material
owns the Run's scheduling, durable task records, and Issue worker lifecycle only as the authority layer
authorizes, and no single materialization is required. The delivery path materializes one native subagent
lane per authorized action, and the `pi-workflow` bundle stays one optional materialization of the same
facts.

The tracker half of the authority layer is one selected composition per Run. The Start entry selects
exactly one **Tracker Run sources** composition from the repository's configured tracker evidence — GitHub,
or GitLab for an origin-matching `docs/agents/gitlab-producer.json` — and fails closed on missing,
mismatching or contradictory evidence instead of falling back. Every composition answers the same surface
and reuses the same authority, journal, budgets, lanes, Run store and Git journal, so the domain halves
above never learn which tracker they read, and a GitLab Run derives its identity as
`gitlab:<host>/<project>` exactly as its producer does.

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

### The composed native round

The Start entry composes that material, and it composes the native round rather than a host run.
`scripts/run-entry.mjs` emits one round read and one round plan and hands back the ports the round loop
owns:

- **Read.** One round read carries this round's journal, the `dag-run-facts:v1` set that owns the same
  journal, and one native lane-evidence read of the lanes the journal recorded. It is rebuilt from
  owning sources every round, so a restart resumes at the next legal action instead of replaying a plan.
- **Plan.** `scripts/native-round-loop.mjs` reduces that read, and the entry plans its first round
  through the same planner, so no second planning path exists. The planner asks
  `scripts/pi-workflow-host.mjs` for the legal actions and materializes them through
  `scripts/native-lane-runner.mjs`; it never materializes an action the reducer did not return.
- **Append.** The loop's journal writes — dispatch reservations and the close-lane dispatch intent — go
  through the entry's single writer port, so the existing journal keeps ownership of grants, budgets,
  attempts and outcomes.
- **Step.** `scripts/native-coordinator-step.mjs` is the stateless coordinator boundary. It appends every reservation before returning bounded `create_lane`, `resume_lane`, `observe_lane`, `wait_owner`, `settle_control`, or `return_to_entry` actions plus the round artifact reference. It invokes no model.
- **Bind.** After the harness creates or resumes a lane, the coordinator submits the exact native run id, run directory, cwd, timestamp, generation, and previous native run id. `native-lane-pointer:v2` keeps a continuous generation chain; identical bind replay is idempotent, while conflict or a broken predecessor stops.
- **Launch.** A worker launch remains the coordinator's port alone. The entry and stepper never call a model or invent a native run identity.

Two properties are the composition's, not the materialization's. Every produced lane prompt carries the
standing discipline that the lane reads the repository, the tracker and Git only, never scans the host
filesystem, and stops to ask the coordinator when a harness fact is genuinely missing; the existing
one-contract-skill and tool-ceiling guards bind that composed prompt. And the release frontier is
re-derived on every round from the published blocker edges and the three release conditions — the blocker
is closed in the tracker, its candidate is reachable from the target, and its worktree is absent — while
the producer's one-shot `ready_state.read_back` projection is carried only as superseded evidence and is
never consulted. A recorded close lane keeps close authority serialized: its invocation is journaled
before the lane exists, and a later round reads that lane back instead of materializing a second close
owner.

## The Issue lane

One executable Issue owns exactly one lane: one isolated worker and one dedicated Issue worktree. Every
lane runs in its own managed worktree, so the shared checkout stays read-only apart from ordinary
worktree registration.

The native coordinator passes the planned agent name, prompt, tool ceiling, and worktree policy explicitly to its harness. Native correctness does not assume that the harness automatically loads package `agents/worker.md`; the lane prompt itself carries the standing rules and one leaf-skill invocation. A materialization that does resolve a named worker must prove that resolution before launch.

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
close authority. The runner composes the same standing discipline into every prompt it produces, and both
scope checks then read that composed text.

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

## Optional materialization

When an operator explicitly selects the optional `pi-workflow` host, read [its materialization contract](pi-workflow-materialization.md). The native Start path does not load that branch or its worker-resolution rules.

## Cutover and measurement evidence

The substrate cutover read-back, the carried Issue #91 recovery/delivery matrix, the per-phase
measurement ontology, and the bounded reproducible-evidence report are published in
[the delivery measurement reference](delivery-measurement.md).
