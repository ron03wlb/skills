# Issue task model routing

Use this branch for a new Run explicitly authorized for the Terra/Sol/Astra pool and one bounded upgrade, or an existing Run whose first `grant.recorded` contains `modelPolicy`. Reuse the actual human approval reference; missing approval belongs to the existing preparation owner before Start. Host capability is not approval. Historical unbound Runs, tasks, unresolved intents and adopted prerequisite tasks retain their settings. Runtime observations and terminal re-entry never enroll them.

## Select once

Run the installed `scripts/inspect-model-inputs.mjs <repository> <Spec-ID>` read-only. It checks publication/body digests and blockers, returning complete Issue/Spec contracts and `inputIdentity`. Assess scope, Acceptance Criteria, affected modules and every named risk. Quality precedes cost/latency; use the highest applicable floor:

| Characteristics | Minimum model / thinking |
| --- | --- |
| `local-mechanical`: local, explicit, mechanically verifiable, no material behavioral risk | `gpt-5.6-terra` / `medium` |
| `business-logic`, `multistep-implementation`, `cross-module` | `gpt-5.6-sol` / `high` |
| `authorization-security`, `financial-accounting`, `data-migration`, `concurrency-consistency`, `public-contract`, `cross-system-behavior` | `gpt-6-astra` / `high` |

Supported efforts are `low`, `medium`, `high`, `xhigh`, `max`, `ultra`; floors still apply. Stronger settings need a concrete reason. Assessment categories are coordinator judgments supported by exact contract quotations, not transport keyword inference. Missing evidence, unsupported settings and lower floors fail before native dispatch.

Supply an exact coordinator JSON file as the installed entry's fourth positional argument; use an empty third argument when no Run ID is supplied:

```json
{
  "policy": {
    "version": "issue-model-policy:v1",
    "specId": "<native Spec ID>",
    "target": "<recorded target>",
    "approvedScopeHash": "<current approved hash>",
    "authorization": "<actual human pool and escalation approval reference>"
  },
  "decisions": {
    "<native Issue ID>": {
      "inputIdentity": "<owning-source input identity>",
      "model": "gpt-6-astra",
      "thinking": "high",
      "reason": "<why this setting fits the whole contract>",
      "assessment": {
        "scope": ["<exact passage>"],
        "acceptanceCriteria": ["<exact passage>"],
        "affectedModules": ["<exact passage>"],
        "characteristics": [{"name": "public-contract", "evidence": ["<exact passage>"]}]
      }
    }
  }
}
```

For a batch, key the outer object by each explicitly selected Spec locator; each value has this shape and its own approval. This input never replaces the Grant or tracker publication. The first Grant freezes policy membership/version; the creation intent freezes the validated decision and exact native settings before submission. Restarts reconcile that original request. Ordinary implementation, retries and closeout omit setting overrides.

## Availability and acceptance

Only native `MODEL_UNAVAILABLE` evidence identifying the model and explicitly proving `requestSubmitted: false` authorizes pre-creation fallback. Record that rejection and reserve direct Astra substitution at at least `high`, preserving higher effort, before submitting it. Unknown errors, host loss and transport `response-accepted` retain the exact uncertain request and reconcile task state. Astra unavailability isolates the Issue and dependants while independent work continues. After creation retain the fixed selection and one-upgrade rule.

Creation intent, `model.substitution`, `model.upgrade` and `model.acceptance` audit settings, policy, reason, request identity and outcome. Clear native task/setup or same-task continuation success proves host acceptance. Recovered tasks and matching messages prove dispatch observation only. Independent effective-setting read-back is `unavailable`; prompt matches and worker statements cannot prove it.

## Continue one complete repair yield

Only the executor's [complete repair-wave yield](../../../engineering/execute-issue/references/model-repair-yield.md) is eligible. The reader validates operation identity, registered clean candidate/worktree, native stopped-task state, two consecutive actual code changes, exact started-progress references, candidate-bound verification receipts and independent reviewer-owned reports. Cumulative capacity includes all operation-bound structured execution progress, completion/blocked history and persisted conflict-repair counts. Missing prior progress, conflicting reused wave numbers, regression or exhaustion cannot authorize an upgrade. The same in-scope Confirmed finding must persist through both waves. Advisories, duplicates, environment, permission, tool and requirement failures retain their existing owners.

The reducer schedules `upgrade_issue` within existing worker, Pause/Stop and blocker limits. Reserve the sole `model.upgrade` before sending explicit settings to the same task. Terra/Sol go directly to Astra at at least `high`, preserving higher effort; Astra/high goes to xhigh. Astra/xhigh or higher continues without yielding. Preserve the cumulative ten-wave limit; wave ten has no automatic continuation capacity.

Recheck stopped task ownership and clean candidate immediately before sending. A lost reply reconciles exact message history before any bounded resend of that same request, never another reservation or replacement task. Yield is neither completion nor a genuine blocked exit. Normal execution completion gates still apply.
