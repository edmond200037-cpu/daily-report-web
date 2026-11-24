import { appState } from './state';
export const clearPwaUpdateTimeout = () => { if (appState.pwaUpdateTimeout !== undefined) { window.clearTimeout(appState.pwaUpdateTimeout); appState.pwaUpdateTimeout = undefined; } };
export function normalizeSearch(value: string): string { return value.trim().replace(/　/g, ' ').replace(/\s+/g, ' ').toLocaleLowerCase('en-US'); }
