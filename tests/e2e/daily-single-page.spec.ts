import { test, expect } from '@playwright/test';

for (const width of [360, 375, 430]) {
  test(`一頁到底：${width}px 首屏、面板與跨區草稿`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 812 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.clock.setFixedTime(new Date('2026-11-20T04:00:00Z'));
    const dialogs: string[] = [];
    page.on('dialog', async (dialog) => { dialogs.push(dialog.message()); await dialog.dismiss(); });
    await page.goto('/#daily');
    const action = (name: string) => page.locator(`[data-daily-action="${name}"]`);
    const context = action('toggle-basics');
    await expect(context).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#daily-basics-panel')).toHaveCount(0);
    await expect(page.locator('[data-daily-tab], [role="tabpanel"], .daily-basics')).toHaveCount(0);
    await expect(page.locator('.daily-section')).toHaveCount(4);
    await expect(page.locator('.daily-section__empty, .material-connection-panel')).toHaveCount(0);
    expect((await action('add-trade').boundingBox())!.y + (await action('add-trade').boundingBox())!.height).toBeLessThan(812);
    expect((await action('add-trade').boundingBox())!.y).toBeLessThan(812 * .35);
    const status = await page.locator('[data-save-status]').getAttribute('data-state');
    await context.click();
    await expect(page.locator('.workspace-site')).toContainText('本機工作區');
    await expect(context.locator('[aria-hidden="true"]')).toHaveText('▴');
    const sizes = await page.locator('#daily-basics-panel :is(input, select, button, a), .daily-section__add, .daily-context-button, .daily-page__header .settings-button').evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height));
    expect(sizes.every((height) => height >= 44)).toBe(true);
    await context.click();
    await expect(page.locator('[data-save-status]')).toHaveAttribute('data-state', status!);
    await context.click();
    await page.locator('[data-daily-field="date"]').fill('2026-11-21');
    await expect(context).toHaveAttribute('aria-expanded', 'false');
    await expect(context).toContainText('11/21（六）');
    await context.click();
    const site = '臺北市信義區新建工程工地';
    await page.locator('[data-site-search]').fill(site);
    await page.locator('[data-site-search-action="create"]').click();
    await context.click();
    await expect(context).toContainText(site);
    await expect(page.locator('[data-save-status]')).toHaveAttribute('data-state', 'saved');
    await expect(context.locator('[aria-hidden="true"]')).toHaveText('▾');
    expect(await page.locator('.daily-context-button__site').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    const header = (await page.locator('.daily-page__header').boundingBox())!;
    const button = (await context.boundingBox())!;
    const title = (await page.locator('.daily-page__header .app-header__title').boundingBox())!;
    const settings = (await page.locator('.daily-page__header .settings-button').boundingBox())!;
    expect(button.x).toBeCloseTo(header.x, 0);
    expect(button.width).toBeCloseTo(header.width, 0);
    expect(button.y).toBeGreaterThanOrEqual(Math.max(title.y + title.height, settings.y + settings.height));
    expect(button.height).toBeGreaterThanOrEqual(44);
    expect((await action('add-trade').boundingBox())!.y).toBeLessThan(812 * .35);
    await page.locator('.daily-page__header').screenshot({ path: info.outputPath(`header-12-chars-${width}.png`) });
    await context.click();
    const longSite = '超長工地名'.repeat(6);
    await page.locator('[data-site-search]').fill(longSite);
    await page.locator('[data-site-search-action="create"]').click();
    await context.click();
    await expect(context).toContainText(longSite);
    await expect(page.locator('[data-save-status]')).toHaveAttribute('data-state', 'saved');
    const overflow = await page.locator('.daily-context-button__site').evaluate((element) => ({
      clipped: element.scrollWidth > element.clientWidth,
      ellipsis: getComputedStyle(element).textOverflow,
    }));
    expect(overflow).toEqual({ clipped: true, ellipsis: 'ellipsis' });
    const dateFits = await page.locator('.daily-context-button__date').evaluate((element) => {
      const date = element.getBoundingClientRect();
      const button = element.parentElement!.getBoundingClientRect();
      return date.left >= button.left && date.right <= button.right;
    });
    expect(dateFits).toBe(true);
    await page.locator('.daily-page__header').screenshot({ path: info.outputPath(`header-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await action('add-trade').click();
    await page.locator('[data-trade-picker-search]').fill('測試施工');
    await action('create-trade-from-search').click();
    const work = page.locator('[data-continuous-work]');
    await work.fill('尚未提交的施工輸入');
    await action('add-normal-material').click();
    await expect(page.locator('[data-material-field="materialTypeSnapshot"]')).toBeFocused();
    await expect(work).toHaveValue('尚未提交的施工輸入');
    await page.locator('.work-material-details > summary').click();
    await action('manage-material-connections').click();
    await expect(page.locator('[data-material-connection-search]')).toBeFocused();
    await expect(work).toHaveValue('尚未提交的施工輸入');
    await action('add-special').click();
    await page.locator('[data-special] textarea').fill('同頁新增特殊事項');
    await action('toggle-special').click();
    await expect(page.locator('[data-special]')).toContainText('同頁新增特殊事項');
    await action('toggle-preview').click();
    await action('fix-entry').click();
    await expect(page.locator('[data-daily-field="vendorNameSnapshot"]')).toBeFocused();
    expect(dialogs).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`single-page-${width}.png`), fullPage: true });
  });
}

for (const width of [360, 375, 430]) {
  test(`取消新增：${width}px 施工與特殊事項可復原，聯絡取消直接可見`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 812 });
    await page.clock.install({ time: new Date('2026-11-22T04:00:00Z') });
    const dialogs: string[] = [];
    page.on('dialog', async (dialog) => { dialogs.push(dialog.message()); await dialog.dismiss(); });
    await page.goto('/#daily');
    const action = (name: string) => page.locator(`[data-daily-action="${name}"]`);
    await expect(action('add-trade')).toBeVisible();
    // Only seed a reusable master through the existing repository; create/cancel entries through UI.
    await page.evaluate(async () => {
      const repositoryPath = '/src/data/daily-repository.ts';
      const runtimePath = '/src/app/sync-runtime.ts';
      const { saveMemory } = await import(/* @vite-ignore */ repositoryPath);
      const { refreshActiveMemoryCache } = await import(/* @vite-ignore */ runtimePath);
      await saveMemory('trades', '取消測試工種');
      await refreshActiveMemoryCache();
    });

    await action('add-special').click();
    const firstSpecial = page.locator('[data-special]').first();
    await firstSpecial.locator('textarea').fill('取消後仍可復原的事項');
    const specialId = await firstSpecial.getAttribute('data-special');
    const specialCancel = firstSpecial.locator('[data-daily-action="cancel-new-entry"]');
    await expect(specialCancel).toBeVisible();
    expect((await specialCancel.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await firstSpecial.screenshot({ path: info.outputPath(`special-cancel-${width}.png`) });
    await specialCancel.click();
    await expect(page.locator('[data-special]')).toHaveCount(0);
    await expect(action('undo-trade-delete')).toBeVisible();
    expect((await action('undo-trade-delete').boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await action('undo-trade-delete').click();
    await expect(page.locator(`[data-special="${specialId}"] textarea`)).toHaveValue('取消後仍可復原的事項');
    await expect(action('cancel-new-entry')).toHaveCount(0);

    await action('add-special').click();
    await expect(action('cancel-new-entry')).toHaveCount(1);
    await expect(page.locator('[data-save-status]')).toHaveAttribute('data-state', 'saved');
    const before = await page.evaluate(async () => {
      const path = '/src/app/state.ts';
      const { appState } = await import(/* @vite-ignore */ path);
      return JSON.stringify(appState.daily.report);
    });
    await action('add-trade').click();
    await expect(action('cancel-new-entry')).toHaveCount(0);
    await expect(page.locator('[data-save-status]')).toHaveAttribute('data-state', 'saved');
    expect(await page.evaluate(async () => {
      const path = '/src/app/state.ts';
      const { appState } = await import(/* @vite-ignore */ path);
      return JSON.stringify(appState.daily.report);
    })).toBe(before);
    await action('select-trade').click();
    const trade = page.locator('[data-trade]');
    const tradeId = await trade.getAttribute('data-trade');
    await trade.locator('[data-daily-field="vendorNameSnapshot"]').fill('保留廠商');
    await trade.locator('[data-daily-field="workerCount"]').fill('3');
    await trade.locator('[data-continuous-work]').fill('保留施工內容');
    await trade.locator('[data-work-commit]').click();
    const tradeCancel = trade.locator('[data-daily-action="cancel-new-entry"]');
    await expect(tradeCancel).toBeVisible();
    expect((await tradeCancel.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await trade.screenshot({ path: info.outputPath(`trade-cancel-${width}.png`) });
    await tradeCancel.click();
    await expect(trade).toHaveCount(0);
    await action('undo-trade-delete').click();
    await expect(page.locator(`[data-trade="${tradeId}"]`)).toContainText('保留施工內容');
    await action('toggle-trade').click();
    await expect(trade.locator('[data-daily-field="vendorNameSnapshot"]')).toHaveValue('保留廠商');
    await expect(trade.locator('[data-daily-field="workerCount"]')).toHaveValue('3');

    await action('add-special').click();
    await action('cancel-new-entry').click();
    await expect(action('undo-trade-delete')).toBeVisible();
    await page.clock.fastForward(6001);
    await expect(action('undo-trade-delete')).toHaveCount(0);
    await action('add-contact').click();
    await action('select-trade').click();
    const contactCancel = action('cancel-contact');
    await expect(contactCancel).toBeVisible();
    expect(await contactCancel.evaluate((element) => element.closest('details') === null)).toBe(true);
    expect((await contactCancel.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(dialogs).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`cancel-new-entry-${width}.png`), fullPage: true });
  });
}

test('取消新增標記在日期、工地與離開日報後清除', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-22T04:00:00Z'));
  await page.goto('/#daily');
  const action = (name: string) => page.locator(`[data-daily-action="${name}"]`);
  await action('add-special').click();
  await expect(action('cancel-new-entry')).toHaveCount(1);
  await action('toggle-basics').click();
  await page.locator('[data-daily-field="date"]').fill('2026-11-23');
  await expect(action('cancel-new-entry')).toHaveCount(0);
  await action('toggle-basics').click();
  await page.locator('[data-daily-field="date"]').fill('2026-11-22');
  await expect(page.locator('[data-special]')).toHaveCount(1);
  await expect(action('cancel-new-entry')).toHaveCount(0);

  await action('add-special').click();
  await action('toggle-basics').click();
  await page.locator('[data-site-search]').fill('切換取消測試工地');
  await page.locator('[data-site-search-action="create"]').click();
  await expect(action('cancel-new-entry')).toHaveCount(0);
  await action('toggle-basics').click();
  await action('add-special').click();
  await expect(action('cancel-new-entry')).toHaveCount(1);
  await page.locator('.daily-page__header .settings-button').click();
  await expect(page).toHaveURL(/#settings$/);
  await expect(page.getByRole('link', { name: '返回日報' })).toBeVisible();
  await page.goto('/#daily');
  await expect(action('add-special')).toBeVisible();
  await expect(action('cancel-new-entry')).toHaveCount(0);
});

for (const trigger of ['click', 'Enter'] as const) {
  test(`立即新增工種 → 取消新增：${trigger} 啟動後可刪除及復原`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const dialogs: string[] = [];
    page.on('dialog', async (dialog) => { dialogs.push(dialog.message()); await dialog.dismiss(); });
    await page.goto('/#daily');
    const action = (name: string) => page.locator(`[data-daily-action="${name}"]`);
    await action('add-trade').click();
    const name = '立即新增取消測試工種';
    const search = page.locator('[data-trade-picker-search]');
    await search.fill(name);
    await search.press('Enter');
    await expect(page.locator('dialog.trade-picker')).toBeVisible();
    await expect(page.locator('[data-trade]')).toHaveCount(0);
    const create = action('create-trade-from-search');
    if (trigger === 'click') await create.click();
    else await create.press('Enter');
    await expect(page.locator('dialog.trade-picker')).toHaveCount(0);
    const trade = page.locator('[data-trade]');
    await expect(trade).toHaveCount(1);
    const id = await trade.getAttribute('data-trade');
    await trade.locator('[data-daily-field="vendorNameSnapshot"]').fill('復原廠商');
    const cancel = trade.locator('[data-daily-action="cancel-new-entry"]');
    await expect(cancel).toBeVisible();
    expect((await cancel.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await cancel.click();
    await expect(trade).toHaveCount(0);
    await expect(action('undo-trade-delete')).toBeVisible();
    await action('undo-trade-delete').click();
    const restored = page.locator(`[data-trade="${id}"]`);
    await expect(restored).toContainText(name);
    await action('toggle-trade').click();
    await expect(restored.locator('[data-daily-field="vendorNameSnapshot"]')).toHaveValue('復原廠商');
    expect(dialogs).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
