---
status: superseded by ADR-0022
---

# Change Specs live in Issue comments

Per-feature Change Specs are stored as append-only, hash-addressed comments on the Parent or Standalone Issue rather than retained as repository files. This makes the Issue tracker the durable historical change-contract surface and keeps the repository focused on current code, tests, Wiki, domain language, ADRs, and operational documentation.

The trade-off is a hard dependency on the configured tracker adapter for stable comment identifiers and API read-back. GitHub and GitLab may provide that contract; local Markdown and unimplemented adapters cannot claim the full workflow guarantees. An incomplete, non-authoritative Working Spec may live under repository-local Git metadata for crash recovery, but it is deleted immediately after the final Issue comment is published, read back, and hash-verified.
