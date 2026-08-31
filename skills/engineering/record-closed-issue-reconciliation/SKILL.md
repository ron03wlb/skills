---
name: record-closed-issue-reconciliation
description: Use when /verify-target-before-push hands off one exact human-confirmed closed-Issue evidence reconciliation packet.
---

# Record Closed Issue Reconciliation

Append or reuse one immutable reconciliation record for the exact historical completion-evidence failure proved by an active `/verify-target-before-push` recovery. This helper records authority only; it never decides target verification or push readiness.

## Require the confirmed recovery packet

Require one exact human-confirmed packet produced by the active `/verify-target-before-push` recovery. It contains the affected Issue and immutable completion-note identity, Issue target branch, execution baseline, affected candidate, identical diagnostic fingerprint, remedy Issue and immutable completion-note identity, remedy candidate, and complete tracker comment draft.

Reject a standalone or manual invocation without that active recovery packet and exact confirmation. Read repository instructions and tracker configuration before interpreting any identity.

## Revalidate eligibility and diagnostics

Re-read the affected Issue's complete ordered history. Require the affected Issue to be closed, its sole immutable completion note to be otherwise valid with exactly one non-passing command, its candidate reachable from the Issue target but not its execution baseline, and its exact Issue worktree absent. Any later valid completion, other invalidating evidence, ordinary open Issue, registered worktree, coverage failure, review failure, or additional historical failure stops without writing.

Create clean temporary worktrees at the exact affected baseline and candidate and rerun the one failed command read-only. Build each diagnostic fingerprint from the exact command, exit code, failure count, ordered failure identities, source locators, and assertion or error identities. Require identical baseline and candidate fingerprints and no additional candidate failure. Remove only those clean temporary diagnostic worktrees after the comparison.

Re-read candidate remedy Issues and require exactly one closed remedy Issue whose published scope and delivered diff explicitly own the complete correction. Require its valid passing completion evidence and candidate reachable from the same Issue target as the affected candidate. A coincidental target pass, partial remedy, multiple possible remedies, human cause attestation, or Direct target contribution is not remedy proof.

Immediately before mutation, re-read the affected and remedy Issues, both completion notes, target and refs, and rerun or revalidate the exact diagnostics. Any affected, remedy, completion, target, ref, diagnostic, eligibility, authority, or draft drift stops without writing.

## Reuse or append the exact record

Read the affected closed Issue's ordered history. Reuse one exact matching `closed_issue_evidence_reconciliation:v1` record without invoking the writer or creating a duplicate. A malformed, duplicate, edited, conflicting, drifting, unavailable, partial, or ambiguous plausible record stops without repair or inference.

Otherwise append exactly this record on the affected closed Issue:

```text
closed_issue_evidence_reconciliation:v1
affected:
  issue: <affected Issue ID>
  completion: <immutable completion-note identity>
  target: <Issue target branch>
  baseline: <full execution baseline SHA>
  candidate: <full affected candidate SHA>
diagnostic:
  command: <exact failed command>
  exit_code: <non-zero integer>
  failure_count: 1
  failures:
    - identity: <failure identity>
      source: <source locator>
      error: <assertion or error identity>
remedy:
  issue: <remedy Issue ID>
  completion: <immutable completion-note identity>
  candidate: <full remedy candidate SHA>
authorized_by: human
statement: authorized for exact-target verification only
```

The record contains only `affected`, `diagnostic`, `remedy`, `authorized_by`, and `statement`. Tracker author and timestamp remain tracker-owned. Aggregate range `B` or `V`, current verification results, push readiness, full logs, output hashes, and worktree paths are absent.

Read the appended record back once and require its tracker location, field names, values, ordering, and complete body to match the confirmed draft. A write or exact read-back failure is unresolved persistence: report any observable record and stop without claiming reconciliation.

Return the exact reused or appended record identity to the active verification workflow. The helper never resumes the stopped gate or starts the fresh verification itself.

Never edit or delete tracker history, reopen either Issue, change Issue state or labels, invoke `attest-target-contribution`, alter `implementation_complete`, mutate Git candidates or product files, run aggregate review or exact-target verification, claim readiness, push, remote-merge, or deploy.
