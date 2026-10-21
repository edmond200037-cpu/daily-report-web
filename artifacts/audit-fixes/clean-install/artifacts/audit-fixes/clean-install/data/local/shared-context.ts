import { get, put } from '../db.js';
import type { SiteRole } from '../../domain/shared';

export interface SharedContext {
  id: string;
  userId: string;
  activeSiteId: string | null;
  activeSiteRole?: SiteRole | null;
  updatedAt: string;
}

const contextId = (userId: string): string => `active:${userId}`;

export async function loadSharedContext(userId: string): Promise<SharedContext> {
  return (await get('shared_context', contextId(userId)) as SharedContext | undefined) ?? {
    id: contextId(userId), userId, activeSiteId: null, updatedAt: new Date().toISOString(),
  };
}

export async function selectActiveSharedSite(userId: string, siteId: string | null, role?: SiteRole | null): Promise<SharedContext> {
  const context: SharedContext = { id: contextId(userId), userId, activeSiteId: siteId, activeSiteRole: role ?? null, updatedAt: new Date().toISOString() };
  await put('shared_context', context);
  return context;
}

export async function cacheActiveSiteRole(userId: string, role: SiteRole | null): Promise<void> {
  const context = await loadSharedContext(userId);
  await put('shared_context', { ...context, activeSiteRole: role, updatedAt: new Date().toISOString() });
}

