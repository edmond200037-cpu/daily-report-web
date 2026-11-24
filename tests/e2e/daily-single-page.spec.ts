import { test, expect, type Page, type Locator } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const action = (page: Page, name: string) =>
  page.locator(`[data-react-action="${name}"]`).first();
async function setup(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.setFixedTime(new Date('2026-11-24T04:00:00Z'));
  await page.goto('/#daily');
  await expect(page.getByRole('heading', { name: '常用工種' })).toBeVisible();
  await page.evaluate(async () => {
    const repo = await import(/* @vite-ignore */ String('/src/data/daily-repository.ts'));
    await repo.saveMemory('trades', '模板工程');
    const trade = (await repo.listMemories('trades'))[0];
    await repo.saveMemory('vendors', '大成營造', trade.id);
    await repo.saveMemory('tasks', '柱模組立', trade.id);
    await repo.saveMemory('tasks', '樓板模', trade.id);
    await repo.saveLocationMemory('東側', '3F', '5F');
    await repo.createMaterialType('鋼筋');
    const type = (await repo.listMaterialTypes())[0];
    const domain = await import(/* @vite-ignore */ String('/src/domain/daily.ts'));
    const report = domain.createDailyDraft(null, '記憶測試', '2026-11-24');
    const material = domain.createMaterialEntry(0);
    Object.assign(material, {
      materialTypeId: type.id,
      materialTypeSnapshot: '鋼筋',
      itemName: '鋼筋',
      specification: '#5',
      supplierNameSnapshot: '永豐鋼鐵',
      quantity: '1',
      unit: '噸',
    });
    report.standaloneMaterialEntries.push(material);
    const applications = await import(
      /* @vite-ignore */ String('/src/settings/memory-applications.ts')
    );
    await applications.recordMemoryApplications(report);
    await repo.confirmMemoryCandidates(
      (await repo.listMemoryCandidates()).map((row: { key: string }) => row.key),
    );
    await (
      await import(/* @vite-ignore */ String('/src/app/sync-runtime.ts'))
    ).refreshActiveMemoryCache();
    (await import(/* @vite-ignore */ String('/src/daily/react/runtime.ts'))).dailyUi.refresh();
  });
}
async function addTrade(page: Page) {
  await page.locator('[data-trade-chip]').click();
  const row = page.locator('[data-trade]');
  await expect(row).toHaveCount(1);
  return row;
}
async function swipe(page: Page, row: Locator, dx = -90, dy = 0) {
  const target = row.locator('.trade-row-summary__toggle').first();
  await target.scrollIntoViewIfNeeded();
  const b = (await target.boundingBox())!;
  await page.mouse.move(b.x + b.width - 12, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width - 12 + dx, b.y + b.height / 2 + dy, {
    steps: 10,
  });
  await page.mouse.up();
}
async function snapshotReport(page: Page) {
  return page.evaluate(async () =>
    JSON.stringify(
      (await import(/* @vite-ignore */ String('/src/app/state.ts'))).appState.daily.report,
    ),
  );
}

