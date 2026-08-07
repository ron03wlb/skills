---
name: execute-issue
description: Execute one Ron Leaf or Standalone Issue when its contract and Grant are current, producing reviewed local implementation commits and durable evidence.
---

# Execute Issue

Implement exactly one Ron Executable Issue. This skill may run when the user names the exact Issue or when a current `execute` Grant is already recorded. It never treats a spec, label, plan, test result, or Parent approval as execution authority.

## Shared contracts

Resolve this `SKILL.md` to its real path, ascend to the plugin root, and use `scripts/ron-workflow/ron-wiki.mjs`. Run `config-validate`, verify Spec/contract/Grant envelopes, and validate the exact Wiki execution binding. Do not infer readiness from prose.

## Authority and readiness

Read `docs/agents/ron-workflow.md`, then fetch the Issue, current Change Spec, execution contract, Authorization Record chain, dependencies, and latest checkpoint from GitHub.

Recompute every payload hash. Resolve `supersedes` and `revokes` append-only chains. A derived Grant must bind the human root read-back hash plus stable IDs and hashes for both the current Spec and execution contract, and its delegation policy must be `denied`. It can be a sibling of a later exact Closeout Grant but can never derive one. Fail closed on tracker unavailability, edits, missing comment IDs, conflicting active Grants, or drift in Issue, Spec, contract, target, baseline, scope, Preview, or review profile.

A Parent is never executable.

If the user directly invoked this skill with one exact current Leaf or Standalone contract, that invocation may authorize only the standard `execute` capability. Build the exact Authorization Record, post it, and read it back before mutating. An implicit invocation needs an existing valid Grant. Ambiguous scope requires a preview and explicit approval.

Every new or superseding `execute` Grant binds `max_material_repair_waves: 10` and `local_checkpoint_commits: allowed_after_verified_slice`. These controls authorize the review-repair loop and local commit timing inside the unchanged Issue contract; they do not expand owned paths, acceptance, seams, target, exclusions, or any external capability. Do not reinterpret an older Grant that omits either control—replace it through the normal append-only approval path before using the broader behavior.

The Authorization Record begins with `workflow-authorization:v1`. Its hashed payload binds the record/approver/time, Issue, current spec and contract IDs/comment IDs/hashes, target branch/SHA, Lane SHA when applicable, named grants, exclusions, machine-checkable preconditions, delegation policy, and `supersedes`/`revokes` references. Use the fixed `<!-- workflow-payload:begin -->` and `<!-- workflow-payload:end -->` delimiters and the UTF-8/LF/one-terminal-newline SHA-256 rule. Never edit or delete an old record.

Authorization is not readiness. Also verify:

- blockers are closed with expected evidence;
- the named Lane worktree is isolated and owned by one writer;
- when `lane_predecessor` is non-null, it is closed with valid `implemented_on_lane` evidence, its commit is exactly at Lane HEAD, its ownership is released, and the tree is clean;
- when `lane_predecessor` is null, the tree is clean and Lane HEAD exactly equals the Grant `lane_sha`, or the contract `target_sha` when a pre-created Grant has `lane_sha: null`;
- owned paths do not overlap another writer;
- `none + not-applicable` has explicit `wiki_impact: none`;
- `semantic + none + not-applicable` is Wiki-optional delivery only when the configured baseline is `missing`, with null Wiki Preview/disposition bindings and no Wiki-owned paths or review;
- `reconcile + ready` has a validated ready baseline; an optional Sync Preview ID/hash pair must match when this is a Wiki-repair Standalone;
- `bootstrap + missing-with-bootstrap-preview` is one Standalone with matching bounded Preview, pre-Issue delegation lineage, Spec, contract, and Grant;
- verification commands and behavioral seams are coherent;
- enough context remains to reserve about 35% for review, up to ten repair waves, and verification.

Stop and preserve recoverable state if any gate fails.

Create a new Lane worktree when the current checkout has unrelated dirt, the work is high-risk or long-lived, target/baseline differs, another writer is active, a writable subagent will run, or writable ownership could overlap. Reuse an existing Lane only for the same Parent, target, and lineage after the predecessor is closed and committed, the tree is clean, ownership is released, and a fresh preflight passes. The Lane survives Leaf closeout.

## Build the Context Packet

Create a task-specific directory under `/private/tmp` and an exact artifact manifest outside the worktree. The ephemeral Issue Context Packet contains pointers and hashes, not copied histories:

- Issue/type, Grant ID, contract/spec comment IDs and hashes;
- target/baseline, Lane ID/worktree, predecessor;
- relevant Wiki, `CONTEXT.md`, ADR, and code pointers;
- owned paths, acceptance, seams, commands, review profile, repair limit, and checkpoint-commit policy;
- stop conditions and latest checkpoint.

