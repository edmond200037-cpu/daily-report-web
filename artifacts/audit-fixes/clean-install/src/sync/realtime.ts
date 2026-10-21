import { getSupabaseClient } from '../data/remote/supabase-client';
import type { SharedScope } from '../domain/shared';

/** Notifications are hints only: callers must use pull_site_changes for data and RLS. */
export function subscribeToSiteChanges(scope: SharedScope, onChange: () => void): () => void {
  const channel = getSupabaseClient().channel(`site-changes:${scope.siteId}:${crypto.randomUUID()}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'site_changes', filter: `site_id=eq.${scope.siteId}` }, onChange).subscribe();
  return () => { void getSupabaseClient().removeChannel(channel); };
}
