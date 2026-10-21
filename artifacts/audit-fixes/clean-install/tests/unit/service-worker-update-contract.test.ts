// @ts-expect-error Vitest 於 Node 執行，但 production tsconfig 未納入 Node 型別。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const serviceWorker = readFileSync(new URL('../../src/service-worker.ts', import.meta.url), 'utf8');
const main = readFileSync(new URL('../../src/main.ts', import.meta.url), 'utf8');

describe('injectManifest prompt 更新契約', () => {
  it('等待中的 Worker 接收 SKIP_WAITING 後才跳過等待', () => {
    expect(serviceWorker).toContain("self.addEventListener('message'");
    expect(serviceWorker).toContain("event.data?.type === 'SKIP_WAITING'");
    expect(serviceWorker).toContain('self.skipWaiting()');
    expect(serviceWorker).not.toContain('clientsClaim();\nvoid self.skipWaiting()');
  });

  it('前端將等待切換與實際錯誤分開，並只在新版控制後重載', () => {
    expect(main).toContain("'新版仍在等待套用'");
    expect(main).toContain("transitionPwaUpdateState(pwaUpdateState, 'waiting')");
    expect(main).toContain('onNeedReload: () =>');
    expect(main).toContain('sessionStorage.setItem(PWA_UPDATE_SUCCESS_MARKER, \'1\')');
    expect(main).toContain('onRegisterError: () =>');
    expect(main).toContain('clearPwaUpdateTimeout()');
  });
});
