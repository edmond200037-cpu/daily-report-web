import { loadActiveSharedScope } from '../sync/context';
import { parseRoute } from '../main';
import { appState, type AppRoute, app, waterEditors, type WaterController, settingsState } from '../app/state';
import { settingsHeader, moduleHeader, moduleTabs, syncControl, pwaUpdateNotice } from '../app/shell';
import { refreshDailySyncStatus } from '../app/sync-runtime';
import { workspaceSiteView } from '../daily/views/daily-view';
import { refreshTaskSearch } from '../settings/views/settings-view';
function waterShell(settings: boolean): string { const shellClass = settings ? 'app-shell settings-page water-settings-shell' : 'app-shell module-page water-page-shell'; const sharedSite = appState.accountAuth.user ? appState.accountSites.find((item) => item.id === appState.accountActiveSiteId)?.name : undefined; const control = { kind: 'link' as const, href: '#settings', label: '設定', ariaLabel: '開啟設定' }; const header = settings ? settingsHeader('水位井位') : sharedSite ? moduleHeader('水位變化', `共用工地：${sharedSite}`, control) : moduleHeader('水位變化', '本機量測資料', control); return `<main class="${shellClass}">${header}${settings ? '' : `<div class="module-page__tabs">${moduleTabs('water-level')}</div>${workspaceSiteView()}${syncControl('water')}`}<div id="water-root"></div></main>`; }
export async function mountWater(route: Extract<AppRoute, { module: 'water-level' }>, token: number): Promise<void> {
  app.innerHTML = waterShell(route.page === 'settings');
  const root = app.querySelector<HTMLElement>('#water-root');
  if (!root) throw new Error('找不到水位功能容器。');
  const module = await import('./controller.js');
  if (token !== appState.renderToken) return;
  const scope = await loadActiveSharedScope();
  if (token !== appState.renderToken) return;
  const key = scope ? `${scope.userId}:${scope.siteId}` : 'local';
  let controller = waterEditors.get(key);
  if (!controller) {
    controller = new module.WaterLevelController(root, () => { void refreshDailySyncStatus(); }) as WaterController;
    await controller.initialize();
    waterEditors.set(key, controller);
  } else { controller.root = root; await controller.refresh(); }
  appState.water = controller;
  if (token !== appState.renderToken) return;
  if (route.page === 'settings') controller.renderSettings(); else controller.render();
  app.insertAdjacentHTML('beforeend', pwaUpdateNotice());
}
export function bindWaterInputEvents(): void {
  app.addEventListener('input', (event) => {
    const target = event.target as HTMLInputElement;
    const route = parseRoute(location.hash);
    if (route.module === 'water-level' && appState.water && (target.dataset.waterField || target.dataset.waterReading)) void appState.water.handleInput(target);
    if (route.module === 'daily' && route.page === 'settings') {
      if (target.dataset.settingsSearch === 'tasks' && !appState.settingsSearchComposing && !(event as InputEvent).isComposing) refreshTaskSearch(target);
      if (target.closest('[data-settings-form]')) settingsState.dirty = true;
    }
  });
}
