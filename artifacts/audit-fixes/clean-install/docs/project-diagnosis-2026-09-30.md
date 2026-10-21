# 專案診斷（2026-09-30）

## 範圍與證據

對照 `docs/system-architecture.drawio`、現有 TypeScript / JavaScript、SQL migrations 與 CI。圖中文字僅作為架構資料。此次未修改應用程式、部署或雲端資料。

- `npm test`：35 個測試檔、158 項通過。
- `npx tsc -p tsconfig.json --noEmit`：通過。
- 直接載入現有 `field-mutations.ts`（以 TypeScript transpileModule 轉譯於記憶體）完成兩項邏輯探針；未新增套件。
- 未執行正式環境、真實 IndexedDB 多分頁、雙帳號、手機、OAuth、SQL 併發及 RLS 行為測試；本次未重新打包。
- 以下「程式確認」代表可從呼叫路徑確認缺口；「時序風險」仍需整合環境驗證發生時機。

## 1. P1：背景同步後，舊畫面會產生回寫覆蓋

證據：`src/main.ts:1189`、`src/data/daily-repository.ts:77`、`src/daily/daily-controller.ts:16`。

背景同步接收日報後，更新 IndexedDB，但 `runBackgroundSync()` 未將 `dailyPulled` 合併回 `daily.report`。`saveDailyDraft()` 卻以最新 partition 與舊的畫面物件比較，將差異全部當作使用者的新修改。`flush()` 即使沒有新編輯也會儲存。

觸發流程：

1. A、B 原本都看到人數 2。
2. A 將人數改成 5；B 背景同步將 5 寫入 partition，但畫面物件仍是 2。
3. B 只改工地名稱，或觸發另一次 flush。
4. 差異同時包含工地名稱與人數 2；上傳後覆蓋 A 的修改。

邏輯探針已實際得到 `set tradeSections/t1/workerCount = "2"`，確認差異回寫機制。尚未進行雙瀏覽器端到端重現。

修正：保存編輯基準或直接記錄使用者欄位操作；先以基準推導本機意圖，再套入最新資料。背景更新需同步 controller，並保留未提交欄位、焦點及游標。

驗收：兩個使用者改不同欄位後，雙方修改均保留；未編輯時 flush 不得生成回復遠端修改的 patch。

## 2. P1：切換工地後，舊同步仍能寫入共用工作區

證據：`src/main.ts:537`、`src/main.ts:1191`、`src/sync/engine.ts:205`、`src/sync/engine.ts:240`、`src/sync/engine.ts:307`。

`activeSyncEpoch` 只在同步結束後阻止 UI 更新，沒有取消同步引擎內部的資料庫寫入。切換工地亦未等待正在執行的同步。水位接收直接清空共用 `water_level_points` / `water_level_logs`；日報接收只判斷日期即覆寫 `live_report_draft`。記憶接收亦寫入共用工作 stores。

觸發：A 工地的網路請求尚未回應 → 切換到 B 或登出 → A 回應完成。即使 UI epoch 檢查丟棄結果，共用 stores 可能已混入 A 資料，後續 B 的 partition capture 可能再保存這些內容。這是程式可達的時序風險，未做網路延遲整合重現。

修正：遠端結果永遠先寫指定 scope 的 partition；更新 active stores 前，在同一資料一致性機制下確認 scope / epoch。切換與同步套用使用共同協調器；多分頁也須納入，不能只依靠單頁變數。

驗收：延遲 A 回應、切 B、釋放 A 回應；B 畫面、工作 stores、partition 與 outbox 都不得含 A 的資料。

## 3. P1：定稿雲端保存未實作，但介面可能宣告完成

證據：`src/main.ts:1048`、`src/data/daily-repository.ts:304`、`src/sync/engine.ts:32`、`supabase/README.md:3`。

`finalizeDailyReport()` 將定稿寫入本機 `daily_reports`；接續同步的是草稿與記憶。`daily-finalization` 只有型別宣告，沒有推送分支、定稿 RPC 或遠端歷史拉取。介面卻用草稿佇列狀態顯示「本機已定稿、已同步雲端」。

本機歷史另有七日清除規則（`src/data/daily-repository.ts:255`）。七日保留可能是既定產品規格，但在使用者誤認定稿已上雲時，會造成無法還原同一份定稿快照的風險。雲端草稿不等同不可變的定稿紀錄。

修正：先明確區分「草稿已同步」與「定稿已備份」；實作不可變定稿 outbox、冪等 RPC 與拉取。保留政策需依定稿實際備份狀態決定。

