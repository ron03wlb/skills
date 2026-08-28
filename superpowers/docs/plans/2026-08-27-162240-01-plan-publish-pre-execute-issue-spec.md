# Publish the prerequisite Issue workflow Spec

**Goal:** Publish one authoritative Multi-Issue Tracker Spec for the optional prerequisite preparation lifecycle and its one-time repository adoption skill.
**Why planning is required:** Publication creates a Planning Seal commit and a GitHub Issue whose classification and handoff govern later implementation across promoted workflow contracts.
**Acceptance:** Commit only the approved glossary and ADR changes; preserve every unrelated modified and untracked path; publish one primary Multi-Issue Spec to `ron03wlb/skills`; apply `ready-for-agent`; and read back the exact mode, full seal SHA, classification, cross-Issue constraints, decomposition rationale, and `/to-tickets <Spec-ID>` command. If publication or read-back fails after the seal, retain the seal and report the exact partial state without amending, resetting, duplicating the Spec, or changing unrelated work.

### Outcome 1: Seal the approved prerequisite design

- Work: Create one local Planning Seal on `features/ron` containing only the owned `CONTEXT.md` additions and ADRs 0024 through 0035. Exclude the pre-existing ADR-0022 edit, session planning files, and all unrelated untracked paths.
- Risks/open questions: Stop before commit if owned hunks overlap unrelated work, the target identity changes, or the exact staged diff contains any unexpected path.
- Verify: `git diff --cached --check` and `git diff --cached --name-status`

### Outcome 2: Publish and prove the parent Spec

- Work: Create one primary GitHub Multi-Issue Spec whose aggregate outcome covers the runtime prerequisite lifecycle and the separate one-time setup skill. Keep child Acceptance Criteria and implementation plans out of the parent, apply `ready-for-agent`, and use the real Issue number in the next command.
- Risks/open questions: If create, label, update, or read-back fails, preserve the verified Planning Seal and report whether the Issue exists, whether its final body was written, and whether its label and command were proved; never create a duplicate on retry.
- Verify: `gh issue view <Spec-ID> --repo ron03wlb/skills --comments --json number,title,body,state,labels,comments,url`
