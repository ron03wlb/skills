---
name: wiki
description: Inspect or update one repository Wiki independently from Issue delivery.
disable-model-invocation: true
---

# Wiki

Inspect or update repository documentation as an independent Wiki-only flow. Direct `/wiki` invocation authorizes Wiki-only local edits, validation, semantic review, repair, and one local commit. It does not depend on the Issue lifecycle.

## Resolve the Wiki root

Choose the root in this order:

1. an explicit path supplied by the user;
2. one unique existing Wiki root discovered from repository documentation and conventional directories;
3. the default `wiki/` directory when none exists.

If multiple plausible roots remain, ask which one to use. Never merge or move roots by guesswork.

## Status

`/wiki status` is read-only. Report the resolved root, tracked/untracked state, page inventory, available validation commands, and obvious structural findings. Write nothing and create no commit.

## Mutation preflight

For direct `/wiki`, inspect Git status and the committed `HEAD` source, tests, existing docs conventions, and any docs build. Stop if any tracked or untracked pre-existing change exists inside the resolved Wiki root, if related source/tests are uncommitted, or if ownership is ambiguous. Unrelated dirt outside the Wiki remains untouched.

## Edit and validate

Change only paths inside the resolved Wiki root. Every factual page must keep the repository's page structure and a `Sources` section that points to committed source, tests, or other durable evidence.

Run the smallest deterministic validation available:

- page structure and required sections;
- source-locator validity;
- internal links;
- the existing documentation build, when configured.

Resolve this `SKILL.md` to its real path and use the self-contained `scripts/wiki-validate.mjs` commands `page-validate`, `sources-validate`, and `links-validate`. Write strict input JSON to a temporary UTF-8 without BOM file, run `node <this-skill>/scripts/wiki-validate.mjs <command> <input-json-path> <output-json-path>`, and read the UTF-8 result. Do not pipe PowerShell text to `node`. No delivery configuration is required.

## Semantic review and repair

Freeze the Wiki diff and ask one fresh independent read-only reviewer to compare it with committed `HEAD` code and tests. The Coordinator confirms findings against evidence. Fix confirmed Wiki findings, rerun all deterministic validation, and repeat the full semantic review until clean.

Allow at most 10 repair waves per invocation. Count only waves where Wiki repair begins; tool failures, duplicates, and unsupported feedback do not count. Stop after wave 10 if a confirmed finding remains.

## Commit

When deterministic validation and semantic review are clean, stage only the resolved Wiki paths and create one local commit. If there are no tracked or untracked changes inside the resolved Wiki root, create no commit. Never modify source/tests, create or close tracker work, push, remote-merge, deploy, or publish.
