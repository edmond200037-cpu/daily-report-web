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
