---
status: accepted
---

# Bootstrap the Wiki in reviewed topic batches

`setup-ron` records `baseline_state: missing` and does not generate or accept Canonical Wiki content. A separately authorized Wiki bootstrap Standalone Issue defines the required initial business-topic and flow inventory.

Missing-state `/wiki` persists one non-authoritative `workflow-wiki-bootstrap-preview:v1` under:

```text
git rev-parse --git-path ron-workflow/wiki-previews/<preview-id>.md
```

The file uses mode `0600`, UTF-8, LF line endings, one terminal newline, and the workflow payload-delimiter SHA-256 rule. It binds the internal target identity, proposed root, root-adoption assessment, boundedness and reason, topic inventory, exact page paths, page purposes and scopes, source seeds, batch order, validation commands, exclusions, and protocol pin.

This is worktree- and external-state zero-write, not literally filesystem zero-write. The preview is recoverable across sessions, never authoritative, and is deleted only after the matching Change Spec is published and read back successfully. Target, root, inventory, path, source, validator, exclusion, or protocol drift invalidates it.

Bootstrap content is generated and reviewed in bounded topic-sized batches inside that Standalone Issue and its task-specific staging mirror. A batch is a resumable generation and review checkpoint, not a Leaf Issue or partial target baseline.

The target branch keeps its durable baseline state at `missing` throughout bootstrap. `/wiki status` reports `bootstrapping` only when it can read and hash-verify the current active Wiki bootstrap Issue against the target and Bootstrap Preview. The final Target Integration Candidate atomically adds the complete reviewed baseline and changes the target configuration from `missing` to `ready`. Tracker unavailability or ambiguous Issue lineage reports `not-verifiable`, never an inferred `bootstrapping` state.

The Bootstrap Standalone's Change Spec, execution contract, and Grant bind `wiki_operation: bootstrap`, `wiki_baseline_requirement: missing-with-bootstrap-preview`, and the exact Preview ID/hash. This is the only semantic execution permitted while baseline state is `missing`; normal semantic work still requires `ready`, while explicitly technical `wiki_impact: none` work uses `not-applicable`. Bootstrap never makes a Leaf writable to Wiki.

If the proposed baseline cannot fit one coherent Standalone review boundary, `/wiki` returns `not-bounded` and requires the Canonical Wiki scope to be narrowed or redesigned before an Issue is created. Ron v1 does not add analysis-only Leaves or let executable Leaves write partial Canonical Wiki content.

A Wiki engine may propose batch candidates but cannot bulk-accept the baseline or bypass the normal Issue, Grant, review, and closeout controls.
