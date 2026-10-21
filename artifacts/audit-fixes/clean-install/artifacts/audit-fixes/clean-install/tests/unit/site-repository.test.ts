// @ts-expect-error Vitest 於 Node 執行，但 production tsconfig 未納入 Node 型別。
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { listAccessibleSites, listSiteMembers, mapAccessibleSiteMembershipRows } from '../../src/data/remote/site-repository';
import { getSupabaseClient } from '../../src/data/remote/supabase-client';

vi.mock('../../src/data/remote/supabase-client', () => ({ getSupabaseClient: vi.fn() }));

const repository = readFileSync(new URL('../../src/data/remote/site-repository.ts', import.meta.url), 'utf8');

describe('工地清單加入碼查詢', () => {
  it('讀取 sites.join_code 並映射為領域 joinCode', () => {
    expect(repository).toContain("sites!inner(id,name,join_code,created_at)");
    expect(mapAccessibleSiteMembershipRows([{ role: 'viewer', sites: { id: 'site-1', name: '測試工地', join_code: 'a1b2c3d4e5f6', created_at: '2026-09-21T00:00:00Z' } }])).toEqual([
      { id: 'site-1', name: '測試工地', joinCode: 'a1b2c3d4e5f6', role: 'viewer', createdAt: '2026-09-21T00:00:00Z' },
    ]);
  });

  it('不會為沒有工地關聯的資料列產生可複製操作', () => {
    expect(mapAccessibleSiteMembershipRows([{ role: 'editor', sites: null }])).toEqual([]);
  });
});

describe('我的工地與成員管理的查詢邊界', () => {
  it('同工地增加、調整及移除其他成員，不改變自己的工地項次與角色', async () => {
    const site = { id: 'site-1', name: '測試工地', join_code: 'a1b2c3d4e5f6', created_at: '2026-09-21T00:00:00Z' };
    const rows = [
      { site_id: site.id, user_id: 'owner-1', role: 'owner', created_at: site.created_at, sites: site },
    ];
    const queries: { filters: [string, unknown][] }[] = [];
    vi.mocked(getSupabaseClient).mockReturnValue({
      from: vi.fn((table: string) => {
        expect(table).toBe('site_members');
        const filters: [string, unknown][] = [];
        queries.push({ filters });
        const query = {
          select: () => query,
          eq: (column: string, value: unknown) => { filters.push([column, value]); return query; },
          in: (column: string, value: unknown[]) => { filters.push([column, value]); return query; },
          order: async () => ({ data: rows.filter((row) => filters.every(([column, value]) => {
            const actual = row[column as keyof typeof row];
            return Array.isArray(value) ? value.includes(actual) : actual === value;
          })), error: null }),
        };
        return query;
      }),
    } as unknown as ReturnType<typeof getSupabaseClient>);

    const original = await listAccessibleSites('owner-1');
    expect(original).toHaveLength(1);
    rows.push(
      { ...rows[0], user_id: 'editor-1', role: 'editor' },
      { ...rows[0], user_id: 'viewer-1', role: 'viewer' },
    );
    for (const row of rows) {
      const sites = await listAccessibleSites(row.user_id);
      expect(sites).toHaveLength(1);
      expect(sites[0].role).toBe(row.role);
      expect(queries.at(-1)?.filters).toEqual([['user_id', row.user_id]]);
    }
    expect(await listAccessibleSites('outsider')).toEqual([]);
    expect((await listSiteMembers(original)).map((member) => member.userId)).toEqual(['owner-1', 'editor-1', 'viewer-1']);
    expect(queries.at(-1)?.filters).toEqual([['site_id', ['site-1']]]);
    rows[1].role = 'viewer';
    expect(await listAccessibleSites('owner-1')).toEqual(original);
    rows.splice(1, 1);
    expect(await listAccessibleSites('owner-1')).toEqual(original);
    expect(await listAccessibleSites('editor-1')).toEqual([]);
  });

  it('重新整理帳號以目前登入使用者查詢工地', () => {
    const main = readFileSync(new URL('../../src/main.ts', import.meta.url), 'utf8');
    expect(main).toContain('listAccessibleSites(auth.user.id)');
  });
});
