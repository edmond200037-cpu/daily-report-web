# 資料模型與 Migration

目前 IndexedDB 版本為 1，資料庫名稱為 `construction-daily-report`。核心資料表依責任拆分：`sites`、`trade_types`、`trade_vendors`、`vendor_tasks`、`materials`、`material_specifications`、`special_categories`、`special_templates`、`special_template_variables`、`reports`、`drafts`、`app_settings`、`migration_metadata`。

歷史 `reports` 保存完整結構化 section、名稱快照、輸出文字與完成時間；主檔修改不會回寫報表。`drafts/current` 只保存目前編輯中的草稿。

未來升級 schema 時，必須提高 `DB_VERSION`，在 `onupgradeneeded` 中建立可獨立測試的來源版本轉換函式，並將無法可靠轉換的資料寫入 `migration_metadata`，不得靜默丟棄。
