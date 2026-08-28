## Planning baseline

- Mode: primary
- Commit: 5595fe48ec2b1919ed5295203499d2e8429e0307
- Seal: created

## Delivery classification

- Shape: Single-Issue
- Rationale: one cohesive internal refactor fits one Issue worktree, execution context, reviewed candidate, and closeout; it has no independently deliverable outcomes or blocking edges.

## Problem Statement

`close-issue` currently owns the correct workflow boundary but also describes low-level dirty-target snapshotting, NUL-safe Git parsing, path collision, filesystem case handling, fingerprinting, and post-merge hook inspection inline. Those deterministic mechanics are difficult to verify independently and make the user-facing skill carry both human authority transitions and implementation algorithms.

Splitting those mechanics into another public skill would add a meaningless human handoff. The public `/close-issue <Issue-ID>` contract, tracker ownership, integration authority, receipt transitions, exact worktree cleanup, and Issue closure must remain together while the repository inspection becomes one testable internal module.

## Proposed Outcome

Add one private read-only preservation module under `close-issue`. `close-issue` continues to accept only an Issue ID, resolve tracker state and local identities, construct the integration candidate, own all mutations, and decide whether the workflow may continue. It invokes the module before and after integration with already resolved repository/worktree location and immutable local identities.

The module performs one atomic inspection that derives target identity, dirty state, complete candidate delta, rename endpoints, repository/filesystem case semantics, collisions, and effective hook evidence directly from Git and the filesystem. It returns a narrow `closeout-preservation-inspection:v1` result through invocation-unique strict-UTF-8 files and never reads or mutates the tracker.

Only a complete trustworthy `SAFE` result with exit code zero authorizes continuation. Classified `COLLISION` or `BLOCKED` results are diagnostic non-zero outcomes; missing, stale, malformed, partial, or schema-invalid output stops without inference. Existing `dirty-target-preservation:v1` receipt ownership and all closeout safety boundaries remain unchanged.

## User Outcomes

1. A developer still invokes `/close-issue <Issue-ID>` without learning or authorizing an internal preservation step.
2. Unrelated target work is protected by deterministic repository evidence whose edge cases can be exercised independently of the workflow prompt.
3. A maintainer can change preservation mechanics inside one deep internal module without expanding the public skill surface or tracker contract.

## Acceptance Criteria

- **AC-1 - Stable public ownership:** `/close-issue <Issue-ID>` remains the only user-visible closeout entry. `close-issue` owns Issue and execution-state reads, blocker checks, candidate and integration identities, merge, tracker receipt transitions/read-back, exact Issue worktree cleanup, and Issue closure. The internal module is never independently invoked by the user and never reads or mutates tracker state.
- **AC-2 - One atomic inspection:** Before and after integration, `close-issue` invokes the same single inspection operation with an already resolved repository/worktree location, expected target identity, target-before `T`, and integration candidate `I`. The module derives all preservation observations itself; the caller does not precompute or pass dirty-path lists, candidate-path lists, fingerprints, collision results, case semantics, or hook evidence.
- **AC-3 - Canonical preservation evidence:** One inspection verifies the observed target identity and deterministically covers staged, unstaged, and untracked state; both endpoints of dirty and candidate renames; path/status class, file type/mode, worktree fingerprints, and index entries; NUL-safe Git parsing; repository/filesystem case semantics; same-path and ancestor/descendant path-prefix collision; the complete `T..I` delta; and effective post-merge hook resolution and fingerprinting. Equivalent pre/post user state produces equal digest/count/hook evidence.
- **AC-4 - Narrow atomic transport:** Every invocation uses unique strict-UTF-8 JSON input and output files and rejects a pre-existing final output. The helper writes a complete `closeout-preservation-inspection:v1` result to a helper-owned sibling temporary file and atomically renames it to the final output. The result contains only schema/status, observed target identity, dirty digest and staged/unstaged/untracked counts, hook fingerprint, collision outcome, and stable reason code; it contains no Issue, execution-state, candidate, receipt-phase, raw-path, or file-content fields. Stdout and a reusable repository-local result file are not evidence transports.
- **AC-5 - Fail-closed result handling:** Only a complete expected-schema `SAFE` result with every required field and exit code zero authorizes `close-issue` to continue. A complete classified `COLLISION` or `BLOCKED` result may be returned with a non-zero exit for diagnosis but never authorizes mutation. Crash, command failure, stale output, missing final output, malformed JSON, missing field, schema mismatch, or any untrusted state stops without inference. Cleanup removes only input, output, or helper-temp files owned by that invocation.
- **AC-6 - Receipt and closeout continuity:** `close-issue`, not the module, combines inspection evidence with Issue ID, execution-state identity `E`, target branch, candidate `C`, integration candidate `I`, and phase to write and read back the separate `dirty-target-preservation:v1` receipt. Existing `PREPARED`, `VERIFIED`, and `FAILED` gates, collision stop, target/evidence drift handling, exact-candidate ancestry proof, fast-forward-only target mutation, cleanup gate, closure read-back, and prohibitions on automatic stash, reset, clean, rollback, repair, push, remote merge, and deploy remain effective.
- **AC-7 - Deep-module delivery:** Deterministic inspection mechanics live in one private `close-issue` script with no new public skill, tracker abstraction, external runtime dependency, reusable result state, or generic framework. `close-issue/SKILL.md` retains workflow policy and stop conditions without duplicating the extraction/canonicalization algorithm. Focused tests cover successful evidence, staged/unstaged/untracked state, rename and case/path-prefix behavior, hook evidence, pre/post equality, collision, blocked identity, UTF-8 transport, pre-existing output, and interrupted or partial publication; promoted documentation and contract tests remain synchronized.

