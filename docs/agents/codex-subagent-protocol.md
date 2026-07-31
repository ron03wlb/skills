# Codex 子代理協作規約

**狀態：** 已由 Ron skills 採用於本地工作樹；尚未安裝、提交或發布。實際行為仍由各 skill 的 routing 與 enforcement steps 定義。

## 目標

將 Matt-first workflow 的背景／平行代理意圖對應至 Codex 協作流程，同時避免把日常工作變成代理群。協調代理保留產品決策、授權、儲存庫權限、外部操作與最終驗證；子代理只接收邊界清楚且可獨立產生價值的任務。

本規約是 `execute-issue`、`close-issue` 與 `explain-decision` 共用的靜態 Subagent Policy。產品的 Matt Change Spec 與每次委派的動態 Subagent Task Brief 不屬於本文件。

## 名詞

- **協調代理**：執行面向使用者 skill 的 Codex 代理，擁有計畫、使用者溝通、外部操作與最終結果。
- **子代理**：由協調代理以 `spawn_agent` 啟動的 Codex 協作代理。
- **擁有者**：唯一可以寫入指定檔案或 Git 工作樹的代理；唯讀子代理不擁有任何工作區檔案。
- **產物**：子代理回傳的明確成果，例如發現、附引用的研究筆記、介面提案，或在其指定工作樹中完成的實作。
- **Subagent Task Brief**：由目前 Issue Context Packet 產生的動態委派契約；它不是產品 spec，也不是授權來源。
- **Wave**：一組可安全並行、共享同一同步障礙的子代理工作。

## 委派條件

協調代理只有在下列條件全部成立時才委派：

1. 任務有明確邊界，且不需要人類做決策就能推進。
2. 即使其他子代理延遲或失敗，其結果仍具獨立價值。
3. 任務說明明確指定產物與具體驗收檢查。
4. 寫入範圍為空，或只由該子代理專屬擁有。
5. 預期的時間或上下文收益高於委派與驗收成本。

不得委派 grilling、產品選擇、核准請求、Issue tracker 更新、target merge、最終驗收、cleanup、需求不明確的工作，或一行即可完成的本地修改。子代理不得代替使用者回答應由使用者決定的問題。

## 委派契約

每個 `spawn_agent` 任務說明都必須載明：

- **目標**：一個具體問題或交付成果。
- **範圍**：Issue、Grant、Wave、artifact、candidate SHA、相關路徑、版本參照、輸入，以及已確認的事實。
- **擁有權**：`read-only`、一個指定產物檔案，或一個指定工作樹與檔案集合。
- **限制**：不得修改無關內容、不得 reset/revert、不得揭露機密，且未獲明確授權不得產生外部狀態變更。
- **證據**：完成時必須提供的精確指令或來源參照。
- **回傳格式**：先列發現，接著是路徑／行號參照、執行過的檢查，以及尚存的不確定性。

協調代理必須告知可寫入的子代理：儲存庫中可能有其他代理同時工作，不得覆寫或 revert 他們的變更。

## 並行與生命週期

- 保留一個協調代理名額。最多同時執行 `可用並行名額 - 1` 個子代理。
- 只平行執行真正獨立的任務。使用 `wait_agent` 等待完成；只可用 `followup_task` 釐清既有的有界任務。
- 禁止 nested delegation。子代理不得再建立自己的子代理。
- 子代理執行期間，協調代理應繼續進行其他獨立的本地工作，不應反覆回報無變化的等待狀態。
- 子代理回報失敗、過期或不完整，表示沒有可用結果，而不是原始任務不可能完成。協調代理可縮小範圍後重試一次、自行完成，或回報尚未排除的限制。
- 子代理輸出只是協調代理的輸入，不是最終事實。協調代理必須閱讀引用來源或差異，並在回報成功前執行所聲稱的聚焦檢查。
- Grant、artifact hash、baseline 或 candidate SHA 改變時，必須中止相關代理並丟棄 stale results。
- 不得平行實作不同 Leaf Issues，也不得預先實作下一個 Issue。

