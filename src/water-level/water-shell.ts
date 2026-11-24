import { createElement } from 'react';
import { loadActiveSharedScope } from '../sync/context';
import { appState, type AppRoute, app, waterEditors, type WaterController, settingsState } from '../app/state';
import { refreshDailySyncStatus } from '../app/sync-runtime';
import { mountContent } from '../app/react-content';
import { WaterPage } from '../app/react-water';
import { parseRoute } from '../main';
export async function mountWater(_route: Extract<AppRoute, { module: 'water-level' }>, token: number): Promise<void> {
  const module = await import('./controller.js');
  if (token !== appState.renderToken) return;
  const scope = await loadActiveSharedScope();
  if (token !== appState.renderToken) return;
  const key = scope ? `${scope.userId}:${scope.siteId}` : 'local';
  let controller = waterEditors.get(key);
  if (!controller) {
    controller = new module.WaterLevelController(app, () => { void refreshDailySyncStatus(); }) as WaterController;
    await controller.initialize();
    waterEditors.set(key, controller);
  } else { controller.root = app; await controller.refresh(); }
  if (token !== appState.renderToken) return;
  appState.water = controller;
  mountContent(createElement(WaterPage));
}
export function bindWaterInputEvents(): void {
  app.addEventListener('input', (event) => {
    const target = event.target as HTMLInputElement;
    const route = parseRoute(location.hash);
    if (route.module === 'daily' && route.page === 'settings' && target.closest('[data-settings-form]')) settingsState.dirty = true;
  });
}
