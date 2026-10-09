# CLAUDE.md — 施工日報生成器（daily-report-web）

> 給 Claude 與其他 AI／協作者的專案工作守則。開工前先讀完本檔；細節以 `docs/` 為準，衝突時以 **ADR-014**（現行契約）和 `PRODUCT.md` 為最高依據。

## 1. 專案是什麼

離線、手機優先的 **施工日報 + 水位變化** PWA，給工地現場人員在手機上快速填報。
- 本機模式：IndexedDB，無帳號、無後端也能完整使用。
- 共用模式：登入 Supabase（Google OAuth）並選擇共用工地後，透過 outbox 同步佇列與 Realtime 提示，與其他成員跨裝置共編。
- 輸出：可預覽、可「定稿並複製」的繁體中文日報文字（官方模板）。

### 專案目標
1. 現場人員能**可靠**完成當日紀錄（弱網／離線也能輸入）。
2. **本機資料與歷史不因更新、改名、刪除而遺失或被錯誤改寫**（成功標準之一）。
3. 輸入資料可轉成可預覽、可複製、可交付的日報文字與水位文字。
4. 多人同工地共編時，不同欄位的修改能共存；衝突可見、可處理、不靜默覆蓋。

### 使用者與情境
工地現場人員（主要）與現場主管（檢視／整理／複製）。手機觸控、不穩定網路、中文輸入法（IME）。

## 2. 技術棧與指令

Vite 6 + TypeScript 5（strict）+ vite-plugin-pwa（injectManifest）+ Vitest 4 + IndexedDB（`fake-indexeddb` 測試）+ `@supabase/supabase-js`。**沒有 UI 框架**，`src/main.ts` 直接以字串模板／DOM 操作渲染，Hash Routing。後端為 Supabase（PostgreSQL + RLS + RPC + Realtime）。部署為 GitHub Pages。Node 22。

```sh
npm ci                  # 安裝（乾淨安裝）
npm run dev             # 開發；Windows 可用 start-dev.bat（127.0.0.1:5300，開 /#daily）
npm test                # vitest run（tests/**/*.test.ts，environment: node）
npm run build           # tsc -p tsconfig.json && vite build
npm run check:release   # npm test && npm run build（push 前必過，與 CI 一致）
npm run hooks:install   # 每個 checkout 安裝一次 .githooks/pre-push
node scripts/db-behavior-tests.mjs   # 隔離 PostgreSQL 行為測試（見 §7）
```
- 不要直接雙擊 `index.html` 或用舊靜態伺服器；一律走 Vite。
- `BASE_PATH=./`（預設）與 `BASE_PATH=/daily-report-web/` 兩種建置都必須能過。
- 遇到 EPERM 等環境問題，先修環境，**不要略過檢查**。

## 3. 目錄地圖

| 路徑 | 職責 |
|---|---|
| `src/main.ts` | Hash 路由 + 手機優先 UI 殼層（最大檔，約 1500 行）|
| `src/data/db.js` | **唯一**開啟 IndexedDB、schema migration 的入口（`DB_VERSION = 18`）|
| `src/data/daily-repository.ts` | 草稿、定稿、記憶、設定的 repository |
| `src/data/{memory,water}-partition.ts`、`local/shared-context.ts` | 依帳號／工地隔離的本機分區快取 |
| `src/data/remote/` | Supabase client、site repository |
| `src/domain/` `src/types/` | 日報領域型別（`TradeSection`、`WorkItem`、`MaterialEntry`…）|
| `src/daily/` | 日報控制器、驗證、**官方文字 formatter**、輸入流程、手勢、工種選擇器 |
| `src/format/` `src/shared/` | 日期／名稱正規化、十進位驗證、HTML 跳脫 |
| `src/water-level/` | 井位、量測、變化量、解析、匯入、三天顯示範圍（目前為 `.js`）|
| `src/settings/` | 記憶審核、有效套用累積、工種管理 |
| `src/sync/` | outbox、engine、欄位 mutation、衝突審核、復原、診斷、Realtime、工作區鎖 |
| `src/account/` `src/auth/` | 共用工地、登入、成員管理、同步診斷 UI |
| `src/pwa/` `src/service-worker.ts` | PWA 更新生命週期；SW 只快取 App Shell |
| `supabase/migrations/` | **正式** migration（CI 只載入這裡）|
| `supabase/{repairs,diagnostics,tests}/` | 修復／診斷 SQL（事件佐證，不是自動套用）|
| `scripts/` | 部署資料庫、API 契約檢查、DB 行為測試、hook 安裝 |
| `tests/unit/` | 約 48 個測試檔，含大量**版面／契約測試** |
| `docs/` | `adr/`、`data-model.md`、`glossary.md`、稽核與修復紀錄 |

