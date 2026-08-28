# Publish the closeout preservation module Spec

**Goal:** Publish one execution-ready Single-Issue Spec for deepening `close-issue` with an internal atomic preservation-inspection module.
**Why planning is required:** The publication creates a scoped local Planning Seal commit and a GitHub Issue with an executable label.
**Acceptance:** Commit only the approved `CONTEXT.md` delta; preserve the pre-existing ADR modification and every unrelated untracked path; publish one primary Single-Issue Spec to `ron03wlb/skills`; apply `ready-for-agent`; and read back the exact full Planning Seal SHA/state, classification, mapped Acceptance Criteria, and `/execute-issue <Spec-ID>` command. If publication or read-back fails after the seal, retain the seal and report the exact partial state without amending, resetting, duplicating the Spec, or changing unrelated work.

### Outcome 1: Validate the publication boundary
- Work: Confirm the configured tracker and labels, current target branch and `HEAD`, absence of a same-scope active Spec, exact owned `CONTEXT.md` delta, and a content-aware snapshot of all unrelated modified and untracked work.
- Risks/open questions: An existing closed workflow Spec must not be revised or reopened; ambiguous ownership or a changed target stops before commit.
- Verify: `gh issue list --repo ron03wlb/skills --state all` and `git status --short`

### Outcome 2: Draft and seal one mapped Single-Issue contract
- Work: Draft the Spec from the settled domain decisions, use stable `AC-n` identifiers, map every criterion to at least one implementation step and verification item, and create one Planning Seal containing only `CONTEXT.md`.
- Risks/open questions: Missing, unexpected, or orphan AC mappings stop publication; the unrelated ADR and local planning files remain outside the seal.
- Verify: `git show --stat --oneline HEAD` and `git diff HEAD^..HEAD -- CONTEXT.md`

### Outcome 3: Publish and prove the tracker state
- Work: Create one GitHub Issue in primary mode, replace placeholders with the real Spec ID and exact next command, apply `ready-for-agent`, then read body and labels back once.
- Risks/open questions: Any create, update, label, or read-back failure retains the verified seal and stops without creating a replacement Issue.
- Verify: `gh issue view <Spec-ID> --repo ron03wlb/skills --comments --json number,title,body,state,labels,url`
