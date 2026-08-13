import type { DailyReportV3, MaterialEntry, TradeSection } from '../domain/daily';
import { normalizeName } from '../format/normalization';

export type OutputTradeGroup = { key: string; title: string; sections: TradeSection[]; materials: MaterialEntry[] };

export const tradeGroupKey = (trade: TradeSection): string => trade.tradeTypeId ? `id:${trade.tradeTypeId}` : `legacy-name:${normalizeName(trade.tradeNameSnapshot)}`;
export const vendorIdentityKey = (trade: TradeSection): string => trade.vendorId ? `id:${trade.vendorId}` : `legacy-name:${normalizeName(trade.vendorNameSnapshot)}`;

export function groupOutputTrades(report: DailyReportV3, completedOnly = true): OutputTradeGroup[] {
  const trades = report.tradeSections.filter((trade) => !completedOnly || trade.status === 'complete').slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const groups = new Map<string, OutputTradeGroup>();
  for (const trade of trades) {
    const key = tradeGroupKey(trade);
    const group = groups.get(key) ?? { key, title: trade.tradeNameSnapshot.trim(), sections: [], materials: [] };
    group.sections.push(trade);
    groups.set(key, group);
  }
  const owners = new Map(trades.map((trade) => [trade.id, trade]));
  for (const entry of report.standaloneMaterialEntries ?? []) {
    if (entry.entryType !== 'independent' || !entry.connectedTradeSectionId) continue;
    const owner = owners.get(entry.connectedTradeSectionId);
    if (owner) groups.get(tradeGroupKey(owner))?.materials.push(entry);
  }
  for (const group of groups.values()) {
    const ownerOrder = new Map(group.sections.map((trade, index) => [trade.id, index]));
    group.materials.sort((a, b) => (ownerOrder.get(a.connectedTradeSectionId ?? '') ?? Number.MAX_SAFE_INTEGER) - (ownerOrder.get(b.connectedTradeSectionId ?? '') ?? Number.MAX_SAFE_INTEGER) || a.sortOrder - b.sortOrder);
  }
  return [...groups.values()];
}

export function duplicateVendorTradeIds(report: DailyReportV3): Set<string> {
  const duplicates = new Set<string>();
  for (const group of groupOutputTrades(report, false)) {
    const seen = new Map<string, string>();
    for (const trade of group.sections) {
      const key = vendorIdentityKey(trade);
      if (key === 'legacy-name:') continue;
      const first = seen.get(key);
      if (first) { duplicates.add(first); duplicates.add(trade.id); } else seen.set(key, trade.id);
    }
  }
  return duplicates;
}
