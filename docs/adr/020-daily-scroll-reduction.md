# ADR-020：日報減少手機上下滑動

日期：2026-11-24，已採用（使用者決定）。

## 原因

日報在手機上要不斷上下來回滑動：每區的新增按鈕在區段頂端、編輯器在列表中原地展開，表單一長就把列表推走，底部檢查列又常駐三列。目標是讓現場人員少滑動。

## 決策

- 恢復 [ADR-018](018-daily-add-bar.md) 的快速新增工具列（React 改版時遺漏），放在 AppShell 黏頂導覽、頁籤下方，只在 `#daily` 主頁出現。四顆按鈕沿用 `data-daily-action` 與 `data-add-section`，短標籤搭配完整無障礙名稱；各區內的大顆新增按鈕移除。標亮仍只代表捲動位置，純函式 `currentDailySection` 放在 `src/daily/add-bar.ts`，狀態只在 React state，不寫入 appState、草稿或 mutation。工具列與區段列表是不同 React root，以 `requestDailyAdd` 事件轉交點擊。
- 施工、進料、聯絡、特殊事項的新增與編輯都改在 BottomSheet（`purpose="form"`、`height="tall"`）。列表只顯示摘要列，握把排序與左滑刪除不變。Sheet 開關由既有狀態推導（`expandedId`、`materialEditor`、`contactEditor`、`justAddedEntry`；點選既有特殊事項只用元件內 UI 暫態），開關本身不造成 dirty、保存或 mutation。主要動作與取消固定在 Sheet 底部；關閉進料或聯絡仍走既有放棄確認。施工紀錄關閉只收起 Sheet，草稿與未提交的工項文字保留。
- 進料編輯器改為兩欄（材料類型｜品名、規格｜供應商、數量｜單位），備註預設收合（已有內容時展開），刪除進料移出儲存列。欄位自動帶入邏輯不變。
- 底部檢查列壓成一列：左側摘要，右側「檢查與預覽」。
- 編輯中縮小檢查列的 `isCompact` 與 `useInputFocus` 不再需要，已刪除；`useFooterSafety` 仍為頁面底部預留檢查列高度。

## 不變

formatter、資料模型、DB、同步、記憶與定稿規則、備份格式。

## 已知限制

- 工項拖曳時按 Esc 會一併關閉施工 Sheet（草稿保留）；鍵盤排序模式的 Esc 由握把先處理，不會關閉。
- 手機鍵盤彈出時聚焦欄位不被遮擋，僅在桌面瀏覽器以固定視窗驗證，實機尚未驗證。
