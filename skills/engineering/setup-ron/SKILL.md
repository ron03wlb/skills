---
name: setup-ron
description: Configure a repository for the Ron Issue delivery workflow.
disable-model-invocation: true
---

# Setup Ron

Configure one repository for the Ron workflow. This is an idempotent, prompt-driven setup: inspect first, present one consolidated proposal, obtain one approval, then make only the missing or changed configuration edits.

Do not invoke `/setup-matt-pocock-skills`. Reuse its shared files when they exist, and add only the Ron-specific contract.

## Full-mode requirements

Ron v1 full mode requires GitHub Issues with:

- durable append-only comments with stable identifiers;
- exact comment read-back;
- Issue hierarchy or durable parent references;
- Issue state read-back after closure.

GitLab, Linear, other trackers, and local Markdown are degraded or unsupported in v1. Record the limitation and do not claim Ron's cross-session authorization guarantees. A failed capability probe leaves setup incomplete; it must not be waved through.

## Process

### 1. Inspect without mutating

Read:

- `git remote -v`, `.git/config`, the current branch, and candidate target branches;
- root `AGENTS.md` or `CLAUDE.md`;
- `docs/agents/issue-tracker.md`, `docs/agents/domain.md`, and optional `docs/agents/triage-labels.md`;
- `CONTEXT.md`, `CONTEXT-MAP.md`, and existing ADR locations;
- `docs/agents/ron-workflow.md`, if present;
- candidate Wiki roots, build configuration, navigation, indexes, and `llms.txt`;
- existing worktrees and repository cleanliness.

Probe the configured GitHub adapter read-only. Confirm the repository identity, comment identifiers/read-back, Issue relationships, and closure-state read-back. Do not create a probe Issue unless the user separately approves that external write.

### 2. Propose one configuration

Prefer detected facts over questions. Present one recommended proposal containing:

- tracker and capability-probe result;
- canonical Wiki root and engine, or an explicit missing-baseline state;
- Wiki build command and exact mechanical `wiki_support_write_set`;
- domain-doc layout;
- local target branch and current target SHA;
- Lane worktree root and naming convention;
- local fast-forward-only integration policy;
- proof-state and excluded-operation summary.

Ask for one consolidated approval. Ask a narrower follow-up only when the repository does not provide enough evidence to choose safely.

### 3. Write idempotently

Create or update `docs/agents/ron-workflow.md` with:

```yaml
ron_workflow: v1
mode: full | degraded
tracker:
  adapter: github
  repository: owner/name
  capability_probe: passed | failed
wiki:
  root: <path-or-null>
  engine: <name-or-null>
  build_command: <command-or-null>
  reviewed_baseline: <reference-or-missing>
  support_write_set:
    - <exact-path>
domain:
  layout: single-context | multi-context
target:
  branch: <local-branch>
  integration: fast-forward-only
lane:
  worktree_root: <absolute-or-repository-relative-path>
  naming: <convention>
excludes:
  - push
  - remote-merge
  - deploy
  - branch-deletion
  - live-provider-actions
```

Use `docs/agents/issue-tracker.md` and `docs/agents/domain.md` as shared configuration. Create them only when missing; update them surgically when the approved setup differs. Do not create Ron-specific duplicates.

Add or update one `## Agent skills` section in the existing `CLAUDE.md` or `AGENTS.md`, preserving all surrounding content. Point it to the shared tracker/domain files and `docs/agents/ron-workflow.md`. If neither instruction file exists, ask which one to create.

Do not invent a Wiki structure. Record `reviewed_baseline: missing` until a real baseline has been reviewed. Purely technical work may later use `wiki_impact: none`, but setup does not pre-approve that classification.

### 4. Verify

Read every written file back, validate paths and commands that can be checked safely, and rerun the read-only tracker probe. Report:

- `configured-full`, `configured-degraded`, or `not-configured`;
- exact files changed;
- current target branch/SHA and Wiki state;
- capabilities that remain excluded.

Setup never creates product Issues, Authorization Records, worktrees, commits, pushes, deployments, or live-provider changes.
