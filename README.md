# 施工日報生成器 PWA

離線、手機優先的施工日報與水位變化工具。所有資料只保存在瀏覽器的 IndexedDB，不需要帳號或後端服務。

正式入口為 Vite + TypeScript 的 `src/main.ts`；部署 artifact 由 GitHub Pages 載入。

## 架構

- `src/data/db.js`：唯一 IndexedDB 開啟、schema migration 與跨模組資料邊界。
- `src/data/daily-repository.ts`：日報草稿、定稿、記憶與設定的 repository。
- `src/daily`：日報領域、驗證、官方文字 formatter 與控制器。
- `src/format`：日期與名稱格式規則。
- `src/main.js`：Hash 路由與手機優先的 UI 殼層。
- `src/water-level`：井位、量測、變化量、解析、匯入與三天保留。

## 開發

執行 `npm run dev`，並透過 Vite 顯示的網址開啟 `/#daily`；不要直接雙擊 `index.html` 或使用舊的靜態伺服器。

## GitHub Pages

部署採相對路徑；workflow 會建立 `_site` 並將靜態檔案發布為 GitHub Pages artifact。路由使用 Hash Routing，重新整理不會要求伺服器重寫路由。

## 本機資料與備份

瀏覽器開發者工具可在 IndexedDB 的 `construction-daily-report` 查看資料。設定頁的「記憶備份」只包含工種、工項、材料等可重用主檔，採合併匯入；草稿、已定稿日報與水位資料不在備份範圍。Service Worker 只快取應用程式資源，從不快取日報資料。

## 日報定稿

所有工種完成後可選擇「定稿並複製」。系統會保存不可回寫的歷史快照，並保留 7 個日曆日；可從「近 7 天」再次複製。定稿後會建立新的當日草稿。

## PWA 更新

新版部署會更新 Service Worker cache 名稱；舊 App Shell cache 會在啟用新版本時清除，但 IndexedDB 不受影響。

## 已知限制

目前首版已具備區塊化輸入、預覽、草稿、歷史、備份與離線殼層；工地、工種、廠商、材料與特殊模板的完整搜尋、候選確認、重新命名與舊資料 migration 管理 UI 尚未完成。
