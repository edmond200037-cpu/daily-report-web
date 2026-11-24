const actionLabels: Array<[keyword: string, label: string, danger: boolean]> = [
  ['刪除', '刪除', true], ['駁回', '駁回', true], ['清除', '清除', true], ['放棄', '放棄修改', true],
  ['交換', '交換樓層', false], ['切換', '切換工種', false], ['轉為', '轉為普通進料', false], ['改接', '改接', false],
];
export function confirmActionLabel(title: string): { label: string; danger: boolean } {
  let best: { label: string; danger: boolean; index: number } | null = null;
  for (const [keyword, label, danger] of actionLabels) {
    const index = title.indexOf(keyword);
    if (index >= 0 && (!best || index < best.index)) best = { label, danger, index };
  }
  return best ? { label: best.label, danger: best.danger } : { label: '確定', danger: false };
}
