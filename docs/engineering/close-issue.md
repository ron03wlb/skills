## What it does

`close-issue` closes one Issue against the local target branch recorded when its Issue worktree was created. A direct human request or one valid read-back DAG Run Grant may authorize entry without separate per-Issue approval; the skill never creates the Grant or widens what closeout may do.

Close progress is idempotent. An Executable Issue has exactly three ordered actions: merge its unchanged completed candidate, remove its exact clean worktree, and close the Issue. Coordinator membership is exact: a Single-Issue target is the bound [Spec](https://www.aihero.dev/ai-coding-dictionary/spec), a Multi-Issue child is an exact mapping member, and a parent-only target is the bound Spec itself. Git ancestry, worktree registration, and tracker state say which action comes next, so retries need no custom progress record and target movement never sends a valid candidate back to execution.

Closeout has two nested leases. One repository close lease covers the same Git common dir and serializes closeout across targets. The leaf acquires the repository lease and target mutation writer in that order, then releases them in reverse after required read-back. Different repositories remain concurrent, while planning uses only its exact target writer. The lease boundary derives a deterministic versioned operation identity from immutable repository, Spec, approved-publication, producer, stage, and Issue inputs, then validates the exact `implementation_complete` operation receipt without repeating execution semantics.

## When to reach for it

Type `/close-issue <Issue-ID>` after [execute-issue](https://aihero.dev/skills-execute-issue) records `implementation_complete`, or an authorized coordinator reaches for it when its valid DAG Run Grant binds that exact Issue or completed parent. Without either authority, the [agent](https://www.aihero.dev/ai-coding-dictionary/agent) stops before mutation.

Any number of Issue worktrees may execute concurrently. Reach for this once per completed Issue; repository serialization affects closeout only, while Issue execution and unrelated planning remain concurrent. Healthy contention continues through bounded observations without a fixed timeout that asks you to restart. Unknown ownership or proof mismatch preserves the affected closeout; healthy acquisition races return to observation. Use the same command for a completed Multi-Issue parent after all of its exact children are closed.

## Three observable actions

The merge uses the latest recorded target and exact reviewed candidate while the leaf owns both leases. An already reachable candidate makes that action complete; otherwise Git deterministically fast-forwards when possible and creates the ordinary merge only for diverged histories. A dirty target stops before mutation; after preserving that work, the human makes the target clean and retries `/close-issue <Issue-ID>`. This does not rerun execution or the full suite. A conflict is aborted and target restoration verified, with the worktree and Issue left open; the human or same authorized coordinator can then return to execution in the same lane when resolution stays inside the original Acceptance Criteria.

A new ordinary merge combination receives the integration checks required by its approved plan before cleanup; unchanged candidate verification is reused when its inputs still match. This remains separate from the aggregate push gate.

Cleanup removes only the registered clean Issue worktree after candidate reachability is proved. Tracker closure happens last and is read back. A partial run reports the remaining action without repairing product code, rerunning review, pushing, or rolling back a successful merge.

For new completion notes, closeout validates the owner-derived `operationIdentity` plus every `workflowArtifacts` path, requirement source, purpose, contribution ownership, and candidate-bound review result before merging. Independent logical `workflow_operation_identity_contract_adopted:v1` and `workflow_artifacts_contract_adopted:v1` records in the parent or linked Spec bind the exact repository, tracker, Spec, and Issue target branch plus separate frozen `legacyCompletionFrontier` lists of note identities or durable local locators and body digests. Only exact members may omit the corresponding field; neither record classifies the other field. Payload-identical records collapse, while malformed, conflicting, duplicate, unreadable, mismatched, or digest-mismatched evidence stops. A truly unadopted scope remains legacy-compatible. Adoption evidence grants no candidate, contribution, verification, closeout, push, or deployment authority.

Closeout also re-reads every content-bound manual attestation by immutable tracker identity. Its Issue, Prerequisite candidate, blob, artifact, and outcome must match the completion, the path must resolve to that blob, and candidate ancestry must lead to the reviewed implementation candidate. Legacy v1 or historical path-only evidence remains valid only for an exact legacy non-generated artifact. Manual evidence never supplies merge, close, push, deploy, database, review, or scope authority.

## Parent closure

A Multi-Issue Spec has no candidate to merge. Its parent-only path reads the Decomposition publication record, proves every exact child is closed and every child candidate reaches the same target, then closes only the parent. It does not claim aggregate `push_ready`.

## It's working if

- The reviewed candidate reaches the recorded target before the Issue is closed.
- Only the registered clean Issue worktree is removed, and tracker closure is read back last.
- A dirty target, merge conflict, or incomplete child set stops with the remaining action stated and no product-code repair.

## Where it fits

`close-issue` follows [execute-issue](https://aihero.dev/skills-execute-issue). After the desired Issues are closed, [verify-target-before-push](https://aihero.dev/skills-verify-target-before-push) performs the one aggregate gate on exact target `HEAD`. See [ask-matt](https://aihero.dev/skills-ask-matt) for the full map.

Transient failures trigger bounded probes of Git or the tracker before retrying only an unsatisfied action. A lost response never causes a second completed merge, cleanup or closure.

The coordinator can continue a settled partial close in its original task. Its native request keeps a three-attempt budget for unchanged progress across restarts, so only remaining actions run.

When an approved workflow repair must run before its coordinator can start, the original human Start can supply the bounded maintenance handoff described in [its owner](https://github.com/ron03wlb/skills/blob/features/ron/docs/agents/references/approved-pre-run-workflow-maintenance.md). The leaf retains its normal ownership and verification; a second human command is unnecessary.
