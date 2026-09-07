# Prepare before Run-ready

The planning owner inventories actual operations before asking for missing permission: installation paths, one task/worktree per selected Issue, execution/close messages, exact local-target integration/cleanup, and tracker writes. Read approvals first, prepare concrete operations, run read-only host probes, and ask once for remaining scope. Resolve approved decomposition keys to native Issue IDs without asking again for the same approved work. A new target, scope, ownership ambiguity, or irreversible capability requires its concrete difference to be settled first.

`grilling` settles these decisions. `to-spec` carries the approved inventory in publication; `to-tickets` resolves it to exact child mapping. The immediate producer owns final preparation read-back before Run handoff. Reuse `assessRunPreparation` in [the readiness reader](../../skills/personal/run-issue-workflow/scripts/run-preparation.mjs); it computes missing approvals and SQL prerequisites but issues no authority.

The existing `spec_publication` payload carries `preparation.requiredActions` with `action` and exact `scope`; supported actions are `workflow-install`, `task-create`, `task-message`, `local-close`, and `tracker-write`. `preparation.trackerPublication.required` states publication semantics. `producer_handoff.preparation.approvals` carries the same normalized entries and their existing human `authority` references. An entry proves a prior operation; the producer reads its source rather than generating approval. These fields are not a generic authorization store or replacement Grant.

Probe available task tools, saved Git project, tracker reads, and exact installation state before proposing work. GitHub Issue publication uses immediate pre-read, write, and exact post-read, not CAS. If the requirement needs atomic CAS but the host lacks it, resolve the capability gap during planning. Never label unsupported `If-Match` as CAS. Read uncertain writes before retry; preserve conflicting or ambiguous ownership.

## One declared Manual prerequisite

No SQL means `sql: []`, reported as `N/A`, with no SQL question, task, artifact, or database dependency. Never discover a requirement by scanning arbitrary `.sql` files.

For a declared human-applied artifact, `preparation.sql` carries exact `issueId`, normalized `artifact`, and opaque `environmentIdentity`. Settle environment, authorized effect/permissions, operator, recovery, and `APPLIED`/`NO_OP` validation first. Environment identity is human-confirmed declaration, not a database probe or credentials; changing it needs fresh attestation.

After publication yields the exact Issue identity, call `pre-execute-issue` for that Issue before ready state. Its existing candidate, validation, review, and human-application flow remains owner. A covered inventory may establish one prerequisite task/worktree, whose prompt is `Workflow prerequisite lane: <JSON>` with `issueId`, `specId`, `target`, and `approvedScopeHash` in order; preserve it for later execution.

`producer_handoff.preparation.preparedSql` carries exact Issue, environment, artifact, candidate/blob, owner, recovery/validation/review state, outcome, immutable attestation identity, task/worktree/topic. Read every field from its owner. A v2 environment-bound note adds `environment_identity` without credentials or SQL; older environment-less v2 only satisfies its exact old declaration.

The installed reader verifies trusted attestation, object types, path/blob, branch/worktree, and ancestry; it adopts the prepared task after prompt/common-directory read-back and sends the first request under the later Grant. Reconcile uncertain messages before retry. Completion/close reread attestation and ancestry; new environment or artifact content invalidates only its affected Issue/dependants.

Known missing preparation blocks fresh Run readiness. Complete it through its normal handoff. A late unchanged-scope prerequisite exposes only its new decision. A Run Grant never authorizes SQL application, recovery, deployment, or external cleanup.

## Approved pre-Run workflow maintenance

Read [approved pre-Run workflow maintenance](references/approved-pre-run-workflow-maintenance.md) only when a human-approved maintenance Issue must execute before any Run Grant exists. It grants no generic repair path.
