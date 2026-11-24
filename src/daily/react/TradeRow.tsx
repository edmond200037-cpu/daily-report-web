import { useRef, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import { Icon } from '@astryxdesign/core/Icon';
import { MinusIcon, PlusIcon } from 'lucide-react';
import { Text } from '@astryxdesign/core/Text';
import type { TradeSection, WorkItem } from '../../domain/daily';
import { appState, tradeDrag } from '../../app/state';
import { normalizeName } from '../../format/normalization';
import {
  sameWorkNames,
  workSuggestions,
  locationChipText,
  clearWorkItemDetails,
} from '../work-input';
import { snapshotDetails, workUndoScope } from '../work-detail-undo';
import { splitWorkInput } from '../input-workflow';
import { applyLocationMemory, normalizeFloor } from '../floor';
import { validateTrade, validateWorkerCount } from '../daily-validator';
import { dailyLocked } from './actions';
import { dailyUi, workComposerDrafts } from './runtime';
import { Action, Field, Notes } from './controls';
import { EntryDropMarker, EntrySummary } from './EntryRow';

export function WorkRow({
  trade,
  work,
  index,
}: {
  trade: TradeSection;
  work: WorkItem;
  index: number;
}) {
  const [aux, setAux] = useState<'location' | 'note' | null>(null);
  const textInput = useRef<HTMLInputElement>(null);
  const closeAux = () => {
    setAux(null);
    textInput.current?.focus();
  };
  const edit = (field: keyof WorkItem, value: string) => {
    if (dailyLocked()) return;
    appState.daily.updateTradeOutputData(trade.id, (current) => {
      const target = current.workItems.find((row) => row.id === work.id);
      if (target) {
        Object.assign(target, { [field]: value });
        if (field === 'taskTextSnapshot') target.taskId = null;
        if (field === 'startFloorRaw')
          target.startFloorNormalized = normalizeFloor(value) || null;
        if (field === 'endFloorRaw') target.endFloorNormalized = normalizeFloor(value) || null;
        if (field === 'locationTextSnapshot')
          applyLocationMemory(
            target,
            appState.dailyLocations.find(
              (row) =>
                row.status === 'confirmed' && row.normalizedName === normalizeName(value),
            ),
          );
      }
    });
    dailyUi.refresh();
  };
  return (
    <VStack
      className="work-token--item"
      data-work={work.id}
      data-sortable-work
      gap={2}
      paddingBlock={2}
    >
      <HStack gap={2} vAlign="center">
        <Button
          label={`工項 ${index + 1}：長按排序`}
          icon={<Text>⋮⋮</Text>}
          isIconOnly
          data-work-gesture
          isDisabled={dailyLocked()}
          width="var(--size-element-md)"
        />
        <Field
          ref={textInput}
          label={`工項 ${index + 1}`}
          isLabelHidden
          value={work.taskTextSnapshot}
          onChange={(value) => edit('taskTextSnapshot', value)}
          width="100%"
        />
        <Button
          label="移除工項"
          icon={<Text>×</Text>}
          isIconOnly
          data-work-delete
          isDisabled={dailyLocked()}
        />
      </HStack>
      <HStack gap={2} wrap="wrap">
        <Button
          label={locationChipText(
            work.startFloorRaw,
            work.endFloorRaw,
            work.locationTextSnapshot,
          )}
          aria-label={`工項 ${index + 1} 位置與樓層`}
          aria-expanded={aux === 'location'}
          onClick={() => setAux(aux === 'location' ? null : 'location')}
        />
        <Button
          label={work.note ? '備註・已填' : '備註'}
          onClick={() => setAux(aux === 'note' ? null : 'note')}
        />
        {(work.startFloorRaw || work.endFloorRaw || work.locationTextSnapshot || work.note) && (
          <Button
            label="移除位置與備註"
            isDisabled={dailyLocked()}
            onClick={() => {
              if (dailyLocked()) return;
              appState.daily.updateTradeOutputData(trade.id, (current) => {
                const target = current.workItems.find((row) => row.id === work.id);
                if (!target) return;
                const before = snapshotDetails(target);
                clearWorkItemDetails(target);
                appState.workDetailUndo = {
                  scope: workUndoScope(appState.daily.report),
                  tradeId: trade.id,
                  workId: work.id,
                  before,
                  cleared: snapshotDetails(target),
                };
              });
              setAux(null);
              dailyUi.refresh();
            }}
          />
        )}
      </HStack>
      {aux === 'location' && (
        <VStack
          gap={2}
          onKeyDown={(event) => {
            if (event.key === 'Escape') closeAux();
          }}
        >
          <HStack gap={2}>
            <Field
              label="起始樓層"
              value={work.startFloorRaw}
              onChange={(value) => edit('startFloorRaw', value)}
              onBlur={() => {
                const normalized = normalizeFloor(work.startFloorRaw);
                if (normalized !== null && normalized !== work.startFloorRaw)
                  edit('startFloorRaw', normalized);
              }}
              width="100%"
            />
            <Field
              label="結束樓層"
              value={work.endFloorRaw}
              onChange={(value) => edit('endFloorRaw', value)}
              onBlur={() => {
                const normalized = normalizeFloor(work.endFloorRaw);
                if (normalized !== null && normalized !== work.endFloorRaw)
                  edit('endFloorRaw', normalized);
              }}
              width="100%"
            />
          </HStack>
          <Field
            label="位置"
            value={work.locationTextSnapshot}
            onChange={(value) => edit('locationTextSnapshot', value)}
          />
          <HStack gap={2} wrap="wrap">
            {appState.dailyLocations
              .filter((row) => row.status === 'confirmed')
              .map((row) => (
                <Button
                  key={row.id}
                  label={row.name}
                  isDisabled={dailyLocked()}
                  onClick={() => {
                    if (dailyLocked()) return;
                    appState.daily.updateTradeOutputData(trade.id, (current) => {
                      const target = current.workItems.find((item) => item.id === work.id);
                      if (target) applyLocationMemory(target, row);
                    });
                    dailyUi.refresh();
                  }}
                />
              ))}
          </HStack>
        </VStack>
      )}
      {aux === 'note' && (
        <Notes label="備註" value={work.note} onChange={(value) => edit('note', value)} />
      )}
      {aux && <Button label="返回工項" onClick={closeAux} />}
    </VStack>
  );
}

function WorkComposer({ trade }: { trade: TradeSection }) {
  const draftKey = `${appState.entryScopeKey}:${trade.id}`;
  const [query, setLocalQuery] = useState(workComposerDrafts.get(draftKey) ?? '');
  const setQuery = (value: string) => {
    workComposerDrafts.set(draftKey, value);
    setLocalQuery(value);
  };
  const duplicates = sameWorkNames(trade, query);
  const add = (text: string, memoryId?: string) => {
    if (dailyLocked() || appState.entryComposing) return;
    const parsed = splitWorkInput(text, true);
    for (const name of parsed.committed) {
      const memory = appState.dailyTasks.find(
        (row) =>
          row.status === 'confirmed' &&
          row.tradeTypeId === trade.tradeTypeId &&
          normalizeName(row.name) === normalizeName(name),
      );
      appState.daily.addWorkItem(trade.id, name, memoryId ?? memory?.id ?? null);
    }
    setQuery(parsed.remainder);
    dailyUi.refresh();
  };
  return (
    <VStack gap={2}>
      <HStack gap={2} vAlign="end">
        <Field
          label="搜尋或輸入下一個工項"
          value={query}
          onChange={setQuery}
          placeholder="工項，以頓號分隔"
          width="100%"
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              !event.nativeEvent.isComposing &&
              event.keyCode !== 229 &&
              !appState.entryComposing
            ) {
              event.preventDefault();
              event.stopPropagation();
              add(query);
            }
          }}
        />
        <Button
          label="加入"
          icon={<Text>＋</Text>}
          isIconOnly
          isDisabled={dailyLocked() || !query.trim()}
          onClick={() => add(query)}
        />
      </HStack>
      {!!duplicates.length && (
        <Text role="status">已有相同工項「{duplicates.join('、')}」，請設定不同位置。</Text>
      )}
      <HStack gap={2} wrap="wrap" aria-label="建議工項">
        {workSuggestions(
          trade,
          appState.dailyTasks.filter((row) => row.status === 'confirmed'),
          query,
        ).map((row) => (
          <Button
            key={row.id}
            label={row.name}
            isDisabled={dailyLocked()}
            data-task-chip={row.id}
            onClick={() => add(row.name, row.id)}
          />
        ))}
      </HStack>
    </VStack>
  );
}

