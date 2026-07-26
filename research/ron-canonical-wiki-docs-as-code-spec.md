# Ron Canonical Wiki Docs-as-Code 完整方案

狀態：本機實作、專用測試與 Codex-native packaging review 已完成；未安裝、未提交實作、未推送或發布
日期：2026-07-26

## 目標

讓每個使用 Ron workflow 的 repository 都能：

- 以主 repository 內、Git-tracked、經審查的 Markdown 作唯一 Canonical Wiki；
- 在規劃變更前讀取目前業務行為基線；
- 在完整 Parent 或 Standalone Issue 收尾時，讓 code、tests 與 Wiki 在同一 integration candidate 中完成 reconciliation；
- 沒有任何第三方 Wiki engine 時仍可完整運作；
- 把網站、native Wiki、`llms.txt`、portal 與搜尋索引視為可重建的 derived outputs。

本方案不把 Change Spec、ADR、API reference、runbook、使用者手冊或 agent state 複製進 Wiki。

## Authority model

| Authority | 擁有內容 |
| --- | --- |
| Issue Change Spec | 本次變更需求、explicit overrides、acceptance 與 Wiki impact |
| `CONTEXT.md` | domain glossary |
| ADR | 架構決策與理由 |
| Canonical Wiki | target branch 上已審查的目前業務行為基線 |
| code／tests | 實作證據 |
| `docs/agents/ron-workflow.md` | Ron operational configuration |
| Wiki engine／protocol | 只產生候選稿，不擁有 authority |
| site／native Wiki／portal／`llms.txt` | derived publication or discovery output |

Canonical Wiki 與 code/tests 在同一 repository、同一 target history、同一 `integration_candidate_sha` 內接受 review 和 rollback。

## Durable artifacts

### `docs/agents/ron-workflow.md`

保存 operational Wiki contract。檔案可在machine block外保留人類說明，但必須包含exactly one marker-bounded、strict JSON block；shared core只解析這個block，不從自由文字或YAML猜測設定：

<!-- ron-workflow-config:v1:begin -->
```json
{
  "schema": "ron-workflow-config:v1",
  "ron_workflow": "v1",
  "mode": "full",
  "interaction": {
    "policy": "exception_only"
  },
  "wiki": {
    "contract_schema": "ron-wiki:v1",
    "root": "<repository-relative-path-or-null>",
    "baseline_state": "missing",
    "page_contract": "ron-wiki-page:v1",
    "sources_contract": "wiki-sources:v1",
    "resolver_profile": "ron-source-resolvers:v1",
    "external_resolvers": [],
    "context_mode": "staging",
    "mutation_policy": "closeout_only",
    "protocol": {
      "name": "<name>",
      "commit": "<exact-commit>",
      "hash": "<protocol-hash>"
    },
    "engine": {
      "state": "absent",
      "identity": null
    },
    "validators": {
      "page": "<command>",
      "sources": "<command>",
      "links": "<command>",
      "build": null
    },
    "support_write_set": [],
    "publication": "disabled"
  },
  "target": {
    "branch": "<local-branch>",
    "integration": "fast-forward-only"
  },
  "lane": {
    "worktree_root": "<path>",
    "naming": "<convention>"
  },
  "excludes": [
    "push",
    "remote-merge",
    "deploy",
    "branch-deletion",
    "live-provider-actions"
  ]
}
```
<!-- ron-workflow-config:v1:end -->

Target config只保存`baseline_state: missing | ready`。`/wiki status`從tracker與hash evidence推導runtime status：`missing | bootstrapping | ready | not-verifiable`，不得持久寫入`bootstrapping`。

Config不保存完整Wiki內容，也不讓engine自動改寫page authority。

### Shared deterministic workflow core

Ron v1以一個repository-level、dependency-free Node command module作為共用mechanical primitive，canonical path為：

```text
scripts/ron-workflow/ron-wiki.mjs
```

它只接收strict JSON／UTF-8 bytes並在stdout回傳strict JSON；不直接建立Issue、寫comment、修改Git history、改Wiki、呼叫network或執行publication。它提供：

- config block extraction與schema validation
- workflow envelope canonicalization、SHA-256 create／verify
- Bootstrap／Sync Preview validation
- source-locator capability discovery與unique resolution
- reconciliation ledger validation與write-set derivation
- pre-Issue clean-path delegation validation及exact downstream Grant derivation
- shared Change Spec payload construction與read-back byte verification
- shared execution-contract payload construction與read-back byte verification

CLI exit contract固定為：

- `0`：requested proof成立
- `2`：input或schema invalid
- `3`：所需resolver、identity或proof不可驗證
- `4`：內容有效但存在finding或scope超界
- 其他非零：tool/runtime failure，不得映射為pass

`to-spec-ron`與`/wiki`共用的publisher是「同一payload builder／verifier＋同一tracker adapter sequence」。Shared core產生exact envelope bytes；calling skill只負責create／reuse Issue、post comment、stable-ID read-back及identity verification，不得另寫一套Change Spec renderer或hash規則。

### Wiki execution baseline contract

每份Change Spec、execution contract與Authorization Record都必須綁定：

