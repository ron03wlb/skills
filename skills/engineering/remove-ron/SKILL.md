---
name: remove-ron
description: Remove only the retired repository-local Ron setup footprint.
disable-model-invocation: true
---

# Remove Ron

Remove the retired Ron setup footprint from one consumer repository while preserving shared Matt configuration and all product history. This skill is user-invoked and never removes the installed skills themselves.

## Preflight

Resolve the repository root, inspect Git status, resolve `git rev-parse --git-path ron-workflow`, read the tracker configured by `setup-matt-pocock-skills`, and inspect `git worktree list --porcelain`. Treat cleanup as inactive only when every check below completes and is negative:

- no open Issue for this repository contains a current `workflow-local-lifecycle-authorization:v1` record, a legacy `workflow-authorization:v1` or `workflow-clean-path-delegation:v1` record, or an open execution state derived from any of them;
- `drafts/`, `executions/`, and `ownership/` under the resolved metadata path are absent or empty;
- no metadata record names a branch or worktree still present in the Git worktree listing;
- every remaining metadata file is a retired config, preview, ledger, manifest, or validation artifact rather than an unknown marker.

Tracker failure, unreadable metadata, or an unknown file makes the state ambiguous and stops. Also stop when:

- dirty overlap touches a file or instruction block that cleanup would edit;
- ambiguous ownership makes a Ron-only instruction impossible to distinguish from shared repository guidance.

Unrelated dirty work remains untouched.

## Remove only the retired footprint

1. Delete tracked `docs/agents/ron-workflow.md` when present.
2. In `AGENTS.md` or `CLAUDE.md`, surgically remove only clearly bounded Ron-only instruction text. Preserve tracker setup, domain docs, repository standards, and all unrelated instructions.
3. Remove inactive `.git/ron-workflow/` metadata only after all four inactive checks pass. Treat unclear metadata as active and stop.

This skill does not delete the Wiki, Issues, comments, branches, worktrees, installed skills, product files, or shared `setup-matt-pocock-skills` configuration. Report any such artifacts that remain.

## Verify and commit

Review the exact diff, verify repository instructions still parse and shared tracker/domain guidance remains, then stage only the tracked cleanup paths. Create one local cleanup commit only when a tracked diff exists. Metadata-only cleanup creates no empty commit.

There is no push, remote merge, or deploy. Destructive cleanup beyond the exact retired footprint requires separate authority.
