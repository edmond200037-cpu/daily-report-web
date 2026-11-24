import { HStack } from '@astryxdesign/core/HStack';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { mountContent, unmountContent } from './react-content';
import { createReorderable } from '@astryxdesign/core';
import { createSwipe } from '@astryxdesign/core/Swipe';
import { useToast } from '@astryxdesign/core/Toast';
import { VStack } from '@astryxdesign/core/VStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import {
  Typeahead,
  type SearchSource,
  type SearchableItem,
} from '@astryxdesign/core/Typeahead';
import { Selector } from '@astryxdesign/core/Selector';
import { DateInput } from '@astryxdesign/core/DateInput';
import { Dialog } from '@astryxdesign/core/Dialog';
import { BottomSheet } from '@astryxdesign/core/BottomSheet';
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { onDailyAddRequest, scrollToDailySection } from '../daily/add-bar';
import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import { List, ListItem } from '@astryxdesign/core/List';
import { appState } from './state';
import { useAppVersion, notifyReact } from './react-store';
import { isReadOnlySite } from './sync-runtime';
import { handleDailyAction, scrollAndFocus } from '../daily/views/daily-events';
import {
  commitInputMemories,
  persistEntryDraft,
  showEntrySaveError,
} from '../daily/views/daily-entry';
import {
  snapshotWorkDrafts,
  restoreWorkDrafts,
  workSuggestions,
  clearWorkItemDetails,
} from '../daily/work-input';
import { splitWorkInput } from '../daily/input-workflow';
import { canRestoreDetails, snapshotDetails, workUndoScope } from '../daily/work-detail-undo';
import { applyLocationMemory, normalizeFloor } from '../daily/floor';
import { discardMaterialEditor, startMaterialEditor } from '../daily/views/material-view';
import { discardContactEditor, startContactEntry } from '../daily/views/contact-view';
import {
  appendContactTask,
  updateContactTaskText,
  contactTaskParts,
  editContactEntry,
} from '../daily/entry-workflow';
import { recentTradeVendor } from '../daily/trade-picker';
import type { DailyDeleteUndo } from '../daily/daily-controller';
import type { TradeSection, WorkItem } from '../domain/daily';

const locked = () =>
  isReadOnlySite() || appState.dateSwitching || appState.workspaceSwitching;
const source = (rows: { id: string; name: string }[]): SearchSource => ({
  search: (query) => {
    const result: SearchableItem[] = rows
      .filter((row) => row.name.includes(query))
      .map((row) => ({ id: row.id, label: row.name }));
    if (query.trim() && !result.some((row) => row.label === query.trim()))
      result.push({ id: 'create', label: query.trim() });
    return result;
  },
  bootstrap: () => [],
});
const selected = (text: string) => (text ? { id: text, label: text } : null);
async function action(name: string, data: Record<string, string> = {}) {
  if (locked()) return;
  const command = document.createElement('button');
  Object.assign(command.dataset, { dailyAction: name, ...data });
  await handleDailyAction(command, command);
  notifyReact();
}
function change(mutator: () => void) {
  if (locked()) return;
  mutator();
  notifyReact();
}
async function save() {
  try {
    await appState.daily.flush();
  } catch (error) {
    showEntrySaveError(error);
  }
  notifyReact();
}

