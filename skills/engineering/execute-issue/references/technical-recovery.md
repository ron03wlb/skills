# Technical failure recovery

Read only for an evidence-bound recovery request under unchanged Issue authority. The Run coordinator owns diagnosis and task handoff; execution owns source repair, verification and the replacement completion. The main session performs no repair edits, commits or installation.

## Diagnose before choosing the repair owner

Bind the original Run, Issue operation, task, worktree/topic, candidate, target combination, completion identity/body digest, owning source, failed command and observed result. `DIAGNOSE` is a read-only phase in a separate settled-owner fork. Report one `Workflow recovery result: <JSON>` final line binding the accepted `requestIdentity` and `failureIdentity`, with `diagnosis: {classification, source, reason, scopeCompatible}`.

| Classification | Next owner |
| --- | --- |
| `UNDIAGNOSED` | Continue permitted source/command diagnosis; absence of an initial diagnosis is not a permission gate. |
| `ISSUE_DEFECT` | The isolated Issue repair task, only when settled requirements cover the change. |
| `ENVIRONMENT` | Read back an unclassified fingerprint, then invoke the exact existing `gradle-loopback-safe` adapter once per dispatch/fingerprint. Other adapters remain unavailable. |
| `WORKFLOW_DEFECT` | A separate maintenance task in the canonical workflow-source repository. |
| `REQUIREMENT_CONFLICT` | Human design/planning decision. |
| `CAPABILITY_UNAVAILABLE` | The named capability owner, with evidence of the unavailable operation. |
| `OUTCOME_UNKNOWN` | Dispatch one bounded read-only `READBACK` phase through the isolated task before any retry. Unresolved evidence names the actual owning source and next action. |

Newly discovered necessary files and technical failures do not themselves alter scope. New requirements, target, exclusions or applicable authority return to planning.

## Exclusive Issue repair

The existing journal records `recovery.intent` before task creation/message dispatch and `recovery.task` after native ownership read-back. The previous task must be settled in the exact worktree; the new task receives the same worktree through a same-directory fork and preserves original history. The immutable handoff and fork intents survive lost responses and pending setup; adopt exactly one native match and retain ambiguity rather than create another writer. Reuse this repair task for the same Issue operation. An original task becoming active invalidates the transfer until its exact owner settles.

Before material edits, consume the already recorded `REPAIR` wave and the proved cumulative count. Original execution review repairs, conflict repair, integration recovery, task changes and restart share a maximum of ten material waves. Diagnosis, polling and environment observations are not material waves. Never assume an unknown count is zero or count a coordinator-reserved wave twice. Further confirmed review repairs increment and read back the same operation's progress before editing. GitHub progress uses a trusted `implementation_progress` record with the full `operationIdentity`, `issueId` and cumulative `repairWaveCount`; this is existing execution progress encoding, not completion or new authority. The source reader joins these counts and rejects resets.

Capture the latest target as this attempt's baseline; merge that exact commit into the topic without reset, rebase or rollback of a successful merge. Preserve the old candidate and all completion notes. Run the original failed command, affected focused checks, configured typechecking, full suite and independent Standards/Spec review at the new committed candidate. Required checks must prove actual behavior, including integration obligations; ancestry alone is insufficient.

The verification entries include the original failed command as exact `argv` and its PASS result. The new `implementation_complete` includes `repairWaveCount` and `recovery: {failureIdentity, requestIdentity, taskRef, previousCompletionIdentity, previousCompletionBodySha256}`. Its operation, target, worktree and topic remain original; its candidate descends from the old candidate and required latest-target baseline. For initial execution failure without a preceding completion, the previous-completion fields are explicitly null and the failed baseline/candidate remains ancestry evidence. Publish and read back the completion, then stop. The coordinator validates this exact lineage and returns to the original close owner. Repair workers acquire no close leases and perform no closeout.

## Governing-workflow maintenance

The diagnosis names `maintenance: {repositoryId, sourceRepository, target, approvedScopeHash, authority, operationId, repairWaveCount}` and, when applicable, exact `installationAuthority`. Resolve these against the existing human-approved repair scope. A dedicated task receives an isolated worktree from the unique saved canonical source project. The product task and main session do not modify the active package, Grant, journal or another owner's state.

The maintenance operation retains its own ten-wave budget and task intent across retries; a new fingerprint does not authorize resetting the same operation. Verify and independently review its source candidate. The installation owner acts only under exact installation authority and returns native/read-back evidence; missing installation authority preserves the product lane and names that owner.

Return `Workflow recovery result: <JSON>` with the accepted request/failure identities and `maintenance: {repositoryId, target, operationId, candidate, packageVersion, repairWaveCount, standards, spec, verification, installation: {authority, packageVersionId}}`. The coordinator verifies the installed package through the existing installation catalog and content verifier, checks scoped review/verification and budget evidence, and freshly enters the same Run with the verified compatible runtime. The retained Grant and package history remain unchanged. Closed-Issue aggregate findings keep their separate owner; no reopening or receipt migration is implied.
