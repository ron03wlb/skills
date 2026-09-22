## What it does

`skill-gardener` audits a skill catalog and classifies every skill as `Keep`, `Optimize`, `Investigate`, or `Remove`. It checks invocation metadata, routing, packaging, docs, dependencies, stale references, duplicated instructions, and whether each skill still owns a distinct job.

It is read-only. A removal recommendation needs a **removal invariant**: the exact reason deleting one skill preserves every supported job, plus repository evidence for its successor or intentional retirement and every affected compatibility surface. Weak signals such as age, length, or low reference counts can start an investigation but cannot justify removal.

## When to reach for it

Type `/skill-gardener`, or let the [agent](https://www.aihero.dev/ai-coding-dictionary/agent) reach for it automatically when a task asks for skill-catalog maintenance.

Reach for it during periodic upkeep, before a skill release, or when the catalog feels repetitive or stale. For writing an approved fix after the audit, use [writing-for-agents](https://aihero.dev/skills-writing-for-agents); this skill only identifies and ranks the work.

## Prerequisites

Run it from a workspace containing the skills to audit. Repository instructions should identify any promoted, personal, draft, miscellaneous, or deprecated buckets so the gardener can judge each skill against its intended lifecycle rather than treating every directory alike.

## The removal invariant

A skill is not removable merely because a static check cannot find a caller. Public skills may have users outside the repository, and rarely edited skills may already be stable.

A `Remove` verdict therefore binds one exact deletion to all of the evidence needed to keep the catalog's supported jobs intact:

- the job is explicitly retired or has a named successor;
- no unique trigger, workflow branch, or reusable discipline disappears;
- routers, manifests, docs, dependencies, and compatibility promises are accounted for;
- any deprecation or migration users need is named before deletion.

When one of those facts is missing, the verdict is `Investigate`. When the job is still valuable but its instructions have accumulated sediment, the verdict is `Optimize`.

## Common questions

**Will it delete a skill automatically?**

No. It produces evidence and a ranked action queue, then stops. Removal, deprecation, and instruction changes are separate, approved work through `writing-for-agents`.

**Does an old or rarely referenced skill count as removable?**

No. Age, edit frequency, length, and apparent non-use are navigation signals, not proof. The report needs a removal invariant grounded in repository evidence before it can say `Remove`.

## It's working if

- Every discovered skill appears exactly once in the verdict matrix.
- Each `Optimize` row cites a concrete path and explains the user or agent impact.
- Each `Remove` row names the preserved job, successor or retirement decision, affected surfaces, and migration needs.
- Uncertain cases remain `Investigate` instead of being promoted to confident cleanup work.
- The audit changes no skill, manifest, router, or documentation file.

## Where it fits

`skill-gardener` is **periodic maintenance** for the skill catalog. Run it weekly or before a release to identify justified cleanup; use [writing-for-agents](https://aihero.dev/skills-writing-for-agents) to implement an approved optimization or retirement. For choosing among the wider skill set, [ask-matt](https://aihero.dev/skills-ask-matt) remains the router.
