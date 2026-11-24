import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const view = read('src/daily/views/daily-view.ts');
const events = read('src/daily/views/daily-events.ts');
const main = read('src/main.ts');
const sections = view.slice(view.indexOf('function dailySections'), view.indexOf('function dailyHeader'));
const bar = view.slice(view.indexOf('function dailyAddBar'), view.indexOf('function dailySections'));

describe('ADR-017 日報一頁到底契約', () => {
  it('依序渲染四個具名區段與新增列，不依賴分類頁籤或空狀態', () => {
    const labels = [...sections.matchAll(/<section class="daily-section" aria-label="([^"]+)"/g)].map((match) => match[1]);
    expect(labels).toEqual(['施工紀錄', '進料', '聯絡事項', '特殊事項']);
    expect([...bar.matchAll(/data-daily-action="([^"]+)"/g)].map((match) => match[1])).toEqual(['add-trade', 'add-normal-material', 'add-contact', 'add-special']);
    expect([...sections.matchAll(/data-daily-section="([^"]+)"/g)].map((match) => match[1])).toEqual(['trade', 'material', 'contact', 'special']);
    expect(sections).not.toContain('<button');
    expect(sections).not.toMatch(/daily-section__header|<h2|<p|daily-section__empty/);
    expect(sections.indexOf('materialConnectionPanel()')).toBeGreaterThan(sections.indexOf('data-daily-section="material"'));
    expect(view + main).not.toMatch(/data-daily-tab|role="tab(?:list|panel)?"|daily-tabs/);
  });

  it('新增工具列以不透明背景黏頂，四顆短標籤只標亮目前區段', () => {
    const css = read('src/daily/daily.css');
    const add = css.match(/\.daily-page \.daily-add-bar\s*\{([^}]+)\}/)?.[1];
    expect(add).toMatch(/position:\s*sticky;/);
    expect(add).toMatch(/top:\s*0;/);
    expect(add).toMatch(/z-index:\s*10;/);
    expect(add).toMatch(/background:\s*var\(--daily-paper\);/);
    expect(add).toContain('grid-template-columns: repeat(4, minmax(0, 1fr))');
    expect(css).toContain('.daily-page:has(.work-token__tools:not([hidden])) .daily-add-bar { z-index: 0; }');
    expect(css).toContain('button[aria-current="true"] { background: var(--daily-orange); color: #fff; }');
    expect(css).toContain('scroll-margin-top: var(--daily-add-bar-height)');
    expect(css).toContain('border-bottom: 2px solid var(--daily-line-strong)');
    expect(bar).not.toContain('primary');
    expect(bar).toContain('aria-label="新增施工紀錄">＋施工');
    expect(view).toContain("${moduleTabs('daily')}</div>${dailyAddBar()}");
    expect(view + css).not.toContain('daily-section__add');
    const module = read('src/daily/add-bar.ts');
    expect(module).toContain("window.addEventListener('scroll', scheduleUpdate, { passive: true })");
    expect(module).toContain('if (frame !== undefined) return;');
    expect(module).not.toMatch(/appState|persist|mutation|\.update\(/);
    expect(main).toContain('refreshDailyAddBar();');
  });

  it('頁首沿用基本資料開關，收合時不渲染欄位，允許檢視者操作', () => {
    expect(view).toContain('data-daily-action="toggle-basics" aria-expanded="${appState.dailyBasicsExpanded}" aria-controls="daily-basics-panel"');
    expect(view).toContain('${escapeHtml(site)}');
    expect(view).toContain("if (!appState.dailyBasicsExpanded) return '';");
    expect(view).toContain('id="daily-basics-panel"');
    expect(view).toContain('${dailyHeader(saveLabel)}${basicsView()}');
    expect(view.match(/readOnlyDailyActions = new Set\(\[([^\]]+)/)?.[1]).toContain("'toggle-basics'");
    const toggle = events.match(/if \(action === 'toggle-basics'\) \{([^}]+)\}/)?.[1];
    expect(toggle).toContain('dailyBasicsExpanded = !appState.dailyBasicsExpanded');
    expect(toggle).not.toMatch(/update\(|flush\(|persist|mutation/);
  });

  it('UI 不再讀寫 activeTab 或呼叫 switchTab，改用捲動聚焦', () => {
    expect(view + events + main).not.toMatch(/activeTab|switchTab\(/);
    expect(events).toContain("scrollIntoView({ block: 'center', behavior: 'instant' })");
    expect(events).toContain('focus({ preventScroll: true })');
    expect(events).toContain("scrollAndFocus('[data-material-connection-search]')");
    expect(events).toContain('.material-entry,.material-connection-panel,.special-card');
    expect(read('src/app/state.ts')).not.toContain('tabSwitching');
  });

  it('480px 以下只以 CSS 把日期工地按鈕放滿第二列，保留 DOM 與 aria 順序', () => {
    const css = read('src/daily/daily.css');
    const mobile = css.slice(css.indexOf('@media (max-width: 480px)'));
    expect(mobile).toContain('.daily-page .daily-page__header { display: grid;');
    expect(mobile).toContain('.daily-page__header-actions { display: contents; }');
    expect(mobile).toContain('.settings-button { grid-column: 2; grid-row: 1; }');
    expect(mobile).toContain('.daily-context-button { grid-column: 1 / -1; grid-row: 2; width: 100%;');
    expect(css).toContain('text-overflow: ellipsis;');
    const header = view.slice(view.indexOf('function dailyHeader'), view.indexOf('export function workspaceSiteView'));
    expect(header.indexOf('app-header__title')).toBeLessThan(header.indexOf('data-daily-action="toggle-basics"'));
    expect(header.indexOf('data-daily-action="toggle-basics"')).toBeLessThan(header.indexOf('class="settings-button"'));
    expect(header).toContain('aria-controls="daily-basics-panel"');
  });
});
