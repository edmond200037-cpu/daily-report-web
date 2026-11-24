import { expect, type Locator, type Page } from '@playwright/test';
import type { Scenario } from '../fixtures/daily-scenarios';
import { shiftISO, type datesFor } from './report-date';
import { Metrics } from './metrics';

export class DailyUI {
  constructor(
    readonly page: Page,
    readonly metrics: Metrics,
  ) {}
  action(name: string) {
    return this.page.locator(`[data-react-action="${name}"]`).first();
  }
  async click(locator: Locator, label: string) {
    await this.metrics.action('click', label, undefined, () => locator.click());
  }
  async key(locator: Locator, key: string, label: string) {
    await this.metrics.action('key', label, key, () => locator.press(key));
  }
  async type(locator: Locator, value: string, label: string) {
    await this.metrics.action('input', label, value, () => locator.fill(value));
    await expect(locator).toHaveValue(value);
  }
  async chooseTrade(name: string) {
    const dialog = this.page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const search = dialog.getByRole('textbox', { name: '搜尋工種名稱' });
    await this.type(search, name, '工種名稱');
    const create = dialog.getByRole('button', {
      name: `立即新增工種「${name}」`,
      exact: true,
    });
    if (await create.isVisible()) await this.click(create, '新增工種');
    else await this.click(dialog.getByRole('button', { name, exact: true }), '選用工種');
    await expect(dialog).toHaveCount(0);
  }
  async section(name: 'engineering' | 'supplies' | 'contacts' | 'special') {
    const labels = {
      engineering: '施工紀錄',
      supplies: '進料',
      contacts: '聯絡事項',
      special: '特殊事項',
    };
    await this.page
      .getByRole('region', { name: labels[name], exact: true })
      .scrollIntoViewIfNeeded();
  }
  async fill(scenario: Scenario, dates: ReturnType<typeof datesFor>) {
    await this.click(this.action('toggle-basics'), '展開日期與工地');
    await expect(this.page.getByLabel('日報日期', { exact: true })).toHaveValue(
      dates.reportISO,
    );
    await expect(this.page.locator('[data-trade]')).toHaveCount(0);
    await this.metrics.sample('empty');
    await this.type(
      this.page.getByRole('textbox', { name: '搜尋或新增工地' }),
      '鑫天地六期',
      '工地',
    );
    await this.click(
      this.page.getByRole('button', { name: '新增並使用「鑫天地六期」' }),
      '新增工地',
    );
    await this.click(this.action('toggle-basics'), '收合日期與工地');
    const ids: string[] = [];
    let longWorkSampled = false;
    for (const [index, trade] of scenario.trades.entries()) {
      await this.click(this.action('add-trade'), '新增施工');
      await this.chooseTrade(trade.name);
      const row = this.page.locator('[data-trade]').last();
      await expect(this.page.locator('[data-trade]')).toHaveCount(index + 1);
      ids.push((await row.getAttribute('data-trade'))!);
      await this.type(
        row.getByRole('textbox', { name: '廠商', exact: true }),
        trade.vendor,
        '廠商',
      );
      await this.type(
        row.getByRole('textbox', { name: '人數', exact: true }),
        trade.workers,
        '人數',
      );
      for (const [taskIndex, task] of trade.tasks.entries()) {
        await this.type(
          row.getByRole('textbox', { name: '搜尋或輸入下一個工項' }),
          task,
          '工項',
        );
        await this.click(row.getByRole('button', { name: '加入', exact: true }), '加入工項');
        await expect(row.locator('[data-work]')).toHaveCount(taskIndex + 1);
        await expect(
          row.getByRole('textbox', {
            name: `工項 ${taskIndex + 1}`,
            exact: true,
          }),
        ).toHaveValue(task);
      }
      if (index === 0) await this.metrics.sample('engineering');
      if (trade.tasks.length > 1 && !longWorkSampled) {
        longWorkSampled = true;
        await this.metrics.sample('long-work');
      }
      await this.click(row.getByRole('button', { name: '完成這筆', exact: true }), '完成施工');
      await expect(row).toContainText('資料齊全');
    }
    for (const [index, material] of scenario.materials.entries()) {
      await this.click(this.action('add-normal-material'), '新增進料');
      const editor = this.page.locator('[data-material-editor]');
      for (const [label, value] of [
        ['材料類型', material.type],
        ['品名', material.name],
        ['規格（選填）', material.spec ?? ''],
        ['供應商', material.supplier],
        ['數量', material.quantity],
        ['單位', material.unit],
      ])
        await this.type(
          editor.getByRole('textbox', {
            name: label === '數量' ? /^數量(?:（.*）)?$/ : label,
            exact: true,
          }),
          value,
          label,
        );
      if (index === 0) await this.metrics.sample('material-editor');
      await this.click(this.action('save-material'), '儲存進料');
      await expect(editor).toHaveCount(0);
      const row = this.page.locator('[data-material]').last();
      await expect(this.page.locator('[data-material]')).toHaveCount(index + 1);
      await expect(row).toContainText(material.name);
      await expect(row.getByRole('textbox')).toHaveValue(material.quantity);
      await expect(row).toContainText(material.unit);
      await row.getByRole('combobox', { name: '連接施工工種' }).click();
      const target = scenario.trades[material.trade];
      await this.page
        .getByRole('option', {
          name: `${target.name} · ${target.vendor}`,
          exact: true,
        })
        .click();
      await expect(row).toContainText('已連接');
    }
    if (scenario.materials.length) await this.metrics.sample('connection-board');
    for (const contact of scenario.contacts) {
      await this.click(this.action('add-contact'), '新增聯絡');
      await this.chooseTrade(contact.trade);
      await this.type(
        this.page.getByRole('textbox', { name: '聯絡廠商', exact: true }),
        contact.vendor,
        '聯絡廠商',
      );
      if (contact.dateOffset !== undefined)
        await this.page
          .getByLabel('預定日期（選填）', { exact: true })
          .fill(shiftISO(dates.reportISO, contact.dateOffset));
      for (const task of contact.tasks) {
        await this.type(
          this.page.getByRole('textbox', { name: '聯絡施工項目' }),
          task,
          '聯絡工項',
        );
        await this.page.getByRole('button', { name: '加入聯絡工項' }).click();
      }
      await this.metrics.sample('contact-editor');
      await this.click(this.action('save-contact'), '完成聯絡');
      await expect(this.page.getByRole('textbox', { name: '聯絡施工項目' })).toHaveCount(0);
    }
    await this.click(this.action('toggle-preview'), '預覽');
    await expect(this.action('finalize')).toBeEnabled();
    await this.metrics.sample('preview');
    expect(ids).toHaveLength(scenario.trades.length);
  }
}
