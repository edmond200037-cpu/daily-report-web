/** ADR-015：整列與握把拖曳共用的純 UI 規則。 */
export function dragIntent(pointerType: string, dx: number, dy: number): 'pending' | 'cancel' | 'start' {
  const distance = Math.hypot(dx, dy);
  if (pointerType !== 'mouse') return distance >= 8 ? 'cancel' : 'pending';
  if (distance < 6) return 'pending';
  return Math.abs(dy) > Math.abs(dx) ? 'start' : 'cancel';
}
export function inertDragClone(row: HTMLElement): HTMLElement {
  const clone = row.cloneNode(true) as HTMLElement;
  [clone, ...clone.querySelectorAll<HTMLElement>('*')].forEach((element) => {
    element.removeAttribute('id');
    element.removeAttribute('aria-controls');
    [...element.attributes].forEach((attribute) => { if (attribute.name.startsWith('data-')) element.removeAttribute(attribute.name); });
  });
  clone.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement>('input, textarea, select, button').forEach((control) => { control.disabled = true; control.tabIndex = -1; });
  return clone;
}
export function dragSurface(content: HTMLElement): HTMLElement {
  const surface = document.createElement('div');
  surface.className = 'daily-page trade-drag-preview__surface';
  surface.append(content);
  return surface;
}
export function positionDragPreview(preview: HTMLElement, pointerX: number, pointerY: number, offsetX: number, offsetY: number): void {
  const edge = 8;
  const rect = preview.getBoundingClientRect();
  const maxLeft = Math.max(edge, window.innerWidth - rect.width - edge);
  const maxTop = Math.max(edge, window.innerHeight - rect.height - edge);
  preview.style.left = `${Math.min(Math.max(edge, pointerX - offsetX), maxLeft)}px`;
  preview.style.top = `${Math.min(Math.max(edge, pointerY - offsetY), maxTop)}px`;
}
export function resolveDropSlotIndex(pointerY: number, cards: HTMLElement[]): number {
  for (let index = 0; index < cards.length; index += 1) {
    const rect = cards[index].getBoundingClientRect();
    if (pointerY < rect.top + rect.height / 2) return index;
  }
  return cards.length;
}
export function edgeScrollSpeed(pointerY: number, height: number): number {
  const edge = 100;
  return pointerY < edge ? -Math.round(4 + (edge - pointerY) / edge * 14)
    : pointerY > height - edge ? Math.round(4 + (pointerY - (height - edge)) / edge * 14) : 0;
}
export function scrollDragEdge(pointerY: number): void {
  const speed = edgeScrollSpeed(pointerY, window.innerHeight);
  if (speed) window.scrollBy(0, speed);
}
export function dropIndicatorMarkup(atEnd: boolean): string {
  return `<div class="trade-drop-indicator" aria-hidden="true" style="height:4px;border-radius:2px;background:#df9c2e;margin:${atEnd ? '.55rem 0' : '-.75rem 0 .55rem'};pointer-events:none"></div>`;
}