for (const width of [360, 390, 430])
  test(`手機${width}：晶片、人數、建議、位置、焦點與水平範圍`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await setup(page);
    const row = await addTrade(page);
    await expect(row).toContainText('大成營造');
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('INPUT');
    await row.getByRole('button', { name: '增加人數', exact: true }).click();
    await row.getByRole('button', { name: '增加人數', exact: true }).click();
    await row.getByRole('button', { name: '減少人數', exact: true }).click();
    await expect(row.getByRole('textbox', { name: '人數', exact: true })).toHaveValue('1');
    await row.locator('[data-task-chip]').filter({ hasText: '柱模組立' }).click();
    await expect(row.locator('[data-work]')).toHaveCount(1);
    const composer = row.getByRole('textbox', { name: '搜尋或輸入下一個工項' });
    await composer.fill('樓');
    await expect(composer).toBeFocused();
    await expect(composer).toHaveValue('樓');
    await row.getByRole('button', { name: '樓板模', exact: true }).click();
    await expect(row.locator('[data-work]')).toHaveCount(2);
    const first = row.locator('[data-work]').first();
    await first.getByRole('button', { name: '工項 1 位置與樓層' }).click();
    await first.getByRole('button', { name: '東側', exact: true }).click();
    await expect(first.getByRole('textbox', { name: '起始樓層' })).toHaveValue('3FL');
    await expect(first.getByRole('textbox', { name: '結束樓層' })).toHaveValue('5FL');
    await first.getByRole('textbox', { name: '位置', exact: true }).fill('西側');
    await expect(first.getByRole('textbox', { name: '位置', exact: true })).toBeFocused();
    await expect(page.locator('[data-save-status]')).toHaveAttribute('data-state', 'saved');
    await first.getByRole('button', { name: '返回工項' }).click();
    await expect(first.getByRole('button', { name: '工項 1 位置與樓層' })).toContainText(
      '西側',
    );
    const sizes = await page
      .locator('#react-shell button,#react-shell nav a[href],#react-shell input')
      .evaluateAll((els) =>
        els
          .filter((e) => e.getClientRects().length)
          .map((e) => ({
            label: e.getAttribute('aria-label') ?? e.textContent?.slice(0, 40),
            height: (
              e.closest('.astryx-text-input,.astryx-selector') ?? e
            ).getBoundingClientRect().height,
          })),
      );
    expect(sizes.filter((item) => item.height < 44)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });

test('IME 組字及229的Enter不加入、不替換輸入節點，確認後Enter才加入', async ({ page }) => {
  await setup(page);
  const row = await addTrade(page);
  const input = row.getByRole('textbox', { name: '搜尋或輸入下一個工項' });
  await input.focus();
  const handle = await input.elementHandle();
  await input.dispatchEvent('compositionstart');
  await input.fill('柱筋');
  await input.dispatchEvent('keydown', {
    key: 'Enter',
    code: 'Enter',
    keyCode: 229,
    isComposing: true,
  });
  await expect(row.locator('[data-work]')).toHaveCount(0);
  expect(await handle!.evaluate((el) => el.isConnected)).toBe(true);
  await input.dispatchEvent('compositionend', { data: '柱筋' });
  await input.dispatchEvent('keydown', { key: 'Enter', keyCode: 229 });
  await expect(row.locator('[data-work]')).toHaveCount(0);
  await input.press('Enter');
  await expect(row.locator('[data-work]')).toHaveCount(1);
  await expect(input).toBeFocused();
});

test('進料晶片預填、數量、單一連接與原子化解除', async ({ page }) => {
  await setup(page);
  const trade = await addTrade(page);
  await page.locator('[data-material-chip]').click();
  const editor = page.locator('[data-material-editor]');
  await expect(editor.getByRole('textbox')).toHaveCount(1);
  await editor.getByRole('button', { name: '編輯材料資料' }).click();
  for (const [label, value] of [
    ['品名', '鋼筋'],
    ['規格（選填）', '#5'],
    ['單位', '噸'],
    ['供應商', '永豐鋼鐵'],
  ])
    await expect(editor.getByRole('textbox', { name: label, exact: true })).toHaveValue(value);
  await editor.getByRole('textbox', { name: /^數量(?:（.*）)?$/ }).fill('12');
  await action(page, 'save-material').click();
  await expect(editor).toHaveCount(0);
  const material = page.locator('[data-material]');
  await expect(material.getByRole('textbox')).toHaveValue('12');
  await material.getByRole('combobox', { name: '連接施工工種' }).click();
  await page.getByRole('option', { name: '模板工程 · 大成營造', exact: true }).click();
  await expect(material).toContainText('已連接');
  await material.getByRole('combobox', { name: '連接施工工種' }).click();
  await page.getByRole('option', { name: '普通進料（不連接）', exact: true }).click();
  const connection = await page.evaluate(async () => {
    const m = (await import(/* @vite-ignore */ String('/src/app/state.ts'))).appState.daily
      .report.standaloneMaterialEntries[0];
    return [m.entryType, m.connectedTradeSectionId];
  });
  expect(connection).toEqual(['normal', null]);
  await expect(trade).toHaveCount(1);
});

