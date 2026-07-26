---
status: accepted
---

# Change Specs live in Issue comments

Per-feature Change Specs are stored as append-only, hash-addressed comments on the Parent or Standalone Issue rather than retained as repository files. This makes the Issue tracker the durable historical change-contract surface and keeps the repository focused on current code, tests, Wiki, domain language, ADRs, and operational documentation.

The trade-off is a hard dependency on GitHub in Ron v1 for stable comment identifiers and API read-back; local Markdown and unimplemented tracker adapters cannot claim the full workflow guarantees. An incomplete, non-authoritative Working Spec may live in repository-local Git metadata for crash recovery, but it is deleted immediately after the final Issue comment is published, read back, and hash-verified. Rebuildable execution packets remain in task-specific `/private/tmp` directories and are explicitly cleaned after bounded use.
