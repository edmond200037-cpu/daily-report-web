# 日報首屏：拿掉分類頁籤、一頁到底（方案 A）

日期：2026-11-21　分支：`worktree-daily-single-page`

## 背景

日報首屏到第一個動作前有 6 層：頁首 → 模組頁籤 → 工作區框（本機工作區／日期／工地）→ 分類頁籤 → 區段標題與說明 → 「新增施工紀錄」（約在螢幕 70% 高）。
切換分類頁籤是輸入錯誤的來源：
- 切頁籤會觸發暫存工項擷取；
- 進料編輯草稿會跳出「是否放棄」確認；
- 聯絡草稿會阻擋複製與定稿。

使用者決定採方案 A：
- 拿掉分類頁籤，改成一頁到底；
- 區段標題、說明文字、工作區框都拿掉；
- 日期與工地收進頁首的一顆按鈕，避免誤觸換日期。

## 修改目標

### G1 一頁到底
- 日報主頁依序渲染四個區段：施工紀錄 → 進料 → 聯絡事項 → 特殊事項。
- 不再有 `role="tablist"`、`role="tab"`、`role="tabpanel"`、`[data-daily-tab]`，也不再有 `daily-tabs` 的 HTML 與 CSS。
- 每個區段是 `<section class="daily-section" aria-label="施工紀錄">`（依區段名稱），**不含** `daily-section__header`、`h2`、說明 `<p>`。
- 每個區段**頂端**是一列新增列，同時當作區段辨識：
  - 例：`＋ 新增施工紀錄`，沿用原本的 `data-daily-action`（`add-trade`／`add-normal-material`／`add-contact`／`add-special`）；
  - 全寬、高度 ≥ 44px、細線分隔、無圓角卡片；
  - 施工紀錄那一列維持主要按鈕視覺（施工橘）；其他三列為次要文字列。
- 區段沒有資料時只剩這一列，不顯示「尚未新增…」空狀態文字。
- 進料區段保留 `materialConnectionPanel()`，位置在進料新增列之後。

### G2 頁首日期／工地按鈕
- 頁首 `dailyHeader` 加一顆按鈕：`data-daily-action="toggle-basics"`（**沿用既有 action 與 `appState.dailyBasicsExpanded`**）。
  - 屬性：`aria-expanded`、`aria-controls="daily-basics-panel"`。
  - 文字：`11/21（六）・工地名 ▾`；沒有工地時為 `11/21（六）・未選工地 ▾`。工地名要 `escapeHtml`。
- 展開後，在頁首正下方顯示 `<section id="daily-basics-panel">`，內容就是原本 `basicsView()` 的內容：`workspaceSiteView()`、`日報日期` 欄位（`data-daily-field="date"`）、未登入時的 `sitePickerField()`。
- 收合時，這些欄位**不渲染**。
- 預設收合。日期變更後，既有程式（`workspace-events.ts` 第 62 行）會自動收合；route 變更時也收合。
- `toggle-basics` 加入 `readOnlyDailyActions`，檢視者也能換日期。
- 展開或收合是純 UI 狀態：不得呼叫 `update()`／`flush()`、不得讓日報變 dirty、不得產生 mutation。
- `workspaceSiteView()` 本身不改，水位頁 `water-shell.ts` 仍在用。

### G3 移除頁籤行為，資料欄位不動
- 刪除 `main.ts` 的 `[data-daily-tab]` 點擊處理。`bindTabNavigation` 若已無用途，連同 `src/daily/tab-navigation.ts` 與其單元測試一起移除；`appState.tabSwitching` 若無用途也移除。
- UI 不再寫入 `report.activeTab`，以下各處移除寫入：
  - `daily-events.ts` 的 `fix-entry`（直接設 `activeTab`）；
  - `add-normal-material`／`add-trade-material` 與 `manage-material-connections` 的 `switchTab('supplies')`。
