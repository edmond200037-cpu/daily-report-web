# 後端遷移：Supabase → Google Apps Script + 試算表

建立日期：2026-10-21
狀態：規劃完成，程式尚未修改；以下未勾選項目均為待辦。
取代：[工地共用後端與跨裝置同步](shared-site-backend.md) 的雲端部分；本機 IndexedDB、outbox 與衝突保存沿用。

## 1. 為什麼搬

- Supabase 免費專案閒置約 7 天會暫停（目前 `construction-daily-report` 狀態為 `INACTIVE`），需人工還原。
- 實際需求只有「同一工地共用一份資料」：記憶主檔、當日草稿、水位。帳號、成員角色與 Realtime 都用不到。
- 參考：`參考/` 內的 GAS 影片（試算表當資料表、Apps Script 部署為網頁應用程式、批次寫入、自動編號）。

## 2. 決策

| 項目 | 決定 |
|---|---|
| 後端 | Google 試算表 + Apps Script 網頁應用程式（執行身分：我；存取：所有人） |
| 登入／成員 | 移除。改用一組共用金鑰，存在 Script Properties；前端於設定頁輸入一次，存本機，**不寫入程式碼或建置產物** |
| 工地範圍 | 一個試算表 = 一個工地；`SharedScope` 改為固定 `userId = 'shared'`、`siteId` 取自設定 |
| 多人編輯 | 沿用現有 revision 比對；衝突不覆蓋，保存兩份（現有 `sync_conflicts`）。以「存檔即同步」縮小衝突窗口 |
| 即時體感 | 存檔後 2 秒同步；回前景、恢復連線、開啟時同步；前景每 30 秒輪詢（後兩項已存在） |
| 保留期 | 草稿超過 3 天移到 `history` 分頁存查；主分頁只放近 3 天 |

不做：Realtime 推送、欄位級合併、個人帳號與權限、附件。

## 3. 現況盤點（2026-10-21，v0.1.0）

雲端依賴只在 7 個檔案：

| 檔案 | 處理 |
|---|---|
| `src/sync/engine.ts`（245 行） | 只換傳輸：`pushOperation` 與 `pullRemoteChanges` 改呼叫 GAS；IndexedDB 寫入、衝突保存、cursor 邏輯不動 |
| `src/sync/context.ts` | 不再讀 Supabase session，改回傳固定 scope |
| `src/data/remote/supabase-client.ts` | 改為 `gas-client.ts`（`fetch` + 金鑰） |
| `src/data/remote/site-repository.ts` | 刪除（建工地、加入、審核、成員） |
| `src/auth/auth-service.ts` | 刪除 |
| `src/account/account-view.ts` | 改為「同步設定」：GAS 網址、金鑰、工地名稱、立即同步 |
| `src/config/runtime-config.ts` | 移除 Supabase URL／key |

資料同步只用 4 個 RPC，對應關係：

| Supabase RPC | GAS 動作 |
|---|---|
| `apply_daily_draft_mutation` | `push`，entity = `daily-draft` |
| `apply_memory_snapshot_mutation` | `push`，entity = `memory` |
| `apply_water_snapshot_mutation` | `push`，entity = `water-snapshot` |
| `pull_site_changes` + 三個 `.from(...).select` | `pull`，直接回傳變更列的 payload（少兩次往返） |

資料是「快照」型：記憶與水位各一列、草稿一天一列，所以試算表列數本來就少。

## 4. 試算表結構

| 分頁 | 欄位 | 說明 |
|---|---|---|
| `entities` | entity、entity_id、report_date、revision、sequence、updated_at、payload | 目前資料。記憶、水位各一列；草稿一天一列 |
| `mutations` | mutation_id、entity_id、status、revision、created_at | `mutation_id` 去重；保留 7 天 |
| `history` | 同 `entities` | 超過 3 天的草稿 |

- **儲存格上限 50,000 字元**：備份實測最大 payload 約 27,000 字元（記憶），先不切欄；`push` 遇到超過 45,000 字元直接拒絕並回報，接近上限時再改成切欄。
- `sequence` 是全工地遞增序號（存 Script Properties），`pull` 只回 `sequence > cursor` 的列，取代 Supabase 的 `site_changes` 表，不會一直長大。
- 禁止手動改 `entities`、`mutations`：設定保護範圍。

## 5. Apps Script 契約

