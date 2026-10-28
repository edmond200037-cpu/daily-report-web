# ADR-015：設定首頁與子頁

取代 ADR-012 的設定導覽部分。ADR-012 以六區頁籤、兩個工作面與次頁籤直達設定，實際在手機上形成四層導覽（頁籤兩列 → 工作面 → 次頁籤 → 重複標題），首屏約一半是導覽；「記憶審核」與其主檔分離，「共用工地」與「偵錯與同步」重複顯示本機模式，「資料與系統」只有一項卻做成清單。

## 決策

- `#settings` 是設定首頁：以分組資料列（日報主檔、水位、共用與同步、資料）列出每個設定頁，每列含名稱與一行說明，最後顯示版本。記憶審核列在日報主檔組首列並顯示待處理筆數。
- 日報主檔每個區段是獨立子頁 `#settings/daily/<section>`（sites、trade-tasks、vendors、locations、materials、templates）；其餘子頁沿用 `#settings/memory`、`#settings/water`、`#settings/account`、`#settings/debug`、`#settings/data`。
- 子頁頁首右側一律為「‹ 設定」返回首頁；只有首頁依來源顯示「返回日報／返回水位」。返回來源在從日報或水位主頁進入首頁時記錄。
- 日報與水位的「設定」入口都連到 `#settings`；日報工地欄的「管理工地」直達 `#settings/daily/sites`。
- 舊 `#settings/daily`、`#daily/settings` 導向 `#settings`。
- 材料類型改用與其他區段相同的頁內表單新增／重新命名，搜尋走既有 IME 安全的 `data-settings-search` 路徑。
- 設定項目列採「名稱｜操作」同列，操作按鈕 ≥ 44px。

## 後果

- 移除 `settings-context-tabs`、`settings-area-switch` 與 `DailySettingsArea`；`settingsHeader(title, home)` 不再接 eyebrow。
- 區段寫入網址，重整後停留在同一子頁；未提交的新增／編輯表單仍是暫態，不寫入網址。
- 共用工地與同步診斷仍是兩個路由，只在首頁同組呈現；未合併為單一頁面。
- 不變更資料模型、備份格式、記憶生命週期與 ADR-005 的資料邊界。

## 第二版

- **首頁四層**：頁首 → 狀態列（`.settings-status`，本機模式／工地名稱與待同步筆數，連到共用工地）→ 待辦列（`.settings-attention`，僅有候選記憶時出現，連到記憶審核）→「主檔」單行列（工種、工項與廠商／位置／材料類型／工地／特殊事項模板／水位井位，無第二行說明）→ 頁尾（備份與還原、同步診斷、記憶審核連結與版本）。
- **清單子頁語言**：工地、位置、材料類型、特殊事項模板、工種頁與水位井位共用 `.settings-toolbar`（搜尋＋「＋ 新增」）、`.settings-row`（單行、點列即編輯）與 `.settings-edit-form`（行內表單：儲存、取消、刪除）。列上不再放編輯／刪除按鈕；刪除只出現在編輯表單，確認流程不變。搜尋沿用 `data-settings-search`／`data-trade-search` 的 IME 安全路徑。
- **廠商併入工種頁**：`#settings/daily/vendors` 導向 `#settings/daily/trade-tasks`；展開工種後分「工項」「廠商」兩個子清單，另有「編輯工種名稱」（含刪除工種，兩段確認不變）。表單用暫態 `settingsState.editingKind`（`trade`／`tasks`／`vendors`）分派，不進 dirty 與同步。廠商清單包含候選項目並保留「確認」。
- **移除設定頁工種左右滑動**：刪除 `settings-trade-swipe` markup、事件、狀態與 CSS；日報頁的滑動刪除不受影響。
- **井位行內表單**：水位控制器以暫態 `pointEditing`（`null`／`'new'`／井位 id）控制新增與編輯表單，不再使用 `prompt()`；編輯表單送出走 `update-point`。
- 記憶審核、共用工地、同步診斷、備份頁只統一外框（透明、無圓角，僅上下細線），內部結構不變。
- 不變更資料模型、備份格式、記憶規則與同步邏輯。

## 第三版

- **材料類型詳情**：點材料類型列在原位展開詳情面板（非彈窗），含品名、規格、供應商、單位四個區塊（雙欄，窄於 340px 單欄），列出該類型記住的值（候選加標記，依最近使用排序）。點值開行內表單，可改值或刪除（刪除沿用 `rejectMaterialMemoryItem`，確認文案說明只清空目前草稿、不動定稿）。面板底部有「重新命名類型」「刪除類型」，沿用既有流程。展開／編輯狀態是純 UI 暫態（`expandedMaterialTypeId`、`editingMaterialItemId`），不進 dirty 與同步。
- **`updateMaterialMemoryItem`**：單一交易就地更新同一筆 id 的 `value`／`normalizedValue`／`updatedAt`，保留 id、狀態與使用次數，使同步依 id 判為更新而非刪除再新增；同欄位值重複或空值拒絕；草稿中同材料類型且舊值相同的進料欄位與 `recentUnit`／`recentSupplierName` 一併改寫；定稿快照不變。
- **未做**：詳情面板的「＋ 新增」記住值。repository 沒有可繞過使用次數規則的公開新增函式，不自行發明寫入路徑。
- **表單樣式對齊日報**：設定表單的標籤間距與輸入框高度（44px）對齊日報進料編輯器；位置表單標題「位置」、提示「例：東側」與日報相同；工地、工種、工項、廠商、模板標題為「○○名稱」「模板內容」。
