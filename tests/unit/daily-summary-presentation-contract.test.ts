// @ts-expect-error Vitest 於 Node 執行，但 production tsconfig 未納入 Node 型別。
import { readFileSync } from 'node:fs';
import { appSource } from './helpers/app-source';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('日報收合摘要高度契約', () => {
  const presentation = source('src/presentation.css');
  const daily = appSource();
  const styles = source('src/styles.css');
  const dialog = source('src/daily/dialog.css');
  const dailyCss = source('src/daily/daily.css');
  const inputCss = source('src/daily/input-workflow.css');

  it('以單一 60px token 固定收合摘要列高度', () => {
    expect(presentation).toContain('--summary-height: 60px');
    expect(presentation).toContain('.collapsed-summary { height: var(--summary-height); min-height: var(--summary-height); max-height: var(--summary-height); overflow: hidden; }');
  });

  it('將四類條目與日報預覽接到共同摘要列', () => {
    // Editors use a plain title and return action; collapsed records share the trade-row summary.
    expect(daily.match(/collapsed-summary/g)).toHaveLength(2);
    expect(daily).toContain('class="entry-editor-header"');
    expect(daily).toContain('function entryRowSummary(row: EntryRow)');
    expect(daily).not.toContain('dailyEntrySummary');
    expect(daily).toContain("return entryRowSummary({ meta: tradeName, primary: taskSummary");
    expect(daily).toContain('entryRowSummary({ meta: entry.materialTypeSnapshot');
    expect(daily).toContain('entryRowSummary({ meta: title, primary: summary, detail: vendor');
    expect(daily).toContain("entryRowSummary({ meta: '現場提醒'");
    expect(styles).toContain('min-height: var(--summary-height)');
    expect(dialog).toContain('min-height: var(--summary-height)');
    expect(dialog).not.toContain('min-height: 58px');
    expect(dialog).not.toContain('min-height: 62px');
  });

  it('讓所有日報摘要使用相同的四欄資訊骨架，不能排序的列不留握把欄', () => {
    expect(daily).toContain("${cell('trade', row.meta)}${cell('task', row.primary)}${cell('vendor', row.detail)}");
    expect(daily).toContain('trade-row-summary__status entry-status--${row.statusTone}');
    expect(daily).toContain("${row.handle ? '' : ' trade-row-summary--plain'}");
    expect(daily).not.toContain('<span class="drag-handle" aria-hidden="true">▸</span>');
    expect(inputCss).toContain('.daily-page .trade-row-summary.trade-row-summary--plain { grid-template-columns:minmax(0,1fr); }');
    expect(inputCss).toContain('.daily-page .trade-row-summary__mobile-vendor:empty { display:none; }');
  });

  it('以共用字體 token 隔離按鈕預設字重與行高', () => {
    expect(dailyCss).toContain('--daily-summary-font-weight: 400');
    expect(dailyCss).toContain('--daily-summary-line-height: 1.5');
    expect(dailyCss).toContain('--daily-summary-primary-weight: 760');
    expect(dailyCss).toContain('--daily-summary-label-weight: 700');
    expect(dailyCss).toContain('.daily-entry-summary__toggle { font: inherit; font-weight: var(--daily-summary-font-weight); line-height: var(--daily-summary-line-height);');
    expect(dailyCss).toContain('.daily-entry-summary__primary, .entry-copy strong, .trade-card__title, .material-entry__name { font-weight: var(--daily-summary-primary-weight); }');
    expect(dailyCss).toContain('.daily-entry-summary__secondary, .entry-copy > span, .trade-card__details, .material-entry__details { color: var(--ink-soft); font-size: .8125rem; font-weight: var(--daily-summary-font-weight); line-height: var(--daily-summary-line-height); }');
  });

  it('讓工程拖曳佔位與預覽完整沿用收合工程列骨架', () => {
    expect(daily).toContain('trade-card--drag-placeholder');
    expect(daily).toContain('aria-hidden="true">${tradeRowSummary(trade, false');
    expect(daily).toContain('function tradeDragPreview(id: string): string');
    expect(daily).toContain('class="daily-page trade-drag-preview__surface"');
    expect(daily).toContain("const summaryHeight = card.querySelector<HTMLElement>('.trade-row-summary')?.getBoundingClientRect().height ?? rect.height");
    expect(daily).toContain('preview.style.height = `${summaryHeight + 2}px`');
    expect(daily).toContain('preview.innerHTML = tradeDragPreview(id)');
    expect(daily).toContain('function positionTradeDragPreview(preview: HTMLElement, pointerX: number, pointerY: number): void');
    expect(daily).toContain('const maxTop = Math.max(edge, window.innerHeight - rect.height - edge)');
    expect(dailyCss).toContain('height: calc(var(--summary-height) + 2px)');
    expect(dailyCss).toContain('.daily-page .trade-card--drag-placeholder { height: 74px; }');
    expect(dailyCss).toContain('.trade-drag-preview { position: fixed; z-index: 1000; pointer-events: none; opacity: .88; box-shadow: 0 4px 12px rgb(24 33 38 / 16%); }');
    expect(dailyCss).toContain('.daily-page .trade-card--drag-placeholder');
  });

  it('以獨立工項輸入元件組成施工紀錄，保留進料與預覽入口', () => {
    expect(daily).toContain('workInputView(trade)');
    expect(daily).toContain('data-daily-action="manage-material-connections"');
    expect(daily).toContain('class="daily-output__actions"');
  });
  it('新工項輸入由可獨立驗證的連續編輯器負責', () => {
    expect(daily).toContain('bindWorkInput(app');
    expect(daily).toContain("from '../work-input'");
  });});
