# Deep Wiki × Matt：現況業務知識基線與 Issue 收尾流程

狀態：歷史設計；已由 [`matt-first-issue-delivery-workflow-spec.md`](./matt-first-issue-delivery-workflow-spec.md) 取代

本文件保留 Wiki authority、source citation、三軸 review 與 baseline reconciliation 的研究脈絡。其 `finish-issue` 名稱、每個 Child 各自 merge target／清理 worktree，以及只新增一個 skill 的生命週期不再是現行設計；Ron workflow 改為 Leaf 在同一 Execution Lane 依序 commit／close，Parent 對 Target Integration Candidate 完成最終 reconciliation、review 與本地整合。

## Problem Statement

目前 Matt workflow 可以把需求整理成 spec、拆成 tickets、實作並進行 Standards 與 Spec review，但缺少一套穩定的「現況業務知識基線」：

- 新需求進入時，Matt 不一定先讀到既有業務流程、規則、狀態、權限與例外，容易產生需求衝突或語意不清。
- 實作完成後，只比對 spec 不足以確認是否破壞既有業務規則。
- Parent、Child 與 Standalone Issue 的完成邊界不同；若每個 Child 都更新 Wiki，基線會反映尚未完成的中間狀態。
- Code review 通過後，merge、目標分支驗證、Issue 關閉與 worktree 清理目前沒有一個一致的收尾入口。
- Wiki、spec 與 code/tests 的 authority 若沒有明確區分，AI 可能把現存程式碼誤當成正確業務規則，或用新實作反向覆寫未經核准的 Wiki。

需要在不導入第二套 spec workflow、也不增加過多 skills 的前提下，讓人類與 AI 都能使用同一份業務知識基線，並把完整 Issue 的 Wiki 同步、整合與清理變成可驗證的生命週期。

## Solution

以 Microsoft Deep Wiki 的 source-linked Markdown、Mermaid、VitePress 與 `llms.txt` 能力作為 Wiki 引擎，保留既有 Matt workflow，並只新增一個使用者可見的 `finish-issue` 收尾 skill。

整體流程為：

1. 需求進入時，Matt 在產生 spec 前先讀取相關 Wiki，找出沿用規則、限制、衝突與需要人類確認的 override。
2. Matt spec 保存本次需求引用的 Wiki context 與明確 override，但不複製整份 Wiki。
3. 每個 Child Issue 實作後，code review 同時檢查 Standards、Spec 與 Wiki 相容性；Child 不寫入 Wiki。
4. Code review 通過後，由人類明確呼叫 `finish-issue`：
   - Child：merge、目標分支驗證、留下完成證據、關閉 Issue、最後清理 worktree。
   - Parent 或 Standalone 完整 Issue：先完成業務知識基線 reconciliation，必要時更新 Wiki，再 merge、驗證、關閉 Issue與清理 worktree。
5. Wiki、spec、code/tests 維持不同角色：
   - Wiki 是已審核的現況業務知識基線。
   - Matt spec 是本次需求的 change contract。
   - Code/tests 是實作與驗證證據，不會因為已存在就自動成為業務 authority。

完整 Issue 每次都必須留下基線 reconciliation：

- 若業務規則有改變，更新受影響 Wiki 頁面與基線紀錄。
- 若沒有業務語意變化，不重寫無關頁面，但仍記錄本 Issue 已核對、沒有 semantic baseline change。

## User Stories

