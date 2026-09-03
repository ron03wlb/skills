---
name: verify-target-before-push
description: Verify one exact local-ahead or already-pushed target range, with confirmation-gated direct-contribution, closed-Issue, and command-placeholder recovery, without pushing.
disable-model-invocation: true
---

# Verify Target Before Push

Verify one frozen target range after Issue closeout. This skill has two evidence modes, **local-ahead** and **already-pushed**. Both run the same aggregate review and verification gate; only local-ahead may emit push readiness. It never repairs product code, closes or reopens Issues, changes other tracker state, pushes, remote-merges, or deploys.

Before deriving members, read [`references/aggregate-verification-interfaces.md`](references/aggregate-verification-interfaces.md) for normalized range, member, coverage, aggregate-gate, and result evidence. Read [`references/aggregate-recovery-interfaces.md`](references/aggregate-recovery-interfaces.md) before considering any tracker-write recovery. Those owner-local interfaces hold schemas, payloads, eligibility detail, and recovery mechanics; this public skill retains invocation, human authority transitions, major owned gates, failure ownership, result boundaries, and the next explicit push route.

## Freeze exact `B` and `V`

Read repository instructions and tracker configuration, resolve exact commits, and select one mode without fallback or inference:

- **Local-ahead:** when the human names a local Issue target branch without an explicit comparison, resolve its unique configured upstream tracking tip as baseline `B` and its local `HEAD` as target `V`. Require `B` to be an ancestor of `V` and the selected `B..V` commit range to be non-empty. A missing or ambiguous upstream, detached target, empty range, or any need to guess `B` stops before review.
- **Already-pushed:** require an explicit merge request, pull request, or exact base/head range. Resolve its exact base as `B` and head as `V`, require both commits locally and `B` to be an ancestor of `V`, and bind the result to that immutable comparison. Never guess a post-push baseline from a branch, remote, merge message, or current checkout.

Capture mode, target, `B`, and `V` once. Create a clean verification worktree at exact `V`; never clean or reuse a dirty target worktree. A ref or worktree identity mismatch stops.

## Derive members and coverage

Execution completion notes are the sole Issue-to-commit mapping authority. Candidate `C` reachable from `V` but not `B` is a member; a baseline-reachable candidate is not. An open unreachable candidate is concurrent work outside this range. A closed unreachable candidate or a reachable open member is contradictory and stops. Freeze the set before review.

Require every member completion, attestation, workflow-artifact declaration, candidate, closed tracker state, and contribution to satisfy the owner-local interface. Cover every material `B..V` commit only through member contributions, Planning Seals, necessary merge topology, or valid Direct target contribution records. Missing, ambiguous, invalidating, or unexplained evidence stops.

## Human-confirmed narrow recoveries

Only the three recoveries in the recovery interface exist: one closed historical completion-evidence failure, one historical command placeholder, or eligible uncovered Direct target contributions. Reuse one exact immutable matching record when present. Otherwise present the complete owner-local packet and tracker draft and wait for the human to confirm that exact packet once; confirmation authorizes only that record.

Immediately before any confirmed tracker write, re-read and revalidate every bound Issue, completion, target, candidate, worktree, diagnostic, command, contribution, ref, and draft required by that recovery. Drift stops without writing. Invoke only the named model-invoked helper, require exact read-back, discard the stopped gate, and start a fresh `/verify-target-before-push` from Entry. Never resume earlier review or verification evidence, add a generic repair command, accept a force bypass, or treat confirmation as readiness or push authority.

## Run one aggregate gate

On committed `B...V`, run Matt `code-review` with separate Standards and Spec axes, every applicable deduplicated focused command, and the repository full suite exactly once in the clean exact-`V` worktree. Require complete member coverage, both axes free of Confirmed code review findings, passing verification, clean worktree, and unchanged refs. Advisories stay visible but do not block or trigger repair. This is a gate, not a repair loop.

## Return the mode-specific result

Re-read frozen refs and closed members immediately before returning:

- **Local-ahead:** a completely passing fresh gate may write and read back one exact `push_ready:v1` note on `V`. Target movement invalidates it and requires this skill again.
- **Already-pushed:** return one read-only Range verification result and never write `push_ready` or retroactive push authority.

Remove only the clean temporary verification worktree. Push remains a separate explicit `/push-target <target>` action that must consume the current matching receipt on exact local target `HEAD`. Neither a helper nor recovery pushes, and no generic attestation framework, SHA allowlist, partial-path exception, or verifier-owned authority source is permitted.

## Failure ownership

Failure never rolls back integrations or automatically repairs, reruns, closes, or reopens an Issue. A Confirmed aggregate finding withholds the result and reports exact evidence, affected Issue and Spec identities, and same target branch. Its default correction owner is a new human-created Aggregate repair Issue; this verifier never creates or executes it, repairs product code, reopens an earlier Issue, or edits an immutable completion note.
