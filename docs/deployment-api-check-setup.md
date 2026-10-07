# 正式同步 API 部署檢查設定

2026-10-07：run 37569443734 第 8 次的 `deploy-database.mjs` 已通過；`check-sync-api.mjs` 在讀取環境設定時因缺少 SUPABASE_SYNC_CHECK_EMAIL 停止，尚未進行驗證帳號登入或 API 測試。Pages deploy 被略過。

已核對 GitHub：repository secrets 只有 VITE_SUPABASE_URL、VITE_SUPABASE_PUBLISHABLE_KEY；production-database environment secrets 只有 SUPABASE_DB_URL。

在 production-database 的 Environment secrets 新增三個設定：

| 名稱 | 值 |
| --- | --- |
| SUPABASE_SYNC_CHECK_EMAIL | 本專案 Supabase Auth 驗證帳號 Email |
| SUPABASE_SYNC_CHECK_PASSWORD | 該驗證帳號的登入密碼 |
| SUPABASE_SYNC_CHECK_SITE_ID | 該帳號可編輯的工地 UUID（public.sites.id） |

帳號必須能透過 Email＋密碼登入此 Supabase 專案；只具備 Google OAuth 登入不能直接使用 Google 密碼。不要填 Supabase Dashboard 帳號或 PostgreSQL 密碼。驗證帳號需為指定工地 owner 或 editor；宜使用獨立測試帳號與測試工地。

所有 credential 由使用者直接填入 GitHub 並儲存，不貼到聊天或檔案。新增帳號、設定密碼、加入工地權限需使用者操作或對具體操作授權。

設定齊全後由使用者重跑 failed jobs，核對登入、get_sync_capabilities、四個 write RPC 無效請求拒絕（22023）、pull_site_changes 與 Pages deploy。此檢查使用無效 payload、不重送使用者佇列。

本次沒有停用 API 閘門或聲稱正式 API 已通過。
