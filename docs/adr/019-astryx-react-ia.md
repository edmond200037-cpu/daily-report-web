# ADR-019：React 19 與 Astryx 資訊架構遷移

狀態：6a、6b、7、8 本機自動關卡與最後視覺檢查完成；全部路由已遷移。

## 決策

以 React 19 與 Astryx 0.7.17 負責全站介面。保留 appState、DailyController、repository、資料、同步、定稿與記憶規則，React 透過 version counter 與 useSyncExternalStore 訂閱，不複製業務狀態。

外框使用 AppShell，頂部三入口為施工日報、水位變化及設定。全部路由已遷移；共用內容 host 只承載 React，舊模板與專屬 CSS 已移除。日報依序為日期與工地、施工紀錄／進料／聯絡事項／特殊事項、底部摘要及檢查與預覽 BottomSheet。複製與定稿並複製共用面板，歷史使用 List。

設定首頁以分組 List 連往記憶審核、主檔管理、井位、備份、多人共編及同步診斷。既有 hash 轉址保留。水位輸入、匯入、計算、近三日與複製工作流保留。

## 手勢及進料

6b 以 createReorderable、createSwipe 與 Toast 取代 ADR-007 的自製手勢：左滑露出刪除按鈕，刪除後提供 6 秒 Toast 復原，沿用 DailyDeleteUndo；長按握把時間由 Astryx 決定，新增鍵盤排序。每列使用穩定識別，並提供可直接觸達的操作。工項及聯絡工項同樣使用穩定識別排序；取消拖曳不寫入，工項排序保存失敗恢復原順序。

進料曲線接線盤改為每筆進料一個「連接工種」Selector，含「不連接」，沿用原子化連接、解除及改接方法。保留原先普通進料連接後轉為獨立進料、解除後轉回普通進料的既有資料契約；沒有改動 controller 語意。改接使用 AlertDialog。

## 頁面遷移狀態

| 路由 | 狀態 | 說明 |
| --- | --- | --- |
| 全站外框 | 已遷移 | React AppShell 與三入口，6a 本機關卡通過 |
| #daily | 已遷移 | 日期／工地、BottomSheet 及四區 React 輸入 |
| #daily/history | 已遷移 | React List，6a 本機關卡通過 |
| #settings | 已遷移 | React Astryx 清單、表單及原有寫入流程 |
| #settings/memory | 已遷移 | React Astryx 清單、表單及原有寫入流程 |
| #settings/daily/sites | 已遷移 | React Astryx 清單、表單及原有寫入流程 |
| #settings/daily/trade-tasks | 已遷移 | React Astryx 清單、表單及原有寫入流程 |
| #settings/daily/locations | 已遷移 | React Astryx 清單、表單及原有寫入流程 |
| #settings/daily/materials | 已遷移 | React Astryx 清單、表單及原有寫入流程 |
| #settings/daily/templates | 已遷移 | React Astryx 清單、表單及原有寫入流程 |
| #settings/water | 已遷移 | React Astryx 清單、表單及原有寫入流程 |
| #settings/data | 已遷移 | React Astryx 清單、表單及原有寫入流程 |
| #settings/account | 已遷移 | React Astryx 清單、表單及原有寫入流程 |
| #settings/debug | 已遷移 | React Astryx 清單、表單及原有寫入流程 |
| #water-level | 已遷移 | React 量測、歷史、匯入、變化量與複製 |

## 已知限制與驗證邊界

- IME 只以 isComposing／229 驗證，iOS／Android 實機注音、倉頡尚待實機驗收。合成事件 lifecycle-only 情境保留 test.fixme，依協調者裁定不作硬門檻。
- 本機單元、型別、建置與瀏覽器測試不代表正式 OAuth、Realtime 或手機實機驗收。
- 答案檔與 formatter 有既有差異（日期括號、分隔線、多廠商分列／合併、千分位、聯絡日期括號）。回歸基準採改版前實際輸出，待使用者裁定官方模板。baseline-output 由改版前 HEAD 的隔離舊 UI 逐一填報與複製而得，保留剪貼簿原始換行；新 UI 與它逐字完全相等才放行，不正規化 actual。原 expected 答案檔保留，仍輸出差異檔與測試註記。此問題不是本次改版造成。
- Astryx 主題工具在本機 Node 25 曾無聲中止；以 Node 22 執行可完成建置與預覽。

## 6a 驗證

- TypeScript 與 E2E 型別檢查通過；check:release 58 檔／318 項單元測試及正式建置通過；BASE_PATH=/daily-report-web/ 建置通過。建置使用專案指定的 Node 22 執行。
- npm run test:e2e：33 通過、0 失敗、1 個依協調者裁定保留的 lifecycle-only IME fixme。包含 10 份舊 UI 輸出的逐字比對、三入口、Sheet 開關不改寫草稿、補填焦點、拖曳與儲存失敗回復。
- Astryx doctor：23 通過、0 fail，只有允許忽略的 cli-on-path warn；core-stylesheets 與 theme-module-import 均通過。
- daily-workspace-shell 的 4 項來源字串契約改為 4 項 React SSR 契約；資料、同步、formatter、記憶測試斷言未改。
- 隔離 DB：N/A（未動 SQL）；線上與實機：尚未驗證。

