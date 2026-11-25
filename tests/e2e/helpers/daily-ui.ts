import { expect, type Locator, type Page } from '@playwright/test';
import type { Scenario } from '../fixtures/daily-scenarios';
import { shiftISO, type datesFor } from './report-date';
import { Metrics } from './metrics';

export class DailyUI {
  constructor(readonly page: Page, readonly metrics: Metrics) {}
  action(name: string) { return this.page.locator(`[data-daily-action="${name}"]:visible`); }
  async click(locator: Locator, label: string) {
    await this.metrics.action('click', label, undefined, () => locator.click());
  }
  async key(locator: Locator, key: string, label: string) {
    await this.metrics.action('key', label, key, () => locator.press(key));
  }
  async type(locator: Locator, value: string, label: string) {
    await this.click(locator, `聚焦：${label}`);
    await expect(locator).toBeFocused();
    if (await locator.inputValue()) {
      await this.key(locator, 'ControlOrMeta+A', `全選：${label}`);
      await this.key(locator, 'Backspace', `清空：${label}`);
      await expect(locator).toHaveValue('');
    }
    await this.metrics.action('input', label, value, async () => {
      let prefix = '';
      // Resolve the locator again for every character: site search replaces its DOM.
      for (const character of value) {
        await locator.pressSequentially(character);
        prefix += character;
        await expect(locator).toHaveValue(prefix);
      }
    });
  }
  /** Picks the trade if it already exists (e.g. a second vendor of 雜工工程), otherwise creates it. */
  async chooseTrade(name: string) {
    // Editors open in their own sheets once a trade is chosen; only the picker holds this combobox.
    const dialog = this.page.getByRole('dialog').filter({ has: this.page.getByRole('combobox', { name: '選擇工種', exact: true }) });
    await expect(dialog).toBeVisible();
    await this.type(this.page.getByRole('combobox', { name: '選擇工種', exact: true }), name, '工種名稱');
    await this.click(this.page.getByRole('option', { name, exact: true }), `選用工種：${name}`);
    await expect(dialog).not.toBeVisible();
  }
  async section(name: 'engineering' | 'supplies' | 'contacts' | 'special') {
    const labels = { engineering: '施工紀錄', supplies: '進料', contacts: '聯絡事項', special: '特殊事項' };
    await this.page.locator(`.daily-section[aria-label="${labels[name]}"]`).scrollIntoViewIfNeeded();
  }

