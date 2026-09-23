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
3. Redirect allow list 加入本機網址與正式 GitHub Pages URL；應用程式回呼落在 `#account`。
4. 在 GitHub Pages build 設定 `VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY`。
5. 先以兩個測試帳號驗證非成員、viewer、editor、owner，再導入實際工地資料。

未設定兩個環境變數時，應用程式維持原本的本機模式。
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
