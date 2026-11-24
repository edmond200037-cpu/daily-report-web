import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Button } from '@astryxdesign/core/Button';
import { Selector } from '@astryxdesign/core/Selector';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { List, ListItem } from '@astryxdesign/core/List';
import type { AccountPageState } from '../account/account-view';
import type { ConflictReview } from '../sync/conflict-review';
import { appState } from './state';
import { SettingsFrame, DebugPanel, preStyle } from './react-settings';
const roleLabel = (role: string) => role === 'owner' ? '管理員' : role === 'editor' ? '編輯者' : '檢視者';
const action = (label: string, name: string, data: Record<string, string> = {}, disabled = false) => <Button label={label} size="lg" data-account-action={name} isDisabled={disabled || appState.accountActionBusy} {...data} />;
function AccountForm({ kind }: { kind: 'create-site' | 'request-join' }) {
  const [value, setValue] = useState('');
  const create = kind === 'create-site';
  return <form data-account-form={kind}><VStack gap={3}><Heading level={3}>{create ? '建立新工地' : '用加入碼申請加入'}</Heading><TextInput label={create ? '工地名稱' : '加入碼'} htmlName={create ? 'name' : 'joinCode'} size="lg" value={value} onChange={setValue} isRequired isDisabled={appState.accountActionBusy} /><Button label={create ? '建立並成為管理員' : '送出申請'} size="lg" type="submit" isDisabled={appState.accountActionBusy} /></VStack></form>;
}
export function SharedSiteContent({ state }: { state: AccountPageState }) {
  if (!state.auth.enabled) return <Text>目前使用本機模式。資料只存在這台裝置。啟用雲端服務後，才可登入與跨裝置共用工地。</Text>;
  if (!state.auth.user) return <VStack gap={3}><Text>登入後才能使用共用工地。每位成員使用自己的帳號；登入成功後仍需建立工地或經管理員核准加入。</Text>{action('使用 Google 登入', 'sign-in')}</VStack>;
  const user = state.auth.user;
  return <VStack gap={4}>
    <Text>登入帳號：{user.email ?? user.id}</Text>{action('登出', 'sign-out')}
    <Heading level={2}>我的工地</Heading>
    <List hasDividers>{state.sites.map((site) => <ListItem key={site.id} label={<VStack gap={2}><Text>{site.name}｜{roleLabel(site.role)}{site.id === state.activeSiteId ? ' · 目前使用' : ''}</Text><Text>加入碼：<code>{site.joinCode}</code></Text>{action(`複製 ${site.name} 加入碼`, 'copy-join-code', { 'data-site-id': site.id })}{action(site.id === state.activeSiteId ? '使用中' : '切換', 'select-site', { 'data-site-id': site.id }, site.id === state.activeSiteId)}</VStack>} />)}</List>
    {!state.sites.length && <Text>目前還沒有可使用的工地。</Text>}
    <Heading level={2}>加入或建立工地</Heading><AccountForm kind="request-join" /><AccountForm kind="create-site" />
    {state.sites.filter((site) => site.role === 'owner').map((site) => <VStack key={site.id} gap={3} as="section" id={`account-admin-${site.id}`}>
      <Heading level={2}>{site.name}</Heading><Heading level={3}>待審核申請</Heading>
      <List hasDividers>{state.requests.filter((row) => row.siteId === site.id).map((row) => <ListItem key={row.id} label={<VStack gap={2}><Text>{row.userId}</Text>{action('核准編輯', 'approve-editor', { 'data-request-id': row.id })}{action('核准檢視', 'approve-viewer', { 'data-request-id': row.id })}{action('拒絕', 'reject-request', { 'data-request-id': row.id })}</VStack>} />)}</List>
      {!state.requests.some((row) => row.siteId === site.id) && <Text>目前沒有待審核申請。</Text>}
      <Heading level={3}>現有成員</Heading><List hasDividers>{state.members.filter((row) => row.siteId === site.id).map((row) => <ListItem key={row.userId} label={<VStack gap={2}><Text>{row.userId}{row.userId === user.id ? '（你）' : ''}｜{roleLabel(row.role)}</Text>{(['viewer', 'editor', 'owner'] as const).map((role) => <Button key={role} label={roleLabel(role)} size="lg" aria-pressed={role === row.role} data-account-action={`role-${role}`} data-site-id={site.id} data-user-id={row.userId} />)}{row.userId !== user.id && action('移除', 'remove-member', { 'data-site-id': site.id, 'data-user-id': row.userId })}</VStack>} />)}</List>
    </VStack>)}
    <Button label="同步問題請前往同步診斷" href="#settings/debug" size="lg" />
  </VStack>;
}
function ConflictChoice({ path, cloudExists = true, label = '採用' }: { path: string; cloudExists?: boolean; label?: string }) {
  const [value, setValue] = useState(cloudExists ? 'cloud' : 'local');
  return <><Selector label={label} size="lg" value={value} onChange={(next) => setValue(next ?? 'cloud')} options={[{ value: 'cloud', label: '雲端', isDisabled: !cloudExists }, { value: 'local', label: '本機' }]} /><input type="hidden" data-conflict-choice={path} value={value} /></>;
}
function ConflictContent({ review }: { review: ConflictReview }) {
  const printable = (value: unknown) => value === undefined ? '（不存在）' : JSON.stringify(value);
  return <form data-conflict-review={review.id}><VStack gap={3}><Heading level={3}>{review.reportDate || review.kind}｜{review.diffs.length} 項差異</Heading>
    {review.entity === 'memory-entry' ? <><Text>完整選擇一筆記憶，避免工種、識別碼與內容混用。</Text><ConflictChoice path="/" label="採用完整版本" cloudExists={typeof review.cloud.id === 'string'} /></> : review.diffs.map((diff) => <VStack gap={2} key={diff.path}><Text>{diff.kind}：{diff.path}</Text><Text>本機：{printable(diff.local)}</Text><Text>雲端：{printable(diff.cloud)}</Text><ConflictChoice path={diff.path} /></VStack>)}
    <Text>處理前原始內容</Text><pre style={preStyle}>{printable({ local: review.local, cloud: review.cloud })}</pre>{action('確認選擇並建立同步操作', 'resolve-conflict', { 'data-conflict-id': review.id })}
  </VStack></form>;
}
function ImportConflict({ entry }: { entry: NonNullable<AccountPageState['importPreview']>['conflict'][number] }) {
  const [checked, setChecked] = useState(false);
  return <CheckboxInput label={`${entry.kind}：${String(entry.payload.name ?? entry.payload.value ?? entry.payload.text ?? entry.normalized_name)}`} value={checked} onChange={setChecked} isDisabled={entry.base_revision === undefined} data-memory-import-conflict="" ref={(node) => { if (node) node.value = entry.id; }} />;
}
export function SyncDiagnosticsContent({ state }: { state: AccountPageState }) {
  if (!state.auth.enabled) return <Text>目前使用本機模式；雲端同步未啟用，仍可查看本機偵錯資訊。</Text>;
  if (!state.auth.user) return <Button label="前往共用工地登入，登入後才能診斷同步" href="#settings/account" size="lg" />;
  const active = state.sites.find((site) => site.id === state.activeSiteId);
  if (!active) return <Button label="請先選擇要診斷的工地" href="#settings/account" size="lg" />;
  const operations = state.operations ?? [];
  const failures = (state.diagnostics ?? []).filter((row) => ['failed', 'blocked', 'conflict'].includes(row.status));
  const kindLabel = (entity: string) => entity.startsWith('daily') ? '施工日報' : entity.startsWith('water') ? '水位' : '工地記憶';
  const statusLabel = { pending: '待同步', sending: '同步中', failed: '等待重試', blocked: '已停止重試', conflict: '需要處理衝突' };
  const error = (row: typeof operations[number]) => row.lastErrorCode === '23505' ? '雲端已有同名記憶，等待同步修復接管雲端版本。' : row.lastErrorCode === '23503' ? '子項目正在等待父層工種完成，等待同步修復重新綁定。' : [row.lastErrorCode, row.lastError, row.lastErrorHint].filter(Boolean).join('｜');
  const summary = (row: typeof operations[number]) => {
    const payload = row.payload as { reportDate?: string; date?: string; changes?: { collection: string; field?: string }[] };
    return [payload.reportDate || payload.date ? `日報日期 ${payload.reportDate ?? payload.date}` : '', ...(payload.changes ?? []).map((change) => change.field ? `${change.collection}.${change.field}` : change.collection)].filter(Boolean).join('｜');
  };
  const busyImport = operations.some((row) => row.entity === 'memory' || row.entity === 'memory-entry' && ['pending', 'sending', 'blocked'].includes(row.status));
  const preview = state.importPreview;
  return <VStack gap={4}>
    <Heading level={2}>{active.name}</Heading><Text>{state.operationsStatus === 'loading' ? '待同步讀取中' : state.operationsStatus === 'error' ? '待同步無法讀取' : `待同步 ${state.pendingCount} 筆`}</Text>{action(state.syncing ? '同步中…' : '立即同步', 'sync-now', {}, state.syncing)}
    <Text>處理順序：立即同步 → 比較衝突並下載備份 → 確認選擇後再次同步。</Text>
    <Heading level={2}>待同步項目</Heading>
    {state.operationsStatus === 'loading' ? <Text role="status">正在讀取本機同步佇列…</Text> : state.operationsStatus === 'error' ? <Text role="alert">本機同步佇列讀取失敗；資料未被清除，請重新讀取。</Text> : !operations.length ? <Text>目前沒有待同步資料；此工地的本機佇列沒有等待雲端確認的操作。</Text> : <><Text>共 {operations.length} 筆；此明細與頁首待同步數量相同，僅顯示安全摘要。</Text><List hasDividers>{operations.map((row) => <ListItem key={row.id} label={`${kindLabel(row.entity)}｜${statusLabel[row.status]}`} description={<Text>{summary(row)}｜建立 {new Date(row.createdAt).toLocaleString('zh-TW')}｜{error(row)}</Text>} />)}</List></>}
    {!!failures.length && <><Heading level={2}>同步診斷</Heading><List hasDividers>{failures.map((row) => <ListItem key={row.id} label={`${kindLabel(row.entity)}｜${statusLabel[row.status]}`} description={<Text>{row.attempts} 次嘗試｜{error(row)}</Text>} />)}</List></>}
    {failures.some((row) => row.status === 'blocked' && ['PGRST202', '42883'].includes(row.lastErrorCode ?? '')) && action('檢查並安全重試', 'retry-missing-rpc')}
    <Heading level={2}>衝突檢視與處理</Heading><Text>先下載備份；新操作成功寫入前，舊操作不會刪除。</Text>{action('下載處理前備份', 'export-conflict-backups')}
    {(state.conflicts ?? []).map((review) => <ConflictContent key={review.id} review={review} />)}
    {!state.conflicts?.length && failures.some((row) => row.status === 'conflict') && <><Text>衝突明細尚未顯示，本機仍保留衝突操作。</Text>{action('讀取衝突明細', 'load-conflict-reviews')}</>}
    <Button label="切換或管理工地" href="#settings/account" size="lg" />
    <Heading level={2}>修復舊同步項目</Heading><Text>此工具固定顯示；只有工地管理員可以執行。</Text>
    {active.role !== 'owner' && <Text>目前帳號不是此工地管理員。</Text>}
    {active.role === 'owner' && <>
      {action('預覽同步修復', 'preview-sync-recovery')}{action('下載修復前備份', 'export-sync-recovery-backup', {}, !state.recoveryPreview)}
      {state.recoveryPreview && <><pre style={preStyle}>{JSON.stringify(state.recoveryPreview, null, 2)}</pre>{action('確認執行同步修復', 'apply-sync-recovery')}</>}
      <Heading level={2}>匯入舊本機記憶</Heading><Text>先比對本機記憶與目前工地；原始資料與既有雲端快照保留。</Text>{action('預覽匯入', 'preview-memory-import', {}, busyImport)}
      {operations.some((row) => row.entity === 'memory') && action('預覽舊版待送快照', 'preview-legacy-memory-import')}
      {busyImport && <Text>請先完成同步修復或目前的記憶匯入，避免重複排入。</Text>}
      {preview && <><Text>新增 {preview.add.length} 筆、相同 {preview.duplicate.length} 筆、衝突 {preview.conflict.length} 筆。</Text><List hasDividers>{preview.add.map((entry) => <ListItem key={entry.id} label={`${entry.kind}：${String(entry.payload.name ?? entry.payload.value ?? entry.payload.text ?? entry.normalized_name)}`} />)}</List><Text>衝突預設略過，可逐筆採用本機內容。</Text>{preview.conflict.map((entry) => <ImportConflict key={entry.id} entry={entry} />)}{action('確認匯入所選項', 'confirm-memory-import')}</>}
    </>}
  </VStack>;
}
export function AccountRoute() {
  const debug = appState.renderedRoute?.page === 'debug';
  const state: AccountPageState = { view: debug ? 'debug' : 'account', syncing: appState.syncInFlight, auth: appState.accountAuth, sites: appState.accountSites, activeSiteId: appState.accountActiveSiteId, pendingCount: appState.accountPendingCount, requests: appState.accountRequests, members: appState.accountMembers, feedback: appState.accountFeedback, error: appState.accountError, diagnostics: appState.accountSyncDiagnostics, operations: appState.accountSyncOperations, operationsStatus: appState.accountQueueStatus, conflicts: appState.accountConflictReviews, importPreview: appState.memoryImportSiteId === appState.accountActiveSiteId ? appState.memoryImportPreview : null, recoveryPreview: appState.syncRecoverySiteId === appState.accountActiveSiteId ? appState.syncRecoveryPreview : null };
  return <SettingsFrame title={debug ? '同步診斷' : '共用工地'}>
    {state.feedback && <Text role="status">{state.feedback}</Text>}{state.error && <Text role="alert">{state.error}</Text>}
    {!appState.accountLoadCoreReady ? <Text role="status">正在載入共用工地…目前階段：{appState.accountLoadStage ?? '準備中'}。超過 15 秒將顯示錯誤與重試。</Text> : debug ? <SyncDiagnosticsContent state={state} /> : <SharedSiteContent state={state} />}
    {appState.accountLoadExtrasPending && <Text role="status">工地已可使用，成員與同步診斷仍在載入…</Text>}
    {action('重新讀取', 'retry-load-account')}{debug && <DebugPanel />}
  </SettingsFrame>;
}
