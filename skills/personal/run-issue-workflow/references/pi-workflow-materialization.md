# Optional pi-workflow materialization

This reference applies only when an operator explicitly selects the optional `pi-workflow` host. The native Start path does not load it. Until this exact revision completes a representative dry run, this bundle is validation-only optional materialization: it is neither a fallback nor an automatic routing destination.

`@gwab/pi-workflow` is one optional materialization of these same facts, never a requirement, and no
module of the default path imports it or the bundle. ADR-0080
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
  which is the bundle root `pi-workflow` enforces, and every declared ref is a `./` path inside it. The dynamic stage's `profileRole: "research-execution"` classifies generated workers as execution work for saved execution profiles. Its only authored host budget is `maxConcurrency: 3`, the host expression of the preserved `max_parallel` default; every other host resource limit keeps pi-workflow's own default. Domain reducer and journal budgets remain authority. An optional host runtime limit may be narrower, but reaching it is host failure evidence rather than domain success, so the bundle neither invents `maxAgents` nor restates the journal-owned six-hour per-Issue budget as `maxRuntimeMs`. Healthy close contention may therefore exceed twelve hours.
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

This bundle is explicitly write-capable (`defaults.readOnly: false`) and materializes its lanes through `defaults.worktreePolicy: "on"` and the agent named by `defaults.agent` (shipped here as `agents/worker.md`). Product writes belong only to the managed Issue worktree owned by the leaf contract. The shared checkout, authority journal, installed workflow package/cache, and host control paths remain protected from product mutation; the trusted controller plans transport and never performs product edits. pi-workflow resolves a generated agent name only
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
