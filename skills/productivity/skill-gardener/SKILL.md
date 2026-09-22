---
name: skill-gardener
description: Audit a skill catalog for stale, redundant, unsafe, or low-value skills and classify each as keep, optimize, investigate, or remove. Use for recurring skill maintenance or when asked which skills need improvement or retirement; stay read-only.
---

# Skill Gardener

Garden the catalog: preserve distinct value, trim instruction sediment, and recommend removal only from evidence.

## 1. Establish the catalog

Read the repository instructions and discover every `SKILL.md` in scope. Include each skill's invocation metadata and every surface that publishes, documents, routes to, or depends on it. Preserve repository-defined distinctions such as promoted, personal, draft, miscellaneous, and deprecated buckets.

Load `writing-for-agents` as a named skill; use the generic Skill tool when available, otherwise the host-supported named-skill mechanism. Apply its pointer, invocation, hierarchy, completion, relevance, duplication, and no-op tests.

This step is complete when every discovered skill has an identity, invocation mode, lifecycle bucket, and set of companion surfaces.

## 2. Gather health evidence

Inspect each skill and compare the catalog as a whole:

- **Reachability:** name, path, description, invocation policy, router, manifest, README, and docs agree.
- **Execution:** steps have checkable completion criteria, branch-specific reference is disclosed, and required dependencies can be loaded.
- **Relevance:** instructions still match available tools, paths, commands, domain terms, and repository policy.
- **Distinct value:** the skill owns a useful job or reusable discipline that neighbouring skills do not already cover.
- **Load:** descriptions earn their permanent context cost; bodies do not carry duplicated meaning, stale caches, no-ops, or unrelated branches.
- **Lifecycle:** deprecation, supersession, migration, issue history, and Git history support the claimed status.

Treat metrics and absence as navigation only. Age, low edit frequency, low reference count, length, or apparent non-use never proves that a skill should be removed.

## 3. Assign one verdict per skill

Use exactly one verdict:

| Verdict | Evidence bar |
| --- | --- |
| `Keep` | The skill has a distinct reachable job and no material defect supported by current evidence. |
| `Optimize` | The job remains useful, and a concrete pointer, structure, execution, relevance, duplication, or packaging defect is evidenced. |
| `Investigate` | A plausible problem exists, but the evidence needed for a safe change or retirement is missing. |
| `Remove` | One exact deletion is supported by a **removal invariant** and repository evidence that the invariant holds. |

A removal invariant states why deleting this exact skill preserves every supported job. It must identify the successor or prove the job is intentionally retired, account for every router, dependency, package, docs, and compatibility surface, and name any migration or deprecation required for users. A promoted or public skill without that evidence is `Investigate`, never `Remove`.

For every non-`Keep` verdict, cite exact paths and lines, explain the user or agent impact, and propose the smallest next action. Prefer optimizing a live skill over splitting or replacing it unless the catalog evidence shows a genuinely independent trigger or owner.

This step is complete when every discovered skill appears exactly once in the verdict matrix and every `Remove` row carries a complete removal invariant.

## 4. Report, do not mutate

Return:

1. **Coverage** — roots, skill count, companion surfaces checked, and evidence gaps.
2. **Action queue** — `Remove` first, then `Optimize`, then `Investigate`, ordered by impact and confidence.
3. **Verdict matrix** — every skill with verdict, confidence, evidence, and smallest next action.
4. **Removal plans** — one section per `Remove` verdict listing the invariant, affected surfaces, migration/deprecation needs, and verification needed before deletion.
5. **Clean result** — when no action is justified, say `Skill garden is clean` and still include coverage plus the verdict matrix.

Remain read-only. Do not edit, deprecate, move, or delete skills; do not change manifests or open tracker items. Approved changes return to `writing-for-agents` as separate work.
