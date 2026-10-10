// @ts-expect-error Vitest 於 Node 執行，但 production tsconfig 未納入 Node 型別。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const main = readFileSync(new URL('../../src/main.ts', import.meta.url), 'utf8'); const css = readFileSync(new URL('../../src/styles.css', import.meta.url), 'utf8');
describe('工種及工項管理手機版面', () => {
  it('工種列為整列展開按鈕並顯示工項數與 aria-expanded', () => { expect(main).toContain('class="trade-toggle" aria-expanded='); expect(main).toContain('trade-toggle__meta'); });
  it('工種編輯與刪除有可見按鈕，不只依賴滑動', () => { expect(main).toContain('data-settings-action="edit-trade"'); expect(main).toContain('data-settings-action="delete-trade"'); });
  it('工項以列表列呈現，觸控目標至少 44px', () => { expect(main).toContain('trade-task-row'); expect(css).toMatch(/\.trade-task-actions button[^{]*\{ min-height: 44px/); expect(css).toMatch(/\.trade-toggle \{[^}]*min-height: 48px/); });
});
