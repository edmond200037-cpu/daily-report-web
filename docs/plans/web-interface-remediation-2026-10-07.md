# 日報介面改善：修改、實作與邊界計畫

日期：2026-10-07（Asia/Taipei）
狀態：規劃完成，待開始實作；本文件不代表已修復或已部署。
基準：commit `7869400`、package version `0.1.3`；規劃前工作目錄乾淨。
依據：本次對話的 7 項 Web Interface Guidelines 審查，以及重新核對的程式碼。

## 1. 目標與範圍

完成手機工種選擇、鍵盤導覽、工項建議去重、工項替代操作、清除資料可復原，保留目前日報資料與輸出契約。

| 編號 | 審查項目 | 優先序 | 預期結果 |
| --- | --- | --- | --- |
| F1 | 工種彈窗沒有高度與捲動限制 | P1 | 小螢幕、橫向及鍵盤開啟時，搜尋、選項、取消均可觸及 |
| F2 | 彈窗缺少焦點限制、Escape 與焦點還原 | P2 | 鍵盤與輔助工具能完整開啟、操作、關閉彈窗 |
| F3 | 新增聯絡事項顯示「新增工種」 | P2 | 依情境顯示「選擇施工工種」或「選擇聯絡工種」 |
| F4 | 分類頁籤語意與鍵盤操作不足 | P2 | 方向鍵導覽、Enter／Space 切換，重繪後焦點保持合理 |
| F5 | 工項建議相同名稱重複出現 | P2 | 每組建議名稱唯一，去重後再取最多 6 筆 |
| F6 | 工項排序缺少替代按鈕 | P2 | 施工工項可用上移、下移、刪除按鈕完成操作 |
| F7 | 移除位置與備註立即清空 | P2 | 清除後可復原，且不覆蓋之後的新編輯 |

F1 的鍵盤遮擋屬程式碼風險，仍需實機重現與驗收；不得把推論當作實測結果。

## 2. 修改架構

沿用原生 TypeScript、Vite、現有控制器與儲存流程。`src/main.ts` 負責組裝與呼叫，新增的小模組只承擔單一互動責任。

```text
main.ts：畫面組裝／事件路由／現有 save、flush、render
  ├─ daily/trade-picker-dialog.ts（新增）
  │    彈窗開關、情境標題、焦點與捲動生命週期
  ├─ daily/tab-navigation.ts（新增）
  │    頁籤焦點計算與鍵盤事件
  ├─ daily/work-input.ts（修改）
  │    工項建議、操作選單與回饋
  ├─ daily/work-detail-undo.ts（新增）
  │    限定欄位的清除快照、復原有效性
  └─ daily-controller.ts／work-gestures.ts（小範圍整合）
       沿用資料更新、排序、刪除及儲存入口
```

模組名稱是預定位置；實作前若已有等價 helper，優先重用。不要為這 7 項問題重寫整個 `main.ts` 或引入框架。

### 內部介面原則

- 彈窗使用 `engineering | contacts` 情境；焦點還原保存穩定的控制項描述，不長期保存會被 `innerHTML` 替換的 DOM 節點。
- 頁籤使用既有 `DailyReportV3['activeTab']`，唯一啟用入口重用現有儲存與草稿流程。
- 工項操作以 `tradeId + workId` 定位，排序只調整陣列與 `sortOrder`，不重建資料 ID。
- 復原記錄以工地／日期／日報／工項識別限制作用範圍；只快照被清空的欄位。
- 不新增 HTTP API、資料表或 RPC；使用既有 controller、save、flush 與同步流程。

## 3. 任務實作計畫

### T0：建立實作基線

- 重新讀取當時適用的專案指引、`git status`、版本及相關差異；不得假設本次乾淨狀態持續不變。
- 記錄 7 項問題是否仍存在，避免覆蓋其他工作已完成的修正。
- 建立本機測試資料：至少 20 個工種、重複記憶、長名稱、同工種兩家廠商、不同位置的同名工項。
- 使用本機工作區或獨立測試工地；不得重設正式網站儲存空間或改寫現有未完成草稿。
- 執行既有測試基線；既有失敗與本次新增失敗分開記錄。

交付：基準紀錄與驗收案例。依賴：無。

### T1：彈窗尺寸與焦點生命週期（F1、F2）

