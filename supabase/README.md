# Supabase 第一版後端

目前 migration 建立帳號工地、成員、共用資料表、RLS，以及施工日報草稿、記憶快照與水位快照的冪等推送／增量拉取。雲端定稿 RPC、完整備份還原與真實 Supabase 環境驗收尚未完成，不能把本目錄存在視為已正式上線。

## 本機驗證

安裝 Supabase CLI 後，在專案根目錄執行：

```powershell
npx supabase init
npx supabase start
npx supabase db reset
npx supabase test db
```

若 `supabase/config.toml` 已存在，略過 `supabase init`。

接著複製 `.env.example` 為 `.env.local`，填入本機或雲端專案的 URL 與 publishable key。禁止將 service role／secret key 放進任何 `VITE_*` 變數。

## 雲端設定

1. 在使用者自己的 Supabase 專案套用 `supabase/migrations/`。
2. 在 Auth 啟用 Google provider，設定 Google OAuth client。
3. Redirect allow list 加入本機網址與正式 GitHub Pages URL，含 `?auth_callback=1` 回呼；帳號介面位於設定中的共用工地。
4. 在 GitHub Pages build 設定 `VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY`。
5. 先以兩個測試帳號驗證非成員、viewer、editor、owner，再導入實際工地資料。

未設定兩個環境變數時，應用程式維持原本的本機模式。

## 稽核修復與隔離檢查

`supabase/repairs/audit_hardening.sql` 與同步能力檢查已收回 CLI 產生的 `20261006143609_sync_maintenance.sql`，尚未套用正式環境。CI 現在只載入正式 migrations，不再額外套用 repair。repair 檔保留作事件來源佐證，不需要再用舊 prepare 腳本產生重複 migration。

隔離 PostgreSQL 行為檢查：先 `npm ci --prefix scripts/db-tests`，設定 `AUDIT_DATABASE_URL` 為 localhost 上空白且名稱以 `audit_` 開頭的測試資料庫，再執行 `node scripts/db-behavior-tests.mjs`。腳本拒絕遠端與非測試名稱；CI 建立 PostgreSQL 17 service 執行同一檢查。Auth 使用測試 shim，不能代表真實 OAuth 或 Realtime 驗收。

## 同步維護發布（0.1.3）

Pages 發布前會執行資料庫 history 預檢、migration dry-run／套用及真實 Data API 契約檢查。缺少設定或檢查失敗會停止前端發布。正式站已手動建立部分後續資料表，但 history 尚未登記；先逐一比對正式函式、資料表與遷移內容，再整理 history，禁止只憑資料表存在就自動標記遷移完成。

在 GitHub 的 `production-database` Environment 或 repository secrets 設定 `SUPABASE_DB_URL`（密碼須 URL 編碼）、`SUPABASE_SYNC_CHECK_EMAIL`、`SUPABASE_SYNC_CHECK_PASSWORD`、`SUPABASE_SYNC_CHECK_SITE_ID`，並沿用現有 `VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY`。API 檢查帳號須為指定驗收工地既有 editor／owner；不使用真實工作資料做寫入測試，也不自動建立帳號或授權。檢查送出的刻意無效請求必須回傳 22023，才表示真正的 API 簽名與驗證可用；變更讀取結果不寫入 log。

CLI 固定 2.119.0，僅停用 CLI telemetry／更新通知以利受限環境執行。正式服務需另確認 migration history、PostgREST cache、登入角色與手機舊 PWA 相容性；本機 DB 測試不能取代線上驗收。完整修復紀錄見 `docs/sync-maintenance-implementation-2026-10-06.md`。
# 工地記憶逐筆化（202609230002）

部署 `202609230002_memory_entries_sync.sql` 前先備份資料庫。遷移會在同一交易內，把每個 `memory_snapshots` 的工地、工種、廠商、工項、位置、材料與特殊事項模板複製到 `memory_entries`，驗證筆數及 JSON 內容後記錄於 `memory_snapshot_migrations`。遇到重複 ID、父層遺失或內容不符會讓整個交易失敗，原快照仍在。其他 `app_settings` 偏好不會上傳。

部署後檢查：

```sql
select m.site_id, m.snapshot_revision, m.source_count, m.migrated_count, m.content_hash,
       (select count(*) from public.memory_entries e where e.site_id=m.site_id) as current_rows
from public.memory_snapshot_migrations m;
```

舊 `memory_snapshots` 保留做回復來源；舊版整份記憶寫入 RPC 已停止對登入者開放。若需回復，先停用新版客戶端並匯出目前 `memory_entries`、`sync_operations`、`site_changes` 與本機衝突備份，再以原快照重建測試環境核對，不直接覆寫正式站的逐筆修改。

實際驗收需在部署後用兩個編輯者、一個檢視者與兩台手機進行。檢查不同記憶同時修改、同筆衝突、確認／駁回傳遞、離線佇列重送、模板同步及本機匯入預覽。自動測試不能取代這項驗收。

## 函式存取權限（匿名角色）

Supabase 會把新函式的 EXECUTE 直接授權給 `anon` 與 `authenticated`，所以舊 migration 的 `revoke … from public` 擋不住匿名呼叫。`20261008150000_revoke_anon_function_access.sql` 會撤銷 `public` schema 內所有非擴充套件函式對 `anon`／`PUBLIC` 的執行權，並保留原本 `authenticated` 的授權；之後新增的函式也預設不再對匿名開放，新函式需明確 `grant execute … to authenticated`。套用前後都請執行 `supabase/diagnostics/function-exposure.sql`，確認每一列的 `anon_execute` 為 false。寫入 RPC 也一律先驗證登入與編輯權限，才取得工地鎖與解析 payload。
