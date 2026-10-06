# 線上同步修復與維護方案

日期：2026-10-06。狀態：研究完成、方案待實作。此次僅新增研究文件與唯讀 SQL，未修改同步執行程式、正式資料庫或發布流程。

## 決策

沿用 IndexedDB outbox、Supabase RPC、版本檢查與變更游標。先補齊「資料庫與前端一起驗證發布」「確定性錯誤自動復原」「真正衝突人工處理」。目前缺口沒有證據顯示需要新增 API server 或更換同步平台。

維護目標：正常使用者只需看到「已同步／等待網路／系統待更新／需要選擇版本」。維護者以一份契約、一條發布流程與一份匿名摘要判斷問題，不必每次貼整包修復 SQL。

## 證據與限制

| 發現 | 證據 | 判斷 |
|---|---|---|
| 線上仍顯示 33 筆操作，其中 21 筆 PGRST202、11 筆衝突、1 筆待送 | 共用工地頁本次唯讀觀察 | 代表保存的操作狀態；不是本次發出 RPC 的結果 |
| 前端呼叫 apply_memory_application，但正式發布流程沒有 migration 部署步驟 | src/sync/engine.ts；.github/workflows/deploy.yml | 從 repository 確認缺少發布關卡；是否另有外部部署未知 |
| 測試資料庫多載入一份 repair SQL | scripts/db-behavior-tests.mjs:13、65–68 | 測試環境與 migrations-only 環境可能不同 |
| DB 測試有一般記憶 mutation，但未直接呼叫 application RPC | scripts/db-behavior-tests.mjs:163–165 | 事件去重、使用次數累計缺少這一層行為驗證 |
| 記憶衝突只按 ID 查雲端 | src/sync/conflict-review.ts:45 | ID 變更時無法呈現同名雲端對象；尚未證明所有線上衝突皆由此造成 |
| 查不到 ID 時回用舊 conflict.remoteRevision | src/sync/conflict-review.ts:55 | 要區分不存在、已刪除、同名不同 ID，不能把空物件當可直接送出的記憶 |
| 手動重試只重排 PGRST202 | src/sync/outbox.ts:61 | 42883 等同類錯誤沒有一致恢復入口；重試前也沒有契約預檢 |
| 先確認成功並清除來源，之後才查雲端、採納不同 ID | src/sync/engine.ts:448–459 | 若後續查詢或採納失敗，可能重新放回原操作；需故障注入驗證與收斂原子性 |

正式資料庫函式定義、migration history、11 筆衝突的實際原因仍為 NEEDS VERIFICATION。上一輪 Supabase 唯讀 SQL 被核准政策拒絕，本次不繞過限制。舊記憶筆記只用於定位 recovery 模組，現行結論以本次原始碼為主。

## P0：恢復這次待同步資料

1. 匯出本機 outbox、conflicts、recovery backups；記錄操作數量與前端版本。永久備份保留，不清除 IndexedDB。
2. 執行 supabase/diagnostics/sync-preflight.sql，核對函式完整型別、參數名稱、登入角色執行權限、必要資料表及 migration history。SQL 不檢查 PostgREST cache，不能單獨作為通過判定。
3. 缺少函式或資料表：先比對正式 schema 與 repository，整理正式 migration。現有 restore-memory-application.sql 只是應急來源，有前置資料表需求，不能在不確認 schema 的情況下盲貼；也不要竄改歷史 migration。
4. 函式存在而 API 仍報 PGRST202：核對前端是否連到正確 Supabase project、Data API schema、參數名稱及 overload；依管理流程更新 schema cache，再驗證 API。cache reload 不會建立缺失函式。
5. API 驗證通過後只重排缺 RPC 的操作，保留原 mutationId、payload、baseRevision；這是同一請求的重送，不能讓事件重複累計。
6. 逐筆分類 11 筆衝突。先按 ID，再按工地／kind／有效父 ID／normalized_name 查同名資料。確認工種 ID 對應後，才能處理廠商與工項。
7. 衝突解決採新操作 ID，備份原操作與選擇結果；新操作成功前保留舊操作。禁止全選雲端或將所有 baseRevision 改 0。
8. 同步後對帳：來源操作均有成功回應或備份與解決紀錄，工種父子關係正確，使用次數沒有重複增加，兩台裝置可取得一致記憶。

