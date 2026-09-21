# Run Issue Workflow operator guide

## Intended path

Use this personal workflow after planning authority exists:

`GRILL` → approved Spec → `/to-tickets` for a Multi-Issue Spec → `/run-issue-workflow <main Issue>` → inspect or intervene → explicit resume when required.

A Single-Issue Spec runs as one node. A Multi-Issue Spec uses only the exact read-back decomposition and blocker edges. A no-argument `/run-issue-workflow` resumes only one unique non-terminal Run; zero or multiple candidates require an explicit Spec ID.

## Start or resume

Invoke `/run-issue-workflow <Spec-ID>` once. Successful reconciliation creates or renews the exact Run Grant and starts the delivery host, whose authority layer owns every legal action and whose execution material is replaceable. There is no second Start control.

One Run binds exactly one tracker: the entry selects its owning-source composition from the repository's configured tracker evidence before any read. A `github.com` origin uses the GitHub composition; a GitLab origin with a present, origin-matching `docs/agents/gitlab-producer.json` uses the GitLab composition, whose Issue identity is the Issue's web URL and whose dependency authority is the published `decomposition:v1` body graph. A GitLab origin without that binding, a binding that does not match the origin, and a GitHub origin carrying one each stop with the observed values and the binding repair instead of falling back — the repair is the producer owner's `configure`, which `setup-matt-pocock-skills` presents inside its one approved plan.

Before that authority or any mutation, the entry invokes the owning-source handoff adapter once with the already-read tracker and reconciliation snapshots, then reduces one immediate-upstream producer handoff. A fresh Single-Issue Spec consumes only `to-spec`'s publication and completed handoff. A fresh Multi-Issue Spec consumes only `to-tickets`' completed composite handoff with the upstream publication and handoff, operation receipt, and exact Decomposition identity, digest, mapping, and blocker edges; frozen legacy/profile-v1 handoffs retain their historical record identities. `READY` continues only when the live selected authority, including its Planning Seal, matches. `INCOMPLETE` returns the exact `/to-spec <Spec-ID>` or `/to-tickets <Spec-ID>` retry command, transaction identity, first unsatisfied stage, and producer-owned retry predicates only after the exact transaction and the same live selected authority agree; current producers never own target dirt, and known unrelated dirt does not change their retry. `run_preparation_pending` is the one gap the entry owns instead: it asks the human once for the reported questions and records exactly those approvals on this Run's Grant, so a Run whose planning owner left its declared operations unapproved still starts from a single approval. A mismatch returns `UNKNOWN` with the exact conflicting field plus observed and expected values. Other `UNKNOWN` results return a stable diagnosis, exact observed checkpoint and handoff values, and recovery predicates for missing, dirty, malformed, contradictory, stale, legacy, or ambiguous evidence. Neither state applies cleanup, acquires a writer, records a Grant, acts on a task or leaf, or repairs a producer; the returned cleanup preview remains read-only.

After one exact Run is selected and its identity is reconciled, invocation previews and applies the bounded terminal-Run retention sweep before writer acquisition. The selected Run is protected even if cleanup evidence contradicts reconciliation. Zero or ambiguous no-argument selection only previews; use `cleanupPreview: true` to inspect the same eligible set without deletion.

The owning adapter uses the canonical repository identity to derive one deterministic versioned operation identity from immutable Spec, approved-publication, producer and stage values; caller correlation never defines the Run. Current stored Runs match that key rather than Spec ID alone.

Explicit numeric or native Spec selection also finds completed Runs for the current scope. It retains the original Run and Grant, verifies the recorded package first, and reconciles live owner evidence. A compatible current package records its actual runtime version through the existing journal owner. Completed re-entry does not create a replacement Run, repeat execution or verification, or send another close request. Contradictory completion evidence stays preserved for recovery; a cached `SUCCEEDED` projection alone cannot prove completion. No-argument discovery still excludes terminal Runs, and explicit STOPPED selection retains its revoked authority. A changed Spec body, conflicting canonical identity, ambiguous same-scope journals, or explicit Run/Spec mismatch cannot borrow an old Grant.

## Install and retain versions

