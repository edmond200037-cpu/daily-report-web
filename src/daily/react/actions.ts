import { appState } from '../../app/state';
import { isReadOnlySite } from '../../app/sync-runtime';
import { handleDailyAction } from '../views/daily-events';
import { dailyUi } from './runtime';
import { readOnlyDailyActions } from '../views/daily-view';

export const dailyLocked = () =>
  isReadOnlySite() || appState.workspaceSwitching || appState.dateSwitching;

// Reuse the existing action dispatcher without a second bubbling DOM dispatch.
export async function dailyAction(
  action: string,
  data: Record<string, string> = {},
): Promise<void> {
  if (appState.workspaceSwitching || appState.dateSwitching || appState.entryComposing) return;
  if (isReadOnlySite() && !readOnlyDailyActions.has(action)) return;
  if (action === 'keep-trade') {
    appState.daily.expandedId = null;
    dailyUi.refresh();
    return;
  }
  if (action === 'toggle-preview') {
    appState.dailyPreviewOpen = !appState.dailyPreviewOpen;
    dailyUi.refresh();
    return;
  }
  if (action === 'add-special') {
    appState.daily.addSpecial();
    appState.expandedSpecialId = appState.daily.report.specialItems.at(-1)?.id ?? null;
    appState.justAddedEntry = appState.expandedSpecialId
      ? { kind: 'special', id: appState.expandedSpecialId }
      : null;
    dailyUi.refresh();
    requestAnimationFrame(() =>
      document.querySelector('[data-special]')?.scrollIntoView({ block: 'center' }),
    );
    return;
  }
  const button = document.createElement('button');
  Object.assign(button.dataset, data, { dailyAction: action });
  await handleDailyAction(button, button);
  if (
    action === 'delete-material' &&
    data.materialId &&
    !appState.daily.materialEntry(data.materialId) &&
    appState.materialEditor?.id === data.materialId
  )
    appState.materialEditor = null;
  dailyUi.refresh();
  if (action === 'add-normal-material')
    requestAnimationFrame(() =>
      document.querySelector('[data-material-editor]')?.scrollIntoView({ block: 'center' }),
    );
}

export function editDaily(mutator: () => void): void {
  if (dailyLocked()) return;
  appState.daily.update(mutator);
  dailyUi.refresh();
}
