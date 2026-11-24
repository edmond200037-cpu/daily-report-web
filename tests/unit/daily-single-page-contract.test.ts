import { describe, expect, it } from 'vitest';
import { addBarMarkup, dailyMarkup } from './helpers/react-daily';
import { appState } from '../../src/app/state';

describe('React 日報一頁到底契約', () => {
  it('四個具名區段依工作順序呈現', () => {
    const html = dailyMarkup();
    expect(
      [...html.matchAll(/<section[^>]*aria-label="([^"]+)"/g)].map(
        (match) => match[1],
      ),
    ).toEqual(['施工紀錄', '進料', '聯絡事項', '特殊事項']);
  });
  it('四種新增動作由黏頂工具列直接觸達', () => {
    const html = addBarMarkup();
    for (const action of [
      'add-trade',
      'add-normal-material',
      'add-contact',
      'add-special',
    ])
      expect(html).toContain(`data-daily-action="${action}"`);
  });
  it('日報沒有分類頁籤或舊接線盤', () => {
    const html = dailyMarkup();
    expect(html).not.toMatch(
      /data-daily-tab|material-connection-canvas|role="tabpanel"/,
    );
  });
  it('切換工作區期間停用新增操作', () => {
    const html = addBarMarkup(() => {
      appState.workspaceSwitching = true;
    });
    expect(html).toMatch(
      /disabled[^>]*data-daily-action="add-trade"|data-daily-action="add-trade"[^>]*disabled/,
    );
  });
  it('畫面重繪不修改草稿', () => {
    let before = '';
    const html = dailyMarkup((daily) => {
      before = JSON.stringify(daily.report);
    });
    expect(html).toContain('施工紀錄');
    expect(JSON.stringify(appState.daily.report)).toBe(before);
  });
});
