---
status: accepted
---

# Keep Nimbalyst optional and non-authoritative

Nimbalyst is not part of the required Ron v1 Wiki flow. It does not replace the repository-local Canonical Wiki, `/wiki`, the Ron Issue and Grant control plane, a Wiki engine, validation-only CI, or a separately authorized publication capability.

A future compatibility Issue may evaluate Nimbalyst for either of two optional roles:

- a task-worktree Markdown authoring and visual-diff interface;
- a read-only, rebuildable retrieval index over the Canonical Wiki.

Either role has no authority of its own. Adoption requires an exact version pin and proof that Markdown round-trips without incidental changes, only granted paths can be written, machine-local index state stays outside the repository, write-capable memory tools are unavailable, and Nimbalyst review state is never treated as Ron review evidence.

The supporting evidence is recorded in [`research/nimbalyst-wiki-fit-assessment.md`](../../research/nimbalyst-wiki-fit-assessment.md).
