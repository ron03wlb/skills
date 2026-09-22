# Tracker-only completion

Use this branch only when a published Single-Issue Spec explicitly requires one tracker outcome, permits exactly one final evidence note, declares no repository candidate, and marks the documentation-only Seal candidate as not applicable. All four conditions must be present in the read-back Issue. This branch does not reclassify an ordinary implementation Issue and grants no repository, SQL, push, deployment, or extra tracker-write authority.

## Execution receipt

Direct `execute-issue` entry keeps its deterministic `execute-issue` operation identity and the published Planning Seal, but creates no topic branch, Issue worktree, commit, or candidate. It verifies the tracker outcome against the Spec and applicable source authority, obtains clean Spec review, and records read-only evidence checks. Repository Standards review is `not-applicable` because there is no repository contribution; it is not reported as a clean code review.

The one final note contains the complete human-readable outcome followed by exactly one `workflow-record` fenced JSON block. The record is `implementation_complete` with this exact tracker-only shape:

```json
{
  "kind": "implementation_complete",
  "completionMode": "tracker_only:v1",
  "repositoryId": "<canonical tracker repository identity>",
  "issueId": "<stable Issue identity>",
  "specId": "<stable linked Spec identity>",
  "target": "<recorded target branch>",
  "operationIdentity": {},
  "planningSeal": "<published Planning Seal>",
  "planningSealState": "reused",
  "baseline": null,
  "candidate": null,
  "topic": null,
  "worktree": null,
  "reviewBasis": null,
  "trackerOutcome": {
    "kind": "<published tracker outcome kind>",
    "proseSha256": "sha256:<digest>"
  },
  "manualAttestations": [],
  "workflowArtifacts": [],
  "standards": "not-applicable",
  "spec": "clean",
  "verification": [
    { "command": "<read-only evidence check>", "result": "PASS — <observed result>" }
  ],
  "repairWaveCount": 0,
  "materialPlanDeviations": [],
  "worktreeState": "not-applicable"
}
```

`trackerOutcome.kind` is the exact outcome kind bound by the published Issue and execution authority (`authority_drift_register:v1` for the authority/drift register). `trackerOutcome.proseSha256` is SHA-256 of the UTF-8 bytes of the final note prose after JavaScript `trim()`, excluding the blank separator and fenced record. The installed tracker record renderer and reader own that normalization and exact read-back; GitLab publication uses `appendWorkflowRecord({ prose })` through its mutation owner. Every verification entry is non-empty and begins `PASS`, `PASSED`, or `SUCCEEDED`; at least one entry proves the tracker outcome's source and publication inputs. The record carries the current full `operationIdentity`, explicit empty `workflowArtifacts`, and explicit empty `manualAttestations`, so this current payload needs no legacy compatibility adoption. A one-note scope writes no adoption notes.

Before publication, require the final prose, record, and operation identity to agree with the same read-back Issue and approved publication. Append once through the tracker mutation owner, then read back the native note identity, exact body SHA-256, record, and prose SHA-256. An unknown result stops without retry. Execution returns that receipt and performs no repository mutation or close.

## Closeout

Direct `close-issue` recognizes this branch only from a valid current `implementation_complete` whose `completionMode` is `tracker_only:v1`. Re-read the Issue declaration and require the same Single-Issue identity, target, approved publication, Planning Seal, outcome kind, one-note constraint, no-candidate declaration, and documentation-only inapplicability. Validate the exact note with `assertTrackerOnlyCompletion`, including its native identity, body digest, prose digest, operation identity, explicit null repository fields, clean Spec result, read-only passing verification, and empty artifact and attestation lists.

Tracker-only closeout has one action: close the Issue and read it back. It performs no merge, integration verification, worktree removal, target mutation, or candidate-reachability claim. The close owner retains its deterministic `close-issue` operation identity through `withTrackerOnlyCloseLease` while changing tracker state; it does not acquire the target mutation writer because no target mutation exists. If the Issue is already closed, accept it only when the same exact tracker-only completion note remains current and valid. Closeout writes no second completion or closeout note.

## Fail closed

Stop without mutation when the declaration is missing or ambiguous; any repository contribution, candidate, topic, worktree, Manual prerequisite, or workflow artifact is present; the note count authority does not permit the one write; the final note has zero or multiple records; the prose digest differs; the operation identity, Planning Seal, target, or Issue differs; review or verification is not clean; publication is unresolved; or close read-back is unavailable. Return to planning for a scope change and to the workflow owner for an encoding defect.
