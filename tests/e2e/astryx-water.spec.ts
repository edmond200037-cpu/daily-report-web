import { expect, test } from '@playwright/test';
test.use({ hasTouch: true });
import { datesFor } from './helpers/report-date';
import { EOL } from 'node:os';
for (const width of [360, 390, 430]) test(`水位與歷史頁無水平捲動 ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  for (const route of ['water-level', 'daily/history']) {
    await page.goto(`/#${route}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const small = await page.locator('main .astryx-button, main .astryx-text-input, main .astryx-date-input, main .astryx-time-input, main .astryx-date-time-input-date-segment, main .astryx-date-time-input-time-segment').evaluateAll((nodes) => nodes.filter((node) => { const rect = node.getBoundingClientRect(); return rect.height > 0 && rect.height < 44; }).map((node) => node.textContent));
    expect(small).toEqual([]);
    if (route === 'water-level') {
      const time = await page.locator('.astryx-date-time-input-time-segment').boundingBox();
      const battery = await page.getByText('電池電量（選填）', { exact: true }).boundingBox();
      expect(time).not.toBeNull(); expect(battery).not.toBeNull();
      expect(battery!.y).toBeGreaterThanOrEqual(time!.y + time!.height);
      if (width === 390) await page.screenshot({ path: 'artifacts/water-touch-check.png', fullPage: true });
    }
  }
});
test('水位量測、變化量、貼上匯入、複製與刪除保留流程', async ({ page, context }) => {
  const dates = datesFor(process.env.DAILY_E2E_DATE!);
  await page.clock.setFixedTime(new Date(dates.fixedTime));
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/#settings/water');
  await page.getByRole('button', { name: '新增井位', exact: true }).click();
  await page.getByRole('textbox', { name: /^井位名稱/ }).fill('A井');
  await page.getByRole('button', { name: '儲存', exact: true }).click();
  await expect(page.getByRole('button', { name: '編輯A井', exact: true })).toBeVisible();
  await page.goto('/#water-level');
  await page.locator('input[type=date]').fill(dates.reportISO);
  await page.locator('input[type=time]').fill('08:00');
  await page.getByRole('textbox', { name: 'A井', exact: true }).fill('10.000');
  await page.getByRole('button', { name: '儲存量測', exact: true }).click();
  await page.getByRole('button', { name: '最近三天', exact: true }).click();
  await expect(page.locator('[data-water-history]')).toHaveCount(1);
  await page.locator('[data-water-history] button').first().click();
  await expect(page.locator('[data-water-history] pre')).toContainText('A井：10.000');
  await page.getByRole('button', { name: '編輯量測', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'A井', exact: true })).toHaveValue('10');
  await page.getByRole('button', { name: '取消編輯', exact: true }).click();
  await page.getByRole('button', { name: '貼上匯入', exact: true }).click();
  const [month, day] = dates.reportISO.slice(5).split('-').map(Number);
  await page.getByRole('textbox', { name: '水位匯入文字', exact: true }).fill(`${month}/${day}-9點\nA井：10.300`);
  await page.getByRole('button', { name: '解析並匯入', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '已匯入' })).toBeVisible();
  await page.getByRole('button', { name: '查看輸出', exact: true }).click();
  await expect(page.locator('aside pre')).toContainText('下降0.300');
  await page.getByRole('button', { name: '複製最近三天', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${month}/${day}-8點\nA井：10.000\n\n${month}/${day}-9點\nA井：10.300(下降0.300)`.replaceAll('\n', EOL));
  await page.getByRole('button', { name: '最近三天', exact: true }).click();
  await page.locator('[data-water-history]').first().getByRole('button').first().click();
  await page.getByRole('button', { name: '刪除量測', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toContainText('後續下降量將重新計算');
  await page.getByRole('alertdialog').getByRole('button', { name: '確認', exact: true }).click();
  await expect(page.locator('[data-water-history]')).toHaveCount(1);
});
