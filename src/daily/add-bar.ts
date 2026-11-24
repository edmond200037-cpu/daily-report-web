export type DailySection = 'trade' | 'material' | 'contact' | 'special';

export function currentDailySection(sections: readonly { id: DailySection; top: number }[], barBottom: number): DailySection | undefined {
  let current = sections[0]?.id;
  for (const section of sections) {
    if (section.top <= barBottom) current = section.id;
  }
  return current;
}

const addRequest = 'daily-add-request';

/** The add bar and the section lists are separate React roots; this carries the click between them. */
export function requestDailyAdd(section: DailySection): void {
  window.dispatchEvent(new CustomEvent<DailySection>(addRequest, { detail: section }));
}

export function onDailyAddRequest(handler: (section: DailySection) => void): () => void {
  const listener = (event: Event) => handler((event as CustomEvent<DailySection>).detail);
  window.addEventListener(addRequest, listener);
  return () => window.removeEventListener(addRequest, listener);
}

/** AppShell keeps a zero-size copy of the top navigation, so take the rendered bar. */
export function dailyAddBar(): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>('[data-daily-add-bar]')].find((bar) => bar.getClientRects().length > 0);
}

/** Bring a section under the sticky add bar. Instant, so reduced-motion needs no special case. */
export function scrollToDailySection(section: DailySection): void {
  const bar = dailyAddBar();
  const target = document.querySelector<HTMLElement>(`[data-daily-section="${section}"]`);
  if (!bar || !target) return;
  window.scrollBy(0, target.getBoundingClientRect().top - bar.getBoundingClientRect().bottom);
}
