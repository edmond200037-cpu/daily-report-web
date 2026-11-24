import { useLayoutEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { WorkspaceFrame, ReportHistoryList } from './react-presentation';
import { app, appState } from './state';
import { useAppVersion } from './react-store';
import { DailyContext, DailyReview } from './react-daily';
import { DailyAddBar } from './react-daily-addbar';
import { ConfirmationDialog } from './react-confirm';

// Frame follows shell-top-nav: navigation above one centered content region.
function Shell() {
  useAppVersion();
  const host = useRef<HTMLElement>(null);
  useLayoutEffect(() => { host.current?.append(app); }, []);
  const route = appState.renderedRoute;
  const daily = route?.module === 'daily' && route.page === 'main';
  const history = route?.module === 'daily' && route.page === 'history';
  const selected = location.hash.startsWith('#settings') ? 'settings'
    : route?.module === 'water-level' ? 'water-level' : 'daily';
  return <WorkspaceFrame selected={selected} footer={daily ? <DailyReview /> : undefined} addBar={daily ? <DailyAddBar /> : undefined}>
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
