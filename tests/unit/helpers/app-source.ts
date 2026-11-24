import { readFileSync } from 'node:fs';
const appSourceFiles = [
 'src/main.ts', 'src/app/application.ts', 'src/app/state.ts', 'src/app/shell.ts', 'src/app/sync-runtime.ts', 'src/app/workspace-events.ts',
 'src/account/account-controller.ts', 'src/water-level/water-shell.ts', 'src/water-level/controller.js',
 'src/daily/views/daily-view.ts', 'src/daily/views/material-view.ts', 'src/daily/views/contact-view.ts', 'src/daily/views/daily-entry.ts', 'src/daily/views/daily-events.ts',
 'src/app/react-daily-inputs.tsx', 'src/app/react-daily.tsx', 'src/app/react-settings.tsx', 'src/app/react-account.tsx', 'src/app/react-water.tsx', 'src/app/react-pwa.tsx',
 'src/settings/views/settings-view.ts', 'src/settings/views/settings-events.ts',
];
export const appSource = (): string => appSourceFiles.map((file) => readFileSync(new URL('../../../' + file, import.meta.url), 'utf8')).join('\n');
