# 定稿記憶提交與草稿保留實作計畫

## 目標

依 ADR-011 將「定稿且複製」改為唯一自動記憶提交點，保留完整草稿與完成狀態，以輸出內容指紋避免重複快照／重複計次，並在候選跨三次不同定稿後自動確認。

## 明確邊界

- 不改變 local-first、IndexedDB、七日定稿快照與記憶備份的資料所有權。
- 不修改官方輸出格式、材料連接模型或水位模組。
- 人工在設定中心新增的主檔仍立即為 `confirmed`。
- 自動填入與一般建議只讀取 `confirmed`；候選僅出現在記憶審核。
- 單純再次複製、UI 展開收合與頁籤切換不得建立快照或累加記憶。

## 資料模型

### 記憶統計

在 `NamedMemory`、`MaterialType`、`MaterialMemoryItem` 增加：

- `finalizedUsageCount: number`：出現在不同成功定稿的次數，專供三次自動確認門檻。
- `lastUsedAt`、`usageCount`：保留作為最近／常用排序與使用資訊；每次新指紋成功提交最多增加一次。

既有資料的 `usageCount` 可能包含舊版聯絡或進料儲存次數，不可直接拿來判斷三次門檻。資料庫升級時將既有列的 `finalizedUsageCount` 初始化為 `0`，不得自動確認舊候選。

### 定稿提交紀錄

使用既有 `daily_memory_commits` store 保存目前最後一次成功提交：

```ts
interface DailyMemoryCommit {
  id: 'current';
  fingerprint: string;
  snapshotId: string;
  outputText: string;
  committedAt: string;
}
```

內容指紋以完整 `outputText` 計算 SHA-256。七日快照清除不刪除 `current` 提交紀錄，避免草稿未變時在第八天重新計次。

### Migration

- `DB_VERSION` 由 8 升至 9。
- 同步更新唯一資料庫入口、型別與資料模型文件。
- 對所有記憶 store 補上 `finalizedUsageCount: 0`；不清除、不覆蓋既有狀態或名稱。

## Repository Workflow

### 1. 普通草稿儲存

- `saveContactEntry()` 改為只正規化並寫回 `live_report_draft`，不開啟 `trade_types`、`trade_vendors`、`trade_tasks`。
- `saveMaterialEntry()` 改為只保存進料草稿；選到正式材料主檔時保留 ID，自由輸入的新值維持 snapshot 並等定稿解析。
- 日報頁內即時新增的工地／工種不得呼叫人工主檔 `saveMemory()`；只有設定中心人工新增可立即成為正式主檔。

### 2. 建立記憶提交集合

新增純函式，從草稿產生去重後的白名單集合：

- 工地。
- 工種及其廠商。
- 工種下的工程工項與聯絡施工項目，共同映射至 `trade_tasks`。
- 位置。
- 材料類型，以及其品名、規格、單位、供應商。

同一標準化值在同一份日報出現多次只保留一筆。禁止收集施工人數、數量、樓層、日期、備註與特殊事項。

### 3. 原子定稿

`finalizeDailyReport()` 流程：

1. 在交易外計算 `outputText` SHA-256。
2. 讀取 `daily_memory_commits/current`。
3. 指紋相同：回傳 `created: false` 與既有 `outputText`，不開啟寫入交易。
4. 指紋不同：開啟包含 `daily_reports`、`live_report_draft`、`daily_memory_commits` 與全部白名單記憶 stores 的單一 read-write transaction。
5. 依父子順序解析或建立工種、廠商、工項與材料記憶，將已解析 ID 回填到保留草稿及快照副本。
6. 每個去重記憶的 `usageCount`、`finalizedUsageCount` 各增加一次並更新 `lastUsedAt`；新列為 `candidate`。
7. `finalizedUsageCount >= 3` 時，在同一交易轉為 `confirmed`。
8. 寫入不可變快照、完整保留草稿及 `current` 提交紀錄；任一步驟失敗由交易整體回滾。
9. 交易完成後才執行七日快照清理。

建議回傳契約：

