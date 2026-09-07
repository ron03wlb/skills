# Run Issue Workflow operator guide

## Intended path

Use this personal workflow after planning authority exists:

`GRILL` → approved Spec → `/to-tickets` for a Multi-Issue Spec → `/run-issue-workflow <main Issue>` → inspect or intervene → explicit resume when required.

A Single-Issue Spec runs as one node. A Multi-Issue Spec uses only the exact read-back decomposition and blocker edges. A no-argument `/run-issue-workflow` resumes only one unique non-terminal Run; zero or multiple candidates require an explicit Spec ID.

## Start or resume

Invoke `/run-issue-workflow <Spec-ID>` once. Successful reconciliation creates or renews the exact Run Grant, tries the loopback panel, keeps text controls available, and starts work immediately. There is no second Start control.

Before that authority or any mutation, Entry invokes the owning-source handoff adapter once with the already-read tracker and reconciliation snapshots, then reduces one immediate-upstream producer handoff. A fresh Single-Issue Spec consumes only `to-spec`'s publication and completed handoff. A fresh Multi-Issue Spec consumes only `to-tickets`' completed composite handoff with the upstream publication and handoff, operation receipt, and exact Decomposition identity, digest, mapping, and blocker edges; frozen legacy/profile-v1 handoffs retain their historical record identities. `READY` continues only when the live selected authority, including its Planning Seal, matches. `INCOMPLETE` returns the exact `/to-spec <Spec-ID>` or `/to-tickets <Spec-ID>` retry command, transaction identity, first unsatisfied stage, and producer-owned retry predicates only after the exact transaction and the same live selected authority agree; current producers never own target dirt, and known unrelated dirt does not change their retry. A mismatch returns `UNKNOWN` with the exact conflicting field plus observed and expected values. Other `UNKNOWN` results return a stable diagnosis, exact observed checkpoint and handoff values, and recovery predicates for missing, dirty, malformed, contradictory, stale, legacy, or ambiguous evidence. Neither state applies cleanup, acquires a writer, records a Grant, opens the panel, acts on a task or leaf, or repairs a producer; the returned cleanup preview remains read-only.

After one exact Run is selected and its identity is reconciled, invocation previews and applies the bounded terminal-Run retention sweep before writer acquisition. The selected Run is protected even if cleanup evidence contradicts reconciliation. Zero or ambiguous no-argument selection only previews; use `cleanupPreview: true` to inspect the same eligible set without deletion.

The installed entry supplies the real Codex/Git/GitHub composition. Consumers keep only `docs/agents/workflow-host.json` with schema `codex-workflow-host:v1` and the exact GitHub repository name. The checkout origin and one saved Codex Git project must match; no user-provided test factories or adapters are required. The producer's completed checkpoint and independently read-back GitHub handoff remain prerequisites. Human approval of a Spec alone does not create them.

The owning adapter uses the canonical repository identity to derive one deterministic versioned operation identity from immutable Spec, approved-publication, producer and stage values; caller correlation never defines the Run. Current stored Runs match that key rather than Spec ID alone.

## Install and retain versions

