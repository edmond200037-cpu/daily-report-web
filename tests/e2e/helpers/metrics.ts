import { appendFile, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Page, TestInfo } from '@playwright/test';

type Action = { sequence: number; kind: 'click' | 'input' | 'key'; target: string; value?: string; characters?: number; status: string };
export class Metrics {
  readonly actions: Action[] = [];
  readonly measurements: Array<Record<string, unknown>> = [];
  readonly warnings: string[] = [];
  constructor(readonly page: Page, readonly info: TestInfo) {}

  async action(kind: Action['kind'], target: string, value: string | undefined, run: () => Promise<void>) {
    const action: Action = { sequence: this.actions.length + 1, kind, target, value, status: 'started' };
    if (kind === 'input') action.characters = [...(value ?? '')].length;
    this.actions.push(action);
    await mkdir(this.info.outputDir, { recursive: true });
    await appendFile(this.info.outputPath('actions.jsonl'), JSON.stringify(action) + '\n');
    try { await run(); action.status = 'success'; }
    catch (error) { action.status = String(error); throw error; }
    finally { await appendFile(this.info.outputPath('actions.jsonl'), JSON.stringify(action) + '\n'); }
  }

  async sample(state: string) {
    let scroll = { x: 0, y: 0 };
    try {
      scroll = await this.page.evaluate(() => ({ x: scrollX, y: scrollY }));
      for (const width of [360, 390, 430]) {
        try {
          await this.page.setViewportSize({ width, height: 844 });
          await this.page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
          const measurement = await this.page.evaluate(() => {
            const selector = (element: Element): string => {
              if (element.id) return `#${CSS.escape(element.id)}`;
              const parts: string[] = [];
              let current: Element | null = element;
              while (current && current !== document.body) {
                const index: number = [...(current.parentElement?.children ?? [])].indexOf(current) + 1;
                parts.unshift(`${current.localName}:nth-child(${index})`);
                current = current.parentElement;
              }
              return `body > ${parts.join(' > ')}`;
            };
            const visible = (element: HTMLElement) => {
              const style = getComputedStyle(element);
              return element.getClientRects().length > 0 && style.visibility !== 'hidden' && style.display !== 'none';
            };
            const size = (element: HTMLElement) => {
              const rect = element.getBoundingClientRect();
              return { selector: selector(element), label: element.getAttribute('aria-label') ?? element.textContent?.trim().slice(0, 100), width: rect.width, height: rect.height, left: rect.left, right: rect.right };
            };
            const elements = [...document.querySelectorAll<HTMLElement>('button,a[href],input:not([type=hidden]),textarea,select,summary,[role=button],[role=tab],[role=option]')]
              .filter((element) => visible(element) && !element.matches(':disabled,[aria-disabled=true],[inert] *'));
            const targets = elements.map((element) => {
              if (element instanceof HTMLInputElement && ['checkbox', 'radio'].includes(element.type)) {
                const labels = [...(element.labels ?? [])].filter(visible);
                const label = labels.sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0];
                if (label) return { ...size(label), control: selector(element) };
              }
              return size(element);
            });
            const outside = elements.filter((element) => {
              const rect = element.getBoundingClientRect();
              return rect.left < -1 || rect.right > innerWidth + 1;
            }).map(size);
            const localOverflow = [...document.querySelectorAll<HTMLElement>('article,section,input,pre')]
              .filter((element) => visible(element) && element.scrollWidth > element.clientWidth + 1)
              .map((element) => ({ ...size(element), clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
            const documentWidth = document.documentElement.clientWidth;
            const scrollWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
            const before = { x: scrollX, y: scrollY };
            scrollTo({ left: scrollWidth, top: before.y, behavior: 'instant' });
            const maxScrollX = scrollX;
            scrollTo({ left: before.x, top: before.y, behavior: 'instant' });
            return { documentWidth, scrollWidth, maxScrollX, horizontalOverflow: scrollWidth > documentWidth + 1 || maxScrollX > 0, smallTargets: targets.filter((target) => target.width < 44 || target.height < 44), targetCount: targets.length, outside, localOverflow };
          });
          const screenshot = `${state}-${width}.png`;
          await this.page.screenshot({ path: this.info.outputPath(screenshot), fullPage: true });
          this.measurements.push({ state, width, screenshot, ...measurement });
        } catch (error) {
          this.warnings.push(`${state}/${width} 量測失敗：${String(error)}`);
          this.measurements.push({ state, width, error: String(error) });
        }
      }
    } catch (error) {
      this.warnings.push(`${state} 量測失敗：${String(error)}`);
    } finally {
      try {
        await this.page.setViewportSize({ width: 390, height: 844 });
        await this.page.evaluate((position) => scrollTo(position.x, position.y), scroll);
      } catch (error) { this.warnings.push(`${state} 量測復位失敗：${String(error)}`); }
    }
  }

  async finish(scenario: string, complete: boolean, metadata: Record<string, unknown>) {
    const counts = {
      clicks: this.actions.filter((action) => action.kind === 'click').length,
      inputs: this.actions.filter((action) => action.kind === 'input').length,
      keys: this.actions.filter((action) => action.kind === 'key').length,
      total: this.actions.length,
    };
    const summary = { scenario, complete, ...metadata, counts, warnings: this.warnings, measurements: this.measurements };
    await writeFile(this.info.outputPath('actions.json'), JSON.stringify(this.actions, null, 2));
    await writeFile(this.info.outputPath('metrics.json'), JSON.stringify(summary, null, 2));
    // A complete UI workflow can establish a metrics baseline even if the text gate fails.
    const baseline = path.resolve('artifacts/daily-e2e/baseline', scenario);
    let comparison = '尚無完整基準';
    if (complete && this.measurements.length === 21 && this.measurements.every((row) => !row.error)) {
      try {
        await mkdir(path.dirname(baseline), { recursive: true });
        try {
          await mkdir(baseline);
          await cp(this.info.outputDir, baseline, { recursive: true, force: false });
          comparison = `已保存首次完整量測：${baseline}`;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
          const previous = JSON.parse(await readFile(path.join(baseline, 'metrics.json'), 'utf8')) as {
            counts: typeof counts; measurements: Array<Record<string, unknown>>;
          };
          const delta = this.measurements.map((row) => {
            const before = previous.measurements.find((item) => item.state === row.state && item.width === row.width);
            const smallCount = (item: Record<string, unknown> | undefined) => Array.isArray(item?.smallTargets) ? item.smallTargets.length : null;
            const currentCount = smallCount(row); const baselineCount = smallCount(before);
            return { state: row.state, width: row.width, baselineHorizontalOverflow: before?.horizontalOverflow,
              currentHorizontalOverflow: row.horizontalOverflow,
              smallTargetCountDelta: currentCount !== null && baselineCount !== null ? currentCount - baselineCount : null };
          });
          await writeFile(this.info.outputPath('baseline-comparison.json'), JSON.stringify({ baseline, stepDelta: counts.total - previous.counts.total, measurements: delta }, null, 2));
          comparison = `相較首次基準步數：${counts.total - previous.counts.total}（本次 ${counts.total}，基準 ${previous.counts.total}）；各狀態尺寸差異見 baseline-comparison.json`;
        }
      } catch (error) {
        comparison = `基準保存／比較失敗（不影響文字判定）：${String(error)}`;
        this.warnings.push(comparison);
      }
    }
    // Include any baseline IO warning that was added after the initial snapshot.
    await writeFile(this.info.outputPath('metrics.json'), JSON.stringify(summary, null, 2));
    const rows = this.measurements.map((row) => `| ${row.state} | ${row.width} | ${row.error ? '量測失敗' : row.horizontalOverflow ? '有' : '無'} | ${Array.isArray(row.smallTargets) ? row.smallTargets.length : '未知'} |`).join('\n');
    await writeFile(this.info.outputPath('report.md'), `# 本機日報 E2E：${scenario}\n\n填報流程${complete ? '完成' : '中斷'}；文字判定見 Playwright 結果與 comparison.json。\n\n點擊 ${counts.clicks}、欄位輸入 ${counts.inputs}、額外按鍵 ${counts.keys}，共 ${counts.total} 步。每欄逐字輸入計一次，字數另記；不模擬 IME。\n\n${comparison}\n\n390×844 完整填報；360／390／430 為同一路徑各狀態量測，並非三次重填。自動捲動、截圖、日期固定及歷史驗證不計填報步數。\n\n| 狀態 | 寬度 | 整頁水平捲動 | <44px 目標數 |\n| --- | --- | --- | --- |\n${rows}\n\n尺寸與步數只作觀測，不影響驗收結果。局部 overflow 不等於整頁水平捲動。IME、手勢手感仍須實機驗收。\n\n${this.warnings.join('\n')}\n`);
    await this.info.attach('metrics', { path: this.info.outputPath('metrics.json'), contentType: 'application/json' });
    await this.info.attach('report', { path: this.info.outputPath('report.md'), contentType: 'text/markdown' });
  }
}
