# 全倉庫稽核修復紀錄

日期：2026-10-05。來源：[2026-10-04 稽核](full-repository-audit-2026-10-04.md)。修復保留既有資料與舊同步協定，未提交 Git、推送或部署正式環境。

## 驗證結果

- 43 個前端測試檔、217 項測試通過，包含舊版 IndexedDB、分區改名、復原、匯入、衝突重送、備份與拉取去重。
- TypeScript 檢查通過。
- `BASE_PATH=./` 與 `BASE_PATH=/daily-report-web/` 的 PWA 建置均通過，含 Service Worker 注入。
- 隔離 PostgreSQL 17.10：43 項行為檢查通過。重播所有 migration 後套用修復 SQL，檢查真實 RLS、跨工地權限、並行首次寫入、冪等重送、最後管理員競態、非法巢狀資料與 tombstone。Auth 採最小測試 shim，並非正式 Supabase Auth。
- 更新依賴鎖定檔：Vitest 4.1.11、Vite 6.4.3 與修補後的間接依賴。`npm audit --package-lock-only --json` 為 0 個漏洞。
- `git diff --check` 通過。CI 已加入隔離 PostgreSQL 閘門與兩種路徑建置；GitHub 上的 workflow 尚未執行。

證據位於 `artifacts/audit-fixes/`：`tests-v4.log`、`typecheck-v4.log`、`build-local.log`、`build-cloud.log`、`database-tests.log`、`npm-audit.json`。

## 修復對照

「本機通過」代表程式碼與本機自動檢查；需要雲端的項目另列，不能推論正式環境已修好。

| ID | 修復 | 狀態 |
|---|---|---|
| F01 | 使用 upgrade event 的 oldVersion；升級至 v18，轉換舊 sections／draft wrapper，保留來源與原始備份；補歷史時間、記憶欄位；無法辨識的形狀不猜測轉換 | 本機通過 |
| F02 | 共用 HTML 跳脫包含雙／單引號；巢狀 ID 輸出跳脫、選擇器使用 CSS.escape；遠端與草稿載入驗證，非法遠端列隔離備份；SQL 欄位、集合、巢狀列與大小白名單 | 前端通過；SQL 待正式 migration |
| F03 | 所有相關寫入 RPC 使用一致的工地交易鎖，首次建立文件也序列化讀取與合併 | 隔離 DB 通過；待 migration |
| F04 | SQL 重送回傳原結果；前端兼容舊 duplicate conflict 回應，保留原始佇列與衝突 | 前端、隔離 DB 通過；SQL 待 migration |
| F05 | 共用模式復原換新父／子 ID，保留內容並更新連結；本機復原維持 ID，避免重複復原 | 本機及 tombstone 行為通過 |
| F06 | 依使用者／工地保留水位 controller；刷新保存未儲存 editor，只補新井位 | 本機通過；手機操作待驗收 |
| F07 | 三天範圍改成顯示篩選；保留歷史基準；明確刪除才排送共享刪除 | 本機通過 |
| F08 | 從完整時間序列重新計算 change；空讀數清空；匯入原文變化量另存 sourceChange，避免衍生值污染合併 | 本機通過 |
| F09 | 衝突頁將 undefined 顯示為「不存在」，不再送入字串跳脫 | 程式修正、整體測試通過 |
| F10 | 建立解決操作前備份；接受解決時同交易永久備份原操作、衝突、解決操作與結果後才清佇列 | 本機通過 |
| F11 | 主檔改名／刪除同交易更新 live、當前 partition 與 outbox；重新合併 controller，避免舊草稿回寫 | 本機通過 |
| F12 | 審核只處理 pending 申請，現有成員不被覆寫；最後管理員檢查與角色／移除操作共用工地鎖 | 隔離 DB 通過；待 migration |
| F13 | UI 與領域共用正數十進位驗證，接受 0.1／0.5，拒絕 0、非有限數與錯誤格式 | 本機通過 |
| F14 | 整段驗證日期、電量、水位與重複井名；井位、量測、partition、outbox 同交易提交；錯誤段不部分寫入 | 本機通過 |
| F15 | 依現行聯絡格式契約校正固定測試 fixture | 本機通過 |
| F16 | 新增真實 PostgreSQL 行為 runner；部署前必須通過 DB job，PR 也會執行 | 本機通過；遠端 CI 待執行 |
| F17 | 每頁同文件只取最後事件，依 sequence 套用；失敗不得越過未處理文件推進 cursor | 本機通過 |
| F18 | 新增驗證工具／資料目錄忽略規則；還原本次產生的 tracked dependency cache | **仍阻擋：node_modules 尚未取消 Git 追蹤** |
| F19 | 更新 README、PRODUCT、詞彙、後端說明與架構文件；舊 ADR／計畫標記歷史，ADR-014 記錄現行契約 | 文件修正 |
| F20 | 更新開發工具與間接依賴，乾淨安裝後測試、型別與雙路徑建置，鎖定檔稽核 0 漏洞 | 本機通過 |