function WorkEditor({ trade, work }: { trade: TradeSection; work: WorkItem }) {
  const [details, setDetails] = useState(false);
  const locationQuerying = useRef(false);
  const locationPicking = useRef(false);
  const showToast = useToast();
  const edit = (mutator: () => void) =>
    change(() => appState.daily.updateTradeOutputData(trade.id, mutator));
  const locations = useMemo(
    () => source(appState.dailyLocations),
    [appState.dailyLocations],
  );
  return (
    <VStack gap={2} data-work={work.id}>
      <TextInput
        label="工項"
        isLabelHidden
        data-inline-work={work.id}
        value={work.taskTextSnapshot}
        size="lg"
        isDisabled={locked()}
        onChange={(value) =>
          edit(() => {
            work.taskTextSnapshot = value;
            work.taskId = null;
          })
        }
      />
      <HStack gap={2} hAlign="start" vAlign="center"><Button
        label="位置、樓層與備註"
        size="lg"
        variant="ghost"
        onClick={() => setDetails(!details)}
      /><Button
        label="刪除工項"
        size="lg"
        variant="ghost"
        isDisabled={locked()}
        onClick={() => {
          const restore = appState.daily.removeWorkItemForUndo(
            trade.id,
            work.id,
          );
          if (!restore) return;
          notifyReact();
          void save();
          const dismiss = showToast({
            body: '已刪除工項',
            autoHideDuration: 6000,
            endContent: (
              <Button
                label="復原"
                size="lg"
                onClick={() => {
                  if (locked()) return;
                  restore();
                  dismiss();
                  void save();
                }}
              />
            ),
          });
        }}
      /></HStack>
      {details && (
        <VStack gap={2}>
          <TextInput
            label="起始樓層"
            size="lg"
            value={work.startFloorRaw}
            onChange={(value) =>
              edit(() => {
                work.startFloorRaw = value;
                work.startFloorNormalized = normalizeFloor(value);
              })
            }
            onBlur={() => {
              const value = normalizeFloor(work.startFloorRaw);
              if (value !== null && value !== work.startFloorRaw)
                edit(() => {
                  work.startFloorRaw = value;
                });
            }}
          />
          <TextInput
            label="結束樓層"
            size="lg"
            value={work.endFloorRaw}
            onChange={(value) =>
              edit(() => {
                work.endFloorRaw = value;
                work.endFloorNormalized = normalizeFloor(value);
              })
            }
            onBlur={() => {
              const value = normalizeFloor(work.endFloorRaw);
              if (value !== null && value !== work.endFloorRaw)
                edit(() => {
                  work.endFloorRaw = value;
                });
            }}
          />
          <Typeahead
            label="位置"
            size="lg"
            searchSource={locations}
            value={locationQuerying.current ? null : selected(work.locationTextSnapshot)}
            onChangeQuery={(text) => {
              if (!text && locationPicking.current) return;
              locationQuerying.current = true;
              if (!locked())
                appState.daily.updateTradeOutputData(trade.id, () => {
                  work.locationTextSnapshot = text;
                  work.locationId = null;
                });
            }}
            onChange={(item) => {
              locationPicking.current = Boolean(item);
              queueMicrotask(() => { locationPicking.current = false; });
              locationQuerying.current = false;
              edit(() => {
                work.locationTextSnapshot = item?.label ?? '';
                applyLocationMemory(
                  work,
                  appState.dailyLocations.find((row) => row.id === item?.id),
                );
              });
            }}
          />
          <TextArea
            label="備註"
            size="lg"
            value={work.note}
            onChange={(value) =>
              edit(() => {
                work.note = value;
              })
            }
          />
          <Button
            label="完成，返回工項"
            size="lg"
            onClick={() => setDetails(false)}
          />
          <Button
            label="移除位置與備註"
            size="lg"
            onClick={() => {
              const before = snapshotDetails(work);
              const scope = workUndoScope(appState.daily.report);
              edit(() => clearWorkItemDetails(work));
              const undo = { scope, tradeId: trade.id, workId: work.id, before, cleared: snapshotDetails(work) };
              const dismiss = showToast({
                body: '已移除位置與備註',
                autoHideDuration: 6000,
                endContent: (
                  <Button
                    label="復原"
                    size="lg"
                    onClick={() => {
                      if (locked() || !canRestoreDetails(undo, appState.daily.report)) return;
                      const current = appState.daily.trade(trade.id)?.workItems.find((row) => row.id === work.id);
                      if (!current) return;
                      edit(() => {
                        for (const key of [
                          'startFloorRaw',
                          'startFloorNormalized',
                          'endFloorRaw',
                          'endFloorNormalized',
                          'locationId',
                          'locationTextSnapshot',
                          'note',
                        ] as const)
                          current[key] = before[key] as never;
                      });
                      dismiss();
                    }}
                  />
                ),
              });
            }}
          />
        </VStack>
      )}

    </VStack>
  );
}

