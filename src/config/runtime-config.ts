export type BackendMode = 'local' | 'shared';

export interface RuntimeConfig {
  mode: BackendMode;
  supabaseUrl?: string;
  supabasePublishableKey?: string;
}

type RuntimeEnvironment = Record<string, string | boolean | undefined>;

export function resolveRuntimeConfig(environment: RuntimeEnvironment): RuntimeConfig {
  const url = String(environment.VITE_SUPABASE_URL ?? '').trim();
  const key = String(environment.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim();
  if (!url && !key) return { mode: 'local' };
  if (!url || !key) throw new Error('共享模式設定不完整：需要 Supabase URL 與 publishable key。');
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error('VITE_SUPABASE_URL 不是有效網址。'); }
  if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
    throw new Error('Supabase URL 必須使用 HTTPS；本機開發服務除外。');
  }
  return { mode: 'shared', supabaseUrl: parsed.toString().replace(/\/$/, ''), supabasePublishableKey: key };
}

export const runtimeConfig = resolveRuntimeConfig(import.meta.env);