- `fix-entry` 改為展開該工種並捲動、聚焦到缺漏欄位。
- 新增進料、管理連接後，捲動並聚焦到進料區段內的編輯器或連接面板（`scrollIntoView({ block: 'center' })` + focus；尊重 `prefers-reduced-motion`，不用平滑捲動也可）。
- `daily-events.ts` 的 `bindBackgroundCollapseEvents` 中，兩處 `activeTab !== 'engineering'`／`!== 'contacts'` 判斷要拿掉，改為只看 route 是否為日報主頁。點擊排除清單（`backgroundCollapseExclusions`）要能涵蓋其他區段的互動元件，避免在進料區操作時把展開中的工種收合而遺失輸入：先確認現有排除清單的行為，必要時把 `.daily-section` 內的輸入元件納入。
- **不動**：
  - `DailyReportV3.activeTab` 型別；
  - `DailyController.switchTab`（可保留不用）；
  - `daily-repository.ts`、`legacy-repair.js`、`payload-safety.ts`、`input-workflow.ts` 對 `activeTab` 的處理；
  - DB_VERSION、formatter、驗證規則、定稿、記憶規則、同步。

### G4 樣式
- 移除 `.daily-tabs*`、`.daily-tab__count`、`.daily-basics`、`.daily-context-row` 中已無用的規則（`daily.css`、`dialog.css`、`input-workflow.css`）。`.daily-section__header` 若只剩其他頁使用則保留。
- 新增規則：頁首按鈕、展開面板、區段新增列。
  - 沿用 `--daily-*` token；
  - 不用漸層與裝飾陰影；
  - 資料列優先；
  - 區段之間用一條 `--daily-line` 細線分隔。
- 頁首按鈕：
  - 高度 ≥ 44px；
  - 在 360px 寬時與「設定」並排不換行、不溢出；工地名過長以 `text-overflow: ellipsis` 截斷。

### G5 文件
- 新增 `docs/adr/017-daily-single-page.md`（繁中），記錄：
  - 取代 ADR-008 中「保留四個分類頁籤」的部分；
  - 理由：切頁籤造成的輸入錯誤，以及首屏層數；
  - 後果：`activeTab` 欄位保留但 UI 不再使用。
- 更新 `DESIGN.md`：第 7、9 行（工地與日期雙欄固定顯示 → 收進頁首按鈕）、第 57 行（維持頁籤 → 一頁到底）、第 64 行。
- **不改** ADR-008 原文。

### G6 測試
- 更新：
  - `tests/unit/daily-workspace-shell.test.ts`（tabpanel、daily-basics 斷言）；
  - `daily-paper-foundations.test.ts`（`daily-section__header h2` 的 CSS 斷言）；
  - `web-interface-remediation.test.ts`（`nextTabIndex`，若移除檔案）；
  - `tests/e2e/helpers/daily-ui.ts`（點頁籤 → 捲到區段；`.workspace-site` → 先點頁首按鈕）。
- 新增契約測試：
  - 日報主頁原始碼**不含** `data-daily-tab` 與 `role="tablist"`；
  - 依序包含四個 `aria-label` 區段與四個新增 action；
  - 頁首包含 `data-daily-action="toggle-basics"` 與 `aria-controls="daily-basics-panel"`；
  - `readOnlyDailyActions` 包含 `toggle-basics`；
  - `daily-events.ts` 與 `main.ts` 不再寫入 `activeTab`、不再呼叫 `switchTab`。

## 不做（範圍外）
- 不把工種選擇對話框改成行內搜尋。
- 不改：
  - 水位頁；
  - 模組頁籤（施工日報／水位變化）；
  - 設定導覽；
  - 底部摘要／預覽／定稿列。
- 不改進料與聯絡的編輯草稿模型。只拿掉因頁籤造成的放棄確認；同區段內切換另一筆時的確認保留。
- 不改資料模型、schema、備份格式、formatter、同步、SQL。
- 不 commit、不 push。