## Implementation Plan

Expected touchpoints are non-exhaustive:

- `skills/engineering/close-issue/scripts/preservation.mjs`
- `skills/engineering/close-issue/SKILL.md`
- `docs/engineering/close-issue.md`
- `tests/ron-workflow/close-issue-preservation.test.mjs`
- `tests/ron-workflow/skill-contracts.test.mjs`

### Step 1: Build the inspection module and focused fixtures

Add one dependency-free Node module and real-Git filesystem fixtures that pin the input/output schema, canonical snapshot, collision, hook, case, UTF-8, stale-output, and atomic-publication failure behavior. Keep raw paths and contents inside the inspection implementation. **Covers: AC-2, AC-3, AC-4, AC-5, AC-7.**

### Step 2: Delegate preservation mechanics from close-issue

Replace inline extraction and canonicalization mechanics with the invocation and validation contract for the same pre/post inspection operation. Keep Issue-ID resolution, `E`/`C`/`I`, tracker receipts, integration, cleanup, closure, and every existing stop boundary in `close-issue`. **Covers: AC-1, AC-2, AC-4, AC-5, AC-6, AC-7.**

### Step 3: Synchronize the promoted documentation and contract tests

Explain the unchanged public workflow and internal deep-module boundary in the human-facing page. Update contract tests to require the helper, its narrow schema/transport, fail-closed delegation, separate receipt ownership, and absence of a new public skill or dependency. **Covers: AC-1, AC-4, AC-5, AC-6, AC-7.**

## Verification

- Run `node --check skills/engineering/close-issue/scripts/preservation.mjs` and `node --test tests/ron-workflow/close-issue-preservation.test.mjs`; require the focused fixtures to prove canonical evidence, collision/blocking, UTF-8 file transport, atomic publication, stale-output rejection, and pre/post equality. **Covers: AC-2, AC-3, AC-4, AC-5, AC-7.**
- Run `node --test tests/ron-workflow/skill-contracts.test.mjs tests/ron-workflow/wiki.test.mjs`; require the existing closeout workflow and packaging contracts plus the new helper boundary to pass. **Covers: AC-1, AC-4, AC-5, AC-6, AC-7.**
- Inspect the final diff to confirm preservation algorithms are implemented once in the private helper, while `close-issue` still owns Issue-ID routing, mutations, receipts, cleanup, closure, and all stop conditions. **Covers: AC-1, AC-2, AC-3, AC-5, AC-6, AC-7.**
- Compare every defined `AC-n` with Implementation Plan and Verification references and stop on missing, unexpected, or orphan mappings. **Covers: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6, AC-7.**
- Run `git diff --check` and inspect `git status --short` to verify formatting and preservation of unrelated staged, unstaged, and untracked work. **Covers: AC-5, AC-6, AC-7.**

## Out of Scope

- Adding a public preservation skill, changing `/close-issue <Issue-ID>`, or merging `execute-issue`, `close-issue`, and push authorization into one workflow step.
- Letting the helper read Issues, comments, blockers, execution state, receipts, or any other tracker data.
- Letting the helper construct integration candidates, merge, mutate receipts, remove worktrees, close Issues, repair product code, push, remote-merge, or deploy.
- Changing the meaning of `dirty-target-preservation:v1`, weakening existing preservation/identity/read-back gates, or introducing automatic recovery from a failed or untrusted inspection.
- Creating a reusable generic Git inspection framework, adding an external dependency, or storing persistent repository-local result files.
- Modifying the pre-existing unrelated working-tree change in `docs/adr/0022-use-issue-native-execution-and-closeout.md`.

## Next command

`/execute-issue #5`
