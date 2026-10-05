import type { NamedMemory } from '../data/daily-repository';
import { normalizeName } from '../format/normalization';

const recentFirst = (a: NamedMemory, b: NamedMemory): number =>
  (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? '') || b.usageCount - a.usageCount || a.id.localeCompare(b.id);

/** Collapse memory choices only; construction entries retain their own IDs. */
export function tradePickerChoices(trades: NamedMemory[], query: string): NamedMemory[] {
  const keyword = normalizeName(query);
  const choices = new Map<string, NamedMemory>();
  const ranked = trades.slice().sort((a, b) =>
    Number(b.status === 'confirmed') - Number(a.status === 'confirmed') || recentFirst(a, b));
  for (const trade of ranked) {
    const name = normalizeName(trade.name);
    if (name && (!keyword || name.includes(keyword)) && !choices.has(name)) choices.set(name, trade);
  }
  return [...choices.values()].sort((a, b) => recentFirst(a, b) || normalizeName(a.name).localeCompare(normalizeName(b.name)));
}

export function recentTradeVendor(vendors: NamedMemory[], tradeId: string): NamedMemory | undefined {
  return vendors.filter((row) => row.tradeTypeId === tradeId && row.status === 'confirmed').sort(recentFirst)[0];
}
