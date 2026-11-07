import { expect, type Locator, type Page } from '@playwright/test';
import { contacts, trades, type Scenario } from '../fixtures/daily-scenarios';
import type { datesFor } from './report-date';
import { Metrics } from './metrics';

export class DailyUI {
  constructor(readonly page: Page, readonly metrics: Metrics) {}
  action(name: string) { return this.page.locator(`[data-daily-action="${name}"]`); }
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
  async chooseNewTrade(name: string) {
    await expect(this.page.getByRole('dialog')).toBeVisible();
    await this.type(this.page.locator('[data-trade-picker-search]'), name, '工種名稱');
    await this.click(this.action('create-trade-from-search'), `新增工種：${name}`);
    await expect(this.page.getByRole('dialog')).toHaveCount(0);
  }
  async tab(name: string) {
    const tab = this.page.locator(`[data-daily-tab="${name}"]`);
    await this.click(tab, `切換：${name}`);
    await expect(tab).toHaveAttribute('aria-selected', 'true');
  }

  async fill(scenario: Scenario, dates: ReturnType<typeof datesFor>) {
    await expect(this.page.locator('.workspace-site')).toContainText('本機工作區');
    await expect(this.page.locator('[data-daily-field="date"]')).toHaveValue(dates.reportISO);
    await expect(this.page.locator('[data-site-search]')).toHaveValue('');
    await expect(this.page.locator('[data-trade]')).toHaveCount(0);
    await expect(this.page.locator('[data-daily-action="toggle-preview"]')).toContainText('0 筆施工 · 0 人 · 0 筆聯絡');
    await this.metrics.sample('empty');
    await this.type(this.page.locator('[data-site-search]'), '鑫天地六期', '工地');
    await this.click(this.page.locator('[data-site-search-action="create"]'), '新增並使用工地');
    await expect(this.page.locator('#site-search-suggestions')).toHaveCount(0);
    const tradeIds: string[] = [];
    for (const [index, trade] of trades.entries()) {
      await this.click(this.action('add-trade'), '新增施工紀錄');
      await this.chooseNewTrade(trade.name);
      await expect(this.page.locator('[data-trade]')).toHaveCount(index + 1);
      const card = this.page.locator('[data-trade]').last();
      const id = await card.getAttribute('data-trade');
      if (!id) throw new Error('新增工程沒有識別碼');
      tradeIds.push(id);
      await this.type(card.locator('[data-daily-field="vendorNameSnapshot"]'), trade.vendor, `${trade.name}廠商`);
      await this.type(card.locator('[data-daily-field="workerCount"]'), trade.workers, `${trade.name}人數`);
      for (const [taskIndex, task] of trade.tasks.entries()) {
        await this.type(card.locator('[data-continuous-work]'), task, `${trade.name}工項${taskIndex + 1}`);
        await this.click(card.locator('[data-work-commit]'), '加入施工工項');
        await expect(card.locator('[data-inline-work]')).toHaveCount(taskIndex + 1);
        await expect(card.locator('[data-inline-work]').last()).toHaveValue(task);
      }
      if (index === 0) await this.metrics.sample('engineering');
      if (trade.tasks.length > 1) await this.metrics.sample('long-work');
      await this.click(card.locator('[data-daily-action="finish-entry"]'), `完成：${trade.name}`);
      await expect(card.locator('[data-daily-action="toggle-trade"]')).toBeVisible();
      await expect(card).toContainText('資料齊全');
    }
    await this.tab('supplies');
    const materialIds: string[] = [];
    for (const [index, material] of scenario.materials.entries()) {
      await this.click(this.action('add-normal-material'), '新增進料');
      const field = (name: string) => this.page.locator(`[data-material-field="${name}"]`);
      await this.type(field('materialTypeSnapshot'), '鋼筋', '材料類型');
      // Tab commits the type and triggers a full render; wait for that exact old DOM to detach.
      const oldType = await field('materialTypeSnapshot').elementHandle();
      await this.key(field('materialTypeSnapshot'), 'Tab', '提交材料類型');
      await expect.poll(() => oldType!.evaluate((element) => element.isConnected)).toBe(false);
      await this.type(field('itemName'), material.name, '進料品名');
      await this.key(field('itemName'), 'Tab', '提交品名');
      await this.type(field('supplierNameSnapshot'), '萬大禾', '供應商');
      await this.type(field('quantity'), material.quantity, '進料數量');
      await this.type(field('unit'), '噸', '單位');
      await expect(field('itemName')).toHaveValue(material.name);
      await expect(field('supplierNameSnapshot')).toHaveValue('萬大禾');
      await expect(field('quantity')).toHaveValue(material.quantity);
      if (index === 0) await this.metrics.sample('material-editor');
      await this.click(this.action('save-material'), '儲存進料');
      await expect(this.page.locator('[data-material-editor]')).toHaveCount(0);
      const cards = this.page.locator('.material-list [data-material]');
      await expect(cards).toHaveCount(index + 1);
      const saved = cards.last();
      await expect(saved).toContainText(material.name);
      await expect(saved).toContainText(`${material.quantity} 噸`);
      const id = await saved.getAttribute('data-material');
      if (!id) throw new Error('儲存進料沒有識別碼');
      materialIds.push(id);
    }
    for (const id of materialIds) {
      const source = this.page.locator(`[data-daily-action="select-connection-material"][data-material-id="${id}"]`);
      await this.click(source, '選取進料端口');
      await expect(source).toHaveAttribute('aria-pressed', 'true');
      await this.click(this.page.locator(`[data-daily-action="select-connection-trade"][data-trade-id="${tradeIds[0]}"]`), '連接紮筋工程');
      await expect(source).toContainText('已接至 紮筋工程');
    }
    await this.metrics.sample('connection-board');
    await this.tab('engineering');
    const steel = this.page.locator(`[data-trade="${tradeIds[0]}"]`);
    await this.click(steel.locator('[data-daily-action="toggle-trade"]'), '確認紮筋工程');
    await this.click(steel.locator('[data-daily-action="finish-entry"]'), '完成已連接進料的紮筋工程');
    await expect(steel).toContainText('資料齊全');
    await this.tab('contacts');
    for (const [index, contact] of contacts.entries()) {
      await this.click(this.action('add-contact'), '新增聯絡事項');
      await this.chooseNewTrade(contact.trade);
      await this.type(this.page.locator('#contact-vendor'), contact.vendor, '聯絡廠商');
      await this.metrics.action('input', '聯絡預定日期（原生 date）', dates.contactISO, () => this.page.locator('[data-contact-date]').fill(dates.contactISO));
      await this.type(this.page.locator('#contact-task'), contact.task, '聯絡工項');
      await this.click(this.action('contact-add-task'), '加入聯絡工項');
      await expect(this.page.locator('[data-contact-task]')).toHaveCount(1);
      if (index === 0) await this.metrics.sample('contact-editor');
      await this.click(this.action('save-contact'), '完成聯絡事項');
      await expect(this.page.locator('#contact-task')).toHaveCount(0);
      await expect(this.page.locator('[data-contact-card]')).toHaveCount(index + 1);
    }
    await this.click(this.action('toggle-preview'), '檢查與預覽');
    await expect(this.action('finalize')).toBeEnabled();
    await this.metrics.sample('preview');
  }
}
