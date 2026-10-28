// @ts-expect-error Vitest 於 Node 執行，但 production tsconfig 未納入 Node 型別。
import { readFileSync } from 'node:fs';

// main.ts 拆分後，UI 契約測試要檢查的原始碼分散在這些檔案；斷言內容不變，只改為讀取整組檔案。
const appSourceFiles = [
  'src/main.ts', 'src/app/state.ts', 'src/app/shell.ts', 'src/app/sync-runtime.ts', 'src/app/workspace-events.ts',
  'src/account/account-controller.ts', 'src/water-level/water-shell.ts',
  'src/daily/views/daily-view.ts', 'src/daily/views/material-view.ts', 'src/daily/views/contact-view.ts', 'src/daily/views/special-view.ts',
  'src/daily/views/daily-entry.ts', 'src/daily/views/daily-events.ts', 'src/daily/views/daily-gestures.ts',
  'src/settings/views/settings-view.ts', 'src/settings/views/settings-events.ts',
];

export const appSource = (): string => appSourceFiles.map((file) => readFileSync(new URL(`../../../${file}`, import.meta.url), 'utf8')).join('\n');
