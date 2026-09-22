import type { Session, User } from '@supabase/supabase-js';
import { getSupabaseClient, sharedBackendEnabled } from '../data/remote/supabase-client';

export interface AuthSnapshot { enabled: boolean; session: Session | null; user: User | null; }

export function oauthRedirectUrl(currentHref: string): string {
  const url = new URL(currentHref);
  url.hash = '';
  url.search = '';
  url.searchParams.set('auth_callback', '1');
  return url.toString();
}

export async function completeOAuthRedirect(): Promise<boolean> {
  if (!sharedBackendEnabled()) return false;
  const url = new URL(location.href);
  if (url.searchParams.get('auth_callback') !== '1' && !url.searchParams.has('code')) return false;
  const providerError = url.searchParams.get('error_description') ?? url.searchParams.get('error');
  if (providerError) throw new Error(providerError);
  const code = url.searchParams.get('code');
  if (!code) throw new Error('Google 登入回傳缺少授權碼，請重新登入。');
  const { error } = await getSupabaseClient().auth.exchangeCodeForSession(code);
  if (error) throw error;
  for (const key of ['auth_callback', 'code', 'sb_flow_id', 'error', 'error_code', 'error_description']) url.searchParams.delete(key);
  url.hash = '#account';
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  return true;
}

export async function loadAuthSnapshot(): Promise<AuthSnapshot> {
  if (!sharedBackendEnabled()) return { enabled: false, session: null, user: null };
  const { data, error } = await getSupabaseClient().auth.getSession();
  if (error) throw error;
  return { enabled: true, session: data.session, user: data.session?.user ?? null };
}

export async function signInWithGoogle(): Promise<void> {
  const redirectTo = oauthRedirectUrl(location.href);
  const { error } = await getSupabaseClient().auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const { error } = await getSupabaseClient().auth.signOut();
  if (error) throw error;
}
