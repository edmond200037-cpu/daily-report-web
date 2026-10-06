import type { ConflictReview } from '../sync/conflict-review';

export function renderMemoryConflictChoice(review: ConflictReview, escapeHtml: (text: string) => string): string {
  const describe = (value: Record<string, unknown>): string => {
    if (typeof value.id !== 'string') return '查無對應記憶';
    const payload = value.payload as Record<string, unknown> | undefined;
    const name = String(payload?.name ?? payload?.value ?? payload?.text ?? value.normalized_name ?? '未命名');
    return `${name}｜${value.deleted ? '已刪除' : value.status === 'confirmed' ? '已確認' : '候選'}｜使用 ${Number(value.usage_count) || 0} 次`;
  };
  const cloudExists = typeof review.cloud.id === 'string';
  return `<article class="account-conflict-diff"><strong>工地記憶</strong><p>本機：${escapeHtml(describe(review.local))}</p><p>雲端：${escapeHtml(describe(review.cloud))}</p><p class="hint">完整選擇一筆記憶，避免工種、識別碼與內容混用。${cloudExists ? '' : '雲端沒有此記憶；保留本機後會建立新的同步操作。'}</p><label>採用完整版本<select data-conflict-choice="/"><option value="cloud"${cloudExists ? '' : ' disabled'}>雲端完整版本</option><option value="local"${cloudExists ? '' : ' selected'}>本機完整版本</option></select></label></article>`;
}
