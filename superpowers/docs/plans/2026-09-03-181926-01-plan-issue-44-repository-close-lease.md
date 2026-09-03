# Issue 44 repository closeout lease

**Goal:** Serialize `close-issue` per canonical Git common directory while preserving the existing target mutation writer and cross-repository concurrency.
**Why planning is required:** This changes a concurrency lease, stale-owner recovery, and the public `close-issue` contract, so the repository classifies it as High-risk.
**Acceptance:** One repository-close lease excludes different-target closeouts in the same repository, remains independent across repositories, is acquired before and released after the target writer by the leaf contract, fails closed on contested or mismatched ownership without a queue service, preserves existing target-writer and receipt behavior, passes focused and full verification, and finishes as a clean reviewed candidate without integration, push, deployment, or Issue closure. Tracker-note uncertainty stops without claiming completion.

### Outcome 1: Repository-scoped close lease
- Work: Extend `skills/personal/run-issue-workflow/scripts/run-store.mjs` with a single lease rooted under the canonical `gitCommonDir`, including atomic acquire, observation, handle fencing, reverse-safe release support, and exact stale-owner recovery. Keep the target-keyed writer storage and compatibility APIs unchanged.
- Risks/open questions: Lease owner parsing must distinguish repository-close owners from target writers while retaining frozen target-writer records; acquisition races and stale-proof mismatches must leave the current owner fenced and observable.
- Verify: `rtk node --test --test-name-pattern="repository close|close lease|target mutation writer|different repositories|lease ownership" tests/ron-workflow/run-issue-workflow-core.test.mjs`

### Outcome 2: Leaf-owned ordered closeout contract
- Work: Update `skills/engineering/close-issue/SKILL.md`, its Codex metadata, `docs/engineering/close-issue.md`, and focused router wording so direct-human and DAG entry both acquire repository-close then target-mutation leases, hold both through required read-back, and release target then repository. Keep coordinators observational and keep execution outside the repository lease.
- Risks/open questions: The operational entry must remain at or below 1,500 words and avoid duplicating coordinator waiting or recovery schemas owned elsewhere.
- Verify: `rtk node --test --test-name-pattern="repository close|close lease|lease ownership" tests/ron-workflow/run-issue-workflow-coordinator.test.mjs tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 3: Real boundary regression proof
- Work: Add vertical-slice tests through the real filesystem store and public Skill contracts for same-repository/different-target exclusion, post-release acquisition, cross-repository concurrency, observation, fencing, stale recovery, acquisition order, reverse release, and absence of a queue service.
- Risks/open questions: Tests must assert observable public behavior rather than mirror lock internals or build the later integrated-route matrix owned by child Issue 48.
- Verify: `rtk node --test tests/ron-workflow/run-issue-workflow-core.test.mjs tests/ron-workflow/run-issue-workflow-coordinator.test.mjs tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 4: Reviewed completion candidate
- Work: Commit coherent slices, declare this plan as the only workflow-required documentation artifact, run final focused and repository-wide checks, complete independent Standards and Spec review with confirmed findings repaired, then publish and read back the exact `implementation_complete` evidence.
- Risks/open questions: Any scope change, unresolved review finding, dirty worktree, failed full suite, tracker write/read-back uncertainty, or candidate identity drift stops completion while preserving the Issue lane.
- Verify: `rtk node --test tests/ron-workflow/*.test.mjs` and `rtk git diff --check`
