let tail: Promise<unknown> = Promise.resolve();

/** Scope switching and remote application share a lock, including other tabs. */
export function withWorkspaceLock<T>(work: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => typeof navigator !== 'undefined' && navigator.locks
    ? await navigator.locks.request('construction-report-workspace', work)
    : await work();
  const next = tail.then(run, run);
  tail = next.catch(() => undefined);
  return next;
}