1. As a product owner, I want Matt to read the relevant business Wiki before writing a spec, so that a new requirement does not silently conflict with current rules.
2. As a product owner, I want unclear or conflicting Wiki rules surfaced before spec publication, so that I can resolve ambiguity before implementation begins.
3. As a product owner, I want an intentional business-rule change recorded as an explicit spec override, so that the implementation does not silently redefine the current baseline.
4. As a developer, I want the spec to reference only the relevant Wiki topics, so that the change contract remains concise and reviewable.
5. As a developer, I want Wiki terminology used consistently in specs and tickets, so that business concepts do not drift between planning and implementation.
6. As a reviewer, I want Standards, Spec and Wiki findings reported independently, so that engineering quality cannot mask incorrect business behaviour.
7. As a reviewer, I want each Wiki finding traced from a rule and source citation to affected code and tests, so that the finding can be verified.
8. As a reviewer, I want an explicit spec override to distinguish an intended rule change from a regression, so that valid changes are not rejected as Wiki conflicts.
9. As a reviewer, I want a missing or stale Wiki citation treated as a baseline repair problem, so that existing code is not automatically promoted to business truth.
10. As a Child Issue implementer, I want to read and review against the Wiki without updating it, so that partial implementation never becomes the current business baseline.
11. As a Child Issue implementer, I want a successful review followed by one consistent closeout command, so that merge, verification, Issue closure and cleanup are not forgotten.
12. As a Parent Issue owner, I want all Child Issues verified as completed and integrated before the Parent can finish, so that the Parent cannot close on tracker state alone.
13. As a Parent Issue owner, I want the final review to cover the aggregate change from the Parent fixed point, so that reviewing only the last Child cannot hide cross-ticket gaps.
14. As a Standalone Issue owner, I want the same complete-Issue baseline reconciliation as a Parent Issue, so that knowledge maintenance does not depend on whether tickets were split.
15. As a Wiki reader, I want every material business claim linked to current source evidence, so that humans and AI can verify the explanation.
16. As an AI agent, I want the Wiki discoverable through standard repository context such as `llms.txt`, so that requirements work can find it without loading every page.
17. As a maintainer, I want only affected Wiki pages regenerated for ordinary changes, so that Issue completion does not create unrelated documentation churn.
18. As a maintainer, I want structural business-model changes to permit a full Wiki regeneration, so that navigation and cross-references remain coherent.
19. As a maintainer, I want changed source paths and existing Wiki citations used only to nominate candidate pages, so that automated matching does not pretend to be authoritative dependency analysis.
20. As a maintainer, I want a no-semantic-change reconciliation recorded without rewriting Wiki pages, so that every complete Issue is auditable without noisy diffs.
21. As a release owner, I want merge preflight separated from code review, so that target-branch conflicts or overlapping untracked files block integration safely.
22. As a release owner, I want the merged result verified on the target branch before closing the Issue, so that review success is not confused with delivered success.
23. As an Issue owner, I want completion evidence written before the Issue is closed, so that tracker state has a durable explanation.
24. As an Issue owner, I want automatic tracker closure read back and verified, so that the workflow does not report a close that did not happen.
25. As a developer, I want the worktree removed only after merge, target verification and Issue closure, so that recoverable work is not deleted prematurely.
26. As a developer, I want a dirty worktree or unique unmerged commit to block cleanup, so that unrelated or undelivered work is preserved.
27. As a maintainer, I want `finish-issue` to be safe to retry after partial failure, so that a failed tracker update or cleanup does not repeat completed merge operations.
28. As a maintainer, I want push, PR merge and force operations to remain separately authorized, so that invoking local Issue closeout does not broaden publication authority.
29. As a Matt user, I want one new user-facing finishing skill rather than several overlapping workflow skills, so that the system remains easy to remember.
30. As a Matt user, I want Deep Wiki used only as the Wiki engine rather than a second spec authority, so that Matt remains the sole requirements workflow.

## Implementation Decisions

### Authority model

- Wiki is the reviewed representation of how the business currently operates.
- Matt spec is the approved description of what the current Issue intends to change.
- Code and tests provide implementation evidence.
- A spec may supersede a Wiki rule only when the override is explicit and human-confirmed.
- A code change may not update the Wiki merely because the implementation already exists.

### Wiki preflight

- Spec synthesis must first locate the relevant Wiki topics and their source citations.
- Preflight must identify:
  - existing rules that remain in force;
  - constraints and exceptions relevant to the request;
  - rules the request explicitly replaces;
  - unresolved conflicts or ambiguity.
- Unresolved conflicts block spec publication rather than being silently rationalised.
- The spec contains a concise `Wiki Context` section with topic references, inherited rules, explicit overrides and unresolved questions.

### Review model

- Code review becomes three independent axes:
  - Standards: repository conventions and engineering quality.
  - Spec: completeness, correctness and scope against the originating Matt spec.
  - Wiki: compatibility with current business rules that the spec did not explicitly replace.
- Wiki review is read-only. It produces findings or a pending-baseline-update result; it does not rewrite Wiki pages.
- A Child Issue can pass when its implementation is compatible with the current Wiki or when an approved Parent spec explicitly changes the rule. The latter records a pending Wiki update for full-Issue closeout.
- Parent review uses the aggregate diff and all relevant Child evidence, not only the last Child branch.

### Complete-Issue boundary

- A Child Issue is a partial delivery under a Parent and never updates the current business knowledge baseline.
- A Parent Issue becomes eligible for completion only when all Child Issues are closed and their delivered changes are present in the intended integration history.
- An Issue without a Parent and without Child Issues is a Standalone complete Issue.
- Parent and Standalone Issues must complete baseline reconciliation before merge and closure.
- If Issue relationships are missing or ambiguous, `finish-issue` returns `not-ready` rather than guessing.

### Baseline reconciliation

- Candidate Wiki pages are found from the aggregate changed paths, existing Wiki citations, spec Wiki Context and reviewer judgement.
- Candidate selection is advisory; a reviewer confirms the actual page set.
- Ordinary changes regenerate only confirmed affected pages.
- Structural changes may regenerate the catalogue and full Wiki.
- Wiki verification checks source existence, citation accuracy, internal links, navigation and the configured Wiki build.
- Every complete Issue records:
  - Issue identity;
  - source commit or aggregate fixed point;
  - reviewed Wiki pages;
  - updated Wiki pages;
  - whether business semantics changed;
  - verification result.
- A no-semantic-change Issue records that result without rewriting unrelated pages.

### `finish-issue`

