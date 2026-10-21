// 施工日報共用後端：Google 試算表 + Apps Script 網頁應用程式。
// 規格見 docs/plans/gas-sheets-backend-migration.md 第 4–5 節。
// 部署前：在「專案設定 → 指令碼屬性」新增 KEY（共用金鑰），再執行一次 setup() 與 installTrigger()。

const ENTITIES = ['memory', 'daily-draft', 'water-snapshot'];
const COLUMNS = ['entity', 'entity_id', 'report_date', 'revision', 'sequence', 'updated_at', 'payload'];
const MUTATION_COLUMNS = ['mutation_id', 'entity_id', 'status', 'revision', 'created_at'];
const CELL_LIMIT = 45000; // 試算表一格上限 50,000 字元
const KEEP_DAYS = 3;
const MUTATION_KEEP_DAYS = 7;
const TZ = 'Asia/Taipei';

// 純函式：決定一筆 mutation 的結果（Code.gs 以外只有測試用）。
function decideMutation(currentRevision, mutation, seen) {
  if (ENTITIES.indexOf(mutation.entity) < 0) return { status: 'rejected', reason: 'entity' };
  if (seen) return { status: 'duplicate', revision: seen.revision };
  if (JSON.stringify(mutation.payload).length > CELL_LIMIT) return { status: 'rejected', reason: 'too-large' };
  if (Number(mutation.base_revision) !== currentRevision) return { status: 'conflict', revision: currentRevision };
  return { status: 'applied', revision: currentRevision + 1 };
}

function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return reply({ error: 'bad-request' }); }
  if (body.key !== PropertiesService.getScriptProperties().getProperty('KEY')) return reply({ error: 'unauthorized' });
  if (body.action === 'pull') return reply({ rows: rowsAfter(sheet('entities'), Number(body.cursor) || 0) });
  if (body.action === 'push') return reply(push(body));
  return reply({ error: 'unknown-action' });
}

function push(body) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const entities = sheet('entities');
    const mutations = sheet('mutations');
    const current = readTable(entities); // entity:entity_id -> { index, row }
    const seen = {};
    readTable(mutations, 'mutation_id').forEach(function (r) { seen[r.row[0]] = { revision: Number(r.row[3]) }; });
    const props = PropertiesService.getScriptProperties();
    let sequence = Math.max(Number(props.getProperty('SEQ')) || 0, maxSequence(entities));
    const results = [];
    (body.mutations || []).forEach(function (m) {
      const existing = current.byKey[m.entity + ':' + m.entity_id];
      const decision = decideMutation(existing ? Number(existing.row[3]) : 0, m, seen[m.mutation_id]);
      const result = { mutation_id: m.mutation_id, status: decision.status, revision: decision.revision };
      if (decision.status === 'conflict') result.remote_payload = JSON.parse(existing.row[6]);
      if (decision.status === 'rejected') result.reason = decision.reason;
      if (decision.status === 'applied') {
        const now = new Date().toISOString();
        const date = m.entity === 'daily-draft' ? String(m.payload.date || '') : '';
        const row = [m.entity, m.entity_id, date, decision.revision, ++sequence, now, JSON.stringify(m.payload)];
        const index = existing ? existing.index : entities.getLastRow() + 1;
        writeRow(entities, index, row);
        writeRow(mutations, mutations.getLastRow() + 1, [m.mutation_id, m.entity_id, 'applied', decision.revision, now]);
        current.byKey[m.entity + ':' + m.entity_id] = { index: index, row: row };
        seen[m.mutation_id] = { revision: decision.revision };
      }
      results.push(result);
    });
    props.setProperty('SEQ', String(sequence));
    return { results: results, rows: rowsAfter(entities, Number(body.cursor) || 0) };
  } finally { lock.releaseLock(); }
}

// 每日觸發：草稿超過 KEEP_DAYS 天搬到 history；mutations 超過 MUTATION_KEEP_DAYS 天刪除。
function dailyCleanup() {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const cutoff = Utilities.formatDate(new Date(Date.now() - KEEP_DAYS * 86400000), TZ, 'yyyy-MM-dd');
    const entities = sheet('entities');
    const history = sheet('history');
    const rows = entities.getDataRange().getValues();
    for (let i = rows.length - 1; i >= 1; i--) { // 由下往上刪，列號才不會位移
      if (rows[i][0] === 'daily-draft' && text(rows[i][2], 'date') < cutoff) { writeRow(history, history.getLastRow() + 1, [rows[i][0], text(rows[i][1], 'date'), text(rows[i][2], 'date'), rows[i][3], rows[i][4], text(rows[i][5]), rows[i][6]]); entities.deleteRow(i + 1); }
    }
    const mutations = sheet('mutations');
    const old = new Date(Date.now() - MUTATION_KEEP_DAYS * 86400000).toISOString();
    const mrows = mutations.getDataRange().getValues();
    for (let i = mrows.length - 1; i >= 1; i--) if (text(mrows[i][4]) < old) mutations.deleteRow(i + 1);
  } finally { lock.releaseLock(); }
}

function setup() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  [['entities', COLUMNS], ['mutations', MUTATION_COLUMNS], ['history', COLUMNS]].forEach(function (s) {
    const sh = book.getSheetByName(s[0]) || book.insertSheet(s[0]);
    sh.getRange(1, 1, 1, s[1].length).setValues([s[1]]);
    sh.getRange(2, 1, sh.getMaxRows() - 1, s[1].length).setNumberFormat('@'); // 純文字，避免日期被自動轉型
  });
}

function installTrigger() {
  ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'dailyCleanup'; }).forEach(ScriptApp.deleteTrigger);
  ScriptApp.newTrigger('dailyCleanup').timeBased().everyDays(1).atHour(3).create();
}

// --- 小工具 ---
function reply(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function sheet(name) { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name); }

// 先設成純文字再寫入：否則 '2026-10-21' 會被試算表自動轉成日期，之後比對 ID 會對不上。
function writeRow(sh, index, row) {
  const range = sh.getRange(index, 1, 1, row.length);
  range.setNumberFormat('@');
  range.setValues([row]);
}

// 儲存格若被轉成 Date（匯入 CSV 或手動編輯時），還原成字串。
function text(v, kind) {
  if (!(v instanceof Date)) return String(v);
  return kind === 'date' ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd') : v.toISOString();
}

function readTable(sh, keyColumn) {
  const values = sh.getDataRange().getValues();
  const list = [];
  const byKey = {};
  for (let i = 1; i < values.length; i++) {
    const item = { index: i + 1, row: values[i] };
    list.push(item);
    byKey[values[i][0] + ':' + text(values[i][1], 'date')] = item;
  }
  return Object.assign(list, { byKey: byKey });
}

function maxSequence(sh) {
  return sh.getDataRange().getValues().slice(1).reduce(function (m, r) { return Math.max(m, Number(r[4]) || 0); }, 0);
}

function rowsAfter(sh, cursor) {
  return sh.getDataRange().getValues().slice(1)
    .filter(function (r) { return Number(r[4]) > cursor; })
    .sort(function (a, b) { return a[4] - b[4]; })
    .map(function (r) {
      return { entity: r[0], entity_id: text(r[1], 'date'), report_date: text(r[2], 'date'), revision: Number(r[3]), sequence: Number(r[4]), updated_at: text(r[5]), payload: JSON.parse(r[6]) };
    });
}
