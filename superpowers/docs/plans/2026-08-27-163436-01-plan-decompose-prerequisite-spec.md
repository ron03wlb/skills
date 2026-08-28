# Decompose the prerequisite workflow Spec

**Goal:** Publish the two dependency-ordered executable child Issues approved by Multi-Issue Spec #2.
**Why planning is required:** Child creation, native parent and blocker relations, and ready-state labels are consequential GitHub tracker mutations whose partial state must remain recoverable.
**Acceptance:** Reuse Planning Seal `c6c87caf9337d5d28ea2a395751727093447cf08` only after proving local ancestry and no relevant glossary or ADR delta; preserve every unrelated modified and untracked path; create the runtime child before the dependent setup child; attach both to parent #2 and make the setup child blocked by the runtime child; apply `ready-for-agent` only to the dependency-ready runtime child; read every body, AC mapping, baseline, target, relation, and label back once. If any create, relation, label, or read-back step fails, retain the already-created identifiers, report the exact partial state, and stop without editing parent #2 or unrelated Issues.

### Outcome 1: Fix the executable child contracts and Planning Seal

- Work: Map the parent runtime lifecycle and repository-adoption outcomes to two source-grounded child contracts, with stable Acceptance Criteria, inline plan coverage, verification coverage, explicit blockers, target `features/ron`, and the reused inherited seal.
- Risks/open questions: New public behavior, acceptance, target, exclusion, or an owned uncommitted glossary/ADR delta stops publication and returns to `/to-spec`; an earlier partial publication is reused rather than duplicated.
- Verify: `git cat-file -e c6c87caf9337d5d28ea2a395751727093447cf08^{commit}` and `git merge-base --is-ancestor c6c87caf9337d5d28ea2a395751727093447cf08 HEAD`

### Outcome 2: Publish the runtime prerequisite lifecycle child

- Work: Create the blocker-first child covering `pre-execute-issue`, the read-only `execute-issue` gate, receipt and worktree semantics, promoted-skill parity, and contract tests; attach it to #2 and mark it `ready-for-agent`.
- Risks/open questions: Stop on any body, parent relation, or ready-label mismatch; do not create the dependant after an unverified blocker child.
- Verify: `gh issue view <runtime-id> --repo ron03wlb/skills --comments --json number,title,body,state,labels,comments,url` and `gh api repos/ron03wlb/skills/issues/2/sub_issues`

### Outcome 3: Publish the dependent repository-adoption child

- Work: Create the child for the explicitly invoked `setup-pre-execute-issue` adoption workflow, attach it to #2, add a native blocked-by relation to the runtime child, and leave it without `ready-for-agent`.
- Risks/open questions: Stop on relation or label drift and report both created identifiers; never promote a blocked child.
- Verify: `gh issue view <setup-id> --repo ron03wlb/skills --comments --json number,title,body,state,labels,comments,url`, `gh api repos/ron03wlb/skills/issues/<setup-id>/dependencies/blocked_by`, and `gh api repos/ron03wlb/skills/issues/2/sub_issues`

### Outcome 4: Prove the ready frontier

- Work: Map every child AC to at least one implementation step and verification item, compare live parent, dependency, and label state with the approved DAG, and output an execution command only for the unblocked runtime child.
- Verify: `gh issue list --repo ron03wlb/skills --state open --json number,title,body,labels,url` plus the per-Issue and relation read-backs above