檔案：`src/daily/dialog.css`、新增 `src/daily/trade-picker-dialog.ts`、`src/main.ts` 的 picker markup、open／close 與 render 後掛接。

- 優先採原生 `<dialog>.showModal()`，使用 `::backdrop`；驗證它與全頁重繪的配合。
- 將彈窗分為標題／搜尋、可捲動清單、取消操作區；設定 `dvh` 高度上限、安全區間距及清單 `overscroll-behavior: contain`。
- 按目前容器實際高度處理；只有實機鍵盤驗證仍失敗時，才加入最小必要的 `visualViewport` 補償，並清理事件監聽。
- Escape 關閉；Tab／Shift+Tab 不離開彈窗。背景不可操作，關閉時恢復原本狀態。
- 手機初始焦點放在可聚焦標題或容器，避免一開啟就彈鍵盤；使用者點搜尋才進入輸入。桌面可直接聚焦搜尋。
- 取消後返回開啟按鈕；選取後返回新紀錄的廠商／人數欄位；開啟來源已消失時使用明確的後備焦點。
- 搜尋更新不重建整個 dialog，避免失焦；其他必要 render 後再依當前狀態恢復彈窗。

驗收：小尺寸可碰到取消、焦點不跑到背景、Escape 可關閉、反覆開關不重複綁定事件、選取工種後不遺失既有草稿。
依賴：T0。

### T2：情境標題與分類頁籤（F3、F4）

檔案：`src/main.ts` 的 `dailyTabs`、`activeTabContent`、新增 `src/daily/tab-navigation.ts`。

- 工種選擇器標題依 `entryKind` 顯示；搜尋無結果時保留「立即新增工種」的明確動作名稱。
- 每個 tab／tabpanel 有穩定 ID，以 `aria-controls`、`aria-labelledby` 關聯。
- 採手動啟用模式：左右鍵、Home／End 只移動焦點；Enter／Space 才儲存並切換，避免方向鍵造成頻繁儲存或草稿確認。
- 使用 roving tabindex；重繪後以穩定 ID 還原焦點。滑鼠／觸控點擊與鍵盤啟用走同一流程。
- 中文輸入法組字中不攔截確認按鍵；切換儲存失敗則留在原分頁並呈現可理解的錯誤。
- 保留現有 material editor 離開確認、聯絡草稿保存與 `activeTab` 持久化。

驗收：4 個分類可只靠鍵盤完成切換；取消離開確認或儲存失敗時焦點與內容一致；施工、進料及聯絡草稿不遺失。
依賴：T1（共用焦點還原原則）。

### T3：建議清單去重（F5）

檔案：`src/daily/work-input.ts`、`tests/unit/work-input-duplicates.test.ts`。

- 在目前工種內，以 `normalizeName(row.name)` 做搜尋與名稱分組，避免過時 `normalizedName` 影響結果。
- 同名代表優先 confirmed，再依 usageCount、lastUsedAt、ID 決定，保持可重現的選擇結果；不修改原始記憶陣列。
- 去重後依使用頻率等既有排序原則排序，新增時排除已加入工項，再取最多 6 筆。
- 編輯模式保留目前工項可選；candidate 記憶仍可使用。
- 只去重「建議」，手動輸入相同名稱仍允許，保留不同位置／樓層的獨立工作紀錄。

驗收：重複名稱只顯示一次、不同工種不混用、代表 ID 穩定、去重後仍盡可能顯示 6 筆。
依賴：T0。

### T4：施工工項的按鈕替代操作（F6）

檔案：`src/daily/work-input.ts`、`src/daily/work-gestures.ts`、`src/daily/daily-controller.ts`、`src/main.ts` 的 action wiring、必要的 `input-workflow.css`。

- 現有握把選單新增「上移」「下移」「刪除」；首筆禁用上移、末筆禁用下移。
- 使用一般按鈕群組語意，避免宣告 `menu` 卻沒有完整 menu 鍵盤契約。
- 按鈕排序與拖曳共用既有排序入口；按鈕刪除沿用可復原刪除入口，避免兩套行為。
- 操作後焦點保留在同一工項；刪除後移至相鄰項目或新增欄位，並以 `role=status` 公告結果。
- 保留原本長按、滑動、Delete 鍵及 IME 邊界；不改手勢門檻。
- 檢視者禁用新增的資料操作，與現有操作一致。

