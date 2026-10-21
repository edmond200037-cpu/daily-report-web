import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { put, list } from '../../src/data/db.js';
import { createDailyDraft } from '../../src/domain/daily';
import { buildSyncOperation } from '../../src/sync/outbox';
import { runSyncOnce } from '../../src/sync/engine';

const state = vi.hoisted(() => ({ result: {} as any, changes: [] as any[], pulls: 0, reads: 0, remote: {} as any }));
const scope = { userId: 'user', siteId: 'site' };
vi.mock('../../src/sync/context', () => ({ loadActiveSharedScope: async () => ({ userId: 'user', siteId: 'site' }) }));
vi.mock('../../src/data/remote/supabase-client', () => ({ getSupabaseClient: () => ({
  rpc: async (name: string) => ({ data: name === 'pull_site_changes' ? (state.pulls++ === 0 ? state.changes : []) : state.result, error: null }),
  from: () => {
    const chain: any = { select: () => chain, eq: () => chain, order: () => chain,
      range: async () => ({ data: [], error: null }),
      single: async () => { state.reads++; return { data: state.remote, error: null }; },
      then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve) };
    return chain;
  },
}) }));
beforeEach(() => { vi.stubGlobal('indexedDB', new IDBFactory()); state.result = {}; state.changes = []; state.pulls = 0; state.reads = 0; state.remote = {}; });
afterEach(() => vi.unstubAllGlobals());

describe('audit synchronization data preservation', () => {
  it('legacy duplicate conflict response retains original intent and conflict', async () => {
    const draft = createDailyDraft(null, '', '2026-10-04');
    const operation = buildSyncOperation({ ...scope, entity: 'daily-draft', entityId: 'cloud', baseRevision: 0, payload: draft });
    await put('sync_outbox', operation);
    state.result = { status: 'duplicate', entity_id: 'cloud', revision: 2, remote_payload: draft };
    expect((await runSyncOnce(scope)).conflicts).toBe(1);
    expect(await list('sync_outbox')).toEqual([expect.objectContaining({ id: operation.id, status: 'conflict', payload: draft })]);
    expect(await list('sync_conflicts')).toHaveLength(1);
  });
  it('accepting a resolution permanently backs up its original source', async () => {
    const source = buildSyncOperation({ ...scope, entity: 'daily-draft', entityId: 'cloud', baseRevision: 0, payload: { date: '2026-10-04', original: '保留' } });
    source.status = 'conflict'; await put('sync_outbox', source);
    const resolution = buildSyncOperation({ ...scope, entity: 'daily-patch', entityId: 'cloud', baseRevision: 1, payload: { reportDate: '2026-10-04', changes: [] } });
    resolution.resolvesConflictIds = [source.id]; await put('sync_outbox', resolution);
    state.result = { status: 'applied', entity_id: 'cloud', revision: 2 };
    expect((await runSyncOnce(scope)).applied).toBe(1);
    expect(await list('sync_outbox')).toEqual([]);
    expect(await list('sync_recovery_backups')).toEqual([expect.objectContaining({ sourceOperation: source, resolution: expect.objectContaining({ id: resolution.id }) })]);
  });
  it('repeated change events fetch one document and preserve the final cursor', async () => {
    const draft = createDailyDraft(null, '', '2026-10-04');
    state.remote = { id: 'cloud', report_date: draft.date, revision: 3, payload: draft };
    state.changes = [1, 2, 3].map(sequence => ({ sequence, entity: 'daily-draft', entity_id: 'cloud', operation: 'upsert', revision: sequence, changed_at: new Date().toISOString() }));
    expect((await runSyncOnce(scope)).dailyPulled).toBe(1);
    expect(state.reads).toBe(1);
    expect(await list('sync_cursors')).toEqual([expect.objectContaining({ cursor: 3 })]);
  });
  it('malformed responses fail without discarding the operation', async () => {
    await put('sync_outbox', buildSyncOperation({ ...scope, entity: 'daily-patch', entityId: 'cloud', baseRevision: 0, payload: { reportDate: '2026-10-04', changes: [] } }));
    state.result = { status: 'applied' };
    expect((await runSyncOnce(scope)).failed).toBe(1);
    expect(await list('sync_outbox')).toEqual([expect.objectContaining({ status: 'blocked' })]);
  });
});