## 可重複執行的檢查

一般環境：

```powershell
npm ci
npm test
npm run build
$env:BASE_PATH='/daily-report-web/'
npm run build
Remove-Item Env:BASE_PATH
npm audit
```

本次因既有 `node_modules` 受 Git 追蹤，使用忽略的 `artifacts/audit-fixes/clean-install` 乾淨安裝驗證新鎖定檔。Windows 沙箱的 Vite realpath 與 Vitest forks 暫存 rename 出現 EPERM；驗證設定只加 `resolve.preserveSymlinks: true`，並以 `--pool=threads` 跑測試。這是驗證環境調整，未修改正式 Vite 設定。原工作區 node_modules 尚未重新安裝，驗證版本以乾淨安裝結果為準。

DB runner 位於 `scripts/db-behavior-tests.mjs`，依賴隔離在 `scripts/db-tests`。只接受 localhost、名稱以 `audit_` 開頭的空白測試資料庫；禁止用正式資料庫執行。CI 用 PostgreSQL 17 service，同樣重播完整 migration 與修復 SQL。原生本機 runner 為 `artifacts/audit-fixes/run-native-db.mjs`；完成後 PostgreSQL 已停止，資料目錄被 Git 忽略。

## 尚未完成的操作

1. **正式 migration 產生與雲端套用**：SQL 在 `supabase/repairs/audit_hardening.sql`。Supabase Skill 要求「always create it with `supabase migration new <name>` first」。本機 CLI 寫使用者 telemetry 暫存檔被沙箱拒絕，備用 CLI 安裝亦失敗；因此沒有捏造 timestamp migration。已提供 `node scripts/prepare-audit-migration.mjs`，在 CLI 可執行環境建立檔名並填入 SQL，不自動部署。對應規則來源：`C:/Users/com29/.codex/plugins/cache/openai-curated-remote/supabase/1.0.0/skills/supabase/SKILL.md:91`。
2. **F18 取消依賴追蹤**：`git rm -r --cached --quiet node_modules` 因 `.git/index.lock` 權限被拒絕。於可寫 Git index 的環境執行相同命令；`--cached` 保留本機依賴檔。完成後確認 `git ls-files node_modules` 為空，再檢查與提交變更。
3. **正式環境驗收**：套用 migration 後確認 owner／editor／viewer／非成員、多裝置衝突、Google OAuth、Realtime、手機未儲存輸入與部署快取。此次未部署、未操作正式工地資料。

## 取捨

工地鎖優先保證舊／新 RPC 與管理操作的一致性，同工地大量寫入會序列化。近三天是顯示限制，歷史水位會持續保留；未來可規劃有備份與明確共享契約的封存流程。拉取去重限單頁，跨頁同文件仍可能再取一次，維持可恢復的 cursor 邊界。