所有請求 `POST`、`Content-Type: text/plain`（避開 CORS 預檢），body 為 JSON：

```text
{ key, action: 'pull', cursor }
  → { rows: [{ entity, entity_id, report_date, revision, sequence, payload }] }

{ key, action: 'push', mutations: [{ mutation_id, entity, entity_id, base_revision, payload }], cursor }
  → { results: [{ mutation_id, status: 'applied'|'duplicate'|'conflict', revision, remote_payload? }], rows: [...] }
```

`push` 規則（全程 `LockService.getScriptLock()`）：

1. 金鑰不符 → 拒絕。entity 不在白名單 → 拒絕。
2. `mutation_id` 已存在 → 回 `duplicate` 與當時 revision。
3. `base_revision` ≠ 目前 revision → 回 `conflict` 與遠端 payload，不寫入。
4. 否則 revision + 1、取新 sequence、寫入、記錄 mutation，回 `applied`。
5. 回應附帶 `pull` 結果，前端一次往返完成送出與拉取。

每日時間觸發器（約數秒）：草稿 `report_date` 早於 3 天 → 移到 `history`；`mutations` 超過 7 天 → 刪除。

## 6. 多人編輯降到最小

衝突只會發生在「兩人在同一個同步空窗內編輯同一天草稿／記憶／水位」。縮小空窗：

- 存檔成功（`DailyController` 回報 `saved`）後 2 秒觸發同步，目前要等 30 秒。
- 回前景與恢復連線先拉取（已存在），編輯前的 revision 是新的。
- 前端已在送出成功後把同實體的排隊操作改成新 revision（`acceptMutation`），不必重做。

真的衝突時，現有程式把兩份都存進 `sync_conflicts` 並停止該操作，但 **v0.1.0 沒有處理衝突的畫面**。需補最小 UI：同步設定頁顯示衝突數，每筆可選「用我的」或「用雲端的」。

## 7. Apps Script 額度（一般 Google 帳號，動工前以官方文件再確認）

| 限制 | 約略數值 | 本案用量 |
|---|---|---|
| 單次執行時間 | 6 分鐘 | 每次請求不到 3 秒 |
| 觸發器總執行時間 | 每天 90 分鐘 | 每日清理約數秒 |
| 同時執行數 | 約 30 | 少數人 × 30 秒輪詢，遠低於 |
| 試算表儲存格 | 1,000 萬格 | 近 3 天資料 + history，遠低於 |

網頁應用程式每次請求約 1–3 秒，不建議輪詢低於 10 秒。

## 8. 資料遷移

備份：`數據庫備份/b_cluster-19-10-2026@01-03-26.backup.gz`（10/19 匯出），解壓後為 2.9 MB 純 SQL（`pg_dumpall` 格式），以 `COPY ... FROM stdin` 區塊讀取，不需要還原 Postgres。

### 8.1 比對結果（2026-10-21）

備份有 16 張 public 表，資料庫已套用比 v0.1.0 更新的 schema。共兩個工地：`鑫天地六`（正式資料）與 `部署驗證專用工地`（測試，不搬）。

| 備份表 | 列數（鑫天地六） | v0.1.0 是否使用 | 搬遷處理 |
|---|---|---|---|
| `memory_snapshots` | 1（rev 2801，**最後更新 9/23**，19 筆） | 是 | **不用**：9/24 已遷移到 `memory_entries`，之後的修改都不在這裡 |
| `memory_entries` | 72（含 11 筆已刪除；最後更新 10/10） | 否 | **轉換**成 v0.1.0 記憶快照，見 8.2 |
| `daily_drafts` | 9（9/22–10/11，最大 8,080 字元） | 是 | 直接搬；全部超過 3 天，進 `history` |
| `water_snapshots` | 1（9/23，2 井位、2 筆量測） | 是 | 直接搬到 `entities`；舊量測由前端三天保留自動清除 |
| `water_points`、`water_logs`、`daily_reports` | 0 | — | 無資料 |
| `memory_learning_events` | 185 | 否 | 不搬；使用次數已存在各筆記憶的 payload 裡 |
| `collaboration_tombstones` | 36 | 否 | 不搬；只是草稿欄位刪除紀錄，草稿本身已反映刪除 |
| `site_changes`、`sync_operations`、`site_sync_state` | 4734、4837、1 | 是（同步內部） | 不搬；新後端用 `sequence` 與 `mutations` 取代 |
| `sites`、`site_members`、`join_requests`、`memory_snapshot_migrations` | 2、4、1、1 | 部分 | 不搬；新版沒有帳號與成員 |