```yaml
wiki_operation: none | bootstrap | reconcile
wiki_baseline_requirement: not-applicable | missing-with-bootstrap-preview | ready
wiki_preview_id: <preview-id-or-null>
wiki_preview_payload_sha256: <hash-or-null>
```

合法組合只有：

- `none + not-applicable`：Change Spec明載且Grant綁定`wiki_impact: none`
- `bootstrap + missing-with-bootstrap-preview`：只限一個Standalone Bootstrap Issue，且必須有matching、hash-valid、bounded Preview及pre-Issue delegation
- `reconcile + ready`：normal semantic Parent／Standalone closeout或其Leaves；Leaf可讀取baseline與產生evidence，但仍不可mutate Wiki

因此missing baseline不會阻塞合法Bootstrap Issue，但會阻止所有沒有matching Bootstrap Preview的semantic execution。`bootstrap`不得作為一般Leaf或現有ready baseline的例外。

### Wiki Bootstrap Change Spec

首次 baseline 的 generation authority，包含：

- required business topic／flow inventory
- exact candidate page paths
- 每頁 purpose、scope、dependencies 與 source seeds
- page contract、claim mapping、source-locator contract
- excluded documentation categories
- topic-sized generation／review batches
- validation commands
- target SHA、protocol pin 與禁止副作用

它由missing-state `/wiki`先產生Preview。直接的人類命令可建立一份bounded clean-path delegation；Preview clean且bounded時，`/wiki`透過與`to-spec-ron`共用的Change Spec publisher寫入dedicated Change Issue，不重複實作第二種Spec protocol。

### Bounded clean-path delegation

一份human-originated `workflow-authorization:v1` record，允許Coordinator在不再次打擾使用者的情況下，為clean且in-scope的本機流程推導並寫入exact downstream Grant。它至少綁定：

- direct human invocation或exact Issue
- current Bootstrap Preview或Change Spec lineage及hash
- repository、target branch與starting target identity
- exact code、artifact與Wiki scope ceilings
- named local capabilities
- required validators與review axes
- target refresh僅限same-branch、fast-forward-only、conflict-free並重跑驗證
- exclusions

只有全部record／hash verified、exact paths皆為ceiling subset、mechanical與required independent reviews通過，且沒有finding、ambiguity、unverified claim、silent deletion或new capability時，Coordinator才可derive exact Grant。

Derived Grant必須記錄human delegation source、Coordinator identity、exact Preview／evidence hashes、exact paths、capabilities與derivation time；不得再delegation或擴張ceiling。任一precondition失敗、scope change、new path、target conflict或missing capability都停止並回報problem與trade-off。

Push、remote merge、deploy、branch deletion、live-provider action及legacy-data deletion永遠不在clean-path delegation內。

Direct `/wiki` initialization delegation可命名的local capabilities只限：

- `publish_bootstrap_spec`
- `execute`，且writes只能是Preview inventory、target Wiki-state config及manifest-owned intermediates
- `close_standalone`

Ready-state sync沒有active change-owning Issue時，唯一額外publish capability是`publish_wiki_repair_spec`；有active Issue時必須reuse，不得建立第二個Issue。

#### Pre-Issue delegation sequence

當direct `/wiki`需要建立Bootstrap或Wiki-repair Issue時，Issue尚不存在，不能假裝已有可read-back的Issue Authorization Record。正確順序固定為：

1. 先完成worktree／external-state zero-write Preview。
2. Preview為clean且bounded後，把human-originated、non-authoritative pre-Issue delegation保存到：

   ```text
   git rev-parse --git-path ron-workflow/delegations/<delegation-id>.md
   ```

3. 檔案mode為`0600`，marker為`workflow-clean-path-delegation:v1`，綁定direct invocation lineage、Preview ID／hash、repository、target、scope ceilings、publish capability、validators與exclusions。
4. Shared core驗證delegation只涵蓋exactly one `publish_bootstrap_spec`或`publish_wiki_repair_spec`，才允許tracker adapter建立／reuse Issue並publish matching Change Spec。
5. Change Spec成功以stable comment ID read back後，使用shared core建立、publish並read back一份exact `workflow-execution-contract:v1`。
6. 立即在該Issue寫入並read back一份`workflow-authorization:v1` record；execution contract的Issue、type、Spec IDs／hashes、Wiki／Preview binding與owned-paths hash必須逐欄相符。Record使用`origin: derived-clean-path`，並綁定pre-Issue delegation ID／payload hash、Issue、Spec、execution contract與exact downstream capabilities。
7. Issue Grant read-back成功前不得建立Lane或執行；失敗時保留Preview與pre-Issue delegation供recovery。
8. Exact Issue Grant成功read back後，pre-Issue delegation已被durable Issue record完整承接，才可刪除local copy；Preview仍依其各自規則保留到matching Spec publish成功。

有active change-owning Issue時不使用pre-Issue delegation；human-originated delegation直接作為該Issue的append-only Authorization Record，並遵守相同scope ceiling與read-back規則。

### Wiki Bootstrap Preview

Missing-state `/wiki`將recoverable、non-authoritative preview保存到：