## Agent Orchestration State Machine

四個可用名額中固定保留一個給協調代理，其餘名額依 Wave 使用：

| Wave | 代理配置 | 同步障礙 |
| --- | --- | --- |
| Preflight | 最多三個獨立的唯讀代理 | 必要事實與附引用產物已回傳。 |
| Implementation | 一個可寫入 worker；最多兩個不讀取 mutable diff 的唯讀代理 | 可寫入 ownership 維持唯一。 |
| Review | 固定 `candidate_sha` 後，執行 Issue Grant 指定的 focused 或 full profile | 所有適用軸線都針對相同 SHA。 |
| Repair | 唯一可寫入擁有者 | 每次修改都產生新的 `candidate_sha`。 |
| Re-review | 受影響軸線；高風險變更重跑全部軸線 | 不接受指向舊 SHA 的證據。 |
| Finalize | 僅協調代理 | commit、tracker、integration、verification、cleanup 依序通過。 |

每個委派都必須綁定 `wave_id`、`issue_id`、`grant_id`、適用時的 `candidate_sha`、ownership、model 與 reasoning effort。

不得為填滿名額而建立代理。Focused Leaf review 由一個 fresh reviewer 分開回報 Standards 與 Spec，僅在 Wiki 適用時增加 Wiki reviewer；full review 將所有適用軸線分開委派。Parent 或 Standalone 的 Target Integration Candidate 一律使用 full profile。缺少 Spec 或 Wiki 軸線時明確略過，不得虛構。Reviewer 衝突由協調代理檢查證據，不採多數決。

## 模型路由

模型以子代理角色定義，而不是寫入每個 skill 的 `agents/openai.yaml`。後者只負責使用者介面 metadata、呼叫政策與工具依賴；它不應承載模型設定。

| 子代理工作 | 預設模型 | 推理強度 | 原因 |
| --- | --- | --- | --- |
| `research`、`wayfinder` 的研究決策 | `gpt-5.6-terra` | `medium` | 大量閱讀與一手來源整理，需要速度與足夠的判讀能力。 |
| `improve-codebase-architecture` 的探索代理 | `gpt-5.6-terra` | `medium` | 以唯讀程式碼探索、路徑追蹤與摘要為主。 |
| Ron Standards／Spec／Wiki 審查 | `gpt-5.6-sol` | `high` | 需要比對固定候選、驗證主張並辨識行為風險。 |
| `codebase-design` 的 Design It Twice 提案 | `gpt-5.6-sol` | `high` | 需要在介面深度、局部性與接縫之間做有根據的取捨。 |
| `execute-issue` 的隔離工作樹執行代理 | `gpt-5.6-sol` | `high` | 需要多步實作、測試與失敗後修正。 |
| `explain-decision` 的決策說明 sidecar | `gpt-5.6-sol` | `high` | 需要以最小輸入比較選項、後果與可逆性。 |

協調代理保留目前主對話的模型與推理強度，負責使用者決策、跨子代理整合及最終驗收。

第一版在每次 `spawn_agent` 明確指定 `model` 與 `reasoning_effort`，不依賴尚未建立的 `.codex/agents/`。概念角色由 Task Brief、ownership 與驗收定義。

若指定模型不在目前 Codex 環境可用清單中，協調代理必須在啟動前改用已核准的預設模型，並於最終結果說明；不得無聲地改變工作類型或推理強度。只有因成本、延遲或任務風險而偏離此表時，才可在該次委派明確覆寫，並說明理由。

不要為了使用 `low` 而委派瑣碎工作；那類工作應維持 inline。`xhigh`、`max` 與 `ultra` 只在具名高風險或 `high` 無法解決的爭議下覆寫，且必須記錄理由。

## 寫入隔離

Codex 子代理共用儲存庫檔案系統。因此，除非每個可寫入代理都有專屬工作樹與指定檔案擁有權，否則禁止平行修改原始碼。

