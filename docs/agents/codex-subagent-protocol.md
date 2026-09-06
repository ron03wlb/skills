# Codex 子代理協作規約

**狀態：** 已由 repo-linked 本機 skills 採用。這只代表本地來源與安裝連結；commit、push、release 與發布仍是分開的證明狀態。實際行為仍由各 skill 的 routing 與 enforcement steps 定義。

## 目標

將 Matt-first workflow 的背景／平行代理意圖對應至 Codex 協作流程，同時避免把日常工作變成代理群。協調代理保留產品決策、授權、儲存庫權限、外部操作與最終驗證；子代理只接收邊界清楚且可獨立產生價值的任務。

本規約是 `execute-issue`、`close-issue` 與 `explain-decision` 共用的靜態 Subagent Policy。產品的 Issue／linked Spec 與每次委派的動態 Subagent Task Brief 不屬於本文件。

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
- **範圍**：Issue、linked Spec、Wave、artifact、candidate SHA、相關路徑、版本參照、輸入，以及已確認的事實。
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
- baseline 或 candidate SHA 改變時，必須中止相關代理並丟棄 stale results。
- 單一 Issue invocation 不延伸至其他 Issue；有效 Run Grant 可依各 Issue 專屬 task／worktree 並行執行。

## Agent Orchestration State Machine

四個可用名額中固定保留一個給協調代理，其餘名額依 Wave 使用：

| Wave | 代理配置 | 同步障礙 |
| --- | --- | --- |
| Preflight | 最多三個獨立的唯讀代理 | 必要事實與附引用產物已回傳。 |
| Implementation | 一個可寫入 worker；最多兩個不讀取 mutable diff 的唯讀代理 | 可寫入 ownership 維持唯一。 |
| Review | 固定 `candidate_sha` 後，執行既有 Matt `code-review` 的 Standards 與 Spec 軸線 | 所有適用軸線都針對相同 SHA。 |
| Repair | 唯一可寫入擁有者 | 每次修改都產生新的 `candidate_sha`。 |
| Re-review | Issue execution 完整重跑 Standards 與 Spec；其他流程依其契約重跑適用軸線 | 不接受指向舊 SHA 的證據。 |
| Finalize | 僅協調代理 | 最終 evidence、tracker、integration、verification、cleanup 依序通過。 |

每個委派都必須綁定 `wave_id`、`issue_id`、適用時的 `candidate_sha`、ownership、model 與 reasoning effort。

不得為填滿名額而建立代理。`execute-issue` 直接呼叫既有 Matt `code-review`，由它分開回報 Standards 與 Spec。`close-issue` 消費 unchanged candidate 的 execution review；候選修復仍由 `execute-issue` 擁有。獨立 `/wiki` 使用自己的 semantic review，不加入 Issue code review。Reviewer 衝突由協調代理檢查證據，不採多數決。

## 模型路由

模型以子代理角色定義，而不是寫入每個 skill 的 `agents/openai.yaml`。後者只負責使用者介面 metadata、呼叫政策與工具依賴；它不應承載模型設定。

| 子代理工作 | 預設模型 | 推理強度 | 原因 |
| --- | --- | --- | --- |
| `research`、`wayfinder` 的研究決策 | `gpt-5.6-terra` | `medium` | 大量閱讀與一手來源整理，需要速度與足夠的判讀能力。 |
| `improve-codebase-architecture` 的探索代理 | `gpt-5.6-terra` | `medium` | 以唯讀程式碼探索、路徑追蹤與摘要為主。 |
| Issue Standards／Spec 審查與獨立 Wiki semantic review | `gpt-5.6-sol` | `high` | 需要比對固定候選、驗證主張並辨識行為風險。 |
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
- **審查**：逐一對照固定的 candidate SHA；Issue code review 分開保留 Standards 與 Spec，獨立 Wiki review 則只保留 semantic findings。
- **實作**：檢查差異，執行聚焦測試或建置檢查，然後進行既有的最終審查步驟。

所有面向使用者的結論、commit、push、Issue 更新，以及破壞性或外部操作都由協調代理負責。

## Skill 對應

### `research`

符合委派條件時，由一個有界研究子代理使用一手來源，且只擁有附引用的 Markdown 產物；協調代理同時進行有用的獨立工作。否則由目前代理直接完成。完成後必須讀取來源與筆記，才能在設計或規劃中使用它。

### Issue review orchestration

