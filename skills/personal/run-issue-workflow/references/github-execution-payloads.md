# GitHub execution payloads

This is the execute-issue half of the GitHub payload encoding. Read it only when encoding an `implementation_complete`, `implementation_repair_progress`, or `implementation_blocked` record; the shared encoding rules stay in [GitHub payload encoding](github-payloads.md).

## execute-issue owner

Only after the completion-evidence reference's checks pass, encode its existing payload with `kind: implementation_complete`, `issueId` and `specId` (immutable node IDs), `target`, `targetWorktree`, `topic`, `worktree` (the exact Issue path), `baseline`, `candidate`, full `operationIdentity`, `planningSeal`, `manualAttestations`, `workflowArtifacts`, `standards: clean`, `spec: clean`, nonempty `verification` command/result entries, `repairWaveCount`, and `worktreeState: clean`. Required adoption records remain separate and keep their existing contracts.

Historical `repairWaves` is the same cumulative count. Read either spelling without rewriting receipts; both fields must agree when present. Known counts must be integers from zero through ten. Missing/null counts stay unknown, and malformed or conflicting values stop recovery.

Recovery joins cumulative counts from both `implementation_progress` and `implementation_repair_progress` for the same operation. Model-yield validation carries earlier recovery counts but still requires its exact two complete model-repair wave receipts, native ownership, verification and independent reviews; a counter alone never authorizes an upgrade.

A genuine blocked exit uses `kind: implementation_blocked`, exact Issue/Spec identities, reason and available lane/evidence fields. New blocked records supersede completion only under execute-issue's existing invalidation rule; a target-only close problem must not be encoded as an implementation failure.

For newly policy-bound tasks only, the execution owner records each repair before changes as `kind: implementation_repair_progress`, with full `operationIdentity`, `runId`, `issueId`, `specId`, `target`, `taskRef`, `worktree`, `topic`, full `before` candidate and cumulative `repairWaves`. Exact body read-back supplies the native identity and body digest referenced by the [complete repair-wave yield](../../../engineering/execute-issue/references/model-repair-yield.md). This preserves existing repair accounting; progress is neither completion nor blocked evidence and grants no additional repair authority. Legacy progress remains unchanged.
