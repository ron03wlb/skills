Quickstart:

```bash
npx skills add mattpocock/skills --skill=close-issue
```

```bash
npx skills update close-issue
```

[Source](https://github.com/mattpocock/skills/tree/main/skills/engineering/close-issue)

## What it does

`close-issue` closes one verified Ron Issue under an exact close capability.

Leaf mode only verifies and closes the Leaf. Parent or Standalone mode reconciles the Wiki, creates and fully reviews one Target Integration Candidate, fast-forwards the local target, verifies it, closes the Issue, and then cleans the Lane.

## When to reach for it

Type `/close-issue`, or the agent reaches for it automatically when the exact close capability is already recorded. Use Leaf mode after `implemented_on_lane`; use Parent mode only after every Leaf is closed.

## Prerequisites

The Issue must come from the [setup-ron](https://aihero.dev/skills-setup-ron) workflow with readable contracts, Grants, evidence, and Lane state. Parent closeout always pauses at one exact Closeout Preview; one `同意` authorizes the successful bounded path.

## Candidate before target

The target branch advances only to the SHA that passed Standards, Change Spec, and applicable Wiki review. A Wiki-only repair invalidates stale review evidence; a code or test finding creates a separately authorized Repair Leaf.

Cleanup removes only exact manifest-owned intermediates. It never deletes the Lane branch, pushes, remotely merges, deploys, or performs live-provider work.

## Where it fits

This is the closeout step after [execute-issue](https://aihero.dev/skills-execute-issue), repeated per Leaf and once at Parent. See [ask-ron](https://aihero.dev/skills-ask-ron) for proof-state routing and [ask-matt](https://aihero.dev/skills-ask-matt) for the upstream map.
