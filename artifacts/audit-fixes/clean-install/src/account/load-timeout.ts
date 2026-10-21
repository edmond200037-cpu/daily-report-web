export class AccountLoadTimeoutError extends Error {
  constructor() { super('ACCOUNT_LOAD_TIMEOUT'); }
}

export async function withAccountDeadline<T>(task: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new AccountLoadTimeoutError()), timeoutMs); }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
