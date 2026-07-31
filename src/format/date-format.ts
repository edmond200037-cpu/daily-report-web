const weekday = ['日', '一', '二', '三', '四', '五', '六'];

export function localToday(): string {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export function formatDate(value: string): string {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.valueOf())) return value;
  return `${date.getMonth() + 1}/${date.getDate()}（${weekday[date.getDay()]}）`;
}
