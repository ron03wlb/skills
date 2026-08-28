# Publish Spec #6 child Issues

**Goal:** Publish the three dependency-ordered executable child Issues approved by Multi-Issue Spec #6.
**Why planning is required:** Creating Issues, native parent and blocker relations, and ready-state labels are consequential GitHub tracker mutations whose partial state must remain recoverable.
**Acceptance:** Reuse Planning Seal `f7c8a85ef8f3ad9aa7c0ff6a7f500497e5601446` only after proving local ancestry, no prior `#6/<NN>` publication, and no relevant planning delta; preserve every unrelated modified and untracked path; create exactly `#6/01`, `#6/02`, and `#6/03` blockers-first under parent #6 with blocker edges `01 -> 02 -> 03`; apply `ready-for-agent` only to the dependency-ready first child; read every body, AC mapping, baseline, target, parent relation, blocker relation, and label back once. If any create, relation, label, or read-back step fails, retain and report the exact created identifiers and stop without editing parent #6 or unrelated Issues.

### Outcome 1: Fix the child contracts and inherited seal

- Work: Map the parent decomposition rationale to three source-grounded child contracts with immutable decomposition keys, stable Acceptance Criteria, inline plan coverage, verification coverage, explicit blockers, target `features/ron`, and the reused inherited seal.
- Risks/open questions: New behavior, acceptance, target, exclusion, or an owned glossary/ADR delta stops publication and returns to `/to-spec`; an earlier partial publication is reused rather than duplicated.
- Verify: `git cat-file -e f7c8a85ef8f3ad9aa7c0ff6a7f500497e5601446^{commit}` and `git merge-base --is-ancestor f7c8a85ef8f3ad9aa7c0ff6a7f500497e5601446 HEAD`

### Outcome 2: Publish stable decomposition reconciliation

- Work: Create `#6/01` for re-entrant `/to-tickets`, stable keys, tracker evidence reconciliation, blocker DAG handling, canonical rendering, partial-publication recovery, and the parent decomposition publication record; attach it to #6 and mark it `ready-for-agent`.
- Risks/open questions: Stop on any body, parent relation, or ready-label mismatch; do not create dependants after an unverified blocker child.
- Verify: `gh issue view <issue-01> --repo ron03wlb/skills --comments --json number,title,body,state,labels,comments,url,parent,blockedBy,blocking`

### Outcome 3: Publish minimal execution and closeout

- Work: Create `#6/02` for completion-note attempt authority, direct executable closeout, parent-only closeout, retry behavior, and retirement of preservation receipts and integration candidates; attach it to #6, block it on `#6/01`, and leave it without `ready-for-agent`.
- Risks/open questions: Stop on any parent or blocked-by mismatch and report the exact partial state; never promote a blocked child.
- Verify: `gh issue view <issue-02> --repo ron03wlb/skills --comments --json number,title,body,state,labels,comments,url,parent,blockedBy,blocking`

### Outcome 4: Publish aggregate exact-range verification

- Work: Create `#6/03` for local-ahead and explicit already-pushed ranges, completion-note membership, selected-range coverage, aggregate review and verification, and result separation; attach it to #6, block it on `#6/02`, and leave it without `ready-for-agent`.
- Risks/open questions: Stop on relation or label drift; do not infer membership from commit messages or closeout receipts.
- Verify: `gh issue view <issue-03> --repo ron03wlb/skills --comments --json number,title,body,state,labels,comments,url,parent,blockedBy,blocking`

### Outcome 5: Prove the ready frontier and preservation

- Work: Compare all child bodies and native relations with the approved DAG, confirm only the first child is dependency-ready, and verify every pre-existing unrelated dirty or untracked file remains byte-identical. The initial bootstrap intentionally leaves the parent publication record to the required `/to-tickets #6` rerun after `#6/01` is delivered.
- Verify: `gh issue view 6 --repo ron03wlb/skills --json number,state,subIssues,subIssuesSummary` plus the per-Issue read-backs, `git status --short`, and the pre-publication SHA-256 preservation manifest.
