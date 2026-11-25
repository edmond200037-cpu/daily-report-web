import { expect, test } from '@playwright/test';

test('單值欄位：輸入出現建議，點選後值為純文字且沒有 Token', async ({ page }) => {
  await page.goto('/#daily');
  await page.getByRole('button', { name: '新增進料', exact: true }).click();
  const input = page.getByRole('combobox', { name: '材料類型', exact: true });
  await input.fill('鋼筋');
  await expect(input).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('option', { name: '鋼筋', exact: true }).click();
  await expect(input).toHaveValue('鋼筋');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(input).toHaveAttribute('aria-expanded', 'false');
  // The value is plain text in the input: no token chip and no second control holding it.
  await expect(page.locator('[data-material-editor] [class*="token" i]')).toHaveCount(0);
  await input.fill('鋼筋Ａ');
  await expect(input).toHaveValue('鋼筋Ａ');
});

for (const ime of [{ isComposing: true, keyCode: 13 }, { isComposing: false, keyCode: 229 }]) {
  test(`單值欄位：組字中 Enter 不選建議 ${JSON.stringify(ime)}`, async ({ page }) => {
    await page.goto('/#daily');
    await page.getByRole('button', { name: '新增進料', exact: true }).click();
    const input = page.getByRole('combobox', { name: '材料類型', exact: true });
    await input.press('ArrowDown');
    await input.dispatchEvent('compositionstart', { data: '' });
    await input.fill('測試中');
    await expect(page.getByRole('option', { name: '測試中', exact: true })).toBeVisible();
    await input.press('ArrowDown');
    await input.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', ...ime });
    await expect(page.getByRole('listbox')).toBeVisible();
    await expect(input).toHaveValue('測試中');
    await expect(input).toBeFocused();
    await input.dispatchEvent('compositionend', { data: '測試中' });
    await input.press('Enter');
    await expect(page.getByRole('listbox')).toHaveCount(0);
  });
}
