import type { AuthSnapshot } from '../auth/auth-service';
import type { SiteSummary } from '../domain/shared';
import type { JoinRequestSummary, SiteMemberSummary } from '../data/remote/site-repository';
import type { SyncOperation } from '../sync/types';
import type { ConflictReview } from '../sync/conflict-review';
import type { MemoryImportPreview } from '../sync/memory-import';
import type { SyncRecoveryPreview } from '../sync/recovery';
import { renderSyncDiagnosticsPage } from './sync-diagnostics-view';

export interface AccountPageState {
  view?: 'account' | 'debug';
  syncing?: boolean;
  auth: AuthSnapshot;
  sites: SiteSummary[];
  activeSiteId: string | null;
  pendingCount: number;
  requests: JoinRequestSummary[];
  members: SiteMemberSummary[];
  feedback: string;
  error: string;
  diagnostics?: SyncOperation[];
  operations?: SyncOperation[];
  operationsStatus?: 'loading' | 'ready' | 'error';
  conflicts?: ConflictReview[];
  importPreview?: MemoryImportPreview | null;
  recoveryPreview?: SyncRecoveryPreview | null;
}

import { escapeHtml } from '../shared/html';
const roleLabel = (role: SiteSummary['role']): string => role === 'owner' ? '管理員' : role === 'editor' ? '編輯者' : '檢視者';

export function renderAccountPage(state: AccountPageState): string {
  const feedback = state.feedback ? `<p class="account-feedback" role="status">${escapeHtml(state.feedback)}</p>` : '';
  const error = state.error ? `<p class="issues" role="alert">${escapeHtml(state.error)} <button type="button" data-account-action="retry-load-account">重新讀取</button></p>` : '';
  const content = state.view === 'debug' ? renderSyncDiagnosticsPage(state) : renderSharedSitePage(state);
  return `<section class="account-content">${feedback}${error}${content}</section>`;
}

function renderSharedSitePage(state: AccountPageState): string {
  if (!state.auth.enabled) return '<section class="form-card account-status"><strong>目前使用本機模式</strong><p>資料只存在這台裝置。啟用雲端服務後，才可登入與跨裝置共用工地。</p></section>';
  if (!state.auth.user) return '<section class="form-card account-status"><strong>登入後才能使用共用工地</strong><p>每位成員使用自己的帳號；登入成功後仍需建立工地或經管理員核准加入。</p><button type="button" class="primary" data-account-action="sign-in">使用 Google 登入</button></section>';
  const userLabel = state.auth.user.email ?? state.auth.user.id;
  const siteRows = state.sites.map((site) => `<article class="account-site${site.id === state.activeSiteId ? ' active' : ''}"><div class="account-site__details"><div class="account-site__primary"><strong>${escapeHtml(site.name)}</strong><div class="account-join-code"><span>加入碼</span><code>${escapeHtml(site.joinCode)}</code><button type="button" aria-label="複製 ${escapeHtml(site.name)} 加入碼" data-account-action="copy-join-code" data-site-id="${escapeHtml(site.id)}">複製</button></div></div><small>${roleLabel(site.role)}${site.id === state.activeSiteId ? ' · 目前使用' : ''}</small></div><button type="button" data-account-action="select-site" data-site-id="${escapeHtml(site.id)}"${site.id === state.activeSiteId ? ' disabled' : ''}>${site.id === state.activeSiteId ? '使用中' : '切換'}</button></article>`).join('');
  const memberRow = (member: SiteMemberSummary) => { const mine = member.userId === state.auth.user?.id; return `<article class="account-member"><div><strong>${escapeHtml(mine ? `${escapeHtml(member.userId)}（你）` : member.userId)}</strong><small>${roleLabel(member.role)}</small></div><div><button type="button" class="account-role-button${member.role === 'viewer' ? ' active' : ''}" aria-pressed="${member.role === 'viewer'}" data-account-action="role-viewer" data-site-id="${escapeHtml(member.siteId)}" data-user-id="${escapeHtml(member.userId)}">檢視</button><button type="button" class="account-role-button${member.role === 'editor' ? ' active' : ''}" aria-pressed="${member.role === 'editor'}" data-account-action="role-editor" data-site-id="${escapeHtml(member.siteId)}" data-user-id="${escapeHtml(member.userId)}">編輯</button><button type="button" class="account-role-button${member.role === 'owner' ? ' active' : ''}" aria-pressed="${member.role === 'owner'}" data-account-action="role-owner" data-site-id="${escapeHtml(member.siteId)}" data-user-id="${escapeHtml(member.userId)}">管理員</button><button type="button" class="danger-text" data-account-action="remove-member" data-site-id="${escapeHtml(member.siteId)}" data-user-id="${escapeHtml(member.userId)}">移除</button></div></article>`; };
  const administration = state.sites.filter((site) => site.role === 'owner').map((site) => {
    const requestRows = state.requests.filter((request) => request.siteId === site.id).map((request) => `<article class="account-member"><div><strong>${escapeHtml(request.userId)}</strong><small>申請者</small></div><div><button type="button" data-account-action="reject-request" data-request-id="${escapeHtml(request.id)}">拒絕</button><button type="button" data-account-action="approve-viewer" data-request-id="${escapeHtml(request.id)}">核准檢視</button><button type="button" class="primary" data-account-action="approve-editor" data-request-id="${escapeHtml(request.id)}">核准編輯</button></div></article>`).join('');
    const memberRows = state.members.filter((member) => member.siteId === site.id).map(memberRow).join('');
    return `<section class="form-card account-administration"><h2>${escapeHtml(site.name)}</h2><section class="account-member-group"><h3>待審核申請</h3><div class="account-sites">${requestRows || '<p class="empty">目前沒有待審核申請。</p>'}</div></section><section class="account-member-group"><h3>現有成員</h3><div class="account-sites">${memberRows || '<p class="empty">目前沒有現有成員。</p>'}</div></section></section>`;
  }).join('');
  return `<section class="form-card account-identity"><div><span>登入帳號</span><strong>${escapeHtml(userLabel)}</strong></div><button type="button" data-account-action="sign-out">登出</button></section><section class="form-card account-site-panel"><div class="account-sites__header"><div><h2>我的工地</h2><small>${state.activeSiteId ? '目前使用中' : '請先選擇工地'}</small></div></div><div class="account-sites">${siteRows || '<p class="empty">目前還沒有可使用的工地。</p>'}</div></section><p class="hint"><a href="#settings/debug">同步問題請前往偵錯與同步</a></p><section class="account-actions"><form class="form-card" data-account-form="create-site"><h2>建立工地</h2><label>工地名稱<input name="name" maxlength="100" required autocomplete="organization"></label><button type="submit" class="primary">建立並成為管理員</button></form><form class="form-card" data-account-form="request-join"><h2>申請加入工地</h2><label>加入碼<input name="joinCode" maxlength="32" required autocapitalize="none" autocomplete="off"></label><button type="submit">送出申請</button></form></section>${administration}`;
}
