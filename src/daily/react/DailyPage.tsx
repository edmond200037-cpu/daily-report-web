import { useState, useSyncExternalStore } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import { Text, Heading } from '@astryxdesign/core/Text';
import { List, ListItem } from '@astryxdesign/core/List';
import { BottomSheet } from '@astryxdesign/core/BottomSheet';
import { DateInput } from '@astryxdesign/core/DateInput';
import { Selector } from '@astryxdesign/core/Selector';
import { appState } from '../../app/state';
import { memoryOrder, pwaUpdateContent } from '../../app/shell';
import { syncActiveSiteNow } from '../../app/sync-runtime';
import { switchDailyDate } from '../../app/workspace-events';
import { selectSharedSiteFromWorkspace } from '../../account/account-controller';
import { selectDailySite } from '../views/daily-entry';
import { dailySyncLabel } from '../views/daily-view';
import { startContactEntry } from '../views/contact-view';
import { recentTradeVendor, tradePickerChoices } from '../trade-picker';
import { formatDate } from '../../format/date-format';
import { formatDailyReport } from '../daily-formatter';
import { validateDailyForFinalization, validateWorkerCount } from '../daily-validator';
import { dailyLocked, editDaily } from './actions';
import { dailyUi, workUndoNotice, scrollToTrade } from './runtime';
import { Action, Field, Notes } from './controls';
import { TradeRow } from './TradeRow';
import { MaterialRows } from './MaterialRows';
import { ContactRows } from './ContactRows';
import { EntryRow } from './EntryRow';
import { canRestoreDetails } from '../work-detail-undo';

function TradePicker() {
  const [query, setQuery] = useState('');
  const picks = tradePickerChoices(
    appState.dailyTrades.filter((row) => row.status === 'confirmed'),
    query,
  );
  const select = (name: string, id: string | null) => {
    if (dailyLocked() || appState.entryComposing) return;
    const vendor = id ? recentTradeVendor(appState.dailyVendors, id) : undefined;
    if (appState.entryKind === 'contacts') startContactEntry(name, vendor?.name, id, vendor?.id);
    else {
      const created = appState.daily.addTradeEntry(name, id, vendor);
      appState.justAddedEntry = { kind: 'trade', id: created.id };
      scrollToTrade(created.id);
    }
    appState.tradePickerOpen = false;
    dailyUi.refresh();
  };
  return (
    <BottomSheet
      label={appState.entryKind === 'contacts' ? '選擇聯絡工種' : '選擇施工工種'}
      isOpen={appState.tradePickerOpen}
      onOpenChange={(open) => {
        appState.tradePickerOpen = open;
        dailyUi.refresh();
      }}
      purpose="form"
    >
      <VStack gap={4}>
        <HStack gap={2} hAlign="between">
          <Heading level={2}>選擇工種</Heading>
          <Button
            label="取消"
            onClick={() => {
              appState.tradePickerOpen = false;
              dailyUi.refresh();
            }}
          />
        </HStack>
        <Field
          label="搜尋工種名稱"
          value={query}
          onChange={setQuery}
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              !event.nativeEvent.isComposing &&
              event.keyCode !== 229 &&
              !appState.entryComposing &&
              query.trim()
            ) {
              event.preventDefault();
              select(query.trim(), picks.find((row) => row.name === query.trim())?.id ?? null);
            }
          }}
        />
        <List hasDividers edge="flush">
          {picks.map((trade) => (
            <ListItem
              key={trade.id}
              itemKey={trade.id}
              label={trade.name}
              description={recentTradeVendor(appState.dailyVendors, trade.id)?.name}
              onClick={() => select(trade.name, trade.id)}
              isDisabled={dailyLocked()}
            />
          ))}
        </List>
        {query.trim() && !picks.some((row) => row.name === query.trim()) && (
          <Button
            label={`立即新增工種「${query.trim()}」`}
            variant="primary"
            isDisabled={dailyLocked()}
            onClick={() => select(query.trim(), null)}
          />
        )}
      </VStack>
    </BottomSheet>
  );
}