- `finish-issue` is the only new user-facing Matt skill.
- It is user-invoked because it can merge branches, change tracker state and remove a worktree.
- It accepts or resolves the exact Issue, worktree, source branch, target branch and fixed point before mutation.
- It may use existing model-invoked review and branch-finishing capabilities rather than duplicating them.
- Child mode performs:
  1. verify fresh review evidence;
  2. inspect source, target and worktree state;
  3. run merge preflight;
  4. merge into the declared target;
  5. verify the target branch;
  6. write completion evidence and close the Child Issue;
  7. verify the closed state;
  8. remove the worktree last.
- Parent or Standalone mode performs:
  1. verify the complete-Issue gate and aggregate review evidence;
  2. inspect source, target and worktree state;
  3. run merge preflight;
  4. reconcile and, when needed, update the Wiki;
  5. verify and commit the final Wiki state;
  6. merge into the declared target;
  7. verify the target branch;
  8. write completion evidence and close the complete Issue;
  9. verify the closed state;
  10. remove the worktree last.
- Review pass, Wiki reconciliation, merge, target verification, Issue closure and worktree removal remain separate proof states.
- A failure preserves the latest recoverable state. Rerunning the skill detects completed steps and resumes without repeating consequential actions.
- The skill does not push, force-push, merge a remote PR, move unrelated files or resolve ambiguous target-branch state without separate authority.

### Deep Wiki integration

- Deep Wiki supplies Wiki generation, page generation, source citations and AI-readable output.
- Deep Wiki does not decide Issue hierarchy, completion status, spec authority or which pages are truly affected.
- The Matt integration layer owns Issue lifecycle and business-baseline policy.
- The first Wiki generation is a one-time bootstrap and human review step, not an additional recurring Matt workflow.
- If no reviewed Wiki baseline is available, spec generation and complete-Issue reconciliation must disclose that the double-confirmation guarantee is unavailable.

### Repository integration

- Changes to existing promoted skills must keep their invocation metadata and human-facing documentation synchronized.
- The new finishing skill must be added to the promoted engineering skill catalogue and plugin manifest.
- The Matt router must describe where Wiki preflight, three-axis review and Issue finishing fit in the workflow.
- Release manifests and plugin versions are changed only if required by the repository’s normal release policy.

## Testing Decisions

The preferred seam is one end-to-end lifecycle scenario using a temporary Git repository, a fake Issue tracker and a fake Wiki engine. Tests assert externally visible state—branch history, Wiki output, tracker status and worktree existence—rather than internal prompt implementation.

The repository does not currently expose an automated skill test harness, so implementation should add the smallest practical scenario-based verification compatible with its existing validation tooling instead of introducing a new general test framework.

Required scenarios:

1. Child review passes: merge and close succeed, Wiki is unchanged, worktree is removed last.
2. Child review has a Wiki conflict: no merge, close or cleanup occurs.
3. Parent has an open or unintegrated Child: returns `not-ready` with no mutation.
4. Parent aggregate review passes with an intended rule change: affected Wiki pages and the baseline record update before merge.
5. Parent aggregate review passes with no semantic change: only the reconciliation record changes.
6. Standalone Issue follows the complete-Issue path and updates or reconciles the baseline.
7. Spec explicitly overrides an old Wiki rule: review records a pending baseline update rather than reporting an implementation regression.
8. Spec conflicts with Wiki without an explicit override: completion is blocked.
9. Wiki page citations are stale or invalid: complete-Issue closure is blocked.
10. Target branch contains overlapping untracked files or an unsafe divergence: merge preflight blocks without moving or deleting files.
11. Merge succeeds but target verification fails: Issue remains open and worktree remains available.
12. Tracker close fails after a verified merge: retry closes the Issue without repeating the merge.
13. Worktree contains uncommitted changes or unique commits: cleanup is blocked and the exact preserved state is reported.
14. Issue is already closed or the worktree is already removed: retry treats the completed state idempotently.
15. Push or remote PR merge was not authorized: local completion does not perform either action.

## Out of Scope

- Replacing Matt specs with Spec Kit, OpenSpec, OpenLore or another requirements authority.
- Building a general code dependency graph or claiming exact affected-page detection.
- Updating the Wiki after every Child Issue.
- Treating generated Wiki content as reviewed business truth without human acceptance.
- Automatically resolving business ambiguity, spec/Wiki conflicts or stale Wiki claims.
- Automatically pushing branches, merging remote pull requests or deploying the Wiki.
- Rewriting historical specs when the current business baseline changes.
- Adding multiple new user-facing workflow skills.
- Refactoring unrelated Matt skills or repository infrastructure.

## Further Notes

- The complete-Issue transaction boundary is:

  `aggregate review → baseline reconciliation → merge → target verification → Issue closure → worktree removal`

- Child Issue closeout is:

  `review → merge → target verification → Child closure → worktree removal`

- Worktree removal is always the final destructive step.
- A clean code review is necessary but does not prove merge readiness, target delivery, tracker closure or cleanup safety.
- Deep Wiki’s official distribution is a GitHub Copilot CLI plugin. The implementation should reuse only the required Wiki contracts and avoid coupling Matt to a second lifecycle.
- Success means a future requirement can be checked against a reviewed current baseline before its spec is written, and a completed Issue cannot close until its implementation and business documentation have been reconciled.
