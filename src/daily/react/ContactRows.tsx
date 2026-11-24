import { Button } from '@astryxdesign/core/Button';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import { Text } from '@astryxdesign/core/Text';
import { DateInput } from '@astryxdesign/core/DateInput';
import { appState } from '../../app/state';
import { appendContactTask, contactTaskParts, updateContactTaskText } from '../entry-workflow';
import { dailyLocked, dailyAction } from './actions';
import { dailyUi } from './runtime';
import { Action, Field } from './controls';
import { EntryRow } from './EntryRow';
import { normalizeName } from '../../format/normalization';

export function ContactRows() {
  const editor = appState.contactEditor;
  const add = (text: string) => {
    if (!editor || dailyLocked() || appState.entryComposing) return;
    editor.taskQuery = text;
    appendContactTask(editor);
    dailyUi.refresh();
  };
  return (
    <VStack as="section" aria-label="聯絡事項" data-daily-section="contact" gap={3}>
      <Text weight="bold">聯絡事項</Text>
      <VStack gap={0}>
        {appState.daily.report.contacts.map((contact) => (
          <EntryRow
            key={contact.id}
            kind="contact"
            id={contact.id}
            label={`${contact.tradeNameSnapshot} · ${contact.vendorNameSnapshot}`}
            detail={contact.items.map((item) => item.content).join('、')}
            status="資料齊全"
            expanded={editor?.id === contact.id && !appState.contactEditorCollapsed}
            onToggle={() => {
              void dailyAction('toggle-contact', { contactId: contact.id });
            }}
          />
        ))}
      </VStack>
      {editor && !appState.contactEditorCollapsed && (
        <VStack
          gap={3}
          data-contact-card={editor.id}
          data-swipe-item="true"
          data-swipe-kind="contact"
          data-swipe-id={editor.id}
          data-swipe-draft={editor.originalId ? undefined : 'contact'}
        >
          <Field
            label="聯絡工種"
            value={editor.value.tradeNameSnapshot}
            onChange={(value) => {
              editor.value.tradeNameSnapshot = value;
              editor.tradeQuery = value;
              editor.value.tradeTypeId =
                appState.dailyTrades.find((row) => row.normalizedName === normalizeName(value))
                  ?.id ?? null;
              editor.value.vendorId =
                appState.dailyVendors.find(
                  (row) =>
                    row.tradeTypeId === editor.value.tradeTypeId &&
                    row.normalizedName === normalizeName(editor.value.vendorNameSnapshot),
                )?.id ?? null;
              dailyUi.refresh();
            }}
          />
          <Field
            label="聯絡廠商"
            value={editor.value.vendorNameSnapshot}
            onChange={(value) => {
              editor.value.vendorNameSnapshot = value;
              editor.vendorQuery = value;
              editor.value.vendorId =
                appState.dailyVendors.find(
                  (row) =>
                    row.tradeTypeId === editor.value.tradeTypeId &&
                    row.normalizedName === normalizeName(value),
                )?.id ?? null;
              dailyUi.refresh();
            }}
          />
          <HStack gap={2} wrap="wrap">
            {appState.dailyVendors
              .filter(
                (row) => row.status === 'confirmed' && row.tradeTypeId === editor.value.tradeTypeId,
              )
              .map((row) => (
                <Button
                  key={row.id}
                  label={row.name}
                  isDisabled={dailyLocked()}
                  onClick={() => {
                    editor.value.vendorNameSnapshot = row.name;
                    editor.value.vendorId = row.id;
                    dailyUi.refresh();
                  }}
                />
              ))}
          </HStack>
          <DateInput
            label="預定日期（選填）"
            value={
              (editor.plannedDate as `${number}${number}${number}${number}-${number}${number}-${number}${number}`) ||
              undefined
            }
            presentation="native"
            isDisabled={dailyLocked()}
            onChange={(value) => {
              editor.plannedDate = value ?? '';
              editor.plannedDateChanged = true;
              dailyUi.refresh();
            }}
          />
          {appState.lastContactDate && (
            <Action
              label={`沿用上筆 ${appState.lastContactDate.slice(5).replace('-', '/')}`}
              action="contact-reuse-date"
              isDisabled={dailyLocked()}
            />
          )}
          <Field
            label="聯絡施工項目"
            value={editor.taskQuery}
            onChange={(value) => {
              editor.taskQuery = value;
              dailyUi.refresh();
            }}
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.nativeEvent.isComposing &&
                event.keyCode !== 229 &&
                !appState.entryComposing
              ) {
                event.preventDefault();
                add(editor.taskQuery);
              }
            }}
          />
          <Field
            label="數量／規格（選填）"
            value={editor.taskDetails ?? ''}
            onChange={(value) => {
              editor.taskDetails = value;
            }}
          />
          <HStack gap={2} wrap="wrap">
            <Button
              label="加入聯絡工項"
              isDisabled={dailyLocked()}
              onClick={() => add(editor.taskQuery)}
            />
            {appState.dailyTasks
              .filter(
                (row) => row.status === 'confirmed' && row.tradeTypeId === editor.value.tradeTypeId,
              )
              .slice(0, 6)
              .map((row) => (
                <Button
                  key={row.id}
                  label={row.name}
                  isDisabled={dailyLocked()}
                  onClick={() => add(row.name)}
                />
              ))}
          </HStack>
          <VStack gap={2}>
            {editor.value.items.map((item, index) => (
              <HStack
                key={item.id}
                className="contact-work-item"
                data-contact-task={item.id}
                gap={2}
              >
                <Button
                  label={`聯絡工項 ${index + 1} 長按排序`}
                  data-contact-gesture
                  isDisabled={dailyLocked()}
                />
                <Field
                  label={`聯絡工項 ${index + 1}`}
                  value={contactTaskParts(item.content, appState.daily.report.date).text}
                  onChange={(value) => {
                    updateContactTaskText(editor, item.id, value, appState.daily.report.date);
                    dailyUi.refresh();
                  }}
                  width="100%"
                />
                <Button label="刪除工項" data-work-delete isDisabled={dailyLocked()} />
              </HStack>
            ))}
          </VStack>
          {editor.errors.map((error) => (
            <Text role="alert" key={error}>
              {error}
            </Text>
          ))}
          <HStack gap={2} wrap="wrap">
            <Action label="完成聯絡" action="save-contact" isDisabled={dailyLocked()} />
            <Action label="完成並新增" action="save-contact-next" isDisabled={dailyLocked()} />
            <Action label={editor.originalId ? '放棄修改' : '取消新增'} action="cancel-contact" />
          </HStack>
        </VStack>
      )}
    </VStack>
  );
}
