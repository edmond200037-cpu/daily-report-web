import { useInputFocus } from './react-editing-safety';
import { useLayoutEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { WorkspaceFrame, ReportHistoryList } from './react-presentation';
import { app, appState } from './state';
import { useAppVersion } from './react-store';
import { DailyContext, DailyReview } from './react-daily';
import { ConfirmationDialog } from './react-confirm';

// Frame follows shell-top-nav: navigation above one centered content region.
function Shell() {
  useAppVersion();
  const host = useRef<HTMLElement>(null);
  useLayoutEffect(() => { host.current?.append(app); }, []);
  const route = appState.renderedRoute;
  const daily = route?.module === 'daily' && route.page === 'main';
  const inputFocused = useInputFocus(daily);
  const editing = Boolean(appState.daily?.expandedId || appState.materialEditor || appState.contactEditor || inputFocused);
  const history = route?.module === 'daily' && route.page === 'history';
  const selected = location.hash.startsWith('#settings') ? 'settings'
    : route?.module === 'water-level' ? 'water-level' : 'daily';
  return <WorkspaceFrame selected={selected} footer={daily ? <DailyReview isCompact={editing} /> : undefined}>
        <ConfirmationDialog />
        {daily && <DailyContext />}
        {history && <ReportHistoryList reports={appState.finalizedReports} />}
        <section ref={host} hidden={history} aria-label="工作內容" />
  </WorkspaceFrame>;
}

export function mountReactShell(): void {
  const root = createRoot(document.querySelector('#app')!);
  flushSync(() => root.render(<Shell />));
}
