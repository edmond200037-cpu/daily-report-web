import { appState, type TradeUndoEntry } from '../../app/state';
export function pruneTradeUndoQueue(now = Date.now()): void { const active: TradeUndoEntry[] = []; appState.tradeUndoQueue.forEach((entry) => { if (entry.expiresAt > now) active.push(entry); else window.clearTimeout(entry.timer); }); appState.tradeUndoQueue = active; }
