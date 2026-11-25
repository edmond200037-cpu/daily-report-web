import { useId, useState } from 'react';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { List, ListItem } from '@astryxdesign/core/List';
import type { SearchSource, SearchableItem } from '@astryxdesign/core/Typeahead';

const MAX_ROWS = 5;

/**
 * A plain text field whose value is the text itself (no Token), with a suggestion
 * list below while focused. Picking a row calls `onPick`; typing only calls `onChange`.
 */
export function SuggestInput({ label, value, onChange, onPick, searchSource, isDisabled, hasAutoFocus, id }: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  onPick: (item: SearchableItem) => void;
  searchSource: SearchSource;
  isDisabled?: boolean;
  hasAutoFocus?: boolean;
  id?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  // Sources used here are synchronous lookups over in-memory master data.
  const rows = open && value.trim() ? (searchSource.search(value) as SearchableItem[]).slice(0, MAX_ROWS) : [];
  const optionId = (index: number) => `${listId}-${index}`;
  const pick = (item: SearchableItem) => {
    setOpen(false);
    setActive(-1);
    onPick(item);
  };
  return (
    <VStack gap={1}>
      <TextInput
        label={label}
        size="lg"
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={rows.length > 0}
        aria-controls={listId}
        aria-activedescendant={rows.length > 0 && active >= 0 ? optionId(active) : undefined}
        autoComplete="off"
        value={value}
        hasAutoFocus={hasAutoFocus}
        isDisabled={isDisabled}
        onChange={(text) => { setOpen(true); setActive(-1); onChange(text); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          // Composition keys (Enter confirming a candidate, keyCode 229) must reach the IME untouched.
          if (event.nativeEvent.isComposing || event.keyCode === 229) return;
          if (event.key === 'Escape' && rows.length) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
          } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && rows.length) {
            event.preventDefault();
            const step = event.key === 'ArrowDown' ? 1 : -1;
            setActive((active + step + rows.length) % rows.length);
          } else if (event.key === 'Enter' && rows.length && active >= 0) {
            event.preventDefault();
            pick(rows[active]);
          }
        }}
      />
      {rows.length > 0 && (
        // Keep focus in the field while a row is pressed so blur does not close the list first.
        // shortcut: List always renders role="list" inside this listbox; upgrade when Astryx offers a listbox.
        <VStack id={listId} role="listbox" aria-label={`${label}建議`} onPointerDown={(event) => event.preventDefault()}>
          <List hasDividers>
            {rows.map((row, index) => (
              <ListItem
                key={row.id}
                id={optionId(index)}
                role="option"
                aria-selected={index === active}
                isSelected={index === active}
                label={row.label}
                onClick={() => pick(row)}
              />
            ))}
          </List>
        </VStack>
      )}
    </VStack>
  );
}
