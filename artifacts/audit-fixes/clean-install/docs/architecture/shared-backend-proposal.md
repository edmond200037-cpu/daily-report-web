# 多人共用後端提案

狀態：設計草案，尚未建置或部署。2026-09-21。

後續執行入口：[工地共用後端與跨裝置同步實作計畫](../plans/shared-site-backend.md)，包含 P0–P6 TODO、API 契約、驗收與遷移流程。

已確認需求：多人共用同一工地，每人跨手機與電腦使用；共用記憶、當日草稿與水位資料。

建議：保留現有 GitHub Pages PWA，增加 Supabase Free（Auth + PostgreSQL + Data API / RPC）。前端保留 IndexedDB 作離線快取，新增同步層。Supabase 不會自動同步既有 IndexedDB；同步與衝突處理必須實作。

## 使用方式

1. 每人以個人帳號登入，建議 Google 登入，避免初期自行維護密碼與寄信流程。
2. 管理員建立工地；其他人登入後提出加入申請，由管理員核准。知道工地名稱或 ID 不代表有存取權。
3. 同工地成員看到共用主檔、同一份當日日報與水位。預設一工地一天一份共用草稿；若需分班次，將唯一鍵擴充為工地 + 日期 + 班次。
4. 手機離線仍可保存，顯示「已存本機／待同步」；只有伺服器確認成功後才顯示「已同步」，此時另一裝置才會取得。

## 資料與權限

| 資料表群組 | 主要欄位 / 規則 |
|---|---|
| sites / site_members / join_requests | 工地、user_id、role；角色 owner/editor/viewer，管理員才可核准成員或調整角色 |
| memory_entries | site_id、kind、parent_id、normalized_name、status、payload；按種類及父層建立去重約束，保留現有材料與工種語義 |
| daily_drafts | UUID、site_id、report_date、payload、revision；unique(site_id, report_date) |
| daily_reports | 定稿 UUID、draft_id、snapshot、output_text、created_by；快照不可直接修改 |
| water_points / water_logs | UUID、site_id、point_id / measured_at、量測內容、revision；同時段重複輸入須檢查衝突 |
| sync_operations / site_changes | mutation_id 去重、伺服器變更序號、刪除標記；按保留政策清理 |

共同欄位：site_id、updated_by、server updated_at、revision、deleted_at。服務端驗證內容、外鍵所屬工地與角色，不信任客戶端自報的 user_id 或 role。

所有業務表啟用 RLS。讀取需是成員，寫入需為 editor/owner；viewers 只读。前端只使用 publishable key + 登入 token，絕不放 service_role / secret key。RPC 同樣需檢查成員資格；若使用 SECURITY DEFINER，必須限制 search_path、執行權限與作用範圍。

## 同步 Workflow

1. 在同一個 IndexedDB 交易中保存本機變更與 outbox，包含 user_id、site_id、entity_id、mutation_id、base_revision。
2. App 開啟、重新連線、返回前景或手動同步時啟動 worker；線上完成存檔後短暫 debounce 批次送出。避免每按一個字就請求雲端。
3. 後端原子執行：驗證權限 → 查 mutation_id → compare-and-swap revision → 更新資料與變更紀錄 → 回傳新版本。逾時重試使用相同 mutation_id。
4. revision 不符時回傳 conflict；保留本機與雲端兩份，不用時間戳或最後存檔者靜默覆蓋。第一版採整份草稿版本檢查；同時編輯頻繁時再拆成工種／工項粒度。
5. 拉取更新以可恢復的服務端游標分頁；不可單憑裝置時鐘。提案採每工地交易鎖序列化寫入與變更序號，防止序號先配發但晚提交而漏資料。
6. 拉取內容只更新沒有本機待送出的資料；有待送變更時先比對版本，不得覆蓋 outbox。游標與本機套用同交易提交。
7. 離線刪除使用 tombstone；游標超過保留期限時強制完整重同步，先保留待送變更。登出後停止該帳號佇列，其他帳號不能送出前一帳號的變更。

第一版採前景低頻拉取（例如每 30 秒，僅目前工地）加手動同步，優先降低實作與維護成本。Realtime 可作第二階段的更新提醒，但不能替代重連補抓與版本檢查。這不是 Google Docs 式逐字協作。

