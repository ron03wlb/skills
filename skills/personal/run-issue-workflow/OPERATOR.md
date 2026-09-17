# Run Issue Workflow operator guide

## Intended path

Use this personal workflow after planning authority exists:

`GRILL` → approved Spec → `/to-tickets` for a Multi-Issue Spec → `/run-issue-workflow <main Issue>` → inspect or intervene → explicit resume when required.

A Single-Issue Spec runs as one node. A Multi-Issue Spec uses only the exact read-back decomposition and blocker edges. A no-argument `/run-issue-workflow` resumes only one unique non-terminal Run; zero or multiple candidates require an explicit Spec ID.

## Start or resume

Invoke `/run-issue-workflow <Spec-ID>` once. Successful reconciliation creates or renews the exact Run Grant and dispatches the pi-workflow delivery host. There is no second Start control.

Before that authority or any mutation, the entry invokes the owning-source handoff adapter once with the already-read tracker and reconciliation snapshots, then reduces one immediate-upstream producer handoff. A fresh Single-Issue Spec consumes only `to-spec`'s publication and completed handoff. A fresh Multi-Issue Spec consumes only `to-tickets`' completed composite handoff with the upstream publication and handoff, operation receipt, and exact Decomposition identity, digest, mapping, and blocker edges; frozen legacy/profile-v1 handoffs retain their historical record identities. `READY` continues only when the live selected authority, including its Planning Seal, matches. `INCOMPLETE` returns the exact `/to-spec <Spec-ID>` or `/to-tickets <Spec-ID>` retry command, transaction identity, first unsatisfied stage, and producer-owned retry predicates only after the exact transaction and the same live selected authority agree; current producers never own target dirt, and known unrelated dirt does not change their retry. A mismatch returns `UNKNOWN` with the exact conflicting field plus observed and expected values. Other `UNKNOWN` results return a stable diagnosis, exact observed checkpoint and handoff values, and recovery predicates for missing, dirty, malformed, contradictory, stale, legacy, or ambiguous evidence. Neither state applies cleanup, acquires a writer, records a Grant, acts on a task or leaf, or repairs a producer; the returned cleanup preview remains read-only.

After one exact Run is selected and its identity is reconciled, invocation previews and applies the bounded terminal-Run retention sweep before writer acquisition. The selected Run is protected even if cleanup evidence contradicts reconciliation. Zero or ambiguous no-argument selection only previews; use `cleanupPreview: true` to inspect the same eligible set without deletion.

The owning adapter uses the canonical repository identity to derive one deterministic versioned operation identity from immutable Spec, approved-publication, producer and stage values; caller correlation never defines the Run. Current stored Runs match that key rather than Spec ID alone.

Explicit numeric or native Spec selection also finds completed Runs for the current scope. It retains the original Run and Grant, verifies the recorded package first, and reconciles live owner evidence. A compatible current package records its actual runtime version through the existing journal owner. Completed re-entry does not create a replacement Run, repeat execution or verification, or send another close request. Contradictory completion evidence stays preserved for recovery; a cached `SUCCEEDED` projection alone cannot prove completion. No-argument discovery still excludes terminal Runs, and explicit STOPPED selection retains its revoked authority. A changed Spec body, conflicting canonical identity, ambiguous same-scope journals, or explicit Run/Spec mismatch cannot borrow an old Grant.

## Install and retain versions

For an explicitly approved installation (including approval retained by the original Start through [its owner](../../../docs/agents/references/approved-pre-run-workflow-maintenance.md)), use `scripts/install-workflow.mjs <trusted-source-repository> <exact-commit> <cache-directory> <public-skill-directory> [exact-existing-link-target]`. The source commit must exist and contain the complete entry. The installer snapshots the committed skill package, records source commit/content digests, retains old versions, and preserves an existing known link in a backup before replacement. Unknown directories or links are never overwritten. A failed installation leaves a concrete recovery record and blocks version selection for new Runs until read-back; an existing Run may still resolve its intact recorded version. Retrying the exact installation reads the public link, backup, catalog and package, then resumes only that recorded operation. Unknown changes remain untouched with the conflicting path and original expected identity. Passing an existing link target is exact replacement authorization, not permission to replace any installation.

The delivery host is launched by path, not through a host driver: `/workflow run <skill>/workflows/deliver-tracker-spec/spec.json "<round JSON>"`. The Grant records the package version. A later global update preserves the original Grant and retained content; a known compatible protocol-v1 runtime from the same trusted source may continue after fresh authority checks, recording its actual version. Unavailable or modified content returns recovery information without changing the Run or installing anything. An old Run without proven version information stays preserved for compatibility reconciliation.

An installation receipt is complete only when `readWorkflowInstallationEvidence` re-reads the selected package manifest, binds its source commit and manifest SHA-256, proves every configured managed entry resolves to that exact package directory, and invokes the package-owned routing, identity and WSL POSIX-cleanup qualification through that selected `installed-entry.mjs`. The receipt binds the exact package version, fixture revision, fixture-byte digest, runtime and a capability identity over the WSL kernel release, distro marker and proven POSIX cleanup; exactly three retained component-fixture observations are required, and a retained sample is reused only while every bound input still matches the currently installed package. Caller-authored PASS text is not evidence. A missing entry, foreign target, changed manifest, candidate mismatch, incomplete stage set, unprovable or mismatched capability, malformed retained sample, or result from another package stays visible and fails verification. The fixture intervals measure component behavior only; no terminal-recognition, close-acceptance, tracker-mutation or unattended-delivery claim follows from them. The runtime result separately reports the package version, package root and manifest digest actually selected by `installed-entry.mjs`.

Abrupt installer termination can leave its installation lock. The same command reports the exact preserved lock path before any mutation. Prove no active installer owns it, preserve and move only that lock aside, then retry the identical installation. The retry validates any durable pending intent and retained package; unknown ownership or content stays preserved. This operator repair is separate from Run, repository-close and target-writer leases, which installation never reclaims.

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

The host run record, the authority journal, the cleanup preview, and the applied cleanup result remain under the repository's common Git directory. The delivery host's round control reports `dispatched`, `idle`, `terminal`, `resume_same_run`, `awaiting_entry`, `superseded`, or `blocked` with its exact stop code and evidence.

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