根目錄另有 `PRODUCT.md`（產品規格）、`DESIGN.md`（介面設計）、`CONTEXT.md`（領域語言）、`README.md`。

## 4. 不可違反的限制（硬規則）

### 資料與儲存
1. **所有 IndexedDB 連線必須經過 `src/data/db.js` 的 `openDatabase()`**；任何模組不得自行用不同版本開庫。
2. schema 變更必須提高 `DB_VERSION`，只走 `onupgradeneeded` 這一條 migration 路徑，用 `event.oldVersion` 判斷。**無法安全轉換的資料不得靜默刪除或猜測轉換**，須保留原始備份。
3. **定稿快照（`daily_reports`）不可回寫**：不得被主檔改名／刪除、草稿編輯、設定變更改動；保留 7 個日曆日後自動清除。
4. `live_report_draft` 是唯一可編輯草稿；定稿後**保留草稿**，不建立空白草稿。
5. 定稿依 `outputText` 內容指紋去重：指紋相同只再次複製，不新增快照、不重複累加記憶次數；快照與記憶提交必須原子化，任一失敗整次失敗。
6. 記憶備份（`memories@2`，相容讀 `@1`）**只含可重用主檔**，採合併去重匯入；**絕不**納入或覆蓋草稿、定稿、水位資料。
7. Service Worker **只快取應用程式資源，絕不快取日報資料**；PWA 更新不得清除 IndexedDB，更新前要 flush 草稿。
8. 單日事實（人數、進料數量、樓層、日期、備註、特殊事項）**不得**自動寫入記憶；定稿記憶白名單僅限：工地、工種、廠商、工程工項、聯絡施工項目、位置、材料類型／品名／規格／單位／供應商。

### 記憶規則（現行）
- 候選記憶以**有效套用事件**去重累計，**第 4 次**自動確認為正式主檔（舊「定稿三次」規則已停用）；人工審核可提前確認。重試、預覽、自動保存不計次。
- 候選記憶不出現在一般建議清單。

### 同步與共用工地
- 本機寫入成功 ≠ 雲端成功；未同步必須明確提示。雲端已提交版本是共用資料權威。
- 共編寫入用**帶唯一操作 ID 的欄位 mutation**（ADR-0001），由穩定 ID 指涉項目，**不得用陣列索引**。已刪除識別（tombstone）不得被舊 mutation 復活。
- 衝突解決前**必須永久備份**原始本機操作、衝突、比較時雲端內容；不得清掉才處理。
- 無法靠重試改善的錯誤（權限、缺函式、格式不相容）標為 **blocked**，保留資料與診斷，不無限重試。
- 本機「近 3 天」水位範圍只是**顯示篩選**，只有使用者明確刪除才產生共享刪除；較舊量測保留為變化量基準。
- 帳號／工地／日期切換期間暫停表單操作，舊背景同步結果必須作廢，避免資料寫到錯的日期或工地。

### 後端 / Supabase
- **正式環境的 migration 不由 AI 自行套用**；也不得「只憑資料表存在」就標記 migration history 為已套用（見 `docs/deployment-history-reconciliation-2026-10-07.md`）。
- 新增 `public` 函式必須明確 `grant execute … to authenticated`；`anon`／`PUBLIC` 不得可執行（`20261008150000_revoke_anon_function_access.sql`）。每個寫入 RPC 先驗證登入與編輯權限，再取工地鎖。
- 改 SQL 後需通過 `supabase/tests/` 與 `scripts/db-behavior-tests.mjs`，並用 `supabase/diagnostics/function-exposure.sql` 確認 `anon_execute` 皆為 false。
- 自動測試、隔離 PostgreSQL（Auth 為 shim）**不能取代**正式 OAuth／Realtime／手機實機驗收。回報時必須把「本機通過」與「線上已驗證」分開寫。

