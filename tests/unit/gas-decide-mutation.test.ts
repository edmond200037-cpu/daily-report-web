// @ts-expect-error Vitest 於 Node 執行，但 production tsconfig 未納入 Node 型別。
import { readFileSync } from 'node:fs';
// @ts-expect-error 同上。
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

// Code.gs 的純函式 decideMutation 不依賴 Apps Script 全域物件，可直接載入驗證。
const sandbox: Record<string, unknown> = {};
vm.runInNewContext(`${readFileSync('apps-script/Code.gs', 'utf8')}\nthis.decideMutation = decideMutation;`, sandbox);
const decide = sandbox.decideMutation as (rev: number, m: unknown, seen?: { revision: number }) => { status: string; revision?: number; reason?: string };
const mutation = (over: Record<string, unknown> = {}) => ({ entity: 'daily-draft', base_revision: 3, payload: { date: '2026-10-21' }, ...over });

describe('Apps Script decideMutation', () => {
  it('套用：base_revision 等於目前版本時 revision + 1', () => expect(decide(3, mutation())).toEqual({ status: 'applied', revision: 4 }));
  it('衝突：base_revision 落後時不寫入', () => expect(decide(5, mutation())).toEqual({ status: 'conflict', revision: 5 }));
  it('新實體：目前版本 0 且 base_revision 0 可套用', () => expect(decide(0, mutation({ base_revision: 0 }))).toEqual({ status: 'applied', revision: 1 }));
  it('重複：相同 mutation_id 回傳先前版本，即使 base_revision 已過期', () => expect(decide(9, mutation(), { revision: 4 })).toEqual({ status: 'duplicate', revision: 4 }));
  it('拒絕：未知 entity', () => expect(decide(0, mutation({ entity: 'x' })).status).toBe('rejected'));
  it('拒絕：payload 超過 45,000 字元', () => expect(decide(3, mutation({ payload: { t: 'a'.repeat(45_000) } })).reason).toBe('too-large'));
});
