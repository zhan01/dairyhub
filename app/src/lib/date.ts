// Date helpers. All business dates are local 'YYYY-MM-DD' strings.
const pad = (n: number) => String(n).padStart(2, '0');

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}
export function addDays(s: string, n: number): string {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
}
export function dayDiff(a: string, b: string): number {
  return Math.round((parseYmd(b).getTime() - parseYmd(a).getTime()) / 86400000);
}
/** ISO weekday: Monday = 1 … Sunday = 7 */
export function weekday(s: string): number {
  const w = parseYmd(s).getDay();
  return w === 0 ? 7 : w;
}
export function today(): string {
  return ymd(new Date());
}
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const WD_LONG = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
export function fmtDay(s: string): string {
  const d = parseYmd(s);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
export function fmtDayShort(s: string): string {
  const d = parseYmd(s);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
}
export function fmtWeekday(s: string): string {
  return WD[weekday(s) - 1];
}
export function fmtWeekdayLong(s: string): string {
  return WD_LONG[weekday(s) - 1];
}
export function monthName(s: string): string {
  return MONTHS_NOM[parseYmd(s).getMonth()];
}
export function fmtTime(t: number): string {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fmtDateTime(t: number): string {
  const d = new Date(t);
  return `${fmtDay(ymd(d))}, ${fmtTime(t)}`;
}
export function relTime(t: number, now = Date.now()): string {
  const m = Math.round((now - t) / 60000);
  if (m < 1) return 'только что';
  if (m < 60) return `${m} мин назад`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ч назад`;
  const d = Math.round(h / 24);
  if (d === 1) return 'вчера';
  if (d < 7) return `${d} дн назад`;
  return fmtDay(ymd(new Date(t)));
}
/** Timestamp for a local date at given hour:minute */
export function at(s: string, h: number, m = 0): number {
  const d = parseYmd(s);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}
export function monthStart(s: string): string {
  return s.slice(0, 8) + '01';
}
export function daysInMonth(s: string): number {
  const d = parseYmd(s);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}
