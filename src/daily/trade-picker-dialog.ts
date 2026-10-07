/** Native dialog supplies background inertness and modal keyboard containment. */
export function bindTradePickerDialog(root: HTMLElement, close: () => Promise<void>) {
  let opener = '[data-daily-action="add-trade"]';
  let wasOpen = false;
  let focusSelector: string | undefined;
  root.addEventListener('click', (event) => {
    const trigger = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-daily-action]');
    if (!trigger || !['add-trade', 'add-contact', 'next-entry', 'save-contact-next'].includes(trigger.dataset.dailyAction!)) return;
    opener = `[data-daily-action="${trigger.dataset.dailyAction}"]${trigger.dataset.id ? `[data-id="${CSS.escape(trigger.dataset.id)}"]` : ''}`;
  }, true);
  return {
    beforeRender() {
      const active = document.activeElement as HTMLElement | null;
      if (!active?.closest('dialog.trade-picker')) return;
      focusSelector = active.matches('[data-trade-picker-search]') ? '[data-trade-picker-search]'
        : active.dataset.tradeId ? `[data-trade-id="${CSS.escape(active.dataset.tradeId)}"]`
        : active.dataset.dailyAction ? `[data-daily-action="${active.dataset.dailyAction}"]` : '#trade-picker-title';
    },
    afterRender() {
      const dialog = root.querySelector<HTMLDialogElement>('dialog.trade-picker');
      if (!dialog) {
        if (wasOpen) (root.querySelector<HTMLElement>(opener) ?? root.querySelector<HTMLElement>('[data-daily-tab][aria-selected="true"]'))?.focus();
        wasOpen = false; focusSelector = undefined; return;
      }
      dialog.addEventListener('cancel', (event) => { event.preventDefault(); void close(); });
      const finePointer = window.matchMedia('(pointer: fine)').matches;
      dialog.showModal();
      dialog.querySelector<HTMLElement>(focusSelector ?? (finePointer ? '[data-trade-picker-search]' : '#trade-picker-title'))?.focus({ preventScroll: true });
      wasOpen = true; focusSelector = undefined;
    },
  };
}