### 8.2 記憶轉換規則

`memory_entries.payload` 與 v0.1.0 快照的每一列欄位完全相同（id、name、status、tradeTypeId、normalizedName、usageCount、finalizedUsageCount…），只需重新分組：

| `kind` | 快照 store | 未刪除筆數 |
|---|---|---|
| `trade` | `trade_types` | 10 |
| `task` | `trade_tasks` | 38（35 confirmed、3 candidate） |
| `vendor` | `trade_vendors` | 11 |
| `site` | `sites` | 2（同名「鑫天地六」，一筆 confirmed、一筆 candidate） |

- 排除 `deleted_at` 不為空的列。
- 其他 store（`material_types`、`location_memories`、`material_memory_items`、`app_settings`）在舊快照也是空的，填空陣列。
- 轉換後約 27,000 字元，低於儲存格上限。
- 同名的 site candidate 照搬，由記憶審核人工處理，不在遷移時自動合併。

### 8.3 草稿相容性

備份草稿的欄位與 v0.1.0 `DailyReportV3`、`TradeSection`、`WorkItem` 一致，只缺 `id`、`createdAt`、`updatedAt`。轉換時補 `id: 'current'`，時間取該列的 `created_at`／`updated_at`。

### 8.4 步驟

1. 一次性 Node 腳本：讀 `COPY` 區塊 → 依 8.1–8.3 轉成 `entities`／`history` 列（revision 沿用、sequence 從 1 起）→ 輸出 CSV，手動貼入試算表或由 Apps Script 匯入。
2. 切換前請每台裝置先用「記憶備份」匯出一次：舊的本機分區以 Supabase 使用者 ID 為鍵，改成 `shared` 後讀不到，未送出的 outbox 也會遺失。

## 9. 待辦

- [x] 解壓備份並比對 schema（第 8.1–8.3 節）
- [ ] 建立試算表與 Apps Script，部署為網頁應用程式
- [x] `apps-script/Code.gs`：`pull`、`push`、每日清理觸發器（已寫；衝突判斷有單元測試，尚未實際部署）
- [x] `src/data/remote/gas-client.ts`，改寫 `engine.ts` 的 `pushOperation`／`pullRemoteChanges`（直接取代，未保留 Supabase 切換：專案已暫停無法並行比對；舊實作留在 git 歷史）
- [x] `context.ts` 固定 scope（`shared`／`shared`）；同步設定頁（`account-view.ts`）
- [x] 存檔後 2 秒觸發同步（`scheduleSyncSoon`）
- [x] 最小衝突處理 UI（「用雲端的」／「用我的」，`resolveConflict`）；由雲端拉取產生的衝突（沒有本機操作）尚無按鈕
- [x] 刪除 `auth/`、`site-repository.ts`、`@supabase/supabase-js` 與對應測試
- [x] 遷移腳本 `scripts/migrate-backup-to-sheet.mjs`（已產出 CSV，筆數吻合 10／38／11／2）
- [ ] 把 CSV 匯入試算表（等 Apps Script 與試算表建好）
- [ ] 驗收：兩台裝置同時編輯同一天、斷線編輯後恢復、重複送出同一 `mutation_id`、payload 超過 45,000 字元被拒絕

## 10. 風險

| 風險 | 程度 | 對策 |
|---|---|---|
| 共用金鑰外洩 = 任何人可讀寫 | 中高 | 不寫入建置產物；外洩時在 Script Properties 換金鑰 |
| 衝突實作錯誤造成靜默覆蓋 | 高 | `LockService` + revision 比對；第 9 節驗收必測 |
| 備份 schema 與程式碼版本不符 | 中→低 | 已比對（8.1）：記憶需由 `memory_entries` 轉換，規則單純；草稿相容 |
| 誤用舊 `memory_snapshots` | 中 | 遷移腳本只讀 `memory_entries`；驗收時比對筆數（10／38／11／2） |
| 切換時本機未送出資料遺失 | 中 | 切換前記憶備份匯出 |
| 試算表被手動改壞 | 中 | 保護範圍；Google 試算表版本記錄可還原 |
| 只能輪詢，非即時 | 低 | 存檔即同步 + 前景觸發，別人更新最慢約 30 秒可見 |