PGRST202 可能代表函式不存在或 cache 內簽名過期，並非只代表漏 migration。依據：[Supabase 錯誤碼](https://supabase.com/docs/guides/api/rest/postgrest-error-codes)。PostgREST 提供 `NOTIFY pgrst, 'reload schema'`，實際服務版本與通知設定需核對：[Schema cache 官方說明](https://docs.postgrest.org/en/v10/schema_cache.html)（此引用為 v10，命令須按正式服務版本確認）。

## P1：建立可維護發布流程

建議流程：PR 靜態與行為檢查 → migrations-only 新資料庫重建 → 升級情境測試 → 正式 schema 差異預覽 → 套用相容 migration → SQL 契約檢查 → Data API 驗證 → 前端雙 BASE_PATH 建置與發布 → 線上版本與功能驗證。

- migration 是正式 schema 的單一可重建來源。應急修復確認後回收到新的 migration，保留修復來源作歷史佐證，停止讓 CI 預設額外載入 repair。
- 先用 CLI 產生 migration 檔名；整理已在正式站手動套用的變更，核對內容後才調整 history，不能直接把所有未記錄檔案重新推送。
- 新增 DB deploy job；Pages job 依賴 DB deploy 與 API check。失敗時不發布依賴新函式的前端，產出維護摘要。
- 資料庫變更先維持舊 PWA 呼叫相容。新增函式、參數使用安全預設或版本化入口；待舊客戶端淘汰後才移除舊入口。資料庫成功、Pages 失敗時仍需支援舊版。
- CLI 版本固定；部署憑證只存 GitHub Environment secrets。維護者權限與前端 publishable key 分開，前端不得放 DB 密碼或 service role。
- 起步用本機隔離 DB＋正式環境，若已有 staging 則加入 staging 驗證；不為這次研究建立額外付費服務。

Supabase 官方建議以 GitHub Actions 與 migrations 管理環境：[Managing Environments](https://supabase.com/docs/guides/deployment/managing-environments)。具體 gating 與相容性順序是本專案的設計建議。

## P2：把復原規則集中在小模組

| 建議模組 | 職責 | 沿用位置 |
|---|---|---|
| sync/contract.ts | RPC 名稱、參數、operation 類型與能力需求；供前端 dispatch、CI 檢查共用 | engine.ts 的多段 RPC 選擇 |
| sync/health.ts | 登入／切工地／手動同步檢查能力；短期快取，失效時再查 | 缺少預檢 |
| sync/recovery-policy.ts | 純函式產出等待、重排、採納 ID、人工衝突計畫 | error-diagnostics.ts、recovery.ts |
| sync/memory-identity.ts | 同名比對、父 ID 映射、刪除狀態、payload 等價性 | memory-entries.ts、recovery.ts |
| sync/diagnostics.ts | 分類數量、版本、RPC、失敗原因與下一步；預設排除原文 | account-view.ts |

先新增穩定邊界與回歸測試，再搬移既有邏輯；不要同時重寫整個 engine。所有復原 plan 附 scope、來源指紋、雲端版本及來源操作 ID，執行前重新確認。

### API 契約提案

新增唯讀 `get_sync_capabilities(p_site_id)`，驗證登入與工地檢視權限，回傳 `contract_version`、`capabilities`、`schema_revision`。前端只要求該操作所需能力；不足時保留本機操作並顯示待維護。此 RPC 回應不能證明 PostgREST 可呼叫其他函式，CI 還需檢查實際 API；健康 RPC 本身不存在時也須可顯示維護狀態。

原有 RPC 先保持相容，逐步補可選欄位：`conflict_reason`（revision_mismatch／missing_entity／deleted_entity／parent_missing／identity_changed）、`canonical_entity_id`、`remote_revision`。舊前端忽略新增欄位；新前端不依賴英文錯誤字串做決策。維護 SQL 驗證函式來源與 catalog；登入 API 檢查驗證可見性。

### 自動與人工邊界

| 情況 | 處理 |
|---|---|
| 網路、timeout、40001、40P01 | 有界退避與 jitter，原請求識別重送；網路恢復或手動可提前 |
| 缺 RPC／協定不相容 | 暫停需要該能力的操作；健康檢查確認能力恢復才重排，不讓每筆重打失敗 RPC |
| 父記憶尚未同步 | 等待父層；父層失敗需顯示具體依賴原因 |
| 同名不同 ID | 先核對父 ID；映射本機 ID 與子項，備份舊操作；學習事件要保留 learning_key，不可只刪掉來源 |
| 重複已成功事件 | 以服務端去重紀錄確認再 ack，不用 payload 相同推定學習已計次 |
| 真正內容修改衝突 | 顯示名稱、工種、狀態與可理解差異；使用者決定，CAS 再確認 |
| 已刪除或明確拒絕記憶 | 不自動復活，必須人工判定 |
| 查不到原 ID | 查同名及父 ID 映射，區分不存在與 tombstone；未確認前保留原文 |
| 權限或資料格式錯誤 | 分類停止，指出成員權限或操作格式問題；不放寬 RLS |

不能把套用記憶事件換成一般 mutation 作為 fallback：套用事件有獨立使用次數與去重語意。真正變更 request payload／ID／baseRevision 時應以新 mutationId 表達新請求，保留穩定 learning_key；純 timeout 重送則保留原 mutationId。

同名採納、父子重綁、版本更新、備份及 ack 應在一個 IndexedDB transaction 提交；雲端讀取先在 transaction 外完成，提交前檢查來源是否改變。對回應遺失與跨頁重啟加入測試，避免先 ack 後採納失敗的中間狀態。

## 維護介面

主要顯示四種狀態及數量，單一「檢查並安全重試」入口。先診斷，再預覽可自動復原與需人工項目。人工記憶衝突以「工種／工項名稱／本機與雲端狀態」呈現，ID、kind、usage_count 不提供獨立選單任意拼接；雲端空內容不可產生空 payload。原始 JSON 收在維護詳情。

匿名診斷包含 appVersion、contractVersion、錯誤分類、操作種類與數量、操作等待時間、最後 pull 成功時間。不含記憶原文、登入 token、加入碼或精確位置；完整備份由使用者主動匯出。

## TODO 與驗收

- [ ] P0：讀取正式 schema、migration history；確認這次 21／11／1 的處置。
- [ ] P1：修復 SQL 收回正式 migration；migrations-only CI 不額外載入 repair。
- [ ] P1：新增 DB deploy、契約與 API gate，再接 Pages。
- [ ] P1：測試 application 首次寫入、同事件不同 mutationId、不同事件並發、第四次確認、人工確認／刪除語意。
- [ ] P2：健康與錯誤分類模組，缺能力的操作統一暫停與復原。
- [ ] P2：同名身分查找、父子映射、原子備份與 ack；人工衝突改語意選擇。
- [ ] P2：測試送出成功但回應遺失、採納時失敗、同筆連續離線編輯、跨裝置新增同名、ID 不存在與刪除。
- [ ] P3：匿名維護摘要與可對帳的復原紀錄。
- [ ] 驗收：兩台裝置並行與離線往返、舊 PWA 更新、切工地、檢視者無寫入權限；以上與本機測試分開記錄。

完成標準：不遺失來源、不重複計次、不復活已刪除記憶；本機與雲端記憶身分及父子引用一致；schema gate 失敗不發布新前端；回應遺失後可收斂。不是只要求待同步數字歸零。

## Codex 執行分工與成本

未在本次啟動多 Agent。後續可按三個提交批次處理：資料庫與發布契約、前端復原 policy、介面與兩裝置驗收。若啟用多 Agent，DB／同步／UI 分別擁有檔案，協調者負責共用契約與整合，不讓多個 Agent 同改 engine.ts。

專案規則放 AGENTS.md 或 .agents/skills；不要為未使用的工具增加 Cursor Rules。規則集中：不清除 outbox、不覆寫歷史、RPC 相容、不用維護金鑰於前端、新解決操作成功前保留來源。

先讀本文件、contract 與匿名診斷，只提供相關操作與失敗測試給 Agent；避免每次搬入所有 migration、整庫 JSON 或帳號資訊。CI 的契約與行為結果作為證據，只有無法分類的個案才擴大調查。同步資料處理使用確定性程式，不加入 LLM runtime 呼叫。