  async fill(scenario: Scenario, dates: ReturnType<typeof datesFor>) {
    await expect(this.page.locator('.daily-context')).toContainText('本機工作區');
    await expect(this.page.getByLabel('日報日期', { exact: true })).toHaveValue(dates.reportISO);
    await expect(this.page.getByRole('combobox', { name: '工地名稱' })).toHaveValue('');
    await expect(this.page.locator('[data-trade]')).toHaveCount(0);
    await expect(this.page.getByLabel('日報檢查與複製', { exact: true })).toContainText('0 筆施工 · 0 人 · 0 筆聯絡');
    await this.metrics.sample('empty');
    await this.type(this.page.getByRole('combobox', { name: '工地名稱' }), '鑫天地六期', '工地');
    await this.click(this.page.getByRole('option', { name: '鑫天地六期', exact: true }), '新增並使用工地');
    await expect(this.page.locator('#site-search-suggestions')).toHaveCount(0);
    const tradeIds: string[] = [];
    let longWorkSampled = false;
    for (const [index, trade] of scenario.trades.entries()) {
      const label = `${trade.name}（${trade.vendor}）`;
      await this.click(this.action('add-trade'), '新增施工紀錄');
      await this.chooseTrade(trade.name);
      await expect(this.page.locator('[data-trade]')).toHaveCount(index + 1);
      const row = this.page.locator('[data-trade]').last();
      const id = await row.getAttribute('data-trade');
      if (!id) throw new Error('新增工程沒有識別碼');
      tradeIds.push(id);
      // The editor lives in the trade sheet; the list row only carries the summary.
      const card = this.page.locator(`[data-trade-editor="${id}"]`);
      await this.type(card.locator('[data-daily-field="vendorNameSnapshot"]'), trade.vendor, `${label}廠商`);
      await this.type(card.locator('[data-daily-field="workerCount"]'), trade.workers, `${label}人數`);
      for (const [taskIndex, task] of trade.tasks.entries()) {
        const composer = card.getByRole('combobox', { name: '搜尋或輸入下一個工項' });
        await this.type(composer, task, `${label}工項${taskIndex + 1}`);
        // In the sheet the suggestion list opens over the add button; close it so the button itself is pressed.
        if ((await composer.getAttribute('aria-expanded')) === 'true') await this.key(composer, 'Escape', '關閉建議清單');
        await this.click(card.locator('[data-work-commit]'), '加入施工工項');
        await expect(card.locator('[data-inline-work]')).toHaveCount(taskIndex + 1);
        await expect(card.locator('[data-inline-work]').last()).toHaveValue(task);
      }
      if (index === 0) await this.metrics.sample('engineering');
      if (trade.tasks.length > 1 && !longWorkSampled) { longWorkSampled = true; await this.metrics.sample('long-work'); }
      await this.click(this.action('finish-entry'), `完成：${label}`);
      await expect(row).toBeVisible();
      await expect(row).toContainText('資料齊全');
    }
    if (scenario.materials.length) {
      await this.section('supplies');
      const materialIds: string[] = [];
      for (const [index, material] of scenario.materials.entries()) {
        await this.click(this.action('add-normal-material'), '新增進料');
        const labels: Record<string, string> = { materialTypeSnapshot: '材料類型', itemName: '品名', specification: '規格', supplierNameSnapshot: '供應商', quantity: '數量', unit: '單位' };
        const field = (name: string) => this.page.getByRole(name === 'quantity' ? 'textbox' : 'combobox', { name: labels[name], exact: true, includeHidden: true });
        await this.type(field('materialTypeSnapshot'), material.type, '材料類型');
        await this.key(field('materialTypeSnapshot'), 'Tab', '提交材料類型');
        await this.type(field('itemName'), material.name, '進料品名');
        await this.key(field('itemName'), 'Tab', '提交品名');
        if (material.spec) { await this.type(field('specification'), material.spec, '規格'); await this.key(field('specification'), 'Tab', '提交規格'); }
        await this.type(field('supplierNameSnapshot'), material.supplier, '供應商');
        await this.type(field('quantity'), material.quantity, '進料數量');
        await this.type(field('unit'), material.unit, '單位');
        await expect(field('itemName')).toHaveValue(material.name);
        await expect(field('supplierNameSnapshot')).toHaveValue(material.supplier);
        await expect(field('quantity')).toHaveValue(material.quantity);
        if (index === 0) await this.metrics.sample('material-editor');
        await this.click(this.action('save-material'), '儲存進料');
        await expect(this.page.locator('[data-material-editor]')).toHaveCount(0);
        const cards = this.page.locator('[data-material]');
        await expect(cards).toHaveCount(index + 1);
        const saved = cards.last();
        await expect(saved).toContainText(material.name);
        await expect(saved).toContainText(`${material.quantity} ${material.unit}`);
        const id = await saved.getAttribute('data-material');
        if (!id) throw new Error('儲存進料沒有識別碼');
        materialIds.push(id);
      }
      for (const [index, id] of materialIds.entries()) {
        const target = scenario.trades[scenario.materials[index].trade];
        await this.click(this.page.locator(`[data-material="${id}"]`), '編輯進料連接');
        const source = this.page.getByRole('combobox', { name: '連接工種' });
        await this.click(source, '選擇連接工種');
        await this.click(this.page.getByRole('option', { name: `${target.name}｜${target.vendor}`, exact: true }), `連接${target.name}`);
        await expect(source).toContainText(target.name);
        await this.click(this.action('save-material'), '儲存已連接進料');
        await expect(this.page.locator('[data-material-editor]')).toHaveCount(0);
        await expect(this.page.locator(`[data-material="${id}"]`)).toContainText(`已連接：${target.name}｜${target.vendor}`);
      }
      await this.metrics.sample('connection-board');
      await this.section('engineering');
      // Connecting returns the receiving trade to draft; confirm each one again.
      for (const tradeIndex of new Set(scenario.materials.map((material) => material.trade))) {
        const trade = this.page.locator(`[data-trade="${tradeIds[tradeIndex]}"]`);
        await this.click(trade, `確認${scenario.trades[tradeIndex].name}`);
        await this.click(this.action('finish-entry'), `完成已連接進料的${scenario.trades[tradeIndex].name}`);
        await expect(trade).toContainText('資料齊全');
      }
    }
    if (scenario.contacts.length) {
      await this.section('contacts');
      for (const [index, contact] of scenario.contacts.entries()) {
        await this.click(this.action('add-contact'), '新增聯絡事項');
        await this.chooseTrade(contact.trade);
        await this.type(this.page.getByRole('combobox', { name: '聯絡廠商' }), contact.vendor, '聯絡廠商');
        if (contact.dateOffset !== undefined) {
          const planned = shiftISO(dates.reportISO, contact.dateOffset);
          await this.metrics.action('input', '聯絡預定日期（原生 date）', planned, () => this.page.getByLabel('聯絡預定日期', { exact: true }).fill(planned));
        }
        for (const [taskIndex, task] of contact.tasks.entries()) {
          await this.type(this.page.getByRole('combobox', { name: '聯絡工項' }), task, `聯絡工項${taskIndex + 1}`);
          await this.click(this.action('contact-add-task'), '加入聯絡工項');
          await expect(this.page.getByRole('textbox', { name: '聯絡內容', exact: true })).toHaveCount(taskIndex + 1);
        }
        if (index === 0) await this.metrics.sample('contact-editor');
        await this.click(this.action('save-contact'), '完成聯絡事項');
        await expect(this.page.getByRole('combobox', { name: '聯絡工項' })).toHaveCount(0);
        await expect(this.page.locator('[data-contact-card]')).toHaveCount(index + 1);
      }
    }
    await this.click(this.action('toggle-preview'), '檢查與預覽');
    await expect(this.action('finalize')).toBeEnabled();
    await this.metrics.sample('preview');
  }
}

/** Opens a work item's menu and picks one entry (the item actions live behind the 工項選項 button). */
export async function pickWorkMenu(page: Page, name: '位置、樓層與備註' | '刪除工項') {
  await page.getByRole('button', { name: '工項選項', exact: true }).first().click();
  await page.getByRole('menuitem', { name, exact: true }).click();
}
