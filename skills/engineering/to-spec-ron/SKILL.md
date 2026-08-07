---
name: to-spec-ron
description: Publish a verified Change Spec to one durable GitHub Issue.
disable-model-invocation: true
---

# To Spec Ron

Synthesize the already-resolved conversation into one durable Change Spec. Do not restart the interview. Preserve an incomplete draft and return to `/grill-with-docs` when a material behavior, Wiki conflict, or verification seam is unresolved.

## Shared publisher

Resolve this `SKILL.md` to its real path, ascend to the plugin root, and use `scripts/ron-workflow/ron-wiki.mjs`. Every normal, Bootstrap, and Wiki-repair Change Spec uses `change-spec-create` plus the same configured tracker create/post/stable-ID read-back sequence. Do not render or hash another Change Spec format.

This user-invoked skill is not called by `/wiki`; both independently call the same mechanical publisher.

## Preconditions

Read and validate Ron config, tracker capability, current Change Spec chain, `CONTEXT.md`, ADRs, repository evidence, and relevant Canonical Wiki topics/Sources only when the baseline is `ready`. Full completion requires exact GitHub comment read-back.

For every relevant Wiki topic or material claim when the baseline is `ready`, resolve one disposition:

- `inherit`
- `add`
- `change`
- `remove`

Record explicit overrides and their reason. A behavioral conflict between the request, current Wiki, and repository evidence blocks publication. Code cannot silently override the Wiki.

Normal semantic work requires:

```yaml
wiki_impact: semantic
wiki_operation: reconcile
wiki_baseline_requirement: ready
wiki_preview_id: null
wiki_preview_payload_sha256: null
```

When the configured baseline is `missing`, semantic work uses Wiki-optional delivery and carries no Wiki claims:

```yaml
wiki_impact: semantic
wiki_operation: none
wiki_baseline_requirement: not-applicable
wiki_preview_id: null
wiki_preview_payload_sha256: null
wiki_context: []
wiki_dispositions: []
```

Do not stop to bootstrap Wiki, invent Wiki context, or claim Wiki validation.

Genuinely technical work may use `none + not-applicable` only with an explicit reason and no hidden behavioral effect. Bootstrap and bounded Wiki repair are published only from matching `/wiki` Previews through the shared publisher.

## Recoverable Working Spec

Resolve:

```text
git rev-parse --git-path ron-workflow/drafts/<draft-id>.md
```

Keep one mode-`0600`, non-authoritative draft while synthesis is incomplete. It may hold unresolved questions but is never approved, published, or executable.

## Final contract

Provide the shared builder:

- stable Spec ID, Issue, timestamp, supersession;
- Wiki impact, operation, baseline requirement, optional Preview binding;
- per-topic/claim dispositions, context, and explicit overrides;
- observable acceptance and confirmed public verification seams;
- Problem, Solution, behavior-distinct User Stories;
- Implementation and Testing Decisions;
- Proof Boundaries, Out of Scope, and Further Notes.

Keep implementation decisions durable but avoid speculative paths and brittle snippets. Prefer the highest existing public seam and do not ask again about a seam confirmed during grilling.

## Publish atomically

Create or reuse exactly one Change Issue. It remains Standalone unless `/to-tickets-ron` later makes it a Parent.

1. Run `change-spec-create`.
2. Post its exact `workflow-change-spec:v1` envelope.
3. Fetch the comment by stable ID.
4. Run `envelope-verify` on the exact read-back bytes.
5. Verify repository, Issue, Spec, and supersession identity.
6. Delete the Working Spec only after every check passes.

A correction is a new append-only Change Spec with a new ID and `supersedes`; never edit or delete history. Write/read-back failure, hash drift, ambiguous current chain, or tracker unavailability preserves the draft and returns `not-specified`.

Do not create Authorization Records, contracts, worktrees, code, Wiki patches, commits, or labels. The result is `specified`, never `authorized`, `ready`, or `implemented`.
