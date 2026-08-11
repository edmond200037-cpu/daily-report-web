// @ts-expect-error Vitest 於 Node 執行，但 production tsconfig 未納入 Node 型別。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('日報收合摘要高度契約', () => {
  const presentation = source('src/presentation.css');
  const daily = source('src/main.ts');
  const styles = source('src/styles.css');
  const dialog = source('src/daily/dialog.css');
  const dailyCss = source('src/daily/daily.css');

  it('以單一 60px token 固定收合摘要列高度', () => {
    expect(presentation).toContain('--summary-height: 60px');
    expect(presentation).toContain('.collapsed-summary { height: var(--summary-height); min-height: var(--summary-height); max-height: var(--summary-height); overflow: hidden; }');
  });

  it('將四類條目、填報資訊與日報預覽接到共同摘要列', () => {
    expect(daily.match(/collapsed-summary/g)).toHaveLength(7);
    expect(styles).toContain('min-height: var(--summary-height)');
    expect(dialog).toContain('min-height: var(--summary-height)');
    expect(dialog).not.toContain('min-height: 58px');
    expect(dialog).not.toContain('min-height: 62px');
  });

  it('讓工程拖曳佔位與有邊框的收合卡同高', () => {
    expect(daily).toContain('trade-card--drag-placeholder');
    expect(dailyCss).toContain('height: calc(var(--summary-height) + 2px)');
  });
});
