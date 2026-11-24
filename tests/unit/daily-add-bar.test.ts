import { describe, expect, it } from 'vitest';
import { currentDailySection } from '../../src/daily/add-bar';

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
