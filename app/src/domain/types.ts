export type Role = 'admin' | 'manager' | 'rep' | 'warehouse' | 'accounting';
export type Dept = 'manager' | 'warehouse' | 'accounting' | 'rep';

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Администратор',
  manager: 'Руководитель',
  rep: 'Торговый представитель',
  warehouse: 'Склад',
  accounting: 'Бухгалтерия',
};
export const DEPT_LABEL: Record<Dept, string> = {
  manager: 'Руководитель',
  warehouse: 'Склад',
  accounting: 'Бухгалтерия',
  rep: 'Торговый представитель',
};

export interface User {
  id: string;
  wsId: string;
  email: string;
  name: string;
  role: Role;
  phone?: string;
  passHash: string;
  salt: string;
  status: 'active' | 'blocked';
  createdAt: number;
  failed: number;
  lockUntil?: number;
  lastLoginAt?: number;
  mustChangePassword?: boolean;
}

export interface Sku {
  id: string;
  name: string;
  short: string;
  category: 'milk' | 'kefir' | 'drink' | 'curd' | 'sour' | 'butter' | 'cheese' | 'snack' | 'icecream';
  price: number;
  frozen: boolean;
  popularity: number;
}

export type StoreCategory = 'A' | 'B' | 'C';
export interface Store {
  id: string;
  name: string;
  channel: 'Супермаркет' | 'Минимаркет' | 'Магазин у дома';
  address: string;
  lat: number;
  lng: number;
  category: StoreCategory;
  repId: string;
  visitDays: number[]; // ISO weekdays
  volume: number; // demand multiplier
  debt: number;
  debtOverdueDays: number;
  creditLimit: number;
  shipmentsBlocked: boolean;
  priceIndex: number; // our shelf price vs main competitor (1.0 = parity)
  contact: string;
}

export type FreezerStatus = 'installed' | 'missing' | 'repair' | 'replacement' | 'warehouse' | 'written_off';
export const FREEZER_STATUS_LABEL: Record<FreezerStatus, string> = {
  installed: 'Установлен',
  missing: 'Не обнаружен',
  repair: 'В ремонте',
  replacement: 'Ожидает замены',
  warehouse: 'На складе',
  written_off: 'Списан',
};

export type NoSalesCause = 'no_product' | 'display' | 'low_demand' | 'price' | 'rep_work' | 'competition';
export const NO_SALES_CAUSES: { id: NoSalesCause; label: string; hint: string; fix: string }[] = [
  { id: 'no_product', label: 'Отсутствие продукции', hint: 'Морозильник пустой или заполнен менее чем наполовину', fix: 'Срочный заказ и контроль отгрузки складом' },
  { id: 'display', label: 'Неправильная выкладка', hint: 'Товар не виден, нет ценников, чужой товар в морозильнике', fix: 'Выкладка по планограмме, ценники, фото «после»' },
  { id: 'low_demand', label: 'Низкий спрос', hint: 'Мало покупателей, неподходящий ассортимент для точки', fix: 'Корректировка ассортимента под точку' },
  { id: 'price', label: 'Неконкурентная цена', hint: 'Полочная цена выше конкурента более чем на 10%', fix: 'Согласовать цену/промо с руководителем' },
  { id: 'rep_work', label: 'Недостаточная работа представителя', hint: 'Пропуски визитов, короткие визиты, нет заказов', fix: 'Разбор с супервайзером, совместный визит' },
  { id: 'competition', label: 'Конкурентное давление', hint: 'Морозильник конкурента ближе к входу, акции конкурента', fix: 'Промо, POS-материалы, перестановка ближе к кассе' },
];
export const PROGRAM_STAGES = ['Диагностика', 'Устранение', 'Конкурентоспособность', 'Контроль'] as const;

export interface FreezerProgram {
  stage: 1 | 2 | 3 | 4;
  startedAt: string;
  checklist: Partial<Record<NoSalesCause, boolean>>; // true = cause confirmed
  actions: { t: number; text: string; by: string }[];
}

export interface Freezer {
  id: string;
  serial: string;
  model: string;
  storeId: string | null;
  status: FreezerStatus;
  hasSensor: boolean;
  /** demo: cooling fault reproduced by sensor readings until resolved */
  fault?: boolean;
  installedAt: string;
  lastVerifiedAt?: string;
  lastPhotoId?: string;
  program?: FreezerProgram;
  history: { t: number; text: string }[];
}

export interface Delivery {
  id: string;
  storeId: string;
  plannedDate: string;
  actualDate?: string;
  status: 'planned' | 'delivered' | 'delayed' | 'short' | 'blocked';
  fillRate: number; // 0..1 share of ordered delivered
  note?: string;
}

export type StockLevel = 'ok' | 'low' | 'out';
export interface FreezerCheck {
  freezerId: string;
  present: boolean;
  working: boolean;
  filled: 'full' | 'half' | 'empty';
  ownGoodsOnly: boolean;
  photoId?: string;
}
export interface CheckIn {
  t: number;
  lat: number;
  lng: number;
  accuracy: number;
  distance: number;
  inZone: boolean;
  simulated: boolean;
  comment?: string;
}
export interface Visit {
  id: string;
  storeId: string;
  repId: string;
  date: string;
  status: 'planned' | 'in_progress' | 'done' | 'missed';
  checkIn?: CheckIn;
  checkOutAt?: number;
  stock?: Record<string, StockLevel>;
  freezerChecks?: FreezerCheck[];
  competitor?: { active: boolean; priceIndex?: number; note?: string };
  photoIds: string[];
  order?: Record<string, number>;
  orderTotal?: number;
  comment?: string;
  reportDone: boolean;
  posted?: boolean;
  flags: string[];
}

