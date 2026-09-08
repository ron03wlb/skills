# Complete repair-wave model yield

Read only for a task with a model decision in its creation intent under a policy-bound Run, or its exact upgrade continuation. Direct execution, historical tasks and adopted prerequisite tasks retain their workflow. [The coordinator](../../../personal/run-issue-workflow/references/model-routing.md) owns selection and dispatch.

Read the first Grant, original intent, substitution and upgrade reservation in the existing Run journal. All policy-bound tasks retain the progress contract below, including after an upgrade. If an upgrade exists, or the setting is Astra/xhigh or higher, continue the original repair loop without another yield. Environment, permission, tool, ambiguous requirements, advisories and duplicates follow their existing owners.

## Record each wave before changes

Read the operation's existing execution progress, conflict-repair journal and completion/blocked counts before starting or resuming repair. Re-entry resumes the exact unfinished wave and its frozen before-candidate; it never starts counting again. For a new wave, increment the proven cumulative count once, at most ten. Missing or conflicting prior activity/count evidence stops; do not substitute zero.

Use the installed `github-workflow-records.mjs` renderer to append `kind: implementation_repair_progress` on this Issue before code changes. Include full `operationIdentity`, `runId`, `issueId`, `specId`, `target`, exact `taskRef`, `worktree`, `topic`, the full clean reviewed `before` candidate, and cumulative `repairWaves`. These are the existing operation and lane bindings, not new authority. Read the exact body back and retain its native note identity and body SHA-256. Reuse an identical existing record after uncertainty; a different before-candidate cannot reuse a wave number. Never backfill or rewrite progress to manufacture eligibility.

Every yielded wave carries this read-back reference as `progress: { identity, bodySha256 }`. The coordinator reads all structured execution progress, checks contiguous counts beyond already proven history, rejects conflicting reused numbers, and matches each yielded wave to its recorded start. Free-form progress or missing records cannot prove upgrade capacity. Legacy tasks keep their existing progress encoding.

## Finish and prove two waves

Preserve cumulative execution and conflict-repair counts. Before code repair, append/read back the count through normal execution progress. Each wave finishes actual code changes, a clean committed candidate, renewed verification and both independent review axes. The same in-scope Confirmed finding must survive two consecutive waves, with fewer than ten total waves consumed.

Use `scripts/verification-cache.mjs` for every required check with exact command, configuration, environment and fresh external-input readers. Take the returned `key`, then read the persisted JSON at `<Git-common-directory>/workflow-verification/<execution-operation-key>/<key>.json`. Hash that parsed stored receipt with `modelEvidenceDigest(receipt)` from installed Run `scripts/issue-model-policy.mjs` as `bodySha256`. Do not hash the API return object: its `reused` diagnostic is not persisted. Missing stored evidence cannot support a yield. Keep the complete affected-check inventory.

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
- `waves`: exactly two consecutive entries with `number`, `before`, `candidate`, exact `progress` reference (`identity`, `bodySha256`), all required `verification` references (`key`, `bodySha256`) and both `reviews` references (`reviewerId`, `axis`, `bodySha256`).

Stop writing after the handoff. Publish neither completion nor blocked evidence for this yield. The coordinator checks native settlement and source evidence, reserves the allowance and sends explicit settings to this same task. Resume only from that candidate in the same worktree with the same cumulative count. An uncertain reply still consumes the one upgrade. Normal verification, independent review and completion-time gates remain required.
