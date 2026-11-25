import { test, expect, type Locator, type Page } from '@playwright/test';
import { closeDailySettings, openDailySettings, pickWorkMenu } from './helpers/daily-ui';

const action = (page: Page, name: string) =>
  page.locator(`[data-daily-action="${name}"]:visible`);
async function chooseTrade(page: Page, name: string, trigger = 'click') {
  const input = page.getByRole('combobox', { name: '選擇工種', exact: true });
  await input.fill(name);
  await expect(page.getByRole('option', { name, exact: true })).toBeVisible();
  if (trigger === 'click')
    await page.getByRole('option', { name, exact: true }).click();
  else {
    await input.press('ArrowDown');
    await input.press('Enter');
  }
  // The editor sheet opens right after the picker closes, so only the picker is checked.
  await expect(page.getByRole('dialog').filter({ has: input })).not.toBeVisible();
}
const closeSheet = (page: Page) =>
  page.getByRole('button', { name: '關閉', exact: true }).click();
async function addTrade(page: Page, name: string) {
  await action(page, 'add-trade').click();
  await chooseTrade(page, name);
}
async function addWork(page: Page, text: string) {
  await page.getByRole('combobox', { name: '搜尋或輸入下一個工項' }).fill(text);
  await page.getByRole('option', { name: `加入「${text}」`, exact: true }).click();
}
const rows = (page: Page) =>
  page.locator('[data-work]').locator('xpath=ancestor-or-self::li[1]');
const grip = (row: Locator) =>
  row.getByRole('button', { name: /^(Reorder|重新排序|排序)/ });
const values = (page: Page) =>
  page
    .locator('[data-inline-work]')
    .evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value));
async function swipeTrade(_page: Page, trade: Locator) {
  const row = trade.locator('xpath=ancestor-or-self::li[1]');
  await row.scrollIntoViewIfNeeded();
  const r = (await row.boundingBox())!;
  const x = r.x + r.width - 35,
    y = r.y + 25;
  const event = {
    pointerId: 7,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    buttons: 1,
    clientY: y,
  };
  await row.dispatchEvent('pointerdown', { ...event, clientX: x });
  for (const dx of [15, 35, 60, 90])
    await row.dispatchEvent('pointermove', { ...event, clientX: x - dx });
  await row.dispatchEvent('pointerup', {
    ...event,
    buttons: 0,
    clientX: x - 90,
  });
  await row.getByRole('button', { name: '刪除', exact: true }).click();
}
async function reportJSON(page: Page) {
  return page.evaluate(async () => {
    const p = '/src/app/state.ts';
    const { appState } = await import(/* @vite-ignore */ p);
    return JSON.stringify(appState.daily.report);
  });
}