```text
git rev-parse --git-path ron-workflow/wiki-previews/<preview-id>.md
```

檔案mode為`0600`，使用`workflow-wiki-bootstrap-preview:v1` marker、workflow payload delimiters、UTF-8、LF、exactly one terminal newline及SHA-256。Canonical payload至少包含：

- `preview_id`、`created_at`
- internal repository、target branch與target identity
- proposed canonical root與root adoption assessment
- target baseline state
- `boundedness: bounded | not-bounded`及reason
- ordered topic／flow inventory
- exact page paths、每頁purpose／scope／dependencies
- structured source seeds
- ordered bootstrap batches
- page、claim與source-locator contract versions
- exact validation commands
- exclusions與disabled publication
- protocol／engine identity、exact pin與protocol hash

它可更新同一preview並重算hash，但任何target、root、inventory、path、source、validator、exclusion或protocol drift都使先前hash失效。它不寫tracked worktree或external state，因此是worktree／external-state zero-write，不是literal filesystem zero-write。只有matching Change Spec成功publish、read back及hash verify後才刪除；失敗時保留供跨session recovery。

### Wiki Sync Preview

Ready-state `/wiki`若沒有active change-owning Issue，但audit發現bounded drift，將non-authoritative `workflow-wiki-sync-preview:v1`保存到：

```text
git rev-parse --git-path ron-workflow/wiki-sync-previews/<preview-id>.md
```

Mode為`0600`，使用相同payload hash規則，至少綁定prior Wiki identity、drift evidence、proposed Change Spec dispositions、reconciliation ledger、exact semantic／support write-set ceilings、validators、exclusions與internal target identity。

它只可作為exactly one Wiki-repair Standalone Change Spec的input。若active Issue已擁有變更則不得建立；behavioral code change缺少Change Spec時也不得把code現況包裝成repair authority。Matching repair Change Spec成功publish及read back後才刪除，失敗時保留供recovery。

### `<canonical-root>/index.md`

baseline ready 後的目前 topic/page map與讀者入口。新增、刪除、重新命名或重新定義 topic scope 是 semantic change；純機械排序或連結重建才可列入 support write set。

### Wiki topic pages

每頁以一個穩定的業務 topic或 end-to-end flow為單位，不鏡像 code folders。最低契約：

1. Purpose and scope
2. Current behavior
3. Rules and invariants
4. States and exceptions（適用時）
5. Dependencies
6. Sources

每個 material claim以 `[S1]` 等 ID對應 Sources entry。每個implementation source locator使用固定欄位：

- `path`：required、normalized repository-relative file path，不得escape repository
- `kind`：required，`symbol | test | config-key | json-pointer | heading`
- `value`：required、non-empty，由對應deterministic adapter解析的stable within-file identifier
- `line_hint`：optional positive integer，只作閱讀提示

每頁`Sources` section包含exactly one JSON object，schema為`wiki-sources:v1`，`sources` array中的`id`在頁內唯一。Material claim以`[S1]`引用對應entry。使用JSON是為了讓validator不依賴project-specific Markdown或YAML parser。

Validator必須在fixed candidate中確認`path`存在，並由matching adapter唯一解析`kind + value`。Resolver缺少、不支援或結果ambiguous時回報`not-verifiable`，不得視為pass；Bootstrap與closeout candidate因此停止。External reference可補充背景，但不能取代implementation claim的repository locator。

#### `ron-source-resolvers:v1`

Bundled v1 minimum capability固定為：

| Kind | Bundled deterministic scope |
| --- | --- |
| `heading` | Markdown／MDX ATX heading的exact normalized text |
| `json-pointer` | Strict JSON的RFC 6901 pointer |
| `config-key` | JSON、YAML、TOML與`.env`中的exact dotted key path；不支援merge、template或dynamic key |
| `symbol` | Python、JavaScript與TypeScript family中exact declaration或qualified declaration name |
| `test` | Python、JavaScript與TypeScript family中exact declared test name |

Resolver只證明identifier在named path內有exactly one syntactic target，不證明material claim正確；claim-to-source correctness仍由independent semantic reviewer判斷。Call sites、comments、string mentions或只有`line_hint`都不能當作resolution。

其他language／format只能使用setup時明確採納的external resolver。Config必須綁定adapter name、exact executable identity或content hash、supported extensions／kinds及read-only invocation template；runtime先做capability probe。Adapter未配置、identity drift、process有unexpected writes、回傳零個或多個targets時一律`not-verifiable`。External resolver不得取得Wiki mutation、tracker或network authority。

### Wiki reconciliation ledger

每個semantic Parent或Standalone closeout建立一份ledger，每列包含：

- affected topic／material claim
- prior Wiki state
- Change Spec disposition：`inherit | add | change | remove`
- code／test source locators
- conformance：`aligned | deviation | unverified`
- Wiki action：`none | add | update | remove`

Closeout Preview包含ledger並綁定其hash。只有全部列為`aligned`才可執行semantic Wiki patch；`deviation`必須修正code或發布superseding Change Spec，`unverified`必須補足證據。任何Spec、evidence、disposition或action變更都使ledger與Closeout Grant失效。

