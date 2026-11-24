import { describe, expect, it } from 'vitest';
import { settingsMarkup, settingsState } from './helpers/react-settings';
import { SettingsHome, MasterSettings } from '../../src/app/react-settings';

describe('React 設定版面', () => {
  it('資料使用連續列與 Astryx 間距', () => { const html = settingsMarkup(SettingsHome); expect(html).toContain('data-gap="4"'); expect(html).toContain('astryx-list'); });
  it('行內表單使用元件排版及大型控制', () => { const html = settingsMarkup(MasterSettings, () => { settingsState.adding = true; }); expect(html).toContain('data-settings-form="add"'); expect(html).toContain('data-size="lg"'); expect(html).toContain('name="name"'); });
  it('資訊與協作分組保留各入口', () => { const html = settingsMarkup(SettingsHome); for (const route of ['data', 'account', 'debug']) expect(html).toContain('href="#settings/' + route + '"'); });
});
