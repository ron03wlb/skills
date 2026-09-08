# Planning Seal writer repair

## Authority and scope

The human authorized repairing the installed GitLab producer's missing accepted-document writer on 2026-09-08, committing and installing the verified package, configuring the SPAY2 binding, and resuming the existing Issue 142 publication. No push, application implementation, SQL execution, or unrelated cleanup is included.

## Assumptions and acceptance

- Preserve both source HEAD 49951f9 and installed source e446e8a, including explicit GitLab HTTP recovery.
- A nonempty accepted patch requires a registered, isolated, exact-content planning lane. Never substitute tracker-only evidence.
- Reuse the Run store's target mutation writer lease (ADR 0051). Commit only declared documents; preserve unrelated target index and working files.
- Bind durable intent to the repository, Spec, target, lane, accepted content, baseline, and publication. Interrupted retries read the same candidate and do not create duplicate seals.
- Verify the committed diff, target ancestry, content, and original lane before returning owner read-back.

## Plan

1. Reconcile the source and installed fix in this isolated worktree; run the existing GitLab producer tests as the baseline.
2. Implement a reusable Git planning writer, expose lane validation and seal-write through the installed GitLab entry, and document the exact registration/request contract.
3. Cover real Git writes, unrelated dirt, stale source/content, shared writer contention, crash/retry and tracker-only compatibility. Run the workflow regression suite and review the scoped diff.
4. Commit the verified source; install an immutable exact-commit workflow package. Configure and read back SPAY2, then resume Issue 142 with its preserved accepted documents and tracker identity.

## Verification record

The source and installed histories were merged without conflict at 5586b58581e3e210448241b93296d164fbcbcd3f. Both original worktrees and their branches remain unchanged.

- Baseline GitLab producer/recovery: 22 passed.
- Full workflow regression snapshot: 348 passed, zero failures. Log: C:/Users/ron.chang/AppData/Local/Temp/planning-seal-suite-01a07eeb.log.
- Final focused verification after review repairs: writer 7 passed; GitLab adapters 18 passed; native autostash/ignored-file protection 2 passed. These checks cover the later edits without repeating unrelated suites.
- The Windows native path fix handles short/long directory aliases. Batch Git reads preserve Unicode paths and newline filters. Completed receipts remain readable after the handoff owner removes its lane and temporary handoff file.
- Shared delivery/planning lock contention, stale content/source, staged work, unapplied candidate retry, unrelated dirt, foreign ownership and current sealed-document drift are covered with real temporary Git repositories. Existing HTTP rejected/unknown outcome recovery remains intact.
- Syntax checks and git diff --check passed. The router remains within its 700-word budget. No plugin manifest or invocation metadata changed.
- SPAY2 binding was configured and read back as project 31, spay/spay2, READ_WRITE_READBACK. Its 109 handed-off documents still match every recorded SHA-256; their paths have no target changes between the lane baseline and current target.

The writer freezes document provenance independently from the later canonical publication body, avoiding a circular body/seal hash. After sealing, the publication transaction binds the exact body and seal operation together. Registration and pending writes require the live lane; completed seal read-back uses immutable registered bytes/blobs and current Git evidence, so permitted lane cleanup cannot invalidate published evidence.

Package installation and Issue 142 continuation use the committed result of this worktree. They do not authorize a new Run host, Issue execution, SQL, push or unrelated cleanup.

## Publication read-back continuation

The authorized Issue 142 PUT was acknowledged and the native body matches all 9,334 content characters, but GitLab removed the requested final LF. The original operation remains at `publication.read_back`. Recover it without another PUT or replacement transaction.

1. Accept only exact body equality or omission of one final LF during publication read-back. Preserve the original approved body, hashes, operation identity and mutation payload; keep the native version derived from the actual bytes. All other body, title, label and state drift must still stop.
2. Verify ordinary normalized publication, recovery of an already acknowledged original intent, idempotent restart, and rejection of other whitespace/content changes with the focused adapter and transport/recovery suites.
3. Commit and install the verified package through both existing harness links. Resume the unchanged request, read back the publication and handoff receipts, and retain INCOMPLETE Run preparation. Preserve the SPAY2 target, planning lane, original request and journal, dirty files and stash.

Verification: `node --test tests/ron-workflow/gitlab-producer-adapters.test.mjs tests/ron-workflow/gitlab-producer-recovery.test.mjs` passed all 26 tests with zero failures or skips. This includes the original acknowledged-intent recovery and six non-equivalent body/title/state cases. Syntax checks, strict UTF-8 without BOM and `git diff --check` passed; scoped review confirmed that only the two publication body comparisons change behavior.
