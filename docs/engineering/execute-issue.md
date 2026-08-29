Quickstart:

```bash
npx skills add mattpocock/skills --skill=execute-issue
```

```bash
npx skills update execute-issue
```

[Source](https://github.com/mattpocock/skills/tree/main/skills/engineering/execute-issue)

## What it does

`execute-issue` implements one dependency-ready Tracker Spec or child Issue in a dedicated worktree, verifies it, and runs [code-review](https://aihero.dev/skills-code-review) independently for Standards and Spec until both are clean. It records the branch from which that worktree was created as the Issue's only default merge target.

It trusts the published delivery classification. The Planning Seal must be reachable and current, but expected paths remain discovery hints rather than an allowlist. If the Issue declares a Manual prerequisite, one human attestation naming the exact executed artifact is sufficient; missing evidence points to [pre-execute-issue](https://aihero.dev/skills-pre-execute-issue) with that path.

## When to reach for it

You invoke this by typing `/execute-issue <Issue-ID>` — the agent won't reach for it on its own.

Reach for it when [to-spec](https://aihero.dev/skills-to-spec) or [to-tickets](https://aihero.dev/skills-to-tickets) emits that exact command. Use [implement](https://aihero.dev/skills-implement) for an approved Standalone Spec or explicit direct current-branch task.

## Trustworthy candidate

Necessary source-grounded dependencies continue automatically while Acceptance Criteria stay unchanged; behavior, target, exclusion, or ownership changes return to planning. Late prerequisite discovery preserves coherent checkpoints and stops before dependent verification so the human can record the executed artifact once; the matching attestation resumes the same lane without DB verification or another setup flow. Focused checks run through implementation, followed by required final verification and the repository full suite.

Confirmed review findings are repaired for at most ten waves per invocation. `implementation_complete` is recorded only when final verification passes, both review axes are clean, the worktree is clean, and its `HEAD` equals the reviewed candidate. A later blocked state supersedes it only when evidence invalidates that candidate's implementation, review, or verification; movement of the recorded target, a close conflict, or aggregate-gate failure does not restart execution.

If closeout stops because the target is dirty or close progress is partial, invoking `execute-issue` again only checks the recorded identities and evidence, reports the still-valid completion, and stops. It does not rerun baseline checks, focused checks, final verification, the full suite, review, commits, or tracker writes. Preserve and resolve the target work, then retry `/close-issue <Issue-ID>`.

After a close conflict, the human may explicitly start one successor attempt in the same branch and worktree from the latest target when the original Acceptance Criteria and ownership are unchanged. The new completion becomes current; a scope change returns to planning.

Any number of Issue worktrees may complete concurrently against the same recorded target. Their completion notes remain valid while `close-issue` serially advances that target.

## Where it fits

`execute-issue` follows a Single-Issue [to-spec](https://aihero.dev/skills-to-spec) or ready [to-tickets](https://aihero.dev/skills-to-tickets) child and stops before integration. The human next invokes [close-issue](https://aihero.dev/skills-close-issue). After all desired closes, [verify-target-before-push](https://aihero.dev/skills-verify-target-before-push) proves the aggregate target. See [ask-matt](https://aihero.dev/skills-ask-matt) for routing.
