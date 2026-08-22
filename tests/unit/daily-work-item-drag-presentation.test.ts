// @ts-expect-error Vitest runs this source-contract test with Node types.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('工項拖曳呈現契約', () => {
  const daily = source('src/main.ts');
  const styles = source('src/daily/daily.css');

  it('保留完整 transient 拖曳狀態與 6px pending 門檻', () => {
    expect(daily).toContain('pending: false');
    expect(daily).toContain('originalOrder: [] as string[]');
    expect(daily).toContain('activeDropSlotIndex: null as number | null');
    expect(daily).toContain("preview: null as HTMLElement | null");
    expect(daily).toContain("placeholderMarkup: ''");
    expect(daily).toContain('Math.hypot(event.clientX - workItemDrag.startX, event.clientY - workItemDrag.startY) < 6');
  });

  it('用同施工卡的 sortable rows 輸出 placeholder、首中尾插入線', () => {
    expect(daily).toContain('function workItemsView');
    expect(daily).toContain('data-sortable-work');
    expect(daily).toContain('work-item--drag-placeholder');
    expect(daily).toContain("indicator(sortableItems.length, true)");
    expect(daily).toContain('.filter((row) => row.dataset.work !== workItemDrag.workItemId)');
  });

  it('預覽完整工項、停用 clone 互動，且 pointer cancel 與 Escape 清理狀態', () => {
    expect(daily).toContain('function startWorkItemDrag');
    expect(daily).toContain("preview.className = 'work-item-drag-preview'");
    expect(daily).toContain('preview.append(inertWorkItemClone(row))');
    expect(daily).toContain('control.disabled = true; control.tabIndex = -1');
    expect(daily).toContain('window.addEventListener(\'pointercancel\'');
    expect(daily).toContain('clearWorkItemDrag(); event.preventDefault(); void renderApp(); return;');
  });

  it('維持既有輸入器與操作欄契約', () => {
    expect(daily).toContain('function workItemComposerView');
    expect(daily).toContain('aria-label="工項操作"');
    expect(styles).toContain('--work-item-action-column: var(--daily-touch-target)');
    expect(styles).toContain('.work-item-drag-preview { position: fixed;');
    expect(styles).toContain('.work-item-drop-indicator { height: 4px;');
  });
});