## 唯一新增的 `/wiki` skill

`/wiki` 是 user-invoked control skill，不是第二個 closeout flow。

使用者主要只需要執行`/wiki`：

- baseline `missing`：初始化完整Canonical Wiki。
- runtime `bootstrapping`：驗證並resume active bootstrap。
- baseline `ready`：audit並只sync這次受影響的topics／claims。
- 明確執行`/wiki status`：只做read-only狀態檢查。

使用者不需要選擇bootstrap／audit mode，也不提供target SHA、root、engine或protocol等技術flags。Skill一律從approved Ron config、tracker與repository state解析；缺少或ambiguous時fail closed。

完整machine-readable result與technical evidence保存在task evidence中。Human-facing clean result只顯示初始化完成、同步完成或檢驗通過；只有non-clean才顯示問題、evidence、trade-offs與recommended next action。

### `/wiki status`

唯讀檢查：

- canonical root
- target baseline state與derived runtime baseline status
- active Bootstrap Issue identity、hash與target binding（適用時）
- Wiki contract與 protocol pin
- topic/page inventory
- validation commands是否可用
- engine是否 absent、candidate或 verified
- derived publication狀態，但不把 publication當 canonical proof

Result：

- `ready`
- `missing`
- `bootstrapping`
- `not-configured`
- `not-verifiable`

### Missing baseline：初始化

Default `/wiki`先唯讀掃描repository、`CONTEXT.md`、ADRs、existing docs、entry points、business rules、tests與integration edges，產生：

- topic inventory
- exact page paths
- page purpose／scope
- source seeds
- batch order
- boundedness：`bounded | not-bounded`
- validation commands
- exclusions
- Bootstrap Preview hash

Preview階段不建立`wiki/`、Issue、Grant、commit或engine state，只在repository-local Git metadata保存一份mode `0600`的recoverable Preview。只有`bounded`且clean的Preview才可依direct invocation的clean-path delegation，透過shared Change Spec publisher建立一個Bootstrap Issue，再路由至既有execution與closeout flow；`not-bounded`必須先縮小或重新設計Canonical Wiki scope。

### Ready baseline：同步受影響部分

Default `/wiki`：

1. 找出active Parent／Standalone Issue與current Change Spec；若已有change-owning Issue則必須reuse。
2. 聚合prior Wiki、Spec dispositions、code／tests與review evidence，建立reconciliation ledger。
3. 只在全部rows為`aligned`時derive exact affected semantic／support write sets。
4. 在staging只修改受影響topics／claims，執行mechanical validation及independent semantic review。
5. 依valid clean-path delegation route through既有closeout，建立local candidate、驗證target並close Issue。
6. 若沒有active change-owning Issue，只能在audit證明bounded drift scope後，透過shared publisher建立exactly one Wiki-repair Standalone Issue。

Behavioral code change沒有current Change Spec、Spec／code／Wiki不一致、finding、ambiguity或scope expansion時都停止，不得直接照code改Wiki。

Normal Parent或Standalone closeout自動呼叫同一sync primitive；因此使用者不需要記得在每個Issue後另外執行`/wiki`。再次手動執行`/wiki`時，已同步則只回報`clean`。

同步檢查保留兩種proof authority：

- mechanical：page contract、claim mappings、source path／locator syntax與supported resolvability、broken links、navigation、support-output drift、configured build、baseline-state consistency及tracked-tree unchanged
- semantic：針對fixed candidate核對prior Wiki、current Change Spec、code、tests、reconciliation ledger與candidate Wiki

輸出分開保留兩種proof authority：

- `mechanical: clean | drift-found | not-verifiable`
- `semantic: reviewed-clean | findings | not-reviewed | not-verifiable`

只有`mechanical: clean`且`semantic: reviewed-clean`時才可另報整體`clean`。Content author、writable Coordinator與Wiki engine只能提供advisory findings，不得self-accept；只有allocated independent read-only human或agent reviewer可產生`reviewed-clean`，且Coordinator必須驗證其evidence。

人類預設只收到「檢驗通過」；fixed candidate identity與兩軸詳細結果保留在durable evidence，只有使用者要求或需要解釋finding／missing proof時才顯示。不得從頭重述流程或傾倒完整evidence history。

採exception-only interaction：valid bounded clean-path delegation讓clean且in-scope的工作直接繼續；只有finding、ambiguity、scope change、missing capability或新的authorization boundary才停止，說明問題與trade-off後請人類決斷。發現問題時可附evidence-backed Change Issue proposal；不得auto-fix或自行擴張授權。

Overall result：

- `ready`
- `missing`
- `bootstrapping`
- `clean`
- `findings`
- `not-bounded`
- `not-configured`
- `not-verifiable`

### Common failure contract

- `not-configured`：Ron config或Canonical Wiki contract不存在；只提出`/setup-ron` next action。
- `not-verifiable`：identity、tracker、validator、resolver、source或review capability無法證明；不得降級成pass。
- `not-bounded`：bootstrap scope無法形成一個coherent Standalone boundary；不得建立Issue。
- `findings`：附最小evidence、affected scope與repair trade-offs；不得在未取得新授權時auto-fix。
- command執行期間tracked worktree或external state出現unexpected mutation時立即停止並保留evidence。

