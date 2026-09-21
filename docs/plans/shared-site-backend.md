# 工地共用後端與跨裝置同步實作計畫

建立日期：2026-09-21  
狀態：規劃完成，功能尚未實作；以下未勾選項目均為待辦。  
範圍：`daily-report-web`。相鄰 `dailt-report-export` 不在本計畫改造範圍。

## 1. 目標與依據

每位成員以個人帳號，在手機與電腦共用同一工地的記憶主檔、當日施工日報草稿與水位資料；離線可保存，重連後同步，避免多人修改互相覆蓋。

- [架構提案](../architecture/shared-backend-proposal.md)
- [可編輯架構圖](../architecture/shared-backend-proposal.drawio)
- [ADR-013：工地共用資料與離線同步](../adr/013-shared-site-backend.md)
- 延續 [ADR-011](../adr/011-finalization-memory-commit.md) 的定稿、草稿保留與記憶規則。

本次只建立規劃文件，不建立雲端資源、不加入套件、不執行 migration 或部署。

## 2. 第一版決策

| 項目 | 第一版方案 |
|---|---|
| 前端 | 沿用 Vite PWA、GitHub Pages、現有官方文字輸出 |
| 後端 | Supabase Free：Auth、PostgreSQL、Data API、資料庫函式 RPC |
| 帳號 | Google 登入；登入成功不等於有工地權限 |
| 工地成員 | owner / editor / viewer；owner 審核加入申請 |
| 共用單位 | site_id；所有主檔、草稿、水位與快照均隔離工地 |
| 草稿 | 預設一工地一日期一份共用草稿；日期依 Asia/Taipei 判定 |
| 離線 | IndexedDB 保存本機資料與待同步操作；首次登入與加入工地需連線 |
| 同步 | 前景每 30 秒拉取目前工地；另於登入、重連、回前景與手動同步觸發；背景頁停止輪詢 |
| 寫入 | 本機既有存檔節奏保留；雲端由 outbox 批次送出，不逐鍵上傳 |
| 衝突 | 第一版整份日報版本檢查，保留兩份並人工選擇／合併；不自動最後寫入覆蓋 |
| 定稿 | 需在線，先同步草稿，再對指定版本定稿；離線仍能預覽與僅複製 |
| 備份 | owner 可下載完整工地資料；現有記憶備份功能保留原本範圍 |

第一版不包含附件、AI API、逐字即時協作、跨工地主檔共用、付費方案、自架伺服器。這些不應混入首輪同步改造。

部署前須取得的設定：Supabase project URL / publishable key、Google OAuth 應用設定、正式與本機 callback URL、第一位工地 owner。秘密金鑰不寫入前端或版本庫。

## 3. 模組與資料契約

下列目錄為規劃，尚未建立：

```text
src/auth/                  登入、session、工地成員上下文
src/sync/                  outbox、排程、重試、游標、衝突與狀態
src/data/local/            按 user_id / site_id 分區的本機存取
src/data/remote/           Supabase client 與 RPC adapter
src/domain/                可在不同執行環境驗證的領域契約
supabase/migrations/       schema、索引、RLS、RPC 與角色權限
supabase/tests/            SQL 權限與原子交易測試
tests/integration/         真實 IndexedDB 與同步整合測試
tests/e2e/                 兩帳號／兩裝置／斷線瀏覽器驗收
```

`src/data/db.js` 持續作為唯一 IndexedDB opener；新的 local adapter 不得自行開另一個未受控資料庫。Controller 經 Repository 呼叫同步介面，不直接呼叫 Supabase SDK。

### 雲端資料表

