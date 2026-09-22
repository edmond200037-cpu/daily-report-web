import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { runtimeConfig } from '../../config/runtime-config';

let singleton: SupabaseClient | undefined;

export function sharedBackendEnabled(): boolean { return runtimeConfig.mode === 'shared'; }

export function getSupabaseClient(): SupabaseClient {
  if (runtimeConfig.mode !== 'shared' || !runtimeConfig.supabaseUrl || !runtimeConfig.supabasePublishableKey) {
    throw new Error('目前是本機模式，尚未設定共享後端。');
  }
  singleton ??= createClient(runtimeConfig.supabaseUrl, runtimeConfig.supabasePublishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce' },
  });
  return singleton;
}
