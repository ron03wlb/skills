# Issue #34: checkpointed to-spec Run handoff

**Goal:** Make `to-spec` publish primary and revision Specs through one retry-safe Workflow checkpoint transaction, then route the completed Spec to the correct downstream command.
**Why planning is required:** This changes public workflow authority, tracker mutation ordering, Git target serialization, and retry behavior across promoted skill surfaces.
**Acceptance:** The unchanged Issue #34 AC-1 through AC-5 pass at the published contract-test seam; the full Ron workflow suite remains green; the candidate contains only Issue #34 behavior plus this required plan; Standards and Spec review are clean; no live tracker mutation occurs before the final completion note, and no integration, close, push, deployment, prerequisite execution, Run-journal mutation, or worktree cleanup occurs.

### Outcome 1: Producer entry is exact and resumable

- Work: Update the `to-spec` contract to revalidate the visible Planning handoff and Planning Seal, require a clean target for a new checkpoint, and resume only one identity-exact transaction while preserving unrelated work and reporting mismatches without repair.
- Verify: `rtk node --test --test-name-pattern="to-spec|workflow checkpoint|Planning handoff|handoff.completed|Single-Issue.*Run" tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 2: Checkpoint creation, commit, and attestation are ordered

- Work: Bind generated plan content before writing, create the Workflow checkpoint transaction first, commit only its plan under the shared target writer, require Git/read-back evidence before writer release, and hand the exact prospective packet to model-invoked `attest-target-contribution` without a second confirmation.
- Verify: `rtk node --test --test-name-pattern="to-spec|workflow checkpoint|Planning handoff|handoff.completed|Single-Issue.*Run" tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 3: Tracker publication and immutable handoff are fail-closed

- Work: Define primary identity creation and revision publication ordering after attestation read-back, require exact body/label/classification/Seal/template/target read-back, and append one immutable `handoff.completed` that binds all required identities; preserve the first unsatisfied stage on partial failure.
- Verify: `rtk node --test --test-name-pattern="to-spec|workflow checkpoint|Planning handoff|handoff.completed|Single-Issue.*Run" tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 4: Delivery routing and promoted surfaces agree

- Work: Route Single-Issue Specs only to `/run-issue-workflow <Spec-ID>` and Multi-Issue Specs only to `/to-tickets <Spec-ID>`; synchronize the Single-Issue template, invocation metadata, human docs, `ask-matt`, affected README summaries, and contract tests without implementing the `to-tickets` producer or Run reducer children.
- Verify: `rtk node --test tests/ron-workflow/skill-contracts.test.mjs`
- Verify: `rtk node --test tests/ron-workflow/*.test.mjs`
- Verify: `rtk git diff --check`
