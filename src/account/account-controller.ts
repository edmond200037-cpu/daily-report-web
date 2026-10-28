import { loadAuthSnapshot, signInWithGoogle, signOut } from '../auth/auth-service';
import { listAccessibleSites, listPendingJoinRequests, listSiteMembers, approveSiteMember, rejectSiteMember, updateSiteMemberRole, removeSiteMember, createSharedSite, requestSiteAccess } from '../data/remote/site-repository';
import { selectActiveSharedSite, loadSharedContext, cacheActiveSiteRole } from '../data/local/shared-context';
import { renderAccountPage } from './account-view';
import { withAccountDeadline, AccountLoadTimeoutError } from './load-timeout';
import { listAllOperations, retryMissingRpcOperations } from '../sync/outbox';
import { runSyncOnce, refreshCloudMemoryLibrary } from '../sync/engine';
import { persistActiveMemoryPartition, readLocalMemoryImportSource, queueMemoryImport } from '../data/memory-partition';
import { previewMemoryImport } from '../sync/memory-import';
import { persistActiveWaterPartition } from '../data/water-partition';
import { listConflictReviews, exportConflictBackups, queueConflictResolution } from '../sync/conflict-review';
import { previewSyncRecovery, applySyncRecovery } from '../sync/recovery';
import { escapeHtml } from '../shared/html';
import { renderApp, parseRoute } from '../main';
import { appState, type AccountLoadStage, app } from '../app/state';
import { settingsHeader, settingsContextTabs, pwaUpdateNotice } from '../app/shell';
import { switchActiveDataPartition, scheduleBackgroundSync, readCloudMemoryEntries, cloudMemorySignature, syncActiveSiteNow, isReadOnlySite } from '../app/sync-runtime';
import { debugPanel } from '../settings/views/settings-view';
export async function selectSharedSiteFromWorkspace(siteId: string): Promise<void> {
  if (!appState.accountAuth.user || siteId === appState.accountActiveSiteId || !appState.accountSites.some((site) => site.id === siteId)) return;
  const role = appState.accountSites.find((site) => site.id === siteId)?.role ?? null;
  await switchActiveDataPartition(async () => { await selectActiveSharedSite(appState.accountAuth.user!.id, siteId, role); });
  appState.accountActiveSiteId = siteId;
  appState.accountActiveSiteRole = role;
  await refreshAccount();
  await renderApp();
}
export async function refreshAccount(onProgress?: () => void): Promise<void> {
  const version = ++appState.accountLoadVersion;
  appState.accountError = '';
  appState.accountLoadEvents = [];
  appState.accountLoadStartedAt = Date.now();
  appState.accountLoadCoreReady = false;
  appState.accountLoadExtrasPending = false;
  const current = () => version === appState.accountLoadVersion;
  const run = async <T,>(stage: AccountLoadStage, task: Promise<T>): Promise<T> => {
    const started = Date.now();
    const remaining = Math.max(1, 15_000 - (started - appState.accountLoadStartedAt));
    if (current()) { appState.accountLoadStage = stage; appState.accountLoadEvents.push({ stage, status: 'loading', durationMs: 0 }); onProgress?.(); }
    try {
      const result = await withAccountDeadline(task, remaining);
      if (!current()) throw new Error('ACCOUNT_LOAD_STALE');
      const event = appState.accountLoadEvents.findLast((row) => row.stage === stage && row.status === 'loading');
      if (event) { event.status = 'ok'; event.durationMs = Date.now() - started; }
      onProgress?.();
      return result;
    } catch (error) {
      if (current()) {
        const event = appState.accountLoadEvents.findLast((row) => row.stage === stage && row.status === 'loading');
        if (event) { event.status = error instanceof AccountLoadTimeoutError ? 'timeout' : 'error'; event.durationMs = Date.now() - started; const code = (error as { code?: unknown })?.code; if (typeof code === 'string' && /^[A-Z0-9_]{2,20}$/.test(code)) event.code = code; }
        onProgress?.();
      }
      throw error;
    }
  };
  try {
    const auth = await run('帳號驗證', loadAuthSnapshot());
    if (!current()) return;
    appState.accountAuth = auth;
    if (!auth.user) {
      appState.accountSites = []; appState.accountRequests = []; appState.accountMembers = []; appState.accountActiveSiteId = null; appState.accountActiveSiteRole = null;
      appState.accountPendingCount = 0; appState.accountSyncDiagnostics = []; appState.accountSyncOperations = []; appState.accountConflictReviews = [];
      appState.accountQueueStatus = 'ready'; appState.accountLoadCoreReady = true; appState.accountLoadStage = null; onProgress?.(); return;
    }
    const [sites, context] = await run('工地清單', Promise.all([listAccessibleSites(auth.user.id), loadSharedContext(auth.user.id)]));
    if (!current()) return;
    appState.accountSites = sites;
    appState.accountActiveSiteId = sites.some((site) => site.id === context.activeSiteId) ? context.activeSiteId : null;
    appState.accountActiveSiteRole = sites.find((site) => site.id === appState.accountActiveSiteId)?.role ?? null;
    void cacheActiveSiteRole(auth.user.id, appState.accountActiveSiteRole).catch(() => {});
    appState.accountRequests = []; appState.accountMembers = []; appState.accountSyncOperations = []; appState.accountSyncDiagnostics = []; appState.accountPendingCount = 0; appState.accountConflictReviews = [];
    appState.accountQueueStatus = appState.accountActiveSiteId ? 'loading' : 'ready';
    appState.accountLoadCoreReady = true;
    appState.accountLoadExtrasPending = true;
    onProgress?.();
    if (context.activeSiteId && !appState.accountActiveSiteId) void selectActiveSharedSite(auth.user.id, null).catch(() => {});
    const scope = appState.accountActiveSiteId ? { userId: auth.user.id, siteId: appState.accountActiveSiteId } : null;
    const queueTask = run('本機同步佇列', scope ? listAllOperations(scope) : Promise.resolve([])).then((operations) => { if (current()) { appState.accountSyncOperations = operations; appState.accountPendingCount = operations.length; appState.accountSyncDiagnostics = operations.filter((row) => row.status === 'failed' || row.status === 'conflict' || row.status === 'blocked'); appState.accountQueueStatus = 'ready'; } return operations; }).catch((error) => { if (current()) appState.accountQueueStatus = 'error'; throw error; });
    const optional = await Promise.allSettled([
      run('成員資料', Promise.all([listPendingJoinRequests(sites), listSiteMembers(sites)])).then(([requests, members]) => { if (current()) { appState.accountRequests = requests; appState.accountMembers = members; } }),
      queueTask,
      run('衝突資料', scope ? queueTask.then(async (operations) => {
        const reviews = await listConflictReviews(scope, operations);
        if (operations.some((row) => row.status === 'conflict') && !reviews.length) throw new Error('本機衝突操作未產生衝突明細。');
        return reviews;
      }) : Promise.resolve([])).then((reviews) => { if (current()) appState.accountConflictReviews = reviews; }),
    ]);
    if (!current()) return;
    appState.accountLoadExtrasPending = false;
    appState.accountLoadStage = null;
    if (optional.some((result) => result.status === 'rejected')) appState.accountError = '部分工地資料讀取失敗或逾時；可查看偵錯資訊並重新讀取。';
    onProgress?.();
  } catch (error) {
    if (!current()) return;
    appState.accountLoadStage = null;
    appState.accountLoadExtrasPending = false;
    const timeout = error instanceof AccountLoadTimeoutError;
    appState.accountError = timeout ? '讀取共用工地超過 15 秒，請查看偵錯資訊並重新讀取。' : '無法讀取共用工地，請查看偵錯資訊並重新讀取。';
    onProgress?.();
  }
}
function accountModuleMarkup(content: string): string {
  const isDebug = parseRoute(location.hash).page === 'debug';
  return `<main class="app-shell settings-page account-page-shell">${settingsHeader('', isDebug ? '偵錯與同步' : '共用工地')}${settingsContextTabs(isDebug ? 'debug' : 'account')}${content}${isDebug ? debugPanel() : ''}</main>${pwaUpdateNotice()}`;
}
export function renderAccountLoading(): void {
  const content = appState.accountError
    ? `<section class="account-content"><section class="form-card account-status" role="alert"><strong>${escapeHtml(appState.accountError)}</strong><p>最後階段：${escapeHtml(appState.accountLoadEvents.at(-1)?.stage ?? '尚未開始')}</p><button type="button" data-account-action="retry-load-account">重新讀取</button></section></section>`
    : `<section class="account-content"><section class="form-card account-status" aria-busy="true"><strong>正在載入共用工地…</strong><p>目前階段：${escapeHtml(appState.accountLoadStage ?? '準備中')}。超過 15 秒將顯示錯誤與重試。</p></section></section>`;
  app.innerHTML = accountModuleMarkup(content);
}
export function renderAccountLoaded(): void {
  const progress = appState.accountLoadExtrasPending ? '<p class="hint" role="status">工地已可使用，成員與同步診斷仍在載入…</p>' : '';
  app.innerHTML = accountModuleMarkup(progress + renderAccountPage({ view: parseRoute(location.hash).page === 'debug' ? 'debug' : 'account', syncing: appState.syncInFlight, auth: appState.accountAuth, sites: appState.accountSites, activeSiteId: appState.accountActiveSiteId, pendingCount: appState.accountPendingCount, requests: appState.accountRequests, members: appState.accountMembers, feedback: appState.accountFeedback, error: appState.accountError, diagnostics: appState.accountSyncDiagnostics, operations: appState.accountSyncOperations, operationsStatus: appState.accountQueueStatus, conflicts: appState.accountConflictReviews, importPreview: appState.memoryImportSiteId === appState.accountActiveSiteId ? appState.memoryImportPreview : null, recoveryPreview: appState.syncRecoverySiteId === appState.accountActiveSiteId ? appState.syncRecoveryPreview : null }));
}
export function bindAccountEvents(): void {
  app.addEventListener('click', (event) => {
    const jump = (event.target as HTMLElement).closest<HTMLElement>('[data-account-jump]');
    if (!jump?.dataset.accountJump) return;
    document.getElementById(jump.dataset.accountJump)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  });
  app.addEventListener('click', async (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-account-action]');
    if (!button) return;
    event.stopImmediatePropagation();
    appState.accountFeedback = ''; appState.accountError = '';
    try {
      if (button.dataset.accountAction === 'retry-load-account') {
        const token = ++appState.renderToken; appState.accountError = ''; renderAccountLoading();
        await refreshAccount(() => { if (token !== appState.renderToken || parseRoute(location.hash).module !== 'account') return; if (appState.accountLoadCoreReady) renderAccountLoaded(); else renderAccountLoading(); });
        return;
      }
      if (button.dataset.accountAction === 'load-conflict-reviews' && appState.accountAuth.user && appState.accountActiveSiteId) {
        const token = appState.renderToken;
        button.disabled = true; button.textContent = '讀取中…';
        try {
          const scope = { userId: appState.accountAuth.user.id, siteId: appState.accountActiveSiteId };
          const operations = await listAllOperations(scope);
          const reviews = await listConflictReviews(scope, operations);
          if (token !== appState.renderToken || parseRoute(location.hash).module !== 'account') return;
          appState.accountSyncOperations = operations; appState.accountPendingCount = operations.length;
          appState.accountSyncDiagnostics = operations.filter((row) => row.status === 'failed' || row.status === 'conflict' || row.status === 'blocked');
          appState.accountConflictReviews = reviews;
          if (operations.some((row) => row.status === 'conflict') && !reviews.length) appState.accountError = '本機有衝突操作，但仍無法產生衝突明細；備份與原始操作均已保留。';
        } catch (error) {
          if (token !== appState.renderToken || parseRoute(location.hash).module !== 'account') return;
          appState.accountError = `讀取衝突明細失敗：${error instanceof Error ? error.message : '未知錯誤'}。本機操作仍保留。`;
        }
        renderAccountLoaded();
        return;
      }
      if (button.dataset.accountAction === 'sign-in') { await Promise.all([persistActiveMemoryPartition(), persistActiveWaterPartition()]); await signInWithGoogle(); return; }
      if (button.dataset.accountAction === 'sign-out') { await switchActiveDataPartition(signOut); appState.accountSites = []; appState.accountActiveSiteId = null; appState.accountActiveSiteRole = null; appState.accountFeedback = '已登出並切回本機草稿與記憶資料；共用工地快取仍保留在此裝置。'; }
      if (button.dataset.accountAction === 'copy-join-code' && button.dataset.siteId) {
        const site = appState.accountSites.find((row) => row.id === button.dataset.siteId);
        if (!site) { appState.accountError = '找不到此工地的加入碼，請重新載入頁面後再試。'; await renderApp(); return; }
        try {
          await navigator.clipboard.writeText(site.joinCode);
          appState.accountFeedback = `已複製「${site.name}」加入碼`;
          await renderApp();
          const copiedButton = app.querySelector<HTMLButtonElement>(`[data-account-action="copy-join-code"][data-site-id="${CSS.escape(site.id)}"]`);
          if (copiedButton) {
            copiedButton.textContent = '已複製';
            window.setTimeout(() => { if (copiedButton.isConnected) copiedButton.textContent = '複製'; }, 1600);
          }
        } catch {
          appState.accountError = '無法自動複製，請手動選取加入碼';
          await renderApp();
        }
        return;
      }
      if (button.dataset.accountAction === 'select-site' && appState.accountAuth.user && button.dataset.siteId) {
        const role = appState.accountSites.find((site) => site.id === button.dataset.siteId)?.role ?? null;
        await switchActiveDataPartition(async () => { await selectActiveSharedSite(appState.accountAuth.user!.id, button.dataset.siteId!, role); });
        appState.accountActiveSiteId = button.dataset.siteId;
        appState.accountActiveSiteRole = role;
        appState.syncRecoveryPreview = null; appState.syncRecoverySiteId = null;
        appState.accountFeedback = '已切換目前共用工地、獨立草稿與記憶快取。';
        scheduleBackgroundSync();
      }
      if (button.dataset.accountAction === 'preview-sync-recovery' && appState.accountAuth.user && appState.accountActiveSiteId) {
        const site = appState.accountSites.find((row) => row.id === appState.accountActiveSiteId);
        if (site?.role !== 'owner') throw new Error('只有工地管理員可以修復舊同步項目。');
        appState.syncRecoveryPreview = await previewSyncRecovery({ userId: appState.accountAuth.user.id, siteId: appState.accountActiveSiteId });
        appState.syncRecoverySiteId = appState.accountActiveSiteId;
        appState.accountFeedback = `修復預覽完成：將封存 ${appState.syncRecoveryPreview.legacyDaily + appState.syncRecoveryPreview.legacyWater + appState.syncRecoveryPreview.legacyMemory + appState.syncRecoveryPreview.memoryProblems} 筆舊操作，接管 ${appState.syncRecoveryPreview.cloudMemoryMatches} 筆雲端記憶，重新排送 ${appState.syncRecoveryPreview.memoryToResend} 筆。`;
      }
      if (button.dataset.accountAction === 'export-sync-recovery-backup' && appState.accountAuth.user && appState.accountActiveSiteId) {
        if (appState.syncRecoverySiteId !== appState.accountActiveSiteId || !appState.syncRecoveryPreview) throw new Error('請先重新預覽修復內容。');
        const local = await exportConflictBackups({ userId: appState.accountAuth.user.id, siteId: appState.accountActiveSiteId });
        const backup = { exportedAt: new Date().toISOString(), siteId: appState.accountActiveSiteId, local, preview: appState.syncRecoveryPreview };
        const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a'); link.href = url; link.download = `施工日報-同步修復前備份-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url);
        appState.accountFeedback = `已下載處理前備份，包含 ${local.length} 筆本機問題資料與目前雲端比對內容。`;
      }
      if (button.dataset.accountAction === 'apply-sync-recovery' && appState.accountAuth.user && appState.accountActiveSiteId) {
        const site = appState.accountSites.find((row) => row.id === appState.accountActiveSiteId);
        if (site?.role !== 'owner' || appState.syncRecoverySiteId !== appState.accountActiveSiteId || !appState.syncRecoveryPreview) throw new Error('請先由管理員重新預覽修復內容。');
        if (!window.confirm('執行前請先下載處理前備份。修復會封存舊操作、接管雲端同名記憶並重新排列可安全送出的項目，Supabase 現有資料不會刪除。是否繼續？')) return;
        const scope = { userId: appState.accountAuth.user.id, siteId: appState.accountActiveSiteId };
        const result = await applySyncRecovery(scope, appState.syncRecoveryPreview.fingerprint);
        appState.syncRecoveryPreview = null; appState.syncRecoverySiteId = null;
        if (result.requeued) await runSyncOnce(scope);
        await refreshAccount();
        appState.accountFeedback = `修復完成：已封存 ${result.archived} 筆、接管雲端記憶 ${result.adoptedCloudMemory} 筆、重新排送 ${result.requeued} 筆、仍需人工處理 ${result.remainingManual} 筆。`;
      }
      if (button.dataset.accountAction === 'preview-memory-import' && appState.accountAuth.user && appState.accountActiveSiteId) {
        const site = appState.accountSites.find((row) => row.id === appState.accountActiveSiteId);
        if (site?.role !== 'owner') throw new Error('只有工地管理員可以匯入舊本機記憶。');
        const source = await readLocalMemoryImportSource();
        if (!source) throw new Error('這台裝置沒有可匯入的舊本機記憶。');
        const remote = await readCloudMemoryEntries(appState.accountActiveSiteId);
        appState.memoryImportPreview = previewMemoryImport(source, remote);
        appState.memoryImportSource = 'local';
        appState.memoryImportSiteId = appState.accountActiveSiteId;
        appState.memoryImportRemoteSignature = cloudMemorySignature(remote);
        appState.accountFeedback = `預覽完成：新增 ${appState.memoryImportPreview.add.length} 筆、相同 ${appState.memoryImportPreview.duplicate.length} 筆、內容衝突 ${appState.memoryImportPreview.conflict.length} 筆。`;
      }
      if (button.dataset.accountAction === 'preview-legacy-memory-import' && appState.accountAuth.user && appState.accountActiveSiteId) {
        const site = appState.accountSites.find((row) => row.id === appState.accountActiveSiteId);
        if (site?.role !== 'owner') throw new Error('只有工地管理員可以匯入舊快照。');
        const old = (await listAllOperations({ userId: appState.accountAuth.user.id, siteId: appState.accountActiveSiteId })).find((row) => row.entity === 'memory');
        if (!old) throw new Error('找不到舊版待送快照。');
        const remote = await readCloudMemoryEntries(appState.accountActiveSiteId);
        appState.memoryImportPreview = previewMemoryImport(old.payload as import('../data/memory-partition').MemorySnapshotPayload, remote);
        appState.memoryImportSource = 'legacy';
        appState.memoryImportSiteId = appState.accountActiveSiteId;
        appState.memoryImportRemoteSignature = cloudMemorySignature(remote);
        appState.accountFeedback = `舊快照預覽完成：新增 ${appState.memoryImportPreview.add.length} 筆、相同 ${appState.memoryImportPreview.duplicate.length} 筆、衝突 ${appState.memoryImportPreview.conflict.length} 筆。`;
      }
      if (button.dataset.accountAction === 'confirm-memory-import' && appState.accountAuth.user && appState.accountActiveSiteId) {
        const site = appState.accountSites.find((row) => row.id === appState.accountActiveSiteId);
        if (site?.role !== 'owner' || appState.memoryImportSiteId !== appState.accountActiveSiteId || !appState.memoryImportPreview) throw new Error('請先由管理員重新預覽目標工地。');
        const remote = await readCloudMemoryEntries(appState.accountActiveSiteId);
        if (cloudMemorySignature(remote) !== appState.memoryImportRemoteSignature) throw new Error('雲端記憶已變更，請重新預覽後再匯入。');
        const selectedConflicts = [...app.querySelectorAll<HTMLInputElement>('[data-memory-import-conflict]:checked')]
          .map((input) => appState.memoryImportPreview!.conflict.find((entry) => entry.id === input.value)).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
        const entries = [...appState.memoryImportPreview.add, ...selectedConflicts];
        const count = entries.length;
        if (!count && appState.memoryImportSource !== 'legacy') throw new Error('沒有需要新增的舊記憶。');
        if (!window.confirm(`將 ${count} 筆舊本機記憶加入目前共用工地？原始本機資料會保留；未勾選的衝突不會匯入。`)) return;
        const scope = { userId: appState.accountAuth.user.id, siteId: appState.accountActiveSiteId };
        await queueMemoryImport(scope, entries, appState.memoryImportSource === 'legacy');
        if (appState.memoryImportSource === 'legacy') await refreshCloudMemoryLibrary(scope);
        appState.memoryImportPreview = null;
        appState.accountFeedback = `已將 ${count} 筆記憶排入逐筆同步；原始本機資料未清除。`;
        scheduleBackgroundSync();
      }
      if (button.dataset.accountAction === 'sync-now' && appState.accountAuth.user && appState.accountActiveSiteId && !appState.syncInFlight) {
        await syncActiveSiteNow();
      }
      if (button.dataset.accountAction === 'export-conflict-backups' && appState.accountAuth.user && appState.accountActiveSiteId) {
        const rows = await exportConflictBackups({ userId: appState.accountAuth.user.id, siteId: appState.accountActiveSiteId });
        const url = URL.createObjectURL(new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = `施工日報-同步衝突備份-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url); appState.accountFeedback = `已下載 ${rows.length} 筆衝突原始備份。`;
      }
      if (button.dataset.accountAction === 'resolve-conflict' && appState.accountAuth.user && appState.accountActiveSiteId && button.dataset.conflictId) {
        const review = appState.accountConflictReviews.find((row) => row.id === button.dataset.conflictId); const form = button.closest<HTMLFormElement>('[data-conflict-review]');
        if (review && form) {
          const localPaths = [...form.querySelectorAll<HTMLSelectElement>('[data-conflict-choice]')].filter((row) => row.value === 'local').map((row) => row.dataset.conflictChoice!).filter(Boolean);
          try { await queueConflictResolution({ userId: appState.accountAuth.user.id, siteId: appState.accountActiveSiteId }, review, localPaths); const result = await syncActiveSiteNow(); appState.accountFeedback = result?.failed ? '新同步操作送出失敗；原衝突與備份已保留，可再次重試。' : '已建立並送出新的同步操作；原衝突僅在雲端成功寫入後結案。'; }
          catch (error) { appState.accountError = error instanceof Error ? error.message : '衝突審核建立失敗，原始資料未變更。'; }
        }
      }
      if (button.dataset.accountAction === 'retry-missing-rpc' && appState.accountAuth.user && appState.accountActiveSiteId) {
        const scope = { userId: appState.accountAuth.user.id, siteId: appState.accountActiveSiteId };
        const retried = await retryMissingRpcOperations(scope, { readOnly: isReadOnlySite() });
        const result = retried ? await runSyncOnce(scope) : null;
        appState.accountFeedback = result?.failed ? `已重新送出 ${retried} 筆，但仍有 ${result.failed} 筆失敗；請查看新的錯誤摘要。` : `已重新送出 ${retried} 筆，請確認待同步數量。`;
      }
      const requestId = button.dataset.requestId;
      if (requestId && button.dataset.accountAction === 'approve-editor') { await approveSiteMember(requestId, 'editor'); appState.accountFeedback = '已核准為編輯者。'; }
      if (requestId && button.dataset.accountAction === 'approve-viewer') { await approveSiteMember(requestId, 'viewer'); appState.accountFeedback = '已核准為檢視者。'; }
      if (requestId && button.dataset.accountAction === 'reject-request') { await rejectSiteMember(requestId); appState.accountFeedback = '已拒絕加入申請。'; }
      const memberSiteId = button.dataset.siteId; const memberUserId = button.dataset.userId;
      const role = button.dataset.accountAction?.replace('role-', '') as 'owner' | 'editor' | 'viewer' | undefined;
      if (memberSiteId && memberUserId && role && ['owner', 'editor', 'viewer'].includes(role)) { await updateSiteMemberRole(memberSiteId, memberUserId, role); appState.accountFeedback = '成員角色已更新。'; }
      if (memberSiteId && memberUserId && button.dataset.accountAction === 'remove-member') {
        if (!window.confirm('確定移除此工地成員？對方下次連線後將無法存取雲端資料。')) return;
        await removeSiteMember(memberSiteId, memberUserId); appState.accountFeedback = '成員已移除。';
      }
    } catch (error) { appState.accountError = error instanceof Error ? error.message : '帳號操作失敗。'; }
    await renderApp();
  });
  app.addEventListener('submit', async (event) => {
    const form = (event.target as HTMLElement).closest<HTMLFormElement>('[data-account-form]');
    if (!form) return;
    event.preventDefault(); event.stopImmediatePropagation();
    appState.accountFeedback = ''; appState.accountError = '';
    const values = new FormData(form);
    try {
      if (form.dataset.accountForm === 'create-site') {
        const result = await createSharedSite(String(values.get('name') ?? ''));
        if (appState.accountAuth.user) await switchActiveDataPartition(async () => { await selectActiveSharedSite(appState.accountAuth.user!.id, result.siteId, 'owner'); });
        appState.accountActiveSiteRole = 'owner';
        appState.accountFeedback = `工地已建立並設為目前工地。加入碼：${result.joinCode}`;
      } else {
        await requestSiteAccess(String(values.get('joinCode') ?? ''));
        appState.accountFeedback = '加入申請已送出，請由工地管理員核准。';
      }
    } catch (error) { appState.accountError = error instanceof Error ? error.message : '工地操作失敗。'; }
    await renderApp();
  });
}
