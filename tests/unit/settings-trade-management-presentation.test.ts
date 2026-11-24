import { describe, expect, it } from 'vitest';
import { settingsMarkup, appState, settingsState } from './helpers/react-settings';
import { MasterSettings } from '../../src/app/react-settings';
const render = (edit = false) => settingsMarkup(MasterSettings, () => {
  settingsState.activeSection = 'trade-tasks'; settingsState.selectedTradeTypeId = 't';
  appState.settingsTrades = [{ id: 't', name: '鋼筋' }] as never;
  appState.settingsAllTasks = [{ id: 'task', name: '綁紮', tradeTypeId: 't' }] as never;
  appState.settingsAllVendors = [{ id: 'vendor', name: '甲公司', tradeTypeId: 't' }] as never;
  if (edit) { settingsState.editingKind = 'trade'; settingsState.editingId = 't'; }
});
describe('React 工種工項廠商管理', () => {
  it('工種列保留展開與數量', () => { const html = render(); expect(html).toContain('aria-expanded="true"'); expect(html).toContain('1 工項 · 1 廠商'); });
  it('工項與廠商同工種管理', () => { const html = render(); for (const text of ['綁紮', '甲公司', '新增工項', '新增廠商', '編輯工種名稱']) expect(html).toContain(text); });
  it('刪除工種位於編輯表單', () => { const html = render(true); expect(html).toContain('data-settings-form="edit"'); expect(html).toContain('data-settings-action="delete-trade"'); });
  it('所有主要操作使用大型控制', () => { expect(render()).toContain('data-size="lg"'); expect(render()).not.toContain('settings-trade-swipe'); });
});