## 6b 驗證

- tsc、check:release（56 檔／304 項）、兩種 BASE_PATH 建置通過；使用 Node 22。
- npm run test:e2e -- --fully-parallel --workers=4：36 通過、0 失敗、1 個既定 IME fixme。10 份 baseline-output 逐字相等；涵蓋實際 Typeahead 組字、頓號拆項尾字、焦點、拖曳取消／保存失敗回復、鍵盤排序、左滑按鈕與 Toast 復原。
- Astryx doctor：23 pass、0 fail；只有允許忽略的 cli-on-path warn（CLI 對此 warn 回傳 1，依追加裁定接受）；core-stylesheets、theme-module-import 通過。TSX 禁用內容掃描及 git diff --check 通過。
- 四區、取消新增、摘要契約改為 React SSR；舊拖曳預覽、曲線接線盤、自製 work-gestures rollback 專屬測試移除，改由新瀏覽器拖曳／鍵盤／復原測試覆蓋。手機流程測試保留非介面斷言，刪除已移除手勢模組的斷言；資料、同步、formatter、記憶斷言未修改。
- Typeahead 自行管理查詢；已消耗頓號後的尾字透過元件自己的已選值編輯操作恢復，不自行寫入 input value，不在組字期間重建輸入。
- 隔離 DB：N/A（未動 SQL）；線上與實機：尚未驗證。

## 7 驗證

- tsc、check:release（56 檔／304 項）、兩種 BASE_PATH 建置通過；使用 Node 22。
- npm run test:e2e -- --fully-parallel --workers=4：41 通過、0 失敗、1 個既定 IME fixme。新增設定全部 11 個路由在 360／390／430 的無水平捲動與元件控制高度檢查、工地 CRUD／取消刪除／備份下載、井位新增改名及 AlertDialog 刪除。
- Astryx doctor：24 pass、0 warn、0 fail，exit 0。新的 TSX 禁用內容掃描與 git diff --check 通過。
- 設定導覽 12 項、格線 3 項、工種管理 4 項改為 React SSR；帳號與同步修復的輸出改從 React SSR 取得，保留角色、載入未知數量、全部待同步明細、衝突整筆選擇、未修改原操作等行為。OAuth、資料、同步及記憶邏輯的斷言未修改。
- 設定、記憶、帳號原事件寫入流程保留；確認框改為共用 AlertDialog 佇列。井位頁直接呼叫既有 loadPoints／savePoint／deletePoint；普通表單與切換鎖不另建業務狀態。
- 隔離 DB：N/A（未動 SQL）；線上 OAuth、Realtime 與實機：尚未驗證。

## 8 驗證

- tsc、E2E 型別檢查、check:release（56 檔／305 項）、兩種 BASE_PATH 建置通過；Node 22.23.5。Astryx doctor 24 pass、0 warn、0 fail，exit 0。
- npm run test:e2e -- --fully-parallel --workers=4：60 通過、0 失敗、1 個既定 IME fixme。十份 baseline-output 仍逐字相等。
- 新增七類 Typeahead × 兩種 IME 硬狀態的 14 項整合測試：工地、工種、材料類型、單位、聯絡廠商、聯絡工項、位置。組字期間強制通知 React 重繪後仍保留文字、焦點與游標；組字結束後選取的值不會被元件清空 query 的回呼擦除。沒有另寫輸入器或包裝元件。
- 另驗水位量測／編輯／匯入／變化量／逐字複製／刪除，水位與歷史 360／390／430 版面及控制尺寸，以及工項欄位保存後的復原。帳號動作鎖是純 UI 暫態，表單值在停用控制前擷取；結果仍走既有帳號與同步函式。
- 剩餘舊呈現契約改為 React SSR，混合測試中的資料與計算斷言不變；移除舊模板、事件綁定、專屬 CSS 與 theme.template.ts，theme 預覽產物明確忽略。main.ts 僅啟動與路由匯出。
- src/data、src/sync、src/domain、DailyController、水位 calculator／parser／formatter／repository 與答案檔相對 6a 沒有變更。TSX 禁用內容掃描及 git diff --check 通過。
- 隔離 DB：N/A（未動 SQL）；線上與實機：尚未驗證。

- 最後看圖後透過 Astryx 主題編輯器把清單列、Checkbox 標籤及 DateTimeInput 日期／時間區段補至至少 44px；主題深淺色預覽已檢視。輸入器高度改由內容撐開，避免窄螢幕日期／時間換列時與下一個欄位重疊；三種寬度均直接檢查下一欄標籤位於時間區段下方。尺寸測試涵蓋實際區段與清單整列，並在觸控環境點擊列邊緣確認可導頁。

- `SHOT_LABEL=after npx playwright test screenshots --workers=2`：2 通過、0 失敗。15 個畫面 × 深淺色共 30 張原圖，以原始解析度分成 21 張並排圖逐張檢視；未見文字溢出、不可讀深色內容或水位標籤重疊。日報整頁截圖中的固定摘要與 Sheet 只覆蓋當時視窗範圍，屬全頁截圖的固定定位呈現；Sheet 定稿／複製另有操作測試通過。
