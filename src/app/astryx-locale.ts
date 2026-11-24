/** Astryx 0.7.17's zh-TW catalog predates the List reorder messages. */
export const astryxOverrides = {
  'zh-TW': {
    '@astryx.list.reorderHandle': '重新排序 {label}',
    '@astryx.list.reorderHandleVerb': '重新排序',
    '@astryx.list.reorderHandleAt': '重新排序第 {position, number} 筆',
    '@astryx.list.reorderHint': '拖曳握把移動，或按空白鍵、Enter 開啟排序，再用方向鍵移動。完成後按 Escape。',
    '@astryx.list.reorderPlace': '{label}，第 {position, number} 筆，共 {total, number} 筆，在 {previous} 之後、{next} 之前',
    '@astryx.list.reorderPlaceTop': '{label}，第 {position, number} 筆，共 {total, number} 筆，位於最前方、{next} 之前',
    '@astryx.list.reorderPlaceEnd': '{label}，第 {position, number} 筆，共 {total, number} 筆，在 {previous} 之後、位於最後方',
    '@astryx.list.reorderRefused': '無法移動到 {label} 之外',
    '@astryx.list.reorderItemAt': '第 {position, number} 筆',
    '@astryx.list.reorderMoveUp': '上移',
    '@astryx.list.reorderMoveDown': '下移',
    '@astryx.list.reorderDone': '完成排序',
    '@astryx.list.reorderModeDone': '排序完成，{label} 位於第 {position, number} 筆，共 {total, number} 筆',
    '@astryx.list.reorderPickedUp': '已拿起第 {position, number} 筆，共 {total, number} 筆',
    '@astryx.list.reorderDropped': '已放下，位於第 {position, number} 筆，共 {total, number} 筆',
    '@astryx.list.reorderCancelled': '已取消排序，回到第 {position, number} 筆，共 {total, number} 筆',
  },
};