function DailyHeader() {
  const [siteQuery, setSiteQuery] = useState('');
  const activeSite = appState.accountSites.find((site) => site.id === appState.accountActiveSiteId);
  return (
    <VStack as="header" gap={3}>
      <HStack gap={2} wrap="wrap" hAlign="between">
        <Action
          label={`${formatDate(appState.daily.report.date)} ${appState.daily.report.siteNameSnapshot || '未選工地'} ▾`}
          action="toggle-basics"
          aria-expanded={appState.dailyBasicsExpanded}
          aria-controls="daily-basics-panel"
          width="100%"
        />
        <Text role="status" data-save-status data-state={appState.dailySaveState}>
          {dailySyncLabel()}
        </Text>
        {appState.accountAuth.user && appState.accountActiveSiteId && (
          <Button
            label={appState.syncInFlight ? '同步中…' : '立即同步'}
            isDisabled={appState.syncInFlight}
            onClick={() => {
              void syncActiveSiteNow().then(() => dailyUi.refresh());
            }}
          />
        )}
      </HStack>
      {appState.accountAuth.user && (
        <Text type="supporting">
          本機上次取得雲端資料：
          {appState.lastPulledAt
            ? new Date(appState.lastPulledAt).toLocaleString('zh-TW')
            : '尚未同步'}
        </Text>
      )}
      {appState.syncFeedback && <Text role="status">{appState.syncFeedback}</Text>}
      {appState.dailyBasicsExpanded && (
        <VStack id="daily-basics-panel" aria-label="日期與工地" gap={3}>
          <DateInput
            label="日報日期"
            value={
              appState.daily.report
                .date as `${number}${number}${number}${number}-${number}${number}-${number}${number}`
            }
            presentation="native"
            isDisabled={appState.dateSwitching || appState.workspaceSwitching}
            onChange={(value) => {
              if (value) void switchDailyDate(value).then(() => dailyUi.refresh());
            }}
          />
          {appState.accountAuth.user ? (
            <Selector
              label="共用工地"
              value={appState.accountActiveSiteId ?? ''}
              options={appState.accountSites.map((site) => ({
                value: site.id,
                label: `${site.name}${site.role === 'viewer' ? '（檢視）' : ''}`,
              }))}
              placeholder="請選擇共用工地"
              presentation="adaptive"
              isDisabled={appState.workspaceSwitching}
              onChange={(value) => {
                void selectSharedSiteFromWorkspace(value);
              }}
            />
          ) : (
            <>
              <Text>本機工作區</Text>
              <Field
                label="搜尋或新增工地"
                value={siteQuery}
                onChange={setSiteQuery}
                onKeyDown={(event) => {
                  if (
                    event.key === 'Enter' &&
                    !event.nativeEvent.isComposing &&
                    event.keyCode !== 229 &&
                    !appState.entryComposing &&
                    siteQuery.trim()
                  ) {
                    event.preventDefault();
                    void selectDailySite(siteQuery);
                  }
                }}
              />
              <HStack gap={2} wrap="wrap">
                {memoryOrder(
                  appState.dailySites.filter(
                    (site) => site.status === 'confirmed' && site.name.includes(siteQuery),
                  ),
                )
                  .slice(0, 5)
                  .map((site) => (
                    <Button
                      key={site.id}
                      label={site.name}
                      isDisabled={dailyLocked()}
                      onClick={() => {
                        void selectDailySite(site.name);
                      }}
                    />
                  ))}
                {siteQuery.trim() && (
                  <Button
                    label={`新增並使用「${siteQuery.trim()}」`}
                    isDisabled={dailyLocked()}
                    onClick={() => {
                      void selectDailySite(siteQuery);
                    }}
                  />
                )}
              </HStack>
            </>
          )}
          {activeSite?.role === 'viewer' && <Text>目前為檢視模式，無法修改資料。</Text>}
        </VStack>
      )}
    </VStack>
  );
}