| 群組 | 規格與約束 |
|---|---|
| sites / site_members / join_requests | 成員 unique(site_id, user_id)；建立工地與加入 owner 同交易；不可刪除或降級最後一位 owner |
| memory_entries | kind、parent_id、normalized_name、payload、status、統計欄位；依種類與父層去重，明確處理 parent_id 為 NULL 的唯一性 |
| daily_drafts | UUID、site_id、report_date、payload、revision；unique(site_id, report_date)；不再使用全域 current |
| daily_reports / daily_memory_commits | 不可變快照與每草稿最近提交指紋；提交去重作用域為工地＋草稿，不共用全域指紋 |
| water_points / water_logs | UUID、site_id、measured_at、readings、revision；第一版同工地同時間一組量測，重複輸入轉衝突 |
| sync_operations | unique(site_id, user_id, mutation_id)，保存請求摘要與結果；相同 ID 不同 payload 拒絕 |
| site_changes / site_sync_state | 每工地連續版本序號、entity_id、operation、刪除標記與游標最低有效值 |

業務資料帶 `revision`、伺服器 `updated_at`、`updated_by` 與 `deleted_at`。父子引用必須具有相同 site_id；禁止從客戶端任意選擇資料表或 SQL 欄位。

不要把單純 UI 狀態（目前頁籤、展開、搜尋字串、未送出工項輸入器）變成共用草稿內容。工項排序、材料連接、完成狀態與實質文字則需同步。

### RPC 契約

| 介面 | 必要保證 |
|---|---|
| create_site / request_join / approve_member | 原子建立 owner；owner 才能核准；申請者不可自行指定角色 |
| apply_mutation | entity 白名單、成員與欄位驗證、base_revision 比對、mutation_id 去重、更新＋變更紀錄同交易 |
| pull_changes / bootstrap_site | 授權後取得分頁增量或一致性全量快照；回傳 next_cursor 與 has_more；游標過期要求重新初始化 |
| finalize_daily | 線上草稿指定版本、官方 formatter 驗證、快照＋記憶統計＋保留草稿＋變更序號同交易 |
| save_water_log / delete_water_log | 逐筆操作與伺服器重算；不得整份 replaceRecords 覆蓋其他人的紀錄 |
| export_site / restore_site | owner 限定、格式版本、完整性驗證與預覽；還原建立新工地後驗收，不直接覆蓋正式工地 |

結果以可辨識狀態回傳：`applied`、`duplicate`、`conflict`、`validation_error`、`forbidden`、`full_resync_required`。未登入和網路失敗另由傳輸層識別；禁止無限重試驗證或權限錯誤。

## 4. 同步不可破壞的規則

1. 本機資料與 outbox 在同一個 IndexedDB 交易寫入；寫入失敗不得顯示已保存。
2. 每筆操作具有固定 mutation_id；已送出或結果不明的操作不可修改 payload。後續修改串接新操作，收到上一筆 revision 後再送。
3. 未送出操作可以合併，但只可合併同帳號、同工地、同實體的操作；定稿不可合併。
4. 同裝置多分頁以單一 sender 鎖協調；仍以伺服器去重保證正確性。重試採退避，連線恢復可提前重啟。
5. CAS（比對版本後更新）、去重、業務寫入與變更紀錄需同交易。所有寫入通道必須遵守，不能繞過 RPC 直接修改資料表。
6. 每工地鎖序列化變更序號與提交順序。全量初始化取得一致快照與對應游標，避免初次下載期間漏更新。
7. 拉取套用與本機游標推進同交易。有待送出編輯時保留本機版本，進入衝突流程，不覆蓋 outbox。
8. 衝突 UI 顯示雙方內容、修改者、時間；解決後以最新雲端 revision 重新提交，若再衝突則重新確認。
9. 登出停止 sender 並隔離本機資料。撤銷成員後伺服器拒絕同步；已離線下載的副本無法遠端即時收回，連線後不得繼續展示為已授權雲端資料。
10. 刪除標記與操作去重保留期第一版暫定 30 天；超過期間的待送操作先進入恢復檢查，不直接重送。此期限不等於日報或水位的雲端保留期限。
11. UI 必須區分「已存本機」「待同步」「同步中」「已同步」「需處理衝突」「無權限／登入已過期」。

## 5. 分階段 TODO 與完成條件

依序執行 P0 → P1 → P2 → P3 → P4 → P5 → P6。每階段以可測試變更交付，不一次重寫所有模組。

### P0 — 建立基線與契約

