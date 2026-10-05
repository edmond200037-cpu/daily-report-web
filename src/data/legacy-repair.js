// Pure adapter for the pre-v3 section model. Originals remain in legacy stores
// and migration_metadata; unsupported shapes are quarantined, never guessed.
export function convertLegacyReport(source, history = false) {
  const report = source?.report ?? source;
  if (!report || typeof report.date !== 'string') return null;
  if (Array.isArray(report.tradeSections)) return { ...report, id: history ? report.id : 'current', ...(history ? {
    outputText: report.outputText ?? '', templateVersion: report.templateVersion ?? 1,
    finalizedAt: report.finalizedAt || report.completedAt || report.updatedAt || report.createdAt || new Date().toISOString(),
  } : {}) };
  if (!Array.isArray(report.sections)) return null;
  const stamp = report.updatedAt || report.createdAt || new Date().toISOString();
  const base = { createdAt: stamp, updatedAt: stamp };
  const next = { ...base, id: history ? report.id : 'current', date: report.date, siteId: report.siteId ?? null,
    siteNameSnapshot: report.siteNameSnapshot ?? '', activeTab: 'engineering', tradeSections: [], standaloneMaterialEntries: [], supplies: [], contacts: [], specialItems: [] };
  const material = (entry, tradeId = null) => ({ ...base, id: entry.id, entryType: tradeId ? 'independent' : 'normal', connectedTradeSectionId: tradeId,
    materialTypeId: entry.materialId ?? null, materialTypeSnapshot: entry.outputLabelSnapshot || entry.materialNameSnapshot || '', itemName: entry.materialNameSnapshot || '',
    supplierId: entry.vendorId ?? null, supplierNameSnapshot: entry.vendorNameSnapshot || '', quantity: String(entry.quantity ?? ''), unit: entry.unit || '', specification: entry.specification || '', note: entry.note || '', sortOrder: next.standaloneMaterialEntries.length });
  for (const section of report.sections) {
    if (section.sectionType === 'construction') {
      for (const entry of section.entries ?? []) {
        if (!Array.isArray(entry.workItems)) { next.standaloneMaterialEntries.push(material(entry)); continue; }
        next.tradeSections.push({ ...base, id: entry.id, tradeTypeId: section.tradeTypeId ?? null, tradeNameSnapshot: section.tradeNameSnapshot || '', vendorId: entry.vendorId ?? null, vendorNameSnapshot: entry.vendorNameSnapshot || '', workerCount: String(entry.workerCount ?? ''), status: 'draft', sortOrder: next.tradeSections.length, materialEntries: [],
          workItems: entry.workItems.map((work, index) => ({ ...base, id: work.id, taskId: null, taskTextSnapshot: work.text || '', locationId: null, locationTextSnapshot: '', startFloorRaw: '', endFloorRaw: '', startFloorNormalized: null, endFloorNormalized: null, note: '', sortOrder: index })) });
      }
    } else if (section.sectionType === 'material') next.standaloneMaterialEntries.push(material(section.entry));
    else if (section.sectionType === 'contact') for (const item of section.items ?? []) next.contacts.push({ ...base, id: item.id, tradeTypeId: item.tradeTypeId ?? null, tradeNameSnapshot: item.tradeNameSnapshot || '', vendorId: item.vendorId ?? null, vendorNameSnapshot: item.vendorNameSnapshot || '', sortOrder: next.contacts.length,
      items: [{ ...base, id: `${item.id}-legacy`, content: [item.plannedDate, item.content].filter(Boolean).join(' '), sortOrder: 0 }] });
    else if (section.sectionType === 'special') for (const item of section.items ?? []) next.specialItems.push({ ...base, id: item.id, content: item.renderedText || '', sortOrder: next.specialItems.length });
    else return null;
  }
  if (history) Object.assign(next, { outputText: report.outputText ?? '', templateVersion: 1, finalizedAt: report.finalizedAt || report.completedAt || stamp });
  return next;
}

export function repairLegacyData(tx) {
  const backups = tx.objectStore('migration_metadata');
  const backup = (store, row) => backups.put({ id: `repair-v18:${store}:${row.id}`, sourceStore: store, original: row, backedUpAt: new Date().toISOString() });
  for (const [sourceName, targetName] of [['reports', 'daily_reports'], ['drafts', 'live_report_draft']]) {
    tx.objectStore(sourceName).getAll().onsuccess = (event) => {
      for (const row of event.target.result) {
        backup(sourceName, row);
        const converted = convertLegacyReport(row, sourceName === 'reports');
        if (!converted) continue;
        const target = tx.objectStore(targetName);
        target.get(converted.id).onsuccess = (found) => { if (!found.target.result) target.put(converted); };
      }
    };
  }
  for (const storeName of ['live_report_draft', 'daily_reports']) {
    const target = tx.objectStore(storeName);
    target.getAll().onsuccess = (event) => { for (const row of event.target.result) {
      if (Array.isArray(row.tradeSections) && (storeName !== 'daily_reports' || row.finalizedAt)) continue;
      backup(storeName, row);
      const converted = convertLegacyReport(row, storeName === 'daily_reports');
      if (converted) target.put(converted);
    } };
  }
  for (const name of ['sites', 'trade_types', 'trade_vendors', 'trade_tasks', 'location_memories', 'material_types', 'material_memory_items']) {
    const store = tx.objectStore(name);
    store.getAll().onsuccess = (event) => { for (const row of event.target.result) {
      if (row.status && typeof row.finalizedUsageCount === 'number') continue;
      backup(name, row);
      store.put({ ...row, ...(!row.status ? { status: 'confirmed', manuallyConfirmed: true } : {}), finalizedUsageCount: typeof row.finalizedUsageCount === 'number' ? row.finalizedUsageCount : 0 });
    } };
  }
}
