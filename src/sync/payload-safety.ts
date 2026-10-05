/** Reject malformed identifiers before they reach IndexedDB or HTML consumers.
 * Legacy opaque IDs remain supported; quote/markup/path characters never are.
 */
export function assertSafePayload(value: unknown, depth = 0): void {
  if (depth === 0 && new TextEncoder().encode(JSON.stringify(value)).byteLength > 1048576) throw new Error('同步資料過大。');
  if (depth > 24) throw new Error('同步資料巢狀層數過多。');
  if (Array.isArray(value)) { if (value.length > 10000) throw new Error('同步資料過大。'); for (const row of value) assertSafePayload(row, depth + 1); return; }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('同步資料包含非法欄位。');
    if ((key === 'id' || key.endsWith('Id')) && child !== null && child !== '') {
      if (typeof child !== 'string' || !/^[a-zA-Z0-9_:.-]{1,128}$/.test(child)) throw new Error('同步資料包含非法識別碼。');
    }
    assertSafePayload(child, depth + 1);
  }
}

const textFields = new Set(['date', 'siteNameSnapshot', 'activeTab', 'tradeNameSnapshot', 'vendorNameSnapshot', 'workerCount', 'taskTextSnapshot', 'locationTextSnapshot', 'startFloorRaw', 'endFloorRaw', 'materialTypeSnapshot', 'itemName', 'supplierNameSnapshot', 'quantity', 'unit', 'specification', 'note', 'content', 'name', 'normalizedName', 'pointNameSnapshot', 'measuredAt', 'text', 'normalizedValue']);
const arrays = new Set(['tradeSections', 'workItems', 'materialEntries', 'standaloneMaterialEntries', 'supplies', 'contacts', 'items', 'specialItems', 'points', 'logs', 'readings', 'vendors', 'templates']);

/** Validate values actually consumed by renderers, while retaining legacy fields. */
export function assertRenderablePayload(value: unknown): void {
  assertSafePayload(value);
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) { for (const row of node) { if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('同步集合包含非法項目。'); walk(row); } return; }
    if (!node || typeof node !== 'object') return;
    for (const [key, child] of Object.entries(node)) {
      if (textFields.has(key) && typeof child !== 'string') throw new Error(`同步欄位 ${key} 必須是文字。`);
      if (arrays.has(key) && !Array.isArray(child)) throw new Error(`同步欄位 ${key} 必須是集合。`);
      if (key === 'sortOrder' && (typeof child !== 'number' || !Number.isFinite(child))) throw new Error('同步排序必須是數字。');
      if (key === 'activeTab' && !['engineering', 'supplies', 'contacts', 'special'].includes(String(child))) throw new Error('非法日報分頁。');
      if (key === 'status' && !['draft', 'complete', 'candidate', 'confirmed'].includes(String(child))) throw new Error('非法資料狀態。');
      if (key === 'entryType' && !['normal', 'independent'].includes(String(child))) throw new Error('非法進料類型。');
      if (key === 'value' || key === 'battery') {
        // Material memories use textual `value`; reading/battery inputs are numeric.
        if ((key === 'battery' || 'pointId' in node) && (typeof child !== 'string' && typeof child !== 'number' || child !== '' && (!Number.isFinite(Number(child)) || key === 'value' && Number(child) <= 0))) throw new Error('非法水位數字。');
      }
      walk(child);
    }
  };
  walk(value);
}
