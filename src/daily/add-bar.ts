export type DailySection = 'trade' | 'material' | 'contact' | 'special';

export function currentDailySection(sections: readonly { id: DailySection; top: number }[], barBottom: number): DailySection | undefined {
  let current = sections[0]?.id;
  for (const section of sections) {
    if (section.top <= barBottom) current = section.id;
  }
  return current;
}

let listening = false;
let frame: number | undefined;

function updateCurrentSection(): void {
  const bar = document.querySelector<HTMLElement>('.daily-add-bar');
  if (!bar) return;
  const sections = [...document.querySelectorAll<HTMLElement>('[data-daily-section]')].map((section) => ({ id: section.dataset.dailySection as DailySection, top: section.getBoundingClientRect().top }));
  const current = currentDailySection(sections, bar.getBoundingClientRect().bottom);
  for (const button of bar.querySelectorAll<HTMLElement>('[data-add-section]')) {
    if (button.dataset.addSection === current) button.setAttribute('aria-current', 'true');
    else button.removeAttribute('aria-current');
  }
}

function scheduleUpdate(): void {
  if (frame !== undefined) return;
  frame = requestAnimationFrame(() => { frame = undefined; updateCurrentSection(); });
}

export function refreshDailyAddBar(): void {
  if (!listening) {
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);
    listening = true;
  }
  updateCurrentSection();
}
