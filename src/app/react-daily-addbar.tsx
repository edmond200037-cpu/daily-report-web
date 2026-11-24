import { useEffect, useRef, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Button } from '@astryxdesign/core/Button';
import { currentDailySection, dailyAddBar, requestDailyAdd, type DailySection } from '../daily/add-bar';
import { appState } from './state';
import { isReadOnlySite } from './sync-runtime';

const buttons = [
  { section: 'trade', action: 'add-trade', label: '新增施工紀錄', short: '＋施工' },
  { section: 'material', action: 'add-normal-material', label: '新增進料', short: '＋進料' },
  { section: 'contact', action: 'add-contact', label: '新增聯絡事項', short: '＋聯絡' },
  { section: 'special', action: 'add-special', label: '新增特殊事項', short: '＋特殊' },
] as const;

/** Scroll position only: never touches appState, drafts or mutations. */
function useCurrentSection(): DailySection {
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
      setCurrent(currentDailySection(sections, bar.getBoundingClientRect().bottom) ?? 'trade');
    };
    sync.current = update;
    const schedule = () => { if (frame === undefined) frame = requestAnimationFrame(update); };
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => { window.removeEventListener('scroll', schedule); window.removeEventListener('resize', schedule); if (frame !== undefined) cancelAnimationFrame(frame); };
  }, []);
  // Sections move when the lists re-render, so re-measure after every render.
  useEffect(() => sync.current());
  return current;
}

export function DailyAddBar() {
  const current = useCurrentSection();
  const disabled = isReadOnlySite() || appState.dateSwitching || appState.workspaceSwitching;
  return <VStack padding={2} data-daily-add-bar role="toolbar" aria-label="快速新增"><Grid columns={4} gap={2}>
    {buttons.map((item) => <Button key={item.section} label={item.label} size="lg" width="100%"
      variant={current === item.section ? 'primary' : 'secondary'} aria-current={current === item.section ? 'true' : undefined}
      data-daily-action={item.action} data-add-section={item.section} isDisabled={disabled}
      onClick={() => requestDailyAdd(item.section)}>{item.short}</Button>)}
  </Grid></VStack>;
}
