import { describe, expect, it } from 'vitest';
import { dailyMarkup } from './helpers/react-daily';

describe('React 日報輸入區', () => {
  it('四區依工作順序呈現，保留四個新增動作', () => {
    const html = dailyMarkup();
    expect(
      [...html.matchAll(/<section[^>]*aria-label="([^"]+)"/g)].map(
        (match) => match[1],
      ),
    ).toEqual(['施工紀錄', '進料', '聯絡事項', '特殊事項']);
    for (const action of [
      'add-trade',
      'add-normal-material',
      'add-contact',
      'add-special',
    ])
      expect(html).toContain(`data-daily-action="${action}"`);
  });
});
