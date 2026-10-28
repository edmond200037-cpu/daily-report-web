# 設計系統審查與改善方案（依 b-end-design-system skill）

日期：2026-10-28　分支：dev　審查範圍：`src/`、`DESIGN.md`、`PRODUCT.md`

## 0. 先講結論

- 這是**手機優先的工地現場工具**，不是桌面後台。skill 裡的 DataGrid、FilterPanel、KPI 看板、React 模板、彈窗 38.2% 位置等規則**不適用**，不要硬套；`DESIGN.md` 已明確拒絕「卡片堆疊的通用後台」，以 `DESIGN.md` 為準。
- skill 中**真正適用**的是：浮層與回饋系統、破壞性操作阻力、按鈕層級、色彩 token、五態覆蓋。
- skill 附的 `audit-design-rules.py` 只掃 `.tsx/.vue`，本專案掃到 0 個檔案，「合規」結果無效，已改為人工審查。
- 最大阻礙不是視覺，而是 `src/main.ts`：**165 KB、只有 634 行（平均每行約 260 字元）**，任何人或 AI 都難以安全修改。要交給 ChatGPT 編程，必須先拆。

## 1. 問題清單

| # | 嚴重度 | 問題 | 證據 | skill 對應規則 |
|---|---|---|---|---|
| 1 | 高 | 破壞性操作用原生 `window.confirm` | `src/` 共 28 處，例 `src/daily/daily-controller.ts:36,41,43` | 高危操作須用 ConfirmDialog：中立標題交代對象、描述交代後果、動賓按鈕文案（原生只有「確定／取消」） |
| 2 | 高 | 錯誤與提示用原生 `alert` | `src/main.ts` 共 21 處（排序失敗、儲存失敗、格式錯誤） | 回饋須在頁內、可讀、不阻斷；儲存失敗屬資料風險，應留在畫面上 |
| 3 | 高 | 新增工種彈窗缺無障礙語意 | `src/main.ts:322` 的 `.dialog-backdrop` 無 `role="dialog"`、`aria-modal`、焦點圈限 | 浮層須可 Escape 關閉、焦點圈限；含輸入的浮層點遮罩不得關閉 |
| 4 | 高 | `main.ts` 單檔過大、行過長 | 165 KB / 634 行 | （工程前提）無法逐段審查與修改 |
| 5 | 中 | 兩套平行色票 | `--accent #a86712` 與 `--daily-orange #b84e16`；`.settings-page` 用大量覆寫把通用色改成紙色（`src/styles.css` 約 30 條） | 色彩語義分層、單一來源 |
| 6 | 中 | 硬編碼色值 | CSS 共 85 處十六進位色（styles 53、presentation 14、daily 8、material 7、water 3）；`main.ts` 行內 `background:#df9c2e` | 顏色只能來自 token |
| 7 | 中 | 實心紅色 `.danger` 按鈕用於一般區域 | `class="danger"` 10 處 | 列表內刪除用文字型危險按鈕；實心危險色只留在確認對話框的最終動作 |
| 8 | 中 | 主按鈕可能不唯一 | `class="primary"` 21 處，需逐區確認 | 每個操作區最多 1 個 Primary |
| 9 | 中 | 預覽與定稿 Bottom Sheet 未完成 | `DESIGN.md` 狀態段自述未實作；目前 `.daily-output` 為固定浮層，無遮罩／焦點圈限 | 詳情與輸出優先抽屜，保留背景脈絡 |
| 10 | 低 | 文件與實作不一致 | `PRODUCT.md` 寫「無後端」，commit `d36476b6` 寫「共用後端改為 Google 試算表 + Apps Script」，`apps-script/` 目錄為空 | 五態中的「同步錯誤」狀態無從設計 |

**刻意不採納的 skill 規則**
- 0.5px 微邊框：戶外強光下手機髮絲線幾乎看不見，維持 1px 低對比欄線（符合 `DESIGN.md`）。
- 審批通過／駁回同為次級按鈕：本產品沒有審批流程。
- 彈窗置中 38.2%：手機改用底部 Bottom Sheet。

## 2. 改善方案（依序執行，每階段可獨立合併）

### 階段 A：拆分 `main.ts`（純搬移，不改行為）
- 先用 Prettier 或手動將長行展開，再依頁面拆出：`src/daily/views/`（工程、進料、聯絡、特殊事項、輸出）、`src/settings/views/`、`src/water-level/`（已有，接上即可）。
- `main.ts` 只保留路由、事件委派與 `renderApp`。
- 驗收：`npm test`、`npm run build` 全過；畫面與行為無差異；不改任何資料、formatter、IndexedDB。

