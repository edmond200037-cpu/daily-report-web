import { Button } from '@astryxdesign/core/Button';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { useState } from 'react';
import { appState } from '../../app/state';
import {
  materialChoices,
  startMaterialEditor,
  syncMaterialEditor,
} from '../views/material-view';
import { dailyLocked, dailyAction } from './actions';
import { dailyUi } from './runtime';
import { Action, Field, Notes } from './controls';
import { EntryRow } from './EntryRow';

export function materialPresets() {
  return appState.materialTypes
    .filter((type) => type.status === 'confirmed')
    .slice()
    .sort(
      (a, b) =>
        (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? '') || b.usageCount - a.usageCount,
    )
    .map((type) => {
      const recent = (field: string) =>
        appState.materialMemory
          .filter(
            (row) =>
              row.status === 'confirmed' &&
              row.materialTypeId === type.id &&
              row.fieldType === field,
          )
          .sort(
            (a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt) || b.usageCount - a.usageCount,
          )[0]?.value ?? '';
      return {
        id: type.id,
        materialTypeSnapshot: type.name,
        itemName: recent('itemName'),
        specification: recent('specification'),
        unit: recent('unit') || type.recentUnit,
        supplierNameSnapshot: recent('supplier') || type.recentSupplierName,
      };
    })
    .slice(0, 6);
}