For an explicitly approved installation (including approval retained by the original Start through [Run preparation](../../../docs/agents/run-preparation.md#approved-pre-run-workflow-maintenance)), use `scripts/install-workflow.mjs <trusted-source-repository> <exact-commit> <cache-directory> <public-skill-directory> [exact-existing-link-target]`. The source commit must exist and contain the complete entry. The installer snapshots the committed skill package, records source commit/content digests, retains old versions, and preserves an existing known link in a backup before replacement. Unknown directories or links are never overwritten. A failed installation leaves a concrete recovery record and blocks version selection for new Runs until read-back; an existing Run may still resolve its intact recorded version. Retrying the exact installation reads the public link, backup, catalog and package, then resumes only that recorded operation. Unknown changes remain untouched with the conflicting path and original expected identity. Passing an existing link target is exact replacement authorization, not permission to replace any installation.

Start through the resolved public skill's `scripts/installed-entry.mjs` using [the active host driver](references/codex-host-driver.md). The Grant records that package version. A later global update preserves the original Grant and retained content; a known compatible protocol-v1 runtime from the same trusted source may continue after fresh authority checks, recording its actual version. Unavailable or modified content returns recovery information without changing the Run or installing anything. An old Run without proven version information stays preserved for compatibility reconciliation.

Abrupt installer termination can leave its installation lock. The same command reports the exact preserved lock path before any mutation. Prove no active installer owns it, preserve and move only that lock aside, then retry the identical installation. The retry validates any durable pending intent and retained package; unknown ownership or content stays preserved. This operator repair is separate from Run, repository-close and target-writer leases, which installation never reclaims.

The active driver yields between bounded ticks and sends heartbeats while one native request is pending. It forwards each request once, retains explicit Run controls, and drains terminal output if the host exits. It carries tool results without printing full task histories into the model context. Final evidence includes available command/tool counts and elapsed time; token usage and unobserved human intervention counts remain `unavailable`. Tests with substituted CLI or host responses are local component evidence only. A delivery baseline requires actual installed-entry Git, tracker and task read-back.

## Read the panel

The panel shows the current Run identity and state, published DAG edges, ready and active frontiers, task attempts, close evidence, diagnoses, and legal controls. It is a projection, not authority.

- **Pause** stops new actions after active workers, closeout waits, and real close leaves settle; the same bridge stays open while the Run is paused.
- **Resume** in that same panel revises a paused Run and lets reconciliation decide what is now legal.
- **Stop** cooperatively revokes further work after active operations settle; it does not kill tasks or delete state.
- **Refresh** reads the newest projection and appends no journal event.

Text controls use the same journal writer and legal controls when the browser is unavailable. Closing the browser panel has no effect. The entry stops requesting work after loss of the active host heartbeat, preserves dispatched tasks and Run progress, and releases its writer. It does not promise scheduling after the app closes. The bridge closes automatically when the active coordinator returns at a terminal or diagnosed stop. Reopen the workflow explicitly after return; do not treat a stale browser snapshot as evidence.

## Observe closeout waits

Healthy repository close-lease contention projects `WAITING_FOR_REPOSITORY_CLOSE_LEASE` and one paired `repository-close-wait.*` journal wait. Compatible healthy target-writer contention retains `WAITING_FOR_TARGET_WRITER` and `target-writer-wait.*`. Each start records the exact pre-wait Run identity, Grant, tracker identity/state, target HEAD/state, candidate commit/reachability, completion evidence ID/body SHA-256/state, registered worktree identity/state, and control revision. Ready Issue execution continues within that Run's own `max_parallel` before either wait begins; a wait consumes no Issue execution slot or retry and never releases another leaf's lease. When the owner releases, the coordinator freshly reads authority and current readiness. Unchanged close authority records `RELEASED`; ordinary target advancement is reconciled against current Git state. Changed immutable authority or unavailable evidence records `EVIDENCE_CHANGED` and stops before closeout. A newly combined candidate still needs integration verification.

Unknown owner evidence, coordinator loss, or changed immutable authority returns a Recoverable blocker naming the owning source, exact evidence, smallest human action, preserved stages, and the same `/run-issue-workflow` command to retry. Do not steal, release, reclaim, or delegate either lease; do not close from the pre-wait snapshot or use elapsed time as reclaim proof. Every Issue leaf request carries current target state and exact HEAD plus exact Issue close authority evidence; a parent leaf request also carries exact parent tracker state and identity and every child's evidence. The real `close-issue` leaf alone acquires the repository close lease and then the target mutation writer.

## Diagnose before intervening

Every non-progress result should name a stable reason, evidence, affected and unaffected nodes, attempted recovery, next owner, and Resume predicates. Resolve only the named predicate. Do not manually create a replacement lane, replay closeout, clean a dirty target, repair a merge conflict, or change Run identity while the Grant remains bound.

Tracker outage probes are fixed at 5, 15, and 30 seconds. Transient Issue-lane attempts are capped at three. Only the exact recognized Windows Gradle loopback fingerprint receives one process-local remediation cycle.

A successfully read tracker whose required authority record is missing or ambiguous reports `tracker_authority_conflict` immediately with the observed mismatch. Network backoff cannot repair a changed scope or publication; the planning owner resolves it while independent selected Runs continue. Actual transport failures retain the outage probes.

If a native Codex tool never responds, retain its exact request and any known task identity. A local rollout can help locate the task, but does not replace the required native read-back. Report the unfinished boundary and resume the same installed entry when that owning source responds; do not count a preserved Run as delivered.

A native `notLoaded` task with a completed latest turn is settled for continuation; an active task remains running, and an unloaded task with unfinished or unreadable latest work remains unknown. This reads current host state without replaying valid implementation or review.

## Recover without duplication

On re-entry, the coordinator reads the journal and reacquires live Tracker, Git, worktree, completion-note, and Codex task evidence. It adopts trustworthy manual completion, a settled task, an accepted close request, partial close progress, and already-successful nodes. It never recreates or guesses an ambiguous lane.

If the host disconnects before task submission, the adapter checks that state before reserving a new creation intent. Existing uncertain intents remain preserved and require exact native outcome read-back; the absence of a task in a partial listing does not authorize another create.

Some current-host task listings omit newly delegated tasks and their preview can be empty. For local creation recovery, the adapter first uses exact delegation-input matches in the creation-day Codex rollout files as discovery hints, followed by native task-input and Git common-directory read-back. Multiple exact matches remain ambiguous; an ownership mismatch preserves the lane. Without exact hints, the task-list fallback skips the saved checkout's tasks because the creation intent requires a separate worktree. This avoids reading unrelated coordinator history before the existing worker. Rollout text, titles, and a hinted ID alone never establish a lane or authorize another task. Native delegation inputs also supply close/retry request read-back when no user-message item exists.

Use an explicit Spec ID after a stopped Run, identity change, multiple candidate Runs, or any authority repair. Use no arguments only when one exact non-terminal Run is proven.

## Inspect after return

The composed runtime returns:

- the final versioned status projection;
- the validated append-only journal;
- a read-only cleanup preview;
- the applied cleanup result, or `null` for preview-only invocation;
- sanitized panel lifecycle metadata without the control credential.

The same status and journal remain under the repository's common Git directory after the bridge stops. Cleanup audit records remain inspectable independently of the panel.

Renderable examples:

- [`examples/status-succeeded.json`](./examples/status-succeeded.json)
- [`examples/status-diagnosed.json`](./examples/status-diagnosed.json)
- [`examples/status-waiting.json`](./examples/status-waiting.json)

## v1 boundaries

This is a personal, active-task workflow. It adds no Orca or App Server runtime, Linear or database dependency, global Spec picker, public skill promotion, push, deployment, external-prerequisite execution, or self-modifying behavior.


## Preparation and batches

Plan actual install paths, task/message operations, local close/cleanup and tracker writes before Start. Reuse existing approvals and present only concrete missing permissions once. Declared SQL additionally needs its environment, effect, rights, operator, recovery and APPLIED/NO_OP attestation before related readiness. No SQL is N/A; a general Run Grant never executes a database operation.

An explicit `/run-issue-workflow <Spec-A>,<Spec-B>` uses separate Runs/Grants and one shared three-worker limit, rotating dependency-ready work. A lock wait consumes no worker. Text controls for a batch include the exact `runId`; an ambiguous control affects no Run. Healthy waits continue past thirty seconds. Same-scope conflicts return to the original Issue lane under a persistent ten-wave budget and require renewed verification/review.

Failed dispatch, repair or close actions retain at most three attempts for the same owning-source progress in the Run journal. A native lane identity by itself does not reset that budget. New observed progress or an explicit Resume permits recovery; a process restart alone does not. Before a selected batch assigns any worker slot, it discovers and adopts existing creation intents or reserves their uncertain activity.

The [live evidence](../../../docs/agents/workflow-live-evidence.md) distinguishes completed validation Runs, local regression tests and observed recovery interventions. It also records cost coverage and unavailable measurements; skill word counts are not token-cost evidence.
