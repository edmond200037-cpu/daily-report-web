# 施工日報生成器 PWA

離線、手機優先的施工日報與水位變化工具。所有資料只保存在瀏覽器的 IndexedDB，不需要帳號或後端服務。

目前正式入口為原生 ES Module，不依賴 Vite、框架、外部 CDN 或 npm runtime；可直接由 GitHub Pages 載入。

## 架構

- `src/core`：草稿、驗證、純文字 Renderer、備份服務。
- `src/modules`：區塊模組的資料與模板邏輯。
- `src/db`：單一資料存取邊界與 IndexedDB schema。
- `src/format`：日期與名稱格式規則。
- `src/main.js`：Hash 路由與手機優先的 UI 殼層。
- `src/water-level`：井位、量測、變化量、解析、匯入與三天保留。

## 開發

可使用任何靜態 HTTP 伺服器開啟專案根目錄，例如 `python -m http.server 8080`。請透過 `http://localhost:8080/#daily` 開啟，不要直接雙擊 `index.html`。

## GitHub Pages

部署採相對路徑；workflow 會建立 `_site` 並將靜態檔案發布為 GitHub Pages artifact。路由使用 Hash Routing，重新整理不會要求伺服器重寫路由。

## 本機資料與備份

瀏覽器開發者工具可在 IndexedDB 的 `construction-daily-report` 查看資料。要清除所有本機資料，使用瀏覽器網站資料設定；匯入前請先從「備份」頁下載完整備份。Service Worker 只快取應用程式資源，從不快取日報資料。

## PWA 更新

新版部署會更新 Service Worker cache 名稱；舊 App Shell cache 會在啟用新版本時清除，但 IndexedDB 不受影響。

## 已知限制

目前首版已具備區塊化輸入、預覽、草稿、歷史、備份與離線殼層；工地、工種、廠商、材料與特殊模板的完整搜尋、候選確認、重新命名與舊資料 migration 管理 UI 尚未完成。
