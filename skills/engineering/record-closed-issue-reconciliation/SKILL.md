---
name: record-closed-issue-reconciliation
description: Use when /verify-target-before-push hands off one exact human-confirmed failed-command or command-representation reconciliation packet.
---

# Record Closed Issue Reconciliation

Append or reuse one immutable reconciliation record for the exact historical failed-command diagnostic or command representation case proved by an active `/verify-target-before-push` recovery. This helper records authority only; it never decides target verification or push readiness.

## Require the confirmed recovery packet

Require one exact human-confirmed packet produced by the active `/verify-target-before-push` recovery. It is either the failed-command diagnostic packet containing the affected Issue and immutable completion-note identity, Issue target branch, execution baseline, affected candidate, identical diagnostic fingerprint, remedy Issue and immutable completion-note identity, remedy candidate, and complete tracker comment draft; or the command representation packet containing those affected identities, one exact placeholder, the unique repository-required full-suite command, one later descendant Issue and immutable passing completion, descendant candidate and ancestry proof, freshly frozen target result, and complete tracker comment draft.

Reject a standalone or manual invocation without that active recovery packet and exact confirmation. Read repository instructions and tracker configuration before interpreting any identity.

## Revalidate failed-command diagnostics

For a failed-command diagnostic packet, re-read the affected Issue's complete ordered history. Require the affected Issue to be closed, its sole immutable completion note to be otherwise valid with exactly one non-passing command, its candidate reachable from the Issue target but not reachable from its execution baseline, and its exact Issue worktree absent. Any later valid completion, other invalidating evidence, ordinary open Issue, registered worktree, coverage failure, review failure, or additional historical failure stops without writing.

Create clean temporary worktrees at the exact affected baseline and candidate and rerun the one failed command read-only. Build each diagnostic fingerprint from the exact command, exit code, failure count, ordered failure identities, source locators, and assertion or error identities. Require identical baseline and candidate fingerprints and no additional candidate failure. Remove only those clean temporary diagnostic worktrees after the comparison.

Re-read candidate remedy Issues and require exactly one closed remedy Issue whose published scope and delivered diff explicitly own the complete correction. Require its valid passing completion evidence and candidate reachable from the same Issue target as the affected candidate. A coincidental target pass, partial remedy, multiple possible remedies, human cause attestation, or Direct target contribution is not remedy proof.

Immediately before mutation, re-read the affected and remedy Issues, both completion notes, target and refs, and rerun or revalidate the exact diagnostics. Any affected, remedy, completion, target, ref, diagnostic, eligibility, authority, or draft drift stops without writing.

## Revalidate command representation eligibility

For a command representation packet, re-read the affected Issue's complete ordered history. Require its sole immutable completion entry to be otherwise valid and non-executable solely because it contains one unambiguous placeholder. Resolve the unique repository-required full-suite command as exactly one literal repository-root command; prose, summaries, multiple placeholders, multiple possible commands, inferred expansions, any other invalidating evidence, or an unavailable repository command stops without writing.

Re-read the later descendant Issue and require the affected candidate reachable from the freshly frozen target but not the frozen baseline, the descendant candidate reachable from that target and descending from the affected candidate on the same Issue target, and its valid immutable passing completion to record the exact mapped command. Require the active verifier's freshly frozen target result to bind that same command and pass; the helper revalidates this result evidence without rerunning the command. A coincidental current pass, non-descendant or partial evidence, a different command, a failed or missing result, or ambiguity never qualifies.

Immediately before mutation, re-read the affected and descendant Issues and completions, resolve the frozen baseline, both candidates, and the target, re-prove reachability, ancestry, and the unique command mapping, revalidate the exact descendant completion result and the active verifier-owned freshly frozen target result, and require the confirmed draft unchanged. Any affected, descendant, completion, candidate, target, ancestry, command, result, eligibility, authority, or draft drift stops without writing.

## Reuse or append the exact record

For a failed-command diagnostic packet, read the affected closed Issue's ordered history. Reuse one exact matching `closed_issue_evidence_reconciliation:v1` record without invoking the writer or creating a duplicate. A malformed, duplicate, edited, conflicting, drifting, unavailable, partial, or ambiguous plausible record stops without repair or inference.

When no exact failed-command record exists, append exactly this record on the affected closed Issue:

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

The failed-command record contains only `affected`, `diagnostic`, `remedy`, `authorized_by`, and `statement`. Tracker author and timestamp remain tracker-owned. Aggregate range `B` or `V`, current verification results, push readiness, full logs, output hashes, and worktree paths are absent.

For a command representation packet, read the affected closed Issue's ordered history and reuse one exact matching command representation record without writing a duplicate. Otherwise append exactly this record on the affected closed Issue:

```text
closed_issue_command_representation_reconciliation:v1
affected:
  issue: <affected Issue ID>
  completion: <immutable completion-note identity>
  target: <Issue target branch>
  baseline: <full execution baseline SHA>
  candidate: <full affected candidate SHA>
placeholder: <exact historical placeholder>
mapped_command: <exact repository-required full-suite command>
descendant:
  issue: <descendant Issue ID>
  completion: <immutable descendant completion-note identity>
  candidate: <full descendant candidate SHA>
authorized_by: human
statement: authorized for selected-range membership eligibility only; original completion remains invalid
```

The command representation record contains only `affected`, `placeholder`, `mapped_command`, `descendant`, `authorized_by`, and `statement`. Tracker author and timestamp remain tracker-owned. Aggregate range `B` or `V`, current target results, push readiness, full logs, output hashes, worktree paths, and any `implementation_complete` claim are absent.

A malformed, duplicate, edited, partial, stale, drifting, conflicting, unreadable, or ambiguous plausible record of either kind stops without repair, inference, or a partial match.

Read the reused or appended record back once and require its tracker location, kind, field names, values, ordering, and complete body to match the confirmed draft. A write or exact read-back failure is unresolved persistence: report any observable record and stop without claiming reconciliation.

Return the exact reused or appended record identity to the active verification workflow. The helper never resumes the stopped gate or starts the fresh verification itself.

Never edit or delete tracker history, retroactively complete or reopen either Issue, change Issue state or labels, invoke `attest-target-contribution`, alter `implementation_complete`, mutate Git candidates or product files, rerun the mapped command, run aggregate review or exact-target verification, claim readiness, push, remote-merge, or deploy.
