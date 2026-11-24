import { vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DailyController } from '../../../src/daily/daily-controller';

vi.mock('../../../src/main', () => ({
  renderApp: vi.fn(),
  parseRoute: () => ({ module: 'daily', page: 'main' }),
}));
vi.mock('../../../src/app/state', () => ({
  app: {},
  appState: {
    daily: null,
    dailyTrades: [],
    dailyVendors: [],
    dailyTasks: [],
    dailySites: [],
    dailyLocations: [],
    materialTypes: [],
    materialMemory: [],
    accountAuth: {},
    accountSites: [],
    finalizedReports: [],
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
import { DailyInputs } from '../../../src/app/react-daily-inputs';
import { DailyReview } from '../../../src/app/react-daily';

export function dailyMarkup(
  prepare?: (daily: DailyController) => void,
): string {
  appState.daily = new DailyController();
  appState.materialEditor = null;
  appState.contactEditor = null;
  appState.workspaceSwitching = false;
  appState.dateSwitching = false;
  prepare?.(appState.daily);
  return renderToStaticMarkup(<DailyInputs />);
}

export function reviewMarkup(): string {
  dailyMarkup();
  return renderToStaticMarkup(<DailyReview />);
}
