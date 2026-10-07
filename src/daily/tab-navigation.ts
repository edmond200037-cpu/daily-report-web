export function nextTabIndex(key: string, index: number, count: number): number | undefined {
  if (!count) return;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (key === 'ArrowRight') return (index + 1) % count;
  if (key === 'ArrowLeft') return (index + count - 1) % count;
}

export function bindTabNavigation(root: HTMLElement): void {
  root.addEventListener('keydown', (event) => {
    if (event.isComposing || event.keyCode === 229) return;
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-daily-tab]');
    if (!target) return;
    const tabs = [...root.querySelectorAll<HTMLButtonElement>('[data-daily-tab]')];
    const next = nextTabIndex(event.key, tabs.indexOf(target), tabs.length);
    if (next === undefined) return;
    event.preventDefault();
    tabs.forEach((tab, index) => tab.tabIndex = index === next ? 0 : -1);
    tabs[next].focus();
  });
}
