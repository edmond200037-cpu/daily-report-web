/** Gestures use a dedicated touch target so text selection and page scrolling stay native. */
export function swipeDeletes(dx: number, dy: number): boolean { return dx <= -72 && Math.abs(dx) > Math.abs(dy) * 1.5; }
interface Actions {
  editable(): boolean;
  move(trade: string, work: string, offset: number): void;
  remove(trade: string, work: string): (() => void) | undefined;
  save(): Promise<void>;
  render(): Promise<void>;
  error(error: unknown): void;
}
export function bindWorkGestures(root: HTMLElement, actions: Actions): void {
  // Cancel native long-press menus only on the gesture grip, not editable text.
  const preventGripMenu = (event: Event) => {
    if (!(event.target instanceof Element) || !event.target.closest('[data-work-gesture]')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  root.addEventListener('contextmenu', preventGripMenu, { capture: true });
  root.addEventListener('dragstart', preventGripMenu, { capture: true });
  root.addEventListener('selectstart', preventGripMenu, { capture: true });
  let active: { row: HTMLElement; handle: HTMLElement; pointer: number; x: number; y: number; dx: number; dy: number; drag: boolean; offset: number; timer: number } | undefined;
  let suppressClick = false;
  const clear = () => { if (!active) return; window.clearTimeout(active.timer); active.row.style.transform = ''; active.row.classList.remove('work-token--dragging', 'work-token--deleting'); if (active.handle.hasPointerCapture(active.pointer)) active.handle.releasePointerCapture(active.pointer); active = undefined; };
  root.addEventListener('pointerdown', (event) => {
    const handle = (event.target as HTMLElement).closest<HTMLElement>('[data-work-gesture]');
    const row = handle?.closest<HTMLElement>('[data-work]');
    if (!handle || !row || active || !actions.editable() || !event.isPrimary || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation(); handle.setPointerCapture(event.pointerId);
    active = { row, handle, pointer: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, dy: 0, drag: false, offset: 0, timer: 0 };
    active.timer = window.setTimeout(() => { if (!active) return; active.drag = true; active.row.classList.add('work-token--dragging'); }, 400);
  });
  root.addEventListener('pointermove', (event) => {
    if (!active || event.pointerId !== active.pointer) return;
    event.preventDefault(); active.dx = event.clientX - active.x; active.dy = event.clientY - active.y;
    if (!active.drag) {
      if (Math.hypot(active.dx, active.dy) > 10) window.clearTimeout(active.timer);
      active.row.style.transform = `translateX(${Math.max(-100, Math.min(0, active.dx))}px)`;
      active.row.classList.toggle('work-token--deleting', swipeDeletes(active.dx, active.dy)); return;
    }
    const rows = [...active.row.parentElement!.querySelectorAll<HTMLElement>('.work-token--item')];
    const from = rows.indexOf(active.row);
    const others = rows.filter((row) => row !== active!.row);
    const to = others.filter((row) => { const rect = row.getBoundingClientRect(); return event.clientY > rect.top + rect.height / 2; }).length;
    active.offset = to - from; active.row.style.transform = `translateY(${active.dy}px)`;
    if (event.clientY < 80) window.scrollBy(0, -12); else if (event.clientY > window.innerHeight - 80) window.scrollBy(0, 12);
  });
  root.addEventListener('pointercancel', clear);
  window.addEventListener('blur', clear);
  root.addEventListener('pointerup', async (event) => {
    if (!active || event.pointerId !== active.pointer) return;
    const state = active; const trade = state.row.closest<HTMLElement>('[data-trade]')?.dataset.trade; const work = state.row.dataset.work;
    const deleted = !state.drag && swipeDeletes(state.dx, state.dy); clear();
    suppressClick = state.drag || deleted; window.setTimeout(() => suppressClick = false, 0);
    if (!trade || !work || !actions.editable()) return;
    let undo: (() => void) | undefined;
    if (deleted) undo = actions.remove(trade, work);
    else if (state.drag && state.offset) actions.move(trade, work, state.offset);
    else return;
    try {
      await actions.save(); await actions.render();
      if (undo) {
        const notice = document.createElement('div'); notice.className = 'work-gesture-undo'; notice.setAttribute('role', 'status');
        notice.append('已刪除工項 '); const button = document.createElement('button'); button.type = 'button'; button.textContent = '復原';
        button.onclick = async () => { if (!actions.editable()) return; button.disabled = true; undo!(); try { await actions.save(); await actions.render(); } catch (error) { actions.error(error); } notice.remove(); };
        notice.append(button); root.prepend(notice);
      }
    } catch (error) { actions.error(error); }
  });
  root.addEventListener('click', (event) => { if (suppressClick && (event.target as HTMLElement).closest('[data-work-gesture]')) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
}
