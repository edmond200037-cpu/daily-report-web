import { useEffect, useRef, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Button } from '@astryxdesign/core/Button';
import { currentDailySection, dailyAddBar, resolveDailySection, requestDailyAdd, type DailySection } from '../daily/add-bar';
import { appState } from './state';
import { isReadOnlySite } from './sync-runtime';

const buttons = [
  { section: 'trade', action: 'add-trade', label: '新增施工紀錄', short: '＋施工' },
  { section: 'material', action: 'add-normal-material', label: '新增進料', short: '＋進料' },
  { section: 'contact', action: 'add-contact', label: '新增聯絡事項', short: '＋聯絡' },
  { section: 'special', action: 'add-special', label: '新增特殊事項', short: '＋特殊' },
] as const;

/** Scroll position only: never touches appState, drafts or mutations. */
function useCurrentSection(): [DailySection, (section: DailySection) => void] {
  const pressed = useRef<DailySection | undefined>(undefined);
  const [current, setCurrent] = useState<DailySection>('trade');
  const sync = useRef<() => void>(() => undefined);
  useEffect(() => {
    let frame: number | undefined;
    const update = () => {
      frame = undefined;
      const bar = dailyAddBar();
      if (!bar) return;
      const sections = [...document.querySelectorAll<HTMLElement>('[data-daily-section]')]
        .map((node) => ({ id: node.dataset.dailySection as DailySection, top: node.getBoundingClientRect().top }));
      const atBottom = scrollY + innerHeight >= document.documentElement.scrollHeight - 2;
      setCurrent(resolveDailySection(currentDailySection(sections, bar.getBoundingClientRect().bottom) ?? 'trade', pressed.current, atBottom));
    };
    sync.current = update;
    const schedule = () => { if (frame === undefined) frame = requestAnimationFrame(update); };
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => { window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); if (frame !== undefined) cancelAnimationFrame(frame); };
  }, []);
  // Sections move when the lists re-render, so re-measure after every render.
  useEffect(() => sync.current());
  return [current, (section) => { pressed.current = section; requestDailyAdd(section); sync.current(); }];
}

export function DailyAddBar() {
  const [current, press] = useCurrentSection();
  const disabled = isReadOnlySite() || appState.dateSwitching || appState.workspaceSwitching;
  return <VStack padding={2} data-daily-add-bar role="toolbar" aria-label="快速新增"><Grid columns={4} gap={2}>
    {buttons.map((item) => <Button key={item.section} label={item.label} size="lg" width="100%"
      variant={current === item.section ? 'primary' : 'secondary'} aria-current={current === item.section ? 'true' : undefined}
      data-daily-action={item.action} data-add-section={item.section} isDisabled={disabled}
      onClick={() => press(item.section)}>{item.short}</Button>)}
  </Grid></VStack>;
}