### 階段 B：共用確認對話框與頁內回饋
- 新增一個 `confirmAction({ title, detail, confirmLabel }): Promise<boolean>`，以原生 `<dialog>` + `showModal()` 實作（平台自帶 Escape、頂層、背景不可互動），不加新套件。
- 文案規則：標題「刪除這筆進料？」，內文交代對象與後果（沿用現有 confirm 內的詳細資料），按鈕「刪除進料」／「取消」，只有確認鍵用危險色。
- `daily-controller.ts` 的 `deleteMaterial / deleteWorkItem / deleteTrade` 等改為 async，呼叫端一併改；更新受影響測試。
- `alert` 改為頁內訊息：沿用既有 `.memory-review__feedback` 與 `.save-status[data-state="error"]` 樣式；**儲存失敗類訊息不可自動消失**。
- 驗收：`src/` 內 `window.confirm` 與 `alert(` 為 0；刪除流程可用鍵盤完成；取消時資料不變。

### 階段 C：浮層一致化
- 新增工種彈窗改用同一個 `<dialog>` 外殼：補 `aria-labelledby`、開啟時聚焦搜尋框、關閉時焦點回到觸發按鈕；點遮罩**不關閉**（內含輸入）。
- 依 `DESIGN.md`「預覽與定稿 Bottom Sheet」規格完成 `.daily-output`：展開時有遮罩、標題、關閉鍵、焦點圈限、Escape；開關不觸發保存。

### 階段 D：色彩 token 收斂
- 以 `--daily-*` 紙色系作為唯一主題，把 `--accent` 等通用色改為指向它（或反過來，擇一），刪除 `.settings-page` 的整批覆寫。
- 85 處硬編碼色值改為 token；`main.ts` 行內 `#df9c2e` 改為 class + token。
- 驗收：CSS 內十六進位色只出現在 `:root`；全部文字對比通過 WCAG AA。

### 階段 E：按鈕層級走查
- 逐區清點 21 個 `.primary`：每個操作區（頁首、區段標題、對話框底部、輸出面板）最多一個。
- 10 個實心 `.danger` 中，列表／設定項目內的改為 `.danger-text`；實心只留在階段 B 的確認鍵。

### 階段 F：文件對齊（可與任何階段並行）
- 確認後端現況：若 Google 試算表 + Apps Script 已上線，補回 `apps-script/` 程式碼並更新 `PRODUCT.md` 的資料邊界與「同步失敗」狀態；若未上線，修正 commit 敘述造成的誤解。

## 3. 交給 ChatGPT「工作日報產生器」專案的指令範本

> 你正在修改 `daily-report-web`（Vite + TypeScript 原生 DOM，無框架）。一次只做本文件的**一個階段**。
> 限制：不得變更資料模型、IndexedDB schema、備份格式、Service Worker、日報 formatter、驗證規則與定稿快照；不得新增依賴；介面文字為繁體中文；觸控目標至少 44px；中文輸入法組字時不得重新渲染。
> 完成條件：`npm test` 與 `npm run build` 通過，並列出修改的檔案與每個檔案的變更理由。
> 本次階段：〔貼上階段 A～F 其中一段〕

## 4. 執行結果（2026-10-28）

- **B 完成**：新增 `src/shared/feedback.ts`（`confirmAction`、`notify`），以原生 `<dialog>` 取代 28 處 `window.confirm` 與 17 處 `alert`；確認鍵文案依標題動詞產生（刪除／駁回／放棄修改…），預設聚焦「取消」；`deleteMaterial / deleteWorkItem / deleteTrade` 改為 async。
- **C 完成**：新增工種彈窗補 `role="dialog"`、`aria-modal`、開啟聚焦搜尋框、Escape 關閉並還焦點；預覽面板展開時加遮罩、對話框語意、Escape 收合；兩者皆有 Tab 焦點圈限。
- **D 部分完成**：`--accent` 改指向施工橘；深色輸出面板改用 `--output-*` token；一次性色碼改用既有 token。尚餘約 23 處單次色碼（水位綠、進料連接圖），未動。`.settings-page` 覆寫區塊受測試契約鎖定，保留。
- **E 無需修改**：列表刪除原本即為文字型 `danger-text`（審查時誤計為實心）；各區塊主按鈕皆唯一。
- **F 完成**：Google 試算表 + Apps Script 方案已移除，README、`.env.example` 更新；ADR-013 與相關計畫標註「已撤回」並保留紀錄；刪除空的 `apps-script/`。
- **A 暫緩**：`main.ts` 約 80 個模組層級可變狀態，且 8 個測試讀取其原始碼字串；拆分需先將狀態集中為物件，建議獨立進行。
