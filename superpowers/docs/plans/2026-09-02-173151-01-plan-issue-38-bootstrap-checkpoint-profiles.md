# Publish Issue #38: Bootstrap operation-scoped checkpoint profiles

**Goal:** Publish one Single-Issue Spec that authorizes the narrow checkpoint-store bootstrap repair required before retrying Multi-Issue Spec #37.
**Why planning is required:** The operation commits a workflow checkpoint and mutates GitHub Issue authority, while the store change itself affects persisted retry and concurrency semantics.
**Acceptance:** Planning Seal `47dba593104405c0a4fab8225abb8e4513ae4329` remains the selected ancestor of `features/ron`; the publication transaction starts from a clean target; only this plan enters its checkpoint commit; Issue #38 is read back as the exact Single-Issue contract with `ready-for-agent`; every transaction stage and immutable contribution record is read back; any identity or persistence mismatch stops without duplicate Issue creation, rollback, Run start, implementation, push, or deploy.

### Outcome 1: Bind the exact publication operation
- Work: Reserve and read back GitHub Issue #38, bind the primary `to-spec` operation to the selected Planning Seal, clean target baseline, exact plan path and generated content identity, and create the Workflow checkpoint transaction before writing the plan.
- Risks/open questions: GitHub must allocate exactly #38; any conflicting Issue identity, active transaction, dirty target, or writer state stops the operation.
- Verify: read back the draft tracker identity, transaction identity, first stage, target, baseline, plan path, and generated content identity.

### Outcome 2: Settle the publication checkpoint
- Work: Write only the bound plan, advance `plan.written`, commit only that plan under the shared Target mutation writer, verify the commit and clean target, then obtain the prospective `direct_target_contribution:v1` record through `attest-target-contribution`.
- Verify: inspect the checkpoint commit's whole diff, target ancestry and status; read back the immutable tracker comment and `attestation.read_back` result.

### Outcome 3: Publish the executable Spec and handoff
- Work: Replace the draft with the canonical Single-Issue body, apply `ready-for-agent`, verify every AC-to-plan-to-verification mapping, append the exact publication and final handoff receipts, and stop before Run or implementation.
- Verify: read Issue #38 body, label, classification, Planning Seal, target and `/run-issue-workflow 38` route; re-read the completed transaction and final Git preservation state.
