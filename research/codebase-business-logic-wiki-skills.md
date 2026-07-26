# 程式碼業務 Wiki、Spec 規劃與實作符合性閉環：開源 Agent Skill 研究

研究日期：2026-07-24

> **Historical research input:** Wiki engine、citation 與 authority 結論仍有效；本文提出的薄 `finish-issue` 流程已由 [`matt-first-issue-delivery-workflow-spec.md`](./matt-first-issue-delivery-workflow-spec.md) 的 Ron workflow 取代。

## 最終目標與判準

這裡的 spec 固定指 **Matt skills 的 spec 流程**；外部的 OpenSpec 或 Spec Kit 只能作比較對象，不能取代 `/grill-with-docs → /to-spec → /to-tickets → /implement → /code-review`。

1. **A — Codebase → 人類與 AI 都能讀的 wiki**：從現況程式碼、設定、測試與既有文件，產出可提交、可導航、附來源的業務流程／規則／資料狀態知識庫。
2. **B — Wiki → Matt spec preflight**：需求進來時，Matt 在訪談與 `/to-spec` 前先找出相關 wiki topics，確認既有規則、名詞、限制與衝突；不清楚或互相矛盾時先詢問人類。
3. **C — Matt spec → tickets → implementation**：保留現有 Matt 流程，不導入另一套 spec authority。
4. **D — Implementation vs. Matt spec + wiki review**：實作後分開檢查「是否完成新需求」以及「是否破壞既有業務邏輯」。工程 Standards 仍是既有 `/code-review` 的第三個、非業務軸。
5. **E — Wiki drift / intentional update**：若 Matt spec 明確改變既有規則，實作核准後更新 wiki；若 spec 沒有明確授權變更，wiki 衝突就是 finding，不能因為程式碼已改便反向覆寫 wiki。
6. **F — 真正可安裝的開源 skill / plugin**：有公開原始碼與可檢查的安裝／skill 或 plugin 契約，而不是單次 prompt、封閉 SaaS 或只有展示頁。

三種 artifact 的角色必須固定：

- **Wiki**：已審核的現況業務基線，供人與 AI 理解「現在應該怎麼運作」。
- **Matt spec**：這次需求想改變什麼的 change contract；可以明確 supersede wiki 規則，但不能默默衝突。
- **Code／tests**：實作與驗證證據，不因為已存在就自動成為業務 authority。

## 結論

**未找到一個已被一手來源證實、同時完整覆蓋 A–F 的單一開源 skill/plugin。**

符合此最終目標的答案不是 OpenLore + OpenSpec，也不是 Deep Wiki + Spec Kit，因為兩者都會引入另一套 spec workflow。正確的最小組合是：