test('左滑不足72或垂直為主不刪除，達門檻後6秒可復原', async ({ page }) => {
  await setup(page);
  const row = await addTrade(page);
  await row.getByRole('button', { name: '增加人數', exact: true }).click();
  await row.getByRole('button', { name: '柱模組立', exact: true }).click();
  await action(page, 'keep-trade').click();
  await swipe(page, row, -60);
  await expect(row).toHaveCount(1);
  await swipe(page, row, -80, 95);
  await expect(row).toHaveCount(1);
  await swipe(page, row, -90);
  await expect(row).toHaveCount(0);
  await action(page, 'undo-trade-delete').click();
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('柱模組立');
  await swipe(page, row, -90);
  await expect(row).toHaveCount(0);
  await page.waitForTimeout(6100);
  await expect(action(page, 'undo-trade-delete')).toHaveCount(0);
});

test('搜尋新增支援點擊與Enter並可取消及復原，UI開關不寫資料', async ({ page }) => {
  await setup(page);
  const before = await snapshotReport(page);
  await action(page, 'toggle-basics').click();
  await action(page, 'toggle-basics').click();
  await action(page, 'add-trade').click();
  await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
  expect(await snapshotReport(page)).toBe(before);
  for (const trigger of ['click', 'Enter']) {
    await action(page, 'add-trade').click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: '搜尋工種名稱' }).fill('新增工種');
    const button = dialog.getByRole('button', {
      name: '立即新增工種「新增工種」',
    });
    if (trigger === 'click') await button.click();
    else await button.press('Enter');
    await expect(page.locator('[data-trade]')).toHaveCount(trigger === 'click' ? 1 : 2);
    await action(page, 'cancel-new-entry').click();
    await action(page, 'undo-trade-delete').click();
  }
});

test('工項握把排序、取消拖曳不保存，保存失敗還原', async ({ page }) => {
  await setup(page);
  const row = await addTrade(page);
  await row.getByRole('button', { name: '柱模組立', exact: true }).click();
  await row.getByRole('button', { name: '樓板模', exact: true }).click();
  const drag = async () => {
    const a = (await row.locator('[data-work-gesture]').first().boundingBox())!;
    const b = (await row.locator('[data-work]').last().boundingBox())!;
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(a.x + a.width / 2, b.y + b.height - 2, { steps: 8 });
  };
  const before = await snapshotReport(page);
  await drag();
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect(await snapshotReport(page)).toBe(before);
  await drag();
  await page.mouse.up();
  await expect(row.getByRole('textbox', { name: '工項 1', exact: true })).toHaveValue('樓板模');
  page.once('dialog', (dialog) => dialog.accept());
  await page.evaluate(async () => {
    const s = (await import(/* @vite-ignore */ String('/src/app/state.ts'))).appState;
    const original = s.daily.flush.bind(s.daily);
    let fail = true;
    s.daily.flush = async () => {
      if (fail) {
        fail = false;
        throw new Error('test-save-failure');
      }
      return original();
    };
  });
  await drag();
  await page.mouse.up();
  await expect(row.getByRole('textbox', { name: '工項 1', exact: true })).toHaveValue('樓板模');
});

test('日期、工地、設定返回、聯絡及特殊事項保留', async ({ page }) => {
  await setup(page);
  await action(page, 'add-special').click();
  await page.getByRole('textbox', { name: '特殊事項內容' }).fill('現場安全檢查');
  await action(page, 'toggle-basics').click();
  await page.getByLabel('日報日期', { exact: true }).fill('2026-11-25');
  await expect(action(page, 'cancel-new-entry')).toHaveCount(0);
  await action(page, 'toggle-basics').click();
  await page.getByLabel('日報日期', { exact: true }).fill('2026-11-24');
  await expect(page.getByRole('region', { name: '特殊事項', exact: true })).toContainText(
    '現場安全檢查',
  );
  await action(page, 'toggle-basics').click();
  await page.getByRole('textbox', { name: '搜尋或新增工地' }).fill('信義住宅');
  await page.getByRole('button', { name: '新增並使用「信義住宅」' }).click();
  await page
    .getByRole('navigation', { name: '主要功能' })
    .getByRole('link', { name: '設定', exact: true })
    .click();
  await expect(page.getByRole('link', { name: '返回日報' })).toBeVisible();
  await page.getByRole('link', { name: '返回日報' }).click();
  await expect(action(page, 'cancel-new-entry')).toHaveCount(0);
  await action(page, 'add-contact').click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /模板工程/ })
    .click();
  await page.getByRole('textbox', { name: '聯絡施工項目' }).fill('通知明日進場');
  await page.getByRole('button', { name: '加入聯絡工項' }).click();
  await action(page, 'save-contact').click();
  await expect(page.getByRole('region', { name: '聯絡事項', exact: true })).toContainText(
    '通知明日進場',
  );
});

