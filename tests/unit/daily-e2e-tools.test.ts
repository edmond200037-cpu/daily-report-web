import { describe, expect, it } from 'vitest';
import { compareOutput } from '../e2e/helpers/compare-output';
import { datesFor, renderAnswer } from '../e2e/helpers/report-date';

describe('本機 E2E 的獨立驗收工具', () => {
  it('以日曆加兩天處理跨月、跨年與閏日', () => {
    expect(datesFor('2026-01-30')).toMatchObject({ reportText: '01/30(五)', contactISO: '2026-02-01', contactText: '02/01(日)' });
    expect(datesFor('2026-12-30')).toMatchObject({ contactISO: '2027-01-01', contactText: '01/01(五)' });
    expect(datesFor('2028-02-28')).toMatchObject({ contactISO: '2028-03-01', contactText: '03/01(三)' });
    expect(() => datesFor('2026-02-30')).toThrow('有效');
    expect(() => datesFor('2026-1-1')).toThrow('有效');
  });

  it('只代換已知日期佔位符，保留模板的空白與結尾換行', () => {
    const dates = datesFor('2026-11-07');
    expect(renderAnswer(' {{REPORT_DATE}}\n{{CONTACT_DATE}}\n', dates)).toBe(' 11/07(六)\n11/09(一)\n');
    expect(() => renderAnswer('{{TOTAL}}', dates)).toThrow('未知');
  });

  it.each([
    ['正文', '正文\n'], ['正文\n', '正文\r\n'], ['正文 ', '正文'],
    ['11/07(六)', '11/7（六）'], ['甲\n\n乙', '甲\n乙'], ['107.12噸', '107.13噸'],
  ])('逐字 gate 保留差異：%j vs %j', (expected, actual) => {
    expect(compareOutput(expected, actual).equal).toBe(false);
    expect(compareOutput(expected, actual).firstDifference).not.toBeNull();
  });

  it('Unicode 位置以碼點計算並標記 EOF', () => {
    expect(compareOutput('😀甲', '😀乙').firstDifference).toMatchObject({ unicodeIndex: 1, expected: { codePoint: 'U+7532' }, actual: { codePoint: 'U+4E59' } });
    expect(compareOutput('甲\n', '甲').firstDifference).toMatchObject({ unicodeIndex: 1, expected: { codePoint: 'U+000A' }, actual: { character: '<EOF>', codePoint: null } });
    expect(compareOutput('完全相同\n', '完全相同\n')).toMatchObject({ equal: true, firstDifference: null });
  });
});
