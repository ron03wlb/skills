# Publish Spec #37: Simplify Ron workflow planning

## Outcome

Publish one Multi-Issue Tracker Spec that replaces the failed operational assumptions delivered through #31-#36 with a smaller workflow contract: concurrent planning operations, short-lived serialization only for actual target mutations, producer-specific checkpoint profiles, and concrete runtime/setup verification.

## Bound authority

- Tracker: GitHub repository `ron03wlb/skills`
- Spec: `#37` in primary mode
- Target: `features/ron`
- Planning Seal: `ebb59d0ca228679e9dedbd2a8fffa5ff541f6b3d` (`reused`)
- Delivery classification: `Multi-Issue`
- Scope source: the active user request to repair and simplify Ron workflow skills after the reproduced `to-tickets` and concurrent-Spec failures

## Publication sequence

1. Create the exact Workflow checkpoint transaction for Spec #37 before this plan is written.
2. Write and read back only this bound plan content.
3. Acquire the shared target mutation writer, commit only this plan, verify the target and commit, then release the writer.
4. Invoke `attest-target-contribution` with the prospective checkpoint packet and read back the immutable contribution record.
5. Replace the draft body with the canonical Multi-Issue Spec, apply `ready-for-agent`, and read back the exact publication.
6. Append and read back the immutable `to-spec` handoff, ending only with `/to-tickets #37`.

## Verification

- The target is clean before transaction creation and before the plan checkpoint commit.
- The checkpoint receipt advances exactly through `plan.written`, `checkpoint.committed`, `attestation.read_back`, `publication.read_back`, and `handoff.completed`.
- The checkpoint commit contains only this plan file and descends from the Planning Seal.
- The contribution comment contains the exact owner, target, checkpoint commit, purpose, attester, and target-range-only statement.
- The published Issue uses the Multi-Issue template, contains no child Acceptance Criteria, Implementation Plan, touchpoints, or verification commands, has `ready-for-agent`, and ends with `/to-tickets #37`.
- The final worktree is clean, no implementation or Run starts, and nothing is pushed or deployed.

## Exclusions

This plan authorizes only the Spec #37 publication transaction. It does not authorize child Issue creation, workflow implementation, integration, closeout, push, release, deployment, or repair of unrelated state.
