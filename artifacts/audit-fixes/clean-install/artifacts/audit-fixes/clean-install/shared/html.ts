/** Safe for both text content and quoted HTML attributes. */
export const escapeHtml = (value: unknown = ''): string => String(value).replace(/[&<>"']/g,
  (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
