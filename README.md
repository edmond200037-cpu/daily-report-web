# 施工日報生成器 PWA

離線、手機優先的施工日報與水位變化工具。本機模式使用 IndexedDB；登入並選擇共用工地後，可透過 Supabase 與其他成員同步。

正式入口為 Vite + TypeScript 的 `src/main.ts`；部署 artifact 由 GitHub Pages 載入。

## 架構

- `src/data/db.js`：唯一 IndexedDB 開啟、schema migration 與跨模組資料邊界。
- `src/data/daily-repository.ts`：日報草稿、定稿、記憶與設定的 repository。
- `src/daily`：日報領域、驗證、官方文字 formatter 與控制器。
- `src/format`：日期與名稱格式規則。
- `src/main.ts`：Hash 路由與手機優先的 UI 殼層。
- `src/water-level`：井位、量測、變化量、解析、匯入與三天保留。

## 開發

共用工地的設計背景見[工地共用後端與跨裝置同步](docs/plans/shared-site-backend.md)。

共用工地會透過背景排程與 Realtime 提示觸發同步，也可按「立即同步」。施工日報與水位首頁顯示上次成功取得雲端資料的時間；待同步與衝突操作保存在本機，重新整理後仍會保留。衝突可至「共用工地」查看與處理。

執行 `npm run dev`，並透過 Vite 顯示的網址開啟 `/#daily`；不要直接雙擊 `index.html` 或使用舊的靜態伺服器。

## GitHub Pages

預設使用相對路徑，也支援 `BASE_PATH=/daily-report-web/`；workflow 會將 `dist` 發布為 GitHub Pages artifact。路由使用 Hash Routing，重新整理不會要求伺服器重寫路由。發布前須通過前端與隔離 PostgreSQL 行為檢查。

## 本機資料與備份

瀏覽器開發者工具可在 IndexedDB 的 `construction-daily-report` 查看資料。設定頁的「記憶備份」只包含工種、工項、材料等可重用主檔，採合併匯入；草稿、已定稿日報與水位資料不在備份範圍。Service Worker 只快取應用程式資源，從不快取日報資料。

## 日報定稿

所有工種完成後可選擇「定稿並複製」。系統保存不可回寫的歷史快照，並保留 7 個日曆日；可從「近 7 天」再次複製。當日草稿保留，後續編輯不會改寫歷史快照。記憶學習由有效輸入的套用事件累積。

## PWA 更新

新版部署會更新 Service Worker cache 名稱；舊 App Shell cache 會在啟用新版本時清除，但 IndexedDB 不受影響。

## 已知限制

搜尋、候選確認與記憶重新命名已有實作。舊資料升級採保留原始備份的自動修復；完整 migration 管理 UI 尚未提供。本機測試不代表實機手勢、正式 Supabase OAuth／Realtime 或部署快取已驗收。此次稽核修復與驗證邊界見 `docs/full-repository-audit-fixes-2026-10-05.md`。
