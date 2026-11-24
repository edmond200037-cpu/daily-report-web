import { expect, test } from '@playwright/test';
const fields = ['工地名稱', '選擇工種', '材料類型', '單位', '聯絡廠商', '聯絡工項', '位置'];
for (const label of fields) for (const ime of [{ isComposing: true, keyCode: 13 }, { isComposing: false, keyCode: 229 }]) {
  test(`${label} 組字遇重繪保留文字與焦點 ${JSON.stringify(ime)}`, async ({ page }) => {
    await page.goto('/#daily');
    const chooseTrade = async () => {
      await page.getByRole('combobox', { name: '選擇工種', exact: true }).fill('整合測試');
      await page.getByRole('option', { name: '整合測試', exact: true }).click();
    };
    if (label === '選擇工種') await page.getByRole('button', { name: '新增施工紀錄', exact: true }).click();
    if (label === '材料類型' || label === '單位') await page.getByRole('button', { name: '新增進料', exact: true }).click();
    if (label.startsWith('聯絡')) {
      await page.getByRole('button', { name: '新增聯絡事項', exact: true }).click();
      await chooseTrade();
    }
    if (label === '位置') {
      await page.getByRole('button', { name: '新增施工紀錄', exact: true }).click();
      await chooseTrade();
      await page.getByRole('combobox', { name: '搜尋或輸入下一個工項', exact: true }).fill('配管');
      await page.getByRole('option', { name: '配管', exact: true }).click();
      await page.getByRole('button', { name: '位置、樓層與備註', exact: true }).click();
    }
    const input = page.getByRole('combobox', { name: label, exact: true });
    await input.dispatchEvent('compositionstart', { data: '' });
    await input.fill('測試中');
    await page.evaluate(async () => {
      const modulePath = '/src/app/react-store.ts';
      const { notifyReact } = await import(/* @vite-ignore */ modulePath);
      notifyReact();
    });
    await input.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', ...ime });
    await expect(input).toHaveValue('測試中');
    await expect(input).toBeFocused();
    expect(await input.evaluate((node: HTMLInputElement) => node.selectionStart)).toBe(3);
    if (label === '選擇工種') await expect(page.locator('[data-trade]')).toHaveCount(0);
    if (label.startsWith('聯絡')) await expect(page.getByRole('textbox', { name: '聯絡內容', exact: true })).toHaveCount(0);
    await input.dispatchEvent('compositionend', { data: '測試中' });
    await page.getByRole('option', { name: '測試中', exact: true }).click();
    await expect.poll(() => page.evaluate(async (field) => {
      const modulePath = '/src/app/state.ts';
      const { appState } = await import(/* @vite-ignore */ modulePath);
      if (field === '工地名稱') return appState.daily.report.siteNameSnapshot;
      if (field === '選擇工種') return appState.daily.report.tradeSections[0]?.tradeNameSnapshot;
      if (field === '材料類型') return appState.materialEditor?.value.materialTypeSnapshot;
      if (field === '單位') return appState.materialEditor?.value.unit;
      if (field === '聯絡廠商') return appState.contactEditor?.value.vendorNameSnapshot;
      if (field === '聯絡工項') return appState.contactEditor?.value.items[0]?.content;
      return appState.daily.report.tradeSections[0]?.workItems[0]?.locationTextSnapshot;
    }, label)).toBe('測試中');
  });
}
