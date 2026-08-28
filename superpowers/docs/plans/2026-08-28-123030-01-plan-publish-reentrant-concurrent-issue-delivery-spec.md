# Publish the Re-entrant Concurrent Issue Delivery Spec

**Goal:** Publish one primary Multi-Issue Spec that makes Issue decomposition re-entrant, keeps concurrent Issue execution independent from serial closeout, and verifies exact local or already-pushed target ranges without closeout receipts.
**Why planning is required:** This changes public workflow contracts across tracker publication, Git integration, Issue closure, and push-readiness evidence, and publication creates a durable local Planning Seal plus an external GitHub Issue.
**Acceptance:** The Planning Seal contains only the approved `CONTEXT.md` delta and ADRs 0036-0038; all unrelated dirty and untracked work remains intact. The GitHub Spec is open, labeled `ready-for-agent`, records the full seal SHA and Multi-Issue template, contains no child executable sections, and ends with its exact `/to-tickets <Spec-ID>` command. Any post-seal publication failure retains the seal and reports exact partial state without amend, rollback, push, cleanup, or unrelated mutation.

### Outcome 1: Freeze the approved parent contract
- Work: Synthesize the settled re-entrant decomposition, concurrent execution, minimal closeout, parent closeout, target-range verification, mapping authority, and failure boundaries into the Multi-Issue parent template. Keep the parent to aggregate constraints and three dependency-ordered outcomes.
- Verify: Inspect the source headings and content; require Overall Outcome, Cross-Issue Constraints, Decomposition Rationale, exclusions, and the `/to-tickets` handoff, with no Acceptance Criteria, Implementation Plan, touchpoint, or Verification section.

### Outcome 2: Create the scoped Planning Seal
- Work: Stage only `CONTEXT.md`, ADR 0036, ADR 0037, and ADR 0038; leave the pre-existing ADR-0022 edit and every other dirty or untracked file outside the commit.
- Verify: `git diff --cached --check`; inspect the complete staged diff and name status; after commit, prove the full SHA, owned path set, parent ancestry, and unchanged unrelated snapshot.

### Outcome 3: Publish and read back the primary Spec
- Work: Create one GitHub Issue in `ron03wlb/skills`, replace the placeholder with its real Spec ID, apply `ready-for-agent`, and read back the exact body and metadata once.
- Verify: `gh issue view <Spec-ID> --repo ron03wlb/skills --comments --json number,title,body,state,labels,comments,url`; require primary mode, full seal SHA/state, Multi-Issue shape, selected template, open state, ready label, cross-Issue constraints, decomposition rationale, and `/to-tickets <Spec-ID>`.

### Outcome 4: Gate completion claims
- Work: Map each claimed result to fresh Git, filesystem, and tracker evidence after the final mutation.
- Verify: Recheck the seal commit, published Issue, source/read-back equality, excluded headings, formatting, final worktree status, and unrelated-file hashes; report only proven results and the exact next command.
