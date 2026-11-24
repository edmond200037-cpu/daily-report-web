import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { vi } from 'vitest';
import { DailyController } from '../../../src/daily/daily-controller';
import { createDailyDraft, createTrade, createWorkItem } from '../../../src/domain/daily';

vi.mock('../../../src/main', () => ({
  renderApp: vi.fn(async () => {}),
  parseRoute: () => ({ module: 'daily', page: 'main' }),
}));
vi.mock('../../../src/app/state', () => ({
  app: { querySelector: () => null, querySelectorAll: () => [], addEventListener: vi.fn() },
  appState: {
    daily: undefined,
    dailyTrades: [],
    dailyVendors: [],
    dailyTasks: [],
    dailyLocations: [],
    dailySites: [],
    accountAuth: { enabled: false, user: null },
    accountSites: [],
    accountActiveSiteId: null,
    accountActiveSiteRole: null,
    materialTypes: [],
    materialMemory: [],
    materialEditor: null,
    contactEditor: null,
    settingsTemplates: [],
    dailySaveState: 'saved',
    dailySyncPendingCount: 0,
    dailySyncConflictCount: 0,
    memoryQueueSummary: '',
    tradeUndoQueue: [],
    pwaUpdateState: 'idle',
    entryKind: 'engineering',
    dailyPreviewOpen: false,
    tradePickerOpen: false,
    dailyBasicsExpanded: false,
    workspaceSwitching: false,
    dateSwitching: false,
    justAddedEntry: null,
  },
  settingsState: {},
  memoryReviewState: {},
  waterEditors: new Map(),
  workItemComposerByTrade: new Map(),
  workItemDrag: {},
  tradeDrag: {},
  tradeSwipe: {},
}));

import { appState } from '../../../src/app/state';
import { DailyPage } from '../../../src/daily/react/DailyPage';
import { TradeRow } from '../../../src/daily/react/TradeRow';
import { MaterialRows } from '../../../src/daily/react/MaterialRows';

export const dailyState = appState;
export function resetDaily() {
  vi.stubGlobal('window', { setTimeout: vi.fn(), clearTimeout: vi.fn(), dispatchEvent: vi.fn() });
  appState.daily = new DailyController(createDailyDraft(null, '信義住宅', '2026-11-24'));
  Object.assign(appState, {
    dailyTrades: [],
    dailyVendors: [],
    dailyTasks: [],
    dailyLocations: [],
    dailySites: [],
    accountSites: [],
    accountActiveSiteId: null,
    accountActiveSiteRole: null,
    accountAuth: { enabled: false, user: null },
    materialTypes: [],
    materialMemory: [],
    materialEditor: null,
    contactEditor: null,
    settingsTemplates: [],
    dailyBasicsExpanded: false,
    justAddedEntry: null,
    tradePickerOpen: false,
    dailyPreviewOpen: false,
    tradeUndoQueue: [],
    pwaUpdateState: 'idle',
    workspaceSwitching: false,
    dateSwitching: false,
  });
}
export function fixtureTrade() {
  const trade = createTrade('模板工程', '大成營造', 0, 'trade-template');
  trade.workerCount = '12';
  const work = createWorkItem(0);
  work.taskTextSnapshot = '柱模組立';
  trade.workItems = [work];
  appState.daily.report.tradeSections.push(trade);
  return trade;
}
export const renderDaily = () => renderToStaticMarkup(createElement(DailyPage));
export const renderMaterials = () => renderToStaticMarkup(createElement(MaterialRows));
export const renderTrade = (trade: ReturnType<typeof fixtureTrade>) =>
  renderToStaticMarkup(createElement(TradeRow, { trade }));