for (const mode of ['light', 'dark'] as const)
  test(`390x844 ${mode}：空白施工進料預覽及舊水位截圖`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setup(page);
    await page.emulateMedia({ colorScheme: mode, reducedMotion: 'reduce' });
    await mkdir('artifacts/astryx-phase1', { recursive: true });
    await page.screenshot({
      path: `artifacts/astryx-phase1/daily-empty-${mode}.png`,
    });
    const row = await addTrade(page);
    await row.getByRole('textbox', { name: '人數', exact: true }).fill('12');
    await row.getByRole('button', { name: '柱模組立', exact: true }).click();
    await expect(page.locator('[data-save-status]')).toHaveAttribute('data-state', 'saved');
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: `artifacts/astryx-phase1/daily-trade-${mode}.png`,
    });
    await page.locator('[data-material-chip]').click();
    await page.getByRole('textbox', { name: /^數量(?:（.*）)?$/ }).fill('12');
    await action(page, 'save-material').click();
    await page.locator('[data-material]').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `artifacts/astryx-phase1/daily-material-${mode}.png`,
    });
    await action(page, 'toggle-preview').click();
    await page.screenshot({
      path: `artifacts/astryx-phase1/daily-preview-${mode}.png`,
    });
    await page.getByRole('button', { name: '關閉預覽' }).click();
    await page
      .getByRole('navigation', { name: '主要功能' })
      .getByRole('link', { name: '水位變化', exact: true })
      .click();
    await expect(page.getByRole('heading', { name: '新增量測紀錄' })).toBeVisible();
    await page.screenshot({
      path: `artifacts/astryx-phase1/legacy-water-${mode}.png`,
    });
  });

test('純UI操作與未提交文字不保存、不進入日報；重新展開保留暫存', async ({ page }) => {
  await setup(page);
  const row = await addTrade(page);
  await expect(page.locator('[data-save-status]')).toHaveAttribute('data-state', 'saved');
  const initial = await page.evaluate(async () => {
    const s = (await import(/* @vite-ignore */ String('/src/app/state.ts'))).appState;
    const calls = { flush: 0, update: 0 };
    const flush = s.daily.flush.bind(s.daily),
      update = s.daily.update.bind(s.daily);
    s.daily.flush = async () => {
      calls.flush++;
      return flush();
    };
    s.daily.update = (fn: () => void) => {
      calls.update++;
      return update(fn);
    };
    Object.assign(window, { __uiCalls: calls });
    return {
      report: JSON.stringify(s.daily.report),
      storage: JSON.stringify(localStorage),
    };
  });
  const input = row.getByRole('textbox', { name: '搜尋或輸入下一個工項' });
  await input.fill('未提交的工項');
  await action(page, 'keep-trade').click();
  await row.locator('.trade-row-summary__toggle').click();
  await expect(input).toHaveValue('未提交的工項');
  await action(page, 'toggle-basics').click();
  await action(page, 'toggle-basics').click();
  await action(page, 'toggle-preview').click();
  await page.getByRole('button', { name: '關閉預覽' }).click();
  const after = await page.evaluate(async () => ({
    report: JSON.stringify(
      (await import(/* @vite-ignore */ String('/src/app/state.ts'))).appState.daily.report,
    ),
    storage: JSON.stringify(localStorage),
    calls: (window as unknown as { __uiCalls: unknown }).__uiCalls,
  }));
  expect(after).toEqual({ ...initial, calls: { flush: 0, update: 0 } });
  await action(page, 'add-contact').click();
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('INPUT');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /模板工程/ })
    .click();
  await page.getByRole('textbox', { name: '聯絡施工項目' }).fill('未提交聯絡文字');
  expect(await page.evaluate(() => JSON.stringify(localStorage))).toBe(initial.storage);
  expect(await snapshotReport(page)).toBe(initial.report);
});

