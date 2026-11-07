import { defineConfig } from '@playwright/test';
import { taipeiToday, datesFor } from './tests/e2e/helpers/report-date';

// Inherited by workers: all cases in one run use the same date, including at midnight.
process.env.DAILY_E2E_DATE ??= taipeiToday();
datesFor(process.env.DAILY_E2E_DATE);
process.env.DAILY_E2E_RUN_ID ??= new Date().toISOString().replace(/[:.]/g, '-') + `-${process.pid}`;
const runDir = `artifacts/daily-e2e/runs/${process.env.DAILY_E2E_RUN_ID}`;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 10_000 },
  outputDir: `${runDir}/results`,
  reporter: [['list'], ['html', { outputFolder: `${runDir}/html`, open: 'never' }]],
  use: {
    browserName: 'chromium',
    baseURL: 'http://127.0.0.1:5317',
    viewport: { width: 390, height: 844 },
    timezoneId: 'Asia/Taipei',
    locale: 'zh-TW',
    deviceScaleFactor: 1,
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 10_000,
  },
  webServer: {
    command: 'node --experimental-strip-types scripts/start-e2e-server.ts',
    url: 'http://127.0.0.1:5317/__e2e_blank',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
