import { get, put } from '../db.js';

export interface SharedContext {
  id: string;
  userId: string;
  activeSiteId: string | null;
  updatedAt: string;
}

const contextId = (userId: string): string => `active:${userId}`;

export async function loadSharedContext(userId: string): Promise<SharedContext> {
  return (await get('shared_context', contextId(userId)) as SharedContext | undefined) ?? {
    id: contextId(userId), userId, activeSiteId: null, updatedAt: new Date().toISOString(),
  };
}

export async function selectActiveSharedSite(userId: string, siteId: string | null): Promise<SharedContext> {
  const context: SharedContext = { id: contextId(userId), userId, activeSiteId: siteId, updatedAt: new Date().toISOString() };
  await put('shared_context', context);
  return context;
}

