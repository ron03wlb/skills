# Complete repair-wave model yield

Read only for a task with a model decision in its creation intent under a policy-bound Run, or its exact upgrade continuation. Direct execution, historical tasks and adopted prerequisite tasks retain their workflow. [The coordinator](../../../personal/run-issue-workflow/references/model-routing.md) owns selection and dispatch.

Read the first Grant, original intent, substitution and upgrade reservation in the existing Run journal. If an upgrade exists, or the setting is Astra/xhigh or higher, continue the original repair loop. Environment, permission, tool, ambiguous requirements, advisories and duplicates follow their existing owners.

## Finish and prove two waves

Preserve cumulative execution and conflict-repair counts. Before code repair, append/read back the count through normal execution progress. Each wave finishes actual code changes, a clean committed candidate, renewed verification and both independent review axes. The same in-scope Confirmed finding must survive two consecutive waves, with fewer than ten total waves consumed.

Use `scripts/verification-cache.mjs` for every required check with exact command, configuration, environment and fresh external-input readers. Record receipt `key` and `modelEvidenceDigest(receipt)` from installed Run `scripts/issue-model-policy.mjs` as `bodySha256`. Keep the complete affected-check inventory.

Give each independent reviewer the fixed before/candidate range, governing Standards or Spec, stable finding identity, and request to assess material code change. Each reviewer publishes its own full report under the Git common directory at `workflow-reviews/<execution-operation-key>/<digest-without-prefix>.json`, using exclusive creation and exact read-back. Compute the digest with `modelEvidenceDigest(report)`; reuse identical content and stop on conflict. The executor consumes reports without fabricating reviewer identity or findings:

```json
{
  "schema": "issue-repair-review:v1",
  "operationId": "<execution operation key>",
  "reviewerId": "<actual independent reviewer identity>",
  "axis": "Spec",
  "candidate": "<full reviewed commit>",
  "materialChange": true,
  "findings": [{
    "identity": "<stable finding ID>",
    "axis": "Spec",
    "governingSource": "<exact AC or documented standard>",
    "summary": "<unchanged concrete defect>",
    "classification": "confirmed",
    "inScope": true
  }]
}
```

Use distinct independent reviewer identities for the axes and retain all advisories in full reports. The matching finding's identity, axis, governing source and defect remain stable across waves. Both reports bind the current candidate, including an axis with no findings. Reports supply evidence only, never exemptions or authority.

## Stop writes and yield

After the second complete wave, verify clean HEAD and registered topic/worktree. End the turn with `Workflow model yield: <single-line JSON>` containing:

- `schema: issue-model-yield:v1`, exact `runId`, `issueId`, full execution `operationIdentity`, `target`, `taskRef`, `worktree`, `topic`, `candidate`, cumulative `repairWaves`, and `writesStopped: true`;
- `finding`: the exact stable Confirmed finding object above;
- `waves`: exactly two consecutive entries with `number`, `before`, `candidate`, all required `verification` references (`key`, `bodySha256`) and both `reviews` references (`reviewerId`, `axis`, `bodySha256`).

Stop writing after the handoff. Publish neither completion nor blocked evidence for this yield. The coordinator checks native settlement and source evidence, reserves the allowance and sends explicit settings to this same task. Resume only from that candidate in the same worktree with the same cumulative count. An uncertain reply still consumes the one upgrade. Normal verification, independent review and completion-time gates remain required.
