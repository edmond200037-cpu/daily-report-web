import { expect, test } from '@playwright/test';

for (const ime of [
  { isComposing: true, keyCode: 13 },
  { isComposing: false, keyCode: 229 },
]) {
  test(`日報工項 Typeahead 保留組字與游標 ${JSON.stringify(ime)}`, async ({
    page,
  }) => {
    await page.goto('/#daily');
    await page
      .getByRole('button', { name: '新增施工紀錄', exact: true })
      .click();
    const trade = page.getByRole('combobox', { name: '選擇工種' });
    await trade.fill('鋼筋工程');
    await page.getByRole('option', { name: '鋼筋工程', exact: true }).click();
    const input = page.getByRole('combobox', { name: '搜尋或輸入下一個工項' });
    await input.fill('鋼');
    await expect(
      page.getByRole('option', { name: '鋼', exact: true }),
    ).toBeVisible();
    await input.press('ArrowDown');
    await input.dispatchEvent('compositionstart', { data: '' });
    await input.fill('鋼筋');
    await expect(
      page.getByRole('option', { name: '鋼筋', exact: true }),
    ).toBeVisible();
    await input.dispatchEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      ...ime,
    });
    await expect(page.locator('[data-inline-work]')).toHaveCount(0);
    await expect(input).toHaveValue('鋼筋');
    await expect(input).toBeFocused();
    expect(
      await input.evaluate((node: HTMLInputElement) => node.selectionStart),
    ).toBe(2);
    await input.dispatchEvent('compositionend', { data: '鋼筋' });
    await input.press('ArrowDown');
    await input.press('Enter');
    await expect(page.locator('[data-inline-work]')).toHaveCount(1);
  });
}

test('工項頓號拆項保留尾端文字，組字結束才拆項', async ({ page }) => {
  await page.goto('/#daily');
  await page.getByRole('button', { name: '新增施工紀錄', exact: true }).click();
  await page
    .getByRole('combobox', { name: '選擇工種', exact: true })
    .fill('頓號測試');
  await page.getByRole('option', { name: '頓號測試', exact: true }).click();
  const input = page.getByRole('combobox', { name: '搜尋或輸入下一個工項' });
  await input.dispatchEvent('compositionstart', { data: '' });
  await input.fill('工項甲、工項乙');
  await expect(page.locator('[data-inline-work]')).toHaveCount(0);
  await input.dispatchEvent('compositionend', { data: '工項甲、工項乙' });
  await expect(page.locator('[data-inline-work]')).toHaveCount(1);
  await expect(page.locator('[data-inline-work]')).toHaveValue('工項甲');
  await expect(input).toHaveValue('工項乙');
  await expect(input).toBeFocused();
});