Never place packets, raw subagent reports, temporary specs, or manifests in the product worktree.

Keep about 20% of context for preflight, 45% for implementation, and 35% for review/repair/verification. Move the Issue to fresh context or a fresh worker when the reserve cannot be protected, the domain or target changed, a prior checkpoint is unresolved, or isolation materially improves reliability.

## Choose inline or delegated execution

Default to inline. Delegate only when the task is fully expressible by the Packet, needs no human decision, preserves exclusive ownership, and saves meaningful time or context.

When delegation is justified, apply the repository's `docs/agents/codex-subagent-protocol.md` when available and always enforce this minimum:

- research/exploration: `gpt-5.6-terra`, `medium`;
- writable implementation or any review: `gpt-5.6-sol`, `high`;
- reserve one slot for the Coordinator;
- no nested delegation or parallel writable Issues;
- every Task Brief binds wave, Issue, Grant, candidate SHA when applicable, exact ownership, constraints, evidence, and return format.

The Coordinator owns tracker writes, authorization checks, every local commit, and acceptance.

## Implement and review

For code behavior, use the `/tdd` discipline at the seams already confirmed in the execution contract:

1. write one failing behavioral test;
2. add only enough implementation to pass;
3. repeat one vertical slice at a time.

After any coherent vertical slice is complete and its highest relevant seam passes, the Coordinator may stage only Issue-owned paths and create a local checkpoint commit without another human approval. The Grant does not cap the number of these commits. Keep each checkpoint reviewable and never include workflow scratch, partially verified work, or unrelated user changes.

For a Bootstrap or Wiki-repair Standalone, write only exact contract-owned Wiki/config paths and use page/source/link/build fixtures as the feedback loop; do not invent a code test. A Leaf never mutates Wiki. A normal `reconcile + ready` product Standalone also defers Wiki mutation to closeout; only a matching non-null Sync Preview identifies a Wiki-repair execution.

Do not ask again about an unchanged seam. A newly discovered public behavior or expanded acceptance boundary stops execution for a superseding Change Spec, contract, and Grant.

Freeze a `candidate_sha` or immutable tree reference before review:

- `focused`: one fresh `gpt-5.6-sol/high` reviewer reports separate Standards and Spec sections; add an independent Wiki reviewer only when applicable;
- `full`: separate Standards, Spec, and applicable Wiki reviewers.

Every reviewer receives the same fixed candidate. Validate findings against evidence, never by majority vote. The current `execute` Grant authorizes the one writable owner to address confirmed findings inside the unchanged contract for up to ten material repair waves without another human approval. Each wave consumes one count only when repair begins, runs the affected verification, creates a local checkpoint commit, freezes a new candidate, invalidates stale reviews, and re-runs the affected axes; use the full profile for high-risk repairs. Tool failure, duplicate findings, and unsupported reviewer claims do not consume a wave. A finding that changes scope, acceptance, a public seam, target, or exclusions still stops for a superseding Spec, contract, and Grant. A persistent material finding after wave ten writes a checkpoint and stops.

## Commit and record evidence

Run the exact final verification commands, inspect the aggregate Issue diff and every ordered implementation commit from the Issue baseline through Lane HEAD, and require a clean worktree. The reviewed candidate must be the final Lane HEAD; do not create an unreviewed final commit after review.

Post and read back an append-only completion record:

```text
workflow-completion-evidence:v1
<!-- workflow-payload:begin -->
issue: <owner/repo#number>
contract_id: <contract-id>
grant_id: <authorization-record-id>
lane_id: <lane-id>
baseline_sha: <sha>
implementation_commits:
  - <ordered-local-implementation-commit>
commit_sha: <final-lane-head>
candidate_sha: <reviewed-candidate>
proof_state: implemented_on_lane
review_profile: focused | full
review_axes:
  standards: <evidence>
  spec: <evidence>
  wiki: <evidence-or-not-applicable-with-reason>
verification:
  - command: <exact-command>
    result: <exit-and-summary>
artifacts_manifest: <exact-external-path>
excludes:
  - integrated_to_target
  - pushed
  - remotely_merged
  - deployed
<!-- workflow-payload:end -->
payload_sha256: <sha256>
```

Read the record back and verify its hash. The result is `implemented_on_lane`, not integrated, pushed, deployed, or closed.

If a valid `close_leaf` capability is already read back, continue by invoking `close-issue` in Leaf mode. Otherwise stop and report that exact missing capability. Never merge an individual Leaf into the target branch.
