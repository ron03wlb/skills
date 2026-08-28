# close-issue RECONCILED recovery

**Goal:** 為 post-fast-forward dirty snapshot drift 增加一條誠實、human-authorized 的 `RECONCILED` recovery，解除 target 已等於 candidate 且 receipt 為 `FAILED` 的 closeout dead-end。
**Why planning is required:** 此變更修改 local Git integration、worktree removal與 tracker closure 的安全 contract，並將用於恢復已整合但尚未 cleanup／closure 的 spay2 Issue #97。
**Acceptance:** `FAILED` receipt預設仍停止且不得被覆寫、rebaseline或偽裝成 `VERIFIED`。只有原 receipt證明 failure發生在 successful fast-forward之後並持久化 failure-time expected／observed fields、target仍精確等於 candidate、Issue worktree仍為 exact clean path、reflog證明 target-before至candidate為 fast-forward、current dirty paths與原 candidate delta為零 collision，且 human在看到 mismatch後明確接受 preservation equality無法補證時，才能新增並 read-back `dirty-target-reconciliation:v1` phase `RECONCILED`。未來 receipt必須預先保存 effective post-merge hook evidence；legacy receipt缺少 transition-time hook evidence時，另需 current hook absence與 human明確接受該歷史 absence無法追溯證明。Cleanup與closure只接受 matching `VERIFIED`或matching `RECONCILED`；target、worktree、receipt或tracker drift皆停止。不得 rollback、reset、stash、push、刪topic branch或改動 unrelated dirty files。

### Outcome 1: 鎖定 dead-end recovery contract
- Work: 先新增 contract assertions，要求 `RECONCILED` 的 human authority、post-fast-forward identity、zero collision、hook absence、truthful non-proof claim、read-back及 cleanup／closure gates；保留一般 `FAILED` stop。
- Verify: `node --test tests/ron-workflow/skill-contracts.test.mjs`

### Outcome 2: 同步 promoted skill行為文件
- Work: 以最小文字更新 `close-issue` skill、human-facing docs、ADR-0022與必要 CONTEXT glossary；不改 invocation policy、manifest、router topology或版本。
- Verify: `python C:/Users/ron.chang/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/engineering/close-issue`
- Verify: `node --test tests/ron-workflow/skill-contracts.test.mjs`
- Verify: `git diff --check`

### Outcome 3: 用新 contract恢復 Issue #97
- Work: 在 skill evidence通過後，以使用者本輪明確授權新增 read-back `RECONCILED` receipt；再重新驗證 target/candidate、reflog、hook、collision、clean exact worktree與Issue state，才移除 worktree並關閉/read-back #97。
- Risks/open questions: 本輪沒有持久化 pre-manifest，因此不得宣稱原 snapshot equality；只能宣稱 explicit human reconciliation已接受這個 evidence gap。
- Verify: target等於 receipt candidate、exact Issue worktree absent、topic branch retained、Issue #97 state為 `closed`。
