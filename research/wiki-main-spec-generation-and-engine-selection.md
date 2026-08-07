# Ron Wiki 主規格生成與候選引擎選型

> Historical design, superseded by [ADR-0021](../docs/adr/0021-focus-ron-on-local-issue-delivery.md). The current `/wiki` skill is a standalone Wiki-only edit, validation, semantic-review, repair, and local-commit flow.

研究日期：2026-07-26
研究範圍：目前仍可公開取得、具明確授權且近期有維護跡象的 codebase Wiki 工具；網路事實只採官方 GitHub repository、manifest、原始碼、commit 與 release。

## 結論

1. **Canonical Wiki 主規格／manifest 應由 Ron workflow 建立與維護，不應交給開源 Wiki 引擎生成。**
2. **Ron v1 最接近需求的 codebase generation protocol 是 [ussumant/llm-wiki-compiler](https://github.com/ussumant/llm-wiki-compiler)，固定在 `2faf5d951dfbfbbb32294c5edd3e968ca0a55c2f`；但它是由 agent 執行的 Markdown plugin／protocol，不是可獨立測試的 compiler binary。** 它可作 `/wiki` 的 pinned protocol reference，不得被誤報為已安裝的 deterministic engine。
3. **若未來需要真正的 executable compiler，優先評估 [atomicstrata/llm-wiki-compiler](https://github.com/atomicstrata/llm-wiki-compiler) v1.1.0，固定在 release target `6963a7f8374282de5d4084a324be69b50f62a32d`。** 它有 CLI、review queue、incremental state、freshness、lint/eval 與正式 release，但預設從 `sources/` 複本產生 concept pages，尚不符合 Ron 的 repo-code locator 與 exact semantic write-set 契約。
4. **Microsoft Deep Wiki 不應成為 Ron v1 的 canonical engine。** 它的逐 claim 行號引用、Mermaid 與 VitePress 輸出較強，但完整生成的寫入面太廣；單頁命令也沒有宣告確切輸出路徑或 dry-run。它比較適合作為未來 publication/bootstrap layer 的設計參考。
5. **引擎只能產生候選稿，不能決定 page authority、Issue hierarchy、完成狀態、semantic/support write set 或是否採納輸出。** Ron workflow 先決定這些邊界，再把受限輸入交給引擎。

這個決定也修正一個容易混淆的用語：現有 Ron spec 把 LLM Wiki Compiler 稱為「canonical Wiki engine」，但真正 canonical 的應是 **Ron workflow 的 authority contract 與 Git-tracked Wiki baseline**；引擎只是被 pin 住、可換掉的 compiler dependency。

### 選型狀態

| 狀態 | 選項 | 決定 |
| --- | --- | --- |
| **Process-owned authority** | Ron workflow | 建立與維護 canonical 主規格；OSS engine 不得生成 authority。 |
| **Primary v1 protocol candidate** | `ussumant/llm-wiki-compiler` `2.1.0` / `2faf5d951dfbfbbb32294c5edd3e968ca0a55c2f` | 只作 pinned generation-protocol reference；先證明 agent 執行的 zero-write preview 與 deterministic path set。 |
| **Executable-engine candidate** | `atomicstrata/llm-wiki-compiler` v1.1.0 / `6963a7f8374282de5d4084a324be69b50f62a32d` | 另行測試 source adapter、repo locator、page contract 與 exact write ceiling；通過前不納入 v1。 |
| **Conditional fallback** | Microsoft Deep Wiki `2.0.0` 的 `/deep-wiki:page`，inspected tree `4f1db7ec55caf11e3b143c91220bd79a632bc55b` | 只在 LLM Wiki Compiler 無法達到 citation gate，且 Deep Wiki 先證明 staging output ceiling、exact target path、zero-write preview 後才評估；full generator 不在 fallback 範圍。 |
| **Rejected for Ron v1** | RepoWiki `0.2.0` / `1400cf213e7328d326286be8c95ec7a9107d28e9` | 尚無 page-level incremental、dry-run 或逐 claim citation contract。 |
| **Rejected for Ron v1** | OpenDeepWiki `v2.0.3` / `6eb5222d25487362fcd411891fad9027f7840f96` | 是 DB/worker/web knowledge platform，不是 exact-file candidate generator。 |
| **Rejected until licensed** | CodeWiki / `4c18face91c6a634a86b3e9aebb1af6c78d66e76` | inspected tree 無可辨識 license。 |

## 建議的 authority 分層

```text
Human approval + Ron workflow
        │
        ├─ owns: docs/agents/ron-workflow.md
        │        canonical root / page identities / source authority
        │        engine pin / protocol hash / build command
        │        semantic + support write sets / mutation policy
        │
        ├─ derives: engine adapter config
        │           e.g. .wiki-compiler.json or task-local equivalent
        │
        ▼
Replaceable candidate generator
        │
        ├─ reads approved source snapshot
        ├─ writes only a task-specific staging mirror
        └─ returns candidate pages + support diff
        ▼
Ron closeout gate
        │
        ├─ rejects paths outside granted sets
        ├─ verifies citations, links, lint and build
        └─ promotes only accepted paths into the Git-tracked baseline
```

### 主規格與 operational config 分層

不新增第二個長期 canonical manifest：

- `docs/agents/ron-workflow.md` 只保存 operational Wiki contract：`wiki_contract_schema_version`、canonical root、baseline state、page/slug policy reference、citation policy reference、engine/protocol pin、`wiki_context_mode: staging`、`wiki_mutation_policy: closeout_only`、build/lint/citation commands、preconfigured `wiki_support_write_set` 與禁止自動 publish 的規則。
- Wiki bootstrap Change Spec 保存首次 generation authority：required business topic／flow inventory、exact candidate page paths、purpose、source seeds、dependencies、exclusions、validation commands與批次順序。它由 `/wiki bootstrap` 先產生 Preview，經人類批准後寫入 Issue。
- baseline accepted 後，`wiki/index.md` 是目前已審查 topic/page map與導航入口；新增、刪除或重新定義 topic屬 semantic change，不能由 engine自行演化。
- 每次 task 的 engine adapter config、candidate directory、candidate input hash與 exact semantic/support write sets都是 derived／task-local，不成為新的 authority。

`.wiki-compiler.json` 應視為 **engine adapter**，不是 authority。LLM Wiki Compiler 產生的 `schema.md` 也只能作為候選分類/index 資料；它不能凌駕 workflow 核准的 page map 或自行擴張 semantic write set。

## 候選比較

### 一覽

| 候選 | 精確版本／commit（截至 2026-07-26） | 維護狀態 | 增量生成 | 引用 | Markdown | lint／build | 部署副作用 | exact write set／dry-run | Ron 適配判斷 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [ussumant LLM Wiki Compiler](https://github.com/ussumant/llm-wiki-compiler) | manifest `2.1.0`; [`2faf5d9`](https://github.com/ussumant/llm-wiki-compiler/commit/2faf5d951dfbfbbb32294c5edd3e968ca0a55c2f), 2026-07-10；無正式 GitHub release | 近期加入 agent-agnostic compile protocol 與 deploy tooling | **宣告有**：changed topics；另有 `--topic`，但由 agent 解讀 Markdown protocol | page-level Sources/backlinks；未證實逐 claim行號 | **有**：plain Markdown，Markdown/Obsidian links | **宣告有 Wiki lint**；沒有獨立 binary 可驗證 | compile prompt 本身不 publish；其他 capture/schedule/upgrade 命令另有副作用，不應進 closeout lane | protocol 宣告 output ceiling 與 `--dry-run`；實際保證取決於執行 agent，必須由 Ron wrapper 驗證 | **首選 v1 protocol reference，不是 verified engine** |
| [atomicstrata LLM Wiki Compiler](https://github.com/atomicstrata/llm-wiki-compiler) | release [`v1.1.0`](https://github.com/atomicstrata/llm-wiki-compiler/releases/tag/v1.1.0); target [`6963a7f`](https://github.com/atomicstrata/llm-wiki-compiler/commit/6963a7f8374282de5d4084a324be69b50f62a32d), 2026-07-16 | 活躍、有正式 npm/CLI release 與大量 tests | **有**：source-hash incremental；`refresh --stale --dry-run` | paragraph／claim line-range citations、coverage/precision/support eval；但預設指向 `sources/` 複本 | **有**：plain Markdown | **有**：lint、fast/full eval、review queue | compile 不 publish；另有 profile/workflow/template/connector surfaces，Ron 不應採用 | `compile --review` 可 hold candidates，但沒有 Ron exact page allow-list；blocked page 採 skip-not-abort | **首選 executable compatibility candidate；需 source/locator adapter，v1 不直接採用** |
| [Microsoft Deep Wiki](https://github.com/microsoft/skills/tree/main/.github/plugins/deep-wiki) | plugin `2.0.0`; inspected tree [`4f1db7e`](https://github.com/microsoft/skills/commit/4f1db7ec55caf11e3b143c91220bd79a632bc55b)；deep-wiki path 最近可辨識變更 [`e1f9cce`](https://github.com/microsoft/skills/commit/e1f9cce11758d305e6c77683fe34ccc394586291), 2026-04-20 | `microsoft/skills` repo 活躍，但 Deep Wiki 子樹的近期專屬維護證據較弱 | 未見 source-state incremental contract；`crisp` 是縮小全量生成，不是 changed-page incremental | **最強**：逐 claim `file:line`、表格 Source 欄、Mermaid source comments | **有**：VitePress Markdown | **有 VitePress build**；未見獨立 Wiki lint | full generate 可新增 root/folder `AGENTS.md`、`llms.txt`、VitePress 檔；deploy 會新增 workflow、調整 config，可能產生 lockfile | `page` 可單頁生成，但未宣告 output path 或 dry-run；full generate 明顯超出 exact set | **publication/bootstrap 參考，不作 v1 engine** |
| [RepoWiki](https://github.com/he-yufeng/RepoWiki) | pyproject `0.2.0`；最新正式 release [`v0.1.0`](https://github.com/he-yufeng/RepoWiki/releases/tag/v0.1.0)；[`1400cf2`](https://github.com/he-yufeng/RepoWiki/commit/1400cf213e7328d326286be8c95ec7a9107d28e9), 2026-07-23 | 活躍；近期改善 chat 引用與 PageRank | **未完成 page incremental**：content-hash cache 可省分析，但 README 把「只重生 changed pages」列為 roadmap | 生成頁含檔案路徑；pinned page builder 未產生逐 claim 行號連結。近期 path:line cards 是 chat UI 能力 | **有**：Markdown directory、JSON、HTML | 專案有 CI；未見 generated-Wiki lint/build gate | CLI 不自動 deploy；HTML `--open` 可開瀏覽器；Pages-ready publish 尚在 roadmap | 可指定 output dir，但 exporter 會寫全部 pages、`_sidebar.md`、`README.md`；未見 dry-run | **可作一次性 codebase overview，不適合 closeout page candidate** |
| [OpenDeepWiki](https://github.com/AIDotNet/OpenDeepWiki) | release [`v2.0.3`](https://github.com/AIDotNet/OpenDeepWiki/releases/tag/v2.0.3)；[`6eb5222`](https://github.com/AIDotNet/OpenDeepWiki/commit/6eb5222d25487362fcd411891fad9027f7840f96), 2026-07-24 | 活躍、成熟度較高；大型 .NET/Next.js 系統 | **有 scheduled incremental update pipeline** | README 未證實 Git-tracked Markdown 的逐 claim citation contract | README 描述資料庫／public docs，不是 repo-local Markdown export contract | 有產品 runtime/tests/web build；不是獨立 Wiki artifact lint | **重**：Docker Compose、SQLite/PostgreSQL、workers、public web/admin/MCP | 未見 page-file exact write set 或 dry-run；主要狀態在 DB/runtime | **適合自架知識服務，不適合可替換檔案候選器** |

### 授權

- LLM Wiki Compiler、Microsoft Deep Wiki、RepoWiki、OpenDeepWiki 均在官方 manifest／project metadata 或 repository license 中宣告 **MIT**。
- [FSoft-AI4Code/CodeWiki](https://github.com/FSoft-AI4Code/CodeWiki) 雖然近期有活動且宣稱 changed-module incremental generation，但 inspected commit [`4c18fac`](https://github.com/FSoft-AI4Code/CodeWiki/commit/4c18face91c6a634a86b3e9aebb1af6c78d66e76) 的 repository metadata 沒有辨識到 license，root tree 也沒有 `LICENSE`。因此它是「公開可讀候選」，不是本研究可推薦採用的 open-source dependency。

## 個別證據與判讀

### 1. ussumant LLM Wiki Compiler protocol

#### 已證實

- [Pinned Codex manifest](https://github.com/ussumant/llm-wiki-compiler/blob/2faf5d951dfbfbbb32294c5edd3e968ca0a55c2f/plugin/.codex-plugin/plugin.json) 宣告版本 `2.1.0`、MIT、Codex compatibility、source backlinks、schema evolution 與 knowledge graph。
- Pinned tree 只有 Markdown commands／skills／protocol、templates、hooks 與 visualization helper，沒有可獨立執行 compile semantics 的 compiler source或 binary。`--dry-run`、incremental 與 output ceiling 是 agent protocol requirements，不是 binary-enforced flags。
- [Pinned compile command](https://github.com/ussumant/llm-wiki-compiler/blob/2faf5d951dfbfbbb32294c5edd3e968ca0a55c2f/plugin/commands/wiki-compile.md) 宣告：
  - no args = changed-topic incremental compile；
  - `--full`；
  - `--topic {slug}`；
  - `--dry-run`，只顯示將編譯內容且不寫檔。
- [Pinned compiler skill](https://github.com/ussumant/llm-wiki-compiler/blob/2faf5d951dfbfbbb32294c5edd3e968ca0a55c2f/plugin/skills/wiki-compiler/SKILL.md) 的 safety rule 是「永不修改 configured output directory 外的檔案」。
- 同一 skill 的正常 write set 包含：
  - `{output}/topics/{slug}.md`
  - `{output}/concepts/{slug}.md`
  - `{output}/schema.md`
  - `{output}/INDEX.md`
  - `{output}/log.md`
  - `{output}/.compile-state.json`
- [Pinned agent-agnostic protocol](https://github.com/ussumant/llm-wiki-compiler/blob/2faf5d951dfbfbbb32294c5edd3e968ca0a55c2f/COMPILE_PROTOCOL.md) 同樣明定 source read-only、所有寫入都在 `output`、`--dry-run` write nothing，並說明 topic/source state 與 support artifacts。
- 首次 compile 會建立 `schema.md`；後續 compile 可自動加入新 topic/concept。這正是它不能擁有 Ron canonical page authority 的原因。
- output 是 plain Markdown；每篇文章有完整 Sources list 與相對連結。`wiki-lint` 可檢查 stale source、orphan、missing cross-reference、low coverage、contradiction 與 schema drift。
- GitHub releases API 沒有正式 release；因此應同時 pin exact commit 與 protocol hash，不能只寫 `v2.1`。

#### 工程推論

- 它是四個候選中最容易放入「candidate staging mirror → diff → allow-list promotion」的引擎，因為 output ceiling、topic selector 與 dry-run 已在公開 contract 中出現。
- 它的「schema is source of truth」只適用引擎內部。Ron integration 必須把 workflow contract 放在其上層，否則自動 topic/concept discovery 會把生成器變成 authority。
- 它的 Sources/backlinks 是 page-level provenance，弱於 Microsoft Deep Wiki 的逐 claim 行號 citation。Ron closeout 必須另設 citation verifier，不能把「有 Sources 區段」等同「每個事實已逐 claim 驗證」。

#### 必須 smoke test

- `--dry-run` 在 codebase mode、`deep_scan: true` 下是否真的 zero-write，包括 state/log/schema。
- `--topic one-page` 是否仍更新 concepts、schema、INDEX、log、state；實際 diff 是否完全可預測。
- source 刪除、rename、topic rename 與 schema drift 是否只 flag、不會重寫未核准 semantic pages。
- 既有 baseline 複製到 task staging 後，relative source links 是否仍正確。
- 同一 source SHA、config hash、engine SHA 是否能得到穩定 page identities 與可審 diff；自然語言內容不必 byte-identical，但 write set 必須 deterministic。
- Ron 所要求的 source citation 是否能達到 `path:line` 或等價 anchor；不足時必須 fail closed，而不是自動接受 file-only backlinks。
- 任何新 concept page、schema row 或 support file都必須先回到 Closeout Preview 重算 write set。

### 2. atomicstrata LLM Wiki Compiler executable

#### 已證實

- [Official release v1.1.0](https://github.com/atomicstrata/llm-wiki-compiler/releases/tag/v1.1.0) 發布於 2026-07-16，release target 是 [`6963a7f`](https://github.com/atomicstrata/llm-wiki-compiler/commit/6963a7f8374282de5d4084a324be69b50f62a32d)；repository 與 package均宣告 MIT。
- [Pinned package](https://github.com/atomicstrata/llm-wiki-compiler/blob/6963a7f8374282de5d4084a324be69b50f62a32d/package.json) 提供 `llmwiki` CLI、SDK/MCP surfaces，要求 Node.js 24 以上。
- [Pinned compile docs](https://github.com/atomicstrata/llm-wiki-compiler/blob/6963a7f8374282de5d4084a324be69b50f62a32d/docs/cli/compile.mdx) 定義 source-hash incremental compile、`compile --review` candidate queue，以及 `refresh --stale --dry-run`。
- [Pinned CI guide](https://github.com/atomicstrata/llm-wiki-compiler/blob/6963a7f8374282de5d4084a324be69b50f62a32d/docs/guides/ci-quality-gates.mdx) 定義 citation coverage、precision、claim-level rate、source utilization 與 fast/full eval thresholds。
- [Pinned source contract](https://github.com/atomicstrata/llm-wiki-compiler/blob/6963a7f8374282de5d4084a324be69b50f62a32d/SOURCES_CONTRACT.md) 要求先把輸入正規化為 `sources/*.md`；編譯引用預設指向這個 corpus與 line ranges，不是直接指向原 repository path + stable symbol。
- [Pinned compile write adapter](https://github.com/atomicstrata/llm-wiki-compiler/blob/6963a7f8374282de5d4084a324be69b50f62a32d/src/compiler/compile-write.ts) 將允許的 concept/query pages批次寫入，但 floor-blocked page 是「skip, not abort」。它沒有 Ron Grant 所需的 exact semantic-path allow-list。

#### 工程推論

- 它比 ussumant protocol更可測、也更適合 deterministic CI/SDK integration，但要先建立 codebase-to-source adapter，並把 `sources/` citation轉回 Ron 的 repository locator contract。
- 它自己的 Configurable Lifecycle Profiles、workflows、templates、connectors與 review authority不可成為第二個 Ron control plane。若評估，只使用 compile/review/status/lint/eval的最小 surface。
- 在 adapter與 exact-path fail-closed gate完成前，直接採用會增加 Node 24、duplicate corpus、compiler state與第二套 lifecycle複雜度，不符合 Ron v1 的 simplicity boundary。

#### 必須 smoke test

- source adapter是否保留 original repository path、stable locator、candidate SHA與 source hash。
- `compile --review`、lint、eval與 refresh在 task staging root之外是否 zero-write。
- floor-blocked或 unexpected page是否由 Ron wrapper把整批判為失敗，而不是沿用 compiler的 skip-not-abort。
- candidate paths是否能完全落在 granted semantic/support sets；profile、workflow、graph、query與 template outputs必須停用。
- 相同 inputs/config/model/protocol能否至少產生 deterministic path set與可審 diff。

### 3. Microsoft Deep Wiki

#### 已證實

- [Pinned plugin manifest](https://github.com/microsoft/skills/blob/4f1db7ec55caf11e3b143c91220bd79a632bc55b/.github/plugins/deep-wiki/.claude-plugin/plugin.json) 宣告 `2.0.0` 與 MIT。
- [Pinned README](https://github.com/microsoft/skills/blob/4f1db7ec55caf11e3b143c91220bd79a632bc55b/.github/plugins/deep-wiki/README.md) 提供 catalogue、single page、full Wiki、VitePress build、deploy、onboarding、`AGENTS.md`、`llms.txt` 等命令。
- [Pinned single-page command](https://github.com/microsoft/skills/blob/4f1db7ec55caf11e3b143c91220bd79a632bc55b/.github/plugins/deep-wiki/commands/page.md) 要求：
  - 每個非 trivial claim 使用 `file:line` citation；
  - remote citation 可連回 GitHub line range；
  - 表格有 Source 欄；
  - 每個 Mermaid diagram 附 source comment；
  - 明確區分 fact、inference 與 unknown。
- 但同一 single-page command沒有定義 target path、output root、現有頁面的更新規則或 `--dry-run`。
- [Pinned full-generate command](https://github.com/microsoft/skills/blob/4f1db7ec55caf11e3b143c91220bd79a632bc55b/.github/plugins/deep-wiki/commands/generate.md) 不只是寫頁面：還會產生 catalogue、onboarding guides、完整 VitePress site、root/wiki `llms.txt`，且可在 root 與多個資料夾建立缺少的 `AGENTS.md`／`CLAUDE.md`。
- [Pinned deploy command](https://github.com/microsoft/skills/blob/4f1db7ec55caf11e3b143c91220bd79a632bc55b/.github/plugins/deep-wiki/commands/deploy.md) 會建立 `.github/workflows/deploy-wiki.yml`、可能調整 `wiki/.vitepress/config.mts`，並可能透過 `npm install` 產生 lockfile。

#### 工程推論

- 它最有價值的資產是 citation/page-writing contract 與 VitePress publication pattern，不是 Ron closeout 所需的 mutation boundary。
- 若日後採用，應只讓它讀取固定 candidate snapshot，並把輸出導向 staging；不能直接執行 full generate/deploy。
- 「single page」不等於「exact one-file write」。在沒有明示 output contract 前，不能把它視為 Ron write-set safe。

#### 必須 smoke test

- single-page command實際寫到哪裡、是否修改 navigation/catalogue/support files。
- 是否能從 workflow 傳入 exact target path 並拒絕任何其他寫入。
- 是否有可驗證的 zero-write preview。
- VitePress build 是否在乾淨 task environment 中只產生 ignored artifacts，不修改 manifest/lockfile。
- path-level maintenance較 repo main branch慢，升級時要檢查 Deep Wiki 子樹 diff，而不是只看 `microsoft/skills` 最新 commit。

### 4. RepoWiki

#### 已證實

- [Pinned README](https://github.com/he-yufeng/RepoWiki/blob/1400cf213e7328d326286be8c95ec7a9107d28e9/README.md) 宣告 MIT，能輸出 Markdown directory、JSON 或 self-contained HTML，且以 SQLite content-hash cache 跳過未變分析。
- 同一 README 明確把「只重新生成 source changed 的 pages」列在 roadmap，表示 pinned 版本尚未提供 Ron 所需的 page-level incremental regeneration。
- [Pinned CLI](https://github.com/he-yufeng/RepoWiki/blob/1400cf213e7328d326286be8c95ec7a9107d28e9/src/repowiki/cli.py) 支援 `--output` 與 `--format`，未見 `--dry-run` 或 page selector。
- [Pinned Markdown exporter](https://github.com/he-yufeng/RepoWiki/blob/1400cf213e7328d326286be8c95ec7a9107d28e9/src/repowiki/export/markdown.py) 每次寫出所有 page files，另寫 `_sidebar.md` 與 `README.md`。
- [Pinned page builder](https://github.com/he-yufeng/RepoWiki/blob/1400cf213e7328d326286be8c95ec7a9107d28e9/src/repowiki/core/wiki_builder.py) 會列出檔案路徑，但沒有建立逐 claim line citation。2026-07-23 的 path:line citation 改善是在 chat answer UI，不應推論成 generated Markdown 已具相同能力。

#### 工程推論

- RepoWiki 的 CLI 與 Markdown export 很適合做「第一次理解 codebase」或人工比較輸出，但 full exporter 行為與缺少 dry-run 使它不適合 Parent closeout。
- content-hash cache 是分析成本最佳化，不是 write-set boundary。

#### 必須 smoke test

- exporter 是否會留下已不存在的舊 page。
- output dir 已存在時的 overwrite／orphan 行為。
- generated Markdown 的 citation accuracy 與 internal links。
- 是否能透過未公開 API 組出 single-page export；在有正式 contract 前不納入 Ron v1。

### 5. OpenDeepWiki

#### 已證實

- [Pinned README](https://github.com/AIDotNet/OpenDeepWiki/blob/6eb5222d25487362fcd411891fad9027f7840f96/README.md) 描述 Git/ZIP/local import、catalog/content generation、public Next.js docs、chat/embed/MCP 與 scheduled incremental workers。
- runtime 需要 SQLite 或 PostgreSQL，官方 quick start 使用 Docker Compose，另有 background workers 與 public/admin web applications。
- README 未提供 repo-local Markdown-directory export、page path selector、exact write-set 或 dry-run contract。

#### 工程推論

- OpenDeepWiki 是「knowledge service/platform」，不是「受控檔案候選生成器」。把它引入 Ron workflow 會同時引入 DB、worker、deployment 與 provider lifecycle，超出目前穩定、Git-tracked Markdown 的需求。
- 它可作未來 portal/MCP layer 的研究對象，但不應持有 canonical Wiki。

#### 必須 smoke test

- 若未來考慮 portal：確認資料可否 lossless export 成 Git-tracked Markdown、stable page IDs、source anchors 與 deterministic navigation。
- 驗證 incremental worker 是 source-to-document refresh，而不是只更新索引／embedding。
- 驗證完整 backup/restore、provider migration 與離線重建；這些不是 Ron v1 的必要工作。

## 建議的 Ron closeout 生成流程

### 1. Workflow 先建立 authority

`setup-ron` 只建立／驗證 `docs/agents/ron-workflow.md` 的 Wiki contract 與 engine pin；不生成 reviewed Wiki baseline。首次 baseline 必須是獨立、明確核准的 Parent 或 Standalone closeout。

### 2. Closeout Preview 固定輸入與允許輸出

Preview 至少綁定：

- target/lane/candidate SHA
- source snapshot hash
- Ron Wiki contract hash
- engine repository、commit、protocol hash
- exact `wiki_semantic_write_set`
- configured `wiki_support_write_set`
- task-local staging path
- dry-run、lint、citation、link、build commands
- 明確排除 publish、deploy、root agent files、manifest/lockfile mutation

### 3. 在 staging mirror 執行 engine

1. 複製 reviewed Wiki baseline到 task-specific staging directory。
2. 生成 task-local adapter config，使 `output` 指向 staging，而不是 canonical root。
3. 先執行 `--dry-run`；解析 planned topics 與 support artifacts。
4. planned set 超出 Grant 時停止並重新 preview，不自行縮寫或偷偷忽略。
5. 只在 planned set 合法時執行 `--topic` 或最窄可行 compile。

### 4. Workflow 比較與提升候選

1. 對 staging baseline 前後做 path-level diff。
2. 將每個 path分類為 semantic、support、unexpected。
3. unexpected 必須 fail closed；新 topic/concept 不能因引擎認為合理就自動加入。
4. 驗證每個 claim 的 citation anchor、source existence、internal links、navigation、Wiki lint 與 configured build。
5. 只把核准 path 的 diff提升到 integration candidate。
6. 任何 repair 產生新 candidate SHA，舊 review evidence 失效。
7. 不在此流程執行 deploy；GitHub Pages、VitePress publication 或 portal sync 必須是另一個明確 capability。

## 採用前的最小 compatibility suite

要把任一 LLM Wiki Compiler 從「研究候選」升級為「Ron verified dependency」，至少要在 temporary repository 跑完：

| 測試 | 成功條件 |
| --- | --- |
| Missing config | 停止且 zero-write |
| Dry run | repo、staging、state/log 均 zero-write |
| One changed source | 只出現核准 topic 與預先列出的 support artifacts |
| Unexpected concept | closeout 停止，不提升 candidate |
| Source rename/delete | 不產生 silent orphan、錯誤 citation 或未核准刪除 |
| Citation verifier | 錯誤 path/line、missing source、file-only citation 均被攔截 |
| Repeatability | 相同 engine/config/source hashes 得到相同 path set |
| Output ceiling | output 外任何 write 都使測試失敗 |
| Dirty-tree protection | unrelated dirt 完全不被 stage、rewrite 或 normalize |
| Build isolation | build artifacts ignored/temporary；manifest、lockfile 不變 |
| Engine upgrade | upstream diff review、manifest/protocol hash change與全 suite重跑 |

在 suite 完成前，正確 proof state 是：

> **已完成研究選型與 pinned-source review；尚未安裝、尚未建立 Wiki baseline、尚未完成 engine compatibility smoke test。**

## 最終建議

採用以下 v1 邊界：

- **Authority：** Ron workflow + human approval + Git-tracked reviewed Wiki baseline。
- **Operational contract：** `docs/agents/ron-workflow.md` 中的 Wiki設定與 policy references。
- **Generation authority：** 經批准的 Wiki bootstrap Change Spec；baseline ready 後由 reviewed `wiki/index.md` 表示目前 page map。
- **Derived adapter：** `.wiki-compiler.json` 或 task-local等價設定；永遠不是 authority。
- **v1 generation protocol：** 以 `ussumant/llm-wiki-compiler` `2.1.0` 的 `COMPILE_PROTOCOL.md` 作 pinned參考，pin `2faf5d951dfbfbbb32294c5edd3e968ca0a55c2f` 與 protocol hash；由 Ron `/wiki` wrapper強制 authority與 write-set rules，不安裝其 hooks或其他命令。
- **Executable engine：** v1 不先指定；另開 compatibility Issue評估 `atomicstrata/llm-wiki-compiler` v1.1.0／`6963a7f8374282de5d4084a324be69b50f62a32d`，通過 source-locator adapter與 exact-path suite後才可啟用。
- **Generation lane：** Parent/Standalone closeout only；Leaf read-only。
- **Mutation model：** staging mirror → diff → allow-list promotion。
- **Citation standard：** 採 Microsoft Deep Wiki 的逐 claim `path:line` 思路作 Ron verifier 標準；不因此執行 Deep Wiki full generator。
- **Publication：** v1 不自動 deploy；Microsoft Deep Wiki/VitePress 或 OpenDeepWiki portal 留作獨立、可替換的 derived layer。

這個組合先以最小、可審查的 protocol reference建立 Ron v1，不把 Markdown prompt誤報為 executable engine；同時保留未來用真正 compiler自動化的驗證路徑。

## 研究限制

- Exa/MCP 路徑因本機缺少 `mcporter` 無法使用。背景查核先使用 Jina/web discovery；主代理其後以可用的 GitHub CLI/API重新驗證 repositories、pinned raw source、commits與 releases。
- `agent-reach check-update` 已確認本機版本 `v1.5.0` 是最新版本。
- 本研究沒有安裝或執行任何候選引擎，因此 runtime behavior 一律留在 smoke-test gate，不把 README/command contract 說成已在 Ron repo 實測。
- Repo 在研究前已有大量 unrelated dirt；本次只新增本文件，未修改 manifest、skill、Wiki config 或其他現有檔案。
