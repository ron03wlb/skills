# GitHub payload encoding

This is the GitHub encoding of existing producer and implementation owner contracts. It adds no approval, review, completion, or Run authority. Consumers read exact GitHub node IDs and SHA-256 of comment bodies with `github-workflow-records.mjs`; prose is displayed but never treated as completion. Only repository OWNER, MEMBER or COLLABORATOR records are accepted. An unknown legacy encoding is preserved for explicit compatibility reconciliation, never translated into historical success.

The owning skill renders its already-verified payload with `renderWorkflowRecord(record)` from the installed package's `scripts/github-workflow-records.mjs`, appends that exact body through the configured GitHub CLI, and reads the resulting comment back. Use `--body-file` or a structured API input, never interpolate a multiline JSON payload into a shell argument. A comment contains exactly one `workflow-record` fenced JSON block. The GitHub comment node ID supplies `identity`; never invent it in a payload. Reuse one exact existing record after a lost response; conflicting or multiple records stop before another append.

## to-spec owner

After the approved canonical Issue body is published, its exact UTF-8 SHA-256 is `authority.approvedScopeHash`, with the `sha256:` prefix. Append `kind: spec_publication`, `repositoryId: github:<owner>/<repo>`, and `authority` containing the immutable Issue node ID as `specId`, `target`, full `planningSeal`, `classification: SINGLE|MULTI`, `approvedScopeHash`, and `decompositionIdentity: null`. This publication comment is separate from the canonical body, avoiding a self-referential digest.

Bind the v2 checkpoint through `bindProducerCheckpointOperationIdentity` using the same repository, Spec, producer, target, baseline and bindings. Consume the existing `planning_seal.read_back` and `publication.read_back` stages, with the actual publication comment ID as `publicationIdentity` and Issue node ID as `trackerIdentity`.

Append `kind: producer_handoff`, the same authority fields, `producerCommand: to-spec`, the exact `checkpointIdentity`, actual `transactionIdentity`, `publicationIdentity`, `trackerIdentity`, and `recordIdentities: [publicationIdentity]`. Read its native comment identity before advancing `handoff.completed` with `{handoffIdentity}`. The Run reader does not create, advance or repair a producer checkpoint.

## to-tickets owner

Keep the existing Decomposition payload and render its GitHub data as `kind: decomposition:v1`, `parent` (Spec node ID), `target`, `planningSeal`, `approvedScopeHash`, `decompositionMapping` (key to Issue node ID), and `blockerEdges` (`{blocker, blocked}` node-ID pairs in canonical order). Include `childBodyDigests` (Issue node ID to exact canonical body SHA-256) and the derived `readyFrontier` read-back. These compact values let downstream code detect contract changes without rerunning generation or semantic validation. Publish/read this encoding at the existing Decomposition stage; derive the expected frontier from the validated graph before publication, then independently verify its live ready state at the existing ready-state stage. A frontier mismatch still stops handoff publication.

The composite `kind: producer_handoff` adds the existing exact v2 `checkpointIdentity`, authority with the actual `decompositionIdentity`, upstream publication and handoff identities, `operationReceipt` with transaction identity plus the exact decomposition/ready-state read-back receipts, decomposition digest/mapping/edges, and `recordIdentities: [upstreamPublicationIdentity, decompositionIdentity]`. The GitHub binding uses native parent and blocker evidence. GitLab and local trackers keep their own encoding; this installed Codex host currently requires the GitHub static configuration.

## execute-issue owner

Only after the completion-evidence reference's checks pass, encode its existing payload with `kind: implementation_complete`, `issueId` and `specId` (immutable node IDs), `target`, `targetWorktree`, `topic`, `worktree` (the exact Issue path), `baseline`, `candidate`, full `operationIdentity`, `planningSeal`, `manualAttestations`, `workflowArtifacts`, `standards: clean`, `spec: clean`, nonempty `verification` command/result entries, `repairWaves`, and `worktreeState: clean`. Required adoption records remain separate and keep their existing contracts.

A genuine blocked exit uses `kind: implementation_blocked`, exact Issue/Spec identities, reason and available lane/evidence fields. New blocked records supersede completion only under execute-issue's existing invalidation rule; a target-only close problem must not be encoded as an implementation failure.
