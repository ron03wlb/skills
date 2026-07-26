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

Leaf mode only verifies and closes the Leaf. Parent or Standalone mode requires an aligned Wiki reconciliation ledger, creates and fully reviews one Target Integration Candidate, fast-forwards the local target, verifies it, closes the Issue, and then cleans the Lane.

## When to reach for it

Type `/close-issue`, or the agent reaches for it automatically when the exact close capability is already recorded. Use Leaf mode after `implemented_on_lane`; use Parent mode only after every Leaf is closed.

## Prerequisites

The Issue must come from the [setup-ron](https://aihero.dev/skills-setup-ron) workflow with readable contracts, Grants, evidence, and Lane state. A valid human root derives the exact Closeout Grant without another routine prompt; a derived Issue Grant never delegates again. A Parent has no executable contract, so closeout uses the ordered child-contract and aggregate-evidence hashes. Otherwise the compact Preview asks for one `同意`.

## Candidate before target

The target branch advances only to the candidate that passed Standards, Change Spec, and applicable Wiki review. Target refresh is denied: if the bound target moves first, the root, Preview, and Grants expire and closeout asks for a new decision. Any finding stops for human decision. A bounded Wiki-only repair invalidates stale review evidence; a code or test defect requires a separately authorized Repair Leaf.

Cleanup removes only exact manifest-owned intermediates. It never deletes the Lane branch, pushes, remotely merges, deploys, or performs live-provider work.

## Where it fits

This is the closeout step after [execute-issue](https://aihero.dev/skills-execute-issue), repeated per Leaf and once at Parent. It owns the same reconciliation primitive used by [wiki](https://aihero.dev/skills-wiki). See [ask-ron](https://aihero.dev/skills-ask-ron) for proof-state routing and [ask-matt](https://aihero.dev/skills-ask-matt) for the upstream map.
