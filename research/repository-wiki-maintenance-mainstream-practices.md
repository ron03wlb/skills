# Repository Wiki／Codebase Knowledge Baseline 主流維護方式

研究日期：2026-07-25
決策狀態：2026-07-26 已採用「主 repository docs-as-code 是唯一 canonical Wiki authority」；見 [ADR 0004](../docs/adr/0004-repository-docs-as-code-is-the-canonical-wiki.md)。
授權邊界：本研究與 ADR 不授權修改 Ron skills、安裝、提交、推送或部署。

## 範圍與證據標準

此處「repository wiki」指與 codebase 綁定、供人類與 agent 讀取的長篇現況知識基線，不限 GitHub／GitLab 的 **Wiki** tab。

「主流」只指 GitHub、GitLab、MkDocs、Docusaurus、Backstage 等主要平台廣泛支持的架構模式；本文不做市佔排名。

只用官方文件、官方 repository 與一手原始碼支撐能力主張。官方沒有證明的能力會明標為「設計推論」或「需實測」，不從文件缺席推成絕對不支援。

這些模式可組合：

- docs-as-code 決定 canonical source；
- static site、native Wiki mirror、TechDocs 決定呈現與發現；
- CI 決定驗證、產生、drift audit 與發布。

## 推薦摘要

Ron v1 應採：

> **主 repository 內的 docs-as-code 是唯一 canonical Wiki authority；code、tests、Wiki reconciliation 共用同一 Git history、同一 `integration_candidate_sha` 與 review gate。Pages、native Wiki、`llms.txt`、TechDocs 都只能是 read-only derived layer。**

理由：

1. Wiki 與 code 可在同一候選 tree 審查，不會出現兩個未綁定 SHA。
2. 主 repo 的 PR、CODEOWNERS、required reviews、status checks 與 revert 可直接涵蓋 Wiki。
3. Leaf 只讀；Parent／Standalone closeout 才在精確 Grant 與 write sets 內 reconciliation。
4. Canonical closeout、push、deploy、live verification 仍是不同 proof states。
5. Matt 保持 human-facing 主流程；Ron 只補 authority、authorization、proof 與 closeout，不新增第二套 spec stack。

不建議把 native Wiki 直接編輯面當 Ron 的 canonical authority。GitHub／GitLab 官方證明它們有 Git history、diff 與 restore；但官方 Wiki 文件未證明其編輯面具備一般 repo 等級的 CODEOWNERS、required PR review、required checks 與固定候選 gate。

## 六種模式比較

| 模式 | Authority | Review／版本 | CI／drift／回滾 | 適用規模 | Ron 適配 |
| --- | --- | --- | --- | --- | --- |
| 1. Native Wiki 直接編輯 | Wiki default branch live 內容 | Web save 直接 commit；有 history、diff、revert；強制 PR gate 未證實 | GitHub `gollum`、GitLab Wiki webhook 可做事後稽核 | 小團隊、低風險共編 | 低；只宜非權威筆記或 derived view |
| 2. 獨立 Wiki Git repo | `.wiki.git`／GitLab Wiki repo | 可 clone、branch、commit；但 code 與 Wiki 分屬兩個 SHA／transaction | 自建 checks；任一 repo drift 都應使證據失效 | 文件責任與 code 分離 | 中低；需雙 SHA closeout |
| 3. 主 repo docs-as-code | Target branch 的 Wiki files | 完整 PR、CODEOWNERS、required review/check；與 code 同一 history | Link/build/citation 可成 required check；正常 revert | 單 repo、monorepo、多數產品團隊 | **最高；建議 canonical** |
| 4. CI 靜態文件站 | Source Markdown；網站是 artifact | Review source PR；PR build/preview，合併後或手動 deploy | 從 verified source SHA 重建／回滾；輸出不可手改 | 外部文件、多受眾 | 高；建議 publication layer |
| 5. Canonical + 單向鏡像 | Main repo docs；mirror 非權威 | 只 review canonical；mirror 明示 source SHA | Sync diff；webhook 偵測 rogue edit；只從 source 重發 | 需要 Wiki tab／多格式 | 中高；publish 需另行授權 |
| 6. Portal／TechDocs | 各 repo docs + source-controlled catalog metadata | 每 repo 正常 PR；中央 portal read-only | 每 repo CI build、external storage、central reader | 多 repo、多團隊 | 未來高；Ron v1 現階段過重 |

## 官方能力與設計結論

### Native Wiki／獨立 Wiki Git repo

**官方可驗證：**

