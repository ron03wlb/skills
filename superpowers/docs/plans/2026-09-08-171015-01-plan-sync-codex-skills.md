# Synchronize the local skills repository and Codex installation

**Goal:** Align installed skills with one local revision containing both the current checkout and the already-installed workflow fixes.
**Why planning is required:** Integrating GitLab planning/publication behavior and replacing the active immutable workflow package changes agent execution instructions and local installation state.
**Acceptance:** Preserve commits `c425ad87426e314640307e4c3cc0ab08ef1507a7` and `5c73033788a5912ff89f9b68590539036e1d455e` as ancestors of the integrated revision; verify relevant contracts and independent Standards/Spec reviews; retain all existing workflow packages and backup replaced links; bring all 65 non-deprecated skills in both Codex skill roots to matching content. Do not push, mutate tracker objects, invoke a Run, delete existing worktrees, or overwrite concurrent changes. Stop installation if the source, public links, catalog, pending intent, or installer lock differs from the inspected state. Existing Runs retain their recorded package version. Recover through the installer-owned pending intent if switching is interrupted.

### Outcome 1: Preserve both workflow revisions
- Work: In `C:/tmp/skills-sync-codex-20260908-01a08043`, merge the already-installed source into the current checkout revision. Limit manual resolutions to preserving both sides of overlapping text. Review the complete integration against its source plans and the user-authorized synchronization scope.
- Verify: Relevant `node --test` suites for workflow installation, installed entry, GitLab adapters/recovery, Planning Seal, and skill contracts; `git diff --check`; independent Standards and Spec review; ancestry checks for both source revisions.

### Outcome 2: Repair exact shared skill links
- Work: Create missing `.agents/skills` junctions for `rss-feeds`, `daily-journal`, six `greenfield-*` skills, `start-project`, and `clarify-needs`; preserve the broken `wizard` link in a task-specific backup directory and replace it with the repository's engineering skill.
- Verify: Exact link targets, existence, and full file SHA-256 comparison against the local repository; no mutation of unrelated installed skills.

### Outcome 3: Deliver one verified installed version
- Work: Fast-forward the unchanged `features/ron` checkout to the reviewed merge revision. Use `scripts/install-workflow.mjs` from that exact commit for both `.codex/skills/run-issue-workflow` and `.agents/skills/run-issue-workflow`, sharing the existing workflow cache. Retain old packages and installer-created backups.
- Verify: Both public links select the same new package; `selectWorkflowVersion` reports AVAILABLE for the new and retained prior versions; manifest identity and all file hashes pass; compare all installed skill files with the integrated source, allowing only Git archive line-ending normalization. Confirm no pending installation or installer lock remains and the original checkout contains no unrelated changes.
