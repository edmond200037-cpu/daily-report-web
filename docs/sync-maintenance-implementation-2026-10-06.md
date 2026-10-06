# 同步維護修復紀錄（0.1.3）

## 已實作

- 缺 RPC 恢復入口統一處理 PGRST202／42883；先呼叫會員限定的唯讀能力檢查，確認對應 RPC 存在、參數一致且可執行，才重排操作。原 mutationId、payload、baseRevision 保留，不將套用事件改成普通 mutation。
- 記憶衝突先按 ID 查詢；ID 不存在才依目前工地、記憶種類、父工種映射與同名自然鍵查詢。已刪除記憶保留 tombstone；查無資料時以 revision 0 呈現，不沿用不存在資料的舊版本。
- 記憶衝突改成完整本機／雲端版本選擇。身分、normalizedName、狀態及父子關係不完整時拒絕排送；確認前重新查雲端並比較內容。選本機的套用事件保留 learning_key；原事件與使用者選擇仍留在備份。
- 雲端 ID 採納改成先取得並驗證回應，再在同一 IndexedDB transaction 更新記憶／父子引用、備份、清除已解決來源。讀取失敗保留原請求，可使用相同 mutationId 重送。
- 用 Supabase CLI 產生 `20261006143609_sync_maintenance.sql`，收回稽核修復與能力檢查；資料庫 CI 預設只套用 migrations，不再額外載入 repair。
- GitHub Pages deploy 依賴 DB 部署與 Data API 驗證。部署前以唯讀檢查拒絕「資料表已手動安裝但 migration 未登記」的已知情況；不自動補登 history，也不重播這些 DDL。
- 新增部署及 API 檢查腳本。API 以刻意無效請求驗證實際函式可見性、參數與權限，不寫測試日報；session 僅登出該次檢查的本機 session。
- 保留同一工作階段先前的聯絡事項數量／規格記憶篩選修正；版本提升至 0.1.3。

## 驗證結果

- TypeScript 通過。
- 全部 46 個前端測試檔、232 項測試通過。
- 全新隔離 PostgreSQL 17.10、migrations-only、47 項資料庫行為檢查通過。涵蓋 RLS、去重、並發、第四次自動確認、刪除記憶不重計次、repair 重跑保留既有資料，以及 history 漂移拒絕部署。
- `BASE_PATH=./` 與 `/daily-report-web/` 建置通過。
- JavaScript 部署腳本語法與 diff 空白檢查通過。
- Windows 一般 Vite／Vitest 有既有 EPERM 限制；本次使用既有 artifacts 設定的 preserveSymlinks 驗證，不更改正式 Vite 設定。隔離 DB 使用 auth.uid fixture，不能代表正式 OAuth、Realtime 或手機操作驗收。

## 正式環境阻擋

本次可取得正式資料表清單與 migration 清單。memory_entries、memory_learning_events、collaboration_tombstones 已存在且啟用 RLS；migration history 仍僅到 202609210006。這證明有手動 schema 安裝與 history 登記落差，但不能用表存在推定全部遷移內容已套用。

Supabase execute_sql 唯讀查詢與 apply_migration 正式套用均被工具拒絕，理由是此工作階段核准政策為 never。未修改正式資料庫，也未重送線上 33 筆來源。Git 建立 codex/sync-maintenance 分支亦因 .git refs 寫入權限失敗；未 commit／push／發布。

## 恢復正式環境的操作順序

1. 使用有正式維護權限的工作階段讀取函式與 schema 定義，執行 `supabase/diagnostics/sync-preflight.sql`，匯出本機衝突備份。
2. 逐一比對 202609230001 之後的 migration 與已手動安裝的內容。確認一致才由維護流程整理 migration history；缺少的內容先用正式 migration 補齊。不能只補上 version 字串以略過部署檢查。
3. 確認前置 schema 完整後套用 `20261006143609_sync_maintenance.sql`。隔離測試已驗證再次套用這份修復不改寫既有記憶資料，但正式環境仍須取得真實定義證據。
4. 設定 `production-database` 的部署連線與既有驗收帳號 secrets，詳見 `supabase/README.md`。commit／push 後讓 DB 部署、Data API gate、Pages 部署依序執行。
5. 線上更新至 appVersion 0.1.3 後，使用「檢查並安全重試」重排缺 RPC 的操作；逐筆處理真正的內容衝突，再驗證兩台裝置一致。

此次沒有放寬核准政策、繞過 MCP 拒絕、清除 IndexedDB 或盲目採用雲端版本。
