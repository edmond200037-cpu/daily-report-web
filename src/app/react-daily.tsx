import { useMemo, useRef, useState, type ComponentProps } from 'react';
import { DateInput } from '@astryxdesign/core/DateInput';
import { Typeahead, type SearchSource, type SearchableItem } from '@astryxdesign/core/Typeahead';
import { Selector } from '@astryxdesign/core/Selector';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { List, ListItem } from '@astryxdesign/core/List';
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { BottomSheet } from '@astryxdesign/core/BottomSheet';
import { app, appState } from './state';
import { switchDailyDate } from './workspace-events';
import { selectSharedSiteFromWorkspace } from '../account/account-controller';
import { selectDailySite } from '../daily/views/daily-entry';
import { handleDailyAction } from '../daily/views/daily-events';
import { isReadOnlySite } from './sync-runtime';
import { formatDailyReport } from '../daily/daily-formatter';
import { validateTrade, validateWorkerCount } from '../daily/daily-validator';
import { notifyReact } from './react-store';
import { dailySyncLabel } from '../daily/views/daily-view';
import { duplicateVendorTradeIds, groupOutputTrades } from '../daily/daily-output-model';

// The legacy dispatcher changes its button text. Keep that DOM outside React ownership.
async function dispatchDailyAction(action: string, id?: string): Promise<void> {
  const command = document.createElement('button');
  command.dataset.dailyAction = action;
  if (id) command.dataset.id = id;
  await handleDailyAction(command, command);
  notifyReact();
}

export function DailyContext() {
  const report = appState.daily.report;
  const locked = appState.dateSwitching || appState.workspaceSwitching;
  const selectedSite = useMemo(() => report.siteNameSnapshot ? { id: report.siteId ?? 'current', label: report.siteNameSnapshot } : null, [report.siteId, report.siteNameSnapshot]);
  const source = useMemo<SearchSource>(() => ({
    search: (query) => {
      const rows: SearchableItem[] = appState.dailySites.filter((site) => site.name.includes(query)).map((site) => ({ id: site.id, label: site.name }));
      if (query.trim() && !rows.some((row) => row.label === query.trim())) rows.push({ id: 'create', label: query.trim() });
      return rows;
    },
    bootstrap: () => [],
  }), []);
  return <VStack gap={4} padding={4} as="header" className="daily-context">
    <Heading level={1}>施工日報</Heading>
    <output data-save-status data-state={appState.dailySaveState}>{dailySyncLabel()}</output>
    {!appState.accountAuth.user && <Text>本機工作區</Text>}
    <DateInput label="日報日期" value={report.date as ComponentProps<typeof DateInput>['value']} onChange={(date) => { if (date) void switchDailyDate(date); }} isDisabled={locked} size="lg" presentation="native" />
    {appState.accountAuth.user ? <Selector label="切換工地" size="lg" value={appState.accountActiveSiteId ?? ''}
      options={[{ value: '', label: '本機工作區' }, ...appState.accountSites.map((site) => ({ value: site.id, label: site.name }))]}
      onChange={(value) => { void selectSharedSiteFromWorkspace(value ?? ''); }} isDisabled={locked} />
      : <Typeahead label="工地名稱" size="lg" searchSource={source} value={selectedSite}
        onChange={(value) => { if (value) void selectDailySite(value.label); }} isDisabled={locked || isReadOnlySite()} emptySearchText="輸入工地名稱以新增" />}
    <Button label="近 7 天日報" href="#daily/history" size="lg" variant="ghost" />
  </VStack>;
}

