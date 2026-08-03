---
status: accepted
---

# Repository docs-as-code is the canonical Wiki

Ron's reviewed current business-knowledge baseline lives as versioned Markdown in the main repository and is reconciled with code and tests into the same Target Integration Candidate. Native GitHub or GitLab Wiki repositories, Pages, `llms.txt`, Deep Wiki, and TechDocs are derived publication or discovery layers; none becomes a second writable authority.

This trades easy direct Wiki editing for one reviewable `integration_candidate_sha`, normal repository review and checks, and ordinary Git rollback. Leaf Issues read and review the Wiki without changing it; only Parent or Standalone closeout may reconcile exact granted semantic and support write sets. Publishing or mirroring remains separately authorized and proved, and a derived layer must identify its canonical source SHA rather than back-sync edits.

The supporting comparison and operational boundaries are recorded in [`repository-wiki-maintenance-mainstream-practices.md`](../../research/repository-wiki-maintenance-mainstream-practices.md).
