// @ts-expect-error Vitest 於 Node 執行，但 production tsconfig 未納入 Node 型別。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../src/daily/material.css', import.meta.url), 'utf8');
const main = readFileSync(new URL('../../src/main.ts', import.meta.url), 'utf8');

describe('進料接線盤呈現契約', () => {
  it('桌面以兩側 280px 節點欄夾中間可伸展接線區', () => {
    expect(css).toContain('grid-template-columns: 280px minmax(7rem, 1fr) 280px');
    expect(css).toContain('.connection-node-section--trades { grid-column: 3; justify-self: end; }');
    expect(css).toContain('.connection-node-section--trades input { box-sizing: border-box;');
  });

  it('進料與工種卡共用 68px 固定高度，手機保留 80px 接線區', () => {
    expect(css).toContain('height: var(--connection-node-height); min-height: var(--connection-node-height);');
    expect(css).toContain('@media (max-width: 760px)');
    expect(css).toContain('height: 80px;');
  });

  it('以非互動 SVG 曲線呈現關聯與目前選取狀態', () => {
    expect(main).toContain('class="material-connection-canvas" aria-hidden="true"');
    expect(main).toContain('class="connection-curve${active ? \' is-active\' : \'\'}"');
    expect(main).toContain('data-connection-curve data-material-id="${entry.id}" data-trade-id="${entry.connectedTradeSectionId}"');
    expect(main).toContain('function syncMaterialConnectionCurves(): void');
    expect(main).toContain('getBoundingClientRect()');
    expect(main).toContain(".connection-node[data-material-id]");
    expect(main).toContain(".connection-node[data-trade-id]");
    expect(css).toContain('pointer-events: none');
    expect(css).toContain('.connection-curve.is-active');
    expect(main).toContain('class="material-connection-canvas__mobile" viewBox="0 0 100 80"');
    expect(css).toContain('.material-connection-canvas__mobile { display: block !important; }');
    expect(css).toContain('grid-template-columns: repeat(var(--connection-mobile-count), minmax(0, 1fr));');
    expect(css).toContain('.connection-node--material .connection-port { top: auto; right: auto; bottom: -.42rem; left: 50%;');
    expect(css).toContain('.connection-node--trade .connection-port { top: -.42rem; right: auto; bottom: auto; left: 50%;');
    expect(css).toContain('.connection-node-section--trades { display: contents; }');
    expect(css).toContain('.connection-node-section--trades > header { display: grid;');
    expect(css).toContain('.connection-node-section--trades > .connection-node-list { order: 3; }');
    expect(css).toContain('.connection-count { top: -1.75rem; left: 50%; transform: translateX(-50%); }');
    expect(css).toContain('.connection-count { position: absolute; top: 50%; left: -1.8rem;');
  });

  it('工種搜尋比對工種與廠商，保留 IME 完成輸入流程', () => {
    expect(main).toContain('data-material-connection-search');
    expect(main).toContain('normalizeSearch(`${trade.tradeNameSnapshot} ${trade.vendorNameSnapshot}`)');
    expect(main).toContain('materialConnectionSearchComposing = false; refreshMaterialConnectionSearch(target);');
  });

  it('以共用 layout constants 同時驅動節點、間距與曲線幾何', () => {
    expect(main).toContain('const MATERIAL_CONNECTION_NODE_HEIGHT_PX = 68');
    expect(main).toContain('const MATERIAL_CONNECTION_NODE_GAP_PX = 8');
    expect(main).toContain('--connection-node-height:${MATERIAL_CONNECTION_NODE_HEIGHT_PX}px;--connection-node-gap:${MATERIAL_CONNECTION_NODE_GAP_PX}px');
    expect(css).toContain('gap: var(--connection-node-gap);');
    expect(css).toContain('column-gap: 0;');
    expect(css).toContain('.material-connection-canvas { position: absolute; inset: 0; z-index: 0;');
    expect(css).toContain('.connection-node-section--trades { grid-column: 3; justify-self: end; }');
    expect(css).toContain('.material-connection-canvas { position: static; inset: auto; order: 2; height: 80px;');
    expect(css).toContain('.connection-node--material .connection-port { right: -.35rem; }');
    expect(css).toContain('.connection-node--trade .connection-port { left: -.35rem; }');
    expect(main).not.toContain('連接後會退回草稿');
  });
});
