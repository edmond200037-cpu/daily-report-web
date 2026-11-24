# ADR-019：React 19 與 Astryx 資訊架構遷移

狀態：6a 本機關卡通過；6b、7、8 尚未完成。

## 決策

以 React 19 與 Astryx 0.7.17 負責全站介面。保留 appState、DailyController、repository、資料、同步、定稿與記憶規則，React 透過 version counter 與 useSyncExternalStore 訂閱，不複製業務狀態。

外框使用 AppShell，頂部三入口為施工日報、水位變化及設定。遷移中的舊頁面置於固定 host；舊樣式限制在該 host。日報依序為日期與工地、施工紀錄／進料／聯絡事項／特殊事項、底部摘要及檢查與預覽 BottomSheet。複製與定稿並複製共用面板，歷史使用 List。

設定首頁以分組 List 連往記憶審核、主檔管理、井位、備份、多人共編及同步診斷。既有 hash 轉址保留。水位輸入、匯入、計算、近三日與複製工作流保留。

## 手勢及進料

後續 6b 以 createReorderable、createSwipe 與 Toast 取代 ADR-007 的自製手勢：左滑露出刪除按鈕，刪除後提供 6 秒 Toast 復原，沿用 DailyDeleteUndo；長按握把時間由 Astryx 決定，新增鍵盤排序。每列使用穩定識別，並提供可直接觸達的操作。

進料曲線接線盤將改為每筆獨立進料一個「連接工種」Selector，含「不連接」，沿用原子化連接、解除及改接方法。

## 頁面遷移狀態

| 路由 | 狀態 | 說明 |
| --- | --- | --- |
| 全站外框 | 已遷移 | React AppShell 與三入口，6a 本機關卡通過 |
| #daily | 未遷移 | 日期／工地及 BottomSheet 已通過 6a；四區仍使用舊 host，待 6b |
| #daily/history | 已遷移 | React List，6a 本機關卡通過 |
| #settings | 未遷移 | 舊 host |
| #settings/memory | 未遷移 | 舊 host |
| #settings/daily/sites | 未遷移 | 舊 host |
| #settings/daily/trade-tasks | 未遷移 | 舊 host |
| #settings/daily/locations | 未遷移 | 舊 host |
| #settings/daily/materials | 未遷移 | 舊 host |
| #settings/daily/templates | 未遷移 | 舊 host |
| #settings/water | 未遷移 | 舊 host |
| #settings/data | 未遷移 | 舊 host |
| #settings/account | 未遷移 | 舊 host |
| #settings/debug | 未遷移 | 舊 host |
| #water-level | 未遷移 | 舊 host |

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
