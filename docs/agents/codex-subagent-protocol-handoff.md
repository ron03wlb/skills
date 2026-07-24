# Handoff: Codex 子代理協作規約採用

## 目的

在 `C:\Workspace\open_source\skills` 將已審核的 Codex 子代理規約落實到既有 Matt skills。使用者尚未授權實作；下一位 agent 應先確認是否要開始修改，而不是自行擴大範圍。

## 已完成

- 建立未追蹤草案：`C:\Workspace\open_source\skills\docs\agents\codex-subagent-protocol.md`。
- 草案已改為繁體中文；僅 skill 名稱、Codex tool、檔名與必要指令保留英文。
- 草案包含：委派條件、委派契約、並行／生命週期、模型路由、寫入隔離、Coordinator 驗收、skill 對應與採用檢查表。
- 模型路由已確認：
  - `research`、`wayfinder` 研究決策、`improve-codebase-architecture` 探索：`gpt-5.6-terra`／`medium`。
  - `code-review`、`codebase-design` 的 Design It Twice、`implement` worker：`gpt-5.6-sol`／`high`。
- 新檔 whitespace check 已通過。未 stage、未 commit、未修改任何既有 skill 或設定。

## 已確認的設計決策

1. 不新增 generic skill；子代理是既有 workflow 的執行能力，不是新的使用者流程。
2. 主要落點是既有 `SKILL.md`，由它們真正呼叫／要求 `spawn_agent`，並指定角色、模型、推理強度、讀寫範圍與驗收。
3. `AGENTS.md` 只應新增一條指向 protocol 的全域規則，不能承載每個 skill 的細節。
4. `agents/openai.yaml` 不用於模型設定；其官方用途是 UI metadata、invocation policy 與工具依賴。
5. 本 task 目前可用的 built-in agent roles 是 `default`、`explorer`、`worker`。第一版應在各次委派明確設定 `model` 與 `reasoning_effort`，不要依賴尚未在此 task 介面公開的 custom agent role。
6. `.codex/config.toml` 只可作為全域子代理預設，非第一版必要條件；目前 repository 沒有 `.codex/` 目錄。
7. 子代理預設唯讀；平行寫入只允許在各自隔離 worktree 與明確檔案 ownership 下進行。Coordinator 保留使用者決策、外部操作與最終驗收。

## 建議實作範圍

先修改下列既有檔案，保持最小範圍：

1. `skills/engineering/research/SKILL.md`
2. `skills/engineering/code-review/SKILL.md`
3. `skills/engineering/improve-codebase-architecture/SKILL.md`
4. `skills/engineering/codebase-design/DESIGN-IT-TWICE.md`
5. `skills/engineering/wayfinder/SKILL.md`
6. `skills/engineering/implement/SKILL.md`
7. `AGENTS.md`：只新增 protocol 指標。

因上述為 promoted skill 行為變更，依 `CLAUDE.md` 與 `.agents/writing-docs.md`，同步檢查並更新相對應的 `docs/engineering/*.md`。只有 user-visible flow 實質改變時才更新 `ask-matt`；目前它已描述背景／平行子代理，因此不應為了模型路由而改寫。

## 下一步建議

1. 先向使用者確認「開始採用 protocol」的授權，以及是否要一併將草案納入 Git。
2. 讀取六個目標 skill、對應文件、`AGENTS.md`，將 Claude-specific `Agent`／`Task` 用語換成 Codex 子代理操作與 protocol 指標。
3. 每一個會委派的 skill 都要明確寫出：built-in role、`model`、`reasoning_effort`、唯讀或 worktree ownership、回傳 evidence、Coordinator 驗收。
4. `implement` 採 direct 為預設；只有完整指定的議題且隔離 worktree 能保護既有工作或產生真正獨立切片時才使用 `worker`。
5. 驗證 Markdown、`git diff --check`，並獨立審查最終 diff。保留未追蹤 protocol 檔案，除非使用者明確授權 stage／commit。

## 當前儲存庫狀態

- 工作目錄：`C:\Workspace\open_source\skills`
- 分支：`main`
- `HEAD`：`a899ba1`
- 唯一未追蹤檔案：`docs/agents/codex-subagent-protocol.md`

## 重要參考

- 規約草案：`C:\Workspace\open_source\skills\docs\agents\codex-subagent-protocol.md`
- Repository 規則：`C:\Workspace\open_source\skills\CLAUDE.md`
- 文件同步規則：`C:\Workspace\open_source\skills\.agents\writing-docs.md`
- 官方 Codex 子代理說明：https://learn.chatgpt.com/docs/agent-configuration/subagents.md

## Suggested skills

- `using-superpowers`：先分級採用工作並確認最小驗證要求。
- `openai-docs`：若 Codex 的 custom agent 或模型設定能力需要重新查證。
- `code-review`：完成後，以 Standards／Spec 兩軸獨立審查變更。
- `verification-before-completion`：若擴大到自訂 agent 檔、工作樹寫入與跨 skill 行為變更時，確認主張均有對應證據。
