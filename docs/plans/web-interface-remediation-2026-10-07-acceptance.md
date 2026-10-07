# 介面修復交付與驗收紀錄

日期：2026-10-07。對應 [修復計畫](./web-interface-remediation-2026-10-07.md)。

## 實作結果

| 問題 | 變更 | 證據與限制 |
| --- | --- | --- |
| F1 彈窗過高 | 依動態視窗與安全區限制高度，結果區捲動，底部操作固定於捲動區 | 樣式完成；短螢幕、縮放、手機鍵盤待瀏覽器確認 |
| F2 彈窗焦點 | 原生 modal dialog、Escape 取消、重繪焦點保存、取消後返回觸發按鈕 | TypeScript 通過；焦點循環與背景隔離待操作驗收 |
| F3 聯絡標題 | 依施工／聯絡情境顯示「選擇施工工種／選擇聯絡工種」 | 原始碼完成；保留原有工種選擇流程 |
| F4 頁籤鍵盤 | 方向鍵、Home／End、單一 tabindex；Enter／Space 使用原生按鈕啟動；tabpanel 關聯與儲存後焦點恢復 | 導航純函式及結構測試通過；IME 與取消編輯互動待確認 |
| F5 建議重複 | 以正規化實際名稱去重；confirmed 優先，去重後取六筆 | 測試驗證過期 normalizedName、既有工項隱藏、編輯建議與來源未變動 |
| F6 排序只靠手勢 | 工項選單增加上移／下移／刪除；沿用既有移動、刪除與復原 action | 第一／末筆邊界、同名獨立 ID、既有 controller 排序與復原測試通過；按鈕互動待確認 |
| F7 清除不能復原 | 清除位置、樓層、備註後顯示復原；限制同報表、工地、日期及工作區，避免覆蓋新修改 | 純函式測試通過；儲存失敗提示與瀏覽器操作待確認 |

## 自動檢查

- 完整 Vitest：47 個測試檔，236 項測試通過，最終使用下方暫存設定。較早標準 `npm test` 曾通過 235 項；新增邊界測試後重跑標準命令遇到 `EPERM realpath vitest/dist/spy.js`，沒有執行測試。這項環境失敗沒有視為通過。
- TypeScript：`tsc -p tsconfig.json` 通過。
- 標準 `npm run build`：Vite 遇到環境 `EPERM realpath index.html`，未通過，沒有修改正式 Vite 設定。
- 暫存建置以 Vite programmatic API 加入 `resolve.preserveSymlinks: true`，分別驗證 `base: './'` 與 `base: '/daily-report-web/'`，包含 PWA service worker 建置通過。產物保留於 `artifacts/ui-remediation-2026-10-07/local` 與 `cloud`；清除資料夾被自動審核以政策封鎖拒絕。這是環境驗證方式，不能取代一般環境的標準 release build。
- 既有主 bundle 超過 500 kB 的警告仍存在，本批未擴大到效能重構。

此環境可重現的測試命令（不改專案設定）：

```powershell
node --input-type=module -e "import {startVitest} from 'vitest/node'; const ctx=await startVitest('test',[],{run:true},{resolve:{preserveSymlinks:true}}); await ctx.close();"
npx tsc -p tsconfig.json --noEmit
```

## 瀏覽器驗收限制

本機 Vite 與靜態預覽伺服器均曾回報啟動，但內建瀏覽器存取 `http://127.0.0.1:5174/` 得到 `net::ERR_CONNECTION_TIMED_OUT`；PowerShell／Node 的獨立連線也失敗。啟動訊息不能證明頁面已可存取，因此不宣稱瀏覽器驗收完成。

T6 目前為部分完成。以下仍待可連線環境驗證：

1. 短螢幕、200% 縮放、長工種名稱、搜尋後取消按鈕可達。
2. Tab／Shift+Tab 不離開彈窗；Escape 取消、回到原按鈕；聯絡標題正確。
3. 頁籤方向鍵僅移動焦點，Enter／Space 才切換；重繪、儲存失敗與取消進料編輯後焦點正確。
4. 上移／下移維持 ID 與輸出順序；刪除後復原；Viewer 不可修改。
5. 清除附加欄位後復原；修改新欄位或切換工地日期後舊復原失效。
6. 實機手機鍵盤、安全區、長按／左滑與完成按鈕；螢幕閱讀器播報。

## 交付邊界

保留 ID、JSON schema、資料儲存與同步 API、日報輸出及獨立同名紀錄。未修改正式日報、資料庫、全域 skills、hooks 或部署流程。未 commit、push 或部署；線上網站尚未套用本批修復。
