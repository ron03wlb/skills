Quickstart:

```bash
npx skills add mattpocock/skills --skill=execute-issue
```

```bash
npx skills update execute-issue
```

[Source](https://github.com/mattpocock/skills/tree/main/skills/engineering/execute-issue)

## What it does

`execute-issue` implements one tracker Issue in a dedicated worktree, then runs Matt's existing [code-review](https://aihero.dev/skills-code-review) for Standards and Spec. Confirmed findings are fixed and the full review reruns until clean, up to ten repair waves per invocation.

Before creating the worktree, it validates any recorded **Planning Seal**: the seal commit must exist locally and be an ancestor of the execution baseline. A seal-currency check rejects an uncommitted planning delta already owned by the Issue or Spec; it is not scope authority. `execute-issue` never commits or repairs target-branch planning files itself.

## When to reach for it

Type `/execute-issue` after explicitly choosing the worktree alternative for a dependency-ready Issue. The agent won't reach for it on its own; [implement](https://aihero.dev/skills-implement) remains the default.

## Review-repair loop

The Issue and its linked Spec define scope. Tool failures, duplicates, and unsupported findings do not consume a repair wave; scope expansion stops until the Issue or Spec and its Planning Seal are updated.

Clean execution writes one compact tracker completion note with the Planning baseline, original target, worktree, topic branch, candidate commit, both clean review axes, verification results, and repair count. It does not integrate, remove the worktree, or close the Issue.

## Where it fits

It is the issue-worktree implementation step after a bounded [to-spec](https://aihero.dev/skills-to-spec), a frontier [to-tickets](https://aihero.dev/skills-to-tickets) Issue, or [triage](https://aihero.dev/skills-triage), followed by a separately invoked [close-issue](https://aihero.dev/skills-close-issue). Use [implement](https://aihero.dev/skills-implement) instead when work can finish in the current branch without a separate integration phase; see [ask-matt](https://aihero.dev/skills-ask-matt) for the full map.
