import './react-daily';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { appState, settingsState, memoryReviewState } from '../../../src/app/state';
import { DailyController } from '../../../src/daily/daily-controller';
import type { AccountPageState } from '../../../src/account/account-view';
import { SharedSiteContent, SyncDiagnosticsContent } from '../../../src/app/react-account';
export { appState, settingsState, memoryReviewState };
export function settingsMarkup(component: ComponentType, prepare?: () => void): string {
  Object.assign(appState, { daily: new DailyController(), accountAuth: { enabled: false, session: null, user: null }, accountSites: [], accountPendingCount: 0, accountSyncOperations: [], accountLoadEvents: [], settingsReturnModule: 'daily', settingsRows: [], settingsTrades: [], settingsAllTasks: [], settingsAllVendors: [], settingsTemplates: [], settingsMaterialMemory: [], materialTypes: [], memoryCandidates: [], workspaceSwitching: false, dateSwitching: false, settingsDebug: {} });
  Object.assign(settingsState, { activeSection: 'sites', editingId: null, adding: false, dirty: false, selectedTradeTypeId: null, taskSearchKeyword: '', editingKind: null, expandedMaterialTypeId: null, editingMaterialItemId: null });
  Object.assign(memoryReviewState, { explicitKeys: new Set(), expandedKeys: new Set(), openKind: null, feedback: '' });
  prepare?.();
  return renderToStaticMarkup(createElement(component));
}
export function accountMarkup(state: AccountPageState): string {
  return renderToStaticMarkup(createElement(state.view === 'debug' ? SyncDiagnosticsContent : SharedSiteContent, { state }));
}
