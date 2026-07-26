# Nimbalyst 作為 Ron Canonical Wiki 的適配性評估

狀態：研究結論；建議已於2026-07-26接受
日期：2026-07-26

## 問題

[`Nimbalyst/nimbalyst`](https://github.com/Nimbalyst/nimbalyst) 是否適合取代或承擔 Ron Canonical Wiki 的儲存、生成、維護、搜尋、審查或發布？

## 結論

**不適合當 Ron Canonical Wiki engine、生成器、維護 authority 或 publication layer。**

Nimbalyst 適合的角色是：

1. **Conditional authoring UI**：在 task-specific worktree 內視覺化閱讀、編輯與檢視 Markdown diff；
2. **Conditional derived retrieval layer**：以 Nimbalyst Memory 對 Canonical Wiki 建立可刪除、可重建的唯讀搜尋索引。

它不能取代 Ron 的 `/wiki bootstrap`、Change Spec、exact write set、Parent／Standalone closeout、claim-to-source validation、CI 或 deterministic publication。Ron v1 不應把 Nimbalyst 列為必要依賴。

## Evidence boundary

本評估核對：

- latest stable release：`v0.70.5`，source commit `37dde3be1089f1dedb09fada954120aeddb97a89`；
- latest prerelease：`v0.71.0`，source commit `378aaf4762cda21f4e7f28325dae5c94757d40ae`；
- main snapshot：`3cebae0c0361163603921f066de9cc432d4abd9e`；
- upstream README、Markdown policy、Git／file-watching文件、CLI、Memory engine、license與 source tree。

沒有安裝或執行 Nimbalyst binary，沒有做 Markdown round-trip smoke test，也沒有驗證其外部 collaboration sync server。因此 UI/runtime 行為仍需獨立 compatibility Issue 才能升級為 verified。

## Ron contract fit

| Ron requirement | Nimbalyst evidence | Fit |
| --- | --- | --- |
| Repo-local Git-tracked Markdown是唯一 authority | 官方宣稱內容與狀態使用 Markdown／plain files；Markdown policy明定 Markdown是 single source of truth | **Pass at storage/editor layer** |
| 依 business topic生成初始 Wiki主規格 | 沒有 repository-to-topic inventory或 Canonical Wiki bootstrap contract | **Fail** |
| Page contract與 material claim mapping | 沒有 Wiki page schema或逐 claim `[S1]` mapping validator | **Fail** |
| Source locator指向 code／tests／config | Memory search hit只有 `sourcePath#heading`，且核心用途是索引 Markdown | **Partial, insufficient** |
| Zero-write preview與 exact-path ceiling | 視覺 diff發生在檔案變更後；沒有 Wiki generation dry-run或 granted-path fail-closed contract | **Fail** |
| Staging／worktree隔離 | 有 worktree與 Git status／diff支援 | **Partial** |
| Leaf read-only、Parent／Standalone closeout-only | Nimbalyst允許一般 editor與 agent直接寫檔，沒有 Ron Issue角色或 Grant模型 | **Fail without Ron wrapper** |
| CI validate-only | upstream CI驗證 Nimbalyst本身；沒有 consumer Wiki lint／citation／navigation contract | **Fail** |
| Wiki navigation、backlinks與graph | `Wiki Links / Backlinks`、Graph與Dataview仍列在 extension ideas | **Fail in current stable** |
| Deterministic site／portal publication | Nimbalyst是 desktop workspace，不是 Canonical Wiki static-site compiler | **Fail** |
| Derived、rebuildable search index | Memory engine使用可重建 SQLite shadow index、incremental hash與 path／heading citation | **Conditional pass** |
| 不讓搜尋層改寫 authority | app extension同時註冊 `remember`、`delete_fact`與distillation surface | **Fail by default; can be isolated** |
| Offline／self-contained | local files可離線；Memory engine有 local embedder，但 app integration固定要求 configured OpenAI key | **Partial** |
| 完整開源協作堆疊 | desktop repository是MIT；collaboration sync server是另一個專案，不在本 repository | **Partial** |

## Confirmed strengths

### Markdown與Git互通

Nimbalyst的核心方向與 Ron相容：

- Markdown文字是 canonical representation；
- 文件保存在磁碟或Git，不必鎖在專有資料庫；
- Git status可感知外部 CLI與其他工具的變更；
- AI edits可用 red／green視覺 diff檢視；
- 支援 worktree。

這使它比 database-first Wiki platform更適合作為**可選 editor**。

### Rebuildable retrieval

Nimbalyst Memory具有：

- heading-aware Markdown chunks；
- SHA-256 incremental dirty check；
- BM25與embedding hybrid retrieval；
- `sourcePath`與完整 `headingPath`；
- machine-local、可刪除重建的 SQLite shadow index；
- MCP search、expand與read tools。

這符合「derived search output不能成為 authority」的方向，但不等於 Wiki生成或 citation validation。

### License與維護活性

desktop repository採 MIT License，stable與prerelease持續發布，main CI在本次查證的固定 snapshot成功。這證明專案活躍，但0.x快速發布也表示整合必須 pin exact version並做 compatibility smoke test。

## Blocking gaps

### 它不是 Wiki compiler

Repository-wide `wiki`搜尋只找到未實作的 knowledge-management extension ideas與一般 Wikipedia測試資料。沒有證據顯示 Nimbalyst能：

- 從 code／tests推導 business topics；
- 建立或更新 Wiki page inventory；
- 判斷 semantic write set；
- 處理 rename／delete／orphan pages；
- 驗證逐 claim來源；
- 產生 deterministic Wiki build。

### Nimbalyst review state不能當 Ron review proof

Git integration會在偵測 commit後自動把對應 pending AI edits標記為 reviewed。這是 Nimbalyst UI bookkeeping，不是 Ron Standards／Spec／Wiki review，也不能取代固定 `integration_candidate_sha`的三軸審查。

### Rich editor可能製造 incidental diff

官方 Markdown policy允許 editor normalize whitespace、list markers與table alignment；enhanced transformer也會標準化 list indentation並對部分字元重新編碼。Raw HTML不一定能在rich editor中編輯。

因此在沒有 no-op open／save round-trip proof前，不應讓 Nimbalyst直接寫 target branch的 Canonical Wiki。

### Memory extension預設不符合 read-only boundary

stable版 Memory engine：

- package標記為 `private: true`，尚不是可直接依賴的 standalone release；
- app預設索引 `design/`、`docs/`、plans、`CLAUDE.md`與 facts，不包含 Ron `wiki/`；
- app backend使用OpenAI embedder；
- 除search／read外，也暴露新增與刪除 durable facts的工具；
- facts預設寫入 `nimbalyst-local/voice-memory/`。

直接啟用會增加未授權 write surfaces，不能視為 Ron `/wiki audit`或 CI。

### Collaboration不是完整自架開源方案

官方README與licensing文件明載 collaboration sync server是另一個專案。不能從desktop repository的 MIT License推論完整team-sync backend也已開源或可self-host。

## Recommended role

### Ron v1

不採用 Nimbalyst作必要元件，也不改變既有完整方案：

```text
repo Markdown authority
  -> Ron /wiki + Issue/Grant/closeout control plane
  -> optional generator patch
  -> validation-only CI
  -> separately authorized publication
```

Nimbalyst保持在流程外，最多作人類自行選擇的Markdown viewer。

### Future optional authoring compatibility Issue

若 Ron想使用視覺化editor，另開一個小型 compatibility Issue，固定 `v0.70.5`並在temporary repository驗證：

1. no-op open／save不得產生diff；
2. frontmatter、relative links、tables、nested lists、code fences與Mermaid可round-trip；
3. 只開啟task worktree，不開啟local target；
4. AI edit只能觸及granted paths；
5. commit後的Nimbalyst reviewed狀態不被當成Ron review；
6. 關閉auto-commit、team sharing與任何write-capable Memory tools；
7. 不新增 `nimbalyst-local/`、sync metadata或其他unexpected paths。

通過後只能記為：

```yaml
wiki_authoring_ui:
  provider: nimbalyst
  required: false
  authority: none
```

### Future optional retrieval compatibility Issue

若只需要AI快速搜尋Wiki，評估抽離 Nimbalyst Memory engine，而不是把整個desktop app當Wiki：

- pin exact source SHA；
- sources只包含 `wiki/**/*.md`；
- SQLite放repo外；
- 只暴露`search_project_knowledge`、`expand`、`read_doc`、`status`與rebuild/index；
- 不暴露`remember`、`delete_fact`、distill或tracker/session virtual records；
- 優先驗證local embedder；
- index failure或staleness不得改變Canonical Wiki proof state。

這仍是derived retrieval candidate，不是Ron v1必要條件。

## Decision

| Proposed use | Decision |
| --- | --- |
| 取代 repo-local Canonical Wiki | **Reject** |
| 取代 `/wiki` skill或Ron closeout flow | **Reject** |
| 取代 Wiki generator/compiler | **Reject** |
| 作 deterministic publication layer | **Reject** |
| 作 task-worktree Markdown authoring UI | **Conditional, separate Issue** |
| 作 read-only derived retrieval index | **Conditional, separate Issue** |

## Primary sources

- [README at assessed main snapshot](https://github.com/Nimbalyst/nimbalyst/blob/3cebae0c0361163603921f066de9cc432d4abd9e/README.md)
- [Markdown compatibility policy](https://github.com/Nimbalyst/nimbalyst/blob/37dde3be1089f1dedb09fada954120aeddb97a89/MARKDOWN_COMPATIBILITY.md)
- [Markdown transformer architecture](https://github.com/Nimbalyst/nimbalyst/blob/37dde3be1089f1dedb09fada954120aeddb97a89/packages/runtime/src/editor/markdown/README.md)
- [Git integration and commit review bookkeeping](https://github.com/Nimbalyst/nimbalyst/blob/3cebae0c0361163603921f066de9cc432d4abd9e/docs/GIT_INTEGRATION.md)
- [File watching, diff and worktree behavior](https://github.com/Nimbalyst/nimbalyst/blob/3cebae0c0361163603921f066de9cc432d4abd9e/docs/FILE_WATCHING_AND_CHANGE_TRACKING.md)
- [Knowledge-management features listed as extension ideas](https://github.com/Nimbalyst/nimbalyst/blob/37dde3be1089f1dedb09fada954120aeddb97a89/design/Extensions/extension-ideas.md)
- [Nimbalyst Memory overview](https://github.com/Nimbalyst/nimbalyst/blob/37dde3be1089f1dedb09fada954120aeddb97a89/packages/extensions/nimbalyst-memory/README.md)
- [Memory engine contract](https://github.com/Nimbalyst/nimbalyst/blob/37dde3be1089f1dedb09fada954120aeddb97a89/packages/extensions/nimbalyst-memory/engine/README.md)
- [Private Memory engine package manifest](https://github.com/Nimbalyst/nimbalyst/blob/37dde3be1089f1dedb09fada954120aeddb97a89/packages/extensions/nimbalyst-memory/engine/package.json)
- [Memory app backend and default write surfaces](https://github.com/Nimbalyst/nimbalyst/blob/37dde3be1089f1dedb09fada954120aeddb97a89/packages/extensions/nimbalyst-memory/src/backend.ts)
- [CLI scope](https://github.com/Nimbalyst/nimbalyst/blob/37dde3be1089f1dedb09fada954120aeddb97a89/packages/cli/README.md)
- [MIT license](https://github.com/Nimbalyst/nimbalyst/blob/37dde3be1089f1dedb09fada954120aeddb97a89/LICENSE)
- [Collaboration server licensing boundary](https://github.com/Nimbalyst/nimbalyst/blob/37dde3be1089f1dedb09fada954120aeddb97a89/LICENSING.md)
- [Stable release v0.70.5](https://github.com/Nimbalyst/nimbalyst/releases/tag/v0.70.5)
- [Prerelease v0.71.0](https://github.com/Nimbalyst/nimbalyst/releases/tag/v0.71.0)
