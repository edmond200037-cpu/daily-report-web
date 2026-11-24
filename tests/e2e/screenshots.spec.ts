import { test, expect } from '@playwright/test';
import { DailyUI } from './helpers/daily-ui';
import { Metrics } from './helpers/metrics';
import { datesFor } from './helpers/report-date';
import { scenarios } from './fixtures/daily-scenarios';

// 改版前後截圖：SHOT_LABEL=before|after npx playwright test screenshots
const label = process.env.SHOT_LABEL ?? 'after';
const routes = ['daily', 'daily/history', 'water-level', 'settings', 'settings/memory', 'settings/data', 'settings/account', 'settings/water', 'settings/daily/sites', 'settings/daily/trade-tasks', 'settings/daily/locations', 'settings/daily/materials', 'settings/daily/templates', 'settings/debug'];

for (const scheme of ['light', 'dark'] as const) {
  test(`截圖 ${label} ${scheme}`, async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    const scenario = scenarios.find((item) => item.id === 'standard')!;
    await page.goto('/#daily');
    await new DailyUI(page, new Metrics(page, info)).fill(scenario, datesFor(process.env.DAILY_E2E_DATE!));
    for (const name of ['複製日報文字', '定稿並複製（草稿保留）']) {
      const button = page.getByRole('button', { name, exact: true });
      await expect(button).toBeInViewport({ ratio: 1 });
      const box = await button.boundingBox();
      expect(box!.y + box!.height).toBeLessThanOrEqual(844);
    }
    const close = await page.getByRole('button', { name: '關閉預覽', exact: true }).boundingBox();
    expect(close!.y + close!.height).toBeGreaterThanOrEqual(790);
    await page.mouse.move(0, 0);
    await page.screenshot({ path: `artifacts/screenshots/${label}/${scheme}/daily-preview.png` });
    await page.getByRole('button', { name: '關閉預覽' }).click();
    await expect(page.getByRole('button', { name: /刪除施工紀錄|刪除進料|編輯進料|編輯聯絡事項|刪除聯絡事項/ })).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: '連接工種', exact: true })).toHaveCount(0);
    for (const route of routes) {
      await page.goto(`/#${route}`);
      await page.waitForTimeout(600);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.mouse.move(0, 0);
      await page.screenshot({ path: `artifacts/screenshots/${label}/${scheme}/${route.replace(/\//g, '_')}.png`, fullPage: true });
    }
    await page.goto('/#daily');
    const row = page.locator('[data-trade]').first();
    await row.scrollIntoViewIfNeeded();
    const rect = (await row.boundingBox())!;
    const touch = { pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0, buttons: 1, clientY: rect.y + 25 };
    const x = rect.x + rect.width - 35;
    await row.dispatchEvent('pointerdown', { ...touch, clientX: x });
    for (const dx of [15, 35, 60, 90]) await row.dispatchEvent('pointermove', { ...touch, clientX: x - dx });
    await row.dispatchEvent('pointerup', { ...touch, buttons: 0, clientX: x - 90 });
    await expect(row.getByRole('button', { name: '刪除', exact: true })).toBeVisible();
    await page.mouse.move(0, 0);
    await page.screenshot({ path: `artifacts/screenshots/${label}/${scheme}/daily-swipe.png` });
    await page.reload();
    await page.locator('[data-material]').first().click();
    await expect(page.getByRole('combobox', { name: '連接工種', exact: true })).toBeVisible();
    await page.locator('[data-material-editor]').scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    await page.screenshot({ path: `artifacts/screenshots/${label}/${scheme}/material-editor.png`, fullPage: true });
  });
}
