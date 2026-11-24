import { describe, expect, it } from 'vitest';
import { addBarMarkup, dailyMarkup } from './helpers/react-daily';
import { currentDailySection, resolveDailySection } from '../../src/daily/add-bar';

describe('新增工具列當前區段', () => {
  it('沒有日報區段時不選取', () => {
    expect(currentDailySection([], 44)).toBeUndefined();
  });

  it('第一段尚未越過工具列時以第一段為預設', () => {
    expect(currentDailySection([{ id: 'trade', top: 180 }, { id: 'material', top: 900 }], 44)).toBe('trade');
  });

  it('只以位置選取最後越過工具列底部的區段，包含正好相等', () => {
    const sections = [{ id: 'trade', top: -800 }, { id: 'material', top: -200 }, { id: 'contact', top: 44 }, { id: 'special', top: 800 }] as const;
    expect(currentDailySection(sections, 44)).toBe('contact');
    expect(currentDailySection(sections, 43)).toBe('material');
    expect(currentDailySection(sections, 800)).toBe('special');
  });
});

describe('短頁面工具列標亮', () => {
  it('捲到底時保留較後面的按下區段，否則依位置計算', () => {
    expect(resolveDailySection('trade', 'contact', true)).toBe('contact');
    expect(resolveDailySection('special', 'contact', true)).toBe('special');
    expect(resolveDailySection('trade', 'contact', false)).toBe('trade');
    expect(resolveDailySection('trade', undefined, true)).toBe('trade');
  });
});

describe('React 日報快速新增工具列', () => {
  it('四顆按鈕保留動作與區段屬性，短標籤搭配完整無障礙名稱', () => {
    const html = addBarMarkup();
    for (const [action, section, label, short] of [
      ['add-trade', 'trade', '新增施工紀錄', '＋施工'],
      ['add-normal-material', 'material', '新增進料', '＋進料'],
      ['add-contact', 'contact', '新增聯絡事項', '＋聯絡'],
      ['add-special', 'special', '新增特殊事項', '＋特殊'],
    ]) {
      const button = html.match(new RegExp(`<button[^>]*data-daily-action="${action}"[^>]*>`))?.[0] ?? '';
      expect(button).toContain(`data-add-section="${section}"`);
      expect(button).toContain(`aria-label="${label}"`);
      expect(html).toContain(short);
    }
    expect(html).toContain('data-daily-add-bar');
  });

  it('預設標亮施工段，其餘不標亮', () => {
    const html = addBarMarkup();
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
    expect(html.match(/<button[^>]*data-add-section="trade"[^>]*>/)?.[0]).toContain('aria-current="true"');
  });

  it('各區內不再有新增大按鈕，區段保留位置標記', () => {
    const html = dailyMarkup();
    expect(html).not.toContain('data-daily-action="add-');
    for (const section of ['trade', 'material', 'contact', 'special']) expect(html).toContain(`data-daily-section="${section}"`);
  });

  it('施工與進料順序不變', () => {
    const html = addBarMarkup();
    expect(html.indexOf('新增施工紀錄')).toBeLessThan(html.indexOf('新增進料'));
  });
});
