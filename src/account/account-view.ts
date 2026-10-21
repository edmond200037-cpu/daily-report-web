export interface ConflictSummary { id: string; label: string; resolvable: boolean; }

export interface AccountPageState {
  configured: boolean;
  url: string;
  pendingCount: number;
  conflicts: ConflictSummary[];
  feedback: string;
  error: string;
}

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));

export function renderAccountPage(state: AccountPageState): string {
  const messages = `${state.feedback ? `<p class="account-feedback" role="status">${escapeHtml(state.feedback)}</p>` : ''}${state.error ? `<p class="issues" role="alert">${escapeHtml(state.error)}</p>` : ''}`;
  const form = `<form class="form-card" data-account-form="save-config"><h2>${state.configured ? '更新連線設定' : '連線設定'}</h2><label>後端網址<input name="url" type="url" value="${escapeHtml(state.url)}" placeholder="https://script.google.com/macros/s/…/exec" required autocomplete="off"></label><label>金鑰<input name="key" type="password" placeholder="${state.configured ? '已儲存；留空則不更換' : ''}" ${state.configured ? '' : 'required'} autocomplete="off"></label><button type="submit" class="primary">${state.configured ? '儲存設定' : '儲存並啟用'}</button></form>`;
  if (!state.configured) return `<section class="account-content"><section class="form-card account-status"><strong>目前使用本機模式</strong><p>資料只存在這台裝置。填入共用後端網址與金鑰後，才會與其他裝置同步；既有資料不會自動上傳。</p></section>${messages}${form}</section>`;
  const conflictRows = state.conflicts.map((conflict) => `<article class="account-member"><div><strong>${escapeHtml(conflict.label)}</strong><small>本機與雲端都有修改</small></div>${conflict.resolvable ? `<div><button type="button" data-account-action="resolve-theirs" data-conflict-id="${escapeHtml(conflict.id)}">用雲端的</button><button type="button" class="primary" data-account-action="resolve-mine" data-conflict-id="${escapeHtml(conflict.id)}">用我的</button></div>` : '<small>請先用「立即同步」後再處理</small>'}</article>`).join('');
  return `<section class="account-content"><section class="form-card account-status"><strong>共用同步已啟用</strong><p>待同步 ${state.pendingCount} 筆</p></section>${messages}${state.conflicts.length ? `<section class="form-card account-administration"><h2>需要你選擇的衝突</h2><div class="account-sites">${conflictRows}</div></section>` : ''}${form}<section class="form-card"><button type="button" class="danger-text" data-account-action="disconnect">停用共用同步</button></section></section>`;
}
