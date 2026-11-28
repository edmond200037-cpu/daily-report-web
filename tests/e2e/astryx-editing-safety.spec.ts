import { expect, test, type Page } from '@playwright/test';

async function completeTrade(page: Page) {
  await page.getByRole('button', { name: '新增施工紀錄', exact: true }).click();
  await page.getByRole('combobox', { name: '選擇工種', exact: true }).fill('紮筋工程');
  await page.getByRole('option', { name: '紮筋工程', exact: true }).click();
  await page.getByRole('textbox', { name: '廠商', exact: true }).fill('順立');
  await page.getByRole('textbox', { name: '人數', exact: true }).fill('12');
  const input = page.getByRole('combobox', { name: '搜尋或輸入下一個工項', exact: true });
  await input.fill('地樑鋼筋、柱筋綁紮');
  await expect(input).toHaveValue('柱筋綁紮');
  await expect(page.getByRole('option', { name: '加入「柱筋綁紮」', exact: true })).toBeVisible();
  await input.press('ArrowDown');
  await input.press('Enter');
  await expect(page.locator('[data-inline-work]')).toHaveCount(2);
  await page.getByRole('button', { name: '完成施工紀錄', exact: true }).click();
}

test('未選工地定稿不卡死：依舊版擋下提示且不建立定稿', async ({ page }) => {
  const nativeNotices: string[] = [];
  page.on('dialog', async (dialog) => { nativeNotices.push(dialog.message()); await dialog.dismiss(); });
  await page.goto('/#daily');
  await completeTrade(page);
  await page.getByRole('button', { name: '檢查與預覽', exact: true }).click();
  await page.getByRole('button', { name: '定稿並複製（草稿保留）', exact: true }).click();
  const notice = page.getByRole('dialog', { name: '提示', exact: true });
  await expect(notice).toContainText('尚未完成：');
  await expect(notice).toContainText('請填寫工地名稱。');
  await notice.getByRole('button', { name: '知道了', exact: true }).click();
  await page.getByRole('button', { name: '關閉預覽', exact: true }).click();
  await page.goto('/#daily/history');
  await expect(page.getByText('近 7 天尚無已定稿日報。', { exact: true })).toBeVisible();
  expect(nativeNotices).toEqual([]);
});

test('已選工地仍可定稿並保留原文字內容', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.clock.setFixedTime(new Date('2026-11-24T12:00:00+08:00'));
  await page.goto('/#daily');
  await page.getByRole('combobox', { name: '工地名稱', exact: true }).fill('鑫天地六期');
  await page.getByRole('option', { name: '鑫天地六期', exact: true }).click();
  await completeTrade(page);
  await page.getByRole('button', { name: '檢查與預覽', exact: true }).click();
  await page.getByRole('button', { name: '定稿並複製（草稿保留）', exact: true }).click();
  await expect(page.locator('.daily-output__feedback')).toContainText('已在本機定稿並複製');
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain('鑫天地六期：11/24（二）');
  expect(text).toContain('順立12工-地樑鋼筋、柱筋綁紮。');
});

for (const width of [360, 390, 430]) test(`編輯聚焦工項不被 Sheet 固定操作列遮擋 ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await page.goto('/#daily');
  await page.getByRole('button', { name: '新增施工紀錄', exact: true }).click();
  await page.getByRole('combobox', { name: '選擇工種', exact: true }).fill('編輯可視測試');
  await page.getByRole('option', { name: '編輯可視測試', exact: true }).click();
  const input = page.getByRole('combobox', { name: '搜尋或輸入下一個工項', exact: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await input.evaluate((node: HTMLInputElement) => node.focus({ preventScroll: true }));
  await expect(input).toBeFocused();
  const footer = page.getByLabel('施工紀錄操作', { exact: true });
  await expect.poll(async () => {
    const field = (await input.boundingBox())!, bar = (await footer.boundingBox())!;
    return field.y + field.height < bar.y;
  }).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await input.fill('地樑鋼筋');
  await expect(page.getByRole('option', { name: '加入「地樑鋼筋」', exact: true })).toBeVisible();
  await input.press('ArrowDown');
  await input.press('Enter');
  const work = page.locator('[data-inline-work]').first();
  await work.focus();
  const geometry = await work.evaluate((node) => {
    const row = node.closest('li')!;
    const field = node.parentElement!.getBoundingClientRect();
    const handle = row.querySelector('[data-astryx-list-reorder]')!.getBoundingClientRect();
    return { field: field.toJSON(), handle: handle.toJSON() };
  });
  expect(Math.abs(geometry.field.y + geometry.field.height / 2 - geometry.handle.y - geometry.handle.height / 2)).toBeLessThan(2);
});
