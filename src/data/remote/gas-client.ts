// 共用後端：Google Apps Script 網頁應用程式。協定見 apps-script/Code.gs 與 docs/plans/gas-sheets-backend-migration.md。
const STORAGE_KEY = 'gas-backend-config';

export interface GasConfig { url: string; key: string; }

export function loadGasConfig(): GasConfig | null {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<GasConfig> | null;
    return value?.url && value.key ? { url: value.url, key: value.key } : null;
  } catch { return null; }
}

export function saveGasConfig(url: string, key: string): void {
  const parsed = new URL(url.trim());
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'script.google.com') throw new Error('網址必須是 https://script.google.com/macros/s/…/exec');
  if (!key.trim()) throw new Error('請輸入金鑰。');
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ url: parsed.toString(), key: key.trim() }));
}

export function clearGasConfig(): void { localStorage.removeItem(STORAGE_KEY); }

export async function gasCall<T>(body: Record<string, unknown>): Promise<T> {
  const config = loadGasConfig();
  if (!config) throw new Error('尚未設定共用後端。');
  // text/plain 是簡單請求，不觸發 CORS 預檢；Apps Script 不處理 OPTIONS。
  const response = await fetch(config.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ key: config.key, ...body }) });
  if (!response.ok) throw new Error(`共用後端回應 ${response.status}`);
  const data = await response.json() as T & { error?: string };
  if (data.error) throw new Error(data.error === 'unauthorized' ? '金鑰錯誤。' : `共用後端錯誤：${data.error}`);
  return data;
}
