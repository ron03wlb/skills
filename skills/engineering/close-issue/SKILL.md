---
name: close-issue
description: Close a verified Ron Issue when the exact Leaf, Parent, or Standalone close capability is authorized, finalizing local integration where applicable.
---

# Close Issue

Close exactly one Ron Issue in `leaf`, `standalone`, or `parent` mode. Detect the Issue type from durable tracker records; never infer Parent authority from child Grants or execution authority from completion evidence.

All tracker records are append-only and hash-verified. Tracker unavailability, revocation ambiguity, stale hashes, dirty unrelated state, or a capability mismatch stops the flow and preserves the Issue and worktree.

Every `workflow-authorization:v1` payload binds the record/approver/time, Issue, current spec and contract hashes, target branch/SHA, Lane SHA, named close capability, relevant Closeout Preview and Wiki-set hashes, exclusions, preconditions, delegation policy, and `supersedes`/`revokes` references. Use the fixed workflow payload delimiters and the UTF-8/LF/one-terminal-newline SHA-256 rule. Never edit or delete an old record.

## Leaf mode

Require a valid `close_leaf` capability. A direct invocation authorizes it only when the exact Leaf and current contract are named; record and read back the Authorization Record before closing.

Verify:

- the execution contract, Grant, and completion-evidence hashes;
- `commit_sha` exists in the named Lane and matches the final Issue diff;
- review evidence targets the final candidate and all applicable axes passed;
- final verification passed;
- the Lane worktree is clean and contains no unmanifested workflow artifacts.

Then close the Leaf and read its closed state back. Remove only exact Issue-owned temporary paths listed in the external artifact manifest when they are no longer needed.

Leaf mode does not update the Wiki, merge or rebase the target, remove the Lane worktree, delete a branch, push, deploy, or perform live-provider actions. Continue to the next Issue only when it is dependency-ready and already has valid `execute` and `close_leaf` authority.

## Parent and Standalone preflight

For a Parent, verify every Leaf is closed, each `implemented_on_lane` commit is present in Lane history, blockers are satisfied, the tree is clean, and aggregate evidence covers the Parent fixed point through Lane HEAD.

For a Standalone, verify its implementation evidence and execution Grant. Complete closeout requires a separately named `close_standalone` capability.

Derive exact Wiki impact from the aggregate diff, Change Spec Wiki context, existing citations, and current reviewer judgement. Separate:

- `wiki_semantic_write_set`: exact approved pages whose business meaning may change;
- `wiki_support_write_set`: exact configured mechanical navigation, index, or `llms.txt` outputs.

An empty semantic set needs an evidence-backed `wiki_impact: none` result. The Wiki engine never decides Issue hierarchy or authority.

## One Closeout Preview stop

Before Parent closeout, always present one exact Closeout Preview and stop. For Standalone, do the same unless a matching closeout Grant was pre-recorded.

The preview binds:

- Issue and Change Spec IDs/hashes;
- Lane ID and exact Lane SHA;
- target branch and exact target SHA;
- both exact Wiki write sets and their hashes;
- target-sync method and exact verification commands;
- `close_parent` or `close_standalone` capability;
- exclusions;
- Wiki-only repair envelope of at most two material waves;
- rule that any code/test finding becomes a Repair Leaf.

Ask only for `同意`. That one approval allows the Coordinator to write and read back the exact `workflow-authorization:v1` record, then finish the successful path without another prompt. If any bound input changes before the Grant is recorded, regenerate the preview.

Target drift, changed write sets, changed code scope, or a new Repair Leaf invalidates the Grant and requires a new preview and approval. An approved Wiki-only repair changes candidate/review evidence but not the Grant while it stays inside both write sets.

## Build the Target Integration Candidate

After a valid closeout Grant is read back:

1. synchronize the latest local target into the Lane without rebasing; stop on conflict;
2. recalculate the aggregate diff and verify the approved write sets still match;
3. preview or dry-run Wiki generation when supported;
4. reconcile only approved semantic pages and configured support outputs, or record no semantic change;
5. verify sources, citations, internal links, navigation, pending-baseline state, and the configured Wiki build;
6. create a closeout commit only if approved Wiki, domain, ADR, navigation, or tracked-cleanup edits create a real tree diff;
7. freeze `integration_candidate_sha`.

Never make an empty Parent commit.

## Final review and repair

Run a full review against the exact integration candidate and Parent/Standalone fixed point:

- Standards;
- Change Spec;
- Wiki, when applicable.

Use separate fresh `gpt-5.6-sol/high` reviewers. Apply `docs/agents/codex-subagent-protocol.md` when available; regardless, reserve the Coordinator slot, prohibit nested delegation and writable reviewers, bind every brief to the same candidate SHA, and require evidence. The Coordinator verifies each finding.

Wiki-only findings may be repaired by the one writable owner inside approved write sets, then a new candidate is frozen and affected axes are re-reviewed. Stop after two material Wiki repair waves.

Any code or test finding creates a new Repair Leaf with its own contract, Grant, one final commit, and Leaf closure. Do not repair product code inside Parent closeout. The changed Lane SHA invalidates the closeout Grant.

## Advance, verify, close, clean

Only after the exact candidate passes:

1. confirm the local target checkout is clean and still at the granted target SHA;
2. fast-forward the named local target branch to `integration_candidate_sha`;
3. verify target HEAD identity, tests, Wiki build, citations, and absence of per-Issue intermediate files;
4. write and read back a hash-verified `workflow-closeout-evidence:v1` comment binding the Issue/mode, Grant, Change Spec, Lane SHA, integration-candidate SHA, target branch/verified HEAD, Wiki reconciliation result, exact verification results, and `verified_on_target` proof state;
5. close the Parent or Standalone Issue and read back its closed state;
6. remove only exact external intermediates in the artifact manifests;
7. remove the Lane worktree, but do not delete its branch.

Any failure leaves the Issue open when possible and preserves recovery-relevant state. Never automatically push, remote-merge, deploy, delete a branch or legacy data, or perform live-provider operations.

Never delete Change Spec, Authorization, checkpoint, completion, or closeout comments; final code and tests; the reconciled Wiki; current `CONTEXT.md` and ADRs; or required API, migration, operational, compliance, and user documentation.

Report proof states separately: reviewed, tests passed, locally committed, implemented on Lane, integrated to local target, verified on target, Issue closed, worktree removed, pushed, remotely merged, deployed, and live-verified.