test('檢視者仍可展開與預覽，所有資料輸入禁用', async ({ page }) => {
  await setup(page);
  const row = await addTrade(page);
  await row.getByRole('button', { name: '增加人數', exact: true }).click();
  await page.getByRole('button', { name: '柱模組立', exact: true }).click();
  await expect(page.locator('[data-save-status]')).toHaveAttribute('data-state', 'saved');
  await page.evaluate(async () => {
    const s = (await import(/* @vite-ignore */ String('/src/app/state.ts'))).appState;
    s.accountActiveSiteId = 'read-only-test';
    s.accountActiveSiteRole = 'viewer';
    (await import(/* @vite-ignore */ String('/src/daily/react/runtime.ts'))).dailyUi.refresh();
  });
  const before = await snapshotReport(page);
  await expect(row.getByRole('textbox', { name: '人數', exact: true })).toBeDisabled();
  await expect(action(page, 'add-trade')).toBeDisabled();
  await expect(row.getByRole('button', { name: '增加人數', exact: true })).toBeDisabled();
  await action(page, 'toggle-preview').click();
  await expect(action(page, 'finalize')).toBeDisabled();
  await page.getByRole('button', { name: '關閉預覽' }).click();
  await row.locator('.trade-row-summary__toggle').click();
  await row.locator('.trade-row-summary__toggle').click();
  await swipe(page, row, -90);
  await expect(row).toHaveCount(1);
  expect(await snapshotReport(page)).toBe(before);
});

test('工項刪除與六秒復原、清空位置備註與原子復原', async ({ page }) => {
  await setup(page);
  const row = await addTrade(page);
  await row.getByRole('button', { name: '柱模組立', exact: true }).click();
  const work = row.locator('[data-work]');
  await work.getByRole('button', { name: '工項 1 位置與樓層' }).click();
  await work.getByRole('button', { name: '東側', exact: true }).click();
  await work.getByRole('button', { name: '返回工項' }).click();
  await expect(work.getByRole('textbox', { name: '工項 1', exact: true })).toBeFocused();
  await work.getByRole('button', { name: '移除位置與備註' }).click();
  await expect(work.getByRole('button', { name: '工項 1 位置與樓層' })).toContainText('＋位置');
  await page.getByRole('button', { name: '復原位置與備註' }).click();
  await expect(work.getByRole('button', { name: '工項 1 位置與樓層' })).toContainText(
    '3FL–5FL',
  );
  await work.getByRole('button', { name: '移除工項', exact: true }).click();
  await expect(work).toHaveCount(0);
  await page.getByRole('button', { name: '復原工項', exact: true }).click();
  await expect(work).toHaveCount(1);
  await expect(work.getByRole('button', { name: '工項 1 位置與樓層' })).toContainText('東側');
});

test('觸控握把400ms前不排序，長按後顯示固定預覽並排序', async ({ page, context }) => {
  await setup(page);
  const row = await addTrade(page);
  await row.getByRole('button', { name: '柱模組立', exact: true }).click();
  await row.getByRole('button', { name: '樓板模', exact: true }).click();
  await row.locator('[data-work-gesture]').first().scrollIntoViewIfNeeded();
  const grip = (await row.locator('[data-work-gesture]').first().boundingBox())!;
  const target = (await row.locator('[data-work]').last().boundingBox())!;
  const cdp = await context.newCDPSession(page);
  const point = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 };
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [point],
  });
  await page.waitForTimeout(200);
  await expect(page.locator('.work-item-drag-preview')).toHaveCount(0);
  await page.waitForTimeout(250);
  await expect(page.locator('.work-item-drag-preview')).toHaveCount(1);
  expect(
    await page
      .locator('.work-item-drag-preview')
      .evaluate((el) => getComputedStyle(el).position),
  ).toBe('fixed');
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: point.x, y: target.y + target.height - 5 }],
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await expect(row.getByRole('textbox', { name: '工項 1', exact: true })).toHaveValue('樓板模');
  await cdp.detach();
});

