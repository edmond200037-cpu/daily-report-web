import { describe, expect, it } from 'vitest';
import { formatDate } from '../../src/format/date-format';
import { renderReport } from '../../src/core/preview-renderer';
import { normalizeName } from '../../src/format/normalization';
import { renderTemplate, templateKeys } from '../../src/modules/special/template';
import type { DailyReport } from '../../src/types/domain';

const base = (sections: DailyReport['sections']): DailyReport => ({ id: 'r', date: '2026-07-27', siteNameSnapshot: '鑫天地六期', sections, createdAt: '', updatedAt: '' });
describe('日期與日報輸出', () => {
  it('依本地日曆格式化日期', () => expect(formatDate('2026-07-27')).toBe('7/27（一）'));
  it('輸出單一施工子項目', () => expect(renderReport(base([{ id: 'c', sectionType: 'construction', tradeNameSnapshot: '安全觀測', sortOrder: 0, entries: [{ id: 'e', vendorNameSnapshot: '允穩', workerCount: 4, sortOrder: 0, workItems: [{ id: 'w', text: '數據收測', sortOrder: 0 }] }] }]))).toContain('安全觀測：允穩4工-數據收測。'));
  it('輸出多個子項目的編號', () => expect(renderReport(base([{ id: 'c', sectionType: 'construction', tradeNameSnapshot: '安全支撐工程', sortOrder: 0, entries: [{ id: 'e', vendorNameSnapshot: '安暉', workerCount: 10, sortOrder: 0, workItems: [{ id: 'w', text: '支撐施作', sortOrder: 0 }] }, { id: 'm', materialNameSnapshot: '一般混凝土', outputLabelSnapshot: '混凝土', vendorNameSnapshot: '天誠', quantity: 3, unit: '方', specification: '140kgf/cm2', sortOrder: 1 }] }]))).toContain('1.安暉10工-支撐施作。\n2.混凝土-天誠：一般混凝土3方，140kgf/cm2。'));
  it('將獨立材料輸出成主要區塊', () => expect(renderReport(base([{ id: 'm', sectionType: 'material', sortOrder: 0, entry: { id: 'm1', materialNameSnapshot: '一般混凝土', outputLabelSnapshot: '混凝土', vendorNameSnapshot: '天誠', quantity: 2.5, unit: '方', specification: '350kgf/cm2', sortOrder: 0 } }]))).toContain('混凝土-天誠：一般混凝土2.5方，350kgf/cm2。'));
});
describe('名稱與模板', () => {
  it('名稱比較會移除頭尾與連續空白並忽略英文大小寫', () => expect(normalizeName('  Main   Site  ')).toBe('main site'));
  it('解析並渲染模板變數', () => { expect(templateKeys('本日{時間}勞檢。')).toEqual(['時間']); expect(renderTemplate('本日{時間}勞檢。', [{ id: 'v', templateId: 't', key: '時間', label: '時間', type: 'time', required: true, sortOrder: 0, createdAt: '', updatedAt: '' }], { 時間: '15:00' })).toBe('本日15:00勞檢。'); });
  it('拒絕不完整模板', () => expect(() => templateKeys('本日{時間')).toThrow());
});