### 安全與機密
- 本倉庫是 **public repo**。`.env.local`、`.env`、service role／secret key、資料庫連線字串、任何 token **絕不 commit、絕不貼進輸出或文件**。`VITE_*` 只能放 URL 與 publishable key，**禁止**放 secret／service role。
- 已被忽略、不得提交：`node_modules/`、`.npm-cache/`、`dist/`、`artifacts/`、`*.zip`、`.test-results.json`、`.mobile-test-results.json`、`supabase/.temp/`、`.verification-*`。
- 所有渲染進 HTML 的使用者字串須經 `src/shared/html.ts` 跳脫（含單／雙引號）；選擇器用 `CSS.escape`；遠端與草稿載入要驗證，非法遠端列隔離備份。
- 驗證工具、診斷產物放 `artifacts/`（已忽略），不要散落根目錄。

### 介面與產品
- 全站**繁體中文**；手機優先；觸控目標 **≥ 44px**；窄螢幕不得水平捲動；動態效果尊重減少動態設定；文字對比通過 WCAG AA。
- **中文輸入法（IME）**：組字期間（`isComposing`、keyCode 229）不得因重新渲染破壞輸入或觸發 Enter 加入；搜尋只局部更新建議區、保留焦點與游標。
- 資料列優先、不堆圓角卡片、不用漸層與裝飾陰影；日報保留施工橘、水位保留量測綠；狀態以文字／細線／小標記表示。
- 純 UI 暫態（展開／收合、頁籤、焦點、未提交輸入、Bottom Sheet 開關）**不得造成 dirty、不得觸發保存、不得進入 mutation／遠端快照**。
- 「完整性」由內容自動推導，不加逐卡手動「完成」標記。UI 上 `draft` 顯示為「未完成」，但**資料狀態名稱不改**。
- 獨立進料最多連接**一個**工程條目（單一來源）；連接／解除／改接要原子化，並使受影響工種退回草稿。
- 工項排序只提供長按 400ms 拖曳握把（無鍵盤替代，ADR-007 已接受）；左滑 ≥72px 且水平為主才刪除，並提供 6 秒復原。
- 不得重做設定中心、水位頁或全站導覽；不得變更資料模型、備份格式、formatter、驗證規則、定稿快照，除非需求明確要求。

## 5. 開發慣例

- TypeScript `strict`、`noUnusedLocals`、`noUnusedParameters` 全開；新程式用 `.ts`。`water-level/`、`data/db.js` 等既有 `.js` 維持原狀，不順手改寫。
- 沒有 ESLint／Prettier：**沿用周邊檔案的風格**（單引號、分號、2 空格縮排），不要大範圍重排版。
- 領域用語依 `docs/glossary.md` 與 `CONTEXT.md`（例：工項輸入器、定稿快照、記憶提交點、衝突審核項、待同步操作明細）；UI 文案與測試命名沿用這些詞，避免 `CONTEXT.md` 的 _Avoid_ 寫法。
- 小步修改、局部 DOM 更新優先；`main.ts` 很大，新增邏輯優先放進對應模組（`daily/`、`sync/`、`settings/`），不要再往 `main.ts` 堆。
- 保持單一來源：彙整、連接、輸出一律回到原始記錄，不複製出會分歧的資料。
- Commit 訊息沿用現有簡短中文風格（如「修復」「聯絡事項對其」）；一個 commit 一件事。

## 6. 測試與驗證流程

1. **改版面必須同步維護對應的版面契約測試**（`tests/unit/*presentation*`、`*contract*`、`daily-workspace-shell` 等）。
2. 修 bug 先補回歸測試；涉及舊資料升級要用 `fake-indexeddb` 做舊版 IndexedDB 升級測試。
3. 完成前至少跑：`npx tsc -p tsconfig.json --noEmit` → `npm test` → `npm run build`（理想是 `npm run check:release`）。
4. 回報時分三層寫清楚：**本機自動檢查通過** / **隔離 DB 通過** / **線上與實機尚未驗證**。不要把前者說成後者。
5. UI 改動要在手機寬度（約 360–430px）實際看過，不能只靠單元測試。
6. 若沙箱遇到 `realpath EPERM`，可用 `resolve.preserveSymlinks: true` 的程式化執行（見 `docs/input-workflow-2026-10-04.md`），但**不要修改專案設定檔來繞過**。

