import './styles.css';
import './daily/daily.css';
import './daily/debug-layout.css';
import './daily/dialog.css';
import { DailyController } from './daily/daily-controller';
import { formatDailyReport } from './daily/daily-formatter';
import { loadDailyDraft } from './data/daily-repository';
import type { DailyReportV3, TradeSection } from './domain/daily';

type AppRoute =
  | { module: 'daily'; page: 'main' }
  | { module: 'daily'; page: 'settings' }
  | { module: 'water-level'; page: 'main' }
  | { module: 'water-level'; page: 'settings' };
type WaterController = { initialize(): Promise<void>; render(): void; renderSettings(): void; handleInput(target: HTMLElement): Promise<void>; handleAction(action: string, id?: string): Promise<void>; preview(): string; mode: string };

const app = document.querySelector<HTMLDivElement>('#app')!;
let daily!: DailyController;
let water: WaterController | undefined;
let tradePickerOpen = false;
let renderToken = 0;
const escapeHtml = (value: string) => value.replace(/[&<>']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;' }[char]!));
const field = (label: string, name: string, value: string, type = 'text') => `<label>${label}<input data-daily-field="${name}" type="${type}" value="${escapeHtml(value)}"></label>`;
const tabs: Array<[DailyReportV3['activeTab'], string]> = [['engineering', '工程條目'], ['supplies', '進料'], ['contacts', '聯絡事項'], ['special', '特殊事項']];

function parseRoute(hash: string): AppRoute {
  const normalized = hash || '#daily';
  if (normalized === '#daily') return { module: 'daily', page: 'main' };
  if (normalized === '#daily/settings') return { module: 'daily', page: 'settings' };
  if (normalized === '#water-level') return { module: 'water-level', page: 'main' };
  if (normalized === '#water-level/settings') return { module: 'water-level', page: 'settings' };
  return { module: 'daily', page: 'main' };
}

