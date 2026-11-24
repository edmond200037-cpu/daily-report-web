import type { AuthSnapshot } from '../auth/auth-service';
import type { SiteSummary } from '../domain/shared';
import type { JoinRequestSummary, SiteMemberSummary } from '../data/remote/site-repository';
import type { SyncOperation } from '../sync/types';
import type { ConflictReview } from '../sync/conflict-review';
import type { MemoryImportPreview } from '../sync/memory-import';
import type { SyncRecoveryPreview } from '../sync/recovery';

export interface AccountPageState {
  view?: 'account' | 'debug';
  syncing?: boolean;
  auth: AuthSnapshot;
  sites: SiteSummary[];
  activeSiteId: string | null;
  pendingCount: number;
  requests: JoinRequestSummary[];
  members: SiteMemberSummary[];
  feedback: string;
  error: string;
  diagnostics?: SyncOperation[];
  operations?: SyncOperation[];
  operationsStatus?: 'loading' | 'ready' | 'error';
  conflicts?: ConflictReview[];
  importPreview?: MemoryImportPreview | null;
  recoveryPreview?: SyncRecoveryPreview | null;
}
