## What it does

`execute-issue` implements one dependency-ready Tracker [Spec](https://www.aihero.dev/ai-coding-dictionary/spec) or child Issue in a dedicated worktree, verifies it, and runs [code-review](https://aihero.dev/skills-code-review) independently for Standards and Spec until both are clean. A direct human request or one valid read-back DAG Run Grant may authorize entry; the skill never creates the Grant or asks an authorized coordinator for separate per-Issue approval.

It trusts the published delivery classification and records the branch from which the worktree was created as the Issue's only default merge target. Coordinator entry fails closed unless the Grant binds that exact Spec, target, classification, and scope. A Single-Issue coordinator target must be the exact bound Spec; a Multi-Issue target must be an exact mapping member in the bound decomposition record and dependency-ready under its published blockers. The Planning Seal must be reachable and current, while expected paths remain discovery hints rather than an allowlist. No declared Manual prerequisite preserves ordinary execution; one exact unresolved declaration automatically enters [pre-execute-issue](https://aihero.dev/skills-pre-execute-issue) inside the same authorized lane. Each fresh lane has a deterministic versioned operation identity derived from immutable repository, Spec, approved-publication, producer, stage, and Issue inputs, and its `implementation_complete` note carries that full receipt for downstream validation.

## When to reach for it

Type `/execute-issue <Issue-ID>` directly, or an authorized coordinator reaches for it when a valid DAG Run Grant binds that exact dependency-ready Issue. Without either authority, the [agent](https://www.aihero.dev/ai-coding-dictionary/agent) stops before creating a worktree or changing state.

- Published dependency-ready Issue: invoke this directly or through its authorized Run.
- Approved Standalone Spec or explicit current-branch work: use [implement](https://aihero.dev/skills-implement).

## Trustworthy candidate

Necessary source-grounded dependencies continue automatically while Acceptance Criteria stay unchanged; behavior, target, exclusion, schema outcome, or ownership changes return to planning. Late prerequisite discovery preserves coherent checkpoints and automatically enters the same prerequisite flow before dependent verification while scope stays unchanged. The matching content-bound attestation returns only to the original lane after fresh Issue, Spec, target, Planning Seal, candidate, blob, branch, worktree, blocker, scope, and ancestry checks. Focused checks run through implementation, followed by required final verification and the repository full suite.

The Issue branch and worktree created before or during prerequisite handling are reused. A generated Prerequisite candidate must remain in the final implementation candidate's ancestry. Completion records the immutable attestation identity plus its Issue, candidate, blob, artifact, and `APPLIED` or `NO_OP` outcome; legacy path-only v1 remains limited to a legacy non-generated artifact. The skill never executes SQL or gains database, closeout, push, deploy, or broader scope authority from that evidence.

Review keeps Standards and Spec separate. A **Confirmed code review finding** requires exact repository or Spec evidence and blocks its axis; a **Code review advisory** remains visible without failing execution, triggering repair, consuming a repair wave, or creating durable waiver state. Confirmed findings are repaired for at most ten cumulative waves for the same Issue operation across retries and conflict-repair attempts; existing Issue progress evidence records the count before each repair, and missing prior counts are reported rather than assumed zero. `implementation_complete` is recorded only when final verification passes, both axes contain no Confirmed code review finding, the worktree is clean, and its `HEAD` equals the reviewed candidate. A later blocked state supersedes it only when evidence invalidates that candidate's implementation, review, or verification; movement of the recorded target, a close conflict, or aggregate-gate failure does not restart execution.

Every new completion note also contains `workflowArtifacts`: either an explicit empty list or exact repository-relative paths with the repository or skill requirement source and purpose. The prospective declaration is reviewed against the exact Issue contribution. It accepts required non-contract plans and execution logs by behavior, not extension, while public-contract, routing, Acceptance Criteria, governance, runtime, arbitrary, ambiguous, or unowned documents remain ordinary material scope. The field classifies scope only; it never supplies contribution coverage, review, or verification authority.

After the clean candidate passes verification and review, execution independently appends or reuses one logical `workflow_operation_identity_contract_adopted:v1` record and the existing `workflow_artifacts_contract_adopted:v1` record in the parent or linked Spec before the first prospective completion for each field. Each binds the exact repository, tracker, Spec, and Issue target branch plus an explicit `legacyCompletionFrontier` of every already valid completion missing that record's field, using exact note identity or durable local locator and body SHA-256. A later missing field is legacy only when it matches the corresponding frozen list; neither record classifies the other field. Payload-identical records collapse idempotently, while malformed, conflicting, duplicate, unreadable, mismatched, or digest-mismatched evidence stops. A truly unadopted scope remains legacy-compatible. These records grant no workflow authority.

If closeout stops because the target is dirty or close progress is partial, invoking `execute-issue` again only checks the recorded identities and evidence, reports the still-valid completion, and stops. It does not rerun baseline checks, focused checks, final verification, the full suite, review, commits, or tracker writes. Preserve and resolve the target work, then retry `/close-issue <Issue-ID>`.

After a safely aborted close conflict, the human or same authorized coordinator may start one successor attempt in the same branch and worktree from the latest target when the original Acceptance Criteria and ownership are unchanged. The coordinator preserves the original task/worktree and a ten-wave repair budget across re-entry. The new completion becomes current only after required verification and clean independent review; a scope change returns to planning.

Any number of Issue worktrees may complete concurrently against the same recorded target. Their completion notes remain valid while `close-issue` serially advances that target.


When a Run creates the Codex task with a Git worktree, execution verifies and adopts that exact lane. It does not create a second worktree. The installed GitHub path gives completion notes a structured encoding of the same reviewed evidence so the coordinator can read identities without interpreting prose.

Successful verification is reused only while the candidate, exact command, relevant configuration, environment and freshly read required external inputs remain unchanged. A new candidate or integration combination gets the checks it needs; tracker retries do not repeat an unchanged expensive suite.

## It's working if

- Implementation stays in the exact Issue worktree and preserves the recorded target and Acceptance Criteria.
- Focused checks, the required full suite, and both review axes pass for one clean candidate SHA.
- The completion note binds that candidate and its required evidence without merging, closing, pushing, or deploying it.

## Where it fits

`execute-issue` follows a Single-Issue [to-spec](https://aihero.dev/skills-to-spec) or ready [to-tickets](https://aihero.dev/skills-to-tickets) child and stops before integration. A human or the same authorized coordinator next invokes [close-issue](https://aihero.dev/skills-close-issue). After all desired closes, [verify-target-before-push](https://aihero.dev/skills-verify-target-before-push) proves the aggregate target. See [ask-matt](https://aihero.dev/skills-ask-matt) for routing.

When an approved workflow repair must run before its coordinator can start, the original human Start can supply the bounded maintenance handoff described in [Run preparation](https://github.com/ron03wlb/skills/blob/features/ron/docs/agents/run-preparation.md#approved-pre-run-workflow-maintenance). The leaf retains its normal ownership and verification; a second human command is unnecessary.
