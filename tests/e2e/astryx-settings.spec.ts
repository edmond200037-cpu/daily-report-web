import { expect, test } from '@playwright/test';
const routes = ['settings', 'settings/memory', 'settings/daily/sites', 'settings/daily/trade-tasks', 'settings/daily/locations', 'settings/daily/materials', 'settings/daily/templates', 'settings/water', 'settings/data', 'settings/account', 'settings/debug'];
for (const width of [360, 390, 430]) test(`設定各路由無水平捲動與大型控制 ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  for (const route of routes) {
    await page.goto(`/#${route}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route).toBe(true);
    const small = await page.locator('main .astryx-button, main .astryx-text-input, main .astryx-selector, main .astryx-typeahead').evaluateAll((nodes) => nodes.filter((node) => { const rect = node.getBoundingClientRect(); return rect.height > 0 && rect.height < 44; }).map((node) => node.getAttribute('aria-label') || node.textContent));
    expect(small, route).toEqual([]);
  }
});
test('設定工地新增編輯刪除與備份下載', async ({ page }) => {
  await page.goto('/#settings/daily/sites');
  await page.getByRole('button', { name: '新增工地', exact: true }).click();
  await page.getByRole('textbox', { name: /^工地名稱/ }).fill('甲工地');
  await page.getByRole('button', { name: '儲存', exact: true }).click();
  await page.getByRole('button', { name: '甲工地', exact: true }).click();
  await page.getByRole('textbox', { name: /^工地名稱/ }).fill('乙工地');
  await page.getByRole('button', { name: '儲存', exact: true }).click();
  await page.getByRole('button', { name: '乙工地', exact: true }).click();
  await page.getByRole('button', { name: '刪除', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('此操作將影響設定記憶');
  await page.getByRole('alertdialog').getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByRole('textbox', { name: /^工地名稱/ })).toHaveValue('乙工地');
  await page.getByRole('button', { name: '刪除', exact: true }).click();
  await page.getByRole('button', { name: '確認', exact: true }).click();
  await expect(page.getByRole('button', { name: '乙工地', exact: true })).toHaveCount(0);
  await page.goto('/#settings/data');
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '下載記憶備份', exact: true }).click();
  expect((await downloaded).suggestedFilename()).toContain('記憶備份');
});
test('井位新增改名與 AlertDialog 刪除', async ({ page }) => {
  await page.goto('/#settings/water');
  await page.getByRole('button', { name: '新增井位', exact: true }).click();
  await page.getByRole('textbox', { name: /^井位名稱/ }).fill('A井');
  await page.getByRole('button', { name: '儲存', exact: true }).click();
  await page.getByRole('button', { name: '編輯A井', exact: true }).click();
  await page.getByRole('textbox', { name: /^井位名稱/ }).fill('B井');
  await page.getByRole('button', { name: '儲存', exact: true }).click();
  await page.getByRole('button', { name: '編輯B井', exact: true }).click();
  await page.getByRole('button', { name: '刪除井位', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('不會刪除歷史讀值');
  await page.getByRole('button', { name: '確認', exact: true }).click();
  await expect(page.getByRole('button', { name: '編輯B井', exact: true })).toHaveCount(0);
});