for (const width of [360, 390, 430]) {
  test(`一頁到底：${width}px 首屏、面板與跨區草稿`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 812 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/#daily');
    await expect(page.locator('.daily-section')).toHaveCount(4);
    expect((await action(page, 'add-trade').boundingBox())!.y).toBeLessThan(
      812,
    );
    const before = await reportJSON(page);
    await action(page, 'toggle-preview').click();
    await page.getByRole('button', { name: '關閉預覽', exact: true }).click();
    expect(await reportJSON(page)).toBe(before);
    const settings = await openDailySettings(page);
    await page.getByLabel('日報日期', { exact: true }).fill('2026-11-21');
    await expect(page.getByLabel('日報日期', { exact: true })).toHaveValue(
      '2026-11-21',
    );
    await closeDailySettings(settings);
    for (const site of ['臺北市信義區新建工程工地', '超長工地名'.repeat(6)]) {
      // Once a site is chosen its field moves into the settings sheet.
      const sheet = (await page.getByRole('combobox', { name: '工地名稱' }).count()) ? null : await openDailySettings(page);
      await page.getByRole('combobox', { name: '工地名稱' }).fill(site);
      await page.getByRole('option', { name: site, exact: true }).click();
      if (sheet) await closeDailySettings(sheet);
      await expect(page.locator('.daily-context')).toContainText(site);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await addTrade(page, '測試施工');
    const work = page.getByRole('combobox', { name: '搜尋或輸入下一個工項' });
    await work.fill('尚未提交的施工輸入');
    await closeSheet(page);
    await action(page, 'add-normal-material').click();
    await expect(
      page.getByRole('combobox', { name: '材料類型', exact: true }),
    ).toBeFocused();
    const cancel = page.getByRole('button', { name: '取消進料輸入', exact: true });
    await cancel.click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(cancel).toHaveCount(0);
    await action(page, 'add-normal-material').click();
    await page.getByRole('combobox', { name: '材料類型', exact: true }).fill('鋼筋');
    await cancel.click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: '確認', exact: true })
      .click();
    await page.evaluate(async () => {
      const p = '/src/app/state.ts',
        m = '/src/main.ts';
      const { appState } = await import(/* @vite-ignore */ p);
      const { renderApp } = await import(/* @vite-ignore */ m);
      appState.daily.addStandaloneMaterial('independent');
      const item = appState.daily.report.standaloneMaterialEntries.at(-1);
      appState.daily.connectMaterial(
        appState.daily.report.tradeSections[0].id,
        item.id,
      );
      await renderApp();
    });
    await expect(
      page.locator('[data-material]'),
    ).toContainText('測試施工');
    // The unsubmitted work text survives the sheet closing and reopening.
    await page.locator('[data-trade]').click();
    await expect(page.locator('[data-trade-editor]')).toContainText('已連接 1 筆進料');
    await expect(work).toHaveValue('尚未提交的施工輸入');
    await closeSheet(page);
    await action(page, 'add-special').click();
    await page
      .getByRole('textbox', { name: '特殊事項內容' })
      .fill('同頁新增特殊事項');
    await action(page, 'toggle-special').click();
    await expect(page.locator('[data-special]')).toContainText(
      '同頁新增特殊事項',
    );
    await action(page, 'toggle-preview').click();
    await action(page, 'fix-entry').click();
    await expect(
      page.locator('[data-daily-field="vendorNameSnapshot"]'),
    ).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`single-page-${width}.png`),
      fullPage: true,
    });
  });
  test(`取消新增：${width}px 特殊事項可復原，聯絡取消直接可見`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 812 });
    await page.goto('/#daily');
    await action(page, 'add-special').click();
    await page
      .getByRole('textbox', { name: '特殊事項內容' })
      .fill('取消後仍可復原的事項');
    const id = await page
      .locator('[data-special]')
      .getAttribute('data-special');
    await action(page, 'cancel-new-entry').click();
    await expect(page.locator('[data-special]')).toHaveCount(0);
    const undo = page.getByRole('button', { name: '復原', exact: true });
    await expect(undo).toBeVisible();
    expect((await undo.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await undo.click();
    await expect(page.locator(`[data-special="${id}"]`)).toContainText(
      '取消後仍可復原的事項',
    );
    await expect(action(page, 'cancel-new-entry')).toHaveCount(0);
    await action(page, 'add-contact').click();
    await chooseTrade(page, '聯絡工種');
    await expect(
      page.getByRole('button', { name: '取消聯絡輸入', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: '取消聯絡輸入', exact: true })
      .click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: '確認', exact: true })
      .click();
    await expect(page.getByRole('combobox', { name: '聯絡工項' })).toHaveCount(
      0,
    );
  });
  test(`施工卡精簡：${width}px 位置備註持續保存與 44px 控制`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 812 });
    await page.goto('/#daily');
    await addTrade(page, '精簡測試工種');
    const trade = page.locator('[data-trade-editor]');
    expect((await trade.boundingBox())!.height).toBeLessThanOrEqual(450);
    await expect(trade).not.toContainText('取消新增');
    await addWork(page, '鋼筋綁紮');
    await pickWorkMenu(page, '位置、樓層與備註');
    const start = page.getByRole('textbox', { name: '起始樓層' });
    await start.fill('3F');
    const location = page.getByRole('combobox', { name: '位置', exact: true });
    await location.fill('東側');
    await page.getByRole('option', { name: '東側', exact: true }).click();
    await expect(start).toHaveValue('3FL');
    await page
      .getByRole('textbox', { name: '備註', exact: true })
      .fill('待監造確認');
    await expect(page.locator('[data-save-status]')).toHaveAttribute(
      'data-state',
      'saved',
    );
    await page
      .getByRole('button', { name: '完成，返回工項', exact: true })
      .click();
    await expect(start).not.toBeVisible();
    await pickWorkMenu(page, '位置、樓層與備註');
    await expect(start).toHaveValue('3FL');
    await expect(
      page.getByRole('textbox', { name: '備註', exact: true }),
    ).toHaveValue('待監造確認');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const sizes = await trade
      .locator('.astryx-button,.astryx-text-input,.astryx-typeahead')
      .evaluateAll((els) =>
        els
          .filter((el) => el.getBoundingClientRect().height > 0)
          .map((el) => el.getBoundingClientRect().height),
      );
    expect(sizes.every((h) => h >= 44)).toBe(true);
    await page
      .getByRole('dialog', { name: '施工紀錄' })
      .screenshot({ path: info.outputPath(`compact-${width}.png`) });
  });
}
test('取消新增標記在日期、工地與離開日報後清除', async ({ page }) => {
  await page.goto('/#daily');
  // The open special-item sheet is modal, so the switches run programmatically instead of through the covered page.
  const switchDate = (date: string) =>
    page.evaluate(async (next) => {
      const p = '/src/app/workspace-events.ts';
      const { switchDailyDate } = await import(/* @vite-ignore */ p);
      await switchDailyDate(next);
    }, date);
  await action(page, 'add-special').click();
  await expect(action(page, 'cancel-new-entry')).toHaveCount(1);
  await switchDate('2026-11-22');
  await expect(action(page, 'cancel-new-entry')).toHaveCount(0);
  await action(page, 'add-special').click();
  await page.evaluate(async () => {
    const p = '/src/daily/views/daily-entry.ts';
    const { selectDailySite } = await import(/* @vite-ignore */ p);
    await selectDailySite('切換工地');
  });
  await expect(action(page, 'cancel-new-entry')).toHaveCount(0);
  await action(page, 'add-special').click();
  await page.evaluate(() => { location.hash = '#settings'; });
  await page.evaluate(() => { location.hash = '#daily'; });
  await expect(action(page, 'cancel-new-entry')).toHaveCount(0);
});
test('施工卡沒有取消新增，按完成有缺漏時提示並聚焦', async ({ page }) => {
  await page.goto('/#daily');
  await addTrade(page, '完成測試');
  await expect(action(page, 'cancel-new-entry')).toHaveCount(0);
  await action(page, 'finish-entry').click();
  const notice = page.getByRole('dialog', { name: '提示', exact: true });
  await expect(notice).toHaveCount(1);
  await notice.getByRole('button', { name: '知道了', exact: true }).click();
  await expect(page.locator('[data-trade]')).toHaveCount(1);
  await expect(
    page.locator('[data-daily-field="vendorNameSnapshot"]'),
  ).toBeFocused();
});
for (const trigger of ['click', 'Enter'])
  test(`立即新增工種 → 左滑刪除：${trigger} 可刪除及復原`, async ({ page }) => {
    await page.goto('/#daily');
    await action(page, 'add-trade').click();
    await chooseTrade(page, '立即新增測試工種', trigger);
    const trade = page.locator('[data-trade]');
    const id = await trade.getAttribute('data-trade');
    const editor = page.locator('[data-trade-editor]');
    // 選工種後 App 會延遲捲動並聚焦廠商欄；捲動會讓 Astryx 收起已展開的滑動列，需等它落定再滑。
    const vendor = editor.locator('[data-daily-field="vendorNameSnapshot"]');
    await expect(vendor).toBeFocused();
    await vendor.fill('復原廠商');
    await closeSheet(page);
    await swipeTrade(page, trade);
    await expect(trade).toHaveCount(0);
    await page.getByRole('button', { name: '復原', exact: true }).click();
    await expect(page.locator(`[data-trade="${id}"]`)).toContainText(
      '立即新增測試工種',
    );
    await action(page, 'toggle-trade').click();
    await expect(
      editor.locator('[data-daily-field="vendorNameSnapshot"]'),
    ).toHaveValue('復原廠商');
  });
