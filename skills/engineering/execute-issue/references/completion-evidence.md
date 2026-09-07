# Implementation completion evidence

Read this reference only after final verification passes, Standards and Spec are clean, the Issue worktree is clean, and `HEAD` is the reviewed candidate. This file solely owns workflow-artifact compatibility-adoption publication and the `implementation_complete` payload. Operation-identity adoption remains solely owned by [operation identity](operation-identity.md); consume its read-back result here without repeating its validation. This file grants no integration, close, push, deployment, or external-execution authority.

## Workflow artifact compatibility adoption

Before the first prospective completion under one exact repository, tracker, parent or linked Spec, and Issue target branch, inspect that Spec and its exact child histories, including local-file tracker histories, for one logical `workflow_artifacts_contract_adopted:v1` record. If none exists, freeze every already read-back valid completion without `workflowArtifacts` into its `legacyCompletionFrontier`, then append one durable adoption record binding the exact four scope identities plus that explicit list, including an empty list. Each frontier entry binds the exact Issue, tracker-native immutable completion-note identity when available or durable local record locator, and SHA-256 of the exact note body. Read the adoption back once; otherwise reuse the existing logical record. Do not infer order across parent and child histories: after adoption, a completion without `workflowArtifacts` is legacy only when its exact identity and body digest occur in that frozen frontier. Missing, duplicate, malformed, mismatched, unreadable, or digest-mismatched frontier evidence stops. Never use this adoption to classify `operationIdentity`.

Concurrent first `workflow_artifacts_contract_adopted:v1` completions may publish multiple payload-identical physical adoption records; collapse them idempotently into one logical record and never append another after any exact payload is visible. Malformed, mismatched, unreadable, or payload-conflicting adoption records plausibly bound to the same repository, tracker, and Spec stop without writing completion; write or read-back uncertainty reports unresolved tracker ambiguity. A scope with no adoption record remains legacy-compatible. Never add a completion to the frontier retroactively. The record is compatibility evidence only and grants no implementation, review, coverage, verification, close, push, or deployment authority.

Determine plausible binding from the record kind and its physical parent or linked-Spec tracker location before validating payload scope fields. Never filter out a malformed record by a repository, tracker, Spec, or target field that the record itself is required to prove.

## Completion payload

Write one compact tracker completion note containing:

- Issue and linked Spec; Issue target branch/worktree, topic branch/worktree, baseline, and final candidate;
- completion note `operationIdentity`: the full owner-derived versioned receipt binding canonical repository, linked Spec, approved publication identity or hash, producer `execute-issue`, stage `implementation`, and stable Issue;
- Planning Seal SHA/state (`created`, `reused`, `successor`, or `not-applicable`);
- `manualAttestations`: every consumed attestation, or an explicit empty list. A v2 entry records `kind: manual_prerequisite_complete:v2`, its tracker-native immutable identity, Issue, Prerequisite candidate, Git blob, artifact, declared environment identity where applicable, and outcome; a v1 entry records its immutable identity, Issue, and exact legacy non-generated artifact path. Never degrade v2 to a path string or infer a missing field;
- `workflowArtifacts`: the reviewed prospective entries with exact `path`, `requirementSource`, and `purpose`, or an explicit empty list;
- `standards: clean`, `spec: clean`, exact verification commands/results, repair-wave count, and any Material plan deviations;
- `worktree: clean` and `implementation_complete`.

For the installed Codex GitHub host, serialize this same owner-verified payload using [GitHub payload encoding](../../../personal/run-issue-workflow/references/github-payloads.md). The encoding adds no new completion authority.

Read the note back once and stop. Later movement of the Issue target branch does not change this state. Execution never integrates the target, removes a worktree, closes the Issue, pushes, or deploys; subsequent `close-issue` entry retains its own checks and consumes direct human authority, a valid DAG Run Grant, or the continuing approved maintenance handoff from [its owner](../../../../docs/agents/references/approved-pre-run-workflow-maintenance.md).
