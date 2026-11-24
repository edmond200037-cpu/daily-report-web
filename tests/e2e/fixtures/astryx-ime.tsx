import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Theme } from '@astryxdesign/core/theme';
import { Typeahead, type SearchableItem, type SearchSource } from '@astryxdesign/core/Typeahead';
import { Text } from '@astryxdesign/core/Text';
import { themes, defaultThemeSlug } from '../../../src/astryx-themes';
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';

// Match the documented TypeaheadShowcase source contract without an input wrapper.
const items: SearchableItem[] = [{ id: 'rebar', label: '鋼筋綁紮' }];
const source: SearchSource = {
  search: (query) => items.filter((item) => item.label.includes(query)),
  bootstrap: () => items,
};

function Fixture() {
  const [value, setValue] = useState<SearchableItem | null>(null);
  const [query, setQuery] = useState('');
  return <Theme theme={themes[defaultThemeSlug]}>
    <Typeahead label="工項輸入器" searchSource={source} value={value}
      onChange={setValue} onChangeQuery={setQuery} debounceMs={0} emptySearchText="沒有建議" />
    <Text id="selection">{value?.label ?? '尚未加入'}</Text>
    <Text id="query">{query}</Text>
  </Theme>;
}

createRoot(document.querySelector('#fixture')!).render(<Fixture />);