test('Work grip drag sorting and rollback', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 2000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#daily');
  await addTrade(page, 'Drag test trade');
  for (const value of ['Work A', 'Work B', 'Work C'])
    await addWork(page, value);
  await expect(rows(page)).toHaveCount(3);
  await expect(page.locator('[data-save-status]')).toHaveAttribute(
    'data-state',
    'saved',
  );
  const before = await reportJSON(page);
  const begin = async () => {
    const h = grip(rows(page).first());
    await h.scrollIntoViewIfNeeded();
    const r = (await h.boundingBox())!;
    const x = r.x + r.width / 2,
      y = r.y + r.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 12);
    return { x, y };
  };
  // Escape would also dismiss the editor sheet, so the aborted drag is released where it started.
  await begin();
  await page.mouse.up();
  expect(await values(page)).toEqual(['Work A', 'Work B', 'Work C']);
  expect(await reportJSON(page)).toBe(before);
  const point = await begin();
  const end = (await rows(page).last().boundingBox())!;
  await page.mouse.move(point.x, end.y + end.height - 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => values(page)).toEqual(['Work B', 'Work C', 'Work A']);
  await expect(page.locator('[data-save-status]')).toHaveAttribute(
    'data-state',
    'saved',
  );
  await page.reload();
  await action(page, 'toggle-trade').click();
  await expect.poll(() => values(page)).toEqual(['Work B', 'Work C', 'Work A']);
  await page.evaluate(async () => {
    const p = '/src/app/state.ts';
    const { appState } = await import(/* @vite-ignore */ p);
    const original = appState.daily.flush.bind(appState.daily);
    let fail = true;
    appState.daily.flush = async () => {
      if (fail) {
        fail = false;
        throw Error('測試儲存失敗');
      }
      return original();
    };
  });
  page.once('dialog', async (d) => {
    expect(d.message()).toContain('已恢復原順序');
    await d.accept();
  });
  const next = await begin();
  const last = (await rows(page).last().boundingBox())!;
  await page.mouse.move(next.x, last.y + last.height - 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => values(page)).toEqual(['Work B', 'Work C', 'Work A']);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath('reorder.png') });
});
test('鍵盤握把排序與聯絡工項排序', async ({ page }) => {
  await page.goto('/#daily');
  await addTrade(page, '排序測試');
  for (const value of ['工項甲', '工項乙']) await addWork(page, value);
  const h = grip(rows(page).first());
  await h.focus();
  await h.press('Enter');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-inline-work]').first()).toHaveValue(
    '工項乙',
  );
  await closeSheet(page);
  await action(page, 'add-contact').click();
  await chooseTrade(page, '排序測試');
  for (const value of ['聯絡甲', '聯絡乙']) {
    await page.getByRole('combobox', { name: '聯絡工項' }).fill(value);
    await action(page, 'contact-add-task').click();
  }
  const contacts = page
    .getByRole('textbox', { name: '聯絡內容', exact: true })
    .locator('xpath=ancestor-or-self::li[1]');
  await grip(contacts.first()).focus();
  await grip(contacts.first()).press('Enter');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('textbox', { name: '聯絡內容', exact: true }).first(),
  ).toHaveValue('聯絡乙');
});
