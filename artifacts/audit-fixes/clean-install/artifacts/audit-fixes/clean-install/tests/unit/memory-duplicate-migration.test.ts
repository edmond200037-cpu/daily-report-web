// @ts-expect-error Vitest 於 Node 執行，但 production tsconfig 未納入 Node 型別。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('記憶自然鍵重複 migration', () => {
  it('將唯一鍵競態轉成 duplicate 結果並重載 PostgREST schema', () => {
    const sql = readFileSync('supabase/migrations/202609280001_memory_entry_duplicate_adoption.sql', 'utf8');
    expect(sql).toContain('exception when unique_violation');
    expect(sql).toContain("'status','duplicate','entity_id',v_current.id");
    expect(sql).toContain('parent_id is not distinct from v_parent');
    expect(sql).toContain("notify pgrst, 'reload schema'");
    expect(sql).toContain('public.can_edit_site(p_site_id)');
  });
});
