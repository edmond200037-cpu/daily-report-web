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
  /** Returns an undo function when the order changed, so a failed save can restore it. */
  move(trade: string, work: string, offset: number): (() => void) | undefined;
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
  let buttonBusy = false;
  root.addEventListener('click', async (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-work-move],[data-work-delete]');
    const row = button?.closest<HTMLElement>(rowSelector);
    if (!button || !row || button.disabled || buttonBusy || !actions.editable()) return;
    const trade = owner(row); const work = item(row);
    if (!trade || !work) return;
    buttonBusy = true;
    const rows = [...row.parentElement!.querySelectorAll<HTMLElement>(rowSelector)];
    const index = rows.indexOf(row);
    let undo: (() => void) | undefined;
    try {
      if (button.hasAttribute('data-work-delete')) undo = actions.remove(trade, work);
      else undo = actions.move(trade, work, Number(button.dataset.workMove));
      await actions.save(); await actions.render();
      const updated = [...root.querySelectorAll<HTMLElement>(rowSelector)];
      const same = updated.find((candidate) => owner(candidate) === trade && item(candidate) === work);
      const next = updated.filter((candidate) => owner(candidate) === trade)[Math.max(0, index - 1)];
      (same ?? next)?.querySelector<HTMLElement>(gripSelector)?.focus();
      if (!same && !next) root.querySelector<HTMLElement>(`[data-continuous-work="${CSS.escape(trade)}"]`)?.focus();
      if (button.hasAttribute('data-work-delete')) showUndo(undo);
      else { const status = document.createElement('p'); status.setAttribute('role', 'status'); status.className = 'work-move-feedback'; status.textContent = '已更新工項順序'; root.querySelector('.work-move-feedback')?.remove(); root.prepend(status); }
    } catch (error) { if (undo) undo(); await actions.render(); actions.error(error); }
    finally { buttonBusy = false; }
  });
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
    catch (error) { undo?.(); await actions.render(); actions.error(error); }
  });
  const showUndo = (undo: (() => void) | undefined) => {
    if (!undo) return;
    const notice = document.createElement('div'); notice.className = 'work-gesture-undo'; notice.setAttribute('role', 'status');
    notice.append('已刪除工項 '); const button = document.createElement('button'); button.type = 'button'; button.textContent = '復原';
    button.onclick = async () => { if (!actions.editable()) return; button.disabled = true; undo(); try { await actions.save(); await actions.render(); } catch (error) { actions.error(error); } notice.remove(); };
    notice.append(button); root.prepend(notice);
    window.setTimeout(() => notice.remove(), 6000);
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
  let active: { row: HTMLElement; pointer: number; x: number; y: number; dx: number; dy: number; swipe: boolean } | undefined;
  let suppressClick = false;
  const clear = () => {
    if (!active) return;
    active.row.style.transform = ''; active.row.classList.remove('work-token--deleting');
    if (active.row.hasPointerCapture(active.pointer)) active.row.releasePointerCapture(active.pointer);
    active = undefined;
  };
  root.addEventListener('pointerdown', (event) => {
    const target = event.target as HTMLElement;
    if (target.closest(gripSelector)) return;
    const row = target.closest<HTMLElement>(rowSelector);
    if (!row || active || !actions.editable() || !event.isPrimary || event.button !== 0) return;
    if (target.closest('.work-token__detail,.work-token__tools,.work-token__results,button,textarea,select')) return;
    active = { row, pointer: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, dy: 0, swipe: false };
  });
  root.addEventListener('pointermove', (event) => {
    if (!active || event.pointerId !== active.pointer) return;
    active.dx = event.clientX - active.x; active.dy = event.clientY - active.y;
    if (!active.swipe) {
      const intent = workSwipeIntent(active.dx, active.dy);
      if (intent === 'scroll' || intent === 'cancel') { clear(); return; }
      if (intent !== 'swipe') return;
      active.swipe = true; active.row.setPointerCapture(event.pointerId);
      active.row.querySelector<HTMLInputElement>('[data-inline-work]')?.blur();
    }
    event.preventDefault();
    active.row.style.transform = `translateX(${Math.max(-100, Math.min(0, active.dx))}px)`;
    active.row.classList.toggle('work-token--deleting', swipeDeletes(active.dx, active.dy));
  });
  root.addEventListener('pointercancel', clear);
  window.addEventListener('blur', clear);
  root.addEventListener('pointerup', async (event) => {
    if (!active || event.pointerId !== active.pointer) return;
    const state = active; const trade = owner(state.row); const work = item(state.row);
    const deleted = state.swipe && swipeDeletes(state.dx, state.dy); clear();
    suppressClick = state.swipe; window.setTimeout(() => suppressClick = false, 0);
    if (!deleted || !trade || !work || !actions.editable()) return;
    const undo = actions.remove(trade, work);
    try { await actions.save(); await actions.render(); showUndo(undo); }
    catch (error) { undo?.(); await actions.render(); actions.error(error); }
  });
  root.addEventListener('click', (event) => { if (suppressClick && (event.target as HTMLElement).closest(rowSelector)) { event.preventDefault(); event.stopImmediatePropagation(); } }, true);
}
