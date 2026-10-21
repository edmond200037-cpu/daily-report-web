export type PwaUpdateState = 'idle' | 'available' | 'applying' | 'waiting' | 'success' | 'error';
export type PwaUpdateEvent = 'available' | 'apply' | 'waiting' | 'completed' | 'failed' | 'dismiss';

export const PWA_UPDATE_SUCCESS_MARKER = 'construction-daily-report:pwa-update-complete';

export function transitionPwaUpdateState(state: PwaUpdateState, event: PwaUpdateEvent): PwaUpdateState {
  if (event === 'available') return state === 'applying' ? state : 'available';
  if (event === 'apply') return state === 'available' || state === 'waiting' || state === 'error' ? 'applying' : state;
  if (event === 'waiting') return state === 'applying' ? 'waiting' : state;
  if (event === 'completed') return state === 'applying' || state === 'waiting' ? 'success' : state;
  if (event === 'failed') return state === 'applying' ? 'error' : state;
  return state === 'available' || state === 'waiting' || state === 'success' || state === 'error' ? 'idle' : state;
}

export function consumePwaUpdateSuccess(storage: Pick<Storage, 'getItem' | 'removeItem'>): boolean {
  if (storage.getItem(PWA_UPDATE_SUCCESS_MARKER) !== '1') return false;
  storage.removeItem(PWA_UPDATE_SUCCESS_MARKER);
  return true;
}
