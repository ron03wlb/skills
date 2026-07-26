---
name: to-tickets-ron
description: Split one Change Spec into bounded authorized Issue contracts.
disable-model-invocation: true
---

# To Tickets Ron

Turn one verified Change Spec into dependency-ordered Executable Issues. Preserve Matt's tracer-bullet principle, but add the Issue, Lane, baseline, review, evidence, and authorization boundaries required by the Ron workflow.

## Shared contracts

Resolve this `SKILL.md` to its real path, ascend to the plugin root, and use `scripts/ron-workflow/ron-wiki.mjs`. Verify the Change Spec with `envelope-verify` and create every executable contract with `execution-contract-create`. `/wiki` uses the same builder for Bootstrap and Wiki-repair Standalones; do not maintain a second contract renderer.

## Preconditions

Read back the Change Issue and its current `workflow-change-spec:v1` comment by stable ID. Recompute the payload hash and resolve supersession. Stop if the tracker is unavailable, the chain is ambiguous, or `docs/agents/ron-workflow.md` is not in full mode.

Use the Change Spec's confirmed behavior, test seams, Wiki dispositions, operation, and baseline requirement. Do not copy the full Change Spec into children.

## Draft executable slices

Prefer one Standalone Issue when the work is one coherent, independently verifiable outcome. Otherwise turn the Change Issue into a Parent and draft Leaf Issues.

Each Leaf is a narrow vertical tracer bullet with:

- one coherent outcome and one highest clear behavioral test seam;
- one target branch, baseline, risk class, and review profile;
- one active writable owner; path overlap is forbidden between Issues that could be writable concurrently, but sequential Leaves in one Lane may reuse paths after the predecessor is closed and ownership is released;
- dependencies that genuinely block it;
- enough context reserve for implementation, review, repair, verification, and closeout;
- one final local commit and one final completion-evidence record.

Split when outcomes, authorization scopes, targets, baselines, owners, acceptance boundaries, external waits, or context budgets differ. Do not split merely because several files or layers change.

Use `focused` review only for low-risk, single-seam work with no shared-contract, migration, permission, security, data-integrity, or concurrency impact. Otherwise use `full`.

Present the numbered breakdown, blocking edges, Lane order, target/baseline, risk, review profile, owned scope, Wiki operation, and disposition scope. Ask once whether the granularity and edges are approved; revise before publishing.

## Publish contracts

First reconcile the existing tree by stable Issue identity, Parent relationship, outcome, current contract chain, and current Grant chain. Reuse an exact existing child, contract, and still-current Grant. When a contract changed, append a superseding contract after approval. When Grant bindings or capabilities changed, the next preview must name the current record and the replacement must set `supersedes`; withdrawal uses a separate `revokes` record. Never create a duplicate child, parallel current contract, or parallel active Grant merely because this skill was rerun. Present any ambiguous or orphaned state instead of guessing.

Create only missing children in dependency order and establish native sub-Issue relationships when available, with a durable Parent reference as backup. A Parent never receives an executable contract.

Lane order is also a durable serialization edge. For every non-first Leaf in one Lane:

- set `lane_predecessor` to the immediately preceding Leaf;
- include that Leaf in `blocked_by`, even when there is no additional product dependency;
- add a Grant precondition requiring the predecessor to be closed with valid `implemented_on_lane` evidence, its commit present at Lane HEAD, ownership released, and the Lane clean.

This prevents batch authorization from making two writable Leaves ready at once.

For the first Leaf, add a Grant precondition requiring a clean Lane whose HEAD exactly equals the contract `target_sha`. A pre-created batch Grant may leave `lane_sha` null; that never waives the exact first-Leaf baseline check.

Add one append-only contract comment to every Leaf, or to the Change Issue when it remains Standalone:

```text
workflow-execution-contract:v1
<!-- workflow-payload:begin -->
contract_id: <stable-id>
issue: <owner/repo#number>
issue_type: leaf | standalone
parent: <owner/repo#number-or-null>
spec_id: <spec-id>
spec_comment_id: <comment-id>
spec_payload_sha256: <hash>
outcome: <vertical-outcome>
acceptance:
  - <observable-criterion>
verification_seams:
  - <confirmed-public-boundary>
verification_commands:
  - <exact-command>
target_branch: <branch>
target_sha: <baseline-sha>
lane_id: <lane-id>
lane_predecessor: <issue-or-null>
blocked_by:
  - <issue-or-none>
owned_paths:
  - <exact-path-or-bounded-pattern>
wiki_impact: semantic | none
wiki_operation: reconcile | none
wiki_baseline_requirement: ready | not-applicable
wiki_preview_id: null
wiki_preview_payload_sha256: null
wiki_dispositions_sha256: <hash-or-null>
risk: low | medium | high
review_profile: focused | full
expected_proof_state: implemented_on_lane
excludes:
  - push
  - remote-merge
  - deploy
  - branch-deletion
  - live-provider-actions
  - legacy-data-deletion
supersedes: <contract-id-or-null>
<!-- workflow-payload:end -->
payload_sha256: <sha256>
```

Use `execution-contract-create` for the exact UTF-8/LF/terminal-newline bytes. Post each envelope, read it back by stable comment ID, and run `envelope-verify`. A missing or mismatched contract leaves that Issue blocked.

## Optional batch Grant

After all contracts read back successfully, offer one Lane Grant Preview. Show a separate exact record for each named Issue; never inherit authority from the Parent.

The recommended successful-path capabilities for each Leaf are:

- `execute`;
- `close_leaf`.

For a Standalone Issue, preview separately named `execute` and `close_standalone` capabilities instead.

The Grant binds Issue, contract/spec IDs and hashes, target branch/SHA, owned scope, review profile, preconditions, delegation limits, and exclusions. One user `同意` may approve the fixed batch. Reuse an exact active record; otherwise post and read back one append-only, properly superseding `workflow-authorization:v1` record on each named Issue.

Use this envelope:

```text
workflow-authorization:v1
<!-- workflow-payload:begin -->
record_id: <stable-id>
status: active
approver: <identity>
approved_at: <timestamp>
binds:
  issue: <owner/repo#number>
  spec_id: <spec-id>
  spec_comment_id: <comment-id>
  spec_payload_sha256: <hash>
  contract_id: <contract-id>
  contract_comment_id: <comment-id>
  contract_payload_sha256: <hash>
  target_branch: <branch>
  target_sha: <sha>
  lane_sha: <sha-or-null>
  closeout_preview_sha256: <hash-or-null>
  wiki_operation: reconcile | none
  wiki_baseline_requirement: ready | not-applicable
  wiki_preview_id: null
  wiki_preview_payload_sha256: null
  wiki_dispositions_sha256: <hash-or-null>
  wiki_semantic_write_set_sha256: <hash-or-null>
  wiki_support_write_set_sha256: <hash-or-null>
grants:
  - execute
  - close_leaf | close_standalone
excludes:
  - push
  - remote-merge
  - deploy
  - branch-deletion
  - live-provider-actions
  - legacy-data-deletion
preconditions:
  - <machine-checkable-condition, including Lane predecessor closure when applicable>
delegation:
  clean_path: denied
  read_only_subagents: allowed_when_independent
  writable_subagent: one_worker_with_exclusive_worktree
  nested_clean_path: denied
  nested_delegation: denied
supersedes: <record-id-or-null>
revokes: <record-id-or-null>
<!-- workflow-payload:end -->
payload_sha256: <sha256>
```

Hash and read back the payload with the same exact envelope rule. A revocation is a new record naming `revokes`; never edit an old Grant.

An unlisted Leaf, later Repair Leaf, changed contract hash, or changed target has no authority. Batch approval records authority, not readiness: only the first dependency-ready Leaf may execute, and every later Leaf must pass its durable Lane predecessor precondition. If the user declines or defers, leave the contracts published but report `specified-not-authorized`. Do not execute any Issue from this skill.

Finish with the exact frontier: the first dependency-ready Issue, its proof state, and whether valid `execute` plus the type-appropriate `close_leaf` or `close_standalone` capability were read back.
