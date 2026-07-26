---
name: close-issue
description: Close a verified Ron Leaf, Parent, or Standalone Issue under exact local closeout authority, including Wiki reconciliation and target verification when applicable.
---

# Close Issue

Close exactly one Ron Issue in `leaf`, `parent`, or `standalone` mode. Detect the mode from durable tracker records. Never infer Parent authority from child Grants or close authority from completion evidence.

## Shared contracts

Resolve this `SKILL.md` to its real path, ascend to the plugin root, and use `scripts/ron-workflow/ron-wiki.mjs` for config, envelope, source, ledger, Preview, and execution-binding proof. Normal closeout and direct `/wiki` use this same reconciliation primitive; do not create a second Wiki updater.

Read every Spec, execution contract, Authorization, completion, and checkpoint record by stable comment ID. Recompute hashes and resolve append-only supersession/revocation. Tracker unavailability, ambiguous lineage, stale Spec/contract/Grant, dirty unrelated state, or capability mismatch stops and preserves recovery state.

## Leaf mode

Require a valid `close_leaf` capability. A direct invocation may authorize it only for one exact current Leaf; write and read back the Authorization Record before closing.

Verify:

- current Spec, contract, Grant, and completion-evidence bytes/hashes;
- the final Issue commit is present at Lane HEAD and matches its owned diff;
- review evidence targets that candidate and all required axes passed;
- final commands passed;
- the Lane is clean and manifest-owned scratch is accounted for.

Close and read back the Leaf, release writable ownership, and remove only exact external intermediates that are no longer needed.

Leaf mode never mutates Wiki, advances target, rebases, removes the Lane, deletes a branch, pushes, deploys, or acts on live providers.

## Parent or Standalone preflight

For a Parent, verify every Leaf is closed, each `implemented_on_lane` commit is present in ordered Lane history, blockers are satisfied, ownership is released, and aggregate evidence covers the fixed point through Lane HEAD.

For a Standalone, verify its implementation evidence and `execute` Grant. Complete closeout requires `close_standalone`; Parent requires `close_parent`.

Validate the configured baseline requirement:

- `none + not-applicable` requires explicit evidence-backed `wiki_impact: none`;
- `reconcile + ready` requires the reviewed ready baseline;
- `bootstrap + missing-with-bootstrap-preview` requires one matching Bootstrap Preview/Spec/contract/Grant chain and is valid only for that Standalone.

## Reconciliation before mutation

Aggregate prior Wiki, current Change Spec dispositions, the complete Issue diff, code/test source locators, and reviewer evidence. Build `workflow-wiki-reconciliation-ledger:v1` with one row per affected topic or material claim:

- prior Wiki state;
- `inherit | add | change | remove`;
- code/test source locators;
- `aligned | deviation | unverified`;
- `none | add | update | remove`;
- exact Wiki path.

Run `ledger-validate`. Any `deviation`, `unverified`, unsupported/ambiguous locator, missing behavioral Change Spec, finding, or changed scope ends the clean path before Wiki mutation. Return the problem and trade-offs; do not repair or rewrite intent autonomously.

Only a clean aligned ledger may derive:

- exact `wiki_semantic_write_set`;
- exact configured `wiki_support_write_set`.

An empty semantic set requires `wiki_impact: none`; an engine never selects either set.

## Closeout Preview and authority

Create one internal, hash-verified Closeout Preview binding:

- Issue, Spec, contract, Grant, delegation lineage, and ledger hash;
- exact Lane and target identities;
- both Wiki write sets and hashes;
- target-sync method and exact verification commands;
- `close_parent` or `close_standalone`;
- candidate-creation and at most two human-authorized Wiki-repair waves;
- exclusions and the rule that a code/test defect requires a Repair Leaf.

When a current bounded clean-path delegation covers every identity, path, validator, review axis, capability, target refresh, and exclusion, derive and read back the exact Closeout Grant without another prompt. Otherwise present only the compact authorization stop and ask for `同意`.

A changed Spec, contract, target, Lane, ledger, write set, code scope, or Repair Leaf invalidates the Grant. A same-branch, fast-forward-only, conflict-free target refresh may rebuild the Preview and derive a replacement only when the original delegation covers it and complete revalidation passes. Conflict always stops; never auto-rebase.

## Build one Target Integration Candidate

After the exact closeout Grant reads back:

1. synchronize the latest local target into the Lane without rebasing;
2. recalculate aggregate diff, ledger, and write sets;
3. for `reconcile`, change only aligned ledger actions and configured support outputs;
4. for `bootstrap`, add the complete baseline and change config from `missing` to `ready` in the same candidate;
5. run page validation, resolve every source locator, check claims, links, navigation, config state, tracked-tree cleanliness, and configured build;
6. create a closeout commit only for a real approved diff;
7. freeze one `integration_candidate_sha`.

Never accept a partial Bootstrap baseline, unexpected path, silent deletion, or empty Parent commit.

## Independent final review

Run full Standards, Spec, and applicable Wiki reviews against the same fixed candidate. Wiki review compares prior Wiki, current Spec, code/tests, ledger, and candidate Wiki. Use fresh read-only reviewers; the writable owner, Coordinator, author, and engine cannot self-accept.

The Coordinator verifies findings against evidence, never majority vote. Any confirmed finding ends the clean path:

- code/test finding → explain trade-offs; only after human authorization create a Repair Leaf with its own contract, Grant, commit, and closeout;
- Wiki-only finding → explain trade-offs; only after a bounded human repair Grant may the one writer repair inside the existing ledger actions and write sets.

Each authorized repair creates a new candidate and invalidates affected reviews. Allow at most two material Wiki repair waves; then checkpoint and stop.

## Advance, verify, close, clean

Only after the exact candidate passes:

1. confirm the local target is clean and still satisfies the Grant;
2. fast-forward it to the reviewed candidate;
3. verify target identity, tests, Wiki config/page/source/link/build contracts, and absence of per-Issue intermediates;
4. post and read back `workflow-closeout-evidence:v1` binding the Issue mode, Grant, Spec, contract, Lane, ledger, candidate, verified target, commands, and `verified_on_target`;
5. close the Parent or Standalone and read back state;
6. remove only manifest-owned external intermediates;
7. remove the Lane worktree without deleting its branch.

Failure leaves the Issue open when possible and preserves recovery state. Never push, remote-merge, deploy, delete a branch or legacy data, publish derived output, or perform live-provider actions.

Return only `收尾完成` on a clean path. Otherwise report the smallest problem, evidence, trade-offs, and required decision. Keep reviewed, tested, committed, implemented on Lane, locally integrated, target-verified, Issue-closed, pushed, remotely merged, deployed, and live-verified as separate claims.