export function DailyReview() {
  const [open, setOpen] = useState(false);
  const finalFocusRef = useRef<HTMLElement | null>(null);
  const report = appState.daily.report;
  const drafts = report.tradeSections.filter((trade) => trade.status === 'draft');
  const complete = report.tradeSections.length - drafts.length;
  const locked = appState.workspaceSwitching || appState.dateSwitching;
  const unavailable = Boolean(drafts.length || appState.contactEditor);
  const changeOpen = (value: boolean) => { if (value) finalFocusRef.current = null; setOpen(value); appState.dailyPreviewOpen = value; };
  return <VStack paddingBlock={2} paddingInline={4}>
    <HStack gap={3} vAlign="center">
      <Text type="supporting" maxLines={2}>{report.tradeSections.length} 筆施工 · {report.tradeSections.reduce((sum, trade) => sum + (validateWorkerCount(trade.workerCount) ? Number(trade.workerCount) : 0), 0)} 人 · {report.contacts.length} 筆聯絡 · {unavailable ? `尚有 ${drafts.length + Number(Boolean(appState.contactEditor))} 筆需補填` : complete ? '齊全' : '尚無施工紀錄'}</Text>
      <Button label="檢查與預覽" variant="primary" size="lg" data-daily-action="toggle-preview" isDisabled={locked} onClick={() => changeOpen(true)} />
    </HStack>
    <BottomSheet label="檢查與預覽" isOpen={open} onOpenChange={changeOpen} finalFocusRef={finalFocusRef} height="hug" padding={0}>
      <Layout height="fill" style={{ height: '70dvh' }} content={<LayoutContent padding={4} label="日報預覽文字"><VStack gap={4}>
        <Heading level={2}>檢查與預覽</Heading>
        <List hasDividers>{drafts.map((trade) => <ListItem key={trade.id} label={trade.tradeNameSnapshot || '施工紀錄'}
          description={validateTrade(trade, appState.daily.linkedMaterialEntries(trade.id))[0]?.message ?? '請整理重複廠商'}
          endContent={<Button label="補填" data-daily-action="fix-entry" data-id={trade.id} size="lg" clickAction={async () => {
            const issue = validateTrade(trade, appState.daily.linkedMaterialEntries(trade.id))[0]?.field;
            await dispatchDailyAction('fix-entry', trade.id);
            const field = issue === 'vendor' ? 'vendorNameSnapshot' : issue === 'workerCount' ? 'workerCount' : issue === 'trade' ? 'tradeNameSnapshot' : '';
            finalFocusRef.current = app.querySelector<HTMLElement>(field ? `[data-trade-editor="${CSS.escape(trade.id)}"] [data-daily-field="${field}"]` : `[data-continuous-work="${CSS.escape(trade.id)}"]`);
            changeOpen(false);
          }} />} />)}</List>
        {duplicateVendorTradeIds(report).size > 0 && <Text>同一工種存在重複廠商施工卡；預覽保留原內容，但不能定稿。</Text>}
        {groupOutputTrades(report, false).some((group) => new Set(group.sections.map((trade) => trade.tradeNameSnapshot.trim())).size > 1) && <Text>同一工種的名稱快照不一致；預覽採最前施工卡名稱。</Text>}
        <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', font: 'inherit' }}>{formatDailyReport(report) || '填寫施工紀錄後，這裡會顯示日報預覽。'}</pre>
        <Button label="查看近 7 天" href="#daily/history" size="lg" />
      </VStack></LayoutContent>} footer={<LayoutFooter hasDivider padding={4} label="預覽固定操作"><VStack gap={2}>
        <Button label="複製日報文字" size="lg" isDisabled={unavailable || !complete || locked} clickAction={() => dispatchDailyAction('copy')} data-daily-action="copy" />
        <Button label="定稿並複製（草稿保留）" size="lg" variant="primary" data-daily-action="finalize" isDisabled={unavailable || !complete || locked || isReadOnlySite()}
          clickAction={() => dispatchDailyAction('finalize')} />
        <output className="daily-output__feedback">{appState.dailyCopyFeedback}</output>
        <Button label="關閉預覽" size="lg" onClick={() => changeOpen(false)} />
      </VStack></LayoutFooter>} />
    </BottomSheet>
  </VStack>;
}
