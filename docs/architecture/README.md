# 現行系統架構

分析日期：2026-09-21。範圍為 `daily-report-web` 工作目錄；依程式碼與部署設定分析，未驗證線上部署或實際瀏覽器業務操作。相鄰的 `dailt-report-export` 不因同時位於工作區而視為運行依賴。

## 架構與介面

這是一套 Vite + TypeScript / JavaScript 的純前端 PWA，使用原生 DOM 與 Hash 路由。沒有業務 HTTP API、帳號服務或遠端資料庫；Repository 函式是應用內的資料介面。

| 模組 | 責任與來源 |
|---|---|
| UI 殼層 | `src/main.ts`：路由、畫面、事件、日報定稿編排、JSON 檔案與剪貼簿操作 |
| 日報 | `src/daily/daily-controller.ts`：狀態與 600ms 延遲存檔；validator / output-model / formatter：驗證與文字生成 |
| 領域與格式 | `src/domain/daily.ts`、`src/format/*`：資料型別、建立物件、日期與名稱規則 |
| 記憶與設定 | `src/settings/*`：工種管理與候選審核；實際畫面仍由 main.ts 編排 |
| 日報資料介面 | `src/data/daily-repository.ts`：草稿、定稿、主檔、記憶、JSON 合併匯入 |
| 水位 | `src/water-level/controller.js`：按需載入；parser / calculator / formatter / repository 處理解析、重算與保存 |
| 共用資料邊界 | `src/data/db.js`：唯一 IndexedDB opener，DB_VERSION = 9，管理 migration 與 object stores |
| 離線殼層 | `src/service-worker.ts`：Workbox 預快取；導航先走網路，失敗回退快取 index.html |
| 部署 | `.github/workflows/deploy.yml`：main push / 手動觸發 → npm ci → npm test → npm run build → dist → GitHub Pages |

## 關鍵 Workflow

1. 日報輸入 → DailyController.update → 600ms debounce → saveDailyDraft → live_report_draft。
2. 定稿：UI 驗證與產生文字 → finalizeDailyReport → 文字指紋比對 → 同一交易保存快照、保留草稿、更新記憶與提交紀錄 → 清理過期日報 → UI 複製文字。同一指紋不重複建立快照。
3. 記憶備份：exportMemories → JSON 下載；匯入 → 驗證 → mergeMemoryBackup 合併。排除日報草稿、定稿與水位資料。
4. 水位：手動輸入或貼上文字解析 → saveLog → recalculate → 保存 water_level_logs → 清理三天範圍外紀錄。
5. 更新：GitHub Pages 提供新版資源 → Service Worker 檢查更新 → UI 提示；快取不承載業務資料。

## 維護觀察

- `main.ts` 同時承擔 UI、事件、路由與流程編排，後續可按日報、水位、設定拆出畫面與事件模組，保留 Repository 邊界。
- `src/core/*` 與 `src/db/database.ts` 包含舊版介面；正式入口使用新的 daily 模組，不應將舊 ReportStore 畫成主流程。
- README 的 `_site` 與「定稿後建立新草稿」已落後現行實作：部署使用 `dist`，定稿保留 `retainedDraft`。
- 偵錯 UI 的 databaseVersion 寫死為 4，實際 schema 為 9；可改用共用常數避免漂移。
- 架構圖為模組層級概覽，將型別、格式、驗證等輔助依賴收斂在所屬模組內，非完整 import graph。

## 交付與重建

`system-architecture.drawio` 為可編輯來源；執行 `python generate.py` 可重建。節點的 `data-source` 保留程式來源。

本次只新增架構文件，未修改應用程式碼。圖面 XML 驗證與圖像檢查不代表應用功能測試。

驗證結果：validate.py --score 回報 0 errors / 0 warnings。此環境未安裝 draw.io 桌面版，Edge headless 預覽未成功產出，因此尚未完成實際渲染驗收；不提供未驗證的 PNG。