驗收：同一組工項使用拖曳或按鈕所得順序一致；不新增 ID、不遺失內容；快速連按不重複提交。
依賴：T0；整合時接在 T3 後，避免同時修改 `work-input.ts`。

本批 F6 以審查定位的施工工項為範圍。聯絡工項共用 gesture helper，必須回歸測試；是否擴充同樣按鈕列列為後續項目，不宣稱已完成所有清單的替代操作。

### T5：清除位置與備註的安全復原（F7）

檔案：新增 `src/daily/work-detail-undo.ts`、`src/daily/work-input.ts`、`src/main.ts` 的 `clearDetails` callback。

- 快照只涵蓋起迄樓層原文／正規值、locationId、位置文字及備註。
- 清除後顯示「已移除位置、樓層與備註／復原」；一次保存最近一筆清除紀錄，避免擴張成通用歷史系統。
- 復原限於相同工作範圍與仍存在的工項，且相關欄位仍等於清除後值；若已有新輸入或遠端更新，停用舊復原並提示原因。
- 切換工地／日期、刪除工項、清除下一筆或重載頁面，使上一筆清除復原失效；單純 render 不得讓提示消失。
- 復原不覆寫工項名稱、順序、taskId 或其他新修改，不把舊整份 report 寫回。
- 經現有保存路徑送出；保存失敗保留可重試狀態，不顯示成功。重複點擊保持冪等。

驗收：清除→復原可還原全部指定欄位；清除→輸入新位置→復原不覆蓋新值；工地／日期切換後不復原到別筆；儲存失敗可恢復。
依賴：T4（共用操作回饋與焦點處理）。

### T6：整合驗收與交付

- 執行相關單元測試，再跑完整測試、TypeScript 與兩種 BASE_PATH 建置。
- 驗證瀏覽器鍵盤、窄版、橫向、長文字、中文輸入法、復原及頁籤切換。
- 實機驗證 iOS Safari／Android Chrome 的軟鍵盤、捲動與手勢；無實機時列出「待驗證」，不可改填通過。
- 將修改、測試結果、截圖、未驗證項目寫入交付紀錄。

依賴：T1–T5；完成代表本機修正可供審查，不代表已部署。

### T7：另行執行的發布階段

- 只有使用者要求發布後才推送或部署。
- 目前 `.github/workflows/deploy.yml` 在 main push 後包含 database-tests、build、database-deploy 與 Pages deploy；推送不是單純上傳靜態檔。
- 發布前確認該次差異及所有可能執行的遷移；若要拆分部署流程，另開變更，不在這次 UI 修改中悄悄調整。
- 部署後核對實際版本、PWA 更新狀態與線上關鍵流程，才標記線上驗收完成。

## 4. 工作流與角色責任

```text
T0 → 第一批 T1 + T2 → 第二批 T3 + T4 + T5 → 第三批 T6 → 發布請求後 T7
```

| 角色 | 工作 | 交付 |
| --- | --- | --- |
| 主實作者 | 小模組、狀態契約、main.ts 整合 | 可維護的變更與任務紀錄 |
| 審查角色 | 對照 F1–F7、檢查資料及焦點邊界 | 檔案位置、風險、未完成清單 |
| 驗收角色 | 回歸測試、瀏覽器與實機驗收 | 通過／失敗／待驗證證據 |

預設由同一 Codex 依階段執行上述角色。此文件不啟動子 Agent；若後續明確要求多 Agent，`main.ts` 與 `work-input.ts` 各指定單一寫入者，其他 Agent 只負責獨立測試或唯讀審查。

## 5. 驗證矩陣與指令

| 層級 | 必驗情境 | 可證明的範圍 |
| --- | --- | --- |
| 單元測試 | 名稱去重、排序邊界、ID 保留、復原有效性、頁籤焦點計算 | 資料與純邏輯契約 |
| 本機瀏覽器 | 彈窗焦點循環、Escape、取消還原、四頁籤、按鈕排序與刪除 | 實際 DOM 互動 |
| 響應式 | 320×568、390×844、844×390；20+ 工種及長名稱 | 尺寸、捲動與按鈕可達性 |
| 實機 | 鍵盤開啟、中文組字、長按、左右滑、垂直捲動、縮放 | 真正手機互動 |
| 無障礙 | NVDA 或 VoiceOver 讀取 dialog／tab／panel／status | 輔助工具實際表現 |
| 保存回歸 | 切分類、失敗重試、重新載入、viewer、不同工地／日期 | 草稿、權限與作用範圍 |
| 發布後 | 實際 Pages 子路徑、PWA 更新、同版線上操作 | 部署版本的行為 |

