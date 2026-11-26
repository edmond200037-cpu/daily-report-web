import { expect, test } from '@playwright/test';

test('工地名稱：打字未選建議，離開欄位後重新載入仍保留', async ({ page }) => {
  await page.goto('/#daily');
  const site = page.getByRole('combobox', { name: '工地名稱' });
  await site.fill('  鑫天地七期 ');
  await site.press('Tab');
  await expect(page.locator('[data-save-status]')).not.toHaveText('');
  await page.waitForTimeout(1500);
  await page.reload();
  await expect(page.getByText('鑫天地七期').first()).toBeVisible();
  await expect(page.getByRole('combobox', { name: '工地名稱' })).toHaveCount(0);
});

for (const width of [360, 390]) {
  test(`變更按鈕文字不被截斷 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/#daily');
    const site = page.getByRole('combobox', { name: '工地名稱' });
    await site.fill('一個很長很長的工地名稱用來擠壓摘要列');
    await site.press('Enter');
    await expect(page.locator('[data-save-status]')).toBeVisible();
    const button = page.getByRole('button', { name: '變更', exact: true });
    await expect(button).toBeVisible();
    expect(await button.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect((await button.boundingBox())!.width).toBeGreaterThanOrEqual(44);
  });
}

test('新進料表單 360：每個欄位右緣不超出視窗', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 844 });
  await page.goto('/#daily');
  await page.getByRole('button', { name: '新增進料', exact: true }).click();
  const editor = page.locator('[data-material-editor]');
  await expect(editor).toBeVisible();
  // The two-column grid itself must not overflow (its field boxes are wider than the inner inputs).
  expect(await editor.locator(':scope > *').first().evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  for (const name of ['材料類型', '品名', '規格', '供應商', '數量', '單位']) {
    const box = await editor.getByRole(name === '數量' ? 'textbox' : 'combobox', { name, exact: true }).boundingBox();
    expect(box!.x + box!.width, name).toBeLessThanOrEqual(360);
  }
});