For an explicitly approved installation (including approval retained by the original Start through [its owner](../../../docs/agents/references/approved-pre-run-workflow-maintenance.md)), use `scripts/install-workflow.mjs <trusted-source-repository> <exact-commit> <cache-directory> --entry <path> [--entry <path> ...] [--replace <path>=<expected-target> ...]`. The legacy positional entry remains a compatibility input. One transaction binds every configured `.codex`, `.agents`, and `.claude` entry to the same immutable package. Durable intent precedes external backups under `<cache>/backups/`; no backup is created in a skill discovery root. Package, backups, every public entry, and catalog are read back before the intent clears. A failure restores every replaced entry and preserves the exact intent for same-command recovery; drift or unknown links fail closed.

The package entry `scripts/run-entry.mjs <Spec-ID> [--approve "<authority>"] [--artifact <path>] [--full]` reduces the upstream handoff and records the one Grant. Default stdout is a bounded step summary; the full round, facts, journal receipts, and plan go to a bounded artifact (`--out` remains an artifact-path alias). `--full` is the only inline full-output mode. `scripts/native-coordinator-step.mjs step` reconstructs one round without process-local authority, appends every reservation, and returns create/resume/observe/wait/settlement actions. After the native harness creates or resumes a lane, submit its exact run id, run directory, cwd, timestamp, generation, and previous native run id through `native-coordinator-step.mjs bind`. The append-only v2 generation chain makes repeated identical binds idempotent and rejects conflicts or broken resume lineage. The optional `pi-workflow` branch is documented separately in `references/pi-workflow-materialization.md`.

An installation receipt is complete only when `readWorkflowInstallationEvidence` re-reads the selected manifest, source commit, all three managed entries, and the package-owned `--capability-identity` probe. The one-release `--qualification-identity` alias runs that same minimal probe; `--qualify-repair-package` is retired. Capability identity binds package version, manifest digest, runtime, WSL kernel/distro, and ordinary POSIX cleanup. It proves no tracker mutation, lane settlement, close acceptance, or unattended delivery. Missing, foreign, changed, or unprovable evidence returns one attributable blocker.

Abrupt installer termination can leave its installation lock. The same command reports the exact preserved lock path before any mutation. Prove no active installer owns it, preserve and move only that lock aside, then retry the identical installation. The retry validates the durable intent, every external backup, all entries, package, and catalog. For retention, run `scripts/maintain-workflow-installation.mjs preview <cache> ...`, inspect its keep/remove reasons, then run `apply <cache> --preview-id <id>`. Apply accepts only the unchanged content-bound preview, retains current plus every journal reference plus the two latest rollback versions plus pending/active references, and writes a receipt. Unknown references remain blockers.

Routine observation is compact: the Run journal stores a versioned allowlisted `task.outcome`, capped at 16 KiB, while encoded host responses are capped at 1 MiB. Normal active and successful completion paths omit worker output and do not fetch full history. Exact anomaly/lost-effect diagnosis is capped at 256 KiB over four reads. `NATIVE_RESPONSE_BUDGET_EXCEEDED` names the missing-evidence locator; it is not a truncated success. Five minutes without verified status or a discriminating revision produces one attributed diagnostic escalation, but does not stop, kill, replace, or settle an active lane.

## Controls

