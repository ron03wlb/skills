---
name: verify-target-before-push
description: Verify one exact aggregate local target and emit a current-HEAD push-ready receipt without pushing.
disable-model-invocation: true
---

# Verify Target Before Push

Run the aggregate gate after independently closing the desired Issues and before a separate push. This skill verifies one exact local target; it never closes Issues, changes product code, pushes, or deploys.

## Freeze the verification set

Read repository instructions and tracker configuration. Resolve the named local target branch and capture a fixed verification baseline `B` plus exact target `HEAD` `V`. Prefer an explicit baseline argument; otherwise use the target's unambiguous configured upstream tip. Missing or ambiguous baseline identity permits one question and stops before mutation.

Create a clean verification worktree at exact `V`; do not use or clean a dirty target worktree. Record target, `B`, `V`, and worktree once.

Query the configured tracker for every closed Issue whose latest completion note names this original target. Read each completion note and closeout receipt once. A candidate already reachable from `B` belongs to the baseline; every later candidate is an aggregate member.

For each member require:

- exact Issue, parent/linked Spec, candidate `C`, integration candidate `I`, and target identities;
- a matching read-back `VERIFIED` or explicitly authorized `RECONCILED` integration receipt;
- both `C` and `I` to exist locally and be ancestors of `V` but not silently substituted by another SHA.

A missing or unreadable completion note or receipt, mismatched target, missing candidate, or candidate not reachable from `V` stops and identifies the closed Issue. Freeze the member set before review; do not infer completeness only from merge commit messages.

## Review and verify the aggregate

Invoke Matt `code-review` on committed diff `B...V`. Run repository Standards against the aggregate diff and the Spec axis against every frozen member Issue plus parent/linked Specs; both axes must have no confirmed findings.

Collect the affected verification commands recorded by member completion notes, deduplicate them, and run the union-focused verification on exact `V`. Then run the repository-required full verification once. Require every command to pass and the verification worktree to remain clean.

This is a gate, not a repair loop. A review finding, test failure, conflict, missing member, or dirty verification worktree withholds readiness and reports exact evidence without changing product code or tracker state.

## Emit current-HEAD readiness

Immediately re-read the target ref and require `HEAD == V`; re-prove every recorded `C` and `I` is reachable. Target movement invalidates all evidence and requires this skill again.

Write one local Git note under `refs/notes/matt-push-ready` on `V` with a human-readable `push_ready:v1` receipt binding exact target `HEAD`, baseline, member Issue/candidate/integration identities, both clean review axes, exact commands/results, and clean verification worktree. Read it back once and require every field to match. Reuse an exact matching note on retry; never overwrite mismatched evidence automatically.

Remove only the clean temporary verification worktree after receipt read-back. Report `push_ready` for exact `V` and stop. Push remains a separate explicit action and must recheck the receipt SHA against current target `HEAD`.

## Failure ownership

Failure never rolls back local integrations, rewrites receipts, or automatically reopens closed Issues. Product correction requires an explicit integration-repair Issue or explicit authority to reopen the owning Issue, followed by the normal execution/close flow and a fresh aggregate verification.
