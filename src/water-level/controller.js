import { formatWaterLog, formatWaterLogs } from './formatter.js';
import { parseWaterText } from './parser.js';
import { loadLogs, loadPoints, newLog, saveLog, deleteLog, savePoint, deletePoint } from './repository.js';
import { validateLog } from './calculator.js';
import { formatMeasurementTime } from '../shared/date.js';

const escapeHtml = (value = '') => String(value).replace(/[&<>\"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));

export const waterLogSummary = (log) => {
  const measuredCount = log.readings.filter((reading) => reading.value !== '').length;
  const totalCount = log.readings.length;
  const complete = totalCount > 0 && measuredCount === totalCount;
  return {
    title: formatMeasurementTime(log.measuredAt),
    detail: totalCount ? `${measuredCount}/${totalCount} 井有數據${log.battery !== '' ? `｜電池 ${Number(log.battery).toFixed(3)}` : ''}` : '尚未設定井位',
    status: complete ? '完整' : '缺值',
  };
};

export class WaterLevelController {
  constructor(root) {
    this.root = root;
    this.points = [];
    this.logs = [];
    this.editing = null;
    this.mode = 'entry';
    this.expandedHistoryId = null;
    this.outputOpen = false;
    this.importFeedback = [];
  }

  async initialize() { this.points = await loadPoints(); this.logs = await loadLogs(); this.editing = newLog(this.points); }
  async refresh() { this.points = await loadPoints(); this.logs = await loadLogs(); if (!this.editing || !this.editing.id) this.editing = newLog(this.points); this.render(); }
  preview() { return formatWaterLogs(this.logs); }

  render() {
    const log = this.editing;
    const errors = validateLog(log);
    const historyCount = this.logs.length;
    this.root.innerHTML = `<section class="water-page"><section class="subtabs water-tabs" role="tablist" aria-label="水位流程"><button type="button" data-water-view="entry" role="tab" aria-selected="${this.mode === 'entry'}" class="${this.mode === 'entry' ? 'active' : ''}">輸入水位</button><button type="button" data-water-view="history" role="tab" aria-selected="${this.mode === 'history'}" class="${this.mode === 'history' ? 'active' : ''}">最近三天${historyCount ? `<span class="water-tab__count" aria-label="${historyCount} 筆紀錄">${historyCount}</span>` : ''}</button><button type="button" data-water-view="import" role="tab" aria-selected="${this.mode === 'import'}" class="${this.mode === 'import' ? 'active' : ''}">貼上匯入</button></section>${this.mode === 'entry' ? this.entryView(log, errors) : this.mode === 'history' ? this.historyView() : this.importView()}${this.outputDrawer()}</section>`;
  }

  renderSettings() {
    this.root.innerHTML = `<section class="water-page water-settings"><section class="workflow-section"><header class="workflow-section__header"><div><h2>井位管理</h2><p>刪除井位只影響後續輸入；既有歷史紀錄保留名稱快照。</p></div></header><section class="form-card water-points-card">${this.pointsView()}</section></section></section>`;
  }

  entryView(log, errors) {
    return `<section class="workflow-section water-entry"><header class="workflow-section__header"><div><h2>${log.id ? '編輯量測紀錄' : '新增量測紀錄'}</h2><p>填寫現場量測值後儲存；空白井位會標示為缺值。</p></div></header><section class="form-card"><div class="water-entry__meta"><label>量測時間<input data-water-field="measuredAt" type="datetime-local" value="${escapeHtml(log.measuredAt)}"></label><label>電池電量（選填）<input data-water-field="battery" inputmode="decimal" value="${escapeHtml(log.battery)}" placeholder="例如 2.798"></label></div><div class="reading-list">${log.readings.length ? log.readings.map((reading, index) => `<label>${escapeHtml(reading.pointNameSnapshot)}<input data-water-reading="${index}" inputmode="decimal" value="${escapeHtml(reading.value)}" placeholder="空白表示無數據"></label>`).join('') : '<p class="empty">請先到「水位設定」新增量測井位。</p>'}</div>${errors.length ? `<ul class="issues">${errors.map((error) => `<li>${escapeHtml(error)}</li>`).join('')}</ul>` : ''}<div class="form-actions form-actions--submit ${log.id ? '' : 'form-actions--single'}"><button type="button" class="primary" data-water-action="save-log">儲存量測</button>${log.id ? '<button type="button" data-water-action="cancel-edit">取消編輯</button>' : ''}</div></section></section>`;
  }

  historyView() {
    const cards = [...this.logs].reverse().map((log) => {
      const summary = waterLogSummary(log);
      const expanded = this.expandedHistoryId === log.id;
      return `<article class="compact-entry water-history-card ${expanded ? 'compact-entry--expanded' : ''}" data-water-history="${log.id}"><button type="button" class="compact-entry__summary water-history-card__summary" data-water-action="toggle-history" data-id="${log.id}" aria-expanded="${expanded}"><span class="water-history-card__lead">水位</span><span class="water-history-card__copy"><strong>${escapeHtml(summary.title)}</strong><span>${escapeHtml(summary.detail)}</span></span><span class="water-history-card__status ${summary.status === '完整' ? 'water-history-card__status--complete' : ''}">${summary.status}</span></button>${expanded ? `<section class="water-history-card__content"><pre>${escapeHtml(formatWaterLog(log))}</pre><div class="water-history-card__actions"><button type="button" data-water-action="edit-log" data-id="${log.id}">編輯</button><button type="button" class="danger-text" data-water-action="delete-log" data-id="${log.id}">刪除</button></div></section>` : ''}</article>`;
    }).join('');
    return `<section class="workflow-section water-history"><header class="workflow-section__header"><div><h2>最近三天量測</h2><p>點選摘要可查看完整歷史紀錄。</p></div></header><div class="workflow-section__list water-history__list">${cards || '<p class="workflow-section__empty">尚無最近三天的水位紀錄。</p>'}</div></section>`;
  }

  importView() {
    return `<section class="workflow-section water-import"><header class="workflow-section__header"><div><h2>貼上水位文字</h2><p>每筆量測以空白行分隔；系統會解析井位、變化與電池資料。</p></div></header><section class="form-card"><textarea id="water-import-text" rows="10" placeholder="7/29-16點\nA井：10.452(下降0.113)\n電池電量：2.798"></textarea><div class="form-actions form-actions--single"><button type="button" class="primary" data-water-action="parse-import">解析並匯入</button></div>${this.importFeedback.length ? `<div class="water-import__result" role="status"><ul>${this.importFeedback.map((message) => `<li>${escapeHtml(message)}</li>`).join('')}</ul></div>` : ''}</section></section>`;
  }

  outputDrawer() {
    const count = this.logs.length;
    const output = this.preview() || '尚無水位紀錄。';
    return `<aside class="output-drawer water-output ${this.outputOpen ? 'output-drawer--open' : ''}"><button type="button" class="output-drawer__toggle" data-water-action="toggle-output" aria-expanded="${this.outputOpen}" aria-controls="water-output-content"><span><strong>${count} 筆水位紀錄</strong><span>${count ? '最近三天輸出已準備完成' : '新增量測後可複製輸出'}</span></span><span>${this.outputOpen ? '收合輸出' : '查看輸出'}</span></button><div id="water-output-content" ${this.outputOpen ? '' : 'hidden'}>${this.outputOpen ? `<div class="output-drawer__content"><pre>${escapeHtml(output)}</pre><button type="button" class="primary" data-water-action="copy-water">複製最近三天</button></div>` : ''}</div></aside>`;
  }

  pointsView() {
    return `<form id="point-form" class="water-point-form"><label>井位名稱<input name="name" required placeholder="例如 A井"></label><div class="form-actions form-actions--single"><button type="submit" class="primary">新增井位</button></div></form><div class="point-list">${this.points.map((point) => `<article class="water-point-row"><strong>${escapeHtml(point.name)}</strong><div><button type="button" data-water-action="rename-point" data-id="${point.id}">改名</button><button type="button" class="danger-text" data-water-action="delete-point" data-id="${point.id}">刪除</button></div></article>`).join('') || '<p class="empty">尚未建立井位。</p>'}</div>`;
  }

  async handleInput(target) { if (target.dataset.waterField) this.editing[target.dataset.waterField] = target.value; if (target.dataset.waterReading) this.editing.readings[Number(target.dataset.waterReading)].value = target.value; }

  async handleAction(action, id) {
    if (action === 'toggle-output') { this.outputOpen = !this.outputOpen; this.render(); return; }
    if (action === 'toggle-history') { this.expandedHistoryId = this.expandedHistoryId === id ? null : id; this.render(); return; }
    if (action === 'copy-water') { await navigator.clipboard.writeText(this.preview()); return; }
    if (action === 'save-log') { const errors = validateLog(this.editing); if (errors.length) { this.render(); return; } await saveLog(this.editing); this.editing = newLog(await loadPoints()); await this.refresh(); return; }
    if (action === 'save-point') { await savePoint(String(id)); await this.refresh(); return; }
    if (action === 'cancel-edit') { this.editing = newLog(await loadPoints()); this.mode = 'entry'; this.render(); return; }
    if (action === 'edit-log') { const log = this.logs.find((item) => item.id === id); if (log) { this.editing = structuredClone(log); this.mode = 'entry'; this.expandedHistoryId = null; this.render(); } return; }
    if (action === 'delete-log' && confirm('刪除後，後續下降量將重新計算。確定刪除？')) { await deleteLog(id); if (this.expandedHistoryId === id) this.expandedHistoryId = null; await this.refresh(); return; }
    if (action === 'delete-point' && confirm('刪除井位只影響後續輸入，不會刪除歷史讀值。確定刪除？')) { await deletePoint(id); await this.refresh(); return; }
    if (action === 'rename-point') { const point = this.points.find((item) => item.id === id); if (!point) return; const name = prompt('新的井位名稱', point.name); if (name !== null) { await savePoint(name, id); await this.refresh(); } return; }
    if (action === 'parse-import') await this.importText();
  }

  async importText() {
    const text = this.root.querySelector('#water-import-text').value;
    const parsed = parseWaterText(text);
    const messages = [];
    for (const segment of parsed) {
      if (!segment.ok) { messages.push(`略過：${segment.error}`); continue; }
      const pointMap = new Map(this.points.map((point) => [point.name, point]));
      for (const reading of segment.readings) {
        if (!pointMap.has(reading.pointNameSnapshot)) {
          const point = await savePoint(reading.pointNameSnapshot);
          this.points.push(point);
          pointMap.set(point.name, point);
        }
        reading.pointId = pointMap.get(reading.pointNameSnapshot).id;
      }
      const existing = this.logs.find((log) => log.measuredAt === segment.measuredAt);
      if (existing && !confirm(`${segment.measuredAt} 已有量測紀錄，是否覆蓋？`)) { messages.push(`${segment.measuredAt}：略過重複紀錄`); continue; }
      await saveLog({ id: existing?.id || '', measuredAt: segment.measuredAt, battery: segment.battery, readings: segment.readings });
      messages.push(`${segment.measuredAt}：已匯入`);
    }
    this.importFeedback = messages;
    await this.refresh();
    this.mode = 'import';
    this.render();
  }
}
