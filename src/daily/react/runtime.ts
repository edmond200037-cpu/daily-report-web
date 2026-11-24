// UI notifications do not save, mark dirty, or create field mutations.
const listeners = new Set<() => void>();
let version = 0;
export const workComposerDrafts = new Map<string, string>();
export const uiDraftPersistence = { memoryOnly: false };
export function scrollToTrade(id: string): void {
  requestAnimationFrame(() =>
    document.querySelector(`[data-trade="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'start' }),
  );
}
export const dailyUi = {
  subscribe(callback: () => void) {
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  },
  snapshot: () => version,
  refresh() {
    version += 1;
    listeners.forEach((callback) => callback());
  },
};
export const workUndoNotice: { restore?: () => Promise<void>; expiresAt: number; timer?: number } =
  { expiresAt: 0 };
export function offerReactWorkUndo(restore: () => Promise<void>): void {
  window.clearTimeout(workUndoNotice.timer);
  workUndoNotice.restore = restore;
  workUndoNotice.expiresAt = Date.now() + 6000;
  workUndoNotice.timer = window.setTimeout(() => {
    workUndoNotice.restore = undefined;
    dailyUi.refresh();
  }, 6000);
  dailyUi.refresh();
}
