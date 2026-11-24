import { useRef, useState, type ReactNode } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { List, ListItem } from '@astryxdesign/core/List';
import { createReorderable } from '@astryxdesign/core';
import { reorderMaterialTypes } from '../data/daily-repository';
import { renderApp } from '../main';
import { isReadOnlySite } from './sync-runtime';
import { appState, settingsState, memoryReviewState } from './state';
import { notifyReact } from './react-store';
import { sectionLabels, memoryCandidateLabels, floorRangeText, debugSnapshot } from '../settings/views/settings-view';
import { groupMemoryCandidates, confirmationSelection, rejectionSelection, memoryCandidateImpact } from '../settings/memory-review';
import { searchTradeManagement } from '../settings/trade-management';
import { APP_VERSION } from '../version';
import type { NamedMemory } from '../data/daily-repository';

export const preStyle = { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', font: 'inherit' } as const;
export function SettingsFrame({ title, children, home = false }: { title: string; children: ReactNode; home?: boolean }) {
  return <VStack as="main" padding={4} gap={4} inert={appState.workspaceSwitching || appState.dateSwitching}>
    <Heading level={1}>{title}</Heading>
    {!home && <Button size="lg" label="返回設定" href="#settings" />}
    {children}
  </VStack>;
}
export function SettingsHome() {
  const site = appState.accountSites.find((row) => row.id === appState.accountActiveSiteId);
  return <SettingsFrame title="設定" home>
    <List hasDividers><ListItem label={site?.name ?? '本機模式'} description={appState.accountAuth.user ? `待同步 ${appState.accountPendingCount} 筆` : '登入後可共用工地'} href="#settings/account" />
      <ListItem label={`記憶審核（${appState.memoryCandidates.length} 筆待處理）`} href="#settings/memory" /></List>
    <Heading level={2}>主檔</Heading>
    <List hasDividers>{sectionLabels.map(([key, label]) => <ListItem key={key} label={label} href={`#settings/daily/${key}`} />)}<ListItem label="水位井位" href="#settings/water" /></List>
    <Heading level={2}>資料與協作</Heading>
    <List hasDividers>{[['data', '備份與還原'], ['account', '多人共編'], ['debug', '同步診斷']].map(([key, label]) => <ListItem key={key} label={label} href={`#settings/${key}`} />)}</List>
    <Text>版本 {APP_VERSION}</Text>
  </SettingsFrame>;
}
type NameRow = { id: string; name: string; startFloorRaw?: string; endFloorRaw?: string };
export function NameForm({ label, row, children }: { label: string; row?: NameRow; children?: ReactNode }) {
  const [name, setName] = useState(row?.name ?? '');
  const [start, setStart] = useState(row?.startFloorRaw ?? '');
  const [end, setEnd] = useState(row?.endFloorRaw ?? '');
  return <form data-settings-form={row ? 'edit' : 'add'}>
    <VStack gap={3}>
      {settingsState.activeSection === 'locations' && <><Text>這個位置在哪幾層？</Text><TextInput label="起始樓層" htmlName="startFloor" size="lg" value={start} onChange={setStart} /><TextInput label="結束樓層" htmlName="endFloor" size="lg" value={end} onChange={setEnd} /></>}
      <TextInput label={label} htmlName="name" size="lg" value={name} onChange={setName} hasAutoFocus isRequired />
      <Button label="儲存" size="lg" type="submit" variant="primary" />
      <Button label="取消" size="lg" data-settings-action="cancel" />{children}
    </VStack>
  </form>;
}
function DeleteMemory({ row, kind }: { row: NameRow; kind: string }) {
  return <Button size="lg" label="刪除" variant="destructive" data-settings-action="delete" data-settings-kind={kind} data-id={row.id} data-name={row.name} />;
}
function ManagedRows({ rows, kind, label }: { rows: NameRow[]; kind: string; label: string }) {
  return <List hasDividers>{rows.map((row) => <ListItem key={row.id} label={settingsState.editingId === row.id ? <NameForm label={label} row={row}>
    {kind === 'templates' ? <Button label="刪除" size="lg" variant="destructive" data-settings-action="delete-template" data-id={row.id} data-name={row.name} /> : <DeleteMemory row={row} kind={kind} />}
  </NameForm> : <Button label={row.name} size="lg" variant="ghost" data-settings-action={kind === 'tasks' ? 'edit-task' : kind === 'vendors' ? 'edit-vendor' : 'edit'} data-id={row.id} />}
  description={kind === 'locations' ? floorRangeText(row) : undefined} />)}</List>;
}
function TradeSettings({ query }: { query: string }) {
  const results = searchTradeManagement(appState.settingsTrades, appState.settingsAllTasks, query);
  const subgroup = (kind: 'tasks' | 'vendors', label: string, rows: NamedMemory[]) => <VStack gap={3} as="section" aria-label={label}>
    <Heading level={3}>{label}</Heading><Button label={`新增${label}`} size="lg" data-settings-action={kind === 'tasks' ? 'add-task' : 'add-vendor'} />
    {settingsState.adding && settingsState.editingKind === kind && <NameForm label={`${label}名稱`} />}
    <ManagedRows rows={rows} label={`${label}名稱`} kind={kind} />
  </VStack>;
  return <VStack gap={4}>
    <Button label="新增工種" size="lg" data-settings-action="add-trade" />
    {settingsState.adding && settingsState.editingKind === 'trade' && <NameForm label="工種名稱" />}
    <List hasDividers>{results.map(({ trade, matchingTasks, nameMatches }) => <ListItem key={trade.id} label={<VStack gap={3}>
      <Button label={`${trade.name}｜${appState.settingsAllTasks.filter((row) => row.tradeTypeId === trade.id).length} 工項 · ${appState.settingsAllVendors.filter((row) => row.tradeTypeId === trade.id).length} 廠商`} size="lg" variant="ghost" data-settings-action="toggle-trade-tasks" data-trade-type-id={trade.id} aria-expanded={settingsState.selectedTradeTypeId === trade.id} />
      {settingsState.selectedTradeTypeId === trade.id && <>
        {subgroup('tasks', '工項', query && !nameMatches ? matchingTasks : appState.settingsAllTasks.filter((row) => row.tradeTypeId === trade.id))}
        {subgroup('vendors', '廠商', appState.settingsAllVendors.filter((row) => row.tradeTypeId === trade.id))}
        {settingsState.editingKind === 'trade' && settingsState.editingId === trade.id ? <NameForm label="工種名稱" row={trade}><Button label="刪除工種" size="lg" variant="destructive" data-settings-action="delete-trade" data-trade-type-id={trade.id} /></NameForm> : <Button label="編輯工種名稱" size="lg" data-settings-action="edit-trade" data-trade-type-id={trade.id} />}
      </>}
    </VStack>} />)}</List>
    {!results.length && <Text>找不到符合的工種或工項。</Text>}
  </VStack>;
}
function MaterialValueForm({ id, initial }: { id: string; initial: string }) {
  const [value, setValue] = useState(initial);
  return <form data-material-item-form={id}><VStack gap={3}><TextInput label="記憶值" htmlName="value" size="lg" value={value} onChange={setValue} /><Button label="儲存" size="lg" type="submit" /><Button label="取消" size="lg" data-material-action="cancel-item" /><Button label="刪除" variant="destructive" size="lg" data-material-action="delete-item" data-id={id} /></VStack></form>;
}
function MaterialsSettings({ query }: { query: string }) {
  const [error, setError] = useState('');
  const reorderable = createReorderable({
    isReorderable: () => !query && !isReadOnlySite(),
    onReorder: ({ key, to }) => {
      const ids = appState.materialTypes.map((row) => row.id);
      const from = ids.indexOf(String(key));
      if (from < 0 || from === to) return;
      ids.splice(to, 0, ...ids.splice(from, 1));
      void reorderMaterialTypes(ids).then(() => renderApp()).catch(() => setError('排序儲存失敗，已恢復原順序。'));
    },
  });
  return <VStack gap={4}>
    {error && <Text role="alert">{error}</Text>}
    <Button label="新增材料類型" size="lg" data-settings-action="add-material-type" />
    {settingsState.adding && <NameForm label="材料類型名稱" />}
    <List hasDividers reorderable={reorderable}>{appState.materialTypes.filter((row) => row.name.includes(query)).map((row) => <ListItem key={row.id} itemKey={row.id} label={<VStack gap={3}>
      <Button label={row.name} size="lg" data-material-action="toggle-type" data-id={row.id} aria-expanded={settingsState.expandedMaterialTypeId === row.id} />
      {settingsState.expandedMaterialTypeId === row.id && <>
        {settingsState.editingId === row.id ? <NameForm label="材料類型名稱" row={row} /> : <Button label="重新命名類型" size="lg" data-settings-action="edit" data-id={row.id} />}
        <Button label="刪除類型" size="lg" variant="destructive" data-settings-action="delete-material-type" data-id={row.id} />
        {([['itemName', '品名'], ['specification', '規格'], ['supplier', '供應商'], ['unit', '單位']] as const).map(([field, label]) => <VStack gap={2} key={field}><Heading level={3}>{label}</Heading><List hasDividers>{appState.settingsMaterialMemory.filter((item) => item.materialTypeId === row.id && item.fieldType === field).map((item) => <ListItem key={item.id} label={settingsState.editingMaterialItemId === item.id ? <MaterialValueForm id={item.id} initial={item.value} /> : <Button label={item.value} size="lg" data-material-action="edit-item" data-id={item.id} />} />)}</List></VStack>)}
      </>}
    </VStack>} />)}</List>
  </VStack>;
}
export function MasterSettings() {
  const [query, setQuery] = useState('');
  const section = settingsState.activeSection;
  const title = sectionLabels.find(([key]) => key === section)?.[1] ?? '主檔';
  const label = section === 'sites' ? '工地名稱' : section === 'locations' ? '位置' : '模板內容';
  const rows = section === 'templates' ? appState.settingsTemplates.map((row) => ({ id: row.id, name: row.text })) : appState.settingsRows;
  return <SettingsFrame title={title}>
    <TextInput label={section === 'trade-tasks' ? '搜尋工種或工項' : `搜尋${title}`} size="lg" type="search" value={query} onChange={setQuery} />
    {section === 'trade-tasks' ? <TradeSettings query={query} /> : section === 'materials' ? <MaterialsSettings query={query} /> : <>
      <Button label={`新增${title}`} size="lg" data-settings-action="add" />
      {settingsState.adding && <NameForm label={label} />}
      <ManagedRows rows={rows.filter((row) => row.name.includes(query))} kind={section} label={label} />
      {!rows.length && <Text>尚無{title}。</Text>}
    </>}
  </SettingsFrame>;
}
export function MemoryReview() {
  const rows = appState.memoryCandidates;
  const groups = groupMemoryCandidates(rows);
  const keys = [...memoryReviewState.explicitKeys];
  const confirmation = confirmationSelection(keys, rows);
  const rejection = rejectionSelection(keys, rows);
  const effective = new Set(confirmation.keys);
  const select = (selectedKeys: typeof keys, checked: boolean) => { selectedKeys.forEach((key) => checked ? memoryReviewState.explicitKeys.add(key) : memoryReviewState.explicitKeys.delete(key)); notifyReact(); };
  const safeReject = rejection.keys.length > 0 && rows.filter((row) => rejection.keys.includes(row.key)).every((row) => !memoryCandidateImpact(appState.daily.report, row));
  return <SettingsFrame title="記憶審核">
    <Text>待處理 {rows.length} 筆；累計 4 次有效套用後自動成為正式記憶。</Text>
    {memoryReviewState.feedback && <Text role={memoryReviewState.feedbackTone === 'error' ? 'alert' : 'status'}>{memoryReviewState.feedback}</Text>}
    {!rows.length ? <Text>目前沒有待審核的記憶。</Text> : <CheckboxInput label="全選全部" value={rows.every((row) => memoryReviewState.explicitKeys.has(row.key))} onChange={(checked) => select(rows.map((row) => row.key), checked)} />}
    {groups.map((group) => <VStack key={group.kind} gap={3}>
      <Button label={`${memoryCandidateLabels[group.kind]}｜待處理 ${group.rows.length} 筆`} size="lg" data-memory-group-toggle={group.kind} aria-expanded={memoryReviewState.openKind === group.kind} />
      {memoryReviewState.openKind === group.kind && <><CheckboxInput label="全選本區" value={group.rows.every((row) => memoryReviewState.explicitKeys.has(row.key))} onChange={(checked) => select(group.rows.map((row) => row.key), checked)} />
        <List hasDividers>{group.rows.map((row) => <ListItem key={row.key} label={<VStack gap={2}>
          <CheckboxInput label={`選取${row.name}`} value={effective.has(row.key)} onChange={(checked) => select([row.key], checked)} />
          <Button label={`${row.name}｜${Math.min(row.usageCount, 4)}/4`} size="lg" data-memory-detail-toggle={row.key} aria-expanded={memoryReviewState.expandedKeys.has(row.key)} />
          {memoryReviewState.expandedKeys.has(row.key) && <><Text>所屬資料：{row.parentName || '無'}；最近使用：{row.lastUsedAt || '尚無日期'}；目前草稿影響：{memoryCandidateImpact(appState.daily.report, row)} 筆</Text><Button label="駁回此候選" size="lg" variant="destructive" data-memory-reject={row.key} /></>}
        </VStack>} />)}</List></>}
    </VStack>)}
    {!!keys.length && <VStack gap={3} as="aside" aria-label="批次操作"><Text>已選 {keys.length} 筆；確認另包含 {confirmation.addedParentCount} 筆必要資料，駁回另包含 {rejection.addedChildCount} 筆關聯候選。</Text>{!safeReject && <Text>含有草稿影響，請展開後逐筆駁回。</Text>}<Button label={`確認 ${confirmation.keys.length} 筆`} size="lg" data-memory-confirm /><Button label={`駁回 ${rejection.keys.length} 筆`} variant="destructive" size="lg" isDisabled={!safeReject} data-memory-reject-selected /></VStack>}
  </SettingsFrame>;
}
export function BackupSettings() {
  const file = useRef<HTMLInputElement>(null);
  return <SettingsFrame title="記憶備份與還原"><Text>只包含可重用主檔；不包含日報草稿、定稿日報或水位資料。匯入採合併去重。</Text><Button label="下載記憶備份" size="lg" data-settings-action="export-memory-backup" /><Button label="匯入記憶備份" size="lg" onClick={() => file.current?.click()} /><input ref={file} hidden type="file" accept="application/json,.json" data-memory-backup-import="true" />{appState.memoryBackupFeedback && <Text role="status">{appState.memoryBackupFeedback}</Text>}</SettingsFrame>;
}
export function DebugPanel() {
  return <VStack gap={3} as="section" aria-label="偵錯資訊"><Heading level={2}>偵錯資訊</Heading><Text>僅包含狀態與安全錯誤碼，不包含登入憑證、加入碼或日報內容。</Text><pre data-debug-output style={preStyle}>{JSON.stringify({ ...debugSnapshot(), stores: appState.settingsDebug }, null, 2)}</pre><Button label="複製偵錯資訊" size="lg" data-settings-action="copy-debug" /><Button label="清除偵錯紀錄" size="lg" data-settings-action="clear-debug" /></VStack>;
}
