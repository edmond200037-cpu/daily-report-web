// @ts-expect-error Vitest 於 Node 執行，但 production tsconfig 未納入 Node 型別。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../src/daily/material.css', import.meta.url), 'utf8');
const main = readFileSync(new URL('../../src/main.ts', import.meta.url), 'utf8');

describe('進料接線盤呈現契約', () => {
  it('桌面進料欄固定 280px，工種欄使用剩餘寬度', () => {
    expect(css).toContain('grid-template-columns: 280px 2.5rem minmax(0, 1fr)');
    expect(css).toContain('justify-items: start');
  });

  it('獨立進料卡固定填滿同一欄軌，手機才改為單欄全寬', () => {
    expect(css).toContain('.material-connection-panel__board > section:first-child { width: 280px; }');
    expect(css).toContain('@media (max-width: 600px) { .material-connection-panel__board { grid-template-columns: 1fr; justify-items: stretch; }');
    expect(css).toContain('.material-connection-panel__board > section:first-child { width: auto; }');
  });

  it('中間連接符號依第一列端口對齊，不依左右清單高度置中', () => {
    expect(main).toContain('class="material-connection-panel__line" aria-hidden="true"><span>⟷</span>');
    expect(css).toContain('--connection-heading-height: 1.21875rem');
    expect(css).toContain('grid-template-rows: var(--connection-heading-height) var(--space-2) minmax(68px, auto) 1fr');
    expect(css).toContain('.material-connection-panel__line > span { display: grid; grid-row: 3; place-items: center; }');
  });
});
