// @ts-expect-error Vitest 於 Node 執行，但 production tsconfig 未納入 Node 型別。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mapAccessibleSiteMembershipRows } from '../../src/data/remote/site-repository';

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