Pause, Resume, and Stop go through the domain's revisioned control settlement; the host appends `pause.transitioned` or `stop.transitioned` only when the journal's latest control revision still authorizes exactly that command. A paused host run stays resumable in place, and Stop cooperatively revokes further work after active lanes settle. Use [the recovery diagnosis](references/recovery.md#stop-with-a-diagnosis) before intervening on a real gate.

## Observe closeout waits

Healthy repository close-lease contention projects `WAITING_FOR_REPOSITORY_CLOSE_LEASE` and one paired `repository-close-wait.*` journal wait. Compatible healthy target-writer contention retains `WAITING_FOR_TARGET_WRITER` and `target-writer-wait.*`. Each start records the exact pre-wait Run identity, Grant, tracker identity/state, target HEAD/state, candidate commit/reachability, completion evidence ID/body SHA-256/state, registered worktree identity/state, and control revision. Ready Issue execution continues within that Run's own `max_parallel` before either wait begins; a wait consumes no Issue execution slot or retry and never releases another leaf's lease. When the owner releases, the host freshly reads authority and current readiness. Unchanged close authority records `RELEASED`; ordinary target advancement is reconciled against current Git state. Changed immutable authority or unavailable evidence records `EVIDENCE_CHANGED` and stops before closeout. A newly combined candidate still needs integration verification.

Each Issue operation also exposes its cumulative six-hour execution budget. Implementation, retry, implementation repair, conflict repair, and their owned verification/review count across all retries, replacement lanes, restarts, re-entry, and material waves. Verified healthy dependency and writer waits are excluded, including healthy contention beyond twelve hours. At six hours the status reports `execution_timeout`; no new execution, repair, retry, or close request is scheduled for that Issue. The original lane may still settle and its late result remains evidence, but the host does not force-kill it or claim cancellation.

Unknown owner evidence, host loss, or changed immutable authority returns a Recoverable blocker naming the owning source, exact evidence, smallest human action, preserved stages, and the same `/run-issue-workflow` command to retry. An exact owner whose health read is `UNKNOWN` first consumes the durable shared 5/15/30-second read-only observation policy; restored exact-generation health resumes waiting, while exhaustion reports `OWNER_HEALTH_UNKNOWN`. `UNKNOWN` is not inactive ownership. Do not steal, release, reclaim, cancel, or delegate either lease; do not close from the pre-wait snapshot or use elapsed time as reclaim proof. The real `close-issue` leaf alone acquires the repository close lease and then the target mutation writer.

## Diagnose before intervening

For a real non-progress result, [the recovery diagnosis](references/recovery.md#stop-with-a-diagnosis) identifies the exact owning Skill instruction, observed gate and remaining predicate. Resolve only that predicate; the original owner keeps unchanged authority and progress. A healthy wait or pending worker result is still in progress.

Tracker outage probes are fixed at 5, 15, and 30 seconds. Transient Issue-lane attempts are capped at three. Only the exact recognized Windows Gradle loopback fingerprint receives one process-local remediation cycle.

A successfully read tracker whose required authority record is missing or ambiguous reports `tracker_authority_conflict` immediately with the observed mismatch. Network backoff cannot repair a changed scope or publication; the planning owner resolves it while independent selected Runs continue. Actual transport failures retain the outage probes.

## Recover without duplication

On re-entry, the host reads the journal and reacquires live Tracker, Git, worktree, and completion-note evidence. It adopts trustworthy manual completion, a settled lane, an accepted close request, partial close progress, and already-successful nodes. It never recreates or guesses an ambiguous lane.

Use an explicit Spec ID after a stopped Run, identity change, multiple candidate Runs, or any authority repair. Use no arguments only when one exact non-terminal Run is proven.

## Inspect after return

The delivered lane records, the authority journal, the cleanup preview, and the applied cleanup result remain under the repository's common Git directory. The delivery host's round control reports `dispatched`, `idle`, `terminal`, `resume_same_run`, `awaiting_entry`, `superseded`, or `blocked` with its exact stop code and evidence.

Renderable examples:

- [`examples/status-succeeded.json`](./examples/status-succeeded.json)
- [`examples/status-diagnosed.json`](./examples/status-diagnosed.json)
- [`examples/status-waiting.json`](./examples/status-waiting.json)

## v1 boundaries

This is a personal, active-task workflow. It adds no Orca or App Server runtime, Linear or database dependency, global Spec picker, public skill promotion, push, deployment, external-prerequisite execution, or self-modifying behavior.

## Preparation and batches

Plan actual install paths, lane operations, local close/cleanup and tracker writes before Start. Reuse existing approvals and present only concrete missing permissions once. Declared SQL additionally needs its environment, effect, rights, operator, recovery and APPLIED/NO_OP attestation before related readiness. No SQL is N/A; a general Run Grant never executes a database operation.

An explicit `/run-issue-workflow <Spec-A>,<Spec-B>` uses separate Runs/Grants and one shared three-worker limit, rotating dependency-ready work. A lock wait consumes no worker. Healthy waits continue past thirty seconds. Same-scope conflicts return to the original Issue lane under a persistent ten-wave budget and require renewed verification/review.

Completed members of an explicit batch reconcile their original authority alongside active members. They consume no execution slot or close action. One unavailable or contradictory member leaves the batch preserved without inventing success for another; healthy members retain their own observed result.

Failed dispatch, repair or close actions retain at most three attempts for the same owning-source progress in the Run journal. A lane identity by itself does not reset that budget. New observed progress or an explicit Resume permits recovery; a process restart alone does not.

The [live evidence](../../../docs/agents/workflow-live-evidence.md) distinguishes completed validation Runs, local regression tests and observed recovery interventions. It also records cost coverage and unavailable measurements; skill word counts are not token-cost evidence.
