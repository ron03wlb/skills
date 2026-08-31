# Harden DAG Run control and remediation authority

**Goal:** Prevent stale coordinator batches from starting later mutating actions and scope environment remediation to the exact dispatch attempt without invalidating legacy journals.
**Why planning is required:** This change modifies concurrency and workflow-authority enforcement in the durable DAG Run control path.
**Acceptance:** Every mutating action is fenced by the control revision that authorized its batch; remediation authority uses Issue, attempt, and fingerprint; legacy no-attempt records remain deterministic and fail closed when ambiguous; all focused and repository-required checks pass without expanding the workflow surface.

### Outcome 1: Stale mutating actions are fenced
- Work: Revalidate the latest journal control revision before each reducer-authorized mutating action. On drift, abandon the remaining batch and perform full reconciliation. Preserve already-started work and keep `reconcile_run` read-only. Covers AC-1, AC-2, and AC-5.
- Risks/open questions: The fence must not cancel an action already in progress or allow a stale pause or stop transition to be appended.
- Verify: `rtk node --test --test-name-pattern="control revision|stale legal action" tests/ron-workflow/run-issue-workflow-coordinator.test.mjs`

### Outcome 2: Remediation authority is dispatch-attempt scoped
- Work: Carry the exact current attempt through remediation action generation, coordinator execution, journal validation, reducer exhaustion, duplicate detection, and current-failure diagnosis. Covers AC-3 and AC-5.
- Risks/open questions: Remediation stays outside the transient three-attempt retry budget, and no new adapter or retry authority is introduced.
- Verify: `rtk node --test --test-name-pattern="remediation.*attempt" tests/ron-workflow/run-issue-workflow-core.test.mjs tests/ron-workflow/run-issue-workflow-coordinator.test.mjs`

### Outcome 3: Legacy remediation records remain deterministic
- Work: Attribute each valid no-attempt `remediation.recorded` event to the latest preceding dispatch for the same Issue while rejecting missing, mismatched, future, duplicate, or ambiguous attempt evidence. Covers AC-4 and AC-5.
- Risks/open questions: Existing journal bytes remain unchanged and the `dag-run-event:v1` schema is not migrated.
- Verify: `rtk node --test --test-name-pattern="legacy remediation|remediation.*attempt" tests/ron-workflow/run-issue-workflow-core.test.mjs`

### Outcome 4: The exact candidate is verified and reviewed
- Work: Synchronize the personal skill instructions, runtime, and focused tests; inspect the baseline-to-candidate contribution; run independent Standards and Spec review; repair only confirmed in-scope findings.
- Risks/open questions: Stop on any change to Acceptance Criteria, target, exclusions, ownership, public commands, dependencies, promoted packaging, or ADR semantics.
- Verify: `rtk node --test tests/ron-workflow/*.test.mjs`
