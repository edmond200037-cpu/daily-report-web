// 把 Supabase pg_dumpall 備份轉成試算表 CSV（entities / history）。只讀備份，不連網、不改 App。
// 用法：node scripts/migrate-backup-to-sheet.mjs <dump.sql> <輸出資料夾> [工地名稱=鑫天地六]
// 規格見 docs/plans/gas-sheets-backend-migration.md 第 4、8 節。
import fs from 'node:fs';
import path from 'node:path';

const [dumpPath, outDir, siteName = '鑫天地六'] = process.argv.slice(2);
if (!dumpPath || !outDir) { console.error('用法：node scripts/migrate-backup-to-sheet.mjs <dump.sql> <輸出資料夾> [工地名稱]'); process.exit(1); }

const KEEP_DAYS = 3;
const CELL_LIMIT = 45_000; // 試算表一格上限 50,000 字元，留餘裕
const STORES = ['sites', 'trade_types', 'trade_vendors', 'trade_tasks', 'location_memories', 'material_types', 'material_memory_items', 'app_settings'];
const KIND_STORE = { site: 'sites', trade: 'trade_types', vendor: 'trade_vendors', task: 'trade_tasks' };

// --- 讀 COPY 區塊（pg text 格式：\N = NULL，\\ \n \t \r 為跳脫） ---
const unescapeField = (v) => v === '\\N' ? null : v.replace(/\\(.)/g, (_, c) => ({ n: '\n', t: '\t', r: '\r' }[c] ?? c));
const tables = {};
let current = null;
for (const line of fs.readFileSync(dumpPath, 'utf8').split('\n')) {
  if (current) {
    if (line === '\\.') current = null;
    else tables[current.name].push(Object.fromEntries(line.split('\t').map((v, i) => [current.cols[i], unescapeField(v)])));
    continue;
  }
  const m = /^COPY public\.(\S+) \((.*)\) FROM stdin;/.exec(line);
  if (m) { current = { name: m[1], cols: m[2].split(', ') }; tables[m[1]] = []; }
}
for (const t of ['sites', 'memory_entries', 'daily_drafts', 'water_snapshots']) if (!tables[t]) throw new Error(`備份缺少 public.${t}`);

const site = tables.sites.find((s) => s.name === siteName);
if (!site) throw new Error(`找不到工地「${siteName}」；備份內有：${tables.sites.map((s) => s.name).join('、')}`);
const mine = (rows) => rows.filter((r) => r.site_id === site.id);

// --- 轉換 ---
const stores = Object.fromEntries(STORES.map((s) => [s, []]));
for (const row of mine(tables.memory_entries).filter((r) => !r.deleted_at)) stores[KIND_STORE[row.kind] ?? (() => { throw new Error(`未知記憶 kind：${row.kind}`); })()].push(JSON.parse(row.payload));
const memoryPayload = { schemaVersion: 1, stores };

const waterRow = mine(tables.water_snapshots)[0];
const waterPayload = waterRow ? JSON.parse(waterRow.payload) : null;

const isoDate = (d) => new Date(d).toISOString();
const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString().slice(0, 10);
const drafts = mine(tables.daily_drafts).filter((r) => !r.deleted_at).map((r) => ({
  row: r,
  payload: { ...JSON.parse(r.payload), id: 'current', createdAt: isoDate(r.created_at), updatedAt: isoDate(r.updated_at) },
}));

const header = ['entity', 'entity_id', 'report_date', 'revision', 'sequence', 'updated_at', 'payload'];
const entities = [];
const history = [];
const add = (rows, entity, entityId, reportDate, updatedAt, payload, sequence = '') => {
  const text = JSON.stringify(payload);
  if (text.length > CELL_LIMIT) throw new Error(`${entity} ${entityId} payload ${text.length} 字元，超過 ${CELL_LIMIT}`);
  rows.push([entity, entityId, reportDate, 1, sequence, updatedAt, text]);
};

let sequence = 0;
add(entities, 'memory', 'shared', '', new Date().toISOString(), memoryPayload, ++sequence);
if (waterPayload) add(entities, 'water-snapshot', 'shared', '', isoDate(waterRow.updated_at), waterPayload, ++sequence);
for (const d of drafts.sort((a, b) => a.row.report_date.localeCompare(b.row.report_date))) {
  if (d.row.report_date >= cutoff) add(entities, 'daily-draft', d.row.id, d.row.report_date, isoDate(d.row.updated_at), d.payload, ++sequence);
  else add(history, 'daily-draft', d.row.id, d.row.report_date, isoDate(d.row.updated_at), d.payload);
}

// --- 輸出 CSV ---
const csvCell = (v) => /[",\n\r]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
const toCsv = (rows) => [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'entities.csv'), toCsv(entities), 'utf8');
fs.writeFileSync(path.join(outDir, 'history.csv'), toCsv(history), 'utf8');

// --- 自我檢查：筆數與可解析 ---
const counts = Object.fromEntries(STORES.map((s) => [s, stores[s].length]));
const expectedLive = mine(tables.memory_entries).filter((r) => !r.deleted_at).length;
if (Object.values(counts).reduce((a, b) => a + b, 0) !== expectedLive) throw new Error('記憶筆數與備份未刪除列數不符');
if (entities.length + history.length !== 1 + (waterPayload ? 1 : 0) + drafts.length) throw new Error('輸出列數不符');
for (const r of [...entities, ...history]) JSON.parse(r[6]);

console.log(`工地：${site.name}`);
console.log('記憶：', counts);
console.log(`水位：${waterPayload ? `${waterPayload.points.length} 井位、${waterPayload.logs.length} 筆量測` : '無'}`);
console.log(`草稿：entities ${drafts.filter((d) => d.row.report_date >= cutoff).length} 份、history ${history.length} 份（截止日 ${cutoff}）`);
console.log(`輸出：${path.join(outDir, 'entities.csv')}（${entities.length} 列）、${path.join(outDir, 'history.csv')}（${history.length} 列）`);
