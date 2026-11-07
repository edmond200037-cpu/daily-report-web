# 本機手動日報 E2E 驗收

此工具只測本機模式，不登入、不同步雲端。必須由人手動執行，沒有加入 CI、pre-push 或 `check:release`。

## 安裝與執行

使用 Node 22.6 以上（建議 Node 22 LTS 最新修正版），在專案根目錄執行：

```sh
npm ci
npx playwright install chromium
npm run test:e2e:types
npm run test:e2e
```

Linux 若缺瀏覽器系統套件，依 Playwright 的錯誤提示安裝（例如 `npx playwright install --with-deps chromium`）。下載瀏覽器需要網路；Chromium 使用 Playwright 的獨立快取，不讀取個人 Chrome 設定或資料。

只跑一種情境或顯示瀏覽器：

```sh
npm run test:e2e -- --grep 'standard'
npm run test:e2e -- --grep 'same-spec-multiple-loads' --headed
```

工具自行啟動 `http://127.0.0.1:5317` 的 Vite。若 port 被占用會失敗，不會接用既有站台。兩個 Supabase 環境值在專用伺服器中強制清空，並封鎖瀏覽器向其他 origin 發出請求；不需要修改或提供 `.env.local`。結束時由 Playwright 關閉服務。

每個案例使用新的非持久瀏覽器 context，先開同源空白頁核對 IndexedDB、localStorage、sessionStorage 全空，再載入 App。啟動後透過 App 的唯一 DB 入口唯讀核對記憶及定稿為零。App 初始化自行產生的草稿／設定不當成舊資料。腳本不 seed 資料、不載備份或 storageState，所有內容經 UI 輸入。

五個工程、53 人、七項雜工、七種鋼筋與兩筆聯絡均逐欄逐字輸入。變體把 #4 鋼筋的 19.99 噸拆為兩車 7.37 與 12.62 噸，與不同規格的進料一起連接紮筋工程；人工答案仍為 #4 合計 19.99、總計 107.12 噸。輸入順序刻意不排序。數量、合計與正文都不是從產品 formatter 生成。

## 日期與標準答案

預設整次執行只取一次 Asia/Taipei 的當天日期，瀏覽器只固定 Date，計時器與自動儲存照常運作。聯絡事項使用 App 的原生預定日期欄填入當天加兩個日曆日，工項欄只輸入工作內容；星期由測試工具獨立計算。

如需手動驗收固定邊界，可明確指定整次 run 的日期，不影響日常預設：

```sh
# bash / WSL：跨月及跨年分別執行
DAILY_E2E_DATE=2026-01-30 npm run test:e2e
DAILY_E2E_DATE=2026-12-30 npm run test:e2e
```

PowerShell 可先執行 `$env:DAILY_E2E_DATE='2026-12-30'`，再執行 `npm run test:e2e`；完成後以 `Remove-Item Env:DAILY_E2E_DATE` 還原。無效日期會直接報錯。

使用者可維護的完整答案放在：

- `tests/e2e/fixtures/expected/standard.txt`
- `tests/e2e/fixtures/expected/same-spec-multiple-loads.txt`

只有 `{{REPORT_DATE}}`、`{{CONTACT_DATE}}` 兩種佔位符會被替換，格式為補零月日與半形括號，例如 `11/07(六)`。未知佔位符會報錯。模板採 UTF-8、LF、無結尾換行；更新時請保留自己要求的精確空白、標點及數字。實際剪貼簿文字不作 trim、換行轉換、正規化或忽略差異。不提供自動覆寫答案指令。

**目前保留原需求的標準答案。** 已知現行 App 表頭使用不補零及全形括號、聯絡事項前有空白行與 11 個連字號；原答案則為補零半形括號、緊接上一段及 15 個連字號。因此現行產品預期會在逐字 gate 失敗。請先核對報告，再由使用者決定修改答案或另開產品修正任務；此工具不修改 formatter。

## 結果與失敗判定

按下「定稿並複製」前會清空真實剪貼簿，按下後必須出現定稿且複製成功訊息，再透過 `navigator.clipboard.readText()` 讀原文。工具沒有攔截或替代 writeText。接著從近 7 天 UI 核對唯一歷史快照也與剪貼簿逐字相同。

以下回傳非零：文字逐字不符、關鍵輸入或儲存失敗、不能定稿、剪貼簿無權限／讀寫失敗、快照不符、外部請求、瀏覽器例外或非預期對話框。預覽文字不作為定稿成功的替代證據。

每次執行建立不同的 `artifacts/daily-e2e/runs/<run-id>/`，內含 HTML report 與每個測試的結果目錄：

| 產物 | 內容 |
| --- | --- |
| `initial-storage.json`、`initial-memories.json` | 空白起點證據 |
| `expected.txt`、`actual.txt`、`history.txt` | 置換日期後人工答案、真實剪貼簿、UI 歷史文字 |
| `output.diff`、`comparison.json` | 逐行可讀差異、首個 Unicode 字元位置與碼點；空白／CRLF 以 JSON 跳脫呈現 |
| `actions.jsonl`、`actions.json` | 開始／完成即寫入的操作紀錄、最終清單 |
| `metrics.json`、`report.md` | 步數、各狀態各寬度量測、瀏覽器及日期資訊 |
| 狀態截圖、失敗截圖及 trace | 畫面證據與失敗追查 |

流程中斷時可能沒有 actual、history 或 diff；請先看 Playwright 錯誤與操作紀錄。可用 `npx playwright show-report artifacts/daily-e2e/runs/<run-id>/html` 開啟報告。

## 非阻擋量測與基準

390×844 完成一次填報，於空白、工程編輯、七項雜工、進料編輯、接線盤、聯絡編輯、預覽七種狀態量測 360／390／430px，再回到 390。這不是每個寬度各重填一次。

步數分為顯式點擊、整欄輸入與額外按鍵。每欄文字逐字輸入但只計一次輸入步數，另記字數；聚焦、清空預填值與 Tab 等明確操作另外計數。失敗步驟仍記錄。程式自動捲動、DOM 讀取、截圖、尺寸量測與歷史驗證不計入填報步數，不能將此口徑直接與舊探索的 149 步比較。

尺寸包含整頁 scrollWidth／實際最右 scrollX、超出 viewport 目標、局部 overflow，以及可見且可互動目標任一維小於 44px 的清單。checkbox／radio 優先採可用 label 的有效區域；未在畫面 viewport 內但仍在頁面布局的控制項也會被測量。量測失敗另記為未知，不視為零問題。水平捲動、觸控目標與步數只產生報告，不會單獨讓驗收失敗。

首次跑完全部填報／定稿／歷史核對，且取得完整 21 組量測後，將該情境的量測與證據存入 `artifacts/daily-e2e/baseline/<scenario>/`，即使文字 gate 不符也可作為量測基準。後續不自動覆寫，報告列出與首次基準的步數差，`baseline-comparison.json` 另列各狀態的水平溢位與小目標數差異；run metadata 保留日期與瀏覽器以辨識環境差異。

`artifacts/` 全部被 Git 忽略。首次基準只存在本機，換 checkout／刪除 worktree 前請自行複製保留；此任務不把大量截圖強制加入 Git。

此測試不能證明中文 IME、手機手勢手感、正式 Supabase、OAuth／Realtime 或部署後 PWA 快取通過，這些仍需另行驗收。