## 驗收標準

### 自動檢查（必過）
1. `npx tsc -p tsconfig.json --noEmit` 無錯誤。
2. `npm test` 全數通過，含新增的契約測試。
3. `npm run build` 通過，`BASE_PATH=/daily-report-web/ npm run build` 也通過。
4. `git diff --stat` 不含以下檔案：
   - `src/data/db.js`、`src/data/daily-repository.ts`、`src/data/legacy-repair.js`；
   - `src/domain/daily.ts`、`src/daily/daily-formatter.ts`、`src/daily/daily-validator.ts`；
   - `src/sync/**`、`supabase/**`、`src/water-level/**`。

### 手機寬度實測（375×812 與 360、430 寬）
5. 日報主頁可見元件中沒有 `[role="tab"][data-daily-tab]`，也沒有 `.daily-basics` 欄位。頁首有一顆日期／工地按鈕。
6. 「＋ 新增施工紀錄」在 375×812 的第一屏內（`getBoundingClientRect().bottom < innerHeight`），且位置比改版前（約 70%）更高。
7. `document.documentElement.scrollWidth <= innerWidth`，三種寬度都沒有水平捲動。
8. 頁首按鈕、四個新增列、面板內的互動元件高度都 ≥ 44px。
9. 點頁首按鈕後面板展開，可改日期與工地。改日期後面板自動收合，頁首文字更新。只開關面板時，儲存狀態不變（不出現「儲存中…」）。
10. 四個區段都能在同一頁新增：
    - 施工紀錄：選工種 → 加工項；
    - 進料：開編輯器 → 儲存；
    - 聯絡事項：選工種 → 加工作 → 完成；
    - 特殊事項：新增。
    - 過程中沒有任何「是否放棄」確認，除非真的在同區段切換未存的另一筆。
11. 施工紀錄展開並輸入一半時，捲到進料區按「新增進料」，回來時施工輸入沒有遺失。
12. 中文輸入法：工地搜尋、工項輸入組字期間不被重新渲染打斷（沿用既有 `isComposing` 保護，不新增會在組字時 render 的路徑）。
13. 預覽、複製、定稿流程不變；輸出文字與改版前相同。

### 回報分層
- 本機自動檢查通過：1–4。
- 本機瀏覽器手機寬度驗證：5–13。
- 線上與實機尚未驗證：正式部署、真實手機、IME 實機、共用模式 Realtime。

## 修正輪 1（2026-11-21，驗收後）

### F1 頁首日期／工地按鈕的工地名被截斷
- **現況**：375px 時，按鈕與存檔狀態、標題、「設定」擠在同一列，只剩約 127px 寬。工地名只看得到約 3 個字（例如「未選…」），使用者無法確認目前工地。
- **目標**：窄螢幕（≤ 480px）時，日期／工地按鈕獨立成頁首第二列並撐滿寬度。第一列保留存檔狀態、標題與「設定」。DOM 順序與 `aria-*` 不變。寬螢幕可維持同列。
- **驗收**：
  - 375×812、工地名為 12 個中文字時，工地名完整顯示（`.daily-context-button__site` 的 `scrollWidth <= clientWidth`）。
  - 超長工地名（例如 30 字）仍以省略號截斷，且不產生水平捲動。
  - 按鈕高度 ≥ 44px。
  - 360、375、430 寬都沒有水平捲動。
  - 「＋ 新增施工紀錄」的頂端仍在 375×812 視窗的 35% 以內。
  - 收合與展開的視覺、▾／▴ 指示不變。
  - 同步更新相關契約測試，以及 `tests/e2e/daily-single-page.spec.ts` 中長工地名的斷言。

