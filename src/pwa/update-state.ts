export type PwaUpdateState = 'idle' | 'available' | 'applying' | 'success' | 'error';
export type PwaUpdateEvent = 'available' | 'apply' | 'completed' | 'failed' | 'dismiss';

export const PWA_UPDATE_SUCCESS_MARKER = 'construction-daily-report:pwa-update-complete';

export function transitionPwaUpdateState(state: PwaUpdateState, event: PwaUpdateEvent): PwaUpdateState {
  if (event === 'available') return state === 'applying' ? state : 'available';
  if (event === 'apply') return state === 'available' || state === 'error' ? 'applying' : state;
  if (event === 'completed') return state === 'applying' ? 'success' : state;
  if (event === 'failed') return state === 'applying' ? 'error' : state;
  return state === 'available' || state === 'success' ? 'idle' : state;
}

export function consumePwaUpdateSuccess(storage: Pick<Storage, 'getItem' | 'removeItem'>): boolean {
  if (storage.getItem(PWA_UPDATE_SUCCESS_MARKER) !== '1') return false;
  storage.removeItem(PWA_UPDATE_SUCCESS_MARKER);
  return true;
}