function TradeEditor({ trade }: { trade: TradeSection }) {
  const [epoch, setEpoch] = useState(0);
  const [query, setQuery] = useState(
    () => new Map(snapshotWorkDrafts()).get(trade.id) ?? '',
  );
  const [seed, setSeed] = useState(() =>
    selected(new Map(snapshotWorkDrafts()).get(trade.id) ?? ''),
  );
  const composing = useRef(false);
  const composerInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!seed) return;
    // Resume the retained remainder through Typeahead's own token edit action.
    // No DOM value writes or replacement input: its engine keeps owning IME.
    queueMicrotask(() => {
      const input = composerInput.current;
      if (!input?.isConnected || composing.current) return;
      const previous = document.activeElement;
      input.click();
      input.setSelectionRange(input.value.length, input.value.length);
      // The first resume runs as the sheet opens: give focus back so the field being fixed keeps it.
      if (epoch === 0) {
        if (previous instanceof HTMLElement && previous !== document.body) previous.focus({ preventScroll: true });
        else input.blur();
      }
    });
  }, [epoch, seed]);
  const reorderable = createReorderable({
    onReorder: ({ key, to }) => {
      if (locked()) return;
      const from = trade.workItems.findIndex((row) => row.id === key);
      if (from < 0 || from === to) return;
      const before = structuredClone(trade.workItems);
      appState.daily.reorderWorkItems(trade.id, from, to);
      notifyReact();
      void appState.daily.flush().catch((error) => {
        trade.workItems = before;
        showEntrySaveError(error);
        notifyReact();
        alert('工項排序儲存失敗，已恢復原順序。');
      });
    },
    isReorderable: () => !locked(),
  });
  const setDraft = (value: string) => {
    setQuery(value);
    const drafts = new Map(snapshotWorkDrafts());
    drafts.set(trade.id, value);
    restoreWorkDrafts([...drafts]);
    persistEntryDraft();
  };
  const add = (value = query) => {
    if (locked()) return;
    for (const name of splitWorkInput(value, true).committed)
      appState.daily.addWorkItem(
        trade.id,
        name,
        appState.dailyTasks.find(
          (row) => row.name === name && row.tradeTypeId === trade.tradeTypeId,
        )?.id ?? null,
      );
    setDraft('');
    setSeed(null);
    setEpoch((count) => count + 1);
    notifyReact();
    void commitInputMemories(false).catch(showEntrySaveError);
  };
  const queryChanged = (value: string) => {
    const parts = splitWorkInput(value);
    if (composing.current || !parts.committed.length) {
      setDraft(value);
      return;
    }
    if (locked()) return;
    for (const name of parts.committed)
      appState.daily.addWorkItem(trade.id, name);
    setDraft(parts.remainder);
    setSeed(selected(parts.remainder));
    // Typeahead owns its query; start the next input session only after the
    // committed delimiter has been consumed (never during composition).
    setEpoch((count) => count + 1);
    notifyReact();
    void commitInputMemories(false).catch(showEntrySaveError);
  };
  const choices = useMemo<SearchSource>(
    () => ({
      search: (text) =>
        source(workSuggestions(trade, appState.dailyTasks, text)).search(text),
      bootstrap: () => [],
    }),
    [trade],
  );
  const edit = (mutator: () => void) =>
    change(() => appState.daily.updateTradeOutputData(trade.id, mutator));
  return (
    <VStack
      gap={3}
      data-trade-editor={trade.id}
      onCompositionStart={() => {
        composing.current = true;
        appState.entryComposing = true;
      }}
      onCompositionEnd={(event) => {
        composing.current = false;
        appState.entryComposing = false;
        if ((event.target as HTMLElement).closest('.daily-work-composer'))
          queryChanged((event.target as HTMLInputElement).value);
      }}
    >
      <Grid columns={3} gap={2}>
        <TextInput
          label="工種"
          size="lg"
          data-daily-field="tradeNameSnapshot"
          value={trade.tradeNameSnapshot}
          isDisabled={locked()}
          onChange={(value) =>
            edit(() => {
              trade.tradeNameSnapshot = value;
              trade.tradeTypeId =
                appState.dailyTrades.find((row) => row.name === value)?.id ??
                null;
            })
          }
        />
        <TextInput
          label="廠商"
          size="lg"
          data-daily-field="vendorNameSnapshot"
          value={trade.vendorNameSnapshot}
          isDisabled={locked()}
          onChange={(value) =>
            change(() => {
              appState.daily.changeVendor(
                trade.id,
                value,
                appState.dailyVendors.find(
                  (row) =>
                    row.name === value && row.tradeTypeId === trade.tradeTypeId,
                )?.id ?? null,
              );
              if (!value)
                appState.daily.updateTradeOutputData(trade.id, () => {
                  trade.vendorNameSnapshot = '';
                  trade.vendorId = null;
                });
            })
          }
        />
        <TextInput
          label="人數"
          size="lg"
          inputMode="decimal"
          data-daily-field="workerCount"
          value={trade.workerCount}
          isDisabled={locked()}
          onChange={(value) =>
            edit(() => {
              trade.workerCount = value;
            })
          }
        />
      </Grid>
      <Typeahead
        key={epoch}
        ref={composerInput}
        label="搜尋或輸入下一個工項"
        containerClassName="daily-work-composer"
        size="lg"
        searchSource={choices}
        value={seed}
        debounceMs={0}
        hasAutoFocus={epoch > 0}
        isDisabled={locked()}
        onChangeQuery={queryChanged}
        onChange={(item) => {
          if (item) add(item.label);
        }}
        onKeyDown={(event) => {
          // Enter without a highlighted suggestion commits the typed text
          // (pre-React behaviour); a highlighted one is picked by Typeahead.
          const input = event.target;
          if (
            !(input instanceof HTMLInputElement) ||
            event.key !== 'Enter' ||
            event.nativeEvent.isComposing ||
            event.keyCode === 229 ||
            composing.current ||
            input.getAttribute('aria-activedescendant')
          )
            return;
          event.preventDefault();
          add(input.value);
        }}
        emptySearchText="輸入工項後加入"
      />
      <Button
        label="加入工項"
        data-work-commit={trade.id}
        size="lg"
        isDisabled={!query.trim() || locked()}
        onClick={() => add()}
      />
      <List hasDividers reorderable={reorderable}>
        {trade.workItems.map((work) => (
          <ListItem
            key={work.id}
            itemKey={work.id}
            align="start"
            // Keep the native handle centered on the touch-sized input, above the action row.
            endContent={<VStack aria-hidden style={{ height: 'calc(var(--spacing-8) + var(--spacing-3))' }} />}
            label={<WorkEditor trade={trade} work={work} />}
          />
        ))}
      </List>
      {!!appState.daily.linkedMaterialEntries(trade.id).length && (
        <Text>
          已連接 {appState.daily.linkedMaterialEntries(trade.id).length} 筆進料
        </Text>
      )}
    </VStack>
  );
}

