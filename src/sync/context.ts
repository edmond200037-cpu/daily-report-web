import { getSupabaseClient, sharedBackendEnabled } from '../data/remote/supabase-client';
import { loadSharedContext } from '../data/local/shared-context';
import type { SharedScope } from '../domain/shared';

export async function loadActiveSharedScope(): Promise<SharedScope | null> {
  if (!sharedBackendEnabled()) return null;
  const { data, error } = await getSupabaseClient().auth.getSession();
  if (error) throw error;
  const userId = data.session?.user.id;
  if (!userId) return null;
  const context = await loadSharedContext(userId);
  return context.activeSiteId ? { userId, siteId: context.activeSiteId } : null;
}

