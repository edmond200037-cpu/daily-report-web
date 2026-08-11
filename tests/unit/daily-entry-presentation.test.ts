import { describe, expect, it } from 'vitest';
import { contentStatusTone, itemCountStatusTone, materialStatusTone, tradeStatusTone } from '../../src/daily/entry-presentation';

describe('日報條目摘要語意狀態', () => {
  it('工程完成與草稿使用可掃讀的完成／警示色彩', () => {
    expect(tradeStatusTone('complete')).toBe('complete');
    expect(tradeStatusTone('draft')).toBe('attention');
  });

  it('進料連接狀態固定映射為最右狀態膠囊色彩', () => {
    expect(materialStatusTone('independent', true)).toBe('complete');
    expect(materialStatusTone('independent', false)).toBe('attention');
    expect(materialStatusTone('normal', false)).toBe('neutral');
  });

  it('聯絡與特殊事項的完成條件維持原本資料語意', () => {
    expect(itemCountStatusTone(2)).toBe('complete');
    expect(itemCountStatusTone(0)).toBe('attention');
    expect(contentStatusTone('已通知廠商')).toBe('complete');
    expect(contentStatusTone('   ')).toBe('attention');
  });

});
