// Frame adapted from Astryx AppShellTopNavOnly / shell-top-nav.
import { useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createPortal, flushSync } from 'react-dom';
import { Theme } from '@astryxdesign/core/theme';
import { InternationalizationProvider } from '@astryxdesign/core/i18n';
import zhTW from '@astryxdesign/core/locales/zh-TW.json';
import { AppShell } from '@astryxdesign/core/AppShell';
import { TopNav, TopNavItem } from '@astryxdesign/core/TopNav';
import { VStack } from '@astryxdesign/core/VStack';
import { themes, defaultThemeSlug } from '../../astryx-themes';
import { DailyPage } from '../../daily/react/DailyPage';
import { dailyUi, uiDraftPersistence } from '../../daily/react/runtime';
import { LegacyRoute } from './LegacyRoute';

interface ShellState {
  root?: Root;
  outlet: HTMLElement;
  isDaily: boolean;
}
function shellState(): ShellState {
  const host = globalThis as typeof globalThis & { __dailyReactShell?: ShellState };
  return (host.__dailyReactShell ??= {
    outlet: document.querySelector<HTMLElement>('#app')!,
    isDaily: false,
  });
}

function Shell() {
  useSyncExternalStore(dailyUi.subscribe, dailyUi.snapshot);
  const { outlet, isDaily } = shellState();
  const hash = location.hash;
  return (
    <InternationalizationProvider locale="zh-TW" messages={{ 'zh-TW': zhTW }}>
      <Theme theme={themes[defaultThemeSlug]} mode="system">
        <AppShell
          height="auto"
          variant="surface"
          contentPadding={6}
          mobileNav={false}
          topNav={
            <TopNav
              label="主要功能"
              startContent={
                <>
                  <TopNavItem
                    label="施工日報"
                    href="#daily"
                    isSelected={!hash || hash.startsWith('#daily')}
                  />
                  <TopNavItem
                    label="水位變化"
                    href="#water-level"
                    isSelected={hash.startsWith('#water-level')}
                  />
                </>
              }
              endContent={
                <TopNavItem
                  label="設定"
                  href="#settings"
                  isSelected={hash.startsWith('#settings')}
                />
              }
            />
          }
        >
          <VStack gap={4} width="100%" style={{ minWidth: 0 }}>
            <LegacyRoute outlet={outlet} />
            {createPortal(isDaily ? <DailyPage /> : null, outlet)}
          </VStack>
        </AppShell>
      </Theme>
    </InternationalizationProvider>
  );
}

export function initializeReactShell(container: HTMLElement): void {
  uiDraftPersistence.memoryOnly = true;
  const state = shellState();
  if (state.root) return;
  state.outlet = container;
  const host = document.createElement('section');
  host.id = 'react-shell';
  container.before(host);
  state.root = createRoot(host);
  flushSync(() => state.root!.render(<Shell />));
}

export function prepareReactRoute(daily: boolean): void {
  const state = shellState();
  if (!state.root) return;
  if (!daily && state.isDaily) {
    state.isDaily = false;
    flushSync(() => state.root!.render(<Shell />));
  }
  state.outlet.classList.toggle('legacy-route', !daily);
  if (!daily) flushSync(() => state.root!.render(<Shell />));
}

export function renderReactDaily(): void {
  const state = shellState();
  if (!state.isDaily) state.outlet.replaceChildren();
  state.isDaily = true;
  flushSync(() => state.root!.render(<Shell />));
}
