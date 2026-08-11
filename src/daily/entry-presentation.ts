export type EntryStatusTone = 'complete' | 'attention' | 'neutral';

export const tradeStatusTone = (status: 'draft' | 'complete'): EntryStatusTone => status === 'complete' ? 'complete' : 'attention';
export const materialStatusTone = (entryType: 'normal' | 'independent' | undefined, connected: boolean): EntryStatusTone => entryType !== 'independent' ? 'neutral' : connected ? 'complete' : 'attention';
export const itemCountStatusTone = (count: number): EntryStatusTone => count > 0 ? 'complete' : 'attention';
export const contentStatusTone = (content: string): EntryStatusTone => content.trim() ? 'complete' : 'attention';