function MaterialEditor({ connection }: { connection: ReactNode }) {
  const editor = appState.materialEditor!;
  const value = editor.value;
  const querying = useRef(new Set<string>());
  const picking = useRef(new Set<string>());
  // The note stays folded until asked for, unless the entry already has one.
  const [noteOpen, setNoteOpen] = useState(Boolean(value.note));
  const fields = [
    ['materialTypeSnapshot', '材料類型'],
    ['itemName', '品名'],
    ['specification', '規格'],
    ['supplierNameSnapshot', '供應商'],
    ['quantity', '數量'],
    ['unit', '單位'],
  ] as const;
  return (
    <VStack gap={3} data-material-editor={editor.id}>
      <Grid columns={2} gap={2}>
      {fields.map(([field, label]) =>
        field === 'quantity' ? (
          <TextInput
            key={field}
            label={label}
            size="lg"
            data-material-field={field}
            value={value[field]}
            inputMode={field === 'quantity' ? 'decimal' : 'text'}
            isDisabled={locked()}
            onChange={(text) => {
              value[field] = text;
              notifyReact();
            }}
          />
        ) : (
          <Typeahead
            key={field}
            label={label}
            size="lg"
            searchSource={source(
              field === 'materialTypeSnapshot'
                ? appState.materialTypes
                : appState.materialMemory
                    .filter(
                      (row) =>
                        row.fieldType ===
                          (field === 'supplierNameSnapshot'
                            ? 'supplier'
                            : field) &&
                        (field === 'unit' || field === 'supplierNameSnapshot' || !value.materialTypeId || row.materialTypeId === value.materialTypeId),
                    )
                    .map((row) => ({ id: row.id, name: row.value })),
            )}
            value={querying.current.has(field) ? null : selected(value[field])}
            hasAutoFocus={field === 'materialTypeSnapshot' && !editor.originalId}
            isDisabled={locked()}
            onChangeQuery={(text) => {
              // The Typeahead clears its query after a pick; that is not a
              // request to erase the selected material field.
              if (!text && picking.current.has(field)) return;
              querying.current.add(field);
              value[field] = text;
              if (field === 'materialTypeSnapshot') value.materialTypeId = appState.materialTypes.find((row) => row.name.trim() === text.trim())?.id ?? null;
            }}
            onChange={(item) => {
              if (item) picking.current.add(field);
              else picking.current.delete(field);
              queueMicrotask(() => { picking.current.delete(field); });
              querying.current.delete(field);
              value[field] = item?.label ?? '';
              if (field === 'materialTypeSnapshot') {
                const type = appState.materialTypes.find((row) => row.name === value[field]);
                value.materialTypeId = type?.id ?? null;
                value.unit = type?.recentUnit ?? '';
                value.supplierNameSnapshot = type?.recentSupplierName ?? '';
              }
              if (field === 'itemName' && item && value.materialTypeId) {
                const type = appState.materialTypes.find((row) => row.id === value.materialTypeId);
                const specification = appState.materialMemory.filter((row) => row.materialTypeId === value.materialTypeId && row.fieldType === 'specification').sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))[0];
                if (!value.specification) value.specification = specification?.value ?? '';
                if (!value.unit) value.unit = type?.recentUnit ?? '';
                if (!value.supplierNameSnapshot) value.supplierNameSnapshot = type?.recentSupplierName ?? '';
              }
              notifyReact();
            }}
          />
        ),
      )}
      </Grid>
      {connection}
      {noteOpen ? (
        <TextArea
          label="進料備註"
          size="lg"
          value={value.note}
          onChange={(text) => {
            value.note = text;
            notifyReact();
          }}
          isDisabled={locked()}
        />
      ) : (
        <Button label="＋加備註" size="lg" variant="ghost" onClick={() => setNoteOpen(true)} />
      )}
      {editor.errors.map((error) => (
        <Text key={error}>{error}</Text>
      ))}
    </VStack>
  );
}

