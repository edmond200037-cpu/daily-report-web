import type { SpecialTemplateVariable, SpecialValue } from '../../types/domain';
import { formatDate } from '../../format/date-format';

export function templateKeys(template: string): string[] {
  if (/\{[^}]*$|^[^{]*\}|\{\s*\}|\{[^{}]*[{}][^{}]*\}/.test(template)) throw new Error('模板大括號格式不正確。');
  const keys = [...template.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1].trim());
  if (keys.some((key) => !key || !/[\p{L}\p{N}]/u.test(key))) throw new Error('模板欄位名稱不可為空白或只含符號。');
  return [...new Set(keys)];
}

export function renderTemplate(template: string, variables: SpecialTemplateVariable[], values: SpecialValue): string {
  const available = new Map(variables.map((item) => [item.key, item]));
  return template.replace(/\{([^{}]+)\}/g, (_, raw: string) => {
    const key = raw.trim(); const variable = available.get(key); const value = values[key]?.trim() ?? '';
    if (!variable || (variable.required && !value)) throw new Error(`請填寫「${key}」。`);
    return variable?.type === 'date' && value ? formatDate(value) : value;
  });
}
