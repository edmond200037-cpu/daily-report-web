import { useRef, type ReactNode } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { List, ListItem } from '@astryxdesign/core/List';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { appState, tradeDrag, type EntryDragKind } from '../../app/state';

// ListItem has no expanded-control prop. Its documented interactiveRef pattern
// gives the whole row one accessible toggle, while retaining aria-expanded and
// the gesture adapter's existing toggle hook on the actual button.
export function EntrySummary({
  id,
  label,
  detail,
  status,
  expanded,
  onToggle,
  actions,
}: {
  id: string;
  label: string;
  detail?: ReactNode;
  status: string;
  expanded: boolean;
  onToggle(): void;
  actions?: ReactNode;
}) {
  const toggle = useRef<HTMLButtonElement>(null);
  return (
    <VStack className="trade-row-summary" gap={0}>
      <List edge="flush">
        <ListItem
          itemKey={id}
          interactiveRef={toggle}
          align="center"
          label={
            <Button
              ref={toggle}
              label={label}
              variant="ghost"
              width="100%"
              className="trade-row-summary__toggle"
              aria-expanded={expanded}
              style={{
                justifyContent: 'flex-start',
                textAlign: 'start',
                paddingInline: 0,
              }}
              onClick={() => {
                if (!appState.suppressTradeSummaryClick) onToggle();
              }}
            />
          }
          description={detail}
          endContent={
            <HStack gap={2} vAlign="center">
              <HStack
                gap={0}
                paddingInlineStart={status === '未完成' ? 1 : 0}
                style={
                  status === '未完成'
                    ? {
                        borderInlineStart: 'var(--border-width) solid var(--color-warning)',
                      }
                    : undefined
                }
              >
                <Text textWrap="nowrap">{status}</Text>
              </HStack>
              {actions}
            </HStack>
          }
        />
      </List>
    </VStack>
  );
}

export function EntryDropMarker({
  kind,
  id,
  end = false,
}: {
  kind: EntryDragKind;
  id: string;
  end?: boolean;
}) {
  if (!tradeDrag.active || tradeDrag.kind !== kind) return null;
  const collection = {
    trade: 'tradeSections',
    material: 'standaloneMaterialEntries',
    contact: 'contacts',
    special: 'specialItems',
  } as const;
  const rest = appState.daily.report[collection[kind]].filter((row) => row.id !== tradeDrag.id);
  const index = rest.findIndex((row) => row.id === id);
  const show = end
    ? index === rest.length - 1 && tradeDrag.activeDropSlotIndex === rest.length
    : index >= 0 && index === tradeDrag.activeDropSlotIndex;
  return show ? (
    <VStack
      aria-hidden
      height="var(--spacing-1)"
      style={{ background: 'var(--color-border-emphasized)' }}
    />
  ) : null;
}

// These data attributes are the existing gesture adapter's public UI contract.
// React owns the row; drag previews and position remain transient DOM only.
export function EntryRow({
  kind,
  id,
  label,
  detail,
  status,
  expanded = false,
  draft = false,
  onToggle,
  children,
}: {
  kind: EntryDragKind;
  id: string;
  label: string;
  detail?: string;
  status: string;
  expanded?: boolean;
  draft?: boolean;
  onToggle(): void;
  children?: ReactNode;
}) {
  const dragging = tradeDrag.active && tradeDrag.id === id && tradeDrag.kind === kind;
  return (
    <VStack
      gap={0}
      data-swipe-item="true"
      data-swipe-kind={kind}
      data-swipe-id={id}
      data-swipe-draft={draft ? kind : undefined}
      style={{ overflow: 'hidden' }}
    >
      <EntryDropMarker kind={kind} id={id} />
      <VStack
        gap={3}
        paddingBlock={3}
        data-sortable-entry={draft ? undefined : kind}
        data-material={kind === 'material' ? id : undefined}
        data-entry-id={id}
        aria-hidden={dragging || undefined}
        style={{
          background: 'var(--color-background-body)',
          visibility: dragging ? 'hidden' : undefined,
          transform: 'translateX(var(--trade-swipe-offset, 0))',
          borderBottom: 'var(--border-width) solid var(--color-border)',
        }}
      >
        <EntrySummary
          id={id}
          label={label}
          detail={detail}
          status={status}
          expanded={expanded}
          onToggle={onToggle}
        />
        {children}
      </VStack>
      <EntryDropMarker kind={kind} id={id} end />
    </VStack>
  );
}