function dailyTabs(): string { return `<section class="daily-tabs" role="tablist" aria-label="施工日報分類">${tabs.map(([id, label]) => `<button type="button" role="tab" data-daily-tab="${id}" aria-selected="${daily.report.activeTab === id}" class="${daily.report.activeTab === id ? 'active' : ''}">${label}</button>`).join('')}</section>`; }
function workItemView(trade: TradeSection, vendorId: string, work: TradeSection['vendors'][number]['workItems'][number], index: number, total: number): string {
  return `<div class="work-item" data-work="${work.id}"><select data-daily-field="locationMode"><option value="none" ${work.locationMode === 'none' ? 'selected' : ''}>無位置</option><option value="single-floor" ${work.locationMode === 'single-floor' ? 'selected' : ''}>單一樓層</option><option value="floor-range" ${work.locationMode === 'floor-range' ? 'selected' : ''}>樓層範圍</option><option value="free-text" ${work.locationMode === 'free-text' ? 'selected' : ''}>自由位置</option></select>${field('位置', 'locationText', work.locationText)}${field('工項', 'taskTextSnapshot', work.taskTextSnapshot)}<label>備註<textarea data-daily-field="note">${escapeHtml(work.note)}</textarea></label><div class="work-item-actions"><div class="work-item-order-actions"><button type="button" data-daily-action="move-work" data-trade-id="${trade.id}" data-vendor-id="${vendorId}" data-work-index="${index}" data-direction="-1" ${index === 0 ? 'disabled' : ''}>上移</button><button type="button" data-daily-action="move-work" data-trade-id="${trade.id}" data-vendor-id="${vendorId}" data-work-index="${index}" data-direction="1" ${index === total - 1 ? 'disabled' : ''}>下移</button></div><button type="button" class="danger-text work-item-delete" data-daily-action="delete-work-item" data-trade-id="${trade.id}" data-vendor-id="${vendorId}" data-work-item-id="${work.id}">刪除工項</button></div></div>`;
}
function tradeCard(trade: TradeSection, index: number): string {
  const expanded = daily.expandedId === trade.id;
  if (!expanded) return `<article class="trade-card trade-card--${trade.status}" data-trade="${trade.id}"><button type="button" class="trade-card__header" data-daily-action="toggle-trade" data-id="${trade.id}"><span>☰ ${escapeHtml(trade.tradeNameSnapshot || '未命名工種')}</span><span>${trade.status === 'complete' ? '▸' : '⚠ 未完成'}</span></button><div class="card-actions"><button type="button" data-daily-action="move-trade" data-id="${trade.id}" data-direction="-1" ${index === 0 ? 'disabled' : ''}>↑</button><button type="button" data-daily-action="move-trade" data-id="${trade.id}" data-direction="1" ${index === daily.report.tradeSections.length - 1 ? 'disabled' : ''}>↓</button></div></article>`;
  return `<article class="trade-card trade-card--draft" data-trade="${trade.id}"><header><strong>${escapeHtml(trade.tradeNameSnapshot)}</strong><span>編輯中</span></header>${trade.vendors.map((vendor) => `<section class="vendor-card" data-vendor="${vendor.id}">${field('廠商', 'vendorNameSnapshot', vendor.vendorNameSnapshot)}${field('施工人數（選填）', 'workerCount', vendor.workerCount)}${vendor.workItems.map((work, workIndex) => workItemView(trade, vendor.id, work, workIndex, vendor.workItems.length)).join('') || '<p class="empty">尚無工項。</p>'}<button type="button" data-daily-action="add-work" data-trade-id="${trade.id}" data-vendor-id="${vendor.id}">＋ 新增工項</button></section>`).join('')}<div class="action-row"><button type="button" data-daily-action="add-vendor" data-id="${trade.id}">＋ 廠商</button><button type="button" data-daily-action="collapse">暫時收合</button><button type="button" class="primary" data-daily-action="complete" data-id="${trade.id}">完成工種</button></div></article>`;
}
function activeTabContent(): string {
  if (daily.report.activeTab === 'engineering') return `<section class="trade-list">${daily.report.tradeSections.map(tradeCard).join('') || '<p class="empty">尚未新增工程條目。</p>'}</section>`;
  if (daily.report.activeTab === 'supplies') return `<section class="form-card"><h2>進料</h2><div class="quick-add"><button type="button" data-daily-action="add-supply" data-type="concrete">＋ 混凝土</button><button type="button" data-daily-action="add-supply" data-type="clsm">＋ CLSM</button><button type="button" data-daily-action="add-supply" data-type="rebar">＋ 鋼筋</button><button type="button" data-daily-action="add-supply" data-type="other">＋ 其他</button></div>${daily.report.supplies.map((item) => `<section class="entry" data-supply="${item.id}"><strong>${item.type}</strong>${field('數量', 'quantity', item.quantity)}<button type="button" class="danger-text" data-daily-action="delete-supply" data-id="${item.id}">刪除</button></section>`).join('') || '<p class="empty">尚未新增進料。</p>'}</section>`;
  if (daily.report.activeTab === 'contacts') return `<section class="form-card"><h2>聯絡事項</h2><button type="button" data-daily-action="add-contact">＋ 新增聯絡事項</button>${daily.report.contacts.map((item) => `<section class="entry" data-contact="${item.id}">${field('工種', 'tradeNameSnapshot', item.tradeNameSnapshot)}${field('廠商', 'vendorNameSnapshot', item.vendorNameSnapshot)}${field('預定日期', 'plannedDate', item.plannedDate, 'date')}<label>內容<textarea data-daily-field="content">${escapeHtml(item.content)}</textarea></label><button type="button" class="danger-text" data-daily-action="delete-contact" data-id="${item.id}">刪除</button></section>`).join('') || '<p class="empty">尚未新增聯絡事項。</p>'}</section>`;
  return `<section class="form-card"><h2>特殊事項</h2><button type="button" data-daily-action="add-special">＋ 新增特殊事項</button>${daily.report.specialItems.map((item) => `<section class="entry" data-special="${item.id}"><label>事項內容<textarea data-daily-field="content">${escapeHtml(item.content)}</textarea></label><button type="button" class="danger-text" data-daily-action="delete-special" data-id="${item.id}">刪除</button></section>`).join('') || '<p class="empty">尚未新增特殊事項。</p>'}</section>`;
}
function dailyView(): string {
  const completed = daily.report.tradeSections.filter((trade) => trade.status === 'complete'); const drafts = daily.report.tradeSections.filter((trade) => trade.status === 'draft');
  const picker = tradePickerOpen ? `<div class="dialog-backdrop"><form class="trade-picker" id="trade-picker-form"><h2>新增工種</h2><label>工種名稱<input name="tradeName" required autofocus placeholder="例如：輕隔間工程"></label><div class="action-row"><button type="button" data-daily-action="close-trade-picker">取消</button><button class="primary" type="submit">建立工種</button></div></form></div>` : '';
  return `<main class="app-shell"><header class="top app-header"><div><p class="eyebrow">FIELD NOTEBOOK · LOCAL ONLY</p><h1>施工日報</h1></div><a class="settings-button" href="#daily/settings" aria-label="開啟施工日報設定">⚙ 設定</a></header><nav class="top-tabs"><a class="active" href="#daily">施工日報</a><a href="#water-level">水位變化</a></nav><section class="basics">${field('日期', 'date', daily.report.date, 'date')}${field('工地', 'siteNameSnapshot', daily.report.siteNameSnapshot)}</section>${dailyTabs()}${activeTabContent()}${daily.report.activeTab === 'engineering' && !daily.expandedId ? '<button type="button" class="floating-add-trade" data-daily-action="add-trade">＋ 工種</button>' : ''}<aside class="preview bottom-preview"><p class="eyebrow">DAILY OUTPUT</p><strong>${daily.report.siteNameSnapshot || '尚未設定工地'}｜${daily.report.date}</strong><div class="preview-tags">${completed.map((trade) => `<button type="button" data-daily-action="toggle-trade" data-id="${trade.id}">${escapeHtml(trade.tradeNameSnapshot)}</button>`).join('')}</div>${drafts.length ? `<p>尚有 ${drafts.length} 個未完成工種未納入預覽。</p>` : ''}<pre>${escapeHtml(formatDailyReport(daily.report) || '完成工種後，這裡會顯示日報預覽。')}</pre><button type="button" class="primary" data-daily-action="copy" ${drafts.length ? 'disabled' : ''}>複製完整日報</button></aside>${picker}</main>`;
}
function dailySettingsView(): string { return `<main class="app-shell settings-page"><header class="top app-header"><div><p class="eyebrow">DAILY SETTINGS</p><h1>施工日報設定</h1></div><a class="settings-button" href="#daily">返回日報</a></header><nav class="top-tabs"><a class="active" href="#daily">施工日報</a><a href="#water-level">水位變化</a></nav><section class="form-card"><h2>設定入口</h2><ul><li>工地管理</li><li>工種管理</li><li>廠商管理</li><li>工項管理</li><li>樓層管理</li><li>特殊事項模板</li><li>備份與還原</li><li>偵錯資訊</li></ul><p class="hint">此頁與主日報共用同一份草稿資料；切換頁面不會清除未完成工種或日期。</p></section></main>`; }
function waterShell(settings: boolean): string { return `<main class="app-shell"><header class="top app-header"><div><p class="eyebrow">${settings ? 'WATER LEVEL SETTINGS' : 'WATER LEVEL'}</p><h1>${settings ? '水位設定' : '水位變化'}</h1></div><a class="settings-button" href="${settings ? '#water-level' : '#water-level/settings'}">${settings ? '返回水位' : '⚙ 設定'}</a></header><nav class="top-tabs"><a href="#daily">施工日報</a><a class="active" href="#water-level">水位變化</a></nav><div id="water-root"></div>${settings ? '' : '<aside class="preview bottom-preview"><p class="eyebrow">WATER OUTPUT</p><pre id="water-preview-output">尚無水位紀錄。</pre><button type="button" class="primary" data-water-action="copy-water">複製最近三天</button></aside>'}</main>`; }
function renderWaterPreview(): void { const output = app.querySelector<HTMLPreElement>('#water-preview-output'); if (output && water) output.textContent = water.preview() || '尚無水位紀錄。'; }
async function mountWater(route: Extract<AppRoute, { module: 'water-level' }>, token: number): Promise<void> {
  app.innerHTML = waterShell(route.page === 'settings');
  const root = app.querySelector<HTMLElement>('#water-root');
  if (!root) throw new Error('找不到水位功能容器。');
  const module = await import('./water-level/controller.js');
  if (token !== renderToken) return;
  const controller = new module.WaterLevelController(root) as WaterController;
  water = controller;
  await controller.initialize();
  if (token !== renderToken) return;
  if (route.page === 'settings') controller.renderSettings(); else { controller.render(); renderWaterPreview(); }
}
async function renderApp(): Promise<void> {
  const token = ++renderToken; const route = parseRoute(location.hash); water = undefined;
  if (route.module === 'daily') { app.innerHTML = route.page === 'settings' ? dailySettingsView() : dailyView(); return; }
  try { await mountWater(route, token); } catch (error) { if (token !== renderToken) return; const summary = error instanceof Error ? error.message : '無法讀取本機水位資料。'; app.innerHTML = `<main class="app-shell"><section class="form-card"><h1>水位功能暫時無法開啟</h1><p>錯誤摘要：${escapeHtml(summary)}</p><p><a href="#water-level">重新載入</a>　<a href="#daily">返回施工日報</a></p></section></main>`; }
}
function updateDailyInput(target: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): void {
  const name = target.dataset.dailyField; if (!name) return;
  const tradeId = target.closest<HTMLElement>('[data-trade]')?.dataset.trade; const vendorId = target.closest<HTMLElement>('[data-vendor]')?.dataset.vendor; const workId = target.closest<HTMLElement>('[data-work]')?.dataset.work; const supplyId = target.closest<HTMLElement>('[data-supply]')?.dataset.supply; const contactId = target.closest<HTMLElement>('[data-contact]')?.dataset.contact; const specialId = target.closest<HTMLElement>('[data-special]')?.dataset.special;
  daily.update(() => { const trade = tradeId ? daily.trade(tradeId) : undefined; const vendor = trade?.vendors.find((item) => item.id === vendorId); const work = vendor?.workItems.find((item) => item.id === workId); const supply = daily.report.supplies.find((item) => item.id === supplyId); const contact = daily.report.contacts.find((item) => item.id === contactId); const special = daily.report.specialItems.find((item) => item.id === specialId); const destination = work ?? vendor ?? supply ?? contact ?? special ?? daily.report; (destination as unknown as Record<string, string>)[name] = target.value; });
}
app.addEventListener('input', (event) => { const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement; const route = parseRoute(location.hash); if (route.module === 'water-level' && water && (target.dataset.waterField || target.dataset.waterReading)) { void water.handleInput(target); return; } if (route.module === 'daily' && route.page === 'main') updateDailyInput(target); });
app.addEventListener('click', async (event) => {
  const target = event.target as HTMLElement; const route = parseRoute(location.hash);
  const tab = target.closest<HTMLButtonElement>('[data-daily-tab]'); if (tab && route.module === 'daily') { daily.switchTab(tab.dataset.dailyTab as DailyReportV3['activeTab']); await daily.flush(); await renderApp(); return; }
  const waterButton = target.closest<HTMLButtonElement>('[data-water-action],[data-water-view]');
  if (waterButton && route.module === 'water-level' && water) { if (waterButton.dataset.waterView) { water.mode = waterButton.dataset.waterView; water.render(); renderWaterPreview(); return; } if (waterButton.dataset.waterAction === 'copy-water') { await navigator.clipboard.writeText(water.preview()); return; } if (waterButton.dataset.waterAction) { await water.handleAction(waterButton.dataset.waterAction, waterButton.dataset.id); if (route.page === 'settings') water.renderSettings(); else renderWaterPreview(); } return; }
  const button = target.closest<HTMLButtonElement>('[data-daily-action]'); if (!button || route.module !== 'daily' || route.page !== 'main') return;
  const action = button.dataset.dailyAction!;
  if (action === 'add-trade') { tradePickerOpen = true; await renderApp(); return; }
  if (action === 'close-trade-picker') { tradePickerOpen = false; await renderApp(); return; }
  if (action === 'toggle-trade') daily.toggle(button.dataset.id!);
  else if (action === 'collapse') daily.expandedId = null;
  else if (action === 'add-vendor') daily.addVendor(button.dataset.id!);
  else if (action === 'add-work') daily.addWorkItem(button.dataset.tradeId!, button.dataset.vendorId!);
  else if (action === 'delete-work-item') daily.deleteWorkItem(button.dataset.tradeId!, button.dataset.vendorId!, button.dataset.workItemId!);
  else if (action === 'complete') { const issues = daily.complete(button.dataset.id!); if (issues.length) alert(`尚未完成：\n${issues.join('\n')}`); }
  else if (action === 'copy') { await navigator.clipboard.writeText(formatDailyReport(daily.report)); }
  else if (action === 'move-trade') daily.update(() => { const index = daily.report.tradeSections.findIndex((trade) => trade.id === button.dataset.id); const next = index + Number(button.dataset.direction); if (next >= 0 && next < daily.report.tradeSections.length) [daily.report.tradeSections[index], daily.report.tradeSections[next]] = [daily.report.tradeSections[next], daily.report.tradeSections[index]]; daily.report.tradeSections.forEach((trade, itemIndex) => trade.sortOrder = itemIndex); });
  else if (action === 'move-work') daily.update(() => { const vendor = daily.trade(button.dataset.tradeId!)?.vendors.find((item) => item.id === button.dataset.vendorId!); const index = Number(button.dataset.workIndex); const next = index + Number(button.dataset.direction); if (vendor && next >= 0 && next < vendor.workItems.length) [vendor.workItems[index], vendor.workItems[next]] = [vendor.workItems[next], vendor.workItems[index]]; vendor?.workItems.forEach((work, itemIndex) => work.sortOrder = itemIndex); });
  else if (action === 'add-supply') daily.addSupply(button.dataset.type as 'concrete' | 'clsm' | 'rebar' | 'other');
  else if (action === 'add-contact') daily.addContact(); else if (action === 'add-special') daily.addSpecial();
  else if (action === 'delete-supply') daily.update(() => daily.report.supplies = daily.report.supplies.filter((item) => item.id !== button.dataset.id));
  else if (action === 'delete-contact') daily.update(() => daily.report.contacts = daily.report.contacts.filter((item) => item.id !== button.dataset.id));
  else if (action === 'delete-special') daily.update(() => daily.report.specialItems = daily.report.specialItems.filter((item) => item.id !== button.dataset.id));
  await daily.flush(); await renderApp();
});
app.addEventListener('submit', async (event) => { const form = event.target as HTMLFormElement; if (form.id === 'trade-picker-form') { event.preventDefault(); const name = String(new FormData(form).get('tradeName') ?? ''); if (name.trim()) daily.addTrade(name); tradePickerOpen = false; await daily.flush(); await renderApp(); return; } if (form.id === 'point-form' && water) { event.preventDefault(); await water.handleAction('save-point', String(new FormData(form).get('name') ?? '')); water.renderSettings(); } });
window.addEventListener('hashchange', () => { if (parseRoute(location.hash).module === 'water-level') void daily.flush(); void renderApp(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) void daily.flush(); });
async function bootstrap(): Promise<void> { daily = new DailyController(await loadDailyDraft()); if (!location.hash) location.hash = '#daily'; await renderApp(); if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register(`${import.meta.env.BASE_URL}service-worker.js`).catch(() => undefined); }
bootstrap().catch(() => { app.innerHTML = '<main class="app-shell"><h1>無法開啟施工日報</h1><p>請確認瀏覽器允許本機資料儲存。</p></main>'; });
