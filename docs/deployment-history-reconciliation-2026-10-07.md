# 部署版本紀錄修復交接

依使用者匯出的 deployment_history_report 比對正式資料庫；未直接查詢或修改正式資料庫。

## 發現

- migration history 登記到 202609210006，未登記 202609230001、202609230002。
- collaboration_tombstones、memory_learning_events、memory_snapshot_migrations 的欄位、約束、索引、RLS、讀取 policy 符合兩份原始 migration。
- collaboration_apply_array、collaboration_apply_change、apply_daily_field_mutation、apply_water_field_mutation 的 body 符合原始檔。
- apply_memory_entry_mutation 符合已知的 20260930040002 版本；不回退此函式、不以單一函式推定較新的 migration 全部已套用。
- 日報、水位寫入函式 anon_execute=true；修復時撤除 PUBLIC 與 anon 的寫入函式執行權，保留 authenticated。
- Realtime site_changes 已發布，authenticated 無法呼叫舊 snapshot 寫入。
- 匯出報告未包含 snapshot import ledger 的資料；修復 SQL 必須執行時驗證來源 ID、搬移版本、數量與來源內容雜湊，不能假設搬移完成。

## 執行

1. 在正式專案 SQL Editor 執行 `supabase/repairs/reconcile-deployment-history.sql` 的完整內容。
2. 任一 guard 失敗會回滾；回傳錯誤供調查，不略過 guard、不重新執行舊資料搬移。
3. 成功回傳兩筆 `history_repair_complete` 後，由使用者重跑 GitHub 部署。
4. 確認 database-deploy、check-sync-api 及 Pages deploy 均通過後再驗證線上 UI。

SQL 只補登兩個 baseline 版本、收回匿名寫入權限及通知 PostgREST；不寫入日報、記憶、使用次數或 outbox。後續 migration 仍由現有 CI 執行。

## 驗證與限制

隔離 PostgreSQL 17 測試通過：函式漂移時停止且不補 history、缺少搬移 ledger 時停止、正確 ledger 時補登兩個版本並保留記憶資料和成員權限、重跑不重複登記。完成後測試伺服器已停止。

正式 SQL 尚未執行、部署及 Data API 尚未驗證。Supabase execute_sql 自動核准被 approval policy never 拒絕，需使用者執行交接 SQL。

依 Supabase [migration repair 文件](https://supabase.com/docs/reference/cli/supabase-migration-repair)，applied 狀態為 history 新增登記；此處以附完整前置檢查的交易處理兩個已安裝 baseline。