export function MaterialRows() {
  const [quickEditorId, setQuickEditorId] = useState('');
  const [editingDetails, setEditingDetails] = useState(false);
  const editor = appState.materialEditor;
  const presets = materialPresets();
  return (
    <VStack as="section" aria-label="進料" data-daily-section="material" gap={3}>
      <Text weight="bold">進料</Text>
      <HStack gap={2} wrap="wrap" aria-label="常用進料">
        {presets.map((preset) => (
          <Button
            key={preset.id}
            label={[preset.itemName || preset.materialTypeSnapshot, preset.specification]
              .filter(Boolean)
              .join(' ')}
            data-material-chip={preset.id}
            isDisabled={dailyLocked()}
            onClick={() => {
              if (dailyLocked() || appState.materialEditor) return;
              startMaterialEditor('normal');
              Object.assign(appState.materialEditor!.value, preset, {
                id: appState.materialEditor!.id,
                materialTypeId: preset.id,
              });
              setQuickEditorId(appState.materialEditor!.id);
              setEditingDetails(false);
              dailyUi.refresh();
            }}
          />
        ))}
        <Action label="＋進料" action="add-normal-material" isDisabled={dailyLocked()} />
      </HStack>
      {editor && (
        <VStack
          gap={3}
          data-material-editor={editor.id}
          data-swipe-item="true"
          data-swipe-kind="material"
          data-swipe-id={editor.id}
          data-swipe-draft={editor.originalId ? undefined : 'material'}
        >
          <Text>
            {editor.value.itemName || editor.value.materialTypeSnapshot}{' '}
            {editor.value.specification} · {editor.value.supplierNameSnapshot}
          </Text>
          <HStack gap={2} vAlign="end">
            <Field
              label={editor.value.unit ? `數量（${editor.value.unit}）` : '數量'}
              value={editor.value.quantity}
              inputMode="decimal"
              width="100%"
              onChange={(value) => {
                if (dailyLocked()) return;
                editor.value.quantity = value;
                dailyUi.refresh();
              }}
            />
          </HStack>
          <Button
            label={editingDetails ? '收合材料資料' : '編輯材料資料'}
            onClick={() => setEditingDetails(!editingDetails)}
          />
          {(quickEditorId !== editor.id || editingDetails) && (
            <VStack gap={3}>
              {(
                [
                  'materialTypeSnapshot',
                  'itemName',
                  'specification',
                  'supplierNameSnapshot',
                  'unit',
                ] as const
              ).map((field) => (
                <VStack key={field} gap={1}>
                  <Field
                    label={
                      {
                        materialTypeSnapshot: '材料類型',
                        itemName: '品名',
                        specification: '規格（選填）',
                        supplierNameSnapshot: '供應商',
                        unit: '單位',
                      }[field]
                    }
                    value={editor.value[field]}
                    onChange={(value) => {
                      if (dailyLocked()) return;
                      editor.value[field] = value;
                      if (field === 'materialTypeSnapshot')
                        editor.value.materialTypeId =
                          appState.materialTypes.find((type) => type.name === value)?.id ??
                          null;
                      dailyUi.refresh();
                    }}
                  />
                  <HStack gap={2} wrap="wrap">
                    {materialChoices(field, editor.value[field])
                      .filter((value) =>
                        field === 'materialTypeSnapshot'
                          ? appState.materialTypes.some(
                              (type) => type.name === value && type.status === 'confirmed',
                            )
                          : appState.materialMemory.some(
                              (memory) =>
                                memory.value === value &&
                                memory.status === 'confirmed' &&
                                memory.fieldType ===
                                  (
                                    {
                                      itemName: 'itemName',
                                      specification: 'specification',
                                      supplierNameSnapshot: 'supplier',
                                      unit: 'unit',
                                    } as const
                                  )[field] &&
                                (field === 'unit' ||
                                  field === 'supplierNameSnapshot' ||
                                  !editor.value.materialTypeId ||
                                  memory.materialTypeId === editor.value.materialTypeId),
                            ),
                      )
                      .map((value) => (
                        <Button
                          key={value}
                          label={value}
                          isDisabled={dailyLocked()}
                          onClick={() => {
                            editor.value[field] = value;
                            if (field === 'materialTypeSnapshot')
                              editor.value.materialTypeId =
                                appState.materialTypes.find((type) => type.name === value)
                                  ?.id ?? null;
                            dailyUi.refresh();
                          }}
                        />
                      ))}
                  </HStack>
                </VStack>
              ))}
              <Notes
                label="進料備註（選填）"
                value={editor.value.note}
                onChange={(value) => {
                  editor.value.note = value;
                  dailyUi.refresh();
                }}
              />
            </VStack>
          )}
          {editor.errors.map((error) => (
            <Text key={error} role="alert">
              {error.slice(error.indexOf(':') + 1)}
            </Text>
          ))}
          <HStack gap={2}>
            <Action label="儲存進料" action="save-material" isDisabled={dailyLocked()} />
            <Action label="取消輸入" action="cancel-material" />
          </HStack>
        </VStack>
      )}
      <VStack gap={0}>
        {appState.daily.report.standaloneMaterialEntries.map((entry) => (
          <EntryRow
            key={entry.id}
            kind="material"
            id={entry.id}
            label={`${entry.itemName || entry.materialTypeSnapshot} ${entry.specification}`}
            detail={entry.supplierNameSnapshot}
            status={
              entry.entryType === 'independent'
                ? entry.connectedTradeSectionId
                  ? '已連接'
                  : '未連接'
                : '普通進料'
            }
            onToggle={() => {
              void dailyAction('edit-material', { materialId: entry.id });
            }}
          >
            <VStack gap={2}>
              <HStack gap={2} vAlign="end">
                <Field
                  label={`${entry.itemName || '進料'}數量${entry.unit ? `（${entry.unit}）` : ''}`}
                  inputMode="decimal"
                  value={entry.quantity}
                  width="100%"
                  onChange={(value) => {
                    if (dailyLocked()) return;
                    appState.daily.update(() => {
                      entry.quantity = value;
                    });
                    dailyUi.refresh();
                  }}
                />
                <Action
                  label="編輯進料"
                  action="edit-material"
                  data={{ materialId: entry.id }}
                />
              </HStack>

              <Selector
                label="連接施工工種"
                value={entry.connectedTradeSectionId ?? ''}
                isDisabled={dailyLocked()}
                presentation="adaptive"
                options={[
                  { value: '', label: '普通進料（不連接）' },
                  ...appState.daily.report.tradeSections.map((trade) => ({
                    value: trade.id,
                    label: `${trade.tradeNameSnapshot} · ${trade.vendorNameSnapshot}`,
                  })),
                ]}
                onChange={(id) => {
                  if (dailyLocked()) return;
                  if (id) {
                    appState.daily.connectMaterial(id, entry.id);
                    syncMaterialEditor(entry.id);
                    dailyUi.refresh();
                  } else
                    void dailyAction('disconnect-material', {
                      materialId: entry.id,
                    });
                }}
              />
              <Action
                label="刪除進料"
                action="delete-material"
                data={{ materialId: entry.id }}
                isDisabled={dailyLocked()}
              />
            </VStack>
          </EntryRow>
        ))}
      </VStack>
    </VStack>
  );
}
