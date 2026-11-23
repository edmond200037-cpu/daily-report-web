import { test, expect, type Locator, type Page } from '@playwright/test';

// 施工卡展開時只有標題列可左滑（卡片內容區不啟動左滑刪除）。
async function swipeTradeAway(page: Page, trade: Locator) {
  const box = (await trade.locator('.entry-editor-header').boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width - 20, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 60, y, { steps: 4 });
  await page.mouse.move(box.x + box.width - 160, y, { steps: 6 });
  await page.mouse.up();
}

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
    await expect(page.locator('.work-material-details, .linked-material-line')).toHaveCount(0);
    await page.evaluate(async () => {
      const statePath = '/src/app/state.ts';
      const mainPath = '/src/main.ts';
      const { appState } = await import(/* @vite-ignore */ statePath);
      const { renderApp } = await import(/* @vite-ignore */ mainPath);
      const daily = appState.daily;
      daily.addStandaloneMaterial('independent');
      const material = daily.report.standaloneMaterialEntries.at(-1);
      daily.connectMaterial(daily.report.tradeSections[0].id, material.id);
      await renderApp();
    });
    await expect(page.locator('.linked-material-line')).toHaveText('已連接 1 筆進料');
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
    await expect(trade.locator('[data-daily-action="cancel-new-entry"]')).toHaveCount(0);
    await expect(trade.locator('[data-daily-action="next-entry"]')).toHaveCount(0);
    await expect(trade.locator('[data-daily-action="finish-entry"]')).toHaveText('完成');
    await trade.screenshot({ path: info.outputPath(`trade-card-${width}.png`) });
    await swipeTradeAway(page, trade);
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

test('施工卡沒有取消新增，按完成有缺漏時提示並聚焦', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const dialogs: string[] = [];
  page.on('dialog', async (dialog) => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  await page.goto('/#daily');
  const action = (name: string) => page.locator(`[data-daily-action="${name}"]`);
  await action('add-trade').click();
  const search = page.locator('[data-trade-picker-search]');
  await search.fill('完成後取消測試工種');
  await search.press('Enter');
  await action('create-trade-from-search').click();
  const trade = page.locator('[data-trade]');
  await expect(trade).toHaveCount(1);
  await expect(action('cancel-new-entry')).toHaveCount(0);
  await trade.locator('[data-daily-action="finish-entry"]').click();
  await expect.poll(() => dialogs.length).toBe(1);
  await expect(action('cancel-new-entry')).toHaveCount(0);
  await expect(trade).toHaveCount(1);
});

for (const trigger of ['click', 'Enter'] as const) {
  test(`立即新增工種 → 左滑刪除：${trigger} 啟動後可刪除及復原`, async ({ page }) => {
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
    await expect(trade.locator('[data-daily-action="cancel-new-entry"]')).toHaveCount(0);
    await swipeTradeAway(page, trade);
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

for (const width of [360, 375, 430]) {
  test(`施工卡精簡：${width}px 空白卡高度、工項位置晶片、選單與進料入口`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 812 });
    const dialogs: string[] = [];
    page.on('dialog', async (dialog) => { dialogs.push(dialog.message()); await dialog.dismiss(); });
    await page.goto('/#daily');
    const action = (name: string) => page.locator(`[data-daily-action="${name}"]`);
    await action('add-trade').click();
    await page.locator('[data-trade-picker-search]').fill('精簡測試工種');
    await action('create-trade-from-search').click();
    const trade = page.locator('[data-trade]');
    await expect(trade).toHaveCount(1);
    const height = (await trade.boundingBox())!.height;
    console.log(`empty-trade-card-height@${width}=${Math.round(height)}`);
    info.annotations.push({ type: 'empty-card-height', description: String(Math.round(height)) });
    expect(height).toBeLessThanOrEqual(450);
    await expect(trade).not.toContainText('請確認廠商');
    await expect(trade).not.toContainText('整列左滑刪除');
    await expect(trade).not.toContainText('取消新增');
    await expect(trade).not.toContainText('完成並新增');
    await expect(trade.locator('.work-material-details, .linked-material-line')).toHaveCount(0);
    await expect(trade.locator('.action-row button')).toHaveCount(1);
    await expect(trade.locator('.action-row button')).toHaveText('完成');

    await trade.locator('[data-continuous-work]').fill('鋼筋綁紮');
    await trade.locator('[data-work-commit]').click();
    const chip = trade.locator('.work-location-chip');
    await expect(chip).toHaveText('＋位置');
    const box = (await chip.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
    await chip.click();
    const panel = trade.locator('[data-work-panel="location"]');
    await expect(panel).toBeVisible();
    const startField = panel.locator('[data-daily-field="startFloorRaw"]');
    const locationField = panel.locator('[data-daily-field="locationTextSnapshot"]');
    await startField.pressSequentially('3F');
    await locationField.click();
    await expect(panel).toBeVisible();
    await expect(startField).toHaveValue('3FL');
    await locationField.pressSequentially('東側');
    // 等背景儲存完成後，面板仍須開著、欄位值與焦點不變。
    await expect(page.locator('[data-save-status]')).toHaveAttribute('data-state', 'saved');
    await page.waitForTimeout(1200);
    await expect(panel).toBeVisible();
    await expect(locationField).toBeFocused();
    await expect(locationField).toHaveValue('東側');
    await expect(startField).toHaveValue('3FL');
    await expect(chip).toHaveText('3FL・東側');
    await panel.locator('[data-work-detail="close"]').click();
    await expect(panel).toBeHidden();
    await expect(chip).toHaveText('3FL・東側');
    const saved = await page.evaluate(async () => {
      const path = '/src/app/state.ts';
      const { appState } = await import(/* @vite-ignore */ path);
      const work = appState.daily.report.tradeSections[0].workItems[0];
      return [work.startFloorRaw, work.locationTextSnapshot];
    });
    expect(saved).toEqual(['3FL', '東側']);
    await expect(trade.locator('[data-work-detail="location"]')).toHaveCount(1);
    await expect(chip).toHaveAttribute('aria-expanded', 'false');

    await trade.locator('[data-work-gesture]').click();
    const menu = trade.locator('.work-token__tools');
    await expect(menu).toBeVisible();
    await expect(menu).not.toContainText('位置／樓層');
    for (const label of ['備註', '移除位置與備註', '上移', '下移', '刪除工項']) await expect(menu).toContainText(label);
    await page.keyboard.press('Escape');

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const small = await trade.locator('button, input').evaluateAll((els) => els.filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 44; }).map((el) => el.outerHTML.slice(0, 80)));
    expect(small).toEqual([]);
    expect(dialogs).toEqual([]);
    await trade.screenshot({ path: info.outputPath(`trade-card-compact-${width}.png`) });
  });
}

