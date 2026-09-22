import type { AuthSnapshot } from '../auth/auth-service';
import type { SiteSummary } from '../domain/shared';
import type { JoinRequestSummary, SiteMemberSummary } from '../data/remote/site-repository';

export interface AccountPageState {
  auth: AuthSnapshot;
  sites: SiteSummary[];
  activeSiteId: string | null;
  pendingCount: number;
  requests: JoinRequestSummary[];
  members: SiteMemberSummary[];
  feedback: string;
  error: string;
}

const escapeHtml = (value: string): string => value.replace(/[&<>']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;' }[char]!));
const roleLabel = (role: SiteSummary['role']): string => role === 'owner' ? '管理員' : role === 'editor' ? '編輯者' : '檢視者';

export function renderAccountPage(state: AccountPageState): string {
  if (!state.auth.enabled) return `<section class="account-content"><section class="form-card account-status"><strong>目前使用本機模式</strong><p>資料只存在這台裝置。部署時設定 Supabase URL 與 publishable key 後，才會啟用登入和跨裝置共用；既有資料不會自動上傳。</p></section></section>`;
  if (!state.auth.user) return `<section class="account-content"><section class="form-card account-status"><strong>登入後才能使用共用工地</strong><p>每位成員使用自己的帳號；登入成功後仍需建立工地或經管理員核准加入。</p><button type="button" class="primary" data-account-action="sign-in">使用 Google 登入</button></section>${state.error ? `<p class="issues" role="alert">${escapeHtml(state.error)}</p>` : ''}</section>`;
  const userLabel = state.auth.user.email ?? state.auth.user.id;
  const siteRows = state.sites.map((site) => `<article class="account-site${site.id === state.activeSiteId ? ' active' : ''}"><div><strong>${escapeHtml(site.name)}</strong><small>${roleLabel(site.role)}${site.id === state.activeSiteId ? ' · 目前使用' : ''}</small></div><button type="button" data-account-action="select-site" data-site-id="${site.id}"${site.id === state.activeSiteId ? ' disabled' : ''}>${site.id === state.activeSiteId ? '使用中' : '切換'}</button></article>`).join('');
  const requestRows = state.requests.map((request) => `<article class="account-member"><div><strong>${escapeHtml(request.siteName)}</strong><small>申請者 ${escapeHtml(request.userId)}</small></div><div><button type="button" data-account-action="reject-request" data-request-id="${request.id}">拒絕</button><button type="button" data-account-action="approve-viewer" data-request-id="${request.id}">核准檢視</button><button type="button" class="primary" data-account-action="approve-editor" data-request-id="${request.id}">核准編輯</button></div></article>`).join('');
  const memberRows = state.members.map((member) => { const site = state.sites.find((row) => row.id === member.siteId); const mine = member.userId === state.auth.user?.id; return `<article class="account-member"><div><strong>${escapeHtml(mine ? `${member.userId}（你）` : member.userId)}</strong><small>${escapeHtml(site?.name ?? member.siteId)} · ${roleLabel(member.role)}</small></div><div><button type="button" class="account-role-button${member.role === 'viewer' ? ' active' : ''}" aria-pressed="${member.role === 'viewer'}" data-account-action="role-viewer" data-site-id="${member.siteId}" data-user-id="${member.userId}">檢視</button><button type="button" class="account-role-button${member.role === 'editor' ? ' active' : ''}" aria-pressed="${member.role === 'editor'}" data-account-action="role-editor" data-site-id="${member.siteId}" data-user-id="${member.userId}">編輯</button><button type="button" class="account-role-button${member.role === 'owner' ? ' active' : ''}" aria-pressed="${member.role === 'owner'}" data-account-action="role-owner" data-site-id="${member.siteId}" data-user-id="${member.userId}">管理員</button><button type="button" class="danger-text" data-account-action="remove-member" data-site-id="${member.siteId}" data-user-id="${member.userId}">移除</button></div></article>`; }).join('');
  const administration = state.sites.some((site) => site.role === 'owner') ? `<section class="form-card account-administration"><h2>成員管理</h2><section class="account-member-group"><h3>待審核申請</h3><div class="account-sites">${requestRows || '<p class="empty">目前沒有待審核申請。</p>'}</div></section><section class="account-member-group"><h3>現有成員</h3><div class="account-sites">${memberRows}</div></section></section>` : '';
  return `<section class="account-content"><section class="form-card account-identity"><div><span>登入帳號</span><strong>${escapeHtml(userLabel)}</strong></div><button type="button" data-account-action="sign-out">登出</button></section>${state.feedback ? `<p class="account-feedback" role="status">${escapeHtml(state.feedback)}</p>` : ''}${state.error ? `<p class="issues" role="alert">${escapeHtml(state.error)}</p>` : ''}<section class="form-card account-site-panel"><div class="account-sites__header"><div><h2>我的工地</h2><small>${state.activeSiteId ? `目前使用中 · 待同步 ${state.pendingCount} 筆` : '請先選擇工地'}</small></div></div><div class="account-sites">${siteRows || '<p class="empty">目前還沒有可使用的工地。</p>'}</div></section><section class="account-actions"><form class="form-card" data-account-form="create-site"><h2>建立工地</h2><label>工地名稱<input name="name" maxlength="100" required autocomplete="organization"></label><button type="submit" class="primary">建立並成為管理員</button></form><form class="form-card" data-account-form="request-join"><h2>申請加入工地</h2><label>加入碼<input name="joinCode" maxlength="32" required autocapitalize="none" autocomplete="off"></label><button type="submit">送出申請</button></form></section>${administration}</section>`;
}