## End-to-end lifecycle

### 1. Repository setup

1. `/setup-ron` 在fixed target SHA偵測existing knowledge roots。
2. 每個candidate root執行read-only adoption assessment：
   - Git-tracked
   - 存在於fixed target SHA
   - scope為目前業務行為，不是documentation archive
   - 具有topic／page inventory或index
   - 沒有第二個canonical authority
3. 全部符合才分類為`adoptable`並提議沿用；任一不符則分類為`needs-bootstrap`，只能作bootstrap／migration source seed。
4. `adoptable` root在internal fixed target identity上執行deterministic mechanical validation與independent read-only semantic review。
5. 兩軸皆clean才產生valid baseline-review evidence並可記錄`baseline_state: ready`；finding、ambiguity或missing proof停止並回報repair、migration或bootstrap trade-offs。
6. 沒有`adoptable` root時提議`wiki/`。
7. Direct `/setup-ron` invocation可授權exact configuration clean path；assessment與capability proof皆clean時只寫operational config，不再次要求確認。
8. Setup核對exact config diff後建立一個只含approved Ron configuration／instruction paths的local setup commit，fast-forward named local target並read back驗證。
9. Dirty overlap、unexpected path、conflict或verification failure停止；需要隔離時使用setup-owned worktree。
10. `adoptable`只證明root可沿用，不證明baseline已reviewed；無法取得valid baseline-review evidence時，target config仍記錄`baseline_state: missing`。
11. setup不會寫入`bootstrapping`，也不把Wiki baseline內容或product change放進setup commit；push、remote merge、deploy與branch deletion仍排除。

### 2. Initial baseline bootstrap

1. 使用者直接執行`/wiki`，verified baseline state為`missing`時授權exactly one bounded bootstrap clean path。
2. skill先以worktree／external-state zero-write方式產生Bootstrap Preview。
3. Preview為`not-bounded`、有finding、scope ambiguity或缺少capability時停止，說明問題與trade-off。
4. Preview clean且`bounded`時，先在Git metadata寫入並驗證human-originated pre-Issue delegation；它只授權matching Preview的一次`publish_bootstrap_spec`。
5. 透過與`to-spec-ron`共用的publisher建立並read back一個dedicated Wiki Bootstrap Standalone Issue。
6. 使用shared core建立、publish並read back exact Standalone execution contract，綁定Spec、Preview、target、paths與verification。
7. 在該Issue寫入direct invocation lineage與pre-Issue delegation hash，derive並read back exact Issue Grant；它同時綁定Spec與execution contract。
8. Issue Grant明載`wiki_operation: bootstrap`、`wiki_baseline_requirement: missing-with-bootstrap-preview`與matching Preview；成功read back前不得建立Lane。
9. topic-sized batches是同一Standalone Issue與task staging mirror內可跨session恢復的generation／review checkpoints，不是Leaf Issues或partial acceptance units。
10. 建立execution lane後，hash-valid的active Bootstrap Issue使`/wiki status`推導runtime狀態為`bootstrapping`；target config仍保持`baseline_state: missing`。
11. 依topic-sized batches在task staging mirror產生候選頁；batch是generation／review單位，不是獨立target authority。
12. 每批通過page、claim、source、link與build檢查。
13. Standalone closeout建立一個完整integration candidate並進行Wiki review。
14. Internal Closeout Preview與derived exact Grant全部落在delegation ceiling且verification clean時，不再次要求使用者確認。
15. integration candidate同時包含完整baseline與`baseline_state: ready`；local target fast-forward及target verification成功後，target才成為`ready`。

target branch不接受未完成的partial baseline，也不持久保存`bootstrapping`。Tracker unavailable、Issue hash不符或lineage ambiguous時，`/wiki status`回報`not-verifiable`，不得猜測進度。失敗保留Issue、lane與候選證據。

若 Preview為`not-bounded`，不得建立Bootstrap Issue；必須先縮小Canonical Wiki scope或重新設計context boundary。Ron v1不新增analysis-only Leaves，也不允許Executable Leaves寫入partial Canonical Wiki。

### 3. Planning a normal change

1. `/to-spec-ron` 先讀 relevant Wiki topics與 Sources。
2. Change Spec記錄：
   - 每個relevant topic／claim的`inherit | add | change | remove` disposition
   - explicit overrides與理由
   - unresolved conflicts
   - `wiki_impact`
3. 未解決的 Wiki／request conflict阻止 spec完成。
4. 純技術變更只有在 Change Spec與 Grant明載 `wiki_impact: none` 時，才可在 baseline missing狀態執行。

### 4. Leaf execution and closeout

1. Leaf讀取 relevant Wiki，但不生成、修改、mirror或publish Wiki。
2. Leaf完成 code/tests、review、commit與 `implemented_on_lane` evidence。
3. Leaf closeout只關閉該 Leaf，不更新 target或 Wiki。
4. `pending-baseline-update` 只作 evidence，不是 Wiki mutation authority。

