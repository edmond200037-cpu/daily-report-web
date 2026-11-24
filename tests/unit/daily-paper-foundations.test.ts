import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const read = (p: string) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const theme = JSON.parse(read('themes/site-paper/site-paper.settings.json')) as {
  settings: Array<{ thing: string; value: string; mode?: string }>;
};
const setting = (key: string) => theme.settings.find((row) => row.thing === key)?.value;
describe('Astryx 紙面主題基礎', () => {
  it('以主題編輯器集中設定暖灰紙面與施工橘', () => {
    expect(setting('accent')).toBe('#b84e16');
    expect(setting('--color-background-body')).toBe('#f6f3ec');
    expect(setting('--color-background-surface')).toBe('#fcfaf5');
  });
  it('小中大控制項都至少48px', () => {
    for (const size of ['sm', 'md', 'lg']) expect(setting('--size-element-' + size)).toBe('48px');
  });
  it('根節點使用生成主題和系統深淺模式', () => {
    const src = read('src/app/react/AppShell.tsx');
    expect(src).toContain('themes[defaultThemeSlug]');
    expect(src).toContain('mode="system"');
    expect(src).toContain('mobileNav={false}');
  });
  it('新元件不硬寫色碼尺寸或原生布局節點', () => {
    for (const file of ['DailyPage', 'TradeRow', 'MaterialRows', 'ContactRows', 'controls'])
      expect(read('src/daily/react/' + file + '.tsx')).not.toMatch(
        /<div\b|<span\b|#[\da-fA-F]{3,8}\b|\d+px\b/,
      );
  });
  it('舊畫面CSS隔離在原容器，沒有新根覆寫', () => {
    expect(read('scripts/legacy-css-scope.ts')).toContain('(.legacy-route)');
    expect(read('src/main.ts').match(/core\/reset.css/g)).toHaveLength(1);
    expect(read('src/main.ts').match(/core\/astryx.css/g)).toHaveLength(1);
  });
});
