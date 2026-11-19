const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
export const num = (n: number) => nf.format(Math.round(n));
export const num1 = (n: number) => nf1.format(n);
export function money(n: number): string {
  return `${nf.format(Math.round(n))} ₸`;
}
export function moneyShort(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e6) return `${nf1.format(n / 1e6)} млн ₸`;
  if (a >= 1e3) return `${nf.format(n / 1e3)} тыс ₸`;
  return money(n);
}
export function pct(n: number, digits = 0): string {
  return `${(n * 100).toFixed(digits).replace('.', ',')}%`;
}
export function signedPct(n: number): string {
  const v = Math.round(n * 100);
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}%`;
}
export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
export function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((p) => p[0] ?? '').join('').toUpperCase();
}