## API 邊界（提案名稱，尚未建立）

| 介面 | 用途 |
|---|---|
| Supabase Auth | 登入、登出、更新 session |
| Data API + RLS | 讀取已授權的工地與業務資料 |
| apply_mutation(site_id, mutation_id, entity, base_revision, payload) | 白名單實體、伺服器驗證、原子更新、衝突回應 |
| pull_changes(site_id, cursor, limit) | 增量拉取；過期游標回傳 full_resync_required |
| finalize_daily(draft_id, base_revision, mutation_id) | 從伺服器最新草稿建立快照、更新記憶使用次數；定稿原則上需在線 |
| save_water_log(..., base_revision, mutation_id) | 保存量測與重算受影響水位，禁止用裝置的整份清單覆蓋雲端 |
| approve_site_member(site_id, request_id, role) | 管理員核准，禁止自行授權 |

資料權威：共用資料以雲端已提交版本為準，本機保存尚未同步的編輯。定稿文字由經驗證的草稿產生，模板版本固定並由伺服器驗證或生成，避免信任任意 output_text。

## 現有程式要改的地方

- `src/data/db.js`：增加 outbox 與 sync cursor；資料依帳號/工地隔離；migration 不刪舊資料。
- `src/data/daily-repository.ts`：將固定 `current` 改為草稿 UUID 與工地/日期查詢；定稿轉由線上交易處理。
- `src/water-level/repository.js`：目前 replaceRecords 全量替換不能用於雲端；改成逐筆 mutation 與伺服器重算。
- `src/main.ts`：新增登入、選工地、成員管理、同步狀態與衝突畫面。
- 新增 `src/auth/`、`src/sync/`、`src/data/remote/`、`supabase/migrations/` 與權限測試。
- 現行七天日報／三天水位清理只可用於本機快取策略，不能直接變成雲端刪除命令。雲端歷史保存期限由工地管理員政策決定。

## 上線順序 / TODO

1. 建立 Supabase 專案、Google 登入、site_members 與 RLS；先驗證非成員無法讀寫。
2. 完成共享記憶主檔與帳號/工地隔離；選一台裝置當初始資料來源，其他裝置用預覽去重匯入，保留舊 IndexedDB。
3. 完成日報草稿 outbox、版本衝突、重試去重與跨裝置同步。
4. 加入水位逐筆同步、服務端重算、定稿交易。
5. 增加完整工地備份與還原演練；既有「記憶備份」並非完整備份。
6. 驗收手機與電腦互通、兩人同時修改、斷線後重送、換帳號、移除成員、舊游標恢復、跨工地越權。

## 免費方案與成本控制

2026-09-21 查核：Supabase Free 為 $0/月，含 500 MB database、5 GB egress、50,000 MAU；一週低活動可能暫停，不含自動資料庫備份。對少量人員與純文字工地資料，可作免費起步方案；是否足夠仍需依筆數、同步頻率與實測用量確認，不保證永久免費或不中斷。

僅上傳結構化文字；初期不做照片/附件、不加入 AI API。批次上傳、只同步差異、只訂閱目前工地；保留本機快取。管理員定期匯出完整資料到本機，雲端同步不等於備份。未來超額時再評估升級或搬移 PostgreSQL。

來源：[Supabase 價格](https://supabase.com/pricing)、[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)、[API keys](https://supabase.com/docs/guides/getting-started/api-keys)、[Google 登入](https://supabase.com/docs/guides/auth/social-login/auth-google)。

## 圖檔

`shared-backend-proposal.drawio` 為可編輯提案；`shared-backend-proposal.png` 由同一組節點與座標產生的示意預覽，非 draw.io 原生匯出。圖中的箭頭表示依賴／通訊關係，API 回應沿同一路徑返回；Auth 的 token 由前端送到 API。架構圖無執行中的後端，XML 檢查不代表權限或同步已驗證。

交付檢查：draw.io XML 為 0 errors / 0 warnings；已檢視同模型 PNG，文字與連線可讀。尚未執行 draw.io 原生渲染驗收或任何後端測試。
