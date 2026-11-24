import { useState, type ComponentProps } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { Button } from '@astryxdesign/core/Button';
import { DateTimeInput } from '@astryxdesign/core/DateTimeInput';
import { Selector } from '@astryxdesign/core/Selector';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { List, ListItem } from '@astryxdesign/core/List';
import { recalculate, changeLabel, validateLog } from '../water-level/calculator.js';
import { formatWaterLog } from '../water-level/formatter.js';
import { waterLogSummary } from '../water-level/controller.js';
import { appState } from './state';
import { useAppVersion, notifyReact } from './react-store';
import { isReadOnlySite } from './sync-runtime';
import { selectSharedSiteFromWorkspace } from '../account/account-controller';
import { preStyle } from './react-settings';
export type WaterReading = { pointId: string; pointNameSnapshot: string; value: string | number; change?: number | null; sourceChange?: number | null };
export type WaterLog = { id: string; measuredAt: string; battery: string; readings: WaterReading[] };
export type WaterViewController = { logs: WaterLog[]; editing: WaterLog; mode: string; expandedHistoryId: string | null; outputOpen: boolean; importFeedback: string[]; handleInput(target: HTMLElement): Promise<void>; handleAction(action: string, id?: string): Promise<void>; preview(): string };
export function WaterContent({ controller }: { controller: WaterViewController }) {
  const [importText, setImportText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const locked = appState.workspaceSwitching || appState.dateSwitching || isReadOnlySite();
  const log = controller.editing;
  const issues: string[] = validateLog(log);
  const projected: WaterLog = recalculate([...controller.logs.filter((row) => row.id !== log.id), { ...log, id: log.id || 'preview' }]).find((row: WaterLog) => row.id === (log.id || 'preview'));
  const run = async (action: string, id?: string) => {
    if (busy || locked && ['save-log', 'delete-log', 'parse-import'].includes(action)) return;
    setBusy(true); setError('');
    try { await controller.handleAction(action, id); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '水位操作失敗，資料仍保留。'); }
    finally { setBusy(false); notifyReact(); }
  };
  const change = (field: string, value: string, reading = false) => {
    if (locked || busy) return;
    void controller.handleInput({ dataset: reading ? { waterReading: field } : { waterField: field }, value } as unknown as HTMLElement).then(notifyReact);
  };
  return <VStack as="main" padding={4} gap={4} onClick={(event) => event.stopPropagation()} onInput={(event) => event.stopPropagation()} onChange={(event) => event.stopPropagation()}>
    <Heading level={1} style={{ color: 'var(--color-info)' }}>水位變化</Heading>
    <Text>{appState.accountActiveSiteId ? `共用工地：${appState.accountSites.find((site) => site.id === appState.accountActiveSiteId)?.name ?? '載入中'}` : '本機量測資料'}</Text>
    {appState.accountAuth.user && <Selector label="切換工地" size="lg" value={appState.accountActiveSiteId ?? ''} onChange={(id) => { if (id) void selectSharedSiteFromWorkspace(id); }} options={appState.accountSites.map((site) => ({ value: site.id, label: site.name }))} isDisabled={appState.workspaceSwitching} />}
    <Button label="設定水位井位" size="lg" href="#settings/water" />
    <TabList value={controller.mode} size="lg" layout="fill" onChange={(mode) => { controller.mode = mode; notifyReact(); }} hasDivider>
      <Tab value="entry" label="輸入水位" /><Tab value="history" label="最近三天" /><Tab value="import" label="貼上匯入" />
    </TabList>
    {error && <Text role="alert">{error}</Text>}
    {controller.mode === 'entry' && <VStack gap={3}>
      <Heading level={2}>{log.id ? '編輯量測紀錄' : '新增量測紀錄'}</Heading>
      <DateTimeInput label="量測時間" size="lg" presentation="native" hourFormat="24h" value={log.measuredAt as ComponentProps<typeof DateTimeInput>['value']} onChange={(value) => { if (value) change('measuredAt', value); }} isDisabled={locked || busy} />
      <TextInput label="電池電量（選填）" size="lg" value={log.battery} inputMode="decimal" onChange={(value) => change('battery', value)} isDisabled={locked || busy} />
      <List hasDividers>{log.readings.map((reading, index) => <ListItem key={reading.pointId} label={<TextInput label={reading.pointNameSnapshot} size="lg" value={String(reading.value)} inputMode="decimal" data-water-reading={reading.pointId} placeholder="空白表示無數據" onChange={(value) => change(String(index), value, true)} isDisabled={locked || busy} />} description={<Text>{changeLabel(projected?.readings.find((row) => row.pointId === reading.pointId)?.change) || '尚無比較基準'}</Text>} />)}</List>
      {!log.readings.length && <Text>請先到「水位井位」新增量測井位。</Text>}
      {issues.map((issue) => <Text key={issue} role="status">{issue}</Text>)}
      <Button label="儲存量測" size="lg" variant="primary" isDisabled={locked || busy} clickAction={() => run('save-log')} />
      {log.id && <Button label="取消編輯" size="lg" clickAction={() => run('cancel-edit')} />}
    </VStack>}
    {controller.mode === 'history' && <VStack gap={3}>
      <Heading level={2}>最近三天量測</Heading>
      <List hasDividers>{[...controller.logs].reverse().map((row) => { const summary = waterLogSummary(row); return <ListItem key={row.id} label={<VStack gap={2} data-water-history={row.id}>
        <Button label={`${summary.title}｜${summary.detail}｜${summary.status}`} size="lg" aria-expanded={controller.expandedHistoryId === row.id} clickAction={() => run('toggle-history', row.id)} />
        {controller.expandedHistoryId === row.id && <><pre style={preStyle}>{formatWaterLog(row)}</pre><Button label="編輯量測" size="lg" isDisabled={locked || busy} clickAction={() => run('edit-log', row.id)} /><Button label="刪除量測" size="lg" variant="destructive" isDisabled={locked || busy} clickAction={() => run('delete-log', row.id)} /></>}
      </VStack>} />; })}</List>
      {!controller.logs.length && <Text>尚無最近三天的水位紀錄。</Text>}
    </VStack>}
    {controller.mode === 'import' && <VStack gap={3}><Heading level={2}>貼上水位文字</Heading><Text>每筆量測以空白行分隔；解析井位、變化與電池資料。</Text><TextArea id="water-import-text" label="水位匯入文字" size="lg" value={importText} onChange={setImportText} rows={10} isDisabled={locked || busy} /><Button label="解析並匯入" size="lg" isDisabled={locked || busy} clickAction={() => run('parse-import')} />{controller.importFeedback.map((message, index) => <Text role="status" key={`${index}:${message}`}>{message}</Text>)}</VStack>}
    <VStack gap={3} as="aside"><Text>{controller.logs.length} 筆水位紀錄</Text><Button label={controller.outputOpen ? '收合輸出' : '查看輸出'} size="lg" aria-expanded={controller.outputOpen} clickAction={() => run('toggle-output')} />{controller.outputOpen && <><pre style={preStyle}>{controller.preview() || '尚無水位紀錄。'}</pre><Button label="複製最近三天" size="lg" clickAction={() => run('copy-water')} /></>}</VStack>
  </VStack>;
}
export function WaterPage() {
  useAppVersion();
  return appState.water ? <WaterContent controller={appState.water as unknown as WaterViewController} /> : <Text role="status">正在載入水位資料…</Text>;
}
