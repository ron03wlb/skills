---
status: accepted
---

# Constrain coordinator-selected Issue models

`run-issue-workflow` lets its coordinator choose an Issue task's model and reasoning effort from the approved `gpt-5.6-terra`, `gpt-5.6-sol`, and `gpt-6-astra` model pool using scope, Acceptance Criteria, affected modules, and risk, with a concise selection reason and adequate quality taking priority over lower cost and latency. Dispatch code validates the allowed model and applicable risk floor before issuing the native task request. This separates semantic assessment from enforceable dispatch constraints so scheduling can respond to different tasks while retaining auditable selection boundaries.

The following minimum model and reasoning settings apply to Issue task selection:

| Work characteristics | Minimum model | Minimum reasoning effort |
| --- | --- | --- |
| Local, explicit, mechanically verifiable work without material behavioral risk | `gpt-5.6-terra` | `medium` |
| Ordinary business logic, multistep implementation, or changes across modules | `gpt-5.6-sol` | `high` |
| Authorization or security, financial accounting, data migration, concurrency consistency, public contract changes, or behavior changes across systems | `gpt-6-astra` | `high` |

When multiple characteristics apply, use the highest applicable floor. The coordinator may select a stronger model or higher supported reasoning effort with a concrete reason.

Select the model and reasoning effort once before the first dispatch of each Issue task. Ordinary implementation, retries, repairs, and closeout retain that selection in the same task.

Each Issue may receive at most one evidence-supported automatic model or reasoning-effort upgrade in total. The upgrade retains the existing task, worktree, and completed work, and records its reason.

Upgrade eligibility requires the same in-scope Confirmed code review finding to remain unresolved after two consecutive material repair waves, each with actual code changes and renewed verification. The coordinator validates the repair and verification evidence; environment, permission, tool, or unresolved-requirement failures follow their existing recovery or stop rules. An upgrade retains the cumulative repair count and the existing maximum of ten repair waves for the same Issue operation.

| Current setting | Eligible automatic upgrade |
| --- | --- |
| `gpt-5.6-terra` or `gpt-5.6-sol` | `gpt-6-astra` with at least `high` reasoning, preserving any higher existing reasoning effort |
| `gpt-6-astra` with `high` reasoning | `gpt-6-astra` with `xhigh` reasoning |
| `gpt-6-astra` with `xhigh` or higher reasoning | Keep the existing setting and continue within the original repair budget |

Before the first task is created, confirmed unavailability of the selected `gpt-5.6-terra` or `gpt-5.6-sol` model selects `gpt-6-astra` directly, with the substitution reason and final setting recorded. If `gpt-6-astra` is unavailable, block that Issue while independent Issues continue. After creation, tasks governed by this policy retain their fixed selection and the evidence-supported one-upgrade rule.

The policy applies only to new Issue tasks created by newly policy-bound Runs. Runs, tasks, and unresolved creation intents that predate policy adoption retain their original settings and workflow. A new Run that adopts a prerequisite task created beforehand also preserves that task's settings. Each eligible Run retains its model-policy version across reconciliation and re-entry; a newer runtime does not enroll an unbound Run.

An upgrade handoff occurs only after `execute-issue` finishes a complete repair wave, including the changes, verification, and review, fixes the candidate identity, reports upgrade evidence, and stops writing. The coordinator validates eligibility and remaining upgrade capacity, then sends a continuation with the new settings to the same task. The task resumes with its existing worktree, candidate, and cumulative repair count. `run-issue-workflow` owns upgrade validation and dispatch; `execute-issue` owns the boundary at which execution yields and resumes.

A clearly successful native host response confirms acceptance of the requested model and reasoning settings. Transport acknowledgement alone does not establish that acceptance. Record those requested settings, the selection or upgrade reason, and whether the host explicitly accepted the request. The current native task reader exposes no effective model or reasoning fields, so independent read-back of effective settings is recorded as `unavailable`. An uncertain submission preserves its original request and reconciles task state before any resend, preventing duplicate dispatch or upgrade.
