const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
export const localDate = (date = new Date()) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
export const dateTimeLocal = (date = new Date()) => `${localDate(date)}T${String(date.getHours()).padStart(2, '0')}:00`;
export const formatDate = (isoDate) => { const date = new Date(`${isoDate}T12:00:00`); return `${date.getMonth() + 1}/${date.getDate()}（${WEEKDAYS[date.getDay()]}）`; };
export const formatMeasurementTime = (iso) => { const date = new Date(iso); return `${date.getMonth() + 1}/${date.getDate()}-${date.getHours()}點`; };
export const withinRecentThreeDays = (iso) => { const current = new Date(); const start = new Date(current.getFullYear(), current.getMonth(), current.getDate() - 2); return new Date(iso) >= start && new Date(iso) <= current; };