function Preview() {
  const report = appState.daily.report;
  const issues = validateDailyForFinalization(report);
  return (
    <BottomSheet
      label="日報預覽與定稿"
      isOpen={appState.dailyPreviewOpen}
      onOpenChange={(open) => {
        appState.dailyPreviewOpen = open;
        dailyUi.refresh();
      }}
      height="tall"
    >
      <VStack gap={4}>
        <Heading level={2}>日報預覽</Heading>
        {issues.map((issue) => (
          <Text key={issue}>{issue}</Text>
        ))}
        <VStack data-report-preview style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          <Text>{formatDailyReport(report) || '填寫施工紀錄後，這裡會顯示日報預覽。'}</Text>
        </VStack>
        <HStack gap={2} wrap="wrap">
          <Action
            label="僅複製"
            action="copy"
            isDisabled={!!issues.length || !!appState.contactEditor}
          />
          <Action
            label="定稿並複製"
            action="finalize"
            variant="primary"
            isDisabled={
              dailyLocked() ||
              !!issues.length ||
              !!appState.contactEditor ||
              appState.finalizeInFlight
            }
          />
          <Button label="查看近 7 天" href="#daily/history" />
        </HStack>
        <Text type="supporting">定稿會保留 7 天；草稿保留供繼續編輯。</Text>
        {appState.dailyCopyFeedback && <Text role="status">{appState.dailyCopyFeedback}</Text>}
        <Button
          label="關閉預覽"
          onClick={() => {
            appState.dailyPreviewOpen = false;
            dailyUi.refresh();
          }}
        />
      </VStack>
    </BottomSheet>
  );
}