1. **人類可讀 wiki 層**：優先參考 [Microsoft Deep Wiki](https://github.com/microsoft/skills/tree/main/.github/plugins/deep-wiki) 的 Markdown／Mermaid／VitePress、source citations、`llms.txt` 設計；若更重視 Codex plugin 與增量重編譯，參考 [LLM Wiki Compiler](https://github.com/ussumant/llm-wiki-compiler)。
2. **Matt spec 層**：保留現有 `/grill-with-docs → /to-spec → /to-tickets → /implement → /code-review`。
3. **Matt-specific glue**：在 spec 前加入 wiki preflight，在實作後加入獨立 Wiki review，並在核准後處理 wiki update。

因此，外部方案能提供 wiki 生成與更新機制，但**未找到能直接安裝後便與 Matt `/to-spec`、`/implement`、`/code-review` 形成完整雙層業務確認的現成開源 skill**。仍需要一個很薄的 Matt 專用 skill，或對現有 Matt skills 做小幅擴充。

OpenLore 可作為 code graph、impact 與 drift 的可選分析底座，但它產生 OpenSpec living specs，不應成為本流程的 spec authority。Spec Kit 與 OpenSpec 只保留為「別人如何做 requirements convergence」的參考，不列為導入建議。

## 候選能力矩陣

此表比較外部方案本身的能力，不代表要用它們取代 Matt spec。

| 方案 | A code → wiki | B wiki → spec | C spec → plan/tasks/實作 | D 實作符合性 review | E 漂移／更新 | F 可安裝開源 skill/plugin | 證據與限制 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| [OpenLore + OpenSpec](https://github.com/clay-good/OpenLore) | **是（machine-facing）**：OpenLore 將 code/IaC/decisions 建成可增量的 graph，並產生 `openspec/specs/` living specs。 | **是**：OpenLore 的 `orient()` 回傳 matching specs；OpenSpec `explore/propose` 從 codebase investigation 進入 change artifacts。 | **是**：OpenSpec proposal/spec/design/tasks → `apply`。 | **是**：OpenSpec `verify` 檢查 completeness/correctness/coherence；OpenLore `drift`、impact certificate 與 review 補 code/spec structural evidence。 | **是**：OpenLore watcher + deterministic drift；OpenSpec `update/sync/archive` 回寫 canonical specs。 | **是（stack，不是單一 skill）**：OpenLore MIT CLI/MCP/Claude skill；OpenSpec 是 agent commands。 | 外部獨立 stack 的能力覆蓋廣，但它以 OpenSpec 取代 Matt spec，且輸出是 living specs/knowledge graph、不是面向人閱讀的 VitePress wiki，因此不符本案 authority model。 |
| [Microsoft Deep Wiki](https://github.com/microsoft/skills/tree/main/.github/plugins/deep-wiki) | **是（人類 wiki）**：source-linked Markdown、Mermaid、VitePress、onboarding、`llms.txt`／`AGENTS.md`。 | **部分**：能 research/QA 與提供 citeable context，沒有 spec planning command。 | **否**。 | **否**：沒有 implementation-vs-spec conformance。 | **部分**：changelog/re-generate，但未見 spec/code drift contract。 | **是**：MIT GitHub Copilot plugin，含 commands/agents/auto-invoked skills。 | 人類可視產物比 LLM Wiki Compiler 更完整；若選它作 wiki 層，仍需接上 Matt-specific preflight、review 與 update gate。 |
| [LLM Wiki Compiler](https://github.com/ussumant/llm-wiki-compiler) | **是**：codebase mode、主題／概念頁、`Sources`。 | **部分**：agent 可讀 wiki，但沒有把 wiki 轉 spec 的工作流。 | **否**。 | **否**：只檢查 wiki 本身，沒有用 spec 驗證程式碼。 | **是**：增量編譯、stale/source/schema lint。 | **是**：MIT；有 Codex plugin manifest 與 `wiki-compiler` skill。 | 初始 codebase 設定的 `deep_scan` 預設為 `false`，要明確開啟才會讀 source code；輸出仍需人工核對。 |
| [GitHub Spec Kit](https://github.com/github/spec-kit) | **否**：產出 feature spec artifacts，不編譯 codebase wiki。 | **是，但需接線**：`specify`／`clarify` 可建立、補齊需求；必須把相關 wiki topic 與來源當輸入，工具不會自動選取它們。 | **是**：`specify → plan → tasks → implement`。 | **是（範圍為 spec/plan/tasks ↔ code）**：`analyze` 做 artifact consistency；`converge` 找出 code 相對 feature artifacts 的缺口並 append tasks。 | **是（spec artifacts）**：living/flow-back spec 指引規定下游重建與重新分析。 | **是**：MIT；`specify init` 可安裝 agent integration，skills mode 會提供 `speckit-*` skills；文件明示 Codex 的 skills-mode 呼叫形式。 | 不知道 wiki，也不會檢查 wiki 是否過時；`converge` 的 sole source of intent 是 spec、plan、tasks 與 constitution。 |
| [Acquire Codebase Knowledge](https://github.com/github/awesome-copilot/tree/main/skills/acquire-codebase-knowledge) | **部分**：可產出七份 evidence-backed codebase docs，不是互連 wiki。 | **部分**：可作為事實基線，但沒有 spec workflow。 | **否**。 | **否**。 | **否**：沒有原生 incremental contract。 | **是**：GitHub 維護的 MIT Agent Skill。 | 最適合用來在首次 wiki 前建立「已知／未知／須詢問」基線，而不是取代 wiki 或 SDD。 |
| [Quality Playbook](https://github.com/andrewstellman/quality-playbook) | **部分**：會探索 codebase、讀參考文件並產生 requirements/coverage artifacts，不是 wiki。 | **部分**：可從 code/docs 導出與審核 requirements，但不提供 spec → plan → task 的 SDD 流。 | **否**：可提出 patch／測試，沒有 Spec Kit 式 tasks 實作鏈。 | **強，但不是三方 wiki review**：三段 code review、spec audit、functional/regression tests 與 completeness gate。 | **部分**：重跑會保存 previous runs。 | **未列為最小組合**：可公開讀取 skill/source，但本次只確認其 frontmatter 指向自訂 `LICENSE.txt`，未另外確認 OSI 授權；且完整流程很重，並會在 target root 寫入 `AGENTS.md`。 | 可作為之後加強品質的候選，但不應拿它假裝成已完成的 wiki/spec 閉環。 |
| [RepoWiki](https://github.com/he-yufeng/RepoWiki) | **是（一次性）**：本地 repo → Markdown/JSON/HTML wiki。 | **否**。 | **否**。 | **否**。 | **否／尚未承諾**：README 將增量重生列為 roadmap。 | **否**：MIT CLI/Web app，不是 Agent Skill/plugin。 | 適合快速原型或視覺化比對，不適合正式閉環的第一選擇。 |
| [DeepWiki-Open](https://github.com/AsyncFuncAI/deepwiki-open) | **部分**：遠端 repo 的互動式 wiki。 | **否**。 | **否**。 | **否**。 | **未證實**。 | **否**：Web app，非 skill。 | Docker/.env/6 GB 記憶體設定使其不適合作為低風險試驗。 |

## 一手證據

### LLM Wiki Compiler：只覆蓋 wiki 端

- [Codex plugin manifest](https://raw.githubusercontent.com/ussumant/llm-wiki-compiler/main/plugin/.codex-plugin/plugin.json) 宣告 MIT、Codex plugin、topic-based wiki、source backlinks、coverage indicators、schema evolution 與 knowledge graph。
- [wiki-compiler SKILL.md](https://raw.githubusercontent.com/ussumant/llm-wiki-compiler/main/plugin/skills/wiki-compiler/SKILL.md) 規定只可寫入設定的 output 目錄，並以 codebase mode 與 configured sources 編譯 wiki。
- [wiki-init command](https://raw.githubusercontent.com/ussumant/llm-wiki-compiler/main/plugin/commands/wiki-init.md) 的 codebase mode 明列 module/topic discovery，並將 `Purpose`、`Architecture`、`Talks To`、`API Surface`、`Data`、`Key Decisions`、`Gotchas`、`Sources` 作為文章結構；`deep_scan` 是可選設定、預設 `false`。
- [wiki-compile command](https://raw.githubusercontent.com/ussumant/llm-wiki-compiler/main/plugin/commands/wiki-compile.md) 只描述 topic/concept compilation、schema、index、state/log 的增量編譯，沒有 spec、plan、tasks 或 code-conformance 步驟。
- [wiki-lint command](https://raw.githubusercontent.com/ussumant/llm-wiki-compiler/main/plugin/commands/wiki-lint.md) 只檢查 stale source、orphan、cross-reference、coverage、wiki contradiction 與 schema drift；它不是 spec review。
- [wiki-migrate command](https://raw.githubusercontent.com/ussumant/llm-wiki-compiler/main/plugin/commands/wiki-migrate.md) 是把 agent startup reads 導向 wiki 的輔助，不會建立或驗證 feature spec。

### OpenLore + OpenSpec：能力參考，但不採用其 spec authority

- [OpenLore README](https://raw.githubusercontent.com/clay-good/OpenLore/main/README.md) 宣告 MIT、local-first static analysis、可增量更新的 unified graph，以及 `openspec/specs/*.md` living specs；`orient()` 同時回傳相關 code、tests 與 matching specs。
- 同一 README 說明 `openlore generate` 產生 RFC 2119 living specs（需 API key），`openlore drift` 以 spec mappings 偵測 Gap/Uncovered/Stale/ADR-gap（不需 API key），並可由 watcher 讓 graph 保持新鮮。
- [OpenSpec commands](https://raw.githubusercontent.com/Fission-AI/OpenSpec/main/docs/commands.md) 定義 `explore → propose → apply`，artifact chain 為 proposal/specs/design/tasks，`verify` 逐項檢查 completeness/correctness/coherence，`sync` 將 delta specs 併入 canonical `openspec/specs/`，`archive` 完成變更生命週期。

### Microsoft Deep Wiki：人類可視 wiki 的替代前端

- [Deep Wiki README](https://raw.githubusercontent.com/microsoft/skills/main/.github/plugins/deep-wiki/README.md) 宣告 MIT Copilot plugin，提供 generate/crisp/catalogue/page/research/ask/onboard/agents/llms/build/deploy commands 與 auto-invoked skills。
- 同一來源規定每個 wiki claim 都必須有 `file:line` citation，並將 Markdown wiki、VitePress、`llms.txt` 與 `AGENTS.md` 置於 agent 可發現的路徑；但命令表沒有 spec/plan/tasks 或 code-conformance review。

### GitHub Spec Kit：完整 SDD 和 code ↔ feature artifacts convergence，但沒有 wiki

- [README](https://raw.githubusercontent.com/github/spec-kit/main/README.md) 明列 MIT、agent integrations、skills mode 與核心 `speckit-constitution/specify/plan/tasks/implement/converge`，以及 `clarify/analyze/checklist` quality gates；它也明確說 Codex CLI skills mode 使用 `$speckit-*`。
- [specify command](https://raw.githubusercontent.com/github/spec-kit/main/templates/commands/specify.md) 建立 `specs/<feature>/spec.md`，要求 user scenarios、可測功能需求、可量測 success criteria、edge cases 與 requirements checklist；這是把 wiki 的「現況」轉成可審核「意圖」的適合承接點。
- [analyze command](https://raw.githubusercontent.com/github/spec-kit/main/templates/commands/analyze.md) 嚴格 read-only 地檢查 `spec.md`、`plan.md`、`tasks.md` 的 ambiguity、underspecification、coverage 和 terminology drift，並要求缺口回到正確 artifact 修正。
- [converge command](https://raw.githubusercontent.com/github/spec-kit/main/templates/commands/converge.md) 明確將 spec、plan、tasks（加 constitution）定為 sole source of intent，檢查現況 code，將 missing/partial/contradicts/unrequested findings append 成可追溯 tasks；因此能做實作後符合性複核，但不會讀 wiki。
- [evolving specs guide](https://github.github.com/spec-kit/guides/evolving-specs.html) 定義 living spec/flow-back：意圖變更時先更新 `spec.md`、再同步 plan/tasks、`analyze`、implementation 與 `converge`。這是 spec 端的漂移閉環。

### 其他候選的定位

- [Acquire Codebase Knowledge SKILL.md](https://raw.githubusercontent.com/github/awesome-copilot/main/skills/acquire-codebase-knowledge/SKILL.md) 要求七份 `docs/codebase/` 文件、每個主張的 evidence path、`[TODO]`／`[ASK USER]`，並對 README 過時與產物檔提出防呆；它可當 wiki 初稿的證據基線。
- [Quality Playbook SKILL.md](https://raw.githubusercontent.com/github/awesome-copilot/main/skills/quality-playbook/SKILL.md) 的 phases 輸出 `REQUIREMENTS.md`、`CONTRACTS.md`、`COVERAGE_MATRIX.md`、spec audit、code review、functional tests 與 completeness report；它是重型的 quality system，而不是 spec/task 或 wiki compiler。
- [RepoWiki README](https://raw.githubusercontent.com/he-yufeng/RepoWiki/main/README.md) 提供 local scan、Markdown export、source links，但把 incremental regeneration 列為 roadmap；[pyproject.toml](https://raw.githubusercontent.com/he-yufeng/RepoWiki/main/pyproject.toml) 仍標記為 alpha。
- [DeepWiki-Open README](https://raw.githubusercontent.com/AsyncFuncAI/deepwiki-open/main/README.md) 只承諾遠端 repo 的文件與互動 wiki；[docker-compose.yml](https://raw.githubusercontent.com/AsyncFuncAI/deepwiki-open/main/docker-compose.yml) 顯示 Docker、`.env` 與 6 GB `mem_limit` 的部署負擔。

## 建議的最小閉環流程

採「人類可讀 Wiki + 現有 Matt workflow」，不引入第二套 spec 系統。

```text
現有 code / tests / docs
          │
          ▼
人類可讀 Business Wiki
  ├─ 現況流程、規則、狀態、例外
  ├─ source citations
  └─ 人類審核狀態
          │
          ▼
需求進入
          │
          ▼
Wiki preflight
  ├─ 找出相關 topics
  ├─ 列出既有規則與限制
  ├─ 找需求衝突／語意不清
  └─ 不清楚時回到人類確認
          │
          ▼
Matt: grill-with-docs → to-spec → to-tickets
          │
          ▼
implement → tests
          │
          ▼
三軸 code-review
  ├─ Standards：工程品質
  ├─ Matt Spec：新需求是否完整、正確
  └─ Wiki：既有業務規則是否被破壞
          │
          ▼
若 Spec 明確改變既有規則且實作核准 → 更新 Wiki
```

### Spec 前的第一層確認

`/to-spec` 前必須有一份 wiki preflight 結果：

- 相關 wiki topics 與 source paths。
- 需求沿用的既有業務規則。
- 需求明確取代的既有規則。
- 需求與 wiki 的衝突或不清楚處。
- 已由人類確認的答案，以及仍未決定的問題。

未解決的衝突不得被 `/to-spec` 默默合理化。Matt spec 應新增一個簡短的 `Wiki Context` 或等價區塊，保存引用與明確 overrides；不複製整份 wiki。

### 實作後的第二層確認

既有 `/code-review` 應從 Standards + Spec 兩軸擴充為三軸：

- **Standards**：原本的工程標準與 code smells。
- **Spec**：新需求是否完整、是否 scope creep、實作是否錯誤。
- **Wiki**：diff 是否違反未被 spec 明確取代的既有流程、狀態、權限、資料與例外規則。

Wiki reviewer 應輸出 `wiki rule/source → affected diff/code/test → status`。它只能提出 finding，不能自行更新 wiki。若 Wiki 與 Matt spec 衝突：

1. Spec 有明確 override 與人類確認：實作可通過，但建立「核准後更新 wiki」待辦。
2. Spec 沒有明確 override：視為需求或實作衝突，回到 spec 澄清。
3. Wiki 本身無來源或已過時：先標記 wiki repair，不把現有 code 自動升格為正確業務規則。

## Parent/child issue 的 Wiki 同步邊界

### Deep Wiki 已核證能力

| 面向 | 結論 | 證據 |
| --- | --- | --- |
| 完整生成 | 支援 `/deep-wiki:generate`：掃描、catalogue、全頁、onboarding、VitePress `wiki/` 與 `llms.txt`。 | [full generation command](https://raw.githubusercontent.com/microsoft/skills/main/.github/plugins/deep-wiki/commands/generate.md) |
| 單頁／局部生成 | README 列出 `/deep-wiki:page <topic>`；page writer 適用於特定 component/system。**未見**原地 patch 或以 diff 自動找 affected pages 的契約。 | [plugin README](https://raw.githubusercontent.com/microsoft/skills/main/.github/plugins/deep-wiki/README.md), [page writer skill](https://raw.githubusercontent.com/microsoft/skills/main/.github/plugins/deep-wiki/skills/wiki-page-writer/SKILL.md) |
| Source citations | 每個非瑣碎主張必須有 local 或 remote `file:line` citation；生成要驗證 paths/symbols。 | [page writer skill](https://raw.githubusercontent.com/microsoft/skills/main/.github/plugins/deep-wiki/skills/wiki-page-writer/SKILL.md) |
| AI discovery | 產出 `llms.txt`、`wiki/llms-full.txt`、wiki Markdown，並只在缺少時產生 `AGENTS.md`。 | [plugin README](https://raw.githubusercontent.com/microsoft/skills/main/.github/plugins/deep-wiki/README.md), [full generation command](https://raw.githubusercontent.com/microsoft/skills/main/.github/plugins/deep-wiki/commands/generate.md) |
| Parent/sub-issue、只在 parent 結束同步、affected-page mapping | **未支援／未證實。**README、generate command、page writer 都沒有 `issue`、`parent`、`sub-issue`、`close`、`affected` 或 `update` 的工作流契約。 | 同上三份官方來源；在其文字搜尋無命中。 |

因此 Deep Wiki 不能被描述為「知道 child issue 是否全完成」或「自動更新剛好受影響的頁」；它只提供可由來源引用反查的知識產物。以 changed file paths 搜尋 wiki citations 可以選出候選頁，但仍需人工確認，不能聲稱是原生 dependency mapping。

另外，官方 README 將 Deep Wiki 定位為 **GitHub Copilot CLI plugin**；它和 Matt 的 Claude Code plugin 不是零設定、同一套 lifecycle。可重用的是 Deep Wiki 的生成命令與 skill 契約，parent 完成邊界仍要由 Matt 端的薄適配層負責。

### 最小編排：child 只讀，parent 收尾才更新

本地 [`to-tickets`](../skills/engineering/to-tickets/SKILL.md) 已把父需求拆為 child slices，且明確不得 close/修改 parent；[`code-review`](../skills/engineering/code-review/SKILL.md) 只審一個 fixed-point diff 的 Standards + Spec，沒有 issue aggregation 或 wiki sync。因此採下列邊界：

1. 每個 child 只讀 `llms.txt`、相關 wiki page 與 citations，將「與既有規則不相容」記錄為相容性 finding；**不更新 wiki**。
2. 所有 child 完成後、但 parent/full issue close 前，才彙總 parent spec、child commits/tests、由 parent 起點算出的 aggregate diff 與相關 wiki pages。
3. 在 parent 層跑 aggregate Spec review；不得只審最後 child 的 diff。建立 `parent requirement → child/commit → changed code/test → wiki page+citation → verdict` matrix。
4. 以 changed paths 對 wiki citations 搜尋出候選頁，reviewer 確認後才逐頁 `/deep-wiki:page` 重生；結構性變更才 full generate。重新驗證 citations 與 wiki build。
5. 只有 aggregate Spec+Wiki review 無阻斷 finding、wiki 驗證完成後，parent/full issue 才可 close；若是 spec 改變而非 code bug，先回到 spec 做明確 override。

### 零新增 skill vs. 薄 `finish-issue`

| 選項 | 優點 | 缺口 | 建議 |
| --- | --- | --- | --- |
| 把流程塞入既有 `code-review` | 無新安裝面，可立即做一次手動驗證。 | 破壞其兩軸、單一 fixed-point diff 的明確契約；沒有 child-completion gate、matrix、citation/page selection 或 close-ready verdict。 | 僅一次性、低風險 parent。 |
| 新增一個薄 `finish-issue` | 把 parent-only 收尾責任放在唯一入口，維持 `code-review` 專注 Standards + Spec。 | 需最小實作與驗證。 | **推薦。** |

`finish-issue` 的最小輸入：parent issue、child list、parent fixed point、spec path、wiki root。最小輸出：child completion check、aggregate `code-review`、三方 matrix、候選/實際 wiki page list、citation/build verification、`close-ready`/`not-ready` verdict。它不實作 child、不自動改核准 spec、不猜業務意圖，也不自行 close parent；wiki 寫入只在明確核准後進行。

因此使用者可見的新增 Matt skill 只需要這一個；不需要再安裝 Spec Kit、OpenSpec、OpenLore 或 Quality Playbook。Deep Wiki 內部雖有多個生成／研究 skill，但在本流程只把它當作 Wiki 引擎，不再新增第二套 spec 或 review authority。

## 低風險驗證

在小型、非機密的 isolated worktree 執行；先不改現有 `AGENTS.md`、不裝全域 plugin、不提交：

1. 選一個人類熟悉、已有狀態轉移與例外規則的業務流程，產出 3–5 頁 wiki；每個核心規則都必須有 code/test/doc source，並由領域人員標記 reviewed。
2. 準備兩個需求：一個不應衝突；一個刻意修改既有規則。確認 wiki preflight 能讓後者在 `/to-spec` 前要求明確 override。
3. 讓 Matt `/to-spec` 產出 spec；檢查 spec 只引用相關 wiki topics，且把沿用規則、override 與未決問題分清楚。
4. 做一個正確實作及一個刻意違反 wiki、但 spec 未授權的反例。確認 Spec reviewer 能驗新需求，Wiki reviewer 能獨立抓出既有規則衝突。
5. 對明確核准的規則變更，確認流程在 code review 通過後才提出 wiki update；更新後重新核對 citations，且不改寫歷史 spec。

## 研究限制

- 依 agent-reach 的 GitHub CLI 路徑執行搜尋時，`gh` 因 GitHub API 連線失敗；Jina Reader 路徑也因 DNS 失敗。本研究以可用公開網頁索引定位候選，但所有實質結論只引用其 GitHub README、`SKILL.md`、command template、manifest、原始設定或 GitHub 官方 Spec Kit docs。
- 已執行 `agent-reach check-update`：目前回報 v1.5.0；更新查詢因 DNS 失敗、重試三次後仍無法判定是否有新版。