`execute-issue` 直接使用既有 Matt `code-review`，不維護另一套 reviewer profile。固定 candidate 後，Standards 與 Spec 兩軸必須都沒有經協調代理確認的 finding。高風險 review 保留獨立 reviewer 證據；低風險 requested review 可單一代理分別執行適用軸線。

`execute-issue` 的同一 Issue operation 跨 invocation 最多進行十個 material repair waves。每個 wave 修正所有已確認且仍在 Issue 或 linked Spec 範圍內的 finding、執行受影響驗證、建立新 candidate，然後完整重跑 Matt `code-review`。工具失敗、重複 finding 與不受證據支持的 finding 不計次。scope、acceptance、public seam、target 或 exclusion 改變，或第十次後仍有 finding，保留目前進度並停止。每次修復開始前，將累計次數寫入既有 Issue progress evidence 並讀回。重試及 conflict repair 沿用該次數；無法證明先前次數時不得當成零。

`close-issue` 不修產品碼、不刷新 candidate、不重跑 execution 驗證與 review；它只核對 completion 身分與當下整合條件。需要修復時，由原 `execute-issue` lane 在原範圍內產生新候選。

獨立 `/wiki` 不使用 Issue execution review。它由 fresh read-only reviewer 比對 Wiki diff 與 committed `HEAD` code/tests，並在 deterministic validation 後回報 semantic findings。

### `improve-codebase-architecture`

協調代理選定範圍並讀取相關領域資料後，委派一個唯讀探索代理。探索代理回報可深化的候選項目、受影響路徑、觀察到的摩擦，以及刪除測試推理。協調代理擁有 HTML 報告與後續所有對使用者的 grilling。

### `codebase-design` — Design It Twice

協調代理說明限制後，最多平行委派三個唯讀設計子代理。為每個子代理給予刻意不同的最佳化目標：最小介面、最常見呼叫端或彈性。它們只回傳提案；協調代理依深度、局部性與接縫位置比較。子代理不得修改產品原始碼。

### `wayfinder`

每個未被阻擋且不需使用者互動的研究決策，都可依相同產物擁有權規則委派 `research` 子代理。需要使用者互動的決策保留在協調代理與使用者的對話中。地圖尚在解決決策時，不得建立平行實作代理。

### `execute-issue`

預設由單一協調代理直接實作。只有議題已完整指定，且隔離工作樹擁有權能實質保護既有工作時，才使用執行子代理。委派前，協調代理記錄 Issue、linked Spec、原始 target、baseline、工作樹路徑、驗收條件與整合檢查。有適當行為接縫時採用 `tdd`；Matt `code-review` 保留 Standards/Spec 結果與適用的獨立證據；執行子代理的自我回報不可取代任何一項。每個 coherent slice 通過相關驗證後可建立 local checkpoint commit；review 失敗可在同一 operation 累計十個 repair waves 內修復並完整重審。最後只寫入 compact completion note，不改變 Issue closure state，也不自動呼叫 `close-issue`。

### `close-issue`

讀取 completion note 與 unchanged candidate 後，由 close leaf 依序取得 repository close lease 與 target mutation writer。將同一候選合併到記錄的 target，證明 reachable，移除乾淨且精確匹配的 Issue worktree，再關閉並 read back Issue。Retry 只跳過已滿足的有序步驟；鎖的擁有權與 conflict／dirty-target 停止規則以 `close-issue` 為準。它不 refresh candidate、不重跑 review／測試，也不要求人類代管鎖。

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

1. `execute-issue`
2. `close-issue`
3. `explain-decision`
4. 獨立 `wiki`
5. 清理用 `remove-ron`
6. 同步 promoted-skill docs、READMEs、plugin manifest 與 `ask-matt`

Issue delivery 使用既有 Matt tracker/domain setup、`to-spec`、`to-tickets` 與 `code-review`，Tracker Spec 沿其發布的 Run／decomposition route，Issue leaves 使用 `execute-issue` 與 `close-issue`；`implement` 僅處理 Standalone Spec 或明確 current-branch 工作。此採用沒有新增通用 agent framework、Codex plugin、安裝、推送或發布動作。

## 操作完成條件

一般變更以要求達成及適用檢查通過為終點。Execution 以 AC、當前 candidate 的驗證／review、乾淨工作樹與 completion read-back 為終點。Closeout 以指定 target 可達、精確 worktree 清理與 tracker closure 為終點。Run 以所有必要節點與 parent 都完成為終點；worker 結束或部分完成不可回報整體成功。重試沿用各 owner 已記錄的修復預算。
