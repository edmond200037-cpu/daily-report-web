import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
const read = (p: string) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
describe('React 與既有路由共用外殼', () => {
  it('根節點包含Theme和AppShell及兩個主頁與設定', () => {
    const source = read('src/app/react/AppShell.tsx');
    for (const value of ['<Theme', '<AppShell', '施工日報', '水位變化', '設定', 'height="auto"'])
      expect(source).toContain(value);
  });
  it('保留同一個舊容器與事件擁有者', () => {
    const source = read('src/app/react/LegacyRoute.tsx');
    expect(source).toContain('append(outlet)');
    expect(source).not.toContain('cloneNode');
    expect(read('src/main.ts')).toContain('prepareReactRoute(route.module');
  });
  it('日報用React，其餘頁面仍呼叫舊渲染器', () => {
    const source = read('src/main.ts');
    for (const value of [
      'renderReactDaily()',
      'dailyHistoryView()',
      'dailySettingsView()',
      'renderAccountLoading()',
      'mountWater(route, token)',
    ])
      expect(source).toContain(value);
  });
  it('日期切換暫停輸入並使舊同步結果失效', () => {
    const source = read('src/app/workspace-events.ts');
    for (const value of [
      'switchDailyDate',
      'appState.dateSwitching = true',
      'appState.activeSyncEpoch += 1',
      'app.inert = true',
      'app.inert = false',
    ])
      expect(source).toContain(value);
  });
});
