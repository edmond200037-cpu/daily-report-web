import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../../src/${path}`, import.meta.url), 'utf8');
const events = read('daily/views/daily-events.ts');
const view = read('daily/views/daily-view.ts');
const contact = read('daily/views/contact-view.ts');

describe('剛新增項目的取消入口契約', () => {
  it('只在 appState 保存暫態標記，不寫入日報或草稿序列化', () => {
    expect(read('app/state.ts')).toContain("justAddedEntry: { kind: 'trade' | 'special'; id: string } | null = null;");
    const persist = read('daily/views/daily-entry.ts').split('export function persistEntryDraft()')[1].split('export function restoreEntryScope()')[0];
    expect(persist).not.toContain('justAddedEntry');
    expect(events).toContain("appState.justAddedEntry = { kind: 'trade', id: created.id }");
    expect(events).toContain("{ kind: 'special', id: appState.expandedSpecialId }");
    expect(events).not.toContain('report.justAddedEntry');
  });

  it('取消檢查唯讀與目前標記，沿用既有刪除，不另確認或保存', () => {
    const cancel = events.split("if (action === 'cancel-new-entry') {")[1].split('\n  }')[0];
    expect(cancel).toContain('isReadOnlySite()');
    expect(cancel).toContain('entry.id !== actionElement.dataset.id');
    expect(cancel).toContain('entry.kind !== actionElement.dataset.entryKind');
    expect(cancel).toContain('appState.justAddedEntry = null;');
    expect(cancel).toContain('await deleteItemBySwipe(entry.kind, entry.id);');
    expect(cancel).not.toMatch(/confirm\(|update\(|flush\(|deleteTrade|deleteSpecial/);
    expect(read('daily/views/daily-gestures.ts')).toContain('Date.now() + 6000');
  });

  it('立即新增工種的工程分支也標記新紀錄，聯絡分支先返回', () => {
    const create = events.split("if (action === 'create-trade-from-search') {")[1].split("if (action === 'add-work')")[0];
    expect(create).toMatch(/const created = appState\.daily\.addTradeEntry\(name, null\);\s+appState\.justAddedEntry = \{ kind: 'trade', id: created.id \};/);
    expect(create.indexOf('startContactEntry(name)')).toBeLessThan(create.indexOf('const created ='));
    expect(create.slice(create.indexOf('startContactEntry(name)'), create.indexOf('const created ='))).toContain('return;');
    expect(create.slice(0, create.indexOf('const created ='))).not.toContain("{ kind: 'trade'");
    expect(events.match(/appState\.daily\.addTradeEntry\(/g)).toHaveLength(2);
    expect(events.match(/appState\.justAddedEntry = \{ kind: 'trade', id: created.id \}/g)).toHaveLength(2);
  });

  it('只有對應的可編輯卡片顯示入口，收合與展開施工卡都保留', () => {
    const button = view.split('export function cancelNewEntryButton')[1].split('function tradeCard')[0];
    expect(button).toContain('isReadOnlySite() || appState.justAddedEntry?.kind !== kind || appState.justAddedEntry.id !== id');
    expect(button).toContain('data-id="${escapeHtml(id)}"');
    expect(view.match(/cancelNewEntryButton\('trade', trade.id\)/g)).toHaveLength(2);
    expect(read('daily/views/special-view.ts')).toContain("placeholder ? '' : cancelNewEntryButton('special', item.id)");
    expect(read('daily/daily.css')).toMatch(/\.daily-page \.cancel-new-entry \{[^}]*min-height: var\(--daily-touch-target\)/);
  });

  it('再新增項目、變更工作區與離開日報會清除標記', () => {
    for (const action of ['add-trade', 'add-contact', 'add-normal-material']) {
      expect(events.split(`if (action === '${action}'`)[1].split('\n')[0]).toContain('appState.justAddedEntry = null;');
    }
    const scope = read('daily/views/daily-entry.ts').split('export function restoreEntryScope()')[1].split('export function capturePendingWork()')[0];
    expect(scope).toContain('entryDraftKey(appState.accountAuth.user?.id, appState.accountActiveSiteId ?? appState.daily.report.siteId, appState.daily.report.date)');
    expect(scope).toContain('appState.justAddedEntry = null;');
    const localSite = read('daily/views/daily-entry.ts');
    expect(localSite.split('export function refreshSiteSearch')[1].split('\n')[0]).toContain('appState.justAddedEntry = null;');
    expect(localSite.split('export async function selectDailySite')[1].split('\n')[0]).toContain('appState.justAddedEntry = null;');
    expect(read('main.ts')).toContain("if (route.module !== 'daily' || route.page !== 'main') appState.justAddedEntry = null;");
  });

  it('聯絡新增的取消直接放在儲存列，編輯模式仍在更多選項內', () => {
    expect(contact).toContain('originalId ? `<details class="contact-discard">');
    expect(contact).toContain('data-daily-action="cancel-contact">放棄修改</button>');
    const actions = contact.slice(contact.indexOf('<div class="form-actions form-actions--submit">'));
    expect(actions).toContain("!appState.contactEditor!.originalId && !isReadOnlySite()");
    expect(actions).toContain('data-daily-action="cancel-contact">取消新增</button>');
    expect(actions.indexOf('save-contact')).toBeLessThan(actions.indexOf('cancel-contact'));
  });

  it('未儲存的進料與聯絡草稿可左滑，等同取消輸入而不進刪除／復原流程', () => {
    const material = read('daily/views/material-view.ts');
    expect(material).toContain('startsWith(\'draft:\') ? `<div class="swipe-item material-swipe" data-swipe-item="true" data-swipe-kind="material" data-swipe-draft="material"');
    expect(contact).toContain('!saved ? `<div class="swipe-item" data-swipe-item="true" data-swipe-kind="contact" data-swipe-draft="contact"');
    expect(material).toContain("const sortable = entry.id.startsWith('draft:') || placeholder ? ''");
    expect(contact).toContain('const sortable = saved && !placeholder ?');
    const up = read('daily/views/daily-gestures.ts').split("window.addEventListener('pointerup', (event) => { if (!tradeSwipe.active")[1].split('\n')[0];
    expect(up).toContain('const root = tradeSwipe.root; const draft = root?.dataset.swipeDraft;');
    expect(up.indexOf('const root = tradeSwipe.root')).toBeLessThan(up.indexOf('clearTradeSwipe('));
    expect(up).toContain("else root?.style.setProperty('--trade-swipe-offset', '0px')");
    expect(up).toContain('discardMaterialEditor()');
    expect(up.indexOf('discardContactEditor()')).toBeGreaterThan(-1);
    expect(up.indexOf('shouldDelete && draft')).toBeLessThan(up.indexOf('deleteItemBySwipe(kind, id)'));
    expect(events).toContain('if (!discardContactEditor()) return; await renderApp(); return; }');
  });
});
