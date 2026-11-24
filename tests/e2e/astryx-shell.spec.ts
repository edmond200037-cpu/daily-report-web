import { expect, test } from '@playwright/test';

for (const width of [360, 390, 430]) {
  test(`React 三入口導覽與 Sheet 暫態不寫草稿 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/#daily');
    await expect(page.getByRole('heading', { name: '施工日報', exact: true })).toBeVisible();
    const reportBefore = await page.evaluate(async () => {
      const modulePath = '/src/app/state.ts';
      const { appState } = await import(/* @vite-ignore */ modulePath);
      return JSON.stringify(appState.daily.report);
    });
    await page.getByRole('button', { name: '檢查與預覽', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '檢查與預覽' })).toBeVisible();
    await page.getByRole('button', { name: '關閉預覽' }).click();
    await expect(page.getByRole('dialog', { name: '檢查與預覽' })).not.toBeVisible();
    const reportAfter = await page.evaluate(async () => {
      const modulePath = '/src/app/state.ts';
      const { appState } = await import(/* @vite-ignore */ modulePath);
      return JSON.stringify(appState.daily.report);
    });
    expect(reportAfter).toBe(reportBefore);
    for (const [name, route] of [['水位變化', 'water-level'], ['設定', 'settings'], ['施工日報', 'daily']]) {
      await page.getByRole('link', { name, exact: true }).first().click();
      await expect(page).toHaveURL(new RegExp(`#${route}$`));
      await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  });
}
