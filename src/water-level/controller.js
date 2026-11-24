import { formatWaterLogs } from './formatter.js';
import { parseWaterText } from './parser.js';
import { loadLogs, loadPoints, newLog, saveLog, importLog, deleteLog, savePoint, deletePoint } from './repository.js';
import { validateLog } from './calculator.js';
import { formatMeasurementTime } from '../shared/date.js';
import { notifyReact } from '../app/react-store';
import { confirmAction } from '../app/react-confirm';
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
constructor(root, onLocalSaved = () => {}) {
    this.root = root;
    this.points = [];
    this.logs = [];
    this.editing = null;
    this.pointEditing = null;
    this.mode = 'entry';
    this.expandedHistoryId = null;
    this.outputOpen = false;
    this.importFeedback = [];
    this.onLocalSaved = onLocalSaved;
  }
async initialize() { this.points = await loadPoints(); this.logs = await loadLogs(); this.editing = newLog(this.points); }
async refresh() {
    const active = document.activeElement;
    const field = active?.dataset?.waterField ?? active?.dataset?.waterReading;
    const selectionStart = typeof active?.selectionStart === 'number' ? active.selectionStart : null;
    const selectionEnd = typeof active?.selectionEnd === 'number' ? active.selectionEnd : null;
    this.points = await loadPoints(); this.logs = await loadLogs();
    if (!this.editing) this.editing = newLog(this.points);
    else if (!this.editing.id) {
      // Newly configured wells join a new editor without replacing typed values.
      const known = new Set(this.editing.readings.map((reading) => reading.pointId));
      this.editing.readings.push(...newLog(this.points).readings.filter((reading) => !known.has(reading.pointId)));
    }
    this.render();
    if (field !== undefined) {
      const selector = active?.dataset?.waterField ? `[data-water-field="${CSS.escape(active.dataset.waterField)}"]` : `[data-water-reading="${CSS.escape(active.dataset.waterReading)}"]`;
      const next = this.root.querySelector(selector);
      if (next) { next.focus(); if (selectionStart !== null) next.setSelectionRange(selectionStart, selectionEnd ?? selectionStart); }
    }
  }
preview() { return formatWaterLogs(this.logs); }
async handleInput(target) {
    if (['measuredAt', 'battery'].includes(target.dataset.waterField)) this.editing[target.dataset.waterField] = target.value;
    const index = Number(target.dataset.waterReading);
    if (target.dataset.waterReading !== undefined && Number.isInteger(index) && this.editing.readings[index]) this.editing.readings[index].value = target.value;
  }
async handleAction(action, id, extra) {
    if (action === 'toggle-output') { this.outputOpen = !this.outputOpen; this.render(); return; }
    if (action === 'toggle-history') { this.expandedHistoryId = this.expandedHistoryId === id ? null : id; this.render(); return; }
    if (action === 'copy-water') { await navigator.clipboard.writeText(this.preview()); return; }
    if (action === 'save-log') { const errors = validateLog(this.editing); if (errors.length) { this.render(); return; } await saveLog(this.editing); this.onLocalSaved(); window.dispatchEvent(new Event('local-data-saved')); this.editing = newLog(await loadPoints()); await this.refresh(); return; }
    if (action === 'add-point') { this.pointEditing = 'new'; return; }
    if (action === 'edit-point') { this.pointEditing = id; return; }
    if (action === 'cancel-point') { this.pointEditing = null; return; }
    if (action === 'save-point') { await savePoint(String(id)); this.pointEditing = null; this.onLocalSaved(); await this.refresh(); return; }
    if (action === 'update-point') { await savePoint(String(extra), id); this.pointEditing = null; this.onLocalSaved(); await this.refresh(); return; }
    if (action === 'cancel-edit') { this.editing = newLog(await loadPoints()); this.mode = 'entry'; this.render(); return; }
    if (action === 'edit-log') { const log = this.logs.find((item) => item.id === id); if (log) { this.editing = structuredClone(log); this.mode = 'entry'; this.expandedHistoryId = null; this.render(); } return; }
    if (action === 'delete-log' && await confirmAction('刪除後，後續下降量將重新計算。確定刪除？')) { await deleteLog(id); this.onLocalSaved(); if (this.expandedHistoryId === id) this.expandedHistoryId = null; await this.refresh(); return; }
    if (action === 'delete-point' && await confirmAction('刪除井位只影響後續輸入，不會刪除歷史讀值。確定刪除？')) { await deletePoint(id); this.pointEditing = null; this.onLocalSaved(); await this.refresh(); return; }
    if (action === 'parse-import') await this.importText();
  }
async importText() {
    const text = this.root.querySelector('#water-import-text').value;
    const parsed = parseWaterText(text);
    const messages = [];
    for (const segment of parsed) {
      if (!segment.ok) { messages.push(`略過：${segment.error}`); continue; }
      const errors = validateLog(segment, true);
      if (errors.length) { messages.push(`略過：${errors.join('；')}`); continue; }
      const existing = this.logs.find((log) => log.measuredAt === segment.measuredAt);
      if (existing && !await confirmAction(`${segment.measuredAt} 已有量測紀錄，是否覆蓋？`)) { messages.push(`${segment.measuredAt}：略過重複紀錄`); continue; }
      try { await importLog(segment, existing?.id); }
      catch (error) { messages.push(`${segment.measuredAt}：匯入失敗（${error.message}）`); continue; }
      this.points = await loadPoints();
      this.logs = await loadLogs();
      this.onLocalSaved();
      messages.push(`${segment.measuredAt}：已匯入`);
    }
    this.importFeedback = messages;
    await this.refresh();
    this.mode = 'import';
    this.render();
  }
render() { notifyReact(); }
renderSettings() { notifyReact(); }
}