現有 Vitest 使用 node environment；字串模板測試不能代替焦點、鍵盤或排版驗證。優先使用現有測試工具與瀏覽器操作；新增 DOM／E2E 套件須有具體必要性。

```powershell
npm test -- tests/unit/work-input-duplicates.test.ts tests/unit/mobile-workflow.test.ts tests/unit/trade-picker.test.ts tests/unit/input-workflow.test.ts tests/unit/entry-workflow.test.ts
# 實作後把本批新增測試納入定向執行
npm test
npx tsc -p tsconfig.json --noEmit
$taskPreviousBasePath = $env:BASE_PATH
try {
    $env:BASE_PATH = './'
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Local-path build failed.' }
    $env:BASE_PATH = '/daily-report-web/'
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Pages-path build failed.' }
} finally {
    if ($null -eq $taskPreviousBasePath) { Remove-Item Env:BASE_PATH -ErrorAction SilentlyContinue }
    else { $env:BASE_PATH = $taskPreviousBasePath }
}
git diff --check
```

每個檢查非零 exit code 都必須先調查，不以後續成功掩蓋失敗；兩次建置會先後覆寫 dist，若要逐一預覽，需在各自建置後驗證或分開保留產物。

## 6. 邊界限制

### 必須保留

1. 工地、日期、報表、施工卡與工項的既有 ID、JSON 欄位與儲存 schema。
2. 同工種不同廠商為獨立施工卡；同名不同位置工項可獨立存在。
3. 聯絡日期、數量規格、樓層、位置、備註仍屬當筆資料；不要因 UI 去重而寫入共用記憶。
4. 現有輸出格式、排序語意、12 人／5 筆等統計規則；測試使用複製或自建資料，不修改正式日報。
5. 完成操作列與搜尋建議的可達性；不採只提高 z-index 的修法。
6. Viewer 權限、IME、離線草稿及既有背景同步呼叫方式。

### 本次不包含

- 同步失敗／衝突修復、RPC／資料表／RLS／遷移改動。
- 雲端定稿保存、7 天保留政策、工地主檔更名。
- 批次匯入整篇日報、React／Next.js 重構、Vercel 搬遷或整站視覺改版。
- 全站所有清單的鍵盤化、全部無障礙合規認證、非本批工項的完整復原歷史。
- 更新全域 skills、Cursor Rules、AGENTS.md 或 hooks；本計畫就是目前的 Codex 工作規格。
- 自動 commit、push、部署或操作正式資料。

### 需要明確標記的限制

- 當次沒有測到的裝置與瀏覽器，交付中標記「待驗證」。
- 編譯成功不等於手機畫面通過；UI 修正不等於雲端同步已修復。
- 任何必要 schema 變更、部署流程修改或跨模組重構超出本批範圍，需另外寫明理由、影響與任務。

## 7. Token 與維護成本控制

- 每項任務只讀取相關模組、測試及必要呼叫端；以 F1–F7／T0–T7 追蹤，不反覆重貼整份稽核。
- 使用一份計畫與一份驗收紀錄；不製造多份內容相同的規則文件。
- 按批次提交可審查差異；共享檔案由單一寫入者整合。
- 每批先跑定向測試，整合後跑完整檢查；沒有新變更或新風險時不重複跑全套。
- 優先純函式測試與既有工具，不為少量介面修正引入大型元件庫。

## 8. 完成定義

- [ ] F1–F7 均有對應變更、驗收證據，或有清楚且具體的待驗證標記。
- [ ] T1–T5 的資料與焦點契約已完成，既有有效草稿不受影響。
- [ ] 定向測試、完整測試、TypeScript、兩種 BASE_PATH 建置通過。
- [ ] 瀏覽器互動驗收通過；實機與螢幕閱讀器結果分開列示。
- [ ] 差異僅含必要原始碼、測試、樣式與文件，沒有正式資料／憑證。
- [ ] 實作完成與部署完成分開陳述；T7 未執行時，不標記線上已修復。