test('舊版未提交工項只回到輸入器，收合和完成不會暗中新增或重複', async ({ page }) => {
  await setup(page);
  const row = await addTrade(page);
  await row.getByRole('button', { name: '增加人數', exact: true }).click();
  await expect(page.locator('[data-save-status]')).toHaveAttribute('data-state', 'saved');
  await page.evaluate(async () => {
    const state = (await import(/* @vite-ignore */ String('/src/app/state.ts'))).appState;
    localStorage.setItem(
      state.entryScopeKey,
      JSON.stringify({
        contact: null,
        work: [[state.daily.report.tradeSections[0].id, '舊版未提交工項']],
      }),
    );
  });
  await page.reload();
  await page.locator('[data-trade] .trade-row-summary__toggle').click();
  const composer = page.getByRole('textbox', { name: '搜尋或輸入下一個工項' });
  await expect(composer).toHaveValue('舊版未提交工項');
  await expect(page.locator('[data-work]')).toHaveCount(0);
  await action(page, 'keep-trade').click();
  await expect(page.locator('[data-work]')).toHaveCount(0);
  await page.locator('[data-trade] .trade-row-summary__toggle').click();
  await page.getByRole('button', { name: '加入', exact: true }).click();
  await expect(page.locator('[data-work]')).toHaveCount(1);
  await action(page, 'finish-entry').click();
  await page.locator('[data-trade] .trade-row-summary__toggle').click();
  await expect(page.locator('[data-work]')).toHaveCount(1);
});

test('聯絡編輯收合保留草稿、沿用日期；刪除編輯中條目不留下可復活的表單', async ({ page }) => {
  await setup(page);
  await action(page, 'add-contact').click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /模板工程/ })
    .click();
  await page.getByLabel('預定日期（選填）', { exact: true }).fill('2026-11-25');
  await page.getByRole('textbox', { name: '聯絡施工項目' }).fill('通知進場');
  await page.getByRole('button', { name: '加入聯絡工項' }).click();
  await action(page, 'save-contact').click();
  const contacts = page.locator('[data-sortable-entry="contact"]');
  await contacts.first().locator('.trade-row-summary__toggle').click();
  await page.getByRole('textbox', { name: '聯絡廠商', exact: true }).fill('修改廠商');
  await contacts.first().locator('.trade-row-summary__toggle').click();
  await expect(page.getByRole('textbox', { name: '聯絡廠商', exact: true })).toHaveCount(0);
  await contacts.first().locator('.trade-row-summary__toggle').click();
  await expect(page.getByRole('textbox', { name: '聯絡廠商', exact: true })).toHaveValue(
    '修改廠商',
  );
  await action(page, 'save-contact-next').click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /模板工程/ })
    .click();
  await page.getByRole('button', { name: '沿用上筆 11/25', exact: true }).click();
  await expect(page.getByLabel('預定日期（選填）', { exact: true })).toHaveValue('2026-11-25');
  await page.getByRole('textbox', { name: '聯絡施工項目' }).fill('第二筆聯絡');
  await page.getByRole('button', { name: '加入聯絡工項' }).click();
  await action(page, 'save-contact').click();
  await expect(contacts).toHaveCount(2);
  await contacts.last().locator('.trade-row-summary__toggle').click();
  await swipe(page, contacts.last(), -90);
  await expect(contacts).toHaveCount(1);
  await expect(page.getByRole('textbox', { name: '聯絡施工項目' })).toHaveCount(0);
  await action(page, 'undo-trade-delete').click();
  await expect(contacts).toHaveCount(2);
});