function ContactEditor() {
  const editor = appState.contactEditor!;
  const vendorQuerying = useRef(false);
  const vendorPicking = useRef(false);
  const [epoch, setEpoch] = useState(0);
  const reorderable = createReorderable({
    onReorder: ({ key, to }) => {
      if (locked()) return;
      const before = structuredClone(editor.value.items);
      const from = editor.value.items.findIndex((item) => item.id === key);
      const [item] = editor.value.items.splice(from, 1);
      editor.value.items.splice(to, 0, item);
      editor.value.items.forEach((row, index) => {
        row.sortOrder = index;
      });
      if (!persistEntryDraft()) editor.value.items = before;
      notifyReact();
    },
    isReorderable: () => !locked(),
  });
  const add = (value = editor.taskQuery) => {
    if (locked()) return;
    appendContactTask(editor, value);
    persistEntryDraft();
    setEpoch((count) => count + 1);
    notifyReact();
  };
  return (
    <VStack gap={3}>
      <Text>{editor.value.tradeNameSnapshot}</Text>
      <Typeahead
        label="聯絡廠商"
        id="contact-vendor"
        size="lg"
        searchSource={source(
          appState.dailyVendors.filter(
            (row) => row.tradeTypeId === editor.value.tradeTypeId,
          ),
        )}
        value={vendorQuerying.current ? null : selected(editor.value.vendorNameSnapshot)}
        isDisabled={locked()}
        onChangeQuery={(text) => {
          if (!text && vendorPicking.current) return;
          vendorQuerying.current = true;
          editor.value.vendorNameSnapshot = text;
          editor.vendorQuery = text;
          persistEntryDraft();
        }}
        onChange={(item) => {
          vendorPicking.current = Boolean(item);
          queueMicrotask(() => { vendorPicking.current = false; });
          vendorQuerying.current = false;
          editor.value.vendorNameSnapshot = item?.label ?? '';
          editor.value.vendorId =
            appState.dailyVendors.find((row) => row.id === item?.id)?.id ??
            null;
          persistEntryDraft();
          notifyReact();
        }}
      />
      <DateInput
        label="聯絡預定日期"
        size="lg"
        presentation="native"
        value={(editor.plannedDate || null) as never}
        isDisabled={locked()}
        onChange={(date) => {
          editor.plannedDate = date ?? '';
          editor.plannedDateChanged = true;
          persistEntryDraft();
          notifyReact();
        }}
      />
      <Typeahead
        key={epoch}
        label="聯絡工項"
        size="lg"
        searchSource={source(
          appState.dailyTasks.filter(
            (row) => row.tradeTypeId === editor.value.tradeTypeId,
          ),
        )}
        value={null}
        isDisabled={locked()}
        onChangeQuery={(text) => {
          editor.taskQuery = text;
          persistEntryDraft();
        }}
        onChange={(item) => {
          if (item) add(item.label);
        }}
      />
      <TextInput
        label="數量／規格"
        size="lg"
        value={editor.taskDetails ?? ''}
        onChange={(text) => {
          editor.taskDetails = text;
          persistEntryDraft();
          notifyReact();
        }}
        isDisabled={locked()}
      />
      <Button
        label="加入聯絡工項"
        data-daily-action="contact-add-task"
        size="lg"
        onClick={() => add()}
        isDisabled={locked()}
      />
      <List hasDividers reorderable={reorderable}>
        {editor.value.items.map((item) => (
          <ListItem
            key={item.id}
            itemKey={item.id}
            label={
              <TextInput
                label="聯絡內容"
                size="lg"
                value={
                  contactTaskParts(item.content, appState.daily.report.date)
                    .text
                }
                onChange={(text) => {
                  updateContactTaskText(
                    editor,
                    item.id,
                    text,
                    appState.daily.report.date,
                  );
                  persistEntryDraft();
                  notifyReact();
                }}
              />
            }
            endContent={
              <Button
                label="刪除此聯絡工項"
                size="lg"
                onClick={() => {
                  editor.value.items = editor.value.items.filter(
                    (row) => row.id !== item.id,
                  );
                  persistEntryDraft();
                  notifyReact();
                }}
              />
            }
          />
        ))}
      </List>
      {editor.errors.map((error) => (
        <Text key={error}>{error}</Text>
      ))}
    </VStack>
  );
}

/** Editors live in a bottom sheet so a long form never pushes the lists out of view; the actions stay pinned below it. */
function EditorSheet({ label, isOpen, onClose, footer, children }: { label: string; isOpen: boolean; onClose: () => void; footer: ReactNode; children: ReactNode }) {
  return (
    <BottomSheet label={label} isOpen={isOpen} onOpenChange={(open) => { if (!open) onClose(); }} purpose="form" height="tall" padding={0}>
      <Layout height="fill" content={<LayoutContent padding={4} label={label}>{children}</LayoutContent>}
        footer={<LayoutFooter hasDivider padding={4} label={`${label}操作`}>{footer}</LayoutFooter>} />
    </BottomSheet>
  );
}

