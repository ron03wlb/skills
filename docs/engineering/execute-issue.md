Quickstart:

```bash
npx skills add mattpocock/skills --skill=execute-issue
```

```bash
npx skills update execute-issue
```

[Source](https://github.com/mattpocock/skills/tree/main/skills/engineering/execute-issue)

## What it does

`execute-issue` implements one dependency-ready Tracker Spec or child Issue in a dedicated worktree, verifies it, and runs [code-review](https://aihero.dev/skills-code-review) independently for Standards and Spec until both are clean.

It trusts the published delivery classification. The Planning Seal must be reachable and current, but expected paths remain discovery hints rather than an allowlist. Entry performs read-only prerequisite discovery: `NOT_REQUIRED` preserves the ordinary route, current `READY` evidence reuses its Issue worktree and ancestry, and missing or stale required evidence stops with a pointer to [pre-execute-issue](https://aihero.dev/skills-pre-execute-issue).

## When to reach for it

You invoke this by typing `/execute-issue <Issue-ID>` — the agent won't reach for it on its own.

Reach for it when [to-spec](https://aihero.dev/skills-to-spec) or [to-tickets](https://aihero.dev/skills-to-tickets) emits that exact command. Use [implement](https://aihero.dev/skills-implement) for an approved Standalone Spec or explicit direct current-branch task.

## Trustworthy candidate

Necessary source-grounded dependencies continue automatically while Acceptance Criteria stay unchanged; behavior, target, exclusion, or ownership changes return to planning. Late prerequisite discovery preserves coherent checkpoints and stops before dependent verification so the human can run `pre-execute-issue` in the same worktree. Focused checks run through implementation, followed by required final verification and the repository full suite.

Confirmed review findings are repaired for at most ten waves per invocation. Every blocked exit records and reads back an `implementation_blocked` terminal state, so a failed retry supersedes older success for that Issue only. `implementation_complete` is recorded only when final verification passes, both review axes are clean, the worktree is clean, and its `HEAD` equals the reviewed candidate.

## Where it fits

`execute-issue` follows a Single-Issue [to-spec](https://aihero.dev/skills-to-spec) or ready [to-tickets](https://aihero.dev/skills-to-tickets) child and stops before integration. The human next invokes [close-issue](https://aihero.dev/skills-close-issue). After all desired closes, [verify-target-before-push](https://aihero.dev/skills-verify-target-before-push) proves the aggregate target. See [ask-matt](https://aihero.dev/skills-ask-matt) for routing.
