---
name: to-spec-ron
description: Publish a verified Change Spec to one durable GitHub Issue.
disable-model-invocation: true
---

# To Spec Ron

Synthesize the already-resolved conversation into one durable Change Spec. Do not restart the interview. If a material decision or behavioral test seam is still unresolved, preserve the draft and tell the user to return to `/grill-with-docs`.

The Change Issue is created or reused only when synthesis is complete. Before that point, no Issue is created.

## Preconditions

Read `docs/agents/ron-workflow.md`, the configured tracker and domain files, relevant Wiki pages, `CONTEXT.md`, ADRs, and repository evidence. Full completion requires a passing GitHub capability probe. Degraded trackers may retain a draft but cannot claim `specified`.

Use the approved Wiki vocabulary. A Change Spec may explicitly override the Wiki; code may not do so silently. Record `wiki_impact: none` only for a genuinely technical change and make the reason explicit for later approval.

## Working Spec

Resolve the draft path with:

```text
git rev-parse --git-path ron-workflow/drafts/<draft-id>.md
```

Create parent directories as needed and set the draft to mode `0600`. The draft is non-authoritative, lives under Git metadata rather than the worktree, and exists only for cross-session recovery.

Keep it concise and update it in place while synthesis is incomplete. It may contain unresolved questions, but it must never be described as approved, published, or executable.

## Final contract

The final Change Spec contains:

- Problem and user-visible Solution;
- behavior-distinct numbered User Stories;
- Implementation Decisions without brittle code snippets or speculative paths;
- confirmed behavioral verification seams;
- Testing Decisions;
- Wiki context and explicit overrides;
- proof-claim boundaries;
- Out of Scope and Further Notes.

Prefer the highest existing public test seam and the smallest useful seam set. Reuse a seam already confirmed during grilling; do not ask again. If the seam has never been confirmed, show only that bounded decision and wait.

## Publish atomically

Create or reuse exactly one Change Issue. It is initially a Change Issue; `/to-tickets-ron` may later classify it as Parent, otherwise it remains Standalone.

Publish one append-only comment in this exact envelope:

```text
workflow-change-spec:v1
<!-- workflow-payload:begin -->
spec_id: <stable-id>
status: specified
issue: <owner/repo#number>
created_at: <timestamp>
wiki_impact: semantic | none
wiki_context:
  - <topic-and-source-reference>
explicit_overrides:
  - <confirmed-rule-change-or-none>
acceptance:
  - <observable-outcome>
verification_seams:
  - <public-boundary>
out_of_scope:
  - <excluded-behavior>
supersedes: <spec-id-or-null>

## Problem
...

## Solution
...

## User Stories
...

## Implementation Decisions
...

## Testing Decisions
...

## Proof Boundaries
...

## Further Notes
...
<!-- workflow-payload:end -->
payload_sha256: <sha256>
```

Hash only the exact UTF-8 bytes between the two payload delimiters, excluding the delimiters, with LF line endings and exactly one terminal newline. The hash field and tracker metadata are excluded.

After posting:

1. fetch the comment by stable comment ID;
2. verify the marker, delimiters, exact payload bytes, and SHA-256;
3. verify that the Issue identity matches;
4. record the Issue URL, comment ID, `spec_id`, and hash in the response;
5. delete the Working Spec only after every check passes.

A correction is a new append-only comment with a new `spec_id` and `supersedes`; never edit or delete historical Change Specs. On publish, read-back, identity, or hash failure, preserve the Working Spec and report `not-specified`.

Do not apply an authorization label or imply execution readiness. The output is `specified`, not `authorized`, `ready`, or `implemented`.