- **唯讀工作**：不得修改檔案。適用於調查、審查與架構探索。
- **研究筆記**：一個子代理可專屬擁有一個事前約定的筆記路徑；不得修改產品原始碼、skill 檔案或議題追蹤器狀態。
- **實作**：只在協調代理選定目標版本並建立隔離工作樹後進行。執行代理只能在該工作樹工作，且只擁有該 Issue 指定的路徑。協調代理必須保留無關的未提交工作，並在獨立審查後才整合。

若無法隔離，僅使用一個可寫入代理。不得以寬泛 Git 清理掩蓋共用工作區的衝突。

## 協調代理必要驗收

在接受產物前，協調代理需於最高適當接縫驗證主張：

- **發現**：開啟引用檔案，確認描述的路徑或差異。
- **研究**：檢查來源網址／引用，確認筆記只回答一個連貫問題，且沒有無依據的結論。
- **審查**：逐一對照固定的 candidate SHA，並分開保留 Standards、Spec 與 Wiki 發現。
- **實作**：檢查差異，執行聚焦測試或建置檢查，然後進行既有的最終審查步驟。

所有面向使用者的結論、commit、push、Issue 更新，以及破壞性或外部操作都由協調代理負責。

## Skill 對應

### `research`

委派一個有界的研究子代理。它使用一手來源，且只擁有附引用的 Markdown 產物。協調代理可繼續進行無關的探索，完成後必須讀取筆記，才能在設計或規劃中使用它。

### Ron review orchestration

Ron 流程沿用 Matt `code-review` 的 Standards 與 Spec 概念，但不直接呼叫原始 skill。原始 skill 沒有 Wiki 權威、Ron 模型路由、candidate invalidation 或 Target Integration Candidate 契約。

在固定一個非空差異並定位可用的規範／規格／Wiki 來源後，依 Grant 的 review profile 委派：

1. **規範**：儲存庫既有的程式規範，加上 Fowler 程式碼異味基準。
2. **規格**：需求覆蓋、範圍膨脹，以及看似已實作但實際不正確的行為。
3. **Wiki**：目前業務基線是否被正確保留、明確覆寫或需要 reconciliation。

Focused profile 允許一個 fresh reviewer 分開回報前兩軸；full profile 各自委派，且 Parent／Standalone 最終候選必須 full。每個子代理以 candidate SHA 證據回報，內容不超過 400 字。若不存在某個權威來源，不得虛構該軸線。協調代理驗證後，必須分開呈現適用軸線。

每個 Repair Grant 必須明確綁定整數 `max_material_repair_waves`，範圍為 1 到 10，以及目前的 `repair_wave`；candidate 不得超過該 Grant 的上限，且提高 workflow ceiling 不得回溯放寬既有 Grant。每次修改都產生新 SHA 並使舊結果失效；高風險修復重跑 full profile。達到授權上限後仍有 material finding，或 finding 顯示 Spec、seam、Issue sizing 有問題時，寫 checkpoint 並停止。

### `improve-codebase-architecture`

協調代理選定範圍並讀取相關領域資料後，委派一個唯讀探索代理。探索代理回報可深化的候選項目、受影響路徑、觀察到的摩擦，以及刪除測試推理。協調代理擁有 HTML 報告與後續所有對使用者的 grilling。

### `codebase-design` — Design It Twice

協調代理說明限制後，最多平行委派三個唯讀設計子代理。為每個子代理給予刻意不同的最佳化目標：最小介面、最常見呼叫端或彈性。它們只回傳提案；協調代理依深度、局部性與接縫位置比較。子代理不得修改產品原始碼。

### `wayfinder`

每個未被阻擋且不需使用者互動的研究決策，都可依相同產物擁有權規則委派 `research` 子代理。需要使用者互動的決策保留在協調代理與使用者的對話中。地圖尚在解決決策時，不得建立平行實作代理。

