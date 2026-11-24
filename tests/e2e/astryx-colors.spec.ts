import { expect, test } from '@playwright/test';

for (const colorScheme of ['light', 'dark'] as const) test(`日報橘與水位綠主要按鈕 AA 對比 ${colorScheme}`, async ({ page }) => {
  await page.emulateMedia({ colorScheme });
  const colors = [];
  for (const [route, name] of [['daily', '檢查與預覽'], ['water-level', '儲存量測']]) {
    await page.goto(`/#${route}`);
    const button = page.getByRole('button', { name, exact: true });
    const result = await button.evaluate((node) => {
      const style = getComputedStyle(node);
      const context = document.createElement('canvas').getContext('2d')!;
      const rgb = (color: string) => { context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1); return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3); };
      const luminance = (color: number[]) => color.map((part) => { const value = part / 255; return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4; }).reduce((sum, part, index) => sum + part * [.2126, .7152, .0722][index], 0);
      const background = rgb(style.backgroundColor), foreground = rgb(style.color);
      const a = luminance(background), b = luminance(foreground);
      return { background, foreground, ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
    });
    expect(result.ratio, `${route} ${colorScheme}`).toBeGreaterThanOrEqual(4.5);
    if (route === 'daily') expect(result.background[0]).toBeGreaterThan(result.background[1]);
    else expect(result.background[1]).toBeGreaterThan(result.background[0]);
    colors.push(result);
  }
  expect(colors[0].background).not.toEqual(colors[1].background);
});
