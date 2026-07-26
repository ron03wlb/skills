---
name: wiki
description: Initialize, resume, inspect, or synchronize the Ron Canonical Wiki.
disable-model-invocation: true
---

# Wiki

Provide one state-aware control for the repository-local Canonical Wiki. Infer initialization, resume, or affected-scope synchronization from verified state; do not ask the user to choose a mode or understand internal identities.

## Shared core

Resolve this `SKILL.md` to its real path, ascend to the plugin root, and use:

```text
node <plugin-root>/scripts/ron-workflow/ron-wiki.mjs <command>
```

Pass strict JSON on stdin and require the documented JSON result and exit code. If the core is absent, changed unexpectedly, or cannot prove a required contract, return `not-verifiable`. Do not reproduce its hashing, config, Preview, source, ledger, delegation, or Change Spec logic in prose.

## Preflight

Read the current target, `docs/agents/ron-workflow.md`, tracker configuration, `CONTEXT.md`, ADRs, candidate Wiki root, repository entry points, business rules, tests, and active Ron Issues.

Validate the exact `ron-workflow-config:v1` machine block with `config-validate`. Rebuild tracker comment and Authorization chains by stable IDs and hashes. Probe configured validators and `capabilities`; never infer support from a directory or old local record.

Stop as:

- `not-configured` when Ron config is absent;
- `not-verifiable` when identity, tracker, config, validator, resolver, or review proof cannot be established;
- `findings` on authority conflict, unexpected mutation, or confirmed inconsistency.

## Dispatch

An explicit `status` request is read-only. With no subcommand:

- persisted `missing` with no valid active Bootstrap Issue → initialize;
- `missing` plus one hash-valid, target-bound active Bootstrap Issue → resume;
- persisted `ready` → synchronize only affected topics and claims.

Conflicting active Issues, multiple roots, stored `bootstrapping`, or an invalid target binding is `not-verifiable`; do not guess.

## Status

Inspect config, canonical root, persisted and derived baseline state, active Bootstrap identity when applicable, topic inventory, validators, resolver capabilities, protocol/engine state, and derived publication state. Write nothing, including Git metadata.

Return only `ready`, `missing`, `bootstrapping`, `not-configured`, or `not-verifiable`. Keep technical evidence internal unless it explains a non-clean result or the user asks.

## Initialize a missing baseline

1. Scan current repository behavior read-only. Build one coherent business-topic/flow inventory, exact page paths, page scopes, source seeds, ordered topic batches, validators, exclusions, and disabled publication.
2. Build and validate one `workflow-wiki-bootstrap-preview:v1`. Before authority exists, write only its canonical envelope to `git rev-parse --git-path ron-workflow/wiki-previews/<preview-id>.md` with mode `0600`.
3. Stop as `not-bounded` before Issue creation when the complete baseline cannot fit one Standalone review boundary. Stop on any finding, ambiguity, unsupported source, or new path.
4. For a clean bounded Preview, use `delegation-envelope-create` to build and validate one human root `workflow-clean-path-delegation:v1` under `ron-workflow/delegations/`, mode `0600`. It grants exactly one immediate `publish_bootstrap_spec`, names the downstream `execute` and `close_standalone` sibling capabilities, includes task staging in its artifact ceiling, binds the exact validator, independent-review, and exclusion ceilings, and sets `target_refresh: denied`.
5. Use `change-spec-create`, then the configured tracker adapter to create or reuse exactly one Bootstrap Standalone Issue, post the exact envelope, and read it back by stable comment ID. This is the same publisher contract as `to-spec-ron`.
6. Use `execution-contract-create` to post and read back one exact Standalone contract binding the Spec, Preview, target, page/config paths, verification, and full review.
7. Use `grant-derive` to create the exact non-delegating `workflow-authorization:v1` Issue record. Supply the human root read-back hash, contract's Issue, type, Spec IDs/hashes, Wiki/Preview binding, and owned-paths hash; every field must match the root and requested Grant. Post and read the Grant back before creating a Lane. It binds the Spec and contract plus `wiki_operation: bootstrap`, `wiki_baseline_requirement: missing-with-bootstrap-preview`, the Preview, exact paths, `execute`, and `close_standalone`.
8. Invoke `execute-issue` for that Standalone. Generate candidate pages in task staging batches; validate each page, source locator, link, and configured build. Batches are checkpoints, not Leaves or partial target baselines.
9. Invoke `close-issue` in Standalone mode. It creates and validates the shared Closeout Preview with `closeout-preview-create`, then uses `closeout-grant-derive` to derive a sibling exact Grant directly from the same human root—not from the Issue Grant. Only one fixed complete candidate may pass independent Wiki review, local target advancement, target verification, Issue closure, and the atomic config transition to `ready`.

The target remains `missing` throughout bootstrap. Preserve the human root through exact Closeout Grant read-back and Issue close; only then delete its local copy. Delete the Preview only after its matching Change Spec reads back. Preserve both on failure. Any target drift invalidates the root and all downstream records; stop for a new human decision instead of refreshing authority.

## Resume bootstrap

Read and verify the active Issue, Spec, Preview, Grant, checkpoint, Lane, target binding, and current candidate. Resume only the next authorized incomplete step. Any stale hash, ambiguous lineage, target conflict, unexpected path, or missing evidence stops without creating another Issue or baseline.

## Synchronize a ready baseline

1. If one active Parent or Standalone Issue owns the change, reuse it and invoke the same reconciliation path in `close-issue`; do not create another Issue.
2. Otherwise audit read-only. If there is no drift, return `clean`.
3. For bounded Wiki-only drift, build `workflow-wiki-sync-preview:v1` with prior Wiki identity, drift evidence, a complete reconciliation ledger, and exact semantic/support ceilings. Validate it before writing its mode-`0600` envelope under Git metadata.
4. Stop when behavioral code changed without a current Change Spec. Code cannot be republished as requirements.
5. Require every ledger row to be `aligned`. `deviation`, `unverified`, finding, ambiguity, or scope expansion ends the clean path and returns the problem plus trade-offs.
6. For one clean bounded repair Preview, follow the same pre-Issue delegation, shared Change Spec publisher, derived Issue Grant, `execute-issue`, and Standalone `close-issue` sequence. Use `publish_wiki_repair_spec`; modify only ledger-derived paths.

Normal Parent or Standalone closeout calls this same sync primitive, so the user does not need to run `/wiki` after every change. Leaves never mutate Wiki.

## Result and authority

Clean human-facing output is only `初始化完成`, `同步完成`, or `檢驗通過`. Expand only findings, missing proof, trade-offs, and the recommended decision.

Direct invocation authorizes one bounded local initialization or synchronization after its exact Preview is known. It never authorizes push, remote merge, deploy, branch deletion, live-provider action, legacy-data deletion, publication, a second Issue, or new paths. Never self-approve a finding or expand the clean-path ceiling.