### `execute-issue`

預設由單一協調代理直接實作。只有議題已完整指定，且隔離工作樹擁有權能實質保護既有工作或啟用真正獨立的垂直切片時，才使用執行子代理。委派前，協調代理記錄目標版本、工作樹路徑、擁有的路徑、驗收條件與整合檢查。`tdd` 與已核准的 focused/full review 仍是必要流程；執行子代理的自我回報不可取代其中任何一項。`execute-issue` 只提交並寫入 `implemented_on_lane` 證據，不改變 Issue closure state。

### `close-issue`

Leaf mode 只驗證 commit、review、evidence 與 clean Lane，再關閉並 read back；不合併 target 或更新 Wiki。

Parent／Standalone mode 先由協調代理機械式建立並驗證綁定 Lane SHA、target SHA、Wiki write sets、task staging、驗證命令、能力、完整排除項與 bounded repair envelope 的 Closeout Preview。Standalone綁定自己的contract與Issue Grant；沒有executable contract的Parent改綁ordered child-contract aggregate與aggregate evidence。若human root完整涵蓋exact inputs，協調代理直接由該root派生並read back non-delegating sibling Closeout Grant後繼續；不得由derived Issue Grant再委派。否則只呈現精簡的授權停止點並請使用者回答一次 `同意`。`target_refresh`固定為`denied`；任何target drift使root、Preview與derived Grants失效並停止請人類決斷。Grant read-back 後，協調代理完成 Wiki reconciliation 與 Target Integration Candidate 建立。候選固定後，以 full profile 重新對焦所有適用軸線。Wiki-only finding必須先取得bounded human repair Grant，才可在核准write sets內修正；code/test finding必須先取得人類授權，才建立新的Repair Leaf。通過後才fast-forward target，並由協調代理完成target verification、Issue更新與worktree cleanup。

### `explain-decision`

只在使用者要求理解當前未決選項時建立一個 fresh read-only sidecar。它只接收最小 Decision Explanation Packet，並回傳約 300 字的 Decision Card。詳細內容可寫到 `/private/tmp`；不得修改 spec、Issue、CONTEXT、ADR 或授權狀態。

### 保持由協調代理主導的 Matt skills

`grill-with-docs`、`grilling`、`to-spec`、`to-tickets`、`tdd`、`diagnosing-bugs` 與 `handoff` 維持由協調代理主導。它們可以使用已完成的產物，但不會自動建立子代理。特別是 `handoff` 只寫入脈絡文件；除非使用者明確要求，否則不會建立使用者擁有的 Codex task。

## 採用檢查表

當自訂 skill 採用本規約時：

- 將特定執行環境的 `Agent`／`Task` 描述改為適用的 Codex 操作與本契約。
- 保留 Matt flow 的核心限制；委派不能變成新的決策者。
- 清楚說明子代理是唯讀或擁有產物／工作樹。
- 補上各 skill 專屬的證據與最終協調代理檢查。
- 只有在使用者可見流程改變時，才更新該 skill 的面向使用者文件 `docs/<bucket>/<skill>.md` 與 `ask-matt`。

## 已確認的首批採用範圍

1. 新增 `setup-ron`
2. 新增 `ask-ron`
3. 新增 `to-spec-ron`
4. 新增 `to-tickets-ron`
5. 新增 `execute-issue`
6. 新增 `close-issue`
7. 新增 `explain-decision`
8. 新增 `wiki`
9. 同步 promoted-skill docs、READMEs、plugin manifest 與 `ask-matt`

上述實作已獲授權並由八個 Ron skills 採用。原始 Matt skills 不承載 Ron 的授權或 closeout 行為；唯一的上游流程變更是 `ask-matt` 的 Ron route 指標。此採用沒有新增通用 agent framework、Codex plugin、安裝、推送或發布動作。包含本段的本機 commit 是 bounded repair proof；在該 commit 存在前只能稱為已授權且通過本機驗證的 candidate。