### F2 標準填報 E2E 的歷史文字比對失敗（CRLF／LF）
- **現況**：Codex 回報 `tests/e2e/daily-report.spec.ts` 最後比對歷史文字時失敗，原因是剪貼簿為 CRLF、DOM 為 LF。
- **先判定是否為既有問題**：
  - 在 scratchpad 以 `git worktree add --detach <path> HEAD` 建立一個暫時的乾淨 worktree，在裡面跑同一個 spec，確認未修改的 HEAD 是否也會失敗。
  - 用完以 `git worktree remove` 清掉。
  - 不得使用 `git stash`。
- **處理**：
  - 若是測試端比較方式的問題，只在測試端把換行正規化（`\r\n` → `\n`）後再比對。
  - **不得**修改 formatter、複製或定稿的正式程式碼。
  - 若確認是本次改版造成的正式行為問題，才修正正式程式碼，並說明原因。
- **驗收**：
  - 該 spec 通過。
  - 回報需寫明這是否為既有問題，以及判定依據（乾淨 HEAD 的執行結果）。

### 不處理
- 施工卡與聯絡編輯器可同時展開：這是一頁到底的預期行為，不改。
- 進料接線盤只在有進料或操作中時顯示：接受這項偏離。

### 共同要求
- 跑以下檢查：
  - `npx tsc -p tsconfig.json --noEmit`
  - `npm test`
  - 兩種 BASE_PATH 的 `npm run build`
  - `daily-single-page` 與 `daily-report` 兩個 E2E
- 不 commit、不 push。
- 受保護路徑同前，不得修改。

## 修正輪 2：取消新增（2026-11-22）

### 問題
點了某個「＋ 新增…」但其實不想輸入時，沒有一致、看得到的取消方式：
- 施工紀錄：選完工種就已建立紀錄，只能左滑刪除。
- 聯絡事項：「取消新增」藏在「更多選項」裡。
- 特殊事項：一點就新增空白項目，沒有取消。
- 進料：已有「取消輸入」，不改。

### 目標
剛新增的項目，在項目本身上就有一顆看得到的「取消新增」，一下就能撤回；不必知道左滑手勢。

### 做法
- `appState` 新增純 UI 暫態 `justAddedEntry: { kind: 'trade' | 'special'; id: string } | null`：
  - `select-trade`（工程）與 `add-special` 建立項目後設定。
  - 再次新增任何項目、換日期／工地／帳號、離開日報頁時清除。
  - 不得造成 dirty、不得觸發保存、不進 mutation。
- 施工卡與特殊事項卡：當 `justAddedEntry` 指向它時，卡片內顯示 `<button data-daily-action="cancel-new-entry">取消新增</button>`（≥44px，次要樣式）。
  - 點擊時沿用既有 `deleteItemBySwipe(kind, id)`，走原本的刪除＋6 秒復原，不另寫刪除邏輯，也不跳確認框。
- 聯絡事項：新增模式（`!originalId`）把「取消新增」移出「更多選項」，放在儲存按鈕旁，直接可見。編輯模式的「放棄修改」與刪除維持原狀。
- 讀取模式（唯讀工地）不顯示「取消新增」。

### 驗收標準
1. 點「＋ 新增特殊事項」後，新卡片上看得到「取消新增」；點了項目消失，出現 6 秒復原。
2. 選工種建立施工紀錄後，該卡上看得到「取消新增」；點了紀錄消失，可復原。
3. 已輸入內容的剛新增項目，點「取消新增」也一樣刪除，並可在 6 秒內復原。
4. 聯絡事項新增時，「取消新增」不需展開任何選單即可看到並點擊。
5. 再新增另一個項目後，前一個項目的「取消新增」消失。
6. 進料的「取消輸入」行為不變。
7. 顯示或隱藏「取消新增」不改變保存狀態。
8. 360／375／430 寬無水平捲動，所有按鈕 ≥44px。
9. 新增單元契約測試；`daily-single-page` E2E 補一個取消新增的情境。

### 共同要求
同修正輪 1。
