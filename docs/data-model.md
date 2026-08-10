# 資料模型與 Migration

資料庫名稱為 `construction-daily-report`，目前 `DB_VERSION = 7`。所有 IndexedDB 連線必須經過 `src/data/db.js` 的 `openDatabase()`；日報、記憶與水位不得自行以不同版本開啟資料庫。

## Bounded contexts

- **Daily Reporting**：`live_report_draft` 是唯一可編輯草稿；`daily_reports` 是定稿快照，包含結構、官方模板輸出文字、模板版本與 `finalizedAt`。
- **Reusable Memories**：工地、工種、工項、廠商、位置、材料類型、材料候選及特殊模板。名稱以標準化欄位去重。
- **Water Level**：井位、量測、讀值；不會寫入日報或記憶備份。
- **App Platform**：PWA、路由、診斷與 migration metadata。

## 保存與遷移規則

- 定稿快照不可被主檔重命名、刪除或草稿編輯回寫；在第 7 個日曆日自動清除。
- 記憶備份的 schema 為 `memories@1`，只包含記憶主檔；匯入採合併去重，絕不覆蓋草稿、定稿或水位資料。
- schema 變更必須提高 `DB_VERSION`，並由 `runMigration()` 開啟資料庫以執行唯一的 `onupgradeneeded` 路徑。無法安全轉換的資料不得靜默刪除。
