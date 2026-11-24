import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WorkspaceFrame, ReportHistoryList } from '../../src/app/react-presentation';
import { createDailyDraft, type FinalizedDailyReport } from '../../src/domain/daily';

describe('React 日報共用工作區骨架', () => {
  it('三入口共用導覽，保留 hash 入口並標示目前入口', () => {
    const html = renderToStaticMarkup(<WorkspaceFrame selected="daily"><p>日報內容</p></WorkspaceFrame>);
    expect(html).toContain('href="#daily"');
    expect(html).toContain('href="#water-level"');
    expect(html).toContain('href="#settings"');
    expect(html).toContain('施工日報');
    expect(html).toContain('水位變化');
    expect(html).toContain('日報內容');
    expect(html).toContain('astryx-app-shell');
    expect(html).toContain('role="main"');
  });
  it('空歷史保留返回入口與七天保留說明', () => {
    const html = renderToStaticMarkup(<WorkspaceFrame selected="daily"><ReportHistoryList reports={[]} /></WorkspaceFrame>);
    expect(html).toContain('近 7 天尚無已定稿日報。');
    expect(html).toContain('返回日報');
    expect(html).toContain('超過期限會自動清除');
  });
  it('歷史使用資料列且以文字節點跳脫工地與已定稿文字', () => {
    const report = { ...createDailyDraft(null, '<工地>', '2026-11-24'), finalizedAt: '2026-11-24T00:00:00Z', outputText: '<script>保留原文</script>' } as FinalizedDailyReport;
    const html = renderToStaticMarkup(<WorkspaceFrame selected="daily"><ReportHistoryList reports={[report]} /></WorkspaceFrame>);
    expect(html).toContain('astryx-list-item');
    expect(html).toContain('&lt;工地&gt;');
    expect(html).toContain('&lt;script&gt;保留原文&lt;/script&gt;');
    expect(html).toContain('再次複製');
    expect(html).not.toContain('<script>保留原文');
  });
  it('歷史呈現保留定稿空行，且不回寫快照', () => {
    const report = Object.freeze({ ...createDailyDraft(null, '測試工地', '2026-11-24'), finalizedAt: '2026-11-24T00:00:00Z', outputText: '第一行\n\n第二行' } as FinalizedDailyReport);
    const before = JSON.stringify(report);
    const html = renderToStaticMarkup(<WorkspaceFrame selected="daily"><ReportHistoryList reports={[report]} /></WorkspaceFrame>);
    expect(html).toContain('第一行\n\n第二行');
    expect(JSON.stringify(report)).toBe(before);
  });
});