```ts
interface FinalizeResult {
  snapshot: FinalizedDailyReport;
  retainedDraft: DailyReportV3;
  outputText: string;
  created: boolean;
}
```

## UI Workflow

- 工程條目與聯絡事項共用 `recentConfirmedVendor(tradeTypeId)`：`lastUsedAt DESC`、`usageCount DESC`、`normalizedName ASC`。
- 聯絡事項選定工種後自動填入該廠商，並只顯示該工種的正式 `trade_tasks` 建議。
- `created: true`：顯示「已定稿、複製並更新記憶；草稿已保留」。
- `created: false`：顯示「內容未變，已再次複製；未重複建立定稿或記憶」。
- 定稿後不得以 `nextDraft` 替換 controller 狀態，改用 repository 回傳的 `retainedDraft`。
- 定稿提交完成後重新載入正式記憶；第三次自動確認的內容可立即用於下一次選擇。

## 測試矩陣

### Unit / Repository

- 最近使用優先，時間相同才比較使用次數，最後名稱穩定排序。
- 聯絡事項選工種只自動填入正式廠商，工項建議只讀正式共用記憶。
- 儲存聯絡事項與進料不新增候選、不增加使用次數。
- 第一次定稿建立快照、保留完整草稿／ID／完成狀態並提交白名單。
- 相同指紋再次定稿只複製，不新增快照、不增加任何統計。
- 修改輸出後建立新快照並各增加一次。
- 同份日報重複值只計一次。
- 候選在三個不同指紋定稿後自動轉正式；第一、二次仍不可被建議。
- 舊 `usageCount >= 3` 但 `finalizedUsageCount = 0` 的候選不得被誤確認。
- 單日事實不進任何記憶 store。
- 任一 store 寫入失敗時，快照、草稿、提交紀錄與記憶全部回滾。
- 七日快照清除後，相同保留草稿仍不得再次累加。

### Regression

- 不可變 `outputText` 歷史再次複製。
- 候選人工確認、駁回、備份匯出／合併。
- 工種／廠商刪除對目前草稿的既有影響規則。
- 獨立進料連接與輸出格式。
- `npm test`、`npm run build`。

### Browser

- 在 `#daily` 實測工程條目與聯絡事項的廠商自動填入。
- 實測聯絡工項建議、三次定稿狀態、未變再次複製、修改後新快照。
- 檢查 `#settings/memory` 候選於第三次後消失並進入正式建議。
- 驗證重新整理與離線重開後，草稿、完成狀態與提交指紋仍存在。

## TODO Tree

- [ ] Phase 1：純函式與型別
  - [ ] 記憶白名單收集與去重
  - [ ] SHA-256 指紋
  - [ ] 統一廠商排序 selector
- [ ] Phase 2：DB v9 與 repository
  - [ ] `finalizedUsageCount` migration
  - [ ] 普通儲存移除自動學習副作用
  - [ ] 原子定稿／記憶提交／草稿保留
- [ ] Phase 3：UI 接線
  - [ ] 工程與聯絡共用廠商 selector
  - [ ] 聯絡工項正式記憶建議
  - [ ] 定稿結果文案與記憶刷新
- [ ] Phase 4：驗證
  - [ ] Unit／repository／migration／regression tests
  - [ ] TypeScript build
  - [ ] Browser 與離線重開驗收

## Agent Workflow 與 Token 控制

實作時依 Phase 分段，每階段只載入所需檔案：

- Data Agent 範圍：`src/data/db.js`、`src/data/daily-repository.ts`、domain types、repository tests。
- UI Agent 範圍：`src/main.ts` 與聯絡／定稿互動測試；不得改資料模型。
- QA Agent 範圍：測試、build、瀏覽器流程與 IndexedDB 狀態；不得順手修復範圍外問題。

目前不需要同時啟動多 Agent；先完成資料契約，再接 UI，可避免不同 Agent 同時修改 `daily-repository.ts` 與 `main.ts` 造成重工。每個 Phase 以測試輸出作為交接摘要，不重複載入整個 repository。
