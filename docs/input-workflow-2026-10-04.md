# 逐筆新增流程實作與驗收

> 2026-10-04 手機修正更新：以下舊紀錄保留作為歷程，最新變更與驗收請見 `artifacts/mobile-fix-2026-10-04/review.md`。附加工項控制維持隱藏，候選清單排除已加入項目；不再依照下方舊版「顯示已加入狀態」設計。

依據：`artifacts/ux-review-2026-10-04/input-workflow-plan.md`。

## 本機程式變更

- 施工與聯絡共用工種選擇器；完成並新增回到選擇器，取消不產生空白紀錄。搜尋部分匹配時仍可使用不同的新名稱。
- 施工完成先納入尚未加入文字、驗證並保存；缺漏時保留表單並定位欄位。另有「保留草稿返回」。廠商可帶入最近值，人數與工項不沿用。
- 工項加入改成局部附加 DOM，保留原輸入框；常用選項顯示已加入狀態，支援明確再加同名項、移除及撤銷最新加入項。中文組字與 keyCode 229 不觸發 Enter 加入。
- 聯絡搜尋只更新建議區，保留游標。加入工作內容後保持搜尋焦點；完成時納入尚未加入文字。新增與修改草稿在切分類、收合、重載後可保留。
- `entry-workflow.ts` 集中管理編輯草稿格式、分區鍵、聯絡工項加入與記憶文字抽取。未提交文字存於 localStorage，依帳號／工地／日期分區；正式日報仍沿用既有 IndexedDB、穩定 ID 與同步流程。
- 聯絡日期選填；「沿用上筆」必須點選。數量／規格放在選填展開區。為沿用既有資料契約，加入後合併到內容文字；已加入內容可直接編輯。日期與標記過的數量／規格不列入候選工項名稱。這不是新增結構化雲端欄位。
- 日期切換期間暫停表單操作，並使舊背景同步結果失效，避免將新輸入寫入舊日期。
- 預覽改為一般頁面區塊，避免浮層遮擋；摘要顯示施工筆數、人數、聯絡筆數與未完成數。聯絡草稿未完成時，禁止定稿或複製不完整日報。
- 日報保存狀態與工地記憶待同步／需處理數分開顯示。手動同步改稱「同步結果」，區分本輪失敗與整體尚未送達數；不再以最後讀取時間宣稱全部已同步。

## 已執行驗證

- TypeScript：通過。
- Vitest：40 個測試檔、177 項測試通過。新增測試涵蓋未加入文字只納入一次、日期不隱性沿用、附加內容不污染記憶、草稿分區與損壞資料回報。
- Vite 正式打包與 PWA injectManifest：通過。驗證輸出位於 `artifacts/ux-review-2026-10-04/build/`；未覆蓋交付用的既有 dist。
- 一般 CLI 在此環境遇到 `realpath EPERM`；使用下列只影響此次執行的參數完成驗證，未修改 Vite 專案設定：

```powershell
npx tsc -p tsconfig.json --noEmit
node --input-type=module -e "import {startVitest} from 'vitest/node'; await startVitest('test',[],{run:true,reporters:['dot']},{resolve:{preserveSymlinks:true}});"
node --input-type=module -e "import {build} from 'vite'; await build({resolve:{preserveSymlinks:true},build:{outDir:'artifacts/ux-review-2026-10-04/build',rollupOptions:{preserveSymlinks:true}}});"
```

## 待驗收與獨立工作包

- [ ] 以原三筆施工／五筆聯絡案例真人逐字輸入，記錄點擊、重打、鍵盤切換與時間。不能用自動化時間替代。
- [ ] 桌面／手機檢查六項連續加入、句中改字、組字 Enter、取消下一筆、修改後返回原卡片與實際鍵盤遮擋。
- [ ] 驗證離線、兩台裝置及儲存失敗情境。本次瀏覽器程序啟動失敗，本機 HTTP server 也遭 WinError 10013 拒絕，沒有宣稱瀏覽器驗收通過。
- [ ] 核對正式 `apply_memory_application` 的 PGRST202、函式簽章與 migration/schema cache，修復後保留 mutation ID 與相依順序重送。此次未部署資料庫、清除佇列或宣稱雲端問題已修復。
- [ ] 部署新版前確認以上人工驗收；此次僅修改本機原始碼。

所有輸入、搜尋與驗證皆在本機處理，不新增 LLM 呼叫或逐筆 Token 成本。
