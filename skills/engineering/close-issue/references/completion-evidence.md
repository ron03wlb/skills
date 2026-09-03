# Completion evidence

Read this reference only for an Executable Issue whose `implementation_complete` note must be validated. Parent-only closeout has no implementation completion.

## Workflow artifacts

Before interpreting an absent field, inspect the parent or linked Spec for the logical `workflow_artifacts_contract_adopted:v1` record that exactly matches the completion's repository, tracker, Spec, and Issue target branch. Collapse multiple payload-identical physical records into one logical adoption. Validate its explicit `legacyCompletionFrontier`, including an empty list: every unique entry must bind one exact Issue, tracker-native immutable completion-note identity when available or durable local record locator, and SHA-256 of the exact note body. Do not compare order across parent and child histories. When the scope is adopted, a completion without `workflowArtifacts` remains legacy only if its exact identity and body digest occur in that frozen frontier; otherwise closeout must stop. Missing, duplicate, malformed, unreadable, or digest-mismatched frontier evidence stops. A scope with no adoption record remains readable as legacy under its original contract; never retrofit it. Malformed, mismatched, unreadable, or payload-conflicting adoption records plausibly bound to the same repository, tracker, and Spec stop, while a well-formed record for another exact scope does not classify this one.

Determine plausible binding from the record kind and its physical parent or linked-Spec tracker location before validating payload scope fields. Never filter out a malformed record by a repository, tracker, Spec, or target field that the record itself is required to prove.

When the note contains `workflowArtifacts`, require an explicit list whose entries each contain one unique repository-relative path (`path`), truthful requirement source (`requirementSource`), and purpose (`purpose`); require every path to be changed inside the exact execution-baseline-to-candidate contribution and covered by the note's candidate-bound clean Standards and Spec review. Reject missing paths, false sources, or runtime, public-contract, routing, Acceptance Criteria, governance, arbitrary, ambiguous, or unowned material scope.

`workflowArtifacts` supplies scope classification only. It never supplies Issue-to-candidate identity, contribution coverage, verification authority, or a reason to bypass any closeout precondition.

The Spec-scoped adoption record is compatibility evidence only and grants no implementation, review, coverage, verification, close, push, or deployment authority.

## Manual attestations

Require `manualAttestations` to be an explicit list, including an empty list when none were consumed. For every v2 entry, re-read the tracker-native immutable `manual_prerequisite_complete:v2` identity and require its exact Issue, Prerequisite candidate, Git blob, normalized artifact path, and `APPLIED` or `NO_OP` outcome to match the completion. Require the candidate and blob to exist locally, the recorded path at that candidate to resolve to the blob, and the Prerequisite candidate to be an ancestor of completion candidate `C`. A structured v1 entry or historical path-string entry remains readable only when one exact path-bound `manual_prerequisite_complete:v1` exists for a legacy non-generated artifact; generated candidate evidence, a v2 record, or any conflicting plausible attestation makes legacy substitution invalid and stops. Manual attestation evidence supplies no contribution, review, verification, close, push, deploy, database, or scope authority.