export function DailyPage() {
  useSyncExternalStore(dailyUi.subscribe, dailyUi.snapshot, dailyUi.snapshot);
  const report = appState.daily.report;
  const update = pwaUpdateContent();
  return (
    <VStack
      gap={6}
      data-react-daily
      data-ignore-background-collapse
      style={{ minWidth: 0, paddingBottom: 'calc(var(--size-element-lg) * 3)' }}
    >
      <DailyHeader />
      <Text>
        {report.tradeSections.length} 筆施工 ·{' '}
        {report.tradeSections.reduce(
          (sum, trade) =>
            sum + (validateWorkerCount(trade.workerCount) ? Number(trade.workerCount) : 0),
          0,
        )}{' '}
        人 · {report.contacts.length} 筆聯絡
      </Text>
      {appState.entrySaveError && <Text role="alert">{appState.entrySaveError}</Text>}
      <VStack as="section" aria-label="施工紀錄" data-daily-section="trade" gap={3}>
        <Heading level={2}>常用工種</Heading>
        <HStack gap={2} wrap="wrap" aria-label="常用工種">
          {memoryOrder(appState.dailyTrades.filter((trade) => trade.status === 'confirmed'))
            .slice(0, 8)
            .map((trade) => (
              <Button
                key={trade.id}
                label={trade.name}
                data-trade-chip={trade.id}
                isDisabled={dailyLocked()}
                onClick={() => {
                  if (dailyLocked()) return;
                  const created = appState.daily.addTradeEntry(
                    trade.name,
                    trade.id,
                    recentTradeVendor(appState.dailyVendors, trade.id),
                  );
                  appState.justAddedEntry = { kind: 'trade', id: created.id };
                  scrollToTrade(created.id);
                  dailyUi.refresh();
                }}
              />
            ))}
          <Action label="＋選擇工種" action="add-trade" isDisabled={dailyLocked()} />
        </HStack>
        <VStack gap={0}>
          {report.tradeSections.map((trade) => (
            <TradeRow key={trade.id} trade={trade} />
          ))}
        </VStack>
      </VStack>
      <MaterialRows />
      <ContactRows />
      <VStack as="section" aria-label="特殊事項" data-daily-section="special" gap={3}>
        <Text weight="bold">特殊事項</Text>
        <VStack gap={0}>
          {report.specialItems.map((item) => (
            <EntryRow
              key={item.id}
              kind="special"
              id={item.id}
              label="現場提醒"
              detail={
                appState.expandedSpecialId === item.id ? undefined : item.content || '尚未填寫內容'
              }
              status={item.content.trim() ? '已輸入' : '未填寫'}
              expanded={appState.expandedSpecialId === item.id}
              onToggle={() => {
                appState.expandedSpecialId =
                  appState.expandedSpecialId === item.id ? null : item.id;
                dailyUi.refresh();
              }}
            >
              {appState.expandedSpecialId === item.id && (
                <VStack gap={2} data-special={item.id}>
                  <Notes
                    label="特殊事項內容"
                    value={item.content}
                    onChange={(value) =>
                      editDaily(() => {
                        item.content = value;
                      })
                    }
                  />
                  <HStack gap={2} wrap="wrap">
                    {appState.settingsTemplates.map((template) => (
                      <Button
                        key={template.id}
                        label={template.text}
                        isDisabled={dailyLocked()}
                        onClick={() =>
                          editDaily(() => {
                            item.content = template.text;
                          })
                        }
                      />
                    ))}
                  </HStack>
                  <HStack gap={2}>
                    <Action
                      label="刪除特殊事項"
                      action="delete-special"
                      data={{ id: item.id }}
                      isDisabled={dailyLocked()}
                    />
                    {appState.justAddedEntry?.kind === 'special' &&
                      appState.justAddedEntry.id === item.id && (
                        <Action
                          label="取消新增"
                          action="cancel-new-entry"
                          data={{ id: item.id, entryKind: 'special' }}
                          isDisabled={dailyLocked()}
                        />
                      )}
                  </HStack>
                </VStack>
              )}
            </EntryRow>
          ))}
        </VStack>
      </VStack>
      {!!appState.tradeUndoQueue.length && (
        <HStack gap={2} role="status">
          <Text>已刪除 {appState.tradeUndoQueue.length} 個項目（6 秒內可復原）</Text>
          <Action label="復原上一筆" action="undo-trade-delete" isDisabled={dailyLocked()} />
        </HStack>
      )}
      {appState.materialConnectionUndo &&
        appState.materialConnectionUndo.expiresAt > Date.now() && (
          <HStack gap={2} role="status">
            <Text>已解除進料連接</Text>
            <Action label="復原連接" action="undo-material-disconnect" isDisabled={dailyLocked()} />
          </HStack>
        )}
      {appState.workDetailUndo && canRestoreDetails(appState.workDetailUndo, report) && (
        <HStack gap={2} role="status">
          <Text>已移除位置、樓層與備註</Text>
          <Action label="復原位置與備註" action="undo-work-details" isDisabled={dailyLocked()} />
        </HStack>
      )}
      {workUndoNotice.restore && workUndoNotice.expiresAt > Date.now() && (
        <HStack gap={2} role="status">
          <Text>已刪除工項</Text>
          <Button
            label="復原工項"
            isDisabled={dailyLocked()}
            onClick={() => {
              const restore = workUndoNotice.restore;
              workUndoNotice.restore = undefined;
              if (restore) void restore().finally(dailyUi.refresh);
            }}
          />
        </HStack>
      )}
      <HStack
        gap={1}
        wrap="wrap"
        as="footer"
        aria-label="新增日報項目"
        paddingBlock={2}
        style={{
          position: 'fixed',
          bottom: 'env(safe-area-inset-bottom)',
          left: 'var(--spacing-4)',
          right: 'var(--spacing-4)',
          background: 'var(--color-background-body)',
          borderTop: 'var(--border-width) solid var(--color-border)',
          zIndex: 1,
        }}
      >
        <Action label="＋施工" size="sm" action="add-trade" isDisabled={dailyLocked()} />
        <Action label="＋進料" size="sm" action="add-normal-material" isDisabled={dailyLocked()} />
        <Action label="＋聯絡" size="sm" action="add-contact" isDisabled={dailyLocked()} />
        <Action label="＋特殊" size="sm" action="add-special" isDisabled={dailyLocked()} />
        <Action label="預覽定稿" size="sm" action="toggle-preview" variant="primary" />
      </HStack>
      <TradePicker key={`${appState.entryKind}:${appState.tradePickerOpen}`} />
      <Preview />
      {update && (
        <VStack gap={2} role="status">
          <Text weight="bold">{update.title}</Text>
          <Text>{update.message}</Text>
          <HStack gap={2}>
            {[...update.actions.matchAll(/data-app-action="([^"]+)"[^>]*>([^<]+)/g)].map(
              (match) => (
                <Button key={match[1]} label={match[2]} data-app-action={match[1]} />
              ),
            )}
          </HStack>
        </VStack>
      )}
    </VStack>
  );
}
