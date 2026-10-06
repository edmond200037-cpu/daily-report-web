/** The row accepts horizontal swipes; only the grip starts long-press sorting. */
export function swipeDeletes(dx: number, dy: number): boolean { return dx <= -72 && Math.abs(dx) > Math.abs(dy) * 1.5; }
export function workSwipeIntent(dx: number, dy: number): 'swipe' | 'scroll' | 'cancel' | 'pending' {
  if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) return 'scroll';
  if (dx > 10) return 'cancel';
  return dx <= -12 && Math.abs(dx) > Math.abs(dy) * 1.5 ? 'swipe' : 'pending';
}
interface Actions {
  /** Alternate row ownership lets contact drafts reuse the same touch workflow. */
  target?: { row: string; grip: string; owner(row: HTMLElement): string | undefined; item(row: HTMLElement): string | undefined };
  editable(): boolean;
  move(trade: string, work: string, offset: number): void;
  remove(trade: string, work: string): (() => void) | undefined;
  save(): Promise<void>;
  render(): Promise<void>;
  error(error: unknown): void;
}
export function bindWorkGestures(root: HTMLElement, actions: Actions): void {
  const rowSelector = actions.target?.row ?? '.work-token--item[data-work]';
  const gripSelector = actions.target?.grip ?? '[data-work-gesture]';
  const owner = actions.target?.owner ?? ((row: HTMLElement) => row.closest<HTMLElement>('[data-trade]')?.dataset.trade);
  const item = actions.target?.item ?? ((row: HTMLElement) => row.dataset.work);
  // Hidden toolbar still needs a keyboard equivalent to the touch gesture.
  root.addEventListener('keydown', async (event) => {
    const grip = (event.target as Element).closest<HTMLElement>(gripSelector);
    if (!grip || event.key !== 'Delete' || event.isComposing || !actions.editable()) return;
    const row = grip.closest<HTMLElement>(rowSelector);
    const trade = row && owner(row);
    const work = row && item(row);
    if (!trade || !work) return;
    event.preventDefault();
    const undo = actions.remove(trade, work);
    try { await actions.save(); await actions.render(); showUndo(undo); }
    catch (error) { actions.error(error); }
  });
  const showUndo = (undo: (() => void) | undefined) => {
    if (!undo) return;
    const notice = document.createElement('div'); notice.className = 'work-gesture-undo'; notice.setAttribute('role', 'status');
    notice.append('已刪除工項 '); const button = document.createElement('button'); button.type = 'button'; button.textContent = '復原';
    button.onclick = async () => { if (!actions.editable()) return; button.disabled = true; undo(); try { await actions.save(); await actions.render(); } catch (error) { actions.error(error); } notice.remove(); };
    notice.append(button); root.prepend(notice);
  };
  // Cancel native long-press menus only on the gesture grip, not editable text.
  const preventGripMenu = (event: Event) => {
    if (!(event.target instanceof Element) || !event.target.closest(gripSelector)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  root.addEventListener('contextmenu', preventGripMenu, { capture: true });
  root.addEventListener('dragstart', preventGripMenu, { capture: true });
  root.addEventListener('selectstart', preventGripMenu, { capture: true });
  let active: { row: HTMLElement; handle: HTMLElement; pointer: number; x: number; y: number; dx: number; dy: number; drag: boolean; swipe: boolean; offset: number; timer: number } | undefined;
  let suppressClick = false;
  let dropLine: HTMLElement | undefined;
  const showDropLine = (others: HTMLElement[], index: number) => {
    if (!active || !others.length) return;
    const container = active.row.parentElement!;
    if (!dropLine) { dropLine = document.createElement('span'); dropLine.className = 'work-drop-line'; dropLine.setAttribute('aria-hidden', 'true'); container.append(dropLine); }
    const next = others[index];
    const anchor = (next ?? others[others.length - 1]).getBoundingClientRect();
    dropLine.style.top = `${(next ? anchor.top : anchor.bottom) - container.getBoundingClientRect().top + container.scrollTop - container.clientTop}px`;
  };
  const clear = () => { dropLine?.remove(); dropLine = undefined; if (!active) return; window.clearTimeout(active.timer); active.row.style.transform = ''; active.row.classList.remove('work-token--dragging', 'work-token--deleting'); if (active.handle.hasPointerCapture(active.pointer)) active.handle.releasePointerCapture(active.pointer); active = undefined; };
  root.addEventListener('pointerdown', (event) => {
    const target = event.target as HTMLElement;
    const grip = target.closest<HTMLElement>(gripSelector);
    const row = target.closest<HTMLElement>(rowSelector);
    if (!row || active || !actions.editable() || !event.isPrimary || event.button !== 0) return;
    if (!grip && target.closest('.work-token__detail,.work-token__tools,.work-token__results,button,textarea,select')) return;
    const handle = grip ?? row;
    if (grip) { event.preventDefault(); event.stopPropagation(); handle.setPointerCapture(event.pointerId); }
    active = { row, handle, pointer: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, dy: 0, drag: false, swipe: false, offset: 0, timer: 0 };
    if (!grip) return;
    active.timer = window.setTimeout(() => {
      if (!active) return;
      active.drag = true; active.row.classList.add('work-token--dragging');
      const rows = [...active.row.parentElement!.querySelectorAll<HTMLElement>(rowSelector)];
      showDropLine(rows.filter((row) => row !== active!.row), rows.indexOf(active.row));
    }, 400);
  });
  root.addEventListener('pointermove', (event) => {
    if (!active || event.pointerId !== active.pointer) return;
    active.dx = event.clientX - active.x; active.dy = event.clientY - active.y;
    if (!active.drag) {
      if (Math.hypot(active.dx, active.dy) > 10) window.clearTimeout(active.timer);
      if (!active.swipe) {
        const intent = workSwipeIntent(active.dx, active.dy);
        if (intent === 'scroll' || intent === 'cancel') { clear(); return; }
        if (intent !== 'swipe') return;
        active.swipe = true; active.handle.setPointerCapture(event.pointerId);
        active.row.querySelector<HTMLInputElement>('[data-inline-work]')?.blur();
      }
      event.preventDefault();
      active.row.style.transform = `translateX(${Math.max(-100, Math.min(0, active.dx))}px)`;
      active.row.classList.toggle('work-token--deleting', swipeDeletes(active.dx, active.dy)); return;
    }
    event.preventDefault();
    const rows = [...active.row.parentElement!.querySelectorAll<HTMLElement>(rowSelector)];
    const from = rows.indexOf(active.row);
    const others = rows.filter((row) => row !== active!.row);
    const to = others.filter((row) => { const rect = row.getBoundingClientRect(); return event.clientY > rect.top + rect.height / 2; }).length;
    active.offset = to - from; active.row.style.transform = `translateY(${active.dy}px)`;
    showDropLine(others, to);
    if (event.clientY < 80) window.scrollBy(0, -12); else if (event.clientY > window.innerHeight - 80) window.scrollBy(0, 12);
  });
  root.addEventListener('pointercancel', clear);
  window.addEventListener('blur', clear);
  root.addEventListener('pointerup', async (event) => {
    if (!active || event.pointerId !== active.pointer) return;
    const state = active; const trade = owner(state.row); const work = item(state.row);
    const deleted = state.swipe && !state.drag && swipeDeletes(state.dx, state.dy); clear();
    suppressClick = state.drag || state.swipe; window.setTimeout(() => suppressClick = false, 0);
    if (!trade || !work || !actions.editable()) return;
    let undo: (() => void) | undefined;
    if (deleted) undo = actions.remove(trade, work);
    else if (state.drag && state.offset) actions.move(trade, work, state.offset);
    else return;
    try {
      await actions.save(); await actions.render();
      showUndo(undo);
    } catch (error) { actions.error(error); }
  });
  root.addEventListener('click', (event) => { if (suppressClick && (event.target as HTMLElement).closest(rowSelector)) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
}
