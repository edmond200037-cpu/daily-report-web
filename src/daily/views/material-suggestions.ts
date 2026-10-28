import { appState, app } from '../../app/state';
import { escapeHtml } from '../../shared/html';
import { materialChoices, type MaterialSuggestField } from './material-view';

const suggestFields: MaterialSuggestField[] = ['materialTypeSnapshot', 'itemName', 'specification', 'unit', 'supplierNameSnapshot'];
const isSuggestField = (name: string | undefined): name is MaterialSuggestField => suggestFields.includes(name as MaterialSuggestField);
let composing = false;

function closeSuggestions(): void { app.querySelectorAll('[data-material-suggestions]').forEach((node) => node.remove()); }
// 只局部插入建議區，不重新渲染，保留焦點與 IME 組字。
function showSuggestions(input: HTMLInputElement): void {
  closeSuggestions();
  const field = input.dataset.materialField;
  if (!appState.materialEditor || !isSuggestField(field)) return;
  const values = materialChoices(field, input.value);
  if (!values.length) return;
  input.insertAdjacentHTML('afterend', `<div class="contact-suggestions material-suggestions" role="listbox" data-material-suggestions>${values.map((value) => `<button type="button" role="option" class="contact-suggestions__option" data-material-suggestion="${escapeHtml(value)}"><span>${escapeHtml(value)}</span></button>`).join('')}</div>`);
}
export function bindMaterialSuggestionEvents(): void {
  app.addEventListener('focusin', (event) => { const target = event.target; if (target instanceof HTMLInputElement && isSuggestField(target.dataset.materialField)) showSuggestions(target); });
  app.addEventListener('input', (event) => { const target = event.target; if (target instanceof HTMLInputElement && isSuggestField(target.dataset.materialField) && !composing && !(event as InputEvent).isComposing) showSuggestions(target); });
  app.addEventListener('compositionstart', (event) => { if ((event.target as HTMLElement).matches('[data-material-field]')) composing = true; });
  app.addEventListener('compositionend', (event) => { const target = event.target; if (!(target instanceof HTMLInputElement) || !target.matches('[data-material-field]')) return; composing = false; if (isSuggestField(target.dataset.materialField)) showSuggestions(target); });
  // 點選建議前不可讓輸入框失焦。
  app.addEventListener('pointerdown', (event) => { if ((event.target as HTMLElement).closest('[data-material-suggestion]')) event.preventDefault(); });
  app.addEventListener('click', (event) => {
    const option = (event.target as HTMLElement).closest<HTMLElement>('[data-material-suggestion]');
    if (option) {
      const input = option.closest('label')?.querySelector<HTMLInputElement>('[data-material-field]');
      if (!input || !appState.materialEditor) return;
      event.preventDefault(); input.value = option.dataset.materialSuggestion ?? '';
      input.dispatchEvent(new Event('input', { bubbles: true })); closeSuggestions(); return;
    }
    if (!(event.target as HTMLElement).closest('[data-material-field]')) closeSuggestions();
  });
  window.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeSuggestions(); });
}
