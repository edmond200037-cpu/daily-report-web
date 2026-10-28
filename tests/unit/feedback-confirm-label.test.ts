import { describe, expect, it } from 'vitest';
import { confirmActionLabel } from '../../src/shared/feedback';

describe('confirmActionLabel', () => {
  it('uses the earliest action keyword in the title', () => {
    expect(confirmActionLabel('確定刪除這筆進料？')).toEqual({ label: '刪除', danger: true });
    expect(confirmActionLabel('切換工種會清除目前已加入的施工項目，是否繼續？')).toEqual({ label: '切換工種', danger: false });
    expect(confirmActionLabel('目前進料內容尚未儲存，是否放棄這次修改？')).toEqual({ label: '放棄修改', danger: true });
    expect(confirmActionLabel('再次確認：駁回後無法還原，確定繼續？')).toEqual({ label: '駁回', danger: true });
  });
  it('falls back to a neutral label', () => {
    expect(confirmActionLabel('確定繼續？')).toEqual({ label: '確定', danger: false });
  });
});