- GitHub Wiki 可在 web UI 編輯，也可 clone `REPOSITORY.wiki.git`；只有 default branch 內容 live。[GitHub Wiki editing](https://docs.github.com/en/communities/documenting-your-project-with-wikis/adding-or-editing-wiki-pages)
- GitHub 每次 Wiki 變更都是可查看 commit，支援 revision compare 與 revert。[GitHub Wiki history](https://docs.github.com/en/communities/documenting-your-project-with-wikis/viewing-a-wikis-history-of-changes)
- GitHub Actions `gollum` event 在 Wiki page 新增／更新時觸發。[GitHub workflow events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#gollum)
- GitLab 明載每個 Wiki 是 separate Git repository，可由 UI／local Git 維護，並有 history、diff、restore。[GitLab Wiki](https://docs.gitlab.com/user/project/wiki/)
- GitLab 提供 Wiki create／update／delete webhook。[GitLab webhook events](https://docs.gitlab.com/user/project/integrations/webhook_events/#wiki-page-events)

**設計結論：**

- Git history 不等於 pre-merge governance；event／webhook 多半只能在直接 edit 後發現 drift。
- 若 native Wiki 是獨立 canonical，Grant 必須同時綁 code target／Lane SHA、Wiki baseline SHA、預期 Wiki candidate SHA；任一邊 drift 都停止。
- 若需求只是讀者想用 Wiki tab，應採 main-repo canonical + read-only mirror，避免雙 repo authority。

### 主 repo docs-as-code

**官方可驗證：**

- Backstage TechDocs 把 docs-like-code 定義為文件靠近 code；典型做法是在 repo 放 `mkdocs.yml`、`catalog-info.yaml`、`docs/`，再 commit、open PR、merge。[TechDocs creating and publishing](https://backstage.io/docs/features/techdocs/creating-and-publishing/)
- GitHub CODEOWNERS 可涵蓋 `docs/`；branch protection／ruleset 可要求 code-owner approval。[GitHub CODEOWNERS](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners)
- Protected branches 可要求 PR review、status checks、conversation resolution、linear history 等條件。[GitHub protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)

**設計結論：**

- 這是唯一自然形成單一 `integration_candidate_sha` 的模式。
- Wiki reviewer 可對同一固定 tree 核對 source citations、現況規則與 Change Spec explicit overrides。
- 回滾若改變業務語意，仍走 Change Spec／Grant／review，不能把 revert 當免審捷徑。

### Static site／mirror／portal

**官方可驗證：**

- GitHub Pages 可從 branch／`docs` 或 custom Actions workflow 發布；官方同頁警告 Pages 網站即使來源 repo 是 private 也可能公開，因此發布前必須另做可見性與敏感資料檢查。[GitHub Pages publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- Docusaurus 產生 static files；官方 Actions 範例把 PR build validation 與 deployment 分開。[Docusaurus deployment](https://docusaurus.io/docs/deployment)
- MkDocs 可部署到 Pages 或任何 static host，並警告不要手改 generated branch。[MkDocs deployment](https://www.mkdocs.org/user-guide/deploying-your-docs/)
- Docusaurus 支援版本化，但官方警告它會增加 build 與維護複雜度。[Docusaurus versioning](https://docusaurus.io/docs/versioning)
- TechDocs production recommendation 是每 repo 在 CI 產生 docs、發布到 external storage，再由 central backend 讀取。[TechDocs architecture](https://backstage.io/docs/features/techdocs/architecture/)
- Backstage Catalog 的 component source of truth 是 source control 內的 metadata YAML。[Backstage Software Catalog](https://backstage.io/docs/features/software-catalog/)

**設計結論：**

- 網站、mirror、portal 都是 publication／discovery artifact，不是 authority。
- PR 階段只 build、lint、link、citation、preview；publication 必須吃已核准的 exact source SHA。
- Ron 預設不採「push main 即 deploy」，除非 Grant 明載 side effect；較穩妥是 `workflow_dispatch` 或 protected environment。
- 現況基線通常只要 current docs + Git history；有同時支援多 release line 的真實需求才版本化。
- Mirror 每頁應標出 canonical path、source SHA、generator SHA、generated-at 與「請勿直接編輯」。
- Rogue mirror edit 應 report diff 並停止 publish，不可靜默 back-sync 或覆寫。

## Microsoft Deep Wiki 評估

**官方可驗證：**

- Microsoft `skills` repo 的 Deep Wiki v2.0.0 可產生 catalogue、完整／單頁 Wiki、source-linked citations、Mermaid、VitePress、`llms.txt` 與 Pages workflow。[manifest](https://github.com/microsoft/skills/blob/4f1db7ec55caf11e3b143c91220bd79a632bc55b/.github/plugins/deep-wiki/.claude-plugin/plugin.json)；[README](https://github.com/microsoft/skills/blob/4f1db7ec55caf11e3b143c91220bd79a632bc55b/.github/plugins/deep-wiki/README.md)
- 本輪綁定官方 SHA `4f1db7ec55caf11e3b143c91220bd79a632bc55b`。
- 其 deploy command 預設 `wiki/**` push-to-main 自動部署，並以 `actions/checkout@v4` 等 tag 引用 Actions。[deploy command](https://github.com/microsoft/skills/blob/4f1db7ec55caf11e3b143c91220bd79a632bc55b/.github/plugins/deep-wiki/commands/deploy.md)
- GitHub 官方指出 full-length commit SHA 才是 Action 的 immutable release。[GitHub Actions secure use](https://docs.github.com/en/actions/reference/security/secure-use#using-third-party-actions)

**設計結論：**

- Deep Wiki 是 generator／publication scaffold，不是 business authority、affected-page selector、authorization 或 closeout manager。
- 官方 README 未證明 Ron 所需的 exact write sets、Grant invalidation、candidate review、no-semantic-change reconciliation 或 target verification；Ron layer 仍須負責。
- 採用前需獨立 Issue：pin plugin SHA、review upstream diff、pin Actions full SHA、調整 deploy capability、跑 compatibility tests。
- 現有 Ron v1 把它保留為 optional publication layer 是合理邊界。

## Ron 流程基線

1. **Authority**：repo Wiki 是 current baseline；Issue Change Spec 是 change contract；Authorization Record 是 capability；code/tests 是 evidence；site/mirror/portal 是 derived。
2. **Setup**：只登錄 canonical root、engine exact SHA/protocol hash、build/lint/citation commands、`wiki_support_write_set` 與 baseline ready/missing；不生成或接受 baseline。
3. **Spec**：先讀相關 Wiki/citations；記錄 inherited rules、explicit overrides、unresolved conflicts、`wiki_impact`。
4. **Leaf**：只讀與 review；可記 `pending-baseline-update`；不得生成、修改、mirror 或發布 Wiki。
5. **Closeout preview**：由 aggregate diff、Spec context、citations、reviewer judgement 推導候選頁；人類確認 `wiki_semantic_write_set`；Grant 綁 Lane SHA、target SHA、兩個 set hashes、engine SHA 與 verification commands。
6. **Reconciliation**：Grant read-back 後才 dry-run；只寫核准 pages/support files；無語意變更就留下 explicit evidence。
7. **Candidate**：驗證 sources、citations、links、navigation、build、pending state；有 real diff 才 commit；freeze `integration_candidate_sha`。
8. **Review／integration**：Standards、Spec、Wiki 都 review 同一 SHA；修正產生新 SHA；通過後才 local fast-forward target、驗證並寫 closeout evidence。
9. **Publication**：另行 capability，輸入 exact source SHA，輸出 run ID、URL／artifact identity；不得替代 canonical target verification。
10. **Rollback**：canonical 用正常 revert candidate；derived layer 從先前 verified source SHA 重發；各 proof state分開記錄。

這與現有 [`matt-first-issue-delivery-workflow-spec.md`](./matt-first-issue-delivery-workflow-spec.md)、[`close-issue`](../skills/engineering/close-issue/SKILL.md) 與 [ADR 0003](../docs/adr/0003-review-an-integration-candidate-before-advancing-target.md) 相容。

## 不採用與替代

不採用：

- Native Wiki 直接 edit 作高信任 canonical baseline。
- Code repo 與 Wiki repo 雙 authority，卻只記一個 SHA。
- Generator 自動決定 authority、Issue completion 或 semantic write set。
- Leaf 寫 Wiki。
- Push、deploy、live verification 被合併成「完成」。
- 為少量 repo 先導入 Backstage portal。

若使用者嚴格要求 native Wiki canonical，替代方案必須：限制 direct edit；從 fixed Wiki SHA 工作；Grant 綁 code + Wiki 雙 SHA；push 前重查 drift；兩邊各留 final SHA；任一失敗不關 Issue；用 `gollum`／Wiki webhook 稽核 bypass。它仍弱於 main-repo canonical，且不得宣稱跨 repo atomic merge。

## 來源與限制

主要一手來源已逐段連結；核心來源另列：

- [GitHub Wiki docs](https://docs.github.com/en/communities/documenting-your-project-with-wikis)
- [GitLab Wiki docs](https://docs.gitlab.com/user/project/wiki/)
- [Backstage TechDocs](https://backstage.io/docs/features/techdocs/creating-and-publishing/)
- [MkDocs deployment](https://www.mkdocs.org/user-guide/deploying-your-docs/)
- [Docusaurus deployment](https://docusaurus.io/docs/deployment)
- [Microsoft Deep Wiki at researched SHA](https://github.com/microsoft/skills/blob/4f1db7ec55caf11e3b143c91220bd79a632bc55b/.github/plugins/deep-wiki/README.md)

限制：

- Agent Reach 的 Exa 路徑因本機無 `mcporter` 不可用；GitHub CLI 因現有 credential 無效不可用。
- 已改用 Agent Reach 指定的 Jina Reader、GitHub public API 與官方頁面／repo；未以二手文章支撐結論。
- 本輪未找到 Microsoft Learn 的 Deep Wiki 專屬 product page；採用前應重查官方 repo／manifest／後續 Learn 文件。
- Rolling docs 可能變動；實作前仍需 target account capability probe。
- Native Wiki 是否有與一般 repo 完全相同的 PR／CODEOWNERS／ruleset gate，本輪官方文件不足，必須在 disposable repo 實測。