// 真實滑鼠驗證握把、預覽、插槽、保存與儲存失敗還原。
test('Work grip drag sorting and rollback', async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/#daily');
  await page.locator('[data-daily-action="add-trade"]').click();
  await page.locator('[data-trade-picker-search]').fill('Drag test trade');
  await page.locator('[data-daily-action="create-trade-from-search"]').click();
  for (const text of ['Work A', 'Work B', 'Work C']) {
    await page.locator('[data-continuous-work]').fill(text);
    await page.locator('[data-work-commit]').click();
  }
  const rows = page.locator('[data-sortable-work]');
  const values = () => rows.locator('[data-inline-work]').evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value));
  await expect(rows).toHaveCount(3);
  await expect(page.locator('[data-save-status]')).toHaveAttribute('data-state', 'saved');
  const saved = await page.evaluate(async () => {
    const path = '/src/app/state.ts'; const { appState } = await import(/* @vite-ignore */ path);
    return JSON.stringify(appState.daily.report);
  });
  // 短按仍開選單。
  await rows.first().locator('[data-work-gesture]').click();
  await expect(rows.first().locator('.work-token__tools')).toBeVisible();
  await rows.first().locator('[data-work-gesture]').click();
  const begin = async () => {
    await rows.first().locator('[data-work-gesture]').scrollIntoViewIfNeeded();
    const r = (await rows.first().locator('[data-work-gesture]').boundingBox())!;
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    await page.mouse.move(x, y); await page.mouse.down();
    await page.mouse.move(x, y + 5);
    await expect(page.locator('.work-item-drag-preview')).toHaveCount(0);
    await page.mouse.move(x, y + 6);
    await expect(page.locator('.work-item-drag-preview')).toHaveCount(1);
    return { x, y };
  };
  const first = await begin();
  const preview = page.locator('.work-item-drag-preview');
  await expect(page.locator('.work-item--drag-placeholder')).toHaveAttribute('aria-hidden', 'true');
  expect(await preview.locator('[id], [data-work], [data-work-gesture], [data-inline-work]').count()).toBe(0);
  expect(await preview.locator('input,button').evaluateAll((els) => els.every((el) => (el as HTMLInputElement).disabled))).toBe(true);
  await expect(page.locator('.trade-drop-indicator')).toHaveCount(1);
  await page.screenshot({ path: info.outputPath('work-grip-drag-375.png') });
  await page.keyboard.press('Escape'); await page.mouse.up();
  expect(await values()).toEqual(['Work A', 'Work B', 'Work C']);
  expect(await page.evaluate(async () => { const path = '/src/app/state.ts'; const { appState } = await import(/* @vite-ignore */ path); return JSON.stringify(appState.daily.report); })).toBe(saved);
  // 原位放回不呼叫排序。
  await page.evaluate(async () => {
    const path = '/src/app/state.ts'; const { appState } = await import(/* @vite-ignore */ path);
    const original = appState.daily.reorderWorkItems.bind(appState.daily);
    (window as any).__workReorders = 0;
    appState.daily.reorderWorkItems = (...args: [string, number, number]) => { (window as any).__workReorders++; return original(...args); };
  });
  await begin(); await page.mouse.up();
  expect(await page.evaluate(() => (window as any).__workReorders)).toBe(0);
  await begin();
  const last = (await rows.last().boundingBox())!;
  await page.mouse.move(first.x, last.y + last.height - 2, { steps: 8 });
  await page.mouse.up();
  await expect.poll(values).toEqual(['Work B', 'Work C', 'Work A']);
  await expect(page.locator('[data-save-status]')).toHaveAttribute('data-state', 'saved');
  await page.reload();
  await page.locator('[data-daily-action="toggle-trade"]').click();
  await expect.poll(values).toEqual(['Work B', 'Work C', 'Work A']);
  // 注入一次儲存失敗，還原原始順序。
  await page.evaluate(async () => {
    const path = '/src/app/state.ts'; const { appState } = await import(/* @vite-ignore */ path);
    const flush = appState.daily.flush.bind(appState.daily); let fail = true;
    appState.daily.flush = async () => { if (fail) { fail = false; throw new Error('測試儲存失敗'); } return flush(); };
  });
  const message = page.waitForEvent('dialog');
  await begin(); const end = (await rows.last().boundingBox())!;
  await page.mouse.move(first.x, end.y + end.height - 2, { steps: 8 }); await page.mouse.up();
  const dialog = await message; expect(dialog.message()).toContain('\u5df2\u6062\u5fa9\u539f\u9806\u5e8f'); await dialog.accept();
  await expect.poll(values).toEqual(['Work B', 'Work C', 'Work A']);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('Touch grip delay, scroll handoff and contact item sorting', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/#daily');
  await page.locator('[data-daily-action="add-contact"]').click();
  await page.locator('[data-trade-picker-search]').fill('Contact drag test');
  await page.locator('[data-daily-action="create-trade-from-search"]').click();
  for (const text of ['Contact A', 'Contact B', 'Contact C']) {
    await page.locator('[data-contact-field="task"]').fill(text);
    await page.locator('[data-daily-action="contact-add-task"]').click();
  }
  const rows = page.locator('[data-contact-task]');
  const values = () => rows.locator('[data-contact-task-content]').evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value));
  await expect(rows).toHaveCount(3);
  await rows.first().locator('[data-contact-gesture]').scrollIntoViewIfNeeded();
  await page.evaluate(() => { (window as any).__vibrations = []; navigator.vibrate = (duration) => { (window as any).__vibrations.push(duration); return true; }; });
  await page.clock.install();
  const cdp = await page.context().newCDPSession(page);
  const point = async () => { const r = (await rows.first().locator('[data-contact-gesture]').boundingBox())!; return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; };
  let p = await point();
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', x = p.x, y = p.y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y }] });
  // 400ms 前達 8px，取消長按且不攔截原生 touchmove。
  await touch('touchStart'); await page.clock.fastForward(200);
  await touch('touchMove', p.x, p.y + 8); await page.clock.fastForward(250);
  await expect(page.locator('.work-item-drag-preview')).toHaveCount(0);
  expect(await page.evaluate(() => { const event = new TouchEvent('touchmove', { cancelable: true, bubbles: true }); document.dispatchEvent(event); return event.defaultPrevented; })).toBe(false);
  await touch('touchEnd');
  p = await point();
  await touch('touchStart'); await page.clock.fastForward(399);
  await expect(page.locator('.work-item-drag-preview')).toHaveCount(0);
  await page.clock.fastForward(1);
  await expect(page.locator('.work-item-drag-preview')).toHaveCount(1);
  expect(await page.evaluate(() => (window as any).__vibrations)).toEqual([10]);
  expect(await page.evaluate(() => { const event = new TouchEvent('touchmove', { cancelable: true, bubbles: true }); document.dispatchEvent(event); return event.defaultPrevented; })).toBe(true);
  await touch('touchCancel');
  await expect(page.locator('.work-item-drag-preview')).toHaveCount(0);
  expect(await values()).toEqual(['Contact A', 'Contact B', 'Contact C']);
  p = await point();
  await touch('touchStart'); await page.clock.fastForward(400);
  const last = (await rows.last().boundingBox())!;
  await touch('touchMove', p.x, last.y + last.height - 2); await touch('touchEnd');
  await expect.poll(values).toEqual(['Contact B', 'Contact C', 'Contact A']);
  await page.clock.resume();
  await page.reload();
  await expect.poll(values).toEqual(['Contact B', 'Contact C', 'Contact A']);
  // 聯絡草稿儲存失敗，還原順序並提示。
  await rows.first().locator('[data-contact-gesture]').scrollIntoViewIfNeeded();
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('test storage failure'); }; });
  const grip = (await rows.first().locator('[data-contact-gesture]').boundingBox())!;
  await page.mouse.move(grip.x + 10, grip.y + 10); await page.mouse.down();
  await page.mouse.move(grip.x + 10, grip.y + 16);
  const end = (await rows.last().boundingBox())!;
  await page.mouse.move(grip.x + 10, end.y + end.height - 2);
  const message = page.waitForEvent('dialog'); const release = page.mouse.up();
  const dialog = await message; expect(dialog.message()).toContain('已恢復原順序'); await dialog.accept();
  await release;
  await expect.poll(values).toEqual(['Contact B', 'Contact C', 'Contact A']);
});
