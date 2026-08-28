---
name: pre-execute-issue
description: Record a human's statement that one exact prerequisite artifact was executed for a published Issue.
disable-model-invocation: true
---

# Pre-Execute Issue

Record one completed Manual prerequisite for one fully published Tracker Spec or dependency-ready child Issue. The human's statement is the authority; this skill does not prove the external target outcome.

## Identify the artifact

Read the exact Issue, comments, and current human request. Require only:

- the exact Issue ID; and
- one exact repository-relative artifact path that the human explicitly says was already executed or applied.

Use an unambiguous path already present in the current request or Issue. If no exact path is available, ask one focused question for it. Do not infer execution from file existence, tests, commits, Issue text, or previous agent claims.

Do not require a repository resolver, setup step, target environment, database identity, credentials, artifact hash, worktree, artifact-only commit, preflight or postflight output, DB access, external verification, `WAITING_MANUAL`, `READY`, or a second invocation. Never execute or replay the artifact.

## Record the attestation

Search the Issue comments for an exact existing attestation with the same Issue and normalized artifact path. Reuse a match without writing a duplicate.

Otherwise append this minimal tracker note and read it back once:

```text
manual_prerequisite_complete:v1
issue: <Issue-ID>
artifact: <repository-relative-path>
attested_by: human
statement: executed
```

The tracker supplies author and timestamp. Do not add credentials, target details, artifact contents, query results, or invented verification claims.

Tracker write or read-back failure is unresolved persistence: report it and never claim the attestation was recorded. On success, report the exact Issue and artifact, then tell the human to invoke `/execute-issue <Issue-ID>`.

Never create or modify a worktree, prepare or edit the artifact, implement the Issue, run tests, integrate, close the Issue, push, deploy, or mutate an external environment.
