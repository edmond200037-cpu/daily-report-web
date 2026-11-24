# 改版前輸出與手打答案的既有差異

來源：`eba954fac976cf4d61224af6399847e53a95c18a` 的隔離舊 UI，2026-11-24 執行。實際共有 10 個情境，全部以舊操作流程填報、定稿並讀取真實剪貼簿；並非呼叫 formatter 產生答案。來源與原始輸出雜湊見 `tests/e2e/fixtures/baseline-output/provenance.json`。

新 UI 必須與 baseline-output 逐字相同，包含原始 Windows 剪貼簿 CRLF；不正規化 actual。只有依賴執行日期的兩例將日期換為佔位符，測試透過既有 renderAnswer 還原。原 expected 答案不改寫，差異另存於每次執行的 official-answer.diff。

以下皆為改版前已存在的差異，不屬於此次 UI 改版造成；官方模板如何調整仍待使用者裁定。

| 情境 | 改版前 formatter 與 expected 答案的差異 |
| --- | --- |
| standard | 首行星期為全形括號；聯絡章節分隔線為 11 個連字號，答案為 15 個；分隔線前多一空行 |
| same-spec-multiple-loads | 同 standard；同規格加總內容一致 |
| plan-a-today | 同 standard 的格式差異；雜工共用一個工種標題後分列廠商，答案則每家重複工種標題 |
| plan-b-cross-month | 同 standard 的格式差異；雜工共用標題後分列廠商，答案每家重複標題 |
| plan-c-cross-year | 同 standard 的格式差異 |
| plan-d-no-materials-no-contacts | 首行全形星期括號；三家雜工共用一個工種標題，答案每家重複標題；本例無聯絡章節 |
| plan-e-long-day | 同 standard 的格式差異 |
| paste-1120 | 首行全形星期括號；兩家雜工各自保留完整工項，答案合併廠商及共用工項 |
| paste-1117 | 同 standard 的格式差異；兩家雜工各自保留完整工項，答案合併；材料數量為 2503，答案為 2,503；聯絡日期括號為半形，答案為全形 |
| paste-1118 | 同 standard 的格式差異；兩家雜工各自保留完整工項，答案合併 |

隔離舊 UI 的原始逐字比對結果為 21 通過、6 失敗（該次暫用已核准的三種格式例外）；失敗的六例正是上表的多廠商／千分位／聯絡日期差異。新硬門檻已移除該暫時正規化，直接使用全部 10 份舊 UI 實際輸出。
