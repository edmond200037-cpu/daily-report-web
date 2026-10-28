import type { NamedMemory } from '../data/daily-repository';

const normalize = (value: string) => value.trim().replace(/　/g, ' ').replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
export type TradeSearchResult = { trade: NamedMemory; matchingTasks: NamedMemory[]; nameMatches: boolean };
export function searchTradeManagement(trades: NamedMemory[], tasks: NamedMemory[], query: string): TradeSearchResult[] {
  const keyword = normalize(query);
  return trades.flatMap((trade) => { const nameMatches = !keyword || normalize(trade.name).includes(keyword); const matchingTasks = tasks.filter((task) => task.tradeTypeId === trade.id && (!keyword || normalize(task.name).includes(keyword))); return nameMatches || matchingTasks.length ? [{ trade, matchingTasks, nameMatches }] : []; });
}
