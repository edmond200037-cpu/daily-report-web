import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { settingsMarkup } from './helpers/react-settings';
import { WaterPointsSettings } from '../../src/app/react-water-points';
import { WaterContent, type WaterViewController } from '../../src/app/react-water';
import { describe, expect, it } from 'vitest';
import { WaterLevelController, waterLogSummary } from '../../src/water-level/controller.js';
import { recalculate } from '../../src/water-level/calculator.js';

const log = (readings: Array<{ value: string }>, battery = '') => ({
  id: 'log-1',
  measuredAt: '2026-08-10T09:00',
  battery,
  readings: readings.map((reading, index) => ({ pointId: `p${index}`, pointNameSnapshot: `${index + 1} 號井`, change: null, ...reading })),
});

describe('水位摘要呈現契約', () => {
  it('完整讀值顯示井位數與完整狀態', () => {
    expect(waterLogSummary(log([{ value: '10.123' }, { value: '11.456' }], '2.798'))).toMatchObject({
      detail: '2/2 井有數據｜電池 2.798',
      status: '完整',
    });
  });

  it('輸入一半或未設定井位時仍能掃讀缺值狀態', () => {
    expect(waterLogSummary(log([{ value: '10.123' }, { value: '' }]))).toMatchObject({ detail: '1/2 井有數據', status: '缺值' });
    expect(waterLogSummary(log([]))).toMatchObject({ detail: '尚未設定井位', status: '缺值' });
  });

  it('歷史一次只展開一筆，輸出抽屜可獨立收合', async () => {
    const root = { innerHTML: '' } as unknown as HTMLElement;
    const controller = new WaterLevelController(root);
    controller.editing = log([{ value: '9.999' }]);
    controller.logs = [{ ...log([{ value: '9.999' }]), id: 'first' }, { ...log([{ value: '10.123' }]), id: 'second', measuredAt: '2026-08-10T10:00' }];
    controller.mode = 'history';

    await controller.handleAction('toggle-history', 'first');
    const markup = () => renderToStaticMarkup(createElement(WaterContent, { controller: controller as unknown as WaterViewController }));
    expect(markup()).toContain('data-water-history="first"');
    expect(markup()).toContain('aria-expanded="true"');

    await controller.handleAction('toggle-history', 'second');
    expect(controller.expandedHistoryId).toBe('second');
    expect(markup().match(/aria-expanded="true"/g)).toHaveLength(1);

    await controller.handleAction('toggle-output');
    expect(controller.outputOpen).toBe(true);
    expect(markup()).toContain('複製最近三天');
  });

  it('移除量測後以剩餘紀錄重新計算變化量', () => {
    const records = [
      { ...log([{ value: '10.000' }]), id: 'first', measuredAt: '2026-08-10T08:00' },
      { ...log([{ value: '10.300' }]), id: 'second', measuredAt: '2026-08-10T09:00' },
    ];
    expect(recalculate(records.filter((record) => record.id !== 'first'))[0].readings[0].change).toBeNull();
  });
});

describe('React 井位設定', () => {
 it('初始頁使用設定子頁及新增入口', () => { const html = settingsMarkup(WaterPointsSettings); expect(html).toContain('水位井位'); expect(html).toContain('新增井位'); expect(html).toContain('href="#settings"'); });
 it('刪除影響範圍保持可見', () => { expect(settingsMarkup(WaterPointsSettings)).toContain('既有歷史紀錄保留名稱快照'); });
 it('空白清單提供清楚狀態，CRUD 由瀏覽器測試覆蓋', () => { expect(settingsMarkup(WaterPointsSettings)).toContain('尚無井位'); });
});
