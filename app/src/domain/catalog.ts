import type { Sku, StoreCategory, Store } from './types';

export const SKUS: Sku[] = [
  { id: 'milk25', name: 'Молоко 2,5% 1 л', short: 'Молоко 2,5%', category: 'milk', price: 520, frozen: false, popularity: 12 },
  { id: 'milk32', name: 'Молоко 3,2% 1 л', short: 'Молоко 3,2%', category: 'milk', price: 560, frozen: false, popularity: 6 },
  { id: 'kefir', name: 'Кефир 2,5% 1 л', short: 'Кефир', category: 'kefir', price: 540, frozen: false, popularity: 8 },
  { id: 'ayran', name: 'Айран 0,5 л', short: 'Айран', category: 'drink', price: 290, frozen: false, popularity: 10 },
  { id: 'yogurt', name: 'Йогурт питьевой 0,3 л', short: 'Йогурт', category: 'drink', price: 340, frozen: false, popularity: 6 },
  { id: 'curd', name: 'Творог 5% 400 г', short: 'Творог', category: 'curd', price: 980, frozen: false, popularity: 3 },
  { id: 'sour', name: 'Сметана 20% 400 г', short: 'Сметана', category: 'sour', price: 760, frozen: false, popularity: 4 },
  { id: 'butter', name: 'Масло сливочное 82,5% 180 г', short: 'Масло', category: 'butter', price: 1450, frozen: false, popularity: 3 },
  { id: 'cheese', name: 'Сыр полутвёрдый 300 г', short: 'Сыр', category: 'cheese', price: 2100, frozen: false, popularity: 1.6 },
  { id: 'kurt', name: 'Курт 100 г', short: 'Курт', category: 'snack', price: 450, frozen: false, popularity: 4 },
  { id: 'plombir', name: 'Мороженое пломбир 80 г', short: 'Пломбир', category: 'icecream', price: 280, frozen: true, popularity: 14 },
  { id: 'eskimo', name: 'Мороженое эскимо 70 г', short: 'Эскимо', category: 'icecream', price: 320, frozen: true, popularity: 10 },
];

export const REP_PEOPLE = [
  { name: 'Айдана Сеитова', key: 'rep' },
  { name: 'Ерлан Абдрахманов', key: 'rep2' },
  { name: 'Дмитрий Ким', key: 'rep3' },
  { name: 'Асель Нурланова', key: 'rep4' },
  { name: 'Тимур Жумабаев', key: 'rep5' },
  { name: 'Мадина Ахметова', key: 'rep6' },
];
export const STAFF_PEOPLE = [
  { name: 'Арман Касымов', key: 'manager', role: 'manager' as const },
  { name: 'Ольга Петренко', key: 'warehouse', role: 'warehouse' as const },
  { name: 'Гульнара Исаева', key: 'accounting', role: 'accounting' as const },
];

export const DISTRICT_CENTERS: [number, number][] = [
  [43.2385, 76.8890],
  [43.2570, 76.9440],
  [43.2220, 76.8520],
  [43.2050, 76.9050],
  [43.2700, 76.8900],
  [43.2450, 76.8300],
];

/** Fixed scenario stores (by global index) — used to make the demo tell real stories. */
export const SCENARIO = {
  delivery: 0, // Самал: задержки поставок → дефицит кефира/молока
  noSales: 1, // Таң: морозильник без продаж 4 дня
  repStart: 10, // Ерлан: пропуски визитов → падение по территории
  missing: 20, // Жұлдыз: морозильник не обнаружен
  temperature: 21, // Алатау: датчик температуры
  price: 30, // Достык: цена/конкурент → падение йогурта/айрана
  debt: 40, // Береке: просроченная задолженность → блок отгрузок
  relocation: 50, // Нұр: нерентабельный морозильник
  reportMissing: 31, // Асель: визит без отчёта
};

const FIXED_NAMES: Record<number, [string, Store['channel'], StoreCategory]> = {
  0: ['Супермаркет «Самал»', 'Супермаркет', 'A'],
  1: ['Минимаркет «Таң»', 'Минимаркет', 'B'],
  20: ['Магазин «Жұлдыз»', 'Минимаркет', 'B'],
  21: ['Супермаркет «Алатау»', 'Супермаркет', 'A'],
  30: ['Супермаркет «Достық»', 'Супермаркет', 'A'],
  40: ['Маркет «Береке»', 'Супермаркет', 'A'],
  50: ['Магазин у дома «Нұр»', 'Магазин у дома', 'C'],
};

const NAMES = [
  'Айгерим', 'Ақбота', 'Арай', 'Бақыт', 'Достар', 'Есіл', 'Жайлау', 'Көктем', 'Мерей', 'Нұрлы', 'Сарыарқа', 'Талап',
  'Тұлпар', 'Шаңырақ', 'Ырыс', 'Әсем', 'Аружан', 'Байтерек', 'Гүлдер', 'Дала', 'Жетісу', 'Іңкәр', 'Қайнар', 'Ләззат',
  'Медеу', 'Наурыз', 'Орда', 'Самға', 'Сәуле', 'Тау', 'Ұлан', 'Шуақ', 'Арман', 'Береке-2', 'Вера', 'Городок', 'Домашний',
  'Ерке', 'Жанна', 'Звезда', 'Изобилие', 'Капля', 'Лето', 'Маяк', 'Новый', 'Оазис', 'Парус', 'Радуга', 'Север', 'Тюльпан',
  'Уют', 'Флагман', 'Хозяюшка', 'Центральный', 'Эверест', 'Юность', 'Ясный', 'Алма', 'Береговой', 'Восток',
];
const STREETS = ['ул. Абая', 'ул. Толе би', 'ул. Райымбека', 'ул. Жандосова', 'ул. Сатпаева', 'ул. Розыбакиева', 'ул. Гагарина', 'ул. Тимирязева', 'ул. Байзакова', 'ул. Манаса', 'пр. Аль-Фараби', 'ул. Жибек Жолы', 'ул. Богенбай батыра', 'ул. Кабанбай батыра', 'ул. Шевченко', 'мкр. Самал-2', 'мкр. Орбита-1', 'мкр. Аксай-4'];

/** Category pattern per rep: 3×A, 4×B, 3×C */
const CAT_PATTERN: StoreCategory[] = ['A', 'B', 'A', 'B', 'C', 'B', 'A', 'C', 'B', 'C'];

export function storeIdentity(idx: number, pick: <T>(a: T[]) => T): { name: string; channel: Store['channel']; category: StoreCategory; street: string } {
  const fixed = FIXED_NAMES[idx];
  const street = `${pick(STREETS)}, ${(idx * 7 + 11) % 180 + 2}`;
  if (fixed) return { name: fixed[0], channel: fixed[1], category: fixed[2], street };
  const category = CAT_PATTERN[idx % 10];
  const channel: Store['channel'] = category === 'A' ? 'Супермаркет' : category === 'B' ? 'Минимаркет' : 'Магазин у дома';
  const base = NAMES[idx % NAMES.length];
  const prefix = channel === 'Супермаркет' ? 'Супермаркет' : channel === 'Минимаркет' ? 'Минимаркет' : 'Магазин';
  return { name: `${prefix} «${base}»`, channel, category, street };
}

export const CATEGORY_COEF: Record<StoreCategory, number> = { A: 1.1, B: 1.0, C: 0.95 };
export const WEEKDAY_FACTOR = [0, 0.95, 0.95, 1, 1, 1.1, 1.15, 0.85];