- [ ] 執行既有 `npm test`、`npm run build`，記錄既有問題。
- [ ] 建立現有主檔、候選、材料連接、定稿與水位的匿名 fixture；不得使用真實工地資料提交版本庫。
- [ ] 定義 local-only / shared 模式介面與資料映射；雲端 key 未設定時舊模式可正常使用。
- [ ] 定義官方 formatter 與候選統計的服務端執行方案：優先共用 TypeScript 純函式；若需要 Edge Function，僅作驗證／格式化入口，原子寫入留在受權限保護的 RPC。
- [ ] 核實日期、資料保留、草稿粒度與衝突規格，補足契約測試。

完成條件：目前功能基線可重現；共享模式的介面與 fixture 固定；無 migration 或雲端資料寫入。

### P1 — 帳號、工地與權限

- [ ] 建立可重跑的 schema migrations、RLS 與權限 helper。
- [ ] 加入登入、建立／選取工地、加入申請、owner 審核與成員管理。
- [ ] 加入 owner/editor/viewer 權限矩陣測試，涵蓋 Data API、RPC 與外鍵跨工地存取。
- [ ] 加入 Supabase 設定範例與 OAuth 操作說明；第一次可用本機測試後端，不依賴正式專案。

完成條件：A 工地成員無法讀寫 B 工地；viewer 無法修改；申請者無法自我升權；最後一位 owner 受保護。

### P2 — 同步引擎與共用記憶

- [ ] 非破壞性 IndexedDB migration：分區、outbox、cursor、conflicts；版本號實作時以當前 DB_VERSION + 1 決定。
- [ ] 實作 mutation 去重、CAS、序號、全量初始化、增量拉取、重試與多分頁 sender 協調。
- [ ] 記憶 Repository 接入；保留 confirmed/candidate、父子關係與人工審核語義。
- [ ] 匯入只從一台來源裝置開始；其他裝置預覽去重後再合併，不互相覆蓋。
- [ ] 最早此階段提供完整雲端資料匯出，作為進入日常試用前的復原手段。

完成條件：兩帳號兩裝置的記憶 CRUD 可互通；斷線重試不重複；游標不漏資料；換帳號不洩漏或誤送佇列。

### P3 — 共用日報草稿

- [ ] 固定 current 改為 site_id / 日期 / 草稿 UUID；UI 狀態與共享內容拆開。
- [ ] 保存完整業務內容、排序、材料連接與完成狀態；以版本衝突保護整份草稿。
- [ ] 新增同步狀態與衝突比對畫面；尚未同步離線版本可單獨匯出。
- [ ] 處理跨日、切工地、關頁／重開、兩裝置同時建立當日草稿。

完成條件：手機已同步後電腦接續；A/B 同時修改不靜默覆蓋；改 UI 頁籤不產生共享資料衝突。

### P4 — 雲端定稿與記憶統計

- [ ] 同步完成後鎖定草稿 revision，服務端驗證並使用官方輸出格式。
- [ ] 同交易保存快照、保留草稿、提交指紋與記憶計次；第三次符合條件才轉 confirmed。
- [ ] 重試／再次複製不重複快照或計次；修改產生新指紋才走新定稿。
- [ ] 剪貼簿失敗與雲端定稿成功分開呈現，提供再次複製，不把它誤報為交易失敗。
- [ ] 隔離現有七天清理：清理本機快取不可產生雲端 delete mutation。

完成條件：ADR-011 的原子性、白名單、草稿保留及三次確認皆通過；兩人同時定稿結果一致。

### P5 — 水位共享

- [ ] 將本機整份 replaceRecords 路徑改為雲端逐筆寫入、刪除與重算。
- [ ] 測試插入較早量測、修改歷史量測、刪除量測、同時段衝突與跨日。
- [ ] 貼上匯入先解析預覽，再使用固定 mutation_id 提交；重送不重複。
- [ ] 三天本機保留與雲端資料期限分離；重算需取得範圍之前的有效量測作基準。

完成條件：兩裝置量測與變化量一致；任一裝置清快取不會刪除其他成員資料。

### P6 — 遷移、復原與試用上線

