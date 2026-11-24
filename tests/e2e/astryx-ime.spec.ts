import { test, expect } from '@playwright/test';

test('Typeahead 組字期間 Enter 不得選取工項，保留焦點與游標', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/astryx-ime.html');
  const input = page.getByRole('combobox', { name: '工項輸入器' });
  await input.focus();
  await input.dispatchEvent('compositionstart', { data: '' });
  await input.fill('鋼筋');
  await expect(page.getByRole('option', { name: '鋼筋綁紮' })).toBeVisible();
  await input.dispatchEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', isComposing: true, keyCode: 229 });
  await input.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true, keyCode: 229 });
  await expect(page.locator('#selection')).toHaveText('尚未加入');
  await expect(input).toHaveValue('鋼筋');
  await expect(input).toBeFocused();
  await expect.poll(() => input.evaluate((node: HTMLInputElement) => node.selectionStart)).toBe(2);
  await input.dispatchEvent('compositionend', { data: '鋼筋' });
  await input.press('ArrowDown');
  await input.press('Enter');
  await expect(page.locator('#selection')).toHaveText('鋼筋綁紮');
});

for (const key of [{ isComposing: true, keyCode: 13 }, { isComposing: false, keyCode: 229 }, { isComposing: false, keyCode: 13 }]) {
  test(`Typeahead 已反白建議後組字 Enter 不得選取 ${JSON.stringify(key)}`, async ({ page }) => {
    // 合成事件 lifecycle-only，實機不會發生；實機 IME 驗收列為尚未驗證（依協調者決策）。
    test.fixme(!key.isComposing && key.keyCode !== 229, '僅以 isComposing / 229 為硬門檻');
    await page.goto('/tests/e2e/fixtures/astryx-ime.html');
    const input = page.getByRole('combobox', { name: '工項輸入器' });
    await input.fill('鋼');
    await expect(page.getByRole('option', { name: '鋼筋綁紮' })).toBeVisible();
    await input.press('ArrowDown');
    await input.dispatchEvent('compositionstart', { data: '' });
    await input.fill('鋼筋');
    await expect(page.getByRole('option', { name: '鋼筋綁紮' })).toBeVisible();
    await input.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', ...key });
    await expect(page.locator('#selection')).toHaveText('尚未加入');
    await expect(input).toHaveValue('鋼筋');
    await expect(input).toBeFocused();
    await input.dispatchEvent('compositionend', { data: '鋼筋' });
  });
}