export function DailyInputs() {
  useAppVersion();
  const [specialId, setSpecialId] = useState<string | null>(null);
  const [picker, setPicker] = useState<'trade' | 'contact' | null>(null);
  const [confirmation, setConfirmation] = useState<{
    text: string;
    run: () => void;
  } | null>(null);
  const showToast = useToast();
  const report = appState.daily.report;
  const editingTrade = report.tradeSections.find((trade) => trade.id === appState.daily.expandedId);
  const specialOpenId = appState.justAddedEntry?.kind === 'special' ? appState.justAddedEntry.id : specialId;
  const editingSpecial = report.specialItems.find((item) => item.id === specialOpenId);
  // Sheet visibility is derived from existing state; closing never marks the report dirty.
  const closeTrade = () => { if (!appState.daily.expandedId) return; appState.daily.expandedId = null; notifyReact(); };
  const closeSpecial = () => { appState.justAddedEntry = null; setSpecialId(null); notifyReact(); };
  const cancelMaterial = async () => {
    if (!appState.materialEditor || !(await discardMaterialEditor())) return;
    notifyReact();
  };
  const cancelContact = async () => {
    if (!appState.contactEditor || !(await discardContactEditor())) return;
    persistEntryDraft();
    notifyReact();
  };
  useEffect(() => onDailyAddRequest((section) => {
    if (locked()) return;
    scrollToDailySection(section);
    appState.justAddedEntry = null;
    if (section === 'trade') setPicker('trade');
    else if (section === 'contact') { if (!appState.contactEditor) setPicker('contact'); }
    else if (section === 'material') {
      if (!appState.materialEditor) { startMaterialEditor('normal'); notifyReact(); }
    } else change(() => {
      appState.daily.addSpecial();
      appState.justAddedEntry = { kind: 'special', id: appState.daily.report.specialItems.at(-1)!.id };
    });
  }), []);
  const remove = async (
    kind: 'trade' | 'material' | 'contact' | 'special',
    id: string,
  ) => {
    if (locked()) return;
    const undo: DailyDeleteUndo | undefined =
      kind === 'trade'
        ? appState.daily.deleteTradeForUndo(id)
        : kind === 'material'
          ? appState.daily.deleteMaterialForUndo(id)
          : kind === 'contact'
            ? appState.daily.deleteContactForUndo(id)
            : appState.daily.deleteSpecialForUndo(id);
    if (!undo) return;
    notifyReact();
    try {
      await appState.daily.flush();
    } catch (error) {
      appState.daily.restoreDeletedItem(undo);
      showEntrySaveError(error);
      notifyReact();
      return;
    }
    const dismiss = showToast({
      body: '已刪除，6 秒內可復原',
      autoHideDuration: 6000,
      endContent: (
        <Button
          label="復原"
          size="lg"
          onClick={() => {
            if (locked()) return;
            appState.daily.restoreDeletedItem(undo);
            dismiss();
            void save();
          }}
        />
      ),
    });
  };
  const swipe = (kind: 'trade' | 'material' | 'contact' | 'special') =>
    createSwipe({
      trailing: [
        {
          id: 'delete',
          label: '刪除',
          variant: 'destructive',
          onActivate: ({ itemKey }) => {
            void remove(kind, String(itemKey));
          },
        },
      ],
    });
  const reorder = (kind: 'trade' | 'material' | 'contact' | 'special') =>
    createReorderable({
      isReorderable: () => !locked(),
      onReorder: ({ key, to }) => {
        if (locked()) return;
        const list =
          kind === 'trade'
            ? report.tradeSections
            : kind === 'material'
              ? report.standaloneMaterialEntries
              : kind === 'contact'
                ? report.contacts
                : report.specialItems;
        const from = list.findIndex((item) => item.id === key);
        if (from < 0 || from === to) return;
        const before = structuredClone(list);
        if (kind === 'trade') appState.daily.reorderTrades(from, to);
        else
          appState.daily.update(() => {
            const [item] = list.splice(from, 1);
            list.splice(to, 0, item as never);
            list.forEach((row, index) => {
              row.sortOrder = index;
            });
          });
        notifyReact();
        void appState.daily.flush().catch((error) => {
          list.splice(0, list.length, ...(before as never[]));
          showEntrySaveError(error);
          notifyReact();
        });
      },
    });
  const materialConnection = (entry: NonNullable<typeof appState.materialEditor>['value']) => (<Selector
                    label="連接工種"
                    size="lg"
                    value={entry.connectedTradeSectionId ?? ''}
                    options={[
                      { value: '', label: '不連接' },
                      ...report.tradeSections.map((trade) => ({
                        value: trade.id,
                        label: `${trade.tradeNameSnapshot}｜${trade.vendorNameSnapshot}`,
                      })),
                    ]}
                    isDisabled={locked()}
                    onChange={(value) => {
                      const run = () => {
                        if (locked()) return;
                        if (value)
                          appState.daily.connectMaterial(value, entry.id);
                        else appState.daily.disconnectMaterial(entry.id);
                        const connected = appState.daily.materialEntry(entry.id);
                        if (connected) {
                          entry.entryType = connected.entryType;
                          entry.connectedTradeSectionId = connected.connectedTradeSectionId;
                        }
                        notifyReact();
                        void save();
                      };
                      if (
                        entry.connectedTradeSectionId &&
                        value &&
                        value !== entry.connectedTradeSectionId
                      )
                        setConfirmation({
                          text: `改接「${entry.itemName || entry.materialTypeSnapshot}」？\n\n${appState.daily.trade(entry.connectedTradeSectionId)?.tradeNameSnapshot ?? '原工種'} → ${appState.daily.trade(value)?.tradeNameSnapshot ?? '新工種'}\n\n兩個工種都會退回草稿。`,
                          run,
                        });
                      else run();
                    }}
                  />);
  return (
    <VStack
      gap={6}
      padding={4}
      onClick={(event) => event.stopPropagation()}
      onInput={(event) => event.stopPropagation()}
      onChange={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {appState.entrySaveError && (
        <Text role="alert">{appState.entrySaveError}</Text>
      )}
      <VStack gap={3} as="section" className="daily-section" aria-label="施工紀錄" data-daily-section="trade">
        <Heading level={2}>施工紀錄</Heading>
        <List hasDividers reorderable={reorder('trade')}>
          {report.tradeSections.map((trade) => {
            const works = trade.workItems.filter((work) => work.taskTextSnapshot.trim());
            return <ListItem key={trade.id} itemKey={trade.id} data-trade={trade.id}
              data-daily-action="toggle-trade" swipe={swipe('trade')} isDisabled={locked()} align="start"
              onClick={() => { appState.daily.expandedId = trade.id; notifyReact(); }}
              label={`${trade.tradeNameSnapshot}｜${trade.vendorNameSnapshot || '待填廠商'}`}
              description={`${trade.status === 'complete' ? '資料齊全' : '未完成'} · ${trade.workerCount ? `${trade.workerCount} 人` : '人數未填'} · ${works[0]?.taskTextSnapshot || '尚未填工項'}${works.length > 1 ? `・另 ${works.length - 1} 項` : ''}`} />;
          })}
        </List>
      </VStack>
      <VStack gap={3} as="section" className="daily-section" aria-label="進料" data-daily-section="material">
        <Heading level={2}>進料</Heading>
        <List hasDividers reorderable={reorder('material')}>
          {report.standaloneMaterialEntries.map((entry) => {
            const trade = entry.connectedTradeSectionId ? appState.daily.trade(entry.connectedTradeSectionId) : null;
            return <ListItem key={entry.id} itemKey={entry.id} data-material={entry.id} swipe={swipe('material')}
              label={`${entry.materialTypeSnapshot} ${entry.itemName} ${entry.quantity} ${entry.unit} ${entry.supplierNameSnapshot}`}
              description={trade ? `已連接：${trade.tradeNameSnapshot}｜${trade.vendorNameSnapshot}` : '未連接'}
              isDisabled={locked()} align="start" onClick={() => { startMaterialEditor(entry.entryType ?? 'normal', entry); notifyReact(); }} />;
          })}
        </List>
      </VStack>
      <VStack gap={3} as="section" className="daily-section" aria-label="聯絡事項" data-daily-section="contact">
        <Heading level={2}>聯絡事項</Heading>
        <List hasDividers reorderable={reorder('contact')}>
          {report.contacts.map((contact) => <ListItem key={contact.id} itemKey={contact.id} data-contact-card={contact.id}
            swipe={swipe('contact')} label={`${contact.tradeNameSnapshot}｜${contact.vendorNameSnapshot}`}
            description={contact.items.map((item) => item.content).join('；')} align="start" isDisabled={locked()}
            onClick={() => {
              const run = () => { appState.contactEditor = editContactEntry(contact, report.date); persistEntryDraft(); notifyReact(); };
              if (appState.contactEditor) setConfirmation({ text: '目前聯絡事項尚未儲存，是否放棄這次修改？', run }); else run();
            }} />)}
        </List>
      </VStack>
      <VStack gap={3} as="section" className="daily-section" aria-label="特殊事項" data-daily-section="special">
        <Heading level={2}>特殊事項</Heading>
        <List hasDividers reorderable={reorder('special')}>
          {report.specialItems.map((item) => (
            <ListItem key={item.id} itemKey={item.id} data-special={item.id} swipe={swipe('special')} isDisabled={locked()}
              label={item.content.trim() || '（尚未填寫）'} onClick={() => setSpecialId(item.id)} />
          ))}
        </List>
      </VStack>
      <EditorSheet label="施工紀錄" isOpen={Boolean(editingTrade)} onClose={closeTrade}
        footer={editingTrade && <Grid columns={2} gap={2}>
          <Button label="完成施工紀錄" data-daily-action="finish-entry" variant="primary" size="lg" isDisabled={locked()}
            clickAction={() => action('finish-entry', { id: editingTrade.id })} />
          <Button label="關閉" size="lg" onClick={closeTrade} />
        </Grid>}>
        {editingTrade && <VStack gap={4}>
          <TradeEditor key={editingTrade.id} trade={editingTrade} />
          <Button label="刪除施工紀錄" size="lg" variant="destructive" isDisabled={locked()} onClick={() => { void remove('trade', editingTrade.id); }} />
        </VStack>}
      </EditorSheet>
      <EditorSheet label="進料" isOpen={Boolean(appState.materialEditor)} onClose={cancelMaterial}
        footer={<Grid columns={2} gap={2}>
          <Button label="儲存進料" data-daily-action="save-material" variant="primary" size="lg" isDisabled={locked()}
            clickAction={() => action('save-material')} />
          <Button label="取消進料輸入" size="lg" clickAction={cancelMaterial} />
        </Grid>}>
        {appState.materialEditor && <VStack gap={4}>
          <MaterialEditor key={appState.materialEditor.id} connection={appState.materialEditor.originalId ? materialConnection(appState.materialEditor.value) : null} />
          {appState.materialEditor.originalId && <Button label="刪除進料" size="lg" variant="destructive" isDisabled={locked()} onClick={() => {
            const id = appState.materialEditor?.originalId;
            if (id) { appState.materialEditor = null; void remove('material', id); }
          }} />}
        </VStack>}
      </EditorSheet>
      <EditorSheet label="聯絡事項" isOpen={Boolean(appState.contactEditor)} onClose={cancelContact}
        footer={<Grid columns={2} gap={2}>
          <Button label="完成聯絡事項" data-daily-action="save-contact" variant="primary" size="lg" isDisabled={locked()}
            clickAction={() => action('save-contact')} />
          <Button label="取消聯絡輸入" size="lg" clickAction={cancelContact} />
        </Grid>}>
        {appState.contactEditor && <VStack gap={4}>
          <ContactEditor key={appState.contactEditor.id} />
          {appState.contactEditor.originalId && <Button label="刪除聯絡事項" size="lg" variant="destructive" isDisabled={locked()} onClick={() => {
            const id = appState.contactEditor?.originalId;
            if (id) { appState.contactEditor = null; persistEntryDraft(); void remove('contact', id); }
          }} />}
        </VStack>}
      </EditorSheet>
      <EditorSheet label="特殊事項" isOpen={Boolean(editingSpecial)} onClose={closeSpecial}
        footer={editingSpecial && <Grid columns={2} gap={2}>
          <Button label="完成特殊事項" data-daily-action="toggle-special" variant="primary" size="lg" onClick={closeSpecial} />
          {appState.justAddedEntry?.kind === 'special' && appState.justAddedEntry.id === editingSpecial.id
            ? <Button label="取消新增" data-daily-action="cancel-new-entry" size="lg" onClick={() => {
              appState.justAddedEntry = null;
              void remove('special', editingSpecial.id);
            }} />
            : <Button label="關閉" size="lg" onClick={closeSpecial} />}
        </Grid>}>
        {editingSpecial && <VStack gap={4} data-special-editor={editingSpecial.id}>
          <TextArea
            label="特殊事項內容"
            size="lg"
            hasAutoFocus
            value={editingSpecial.content}
            onChange={(text) => change(() => appState.daily.update(() => { editingSpecial.content = text; }))}
            isDisabled={locked()}
          />
          <Button label="刪除特殊事項" size="lg" variant="destructive" isDisabled={locked()} onClick={() => {
            appState.justAddedEntry = null;
            void remove('special', editingSpecial.id);
          }} />
        </VStack>}
      </EditorSheet>
      <Dialog
        isOpen={picker !== null}
        onOpenChange={(open) => {
          if (!open) setPicker(null);
        }}
        padding={4}
      >
        <VStack gap={3}>
          <Heading level={2}>選擇工種</Heading>
          <Typeahead
            label="選擇工種"
            size="lg"
            searchSource={source(appState.dailyTrades)}
            value={null}
            isDisabled={locked()}
            onChange={(item) => {
              if (!item || locked()) return;
              const memory = appState.dailyTrades.find(
                (row) => row.id === item.id,
              );
              const vendor = memory
                ? recentTradeVendor(appState.dailyVendors, memory.id)
                : undefined;
              let next = '#contact-vendor';
              if (picker === 'contact')
                startContactEntry(
                  item.label,
                  vendor?.name ?? '',
                  memory?.id ?? null,
                  vendor?.id ?? null,
                );
              else {
                const created = appState.daily.addTradeEntry(
                  item.label,
                  memory?.id ?? null,
                  vendor,
                );
                next = `[data-trade-editor="${CSS.escape(created.id)}"] [data-daily-field="${created.vendorNameSnapshot ? 'workerCount' : 'vendorNameSnapshot'}"]`;
                void save();
              }
              setPicker(null);
              notifyReact();
              // Pre-React flow: jump to the next field after the Dialog
              // has returned focus to its trigger.
              setTimeout(() => scrollAndFocus(next), 0);
            }}
          />
          <Button
            label="取消選擇工種"
            size="lg"
            onClick={() => setPicker(null)}
          />
        </VStack>
      </Dialog>
      {confirmation && (
        <AlertDialog
          isOpen={true}
          onOpenChange={(open) => {
            if (!open) setConfirmation(null);
          }}
          title="確認操作"
          description={confirmation?.text ?? ''}
          actionLabel="確認"
          cancelLabel="取消"
          onAction={() => {
            confirmation?.run();
            setConfirmation(null);
          }}
        />
      )}
    </VStack>
  );
}

export function mountDailyInputs() {
  mountContent(<DailyInputs />);
}
export function unmountDailyInputs() {
  unmountContent();
}
