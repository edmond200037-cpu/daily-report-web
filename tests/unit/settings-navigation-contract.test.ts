import { describe, expect, it } from 'vitest';
import { settingsMarkup, appState, settingsState } from './helpers/react-settings';
import { SettingsHome, MasterSettings, MemoryReview, BackupSettings } from '../../src/app/react-settings';

describe('React 設定導覽契約', () => {
  it('首頁以 List 提供主檔分組', () => { const html = settingsMarkup(SettingsHome); expect(html).toContain('astryx-list'); expect(html).not.toContain('astryx-card'); expect(html).toContain('主檔'); });
  it('首頁提供本機狀態及共編入口', () => { const html = settingsMarkup(SettingsHome); expect(html).toContain('本機模式'); expect(html).toContain('href="#settings/account"'); });
  it('每個主檔有獨立路由', () => { const html = settingsMarkup(SettingsHome); for (const key of ['sites', 'trade-tasks', 'locations', 'materials', 'templates']) expect(html).toContain('href="#settings/daily/' + key + '"'); });
  it('保留日報來源返回', () => { expect(settingsMarkup(SettingsHome)).toContain('href="#daily"'); });
  it('保留水位來源返回', () => { const html = settingsMarkup(SettingsHome, () => { appState.settingsReturnModule = 'water-level'; }); expect(html).toContain('返回水位'); expect(html).toContain('href="#water-level"'); });
  it('材料類型以頁內表單新增', () => { const html = settingsMarkup(MasterSettings, () => { settingsState.activeSection = 'materials'; settingsState.adding = true; }); expect(html).toContain('新增材料類型'); expect(html).toContain('data-settings-form="add"'); });
  it('材料詳情保留四種欄位', () => { const html = settingsMarkup(MasterSettings, () => { settingsState.activeSection = 'materials'; settingsState.expandedMaterialTypeId = 'm'; appState.materialTypes = [{ id: 'm', name: '鋼筋' }] as never; }); for (const text of ['品名', '規格', '供應商', '單位', '重新命名類型', '刪除類型']) expect(html).toContain(text); });
  it('位置可帶樓層', () => { const html = settingsMarkup(MasterSettings, () => { settingsState.activeSection = 'locations'; settingsState.adding = true; }); for (const text of ['起始樓層', '結束樓層', '位置']) expect(html).toContain(text); });
  it('備份使用檔案選擇與下載', () => { const html = settingsMarkup(BackupSettings); expect(html).toContain('下載記憶備份'); expect(html).toContain('type="file"'); expect(html).toContain('data-memory-backup-import="true"'); });
  it('水位井位由設定直達', () => { expect(settingsMarkup(SettingsHome)).toContain('href="#settings/water"'); });
  it('子頁一律返回設定', () => { expect(settingsMarkup(MasterSettings)).toContain('href="#settings"'); });
  it('審核入口即使空清單仍可使用', () => { const html = settingsMarkup(MemoryReview); expect(html).toContain('目前沒有待審核的記憶'); expect(settingsMarkup(SettingsHome)).toContain('href="#settings/memory"'); });
});