## 7. 發布與部署

- `main` push → GitHub Actions：`database-tests`（PostgreSQL 17）→ `build`（測試 + 兩種 BASE_PATH 建置）→ `migration-review`（只在 Summary 列出這次動到的 migration）→ `database-deploy`（**需在 `production-database` Environment 人工核准**；僅限 `main`；Supabase CLI 2.119.0：history 預檢、migration、`check-sync-api`）→ `deploy`（GitHub Pages）。**任一失敗或未核准即停止前端發布。** 設定步驟見 `supabase/README.md`。
- `.githooks/pre-push` 會跑 `npm run check:release`；hook 不隨 clone 啟用，新 checkout 要 `npm run hooks:install`。
- Secrets（`SUPABASE_DB_URL`、`SUPABASE_SYNC_CHECK_*`、`VITE_SUPABASE_*`）只存在 GitHub Secrets／本機 `.env.local`。檢查帳號只對指定驗收工地寫入，**不用真實工作資料做寫入測試**。
- 推送成功後仍要確認 Actions 的 deploy 真的成功；本機 hook 通過不代表線上已發布。
- 目前分支 `hardening/stage0-1`；另有 `main`、`dev`。**未經使用者要求不要 push、不要動 `main`、不要 force push。**

## 8. 與 AI 協作的規則

- **先讀再改**：動資料層、同步、SQL 前，先讀 `docs/data-model.md`、相關 ADR 與對應測試。
- 做**最小必要修改**；不順手重構、不擴大範圍。DESIGN.md 明確說「沒有實際問題時不為形式一致而擴張修改」。
- 以下情況**先停下來問使用者**：要改 `DB_VERSION`／schema、動 migration 或 repair SQL、變更備份格式、改 formatter 輸出文字、改定稿／記憶規則、碰正式 Supabase。
- 不得刪除或改寫使用者資料、`.git`、`docs/` 內的歷史稽核與 ADR（ADR 為歷史紀錄，修正現況請改 ADR-014 或新增 ADR）。
- 新的重大決策寫成 `docs/adr/` 新檔，並同步更新 `docs/glossary.md`（若有新詞）與 `README.md` 的「已知限制」。
- 文件、UI、commit 預設使用**繁體中文**；程式識別字維持英文。
- 不確定時，**說出不確定**並提供選項，不要編造行為或把「推測」寫成「已驗證」。

## 9. 已知限制與待辦（截至 2026-10-08）

- 完整 migration 管理 UI 尚未提供；舊資料升級靠保留原始備份的自動修復。
- 雲端定稿 RPC 與**定稿快照的跨裝置歷史**未實作（定稿仍僅本機 7 日）。
- 正式 Supabase 的 OAuth／Realtime、手機實機手勢、部署快取**尚未完整驗收**；兩個 baseline migration（202609230001／0002）的 history 補登需使用者在正式專案手動執行 `supabase/repairs/reconcile-deployment-history.sql`。
- Bottom Sheet 預覽／定稿面板等 DESIGN.md 後續階段尚未全數實作。
- `main.ts` 過大、水位模組仍為 `.js`，屬技術債，非當前優先。
- GitHub Actions 新增的 DB 閘門是否已在遠端實際跑過，需到 Actions 頁確認。

## 10. 快速參考：常見任務該看哪裡

| 任務 | 先看 |
|---|---|
| 改日報輸出文字 | `src/daily/daily-formatter.ts`、`daily-output-model.ts`、`daily-output-v2.test.ts` |
| 改工項輸入／IME | `src/daily/work-input.ts`、`input-workflow.ts`、`docs/input-workflow-*.md` |
| 改同步／衝突 | `src/sync/engine.ts`、`outbox.ts`、`field-mutations.ts`、ADR-0001 |
| 改記憶學習／審核 | `src/settings/memory-*.ts`、`src/sync/memory-*.ts`、ADR-014 |
| 改 IndexedDB | `src/data/db.js`、`docs/data-model.md`、`legacy-repair.js` |
| 改水位 | `src/water-level/`、`water-level-presentation.test.ts` |
| 改 SQL／權限 | `supabase/migrations/`、`supabase/tests/`、`supabase/README.md` |
| 改 PWA 更新 | `src/pwa/update-state.ts`、`src/service-worker.ts`、`service-worker-update-contract.test.ts` |
