export type SiteRole = 'owner' | 'editor' | 'viewer';
export type SyncState = 'local-only' | 'saved-local' | 'pending' | 'syncing' | 'synced' | 'conflict' | 'forbidden' | 'error';

export interface SiteSummary {
  id: string;
  name: string;
  joinCode: string;
  role: SiteRole;
  createdAt: string;
}

export interface SharedScope {
  userId: string;
  siteId: string;
}

export const sharedScopeKey = (scope: SharedScope): string => `${scope.userId}:${scope.siteId}`;

export function canReadSite(role: SiteRole | null | undefined): boolean { return Boolean(role); }
export function canEditSite(role: SiteRole | null | undefined): boolean { return role === 'owner' || role === 'editor'; }
export function canManageSite(role: SiteRole | null | undefined): boolean { return role === 'owner'; }

