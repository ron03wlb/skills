# Make closeout repairs durable and prove the effective workflow package

**Goal:** Reconcile the three known Issue 171 closeout repairs into the current canonical workflow and prove that the host-selected managed package contains and executes the reviewed candidate.
**Why planning is required:** The change spans close authority, Windows process cleanup, immutable package selection, and managed Codex workflow entries.
**Acceptance:** Preserve `features/ron` and unrelated work; keep the Issue lane at operation `workflow-op-v1-411a0477fd18a0df5310e5f2a0547a4db4f484acd60b842e667d26fcf9e56b26`; reproduce the three defects before repair; retain current control, transport, deadline, candidate, completion, worktree, and package authority checks; pass focused, configured, full-suite, Standards, and Spec gates; install only the exact reviewed commit through the existing installer after preflight proves both managed entries and retained packages are attributable; stop without changing managed entries if links, package bytes, installer state, authority, or candidate identity are unknown; retain old packages and installer recovery evidence; verify both managed entries, manifest hashes, retained versions, and the original failed-stage behaviors after installation. Do not integrate, remove the Issue worktree, close the Issue, push, deploy, rewrite historical records, or terminate unproved processes.

### Outcome 1: Settled cleanup routing and stable close identity
- Work: Extend the current close coordinator and existing close/recovery seams so an attributable settled `HOST_CLEANUP_BLOCKED` result reaches the cleanup owner, while `controlRevision` remains a current action gate but is excluded from stable logical request identity.
- Risks/open questions: A matching symptom must not bypass current Pause/Stop authority, original request attribution, candidate/completion/worktree validation, or accepted-request identity.
- Verify: `node --test tests/ron-workflow/close-continuation.test.mjs tests/ron-workflow/run-issue-workflow-coordinator.test.mjs tests/ron-workflow/codex-host-cleanup-owner.test.mjs`

### Outcome 2: Exact resumable Windows helper cleanup
- Work: Persist completed helper-release outcomes and resume only the original proven remainder, rereading ownership before each release and removing the fixed total inspector lifetime without removing bounded per-operation inspection.
- Risks/open questions: PID reuse, changed ownership, unavailable inspection, respawn, or durable progress-write failure must preserve evidence and stop without terminating an unrelated process or duplicating an accepted release.
- Verify: `node --test tests/ron-workflow/pending-host-cleanup.test.mjs tests/ron-workflow/windows-helper-recovery.test.mjs`

### Outcome 3: Candidate-to-effective-entry evidence
- Work: Extend the existing package installer, selector, installed entry, and owner evidence so the original failure signature, reviewed candidate, immutable manifest, both managed entries, retained package compatibility, and replayed failed-stage result are attributable without editing old package bytes or historical authority.
- Risks/open questions: Source-only PASS, a matching package ID without content verification, foreign links, incompatible retained Runs, or unqualified host bytes must remain visible and cannot count as installed success.
- Verify: `node --test tests/ron-workflow/workflow-installation.test.mjs tests/ron-workflow/installed-entry.test.mjs`

### Outcome 4: Reviewed delivery slice and controlled installation
- Work: Update affected English owner instructions/evidence, commit the candidate, run the repository full suite, obtain independent Standards and Spec review, repair every confirmed in-scope finding within the cumulative ten-wave budget, then package and select the exact reviewed commit through the existing installation owner.
- Risks/open questions: Any candidate mutation invalidates affected checks and reviews; any managed-entry or installer-state drift stops before installation. Installation recovery uses the installer's recorded intent/backups and never deletes retained packages.
- Verify: `node --test tests/ron-workflow/*.test.mjs`, `git diff --check`, exact candidate/read-back comparisons, managed-entry target and manifest digest inspection, and installed replay of all three original failure boundaries.