### 5. Parent／Standalone Wiki reconciliation

1. 聚合前一版Wiki、完整Issue diff、current Change Spec、code／tests source locators與reviewer judgement。
2. 建立Wiki reconciliation ledger，逐列判斷Spec disposition與code／test conformance。
3. 任一列為`deviation`或`unverified`立即停止並回報trade-offs；人類決斷後，intent改變才發布superseding Change Spec並更新contract／Grant，code defect才建立Repair Leaf。
4. 全部列為`aligned`後，依ledger的Wiki actions推導：
   - exact `wiki_semantic_write_set`
   - exact `wiki_support_write_set`
5. 空semantic set必須附evidence-backed `wiki_impact: none`。
6. 產生一次Closeout Preview，綁定target SHA、lane SHA、ledger及hash、兩個sets及hashes、protocol pin、staging path、commands、exclusions與repair envelope。
7. 若valid clean-path delegation涵蓋全部exact inputs與capabilities，Coordinator derive、寫入並read back exact Closeout Grant後直接繼續；否則才顯示compact human authorization stop。
8. 同步最新local target；任何drift、conflict、ledger或set變更使exact Grant失效。只有same-branch、fast-forward-only、conflict-free refresh仍落在原delegation ceiling且complete revalidation通過時，才可重建Preview與derived Grant；否則停止請人類決斷。
9. 複製reviewed baseline到task-specific staging mirror。
10. 先執行zero-write preview；planned path超出Grant立即停止。
11. 在staging依ledger執行最窄的topic generation或人工patch。
12. 對staging前後做path diff，分類為semantic、support、unexpected，並核對ledger actions。
13. unexpected path、silent delete、new topic或未核准concept都fail closed。
14. 只提升granted paths到lane candidate。
15. 驗證：
    - page contract
    - material-claim mappings
    - source paths與 locators
    - links與navigation
    - support-output consistency
    - configured Wiki build
16. 有real diff才建立closeout commit；不得建立empty Parent commit。
17. Freeze `integration_candidate_sha`。
18. Standards、Spec與applicable Wiki reviewers審查同一SHA；Wiki reviewer核對prior Wiki、current Spec、code／tests、ledger與candidate Wiki。
19. 任一Wiki finding結束clean path並回報problem與trade-offs；人類另行授權後，Wiki-only repair才可在原write sets與ledger actions內進行，最多兩個material waves，每次產生新SHA並重跑affected review。
20. 任一code／test finding同樣停止；人類決斷後才建立新的Repair Leaf，不在Parent closeout偷偷修code。
21. 全部通過後，fast-forward local target、驗證target HEAD與Wiki。
22. closeout evidence綁定verified ledger hash；接著關閉Issue、清理exact manifest-owned artifacts，最後移除worktree。

Push、remote merge、deploy、branch deletion與 live-provider action始終需要另外授權。

### 6. CI validation

PR／candidate CI只擁有deterministic mechanical、read-only validation authority：

- page schema
- claim-to-source coverage
- source path existence與locator syntax／supported resolvability
- links與navigation
- build
- baseline-state consistency
- 在 temporary directory重建並比較 mechanical outputs
- validator執行前後tracked tree保持不變

CI不得判斷semantic correctness，也不得edit、commit、push、publish或接受semantic content。Semantic correctness由獨立read-only human或agent Wiki reviewer針對固定SHA核對prior Wiki、current Change Spec、code、tests、ledger與candidate Wiki。Content author、writable Coordinator與engine不得self-accept。

Drift造成non-zero result，後續由ready-state `/wiki`與既有Change Issue flow處理。

### 7. Drift audit

Ron v1採 on-demand audit；可另外排程 read-only audit，但不是即時 background mutation。

Audit輸出分為：

- `mechanical: clean | drift-found | not-verifiable`
- `semantic: reviewed-clean | findings | not-reviewed | not-verifiable`

只有兩軸分別具備`clean`與`reviewed-clean`證據時，整體結果才可標示`clean`。預設只回報「檢驗通過」；fixed identity與兩軸細節保留於durable evidence。只有非clean、使用者要求或需要解釋問題時才顯示exact findings、missing proof與相關技術identity。

Audit不自動修復，也不因掃描成功宣稱 baseline仍正確。

### 8. Publication

Publication是獨立 capability：

1. 輸入已驗證的 exact source SHA。
2. 產生 VitePress／Pages／native Wiki mirror／portal artifact。
3. 每個 derived output標記 canonical path、source SHA、generator SHA與 generated-at。
4. derived layer不可直接編輯或 back-sync。
5. publish run、URL與 live verification分別記錄，不替代 canonical target verification。

Ron v1預設不自動 deploy。

## Open-source generation plan

### Ron v1