export function TradeRow({ trade }: { trade: TradeSection }) {
  const [editingIdentity, setEditingIdentity] = useState(false);
  const [needsVendor] = useState(!trade.vendorNameSnapshot);
  const expanded = appState.daily.expandedId === trade.id;
  const update = (
    field: 'workerCount' | 'vendorNameSnapshot' | 'tradeNameSnapshot',
    value: string,
  ) => {
    if (dailyLocked()) return;
    appState.daily.updateTradeOutputData(trade.id, (row) => {
      row[field] = value;
      if (field === 'vendorNameSnapshot')
        row.vendorId =
          appState.dailyVendors.find(
            (memory) =>
              memory.tradeTypeId === row.tradeTypeId &&
              memory.normalizedName === normalizeName(value),
          )?.id ?? null;
      if (field === 'tradeNameSnapshot')
        row.tradeTypeId =
          appState.dailyTrades.find((memory) => memory.normalizedName === normalizeName(value))
            ?.id ?? null;
    });
    dailyUi.refresh();
  };
  const step = (delta: number) => {
    const value = Math.max(
      1,
      (validateWorkerCount(trade.workerCount) ? Number(trade.workerCount) : 0) + delta,
    );
    update('workerCount', String(value));
  };
  const works = trade.workItems.filter((row) => row.taskTextSnapshot.trim());
  const task = works[0]?.taskTextSnapshot || '尚未新增工項';
  const issues = validateTrade(trade, appState.daily.linkedMaterialEntries(trade.id));
  return (
    <VStack gap={0} data-swipe-item="true" data-swipe-kind="trade" data-swipe-id={trade.id}>
      <EntryDropMarker kind="trade" id={trade.id} />
      <VStack
        as="article"
        data-trade={trade.id}
        data-sortable-entry="trade"
        data-entry-id={trade.id}
        gap={3}
        paddingBlock={3}
        style={{
          borderBottom: 'var(--border-width) solid var(--color-border)',
          scrollMarginTop: 'var(--size-element-md)',
          background: 'var(--color-background-body)',
          visibility: tradeDrag.active && tradeDrag.id === trade.id ? 'hidden' : undefined,
          transform: 'translateX(var(--trade-swipe-offset, 0))',
        }}
      >
        <EntrySummary
          id={trade.id}
          label={trade.tradeNameSnapshot || '未填工種'}
          detail={
            <VStack gap={1}>
              <Text type="supporting">
                {trade.vendorNameSnapshot || '未填廠商'} · {trade.workerCount || '未填'} 人
              </Text>
              {!expanded && (
                <Text type="supporting">
                  {task}
                  {works.length > 1 ? `・另 ${works.length - 1} 項` : ''}
                </Text>
              )}
            </VStack>
          }
          status={trade.status === 'draft' ? '未完成' : '資料齊全'}
          expanded={expanded}
          onToggle={() => {
            appState.daily.toggle(trade.id);
            appState.dailyPreviewOpen = false;
            dailyUi.refresh();
          }}
          actions={
            expanded && (
              <Button
                label="更多操作"
                tooltip="編輯工種與廠商"
                icon={<Icon icon="moreHorizontal" size="md" />}
                isIconOnly
                onClick={() => setEditingIdentity(!editingIdentity)}
              />
            )
          }
        />
        {expanded && (
          <VStack className="trade-card__content" gap={3}>
            {(editingIdentity || needsVendor) && (
              <VStack gap={2}>
                {editingIdentity && (
                  <Field
                    label="工種"
                    value={trade.tradeNameSnapshot}
                    onChange={(value) => update('tradeNameSnapshot', value)}
                  />
                )}
                <Field
                  label="廠商"
                  value={trade.vendorNameSnapshot}
                  onChange={(value) => update('vendorNameSnapshot', value)}
                />
              </VStack>
            )}
            {(editingIdentity || needsVendor) && (
              <HStack gap={2} wrap="wrap" aria-label="常用廠商">
                {appState.dailyVendors
                  .filter(
                    (row) =>
                      row.status === 'confirmed' && row.tradeTypeId === trade.tradeTypeId,
                  )
                  .map((row) => (
                    <Button
                      key={row.id}
                      label={row.name}
                      isDisabled={dailyLocked()}
                      onClick={() => update('vendorNameSnapshot', row.name)}
                    />
                  ))}
              </HStack>
            )}
            <HStack gap={2} vAlign="end" aria-label="出工人數">
              <Button
                label="減少人數"
                icon={<Icon icon={MinusIcon} size="md" />}
                isIconOnly
                isDisabled={dailyLocked() || trade.workerCount === '1'}
                onClick={() => step(-1)}
              />
              <Field
                label="人數"
                value={trade.workerCount}
                inputMode="numeric"
                width="100%"
                onChange={(value) => update('workerCount', value)}
                status={
                  trade.workerCount && !validateWorkerCount(trade.workerCount)
                    ? { type: 'error', message: '請輸入大於 0 的整數' }
                    : undefined
                }
              />
              <Button
                label="增加人數"
                icon={<Icon icon={PlusIcon} size="md" />}
                isIconOnly
                isDisabled={dailyLocked()}
                onClick={() => step(1)}
              />
            </HStack>
            <WorkComposer trade={trade} />
            <VStack gap={0}>
              {trade.workItems.map((work, index) => (
                <WorkRow key={work.id} trade={trade} work={work} index={index} />
              ))}
            </VStack>
            {issues.length > 0 && <Text role="status">{issues[0].message}</Text>}
            <HStack gap={2} wrap="wrap">
              <Action label="收合" action="keep-trade" data={{ id: trade.id }} />
              <Action
                label="完成這筆"
                action="finish-entry"
                data={{ id: trade.id }}
                isDisabled={dailyLocked()}
              />
              {appState.justAddedEntry?.kind === 'trade' &&
                appState.justAddedEntry.id === trade.id && (
                  <Action
                    label="取消新增"
                    action="cancel-new-entry"
                    data={{ id: trade.id, entryKind: 'trade' }}
                    isDisabled={dailyLocked()}
                  />
                )}
            </HStack>
            {!!appState.daily.linkedMaterialEntries(trade.id).length && (
              <Text>已連接 {appState.daily.linkedMaterialEntries(trade.id).length} 筆進料</Text>
            )}
          </VStack>
        )}
      </VStack>
      <EntryDropMarker kind="trade" id={trade.id} end />
    </VStack>
  );
}
