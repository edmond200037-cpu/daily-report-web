import { getSupabaseClient } from './supabase-client';
import type { SiteRole, SiteSummary } from '../../domain/shared';

export interface AccessibleSiteMembershipRow { role: SiteRole; sites: { id: string; name: string; join_code: string; created_at: string } | null; }
export interface JoinRequestSummary { id: string; siteId: string; siteName: string; userId: string; requestedAt: string; }
export interface SiteMemberSummary { siteId: string; userId: string; role: SiteRole; createdAt: string; }

export function mapAccessibleSiteMembershipRows(rows: AccessibleSiteMembershipRow[]): SiteSummary[] {
  return rows.flatMap((row) => row.sites ? [{ id: row.sites.id, name: row.sites.name, joinCode: row.sites.join_code, role: row.role, createdAt: row.sites.created_at }] : []);
}

export async function listAccessibleSites(userId: string): Promise<SiteSummary[]> {
  const { data, error } = await getSupabaseClient().from('site_members').select('role, sites!inner(id,name,join_code,created_at)').eq('user_id', userId).order('created_at', { referencedTable: 'sites' });
  if (error) throw error;
  return mapAccessibleSiteMembershipRows((data ?? []) as unknown as AccessibleSiteMembershipRow[]);
}

export async function createSharedSite(name: string): Promise<{ siteId: string; joinCode: string }> {
  const { data, error } = await getSupabaseClient().rpc('create_site', { p_name: name.trim() }).single();
  if (error) throw error;
  const result = data as { site_id: string; join_code: string };
  return { siteId: result.site_id, joinCode: result.join_code };
}

export async function requestSiteAccess(joinCode: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc('request_join', { p_join_code: joinCode.trim().toLowerCase() });
  if (error) throw error;
}

export async function listPendingJoinRequests(sites: SiteSummary[]): Promise<JoinRequestSummary[]> {
  const ownerSiteIds = sites.filter((site) => site.role === 'owner').map((site) => site.id);
  if (!ownerSiteIds.length) return [];
  const { data, error } = await getSupabaseClient().from('join_requests').select('id,site_id,user_id,requested_at,sites!inner(name)').in('site_id', ownerSiteIds).eq('status', 'pending').order('requested_at');
  if (error) throw error;
  return (data ?? []).map((row) => ({ id: String(row.id), siteId: String(row.site_id), siteName: String((row.sites as unknown as { name: string }).name), userId: String(row.user_id), requestedAt: String(row.requested_at) }));
}

export async function approveSiteMember(requestId: string, role: Exclude<SiteRole, 'owner'>): Promise<void> {
  const { error } = await getSupabaseClient().rpc('approve_site_member', { p_request_id: requestId, p_role: role });
  if (error) throw error;
}

export async function rejectSiteMember(requestId: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc('reject_site_join_request', { p_request_id: requestId });
  if (error) throw error;
}

export async function listSiteMembers(sites: SiteSummary[]): Promise<SiteMemberSummary[]> {
  const ownerSiteIds = sites.filter((site) => site.role === 'owner').map((site) => site.id);
  if (!ownerSiteIds.length) return [];
  const { data, error } = await getSupabaseClient().from('site_members').select('site_id,user_id,role,created_at').in('site_id', ownerSiteIds).order('created_at');
  if (error) throw error;
  return (data ?? []).map((row) => ({ siteId: String(row.site_id), userId: String(row.user_id), role: row.role as SiteRole, createdAt: String(row.created_at) }));
}

export async function updateSiteMemberRole(siteId: string, userId: string, role: SiteRole): Promise<void> {
  const { error } = await getSupabaseClient().rpc('update_site_member_role', { p_site_id: siteId, p_user_id: userId, p_role: role });
  if (error) throw error;
}

export async function removeSiteMember(siteId: string, userId: string): Promise<void> {
  const { error } = await getSupabaseClient().rpc('remove_site_member', { p_site_id: siteId, p_user_id: userId });
  if (error) throw error;
}