以 [`ussumant/llm-wiki-compiler`](https://github.com/ussumant/llm-wiki-compiler) `2.1.0`、commit `2faf5d951dfbfbbb32294c5edd3e968ca0a55c2f` 的 `COMPILE_PROTOCOL.md` 作 pinned design/protocol reference：

- 不安裝 upstream hooks、session mutation、capture、schedule或upgrade commands；
- 不把 Markdown protocol稱為 executable engine；
- Ron `/wiki` wrapper實作自己的 authority、preview、staging、write-set與verification gates；
- upstream SHA或 protocol hash變更時，另開 Issue review。

因此 v1在 offline或 upstream unavailable時仍可依 repo內 Ron skill完成工作。

### Future executable engine

另開 compatibility Issue評估 [`atomicstrata/llm-wiki-compiler`](https://github.com/atomicstrata/llm-wiki-compiler) v1.1.0、commit `6963a7f8374282de5d4084a324be69b50f62a32d`。

啟用前必須證明：

- codebase source adapter保留 original repo locator；
- dry-run與 staging output ceiling；
- exact-path fail closed；
- unexpected page使整批失敗，而不是 skip and continue；
- page contract與 claim citation達標；
- rename／delete／orphan處理；
- deterministic path set；
- Node 24、compiler state與 duplicate corpus不污染 target；
- profile、workflow、connector、template與publication surfaces停用。

Microsoft Deep Wiki只作 citation/page-writing與 future publication參考；full generator不進 Ron v1。

### Optional authoring and retrieval tools

[`Nimbalyst/nimbalyst`](https://github.com/Nimbalyst/nimbalyst)不屬於 Wiki engine，也不進 Ron v1必要依賴。它只保留為未來可另案驗證的：

- task-worktree Markdown authoring／visual-diff UI；
- read-only、rebuildable Canonical Wiki retrieval index。

任一角色都沒有content、review、completion或publication authority。採用前必須固定exact version，驗證zero-diff Markdown round-trip、granted-path ceiling、repo外shadow index、禁用write-capable Memory tools，且不得把Nimbalyst的reviewed狀態當作Ron review evidence。詳細證據見 [`nimbalyst-wiki-fit-assessment.md`](./nimbalyst-wiki-fit-assessment.md)。

## Implementation scope after approval

### Add

- `skills/engineering/wiki/SKILL.md`
- `skills/engineering/wiki/agents/openai.yaml`
- `docs/engineering/wiki.md`
- `scripts/ron-workflow/ron-wiki.mjs` shared deterministic core
- `tests/ron-workflow/` Wiki contract／protocol fixtures、focused tests與temporary-repo forward tests
- `superpowers/docs/plans/2026-07-26-173202-01-plan-canonical-wiki-v1.md`

### Update

- `setup-ron`：config schema version、root adoption assessment、validator／protocol pins、`interaction_policy: exception_only`、exact local setup commit與target verification
- `ask-ron`與 `ask-matt`
- `to-spec-ron`：normal-change Wiki dispositions及shared Change Spec publisher
- `to-tickets-ron`：把Spec dispositions與clean-path scope ceilings帶入contracts
- `execute-issue`：驗證human delegation lineage與derived exact Grant；Leaf仍禁止Wiki mutation
- `close-issue`：internal Closeout Preview、reconciliation ledger、staging、two-axis proof與derived closeout Grant
- promoted skill READMEs
- `.claude-plugin/plugin.json`
- existing main Ron workflow spec，移除「engine已採用」的 stale assertion

`to-spec-ron`與`/wiki` initialization／repair必須共用同一Change Spec publishing primitive；`close-issue`與Authorization Record schema必須支援bounded clean-path delegation及derived exact Grant，不得複製第二套authority protocol。

所有 promoted-skill docs、invocation metadata與 manifests必須同步。Manifest變更後由Codex執行`node --test tests/ron-workflow/skill-contracts.test.mjs`，再從repository root以`codex exec --ignore-user-config --ephemeral --sandbox read-only "<scoped review prompt>"`唯讀核對exact packaging scope；repository validation不得依賴Claude CLI。

### Do not do in the same implementation

- 安裝或啟用 executable Wiki engine
- 安裝或整合 Nimbalyst
- 建立任何 target repository的 Wiki baseline
- 自動部署 Pages／portal
- bump release version
- 除exactly one已授權的pre-implementation Ron／Wiki local baseline commit外，建立其他commit
- push或建立 PR
- 修改 unrelated dirty files

## Acceptance scenarios

1. Setup在沒有 Wiki時只記錄 `missing`，不建立 `wiki/`。
2. `/wiki status` zero-write；ready-state `/wiki`的audit phase在Grant前也保持worktree／external-state zero-write。
3. Missing-state `/wiki` preview只寫Git metadata，不寫tracked worktree或external state；沒有valid clean-path delegation時不建立baseline。
4. Delegated clean bootstrap只產生exact inventory pages，並在target verification後轉為`ready`。
5. Leaf execution／closeout不改 Wiki。
6. Standalone或 Parent closeout只提升 granted semantic/support paths。
7. Generator提出 unexpected path時 closeout停止。
8. Missing、unsupported或ambiguous source locator回報`not-verifiable`並阻止candidate。
9. CI failure不修改 tracked files。
10. 沒有 engine時，人工／agent-authored Markdown仍能完成整個流程。
11. Engine protocol／SHA改變會使既有 compatibility evidence失效。
12. Publication失敗不回滾或否定已驗證的 canonical target；proof states分別報告。
13. Dirty unrelated work不被 stage、rewrite、normalize或cleanup。
14. 所有 failure都保留 Issue、lane與 recovery evidence。
15. Optional authoring或 retrieval tool不擴張Wiki authority、write sets或review proof。
16. Wiki bootstrap只使用一個Standalone Issue；topic batches不建立Leaves。
17. `not-bounded` Bootstrap Preview不建立Issue、Grant、lane或Wiki內容。
18. Target config在bootstrap期間保持`missing`；只有完整integration candidate可原子轉為`ready`。
19. `/wiki status`只有在active Bootstrap Issue通過identity、hash與target binding檢查時才回報`bootstrapping`。
20. Semantic closeout在Wiki mutation前產生完整reconciliation ledger，任一`deviation`或`unverified`都停止。
21. Wiki reviewer對同一candidate SHA核對prior Wiki、current Spec、code／tests、ledger與candidate Wiki。
22. CI只能證明mechanical結果；沒有fixed candidate的獨立semantic review時，ready-state `/wiki`不得回報整體`clean`。
23. Clean result預設只回報檢驗通過；fixed identity與兩軸細節留在durable evidence，只有findings、missing proof或使用者要求時才展開。
24. Source locator缺少`path`、`kind`或`value`，或只提供`line_hint`時，validation失敗。
25. Locator resolver缺少、不支援或解析結果ambiguous時回報`not-verifiable`，不得接受candidate。
26. Existing root缺少任一adoption criterion時分類為`needs-bootstrap`，不得直接採為Canonical Wiki。
27. `adoptable` root沒有valid baseline-review evidence時只能記錄`missing`，不得因clean-path delegation直接宣稱`ready`。
28. Clean且已授權的Wiki操作不要求重複確認；finding、ambiguity、scope change、missing capability或authorization boundary才停止請人類決斷。
29. Bootstrap Preview可跨session恢復，且任何bound input drift都使舊hash失效。
30. Matching Change Spec未成功publish及read back前不得刪除Bootstrap Preview。
31. `/wiki`不要求使用者提供或理解SHA、root、engine或protocol identity；clean result只顯示結果。
32. `/wiki`遇到missing、ambiguous或unsupported proof時必須回報bounded failure state，不得猜測或降級成pass。
33. Direct `/wiki` invocation只能依verified state授權一個bounded initialization或sync；clean Preview可自動publish對應的一個Change Spec並走完整本機流程。
34. Derived Grant的exact paths或capabilities超出clean-path delegation ceiling時立即停止，不得要求agent自行同意。
35. Clean-path delegation永遠不包含push、remote merge、deploy、branch deletion、live-provider action或legacy-data deletion。
36. Existing `adoptable` root只有在mechanical與independent semantic proof皆clean時才可直接記錄`ready`；否則保留`missing`並回報trade-offs。
37. Clean `/setup-ron`只提交exact approved config paths並驗證local target；dirty overlap、unexpected path或conflict時不得提交。
38. Default `/wiki`在`missing`時初始化、在`ready`時只同步affected scope；normal closeout重用同一sync primitive。
39. Ready-state `/wiki`只有在沒有active change-owning Issue且drift scope bounded時才可建立一個Wiki-repair Standalone Issue。
40. Bootstrap Standalone綁定`bootstrap + missing-with-bootstrap-preview`時可在baseline missing執行；相同狀態下的normal semantic Issue仍被阻止。
41. Pre-Issue delegation在Issue建立前綁定exact Preview與一次publish capability；Issue Grant未read back前不得建立Lane。
42. Active Issue存在時不得建立pre-Issue delegation或第二個repair／bootstrap Issue。
43. `/wiki`與`to-spec-ron`對相同input產生byte-identical Change Spec payload及hash，tracker sequence也使用同一read-back verifier。
44. Bundled resolver profile只對明載的language／format與locator kind回報supported；unsupported extension、dynamic config key、ambiguous declaration或comment-only match都回報`not-verifiable`。
45. Shared core執行所有valid／invalid fixture後，tracked tree、Git refs、tracker與network state保持不變。
46. `docs/agents/ron-workflow.md`缺少machine block、存在多個block、JSON invalid或schema/version不符時回報`not-configured`或`not-verifiable`，不得fallback解析自由文字。
47. Bootstrap／repair的derived Issue Grant同時綁定read-back verified Change Spec與execution contract；任一缺少、hash drift或identity mismatch都阻止Lane建立。

## Proof-state boundary

目前本機證據證明：

- `/wiki` skill、shared workflow core與更新後的 Ron skill contracts 已建立；
- 26 項 focused、contract 與 temporary-repository forward tests 通過；
- promoted skill、docs、README、invocation metadata 與 plugin manifest parity 通過；
- Node syntax、tracked diff whitespace 與 Git zero-mutation checks 通過。

這些證據不代表：

- Codex-native packaging contract test與read-only review已對目前 manifest 通過；
- engine已安裝或 smoke-tested；
- Wiki baseline已建立；
- implementation changes已 staged、committed、pushed或deployed。
