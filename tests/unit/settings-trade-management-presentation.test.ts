// @ts-expect-error Vitest 於 Node 執行，但 production tsconfig 未納入 Node 型別。
import { readFileSync } from 'node:fs';
import { appSource } from './helpers/app-source';
import { describe, expect, it } from 'vitest';
const main = appSource(); const css = readFileSync(new URL('../../src/styles.css', import.meta.url), 'utf8');
describe('工種、工項與廠商管理手機版面', () => {
  it('工種列為整列展開按鈕，顯示工項與廠商數與 aria-expanded', () => { expect(main).toContain('class="settings-row trade-toggle" aria-expanded='); expect(main).toContain('工項 · '); expect(main).toContain('廠商`'); });
  it('展開面板含工項與廠商子清單，廠商併入工種頁，並以文字按鈕編輯工種名稱', () => { expect(main).toContain("subGroup('tasks', '工項', tasks)"); expect(main).toContain("subGroup('vendors', '廠商', vendors)"); expect(main).toContain('settingsAllVendors'); expect(main).toContain('編輯工種名稱'); expect(main).toContain('data-settings-action="delete-trade"'); });
  it('列上不放編輯／刪除按鈕，刪除只在行內表單；已移除設定頁左右滑動', () => { expect(main).not.toContain('trade-task-row'); expect(main).not.toContain('settings-trade-swipe'); expect(main).not.toContain('settingsTradeSwipe'); expect(css).not.toContain('settings-trade-swipe'); });
  it('觸控目標至少 44px', () => { expect(css).toMatch(/.settings-page .settings-text-action {[^}]*min-height: 44px/); expect(css).toMatch(/.trade-subgroup__bar {[^}]*min-height: 44px/); });
});
