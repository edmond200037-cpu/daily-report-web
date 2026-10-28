// 取代原生 confirm／alert：可套用產品樣式、使用明確的動作文案，且錯誤訊息不會被一鍵帶過。

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

/** 訊息第一段為標題，其餘段落為後果說明；Escape 或取消皆回傳 false，點遮罩不關閉。 */
export function confirmAction(message: string): Promise<boolean> {
  const [title, ...rest] = message.split('\n\n');
  const { label, danger } = confirmActionLabel(title);
  const opener = document.activeElement as HTMLElement | null;
  const dialog = document.createElement('dialog');
  dialog.className = 'confirm-dialog';
  dialog.dataset.ignoreBackgroundCollapse = '';
  dialog.setAttribute('aria-labelledby', 'confirm-dialog-title');
  dialog.innerHTML = `<form method="dialog"><h2 id="confirm-dialog-title"></h2><p class="confirm-dialog__detail"></p><div class="confirm-dialog__actions"><button value="cancel">取消</button><button value="confirm" class="${danger ? 'danger' : 'primary'}"></button></div></form>`;
  dialog.querySelector('h2')!.textContent = title;
  const detail = dialog.querySelector('p')!;
  if (rest.length) detail.textContent = rest.join('\n\n'); else detail.remove();
  dialog.querySelector<HTMLButtonElement>('[value="confirm"]')!.textContent = label;
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => { resolve(dialog.returnValue === 'confirm'); dialog.remove(); opener?.focus?.(); }, { once: true });
    document.body.append(dialog);
    dialog.showModal();
    // 預設聚焦取消，避免連續點擊誤觸破壞性操作。
    dialog.querySelector<HTMLButtonElement>('[value="cancel"]')!.focus();
  });
}

/** 頁內通知：保留到使用者按「知道了」，避免儲存失敗等訊息被忽略。 */
export function notify(message: string): void {
  let notice = document.querySelector<HTMLElement>('.app-notice');
  if (!notice) {
    notice = document.createElement('div');
    notice.className = 'app-notice';
    notice.setAttribute('role', 'alert');
    notice.dataset.ignoreBackgroundCollapse = '';
    notice.innerHTML = '<p></p><button type="button">知道了</button>';
    notice.querySelector('button')!.addEventListener('click', () => notice!.remove());
    document.body.append(notice);
  }
  notice.querySelector('p')!.textContent = message;
  notice.querySelector('button')!.focus();
}