- [ ] 全部原始本機 stores 完整備份，記錄匯入來源與 ID 映射；保留舊資料，支援中斷續傳與去重重跑。
- [ ] 多裝置同日草稿人工選定來源或解衝突；禁止依修改時間盲選最新。
- [ ] 完整工地備份還原至新工地，驗證筆數、引用關係、日報輸出與水位結果。
- [ ] 設定正式 OAuth callback、GitHub Pages build 環境與 Supabase public 設定；檢查 dist 無秘密金鑰。
- [ ] 先用一個測試工地與兩名成員試用，確認配額、查詢大小、同步時間與休眠／復原流程。
- [ ] 驗收後再啟用實際工地；功能旗標可停止同步，但須保留佇列與雲端資料，不能當作刪除式回滾。

完成條件：完整矩陣通過，手機／電腦實測完成，備份可還原；雲端故障時仍可本機存檔並知道尚未同步。

## 6. 驗收矩陣

| 測試 | 預期 |
|---|---|
| 成員 / 非成員 / viewer 直接呼叫 API | 授權結果與角色一致，不僅隱藏 UI |
| 離線保存後重啟瀏覽器 | 草稿與待同步操作仍存在 |
| 伺服器已提交但回應遺失 | 同 mutation_id 重試返回原結果 |
| 同一草稿兩人同時修改 | 一方成功，另一方保留本機版本並提示衝突 |
| 分頁拉取途中有其他人寫入 | 不遺漏、不重複套用，不提前推進游標 |
| 游標或 mutation 去重期限過期 | 進入恢復流程，保留未同步編輯，不復活已刪資料 |
| 切帳號／切工地／移除成員 | 無跨帳號佇列寫入、無跨工地讀寫 |
| 定稿重試、第三次記憶確認 | 快照與計數符合 ADR-011，同交易成功或失敗 |
| 水位插入／修改／刪除歷史 | 伺服器與兩裝置重算結果一致 |
| Service Worker 更新／清本機快取 | 不清除未同步資料，不觸發雲端刪除 |
| 完整備份還原 | 新工地可重建資料及其引用，輸出一致 |

現有檢查命令為 `npm test`、`npm run build`。SQL、IndexedDB 整合與瀏覽器測試命令尚未存在，需在對應階段新增並記錄；不得將 Node 單元測試通過視為多人同步驗收。

## 7. 執行工作包與 Agent 邊界

這些是後續實作分工，不代表目前已啟動多 Agent。

| 工作包 | 責任範圍 | 前置依賴 |
|---|---|---|
| 契約／整合 | ADR、型別、Repository 介面、整合與發版 | P0 |
| 後端／權限 | migrations、RLS、RPC、SQL 測試 | 固定契約 |
| 本機／同步 | IndexedDB、outbox、cursor、重試、衝突狀態 | 固定契約及測試用 RPC |
| UI／驗收 | 登入、選工地、衝突與同步畫面、雙裝置測試 | 同步狀態介面 |

如後續使用多 Agent，先凍結型別與檔案所有權；`src/main.ts`、`src/data/db.js` 與 migration 序號由整合負責人協調，避免同檔平行修改。

提供給 Codex / Claude Code / Cursor 的每個工作包只帶：本階段 TODO、相關 ADR、介面檔、修改範圍與驗收案例。提交摘要記錄「已完成／待完成／測試／阻礙」，不重複載入整份專案或全部歷史。此計畫不新增全域規則或重寫現有 AGENTS.md。

## 8. 風險與待部署時確認

- 免費配額、暫停與備份限制沿用架構提案中的官方來源；正式開通時重新查核。預設不自動升級付費。
- 第一版整份草稿衝突可能偏頻繁；先驗證實際協作，再決定是否拆為工項粒度，不提前引入 CRDT。
- 雲端暫定不自動刪除業務歷史；顯示近七天／三天僅為查詢與快取範圍。上線前依實際資料量訂定可復原的保留政策。
- 第一位 owner、OAuth 與雲端專案由使用者帳號持有；缺設定時繼續本機開發與測試，不能宣稱已可跨裝置使用。

下一個可執行工作包：P0。執行本計畫前先重新讀取工作區狀態，保留使用者未提交的變更。

