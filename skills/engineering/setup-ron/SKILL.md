---
name: setup-ron
description: Configure a repository for the Ron Issue delivery workflow.
disable-model-invocation: true
---

# Setup Ron

Configure one repository idempotently for the Ron workflow. Direct invocation authorizes one exact clean local configuration path; continue without another routine prompt when every detected fact, path, capability, and validation result is clean.

Do not invoke the user-invoked `/setup-matt-pocock-skills`. Reuse its shared files when they exist and add only the Ron contract.

## Shared core

Resolve this `SKILL.md` to its real path, ascend to the plugin root, and use `scripts/ron-workflow/ron-wiki.mjs`. Validate the final `docs/agents/ron-workflow.md` with `config-validate` and inspect `capabilities`. Do not hand-roll config parsing or silently weaken a missing resolver.

## Full-mode requirements

Ron v1 full mode requires GitHub Issues with:

- durable append-only comments and stable IDs;
- exact comment read-back;
- Issue hierarchy or durable parent references;
- closure-state read-back.

Probe the configured adapter read-only. A failed or unavailable probe leaves setup degraded or incomplete; never claim cross-session authorization guarantees from local Markdown, labels, or an unverified adapter. Do not create a probe Issue without separate authority.

## Inspect without mutating

Read:

- repository identity, remotes, Git config, current and candidate target branches;
- root `AGENTS.md` or `CLAUDE.md`;
- shared tracker, domain, and optional triage configuration;
- `CONTEXT.md`, ADRs, existing Ron config, worktrees, and cleanliness;
- candidate knowledge roots, indexes, navigation, builds, and current-behavior scope;
- available source-resolver languages/formats and exact deterministic validators.

For every candidate Wiki root, assess it at one fixed target identity:

1. Git-tracked and present at that identity;
2. scoped to current business behavior;
3. contains a topic/page inventory or index;
4. has no competing canonical authority.

All four produce `adoptable`; anything else is `needs-bootstrap` and may supply only source seeds. `adoptable` does not mean `ready`.

## Resolve one configuration

Prefer evidenced facts. Default a new root to `wiki/` without creating it. For an `adoptable` root, run deterministic page/source/link/build checks and one independent read-only semantic review against current code and tests. Record `ready` only when both axes are clean; otherwise record `missing` and report the evidence gap or repair/migration trade-off.

A `missing` baseline does not make Ron delivery incomplete. It enables Wiki-optional delivery: semantic Issues may complete through closeout while every Wiki-specific gate, claim, write, validation, and review remains not applicable.

Select:

- `mode: full | degraded` from the tracker probe;
- `interaction.policy: exception_only`;
- the `ron-wiki:v1`, page, Sources, and resolver contracts;
- protocol identity/hash and optional engine state; engine defaults to `absent`;
- exact validator commands and `wiki_support_write_set`;
- local target branch, fast-forward-only integration, and Lane convention;
- immutable exclusions for push, remote merge, deploy, branch deletion, and live-provider actions.

External resolvers require an exact executable identity or content hash, supported kinds/extensions, a read-only invocation, and a clean capability probe. Missing support remains `not-verifiable`.

Stop for human decision only on competing roots, conflicting instructions, dirty overlap, missing required capability, unsupported environment, or a choice that changes scope or authority.

## Write the exact contract

Create or update `docs/agents/ron-workflow.md` with exactly one marker-bounded `ron-workflow-config:v1` strict JSON block. Preserve human explanation outside the block, but never derive machine state from it. Persist only `baseline_state: missing | ready`; never persist `bootstrapping`.

Reuse `docs/agents/issue-tracker.md` and `docs/agents/domain.md`. Create them only when missing and update them surgically. Add or update one `## Agent skills` section in the existing instruction file; if neither instruction file exists, use the repository's established convention or stop when no safe convention exists.

Setup writes only approved Ron operational configuration and instruction paths. It never creates Wiki baseline content, product Issues, product changes, engine state, publication output, or Execution Lanes.

## Validate and commit locally

1. Read every proposed file back.
2. Run `config-validate`, tracker capability probes, path/command checks, and exact-diff validation.
3. Confirm no unexpected path, baseline content, product change, or unrelated dirt is staged.
4. Create one local setup commit containing only exact configuration paths.
5. Fast-forward the named local target to that commit and verify its contents there.

Use a setup-owned worktree when isolation is required. Dirty overlap, unexpected path, conflict, hook failure, commit failure, target drift, or verification failure stops with recoverable state. Never push, remote-merge, deploy, delete a branch, or change live providers.

Return only `設定完成` when clean. Expand exact changed paths and proof details only for a finding, missing capability, or user request.