export type SignalType =
  | 'missed_visit'
  | 'sales_drop'
  | 'rep_drop'
  | 'freezer_no_sales'
  | 'freezer_missing'
  | 'temperature'
  | 'report_missing'
  | 'plan_risk'
  | 'relocation';

export const SIGNAL_LABEL: Record<SignalType, string> = {
  missed_visit: 'Пропущенный визит',
  sales_drop: 'Снижение продаж в точке',
  rep_drop: 'Снижение продаж сотрудника',
  freezer_no_sales: 'Морозильник без продаж',
  freezer_missing: 'Оборудование отсутствует',
  temperature: 'Температура вне нормы',
  report_missing: 'Незаполненный отчёт',
  plan_risk: 'Риск невыполнения плана',
  relocation: 'Оценка переноса морозильника',
};

export type Confidence = 'high' | 'medium' | 'low';
export interface Hypothesis {
  cause: string;
  title: string;
  evidence: string[];
  confidence: Confidence;
  dept: Dept;
  action: string;
}

export type SignalStatus = 'new' | 'in_progress' | 'monitoring' | 'resolved' | 'dismissed';
export const SIGNAL_STATUS_LABEL: Record<SignalStatus, string> = {
  new: 'Новый',
  in_progress: 'В работе',
  monitoring: 'Контроль результата',
  resolved: 'Решён',
  dismissed: 'Отклонён',
};

export interface Signal {
  id: string;
  type: SignalType;
  severity: 'high' | 'medium' | 'low';
  title: string;
  summary: string;
  storeId?: string;
  repId?: string;
  freezerId?: string;
  skuIds?: string[];
  detectedAt: number;
  status: SignalStatus;
  hypotheses: Hypothesis[];
  metrics: Record<string, number>;
  history: { t: number; text: string; by: string }[];
  monitorUntil?: string;
  taskIds: string[];
}

export type TaskStatus = 'open' | 'in_progress' | 'done';
export interface Task {
  id: string;
  signalId?: string;
  title: string;
  description: string;
  dept: Dept;
  assigneeId?: string;
  storeId?: string;
  status: TaskStatus;
  createdAt: number;
  dueAt: number;
  doneAt?: number;
  createdBy: string;
  comments: { t: number; text: string; by: string }[];
  attachments?: string[];
  overdueNotified?: boolean;
  rejected?: boolean;
}

/** GPS track of a working shift (collected only between «Начать смену» and «Завершить смену»). */
export interface Shift {
  id: string;
  repId: string;
  date: string;
  startAt: number;
  endAt?: number;
  /** [lat, lng, timestamp, accuracy] */
  points: [number, number, number, number][];
  simulated?: boolean;
}

export interface PlanOverride {
  value: number;
  comment: string;
  by: string;
  t: number;
}

export interface Notice {
  id: string;
  to: { userId?: string; role?: Role };
  title: string;
  body: string;
  t: number;
  readBy: string[];
  link?: string;
  kind: 'signal' | 'task' | 'reminder' | 'system';
}

export interface Invite {
  code: string;
  role: Role;
  name?: string;
  createdAt: number;
  createdBy: string;
  usedBy?: string;
  expiresAt: number;
}

export interface Settings {
  geofenceM: number;
  dropThreshold: number;
  zeroSalesDays: number;
  tempLimit: number;
  tempHours: number;
  freezerMinRevenue: number;
  monitorDays: number;
  seasonality: number;
  topDownPlanFactor: number;
}

export interface Workspace {
  id: string;
  company: string;
  createdAt: number;
  demo: boolean;
  seedDay: string; // date the dataset was generated
  startDate: string; // sales index 0
  seed: number;
  skus: Sku[];
  stores: Store[];
  freezers: Freezer[];
  deliveries: Delivery[];
  visits: Visit[];
  sales: Record<string, Record<string, number[]>>; // storeId -> skuId -> units/day
  temps: Record<string, number[]>; // freezerId -> hourly °C, last 72 h (last = current hour)
  tempsAt: number; // timestamp of last temp reading
  signals: Record<string, Signal>;
  tasks: Task[];
  notices: Notice[];
  invites: Invite[];
  settings: Settings;
  audit: { t: number; by: string; text: string }[];
  shifts: Shift[];
  planOverrides: Record<string, PlanOverride>;
  planApprovals: Record<string, { by: string; t: number }>;
  flags: Record<string, boolean>;
}

export const DEFAULT_SETTINGS: Settings = {
  geofenceM: 150,
  dropThreshold: 0.3,
  zeroSalesDays: 3,
  tempLimit: -15,
  tempHours: 2,
  freezerMinRevenue: 120000,
  monitorDays: 14,
  seasonality: 1.0,
  topDownPlanFactor: 1.7,
};
