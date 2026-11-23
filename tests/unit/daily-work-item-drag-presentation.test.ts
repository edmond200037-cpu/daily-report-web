import { readFileSync } from 'node:fs';
import { appSource } from './helpers/app-source';
import { describe, expect, it } from 'vitest';
const source = (path: string) => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
describe('工項握把與整列共用拖曳契約', () => {
  const daily = appSource();
  it('接上兩種握把並刪除舊入口', () => {
    expect(daily).toContain('[data-work-gesture],[data-contact-gesture]');
    expect(daily).not.toContain('[data-work-item-handle]');
    expect(daily).toContain('dragIntent(workItemDrag.pointerType');
    expect(daily).toContain('dragIntent(tradeDrag.pointerType');
    expect(daily).toContain('if (workItemDrag.pending) startWorkItemDrag(row); }, 400)');
  });
  it('共用去識別預覽、虛擬框、插槽與邊緣捲動', () => {
    expect(daily).toContain('content.append(inertDragClone(row))');
    expect(daily).toContain("attribute.name.startsWith('data-')");
    expect(daily).toContain('control.disabled = true; control.tabIndex = -1');
    expect(daily).toContain("placeholder.setAttribute('aria-hidden', 'true')");
    expect(daily).toContain("placeholder.style.height = rect.height + 'px'");
    expect(daily).toContain('resolveDropSlotIndex(workItemDrag.clientY, rows)');
    expect(daily).toContain('dropIndicatorMarkup(nextSlot === rows.length)');
    expect(daily).toContain('scrollDragEdge(event.clientY)');
    expect(daily).toContain("workItemDrag.contact ? '[data-contact-task]' : '[data-sortable-work]'");
  });
  it('取消與原位不寫入，失敗還原，沿用指定寫入入口', () => {
    expect(daily).toContain('if (from < 0 || from === to) return');
    expect(daily).toContain('appState.daily.reorderWorkItems(tradeId, from, to)');
    expect(daily).toContain('trade.workItems = originalWorkItems; trade.status = originalStatus');
    expect(daily).toContain('editor.value.items = old');
    expect(daily).toContain('clearWorkItemDrag(); event.preventDefault(); void renderApp(); return;');
    expect(daily).toContain("window.addEventListener('pointercancel'");
  });
  it('左滑模組不再擁有排序，握把允許原生捲動', () => {
    const gestures = source('src/daily/work-gestures.ts');
    expect(gestures).not.toContain('translateY');
    expect(gestures).not.toContain('active.drag');
    expect(gestures).toContain('if (target.closest(gripSelector)) return');
    const css = source('src/daily/input-workflow.css');
    expect(css).toContain('.work-gesture { touch-action:pan-y;');
    expect(css).not.toContain('.work-drop-line');
    expect(css).not.toContain('.work-token--dragging');
  });
});