驗收：A 定稿後，B 可取得相同定稿 ID、文字與 fingerprint；離線或 RPC 失敗不得顯示定稿雲端完成。

## 4. P1：SQL 首次建立文件時，併發修改可能互相覆蓋

證據：`supabase/migrations/202609230001_field_collaboration.sql:63`、`:72`、`:87`、`:94`。

日報與水位 RPC 都先 SELECT FOR UPDATE，再從查到的 payload 建立新 payload，最後 INSERT ON CONFLICT 將 excluded.payload 整份寫回。當文件尚不存在時，兩個交易可能都讀到空文件，各自套用不同 patch；後完成者的 UPSERT 覆蓋前者內容。

此判斷來自 SQL 時序分析，尚未以兩個資料庫連線執行。PostgreSQL 的 FOR UPDATE 鎖定的是 SELECT 取得的資料列；不能將未取得資料列視為已受相同列鎖保護。參考：[官方鎖定文件](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS)。

修正：先確保文件列存在再取得列鎖及讀取 payload，或以 scope/document 的 transaction advisory lock 序列化完整 read-modify-write；冪等檢查也應納入一致的鎖定順序。

驗收：同時首次建立同一天日報、同時建立第一份水位文件；兩組不同欄位／實體都必須保留。

## 5. P2：水位拉取只重播一筆待送變更

證據：`src/sync/engine.ts:313`、`src/data/water-partition.ts:35`。

水位 repository 刻意保留每次離線 patch，但 `applyRemoteWater()` 使用 `queue.find()`，只將其中一筆套用在遠端快照，再覆寫本機水位與 partition。其餘排隊修改未顯示在本機合併結果，也沒有依時間排序取完整序列。

邏輯探針：待送修改分別為 A井→A改、B井→B改；只重播第一筆的結果仍為 B井，完整重播才得到 B改。佇列尚保有第二筆，因此不代表每次都永久遺失；若後續上傳成功可恢復，但上傳失敗、遭阻擋或中斷時本機會回退，繼續編輯可能再產生錯誤 patch。

修正：依序套用該 scope 的全部有效待送 water patches；明訂 failed、blocked、conflict 與 legacy snapshot 的處理規則。

驗收：累積三筆離線修改，拉取其他人的變更，再模擬部分上傳失敗；本機仍需保留所有未確認修改。

## 6. P2：歷史定稿未依帳號／工地篩選

證據：`src/data/daily-repository.ts:256`、`:307`、`:335`。

`listRecentFinalizedReports()` 直接讀取全部本機定稿，只依過期條件過濾；`daily_memory_commits` 也使用全域 `current`。切換工地或登出後，歷史清單仍可混入其他工地資料。兩個 scope 若輸出文字完全相同，亦可能共用去重紀錄而不建立自己的定稿。

這是本機資料隔離缺口，不能等同遠端 RLS 已遭繞過。

修正：定稿及去重索引包含 userId、siteId、reportDate；歷史查詢強制 scope filter；舊資料先備份並標記歸屬不明，不猜測後移動。

驗收：A、B 工地與登出後本機模式的歷史各自獨立；相同文字在不同 scope 不得誤去重。

## 測試與交付缺口

現有測試包含純函式及讀取原始碼字串的契約檢查；158 項通過並未涵蓋上述 IndexedDB、controller、網路及 SQL 的跨層時序。`supabase/tests/001_rls_contract.sql` 檢查表／政策／函式權限存在，但未模擬不同成員對資料列的實際讀寫。

GitHub Actions 目前只跑 npm ci、npm test、build、Pages 發布；migration 為另行套用，架構圖已明示這個邊界。此次未查正式 migration 清單，不能判定正式站缺少哪一版。應增加後端能力檢查與發布驗收紀錄，而非僅依 Pages 成功推定同步可用。

## 建議實作順序

1. 修正 stale controller / patch intent，增加跨層回歸測試。
2. 建立 scope 協調器，隔離切換、拉取與本機持久化。
3. 修正 SQL 首次寫入併發及水位完整重播。
4. 完成定稿雲端協定與歷史 scope 隔離。
5. 執行雙帳號、雙分頁、離線重連、權限撤銷及手機驗收，再發布。

維護方向：從 `main.ts` 抽離 ScopeCoordinator、SyncCoordinator、FinalizationService；沿用既有欄位 mutation、partition 與 outbox，不全面重寫。不需要先引入更多 Agent 或框架；先固定資料所有權與驗收契約，可降低後续維護與 Agent 讀碼成本。
