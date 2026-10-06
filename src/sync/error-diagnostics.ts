export interface SyncErrorDiagnostic { code?: string; message: string; hint?: string; retryable: boolean; guidance: string; }

type SupabaseLikeError = { code?: unknown; message?: unknown; hint?: unknown; details?: unknown; status?: unknown };
const clean = (value: unknown, max = 240): string => String(value ?? '').replace(/[\r\n\t]+/g, ' ').replace(/https?:\/\/\S+/g, '[網址]').trim().slice(0, max);

export function classifySyncError(error: unknown): SyncErrorDiagnostic {
  const row = (error && typeof error === 'object' ? error : {}) as SupabaseLikeError;
  const code = clean(row.code, 32) || undefined;
  const message = clean(row.message) || clean(error) || '未取得雲端錯誤訊息。';
  const hint = clean(row.hint ?? row.details) || undefined;
  const text = `${code ?? ''} ${message}`.toLowerCase();
  if (code === '40001' || code === '40P01') return { code, message, hint, retryable: true, guidance: '同時寫入，將使用原事件識別自動重試。' };
  if (code === '42501' || /forbidden|permission|not authorized|row-level security/.test(text)) return { code, message, hint, retryable: false, guidance: '目前帳號沒有此工地的編輯權限；請確認成員角色。' };
  if (code === '42883' || code === 'PGRST202' || /function .* does not exist|could not find the function/.test(text)) return { code, message, hint, retryable: false, guidance: '雲端同步函式尚未可用；請檢查 migration、函式參數及 schema cache，再執行檢查並安全重試。' };
  if (/^22/.test(code ?? '') || /invalid|malformed|schema|json/.test(text)) return { code, message, hint, retryable: false, guidance: '本機資料格式不符合雲端協定；請保留資料並更新前端後再處理。' };
  if (/network|fetch|timeout|temporar|connection|failed to fetch/.test(text) || /^5\d\d$/.test(code ?? '')) return { code, message, hint, retryable: true, guidance: '網路或服務暫時不可用，將依退避時間自動重試。' };
  return { code, message, hint, retryable: false, guidance: '此操作已停止重試；請依錯誤碼與摘要檢查雲端設定。' };
}
