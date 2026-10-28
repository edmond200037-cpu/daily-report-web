import type { NamedMemory } from '../data/daily-repository';
import { escapeHtml } from '../shared/html';
import { appState } from './state';
import { settingsReturnLink } from '../settings/views/settings-view';
export const clearPwaUpdateTimeout = () => { if (appState.pwaUpdateTimeout !== undefined) { window.clearTimeout(appState.pwaUpdateTimeout); appState.pwaUpdateTimeout = undefined; } };
export const pwaUpdateNotice = () => {
  if (appState.pwaUpdateState === 'idle') return '';
  const content = appState.pwaUpdateState === 'available'
    ? { title: '已有新版施工日報', message: '新版已在背景下載完成。更新不會刪除本機日報資料。', actions: '<button type="button" data-app-action="dismiss-pwa-update">稍後</button><button type="button" class="primary" data-app-action="apply-pwa-update">立即更新</button>' }
    : appState.pwaUpdateState === 'applying'
      ? { title: '正在儲存資料並套用新版', message: '請勿關閉頁面。日報、記憶與水位資料正在安全儲存。', actions: '' }
      : appState.pwaUpdateState === 'waiting'
        ? { title: '新版仍在等待套用', message: '資料已安全儲存，可重新嘗試，或關閉其他已開啟的施工日報分頁後再更新。', actions: '<button type="button" data-app-action="dismiss-pwa-update">稍後</button><button type="button" class="primary" data-app-action="apply-pwa-update">重新嘗試</button>' }
      : appState.pwaUpdateState === 'success'
        ? { title: '更新完成', message: '已套用最新版，可以繼續使用。', actions: '<button type="button" data-app-action="dismiss-pwa-update">知道了</button>' }
        : { title: '更新未完成', message: '更新程序發生錯誤，使用者資料未被清除，請重新嘗試。', actions: '<button type="button" data-app-action="dismiss-pwa-update">稍後</button><button type="button" class="primary" data-app-action="apply-pwa-update">重新嘗試</button>' };
  return `<aside class="pwa-update-notice pwa-update-notice--${appState.pwaUpdateState}" role="status" aria-live="polite"><div><strong>${content.title}</strong><p>${content.message}</p></div><div class="pwa-update-notice__actions">${content.actions}</div></aside>`;
};
export const memoryOrder = (rows: NamedMemory[]) => rows.slice().sort((a, b) => (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? '') || b.usageCount - a.usageCount || a.name.localeCompare(b.name));
type ModuleHeaderControl = { kind: 'link'; href: string; label: string; ariaLabel: string } | { kind: 'action'; html: string };
export function moduleHeader(title: string, meta: string, control?: ModuleHeaderControl, metaAttributes = ''): string {
  const right = !control ? '' : control.kind === 'link' ? `<a class="settings-button" href="${control.href}" aria-label="${control.ariaLabel}">${control.label}</a>` : control.html;
  return `<header class="top app-header app-header--module module-page__header"><div class="app-header__title"><p class="app-header__meta"${metaAttributes}>${escapeHtml(meta)}</p><h1>${escapeHtml(title)}</h1></div>${right}</header>`;
}
export function syncControl(kind: 'daily' | 'water' = 'daily'): string {
  if (!appState.accountAuth.user || !appState.accountActiveSiteId) return '';
  const pulled = appState.lastPulledAt ? new Date(appState.lastPulledAt).toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '尚未同步';
  const current = kind === 'daily' ? `日報日期：${appState.daily.report.date}` : `共用工地：${appState.accountSites.find((site) => site.id === appState.accountActiveSiteId)?.name ?? '目前工地'}`;
  return `<section class="manual-sync" aria-label="共用工地同步"><div><strong>${escapeHtml(current)}</strong><small>本機上次取得雲端資料：${escapeHtml(pulled)}</small>${appState.syncFeedback ? `<small role="status">${escapeHtml(appState.syncFeedback)}</small>` : ''}</div><button type="button" class="primary" data-sync-now${appState.syncInFlight ? ' disabled' : ''}>${appState.syncInFlight ? '同步中…' : '立即同步'}</button></section>`;
}
export function moduleTabs(active: 'daily' | 'water-level'): string {
  return `<nav class="top-tabs" aria-label="主要功能"><a href="#daily"${active === 'daily' ? ' class="active" aria-current="page"' : ''}>施工日報</a><a href="#water-level"${active === 'water-level' ? ' class="active" aria-current="page"' : ''}>水位變化</a></nav>`;
}
export function normalizeSearch(value: string): string { return value.trim().replace(/　/g, ' ').replace(/\s+/g, ' ').toLocaleLowerCase('en-US'); }
export function settingsHeader(title: string, home = false): string { return `<header class="top app-header"><div><h1>${title}</h1></div><div class="settings-header-actions">${home ? settingsReturnLink() : '<a class="settings-button" href="#settings" aria-label="返回設定">‹ 設定</a>'}</div></header>`; }
