/**
 * DairyHub client API facade: authentication, RBAC and all business operations.
 * Mirrors the REST contracts from docs/03-system-analysis.md; persistence goes through storage.ts.
 */
import { addDays, dayDiff, today, weekday } from '../lib/date';
import { haversine } from '../lib/geo';
import { uid } from '../lib/rng';
import { SYSTEM, dayIndex, pushNotice, runEngine } from '../domain/engine';
import { createWorkspace, extendWorkspace } from '../domain/seed';
import type { CheckIn, Dept, Freezer, FreezerStatus, Invite, NoSalesCause, Role, Settings, Signal, SignalStatus, Task, TaskStatus, User, Visit, Workspace } from '../domain/types';
import { DEPT_LABEL, FREEZER_STATUS_LABEL, PROGRAM_STAGES, ROLE_LABEL } from '../domain/types';
import { clearSession, loadSession, loadUsers, photoStore, saveSession, saveUsers, wsStore, type Session } from './storage';

export const DEMO_PASSWORD = 'DairyHub2026';
export const DEMO_DOMAIN = 'demo.dairyhub.kz';
export const DEMO_ACCOUNTS: { email: string; role: Role; name: string }[] = [
  { email: `manager@${DEMO_DOMAIN}`, role: 'manager', name: 'Арман Касымов' },
  { email: `rep@${DEMO_DOMAIN}`, role: 'rep', name: 'Айдана Сеитова' },
  { email: `warehouse@${DEMO_DOMAIN}`, role: 'warehouse', name: 'Ольга Петренко' },
  { email: `accounting@${DEMO_DOMAIN}`, role: 'accounting', name: 'Гульнара Исаева' },
  { email: `admin@${DEMO_DOMAIN}`, role: 'admin', name: 'Администратор демо' },
];
const DEMO_WS_KEY = 'dh:demo-ws:v1';
const MAX_FAILED = 5;
const LOCK_MIN = 15;
const SESSION_H = 12;
const REMEMBER_D = 30;

export class ApiError extends Error {}

// ---------------------------------------------------------------- crypto
const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
export async function hashPassword(pw: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 120000, hash: 'SHA-256' }, key, 256);
  return hex(bits);
}
const newSalt = () => hex(crypto.getRandomValues(new Uint8Array(16)).buffer);
export function passwordProblems(pw: string): string[] {
  const p: string[] = [];
  if (pw.length < 8) p.push('не менее 8 символов');
  if (!/[A-Za-zА-Яа-яЁё]/.test(pw)) p.push('хотя бы одна буква');
  if (!/\d/.test(pw)) p.push('хотя бы одна цифра');
  return p;
}
export const normEmail = (e: string) => e.trim().toLowerCase();
export const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());
function tempPassword() {
  const a = 'abcdefghjkmnpqrstuvwxyz';
  const r = crypto.getRandomValues(new Uint8Array(8));
  return `Dh${[...r].slice(0, 5).map((x) => a[x % a.length]).join('')}${(r[6] % 90) + 10}`;
}
function inviteCode() {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const r = crypto.getRandomValues(new Uint8Array(8));
  const s = [...r].map((x) => a[x % a.length]).join('');
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

// ---------------------------------------------------------------- state
export interface HubState {
  ready: boolean;
  session: Session | null;
  user: User | null;
  impersonator: User | null;
  ws: Workspace | null;
  people: User[];
  today: string;
  version: number;
}

type Listener = () => void;

class Hub {
  state: HubState = { ready: false, session: null, user: null, impersonator: null, ws: null, people: [], today: today(), version: 0 };
  private listeners = new Set<Listener>();
  private saving: Promise<unknown> = Promise.resolve();

  subscribe(l: Listener) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  private emit() {
    this.state = { ...this.state, version: this.state.version + 1 };
    this.listeners.forEach((l) => l());
  }

  // ---------- boot ----------
  async init() {
    try {
      await this.ensureDemo();
      const s = loadSession();
      if (s) await this.openSession(s);
    } catch (e) {
      console.error(e);
    }
    this.state.ready = true;
    this.emit();
    // periodic re-evaluation (reminders, 19:00 missed visits, sensors)
    setInterval(() => { if (this.state.ws) void this.refresh(); }, 5 * 60000);
  }

  private async ensureDemo() {
    const d = today();
    let meta: { wsId: string; day: string } | null = null;
    try { meta = JSON.parse(localStorage.getItem(DEMO_WS_KEY) ?? 'null'); } catch { meta = null; }
    const users = loadUsers();
    const demoUsersOk = DEMO_ACCOUNTS.every((a) => users.some((u) => u.email === a.email));
    if (meta && meta.day === d && demoUsersOk && (await wsStore.get(meta.wsId))) return;
    // (re)generate the public demo once a day so stories stay relative to today
    if (meta) await wsStore.del(meta.wsId).catch(() => undefined);
    const keep = users.filter((u) => !u.email.endsWith('@' + DEMO_DOMAIN) && u.wsId !== meta?.wsId);
    const { ws, people } = createWorkspace({ company: 'Демо: молочная компания', demo: true, today: d, emailFor: (k) => `${k}@${DEMO_DOMAIN}`, admin: { name: 'Администратор демо', email: `admin@${DEMO_DOMAIN}` } });
    const salt = newSalt();
    const hash = await hashPassword(DEMO_PASSWORD, salt);
    const newUsers: User[] = people.map((p) => ({ id: p.id, wsId: ws.id, email: p.email, name: p.name, role: p.role, phone: p.phone, passHash: hash, salt, status: 'active', createdAt: Date.now(), failed: 0 }));
    runEngine(ws, new Date(), d, newUsers);
    await wsStore.put(ws);
    saveUsers([...keep, ...newUsers]);
    try { localStorage.setItem(DEMO_WS_KEY, JSON.stringify({ wsId: ws.id, day: d })); } catch { /* noop */ }
    const s = loadSession();
    if (s && !newUsers.some((u) => u.id === s.userId) && !keep.some((u) => u.id === s.userId)) clearSession();
  }

  private async openSession(s: Session) {
    const users = loadUsers();
    const user = users.find((u) => u.id === s.userId);
    if (!user || user.status !== 'active') { clearSession(); return; }
    const ws = await wsStore.get(user.wsId);
    if (!ws) { clearSession(); return; }
    this.state.session = s;
    this.state.user = user;
    this.state.impersonator = s.impersonatedBy ? users.find((u) => u.id === s.impersonatedBy) ?? null : null;
    this.state.people = users.filter((u) => u.wsId === ws.id);
    this.state.ws = ws;
    await this.refresh(false);
  }

  /** extend data to today, run rules engine, persist */
  async refresh(emit = true) {
    const ws = this.state.ws;
    if (!ws) return;
    const d = today();
    this.state.today = d;
    const ext = extendWorkspace(ws, d);
    const r = runEngine(ws, new Date(), d, this.state.people);
    if (ext || r.changed) await this.persist();
    if (emit) this.emit();
  }

  private async persist() {
    const ws = this.state.ws;
    if (!ws) return;
    this.saving = this.saving.then(() => wsStore.put(ws)).catch((e) => console.error('save failed', e));
    await this.saving;
  }

  private async mutate(fn: (ws: Workspace) => void, audit?: string) {
    const ws = this.state.ws;
    if (!ws) throw new ApiError('Нет активной сессии');
    fn(ws);
    if (audit) this.audit(audit);
    runEngine(ws, new Date(), this.state.today, this.state.people);
    await this.persist();
    this.emit();
  }
  private audit(text: string) {
    const ws = this.state.ws!;
    const by = this.state.impersonator ? `${this.state.impersonator.name} (как ${this.state.user?.name})` : this.state.user?.name ?? SYSTEM;
    ws.audit.unshift({ t: Date.now(), by, text });
    if (ws.audit.length > 500) ws.audit.length = 500;
  }
  private me() {
    if (!this.state.user) throw new ApiError('Требуется вход');
    return this.state.user;
  }
  private requireRole(...roles: Role[]) {
    const u = this.me();
    if (!roles.includes(u.role)) throw new ApiError('Недостаточно прав для действия');
    return u;
  }

  // ---------- auth ----------
  async login(email: string, password: string, remember: boolean) {
    const users = loadUsers();
    const u = users.find((x) => x.email === normEmail(email));
    const generic = 'Неверный e-mail или пароль';
    if (!u) { await hashPassword(password, 'x'); throw new ApiError(generic); }
    if (u.lockUntil && u.lockUntil > Date.now()) {
      const m = Math.ceil((u.lockUntil - Date.now()) / 60000);
      throw new ApiError(`Вход временно заблокирован после ${MAX_FAILED} неудачных попыток. Повторите через ${m} мин.`);
    }
    if (u.status === 'blocked') throw new ApiError('Учётная запись заблокирована администратором компании');
    const h = await hashPassword(password, u.salt);
    if (h !== u.passHash) {
      u.failed = (u.failed || 0) + 1;
      if (u.failed >= MAX_FAILED) { u.lockUntil = Date.now() + LOCK_MIN * 60000; u.failed = 0; }
      saveUsers(users);
      const left = MAX_FAILED - u.failed;
      throw new ApiError(u.lockUntil && u.lockUntil > Date.now() ? `Слишком много попыток. Вход заблокирован на ${LOCK_MIN} мин.` : `${generic}. Осталось попыток: ${left}`);
    }
    u.failed = 0;
    u.lockUntil = undefined;
    u.lastLoginAt = Date.now();
    saveUsers(users);
    const s: Session = { userId: u.id, remember, exp: Date.now() + (remember ? REMEMBER_D * 24 : SESSION_H) * 3600000 };
    saveSession(s);
    await this.openSession(s);
    this.audit('Вход в систему');
    await this.persist();
    this.emit();
    return u;
  }

  async logout() {
    if (this.state.impersonator) return this.stopImpersonation();
    clearSession();
    this.state = { ...this.state, session: null, user: null, ws: null, people: [], impersonator: null };
    this.emit();
  }

  async registerCompany(p: { company: string; name: string; email: string; password: string }) {
    const email = normEmail(p.email);
    if (p.company.trim().length < 2) throw new ApiError('Укажите название компании');
    if (p.name.trim().length < 2) throw new ApiError('Укажите имя и фамилию');
    if (!validEmail(email)) throw new ApiError('Некорректный e-mail');
    const pp = passwordProblems(p.password);
    if (pp.length) throw new ApiError(`Пароль: ${pp.join(', ')}`);
    const users = loadUsers();
    if (users.some((u) => u.email === email)) throw new ApiError('Пользователь с таким e-mail уже зарегистрирован');
    const tag = Math.random().toString(36).slice(2, 6);
    const { ws, people } = createWorkspace({ company: p.company.trim(), demo: false, today: today(), emailFor: (k) => `${k}.${tag}@${DEMO_DOMAIN}`, admin: { name: p.name.trim(), email } });
    const newUsers: User[] = [];
    for (const person of people) {
      const salt = newSalt();
      const isAdmin = person.email === email;
      const pw = isAdmin ? p.password : tempPassword() + newSalt().slice(0, 6);
      newUsers.push({ id: person.id, wsId: ws.id, email: person.email, name: person.name, role: person.role, phone: person.phone, passHash: await hashPassword(pw, salt), salt, status: 'active', createdAt: Date.now(), failed: 0 });
    }
    ws.audit.unshift({ t: Date.now(), by: p.name.trim(), text: `Компания «${ws.company}» зарегистрирована, создан администратор` });
    runEngine(ws, new Date(), today(), newUsers);
    await wsStore.put(ws);
    saveUsers([...users, ...newUsers]);
    return this.login(email, p.password, true);
  }

  async joinByInvite(p: { code: string; name: string; email: string; password: string }) {
    const email = normEmail(p.email);
    if (p.name.trim().length < 2) throw new ApiError('Укажите имя и фамилию');
    if (!validEmail(email)) throw new ApiError('Некорректный e-mail');
    const pp = passwordProblems(p.password);
    if (pp.length) throw new ApiError(`Пароль: ${pp.join(', ')}`);
    const users = loadUsers();
    if (users.some((u) => u.email === email)) throw new ApiError('Пользователь с таким e-mail уже зарегистрирован');
    const code = p.code.trim().toUpperCase();
    const wsIds = [...new Set(users.map((u) => u.wsId))];
    for (const id of wsIds) {
      const ws = await wsStore.get(id);
      const inv = ws?.invites.find((i) => i.code === code);
      if (!ws || !inv) continue;
      if (inv.usedBy) throw new ApiError('Код приглашения уже использован');
      if (inv.expiresAt < Date.now()) throw new ApiError('Срок действия приглашения истёк — запросите новый код у администратора');
      const salt = newSalt();
      const u: User = { id: uid('u_'), wsId: ws.id, email, name: p.name.trim(), role: inv.role, passHash: await hashPassword(p.password, salt), salt, status: 'active', createdAt: Date.now(), failed: 0 };
      inv.usedBy = u.id;
      if (inv.role === 'rep') {
        // a new rep gets a starter territory: up to 5 stores from the most loaded colleague (admin may reassign)
        const counts = new Map<string, number>();
        ws.stores.forEach((s) => counts.set(s.repId, (counts.get(s.repId) ?? 0) + 1));
        const [busiest] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
        ws.stores.filter((s) => s.repId === busiest).slice(-3).forEach((s) => {
          s.repId = u.id;
          ws.visits.filter((v) => v.storeId === s.id && v.status === 'planned').forEach((v) => (v.repId = u.id));
        });
      }
      ws.audit.unshift({ t: Date.now(), by: u.name, text: `Присоединился по приглашению ${code} с ролью «${ROLE_LABEL[inv.role]}»` });
      pushNotice(ws, { to: { role: 'admin' }, title: 'Новый пользователь', body: `${u.name} (${ROLE_LABEL[u.role]}) присоединился по приглашению`, kind: 'system', link: '/admin' });
      await wsStore.put(ws);
      saveUsers([...users, u]);
      return this.login(email, p.password, true);
    }
    throw new ApiError('Код приглашения не найден. Проверьте код или обратитесь к администратору');
  }

  async changePassword(oldPw: string, newPw: string) {
    const users = loadUsers();
    const u = users.find((x) => x.id === this.me().id)!;
    if ((await hashPassword(oldPw, u.salt)) !== u.passHash) throw new ApiError('Текущий пароль указан неверно');
    const pp = passwordProblems(newPw);
    if (pp.length) throw new ApiError(`Пароль: ${pp.join(', ')}`);
    u.salt = newSalt();
    u.passHash = await hashPassword(newPw, u.salt);
    u.mustChangePassword = false;
    saveUsers(users);
    this.state.user = u;
    this.audit('Пароль изменён');
    await this.persist();
    this.emit();
  }

  // ---------- admin: users ----------
  private updateUser(id: string, fn: (u: User) => void) {
    const users = loadUsers();
    const u = users.find((x) => x.id === id && x.wsId === this.state.ws!.id);
    if (!u) throw new ApiError('Пользователь не найден');
    fn(u);
    saveUsers(users);
    this.state.people = users.filter((x) => x.wsId === this.state.ws!.id);
    return u;
  }
  async setUserRole(id: string, role: Role) {
    const me = this.requireRole('admin');
    if (id === me.id && role !== 'admin') throw new ApiError('Нельзя снять роль администратора с самого себя');
    const u = this.updateUser(id, (x) => (x.role = role));
    await this.mutate(() => undefined, `Роль пользователя ${u.name} изменена на «${ROLE_LABEL[role]}»`);
  }
  async setUserBlocked(id: string, blocked: boolean) {
    const me = this.requireRole('admin');
    if (id === me.id) throw new ApiError('Нельзя заблокировать самого себя');
    const u = this.updateUser(id, (x) => { x.status = blocked ? 'blocked' : 'active'; x.lockUntil = undefined; x.failed = 0; });
    await this.mutate(() => undefined, `${blocked ? 'Заблокирован' : 'Разблокирован'} пользователь ${u.name}`);
  }
  async updateUserProfile(id: string, patch: { name?: string; phone?: string }) {
    this.requireRole('admin');
    const u = this.updateUser(id, (x) => { if (patch.name) x.name = patch.name.trim(); if (patch.phone !== undefined) x.phone = patch.phone; });
    await this.mutate(() => undefined, `Изменён профиль пользователя ${u.name}`);
  }
  async resetUserPassword(id: string): Promise<string> {
    this.requireRole('admin');
    const pw = tempPassword();
    const salt = newSalt();
    const hash = await hashPassword(pw, salt);
    const u = this.updateUser(id, (x) => { x.salt = salt; x.passHash = hash; x.mustChangePassword = true; x.failed = 0; x.lockUntil = undefined; });
    await this.mutate(() => undefined, `Сброшен пароль пользователя ${u.name} (выдан временный)`);
    return pw;
  }
  async createUser(p: { name: string; email: string; role: Role; phone?: string }): Promise<string> {
    this.requireRole('admin');
    const email = normEmail(p.email);
    if (p.name.trim().length < 2) throw new ApiError('Укажите имя');
    if (!validEmail(email)) throw new ApiError('Некорректный e-mail');
    const users = loadUsers();
    if (users.some((u) => u.email === email)) throw new ApiError('Пользователь с таким e-mail уже существует');
    const pw = tempPassword();
    const salt = newSalt();
    const u: User = { id: uid('u_'), wsId: this.state.ws!.id, email, name: p.name.trim(), role: p.role, phone: p.phone, passHash: await hashPassword(pw, salt), salt, status: 'active', createdAt: Date.now(), failed: 0, mustChangePassword: true };
    saveUsers([...users, u]);
    this.state.people = [...this.state.people, u];
    await this.mutate(() => undefined, `Создан пользователь ${u.name} (${ROLE_LABEL[u.role]})`);
    return pw;
  }
  async createInvite(role: Role, name?: string): Promise<Invite> {
    const me = this.requireRole('admin');
    const inv: Invite = { code: inviteCode(), role, name, createdAt: Date.now(), createdBy: me.id, expiresAt: Date.now() + 7 * 86400000 };
    await this.mutate((ws) => ws.invites.unshift(inv), `Создано приглашение ${inv.code} (${ROLE_LABEL[role]})`);
    return inv;
  }
  async revokeInvite(code: string) {
    this.requireRole('admin');
    await this.mutate((ws) => (ws.invites = ws.invites.filter((i) => i.code !== code)), `Отозвано приглашение ${code}`);
  }
  async impersonate(id: string) {
    const me = this.requireRole('admin');
    const target = this.state.people.find((u) => u.id === id);
    if (!target) throw new ApiError('Пользователь не найден');
    if (target.status !== 'active') throw new ApiError('Пользователь заблокирован');
    this.audit(`Вход в режиме просмотра как ${target.name} (поддержка)`);
    await this.persist();
    const s: Session = { userId: id, exp: Date.now() + 2 * 3600000, remember: false, impersonatedBy: me.id };
    saveSession(s);
    await this.openSession(s);
    this.emit();
  }
  async stopImpersonation() {
    const imp = this.state.impersonator;
    if (!imp) return;
    this.audit('Завершён режим просмотра');
    await this.persist();
    const s: Session = { userId: imp.id, exp: Date.now() + SESSION_H * 3600000, remember: false };
    saveSession(s);
    await this.openSession(s);
    this.emit();
  }
  async reassignStore(storeId: string, repId: string) {
    this.requireRole('admin', 'manager');
    const rep = this.state.people.find((p) => p.id === repId);
    await this.mutate((ws) => {
      const st = ws.stores.find((s) => s.id === storeId)!;
      st.repId = repId;
      ws.visits.filter((v) => v.storeId === storeId && v.status === 'planned').forEach((v) => (v.repId = repId));
    }, `Точка ${this.state.ws!.stores.find((s) => s.id === storeId)?.name} передана: ${rep?.name}`);
  }
  async updateCompany(name: string) {
    this.requireRole('admin');
    if (name.trim().length < 2) throw new ApiError('Название слишком короткое');
    await this.mutate((ws) => (ws.company = name.trim()), `Название компании изменено на «${name.trim()}»`);
  }
  async updateSettings(patch: Partial<Settings>) {
    this.requireRole('admin', 'manager');
    await this.mutate((ws) => Object.assign(ws.settings, patch), 'Изменены параметры правил');
  }
  async resetDemoWorkspace() {
    this.requireRole('admin');
    try { localStorage.removeItem(DEMO_WS_KEY); } catch { /* noop */ }
    clearSession();
    location.reload();
  }

  // ---------- visits ----------
  async checkIn(visitId: string, pos: { lat: number; lng: number; accuracy: number; simulated: boolean }, comment?: string): Promise<CheckIn> {
    const me = this.requireRole('rep', 'admin', 'manager');
    let ci!: CheckIn;
    await this.mutate((ws) => {
      const v = ws.visits.find((x) => x.id === visitId)!;
      const st = ws.stores.find((s) => s.id === v.storeId)!;
      const dist = haversine(st.lat, st.lng, pos.lat, pos.lng);
      const inZone = dist <= ws.settings.geofenceM;
      if (!inZone && !comment?.trim()) throw new ApiError('Вы вне геозоны точки — укажите причину');
      ci = { t: Date.now(), lat: pos.lat, lng: pos.lng, accuracy: Math.round(pos.accuracy), distance: Math.round(dist), inZone, simulated: pos.simulated, comment: comment?.trim() };
      v.checkIn = ci;
      v.status = 'in_progress';
      v.repId = v.repId || me.id;
      if (!inZone) v.flags.push('Вне геозоны');
      if (pos.accuracy > 100) v.flags.push('Низкая точность GPS');
      if (pos.simulated) v.flags.push('Демо-GPS');
    }, 'Начат визит (GPS-отметка)');
    return ci;
  }
  async adhocVisit(storeId: string): Promise<string> {
    const me = this.requireRole('rep');
    const id = uid('v_');
    await this.mutate((ws) => {
      ws.visits.push({ id, storeId, repId: me.id, date: this.state.today, status: 'planned', photoIds: [], reportDone: false, flags: ['Внеплановый визит'] });
    });
    return id;
  }
  async saveVisit(visitId: string, patch: Partial<Pick<Visit, 'stock' | 'freezerChecks' | 'competitor' | 'order' | 'comment' | 'photoIds'>>) {
    const ws = this.state.ws!;
    const v = ws.visits.find((x) => x.id === visitId)!;
    Object.assign(v, patch);
    if (patch.order) v.orderTotal = Object.entries(patch.order).reduce((a, [id, q]) => a + q * (ws.skus.find((s) => s.id === id)?.price ?? 0), 0);
    await this.persist();
    this.emit();
  }
  async addPhoto(visitId: string, dataUrl: string) {
    const id = uid('ph_');
    await photoStore.put(id, dataUrl);
    const v = this.state.ws!.visits.find((x) => x.id === visitId)!;
    await this.saveVisit(visitId, { photoIds: [...v.photoIds, id] });
    return id;
  }
  async finishVisit(visitId: string, withReport: boolean) {
    await this.mutate((ws) => {
      const v = ws.visits.find((x) => x.id === visitId)!;
      if (!v.checkIn) throw new ApiError('Визит не начат');
      if (withReport) {
        if (!v.stock || Object.keys(v.stock).length === 0) throw new ApiError('Заполните наличие продукции');
        const fzs = ws.freezers.filter((f) => f.storeId === v.storeId);
        if (fzs.length && (!v.freezerChecks || v.freezerChecks.length < fzs.length)) throw new ApiError('Проверьте оборудование');
        if (!v.photoIds.length) throw new ApiError('Добавьте хотя бы одно фото');
      }
      const wasDone = v.status === 'done';
      v.status = 'done';
      v.reportDone = withReport;
      if (!wasDone) {
        v.checkOutAt = Date.now();
        const mins = (v.checkOutAt - v.checkIn.t) / 60000;
        if (mins < 5 && !v.flags.includes('Короткий визит')) v.flags.push('Короткий визит');
      }
      const T = dayIndex(ws, this.state.today);
      if (v.order && !v.posted && v.date === this.state.today) {
        for (const [sku, q] of Object.entries(v.order)) if (q > 0 && ws.sales[v.storeId][sku]) ws.sales[v.storeId][sku][T] += q;
        v.posted = true;
      }
      for (const c of v.freezerChecks ?? []) {
        const f = ws.freezers.find((x) => x.id === c.freezerId);
        if (!f) continue;
        if (!c.present && f.status !== 'missing') {
          f.status = 'missing';
          f.history.push({ t: Date.now(), text: 'При визите оборудование не обнаружено' });
          v.flags.push('Оборудование отсутствует');
        } else if (c.present) {
          if (f.status === 'missing') { f.status = 'installed'; f.history.push({ t: Date.now(), text: 'Оборудование снова подтверждено на месте' }); }
          f.lastVerifiedAt = this.state.today;
          if (c.photoId) f.lastPhotoId = c.photoId;
          if (!c.working && f.status === 'installed') { f.history.push({ t: Date.now(), text: 'Представитель отметил: не работает' }); pushNotice(ws, { to: { role: 'manager' }, title: `Морозильник ${f.serial} не работает`, body: 'Отметка представителя при визите', kind: 'signal', link: `/equipment/${f.id}` }); }
        }
      }
    }, withReport ? 'Визит завершён с отчётом' : 'Визит завершён без отчёта');
  }

  // ---------- tasks & signals ----------
  canSeeDept(dept: Dept) {
    const r = this.state.user?.role;
    return r === 'admin' || r === 'manager' || r === dept;
  }
  async setTaskStatus(id: string, status: TaskStatus, comment?: string) {
    const me = this.me();
    await this.mutate((ws) => {
      const t = ws.tasks.find((x) => x.id === id)!;
      if (!this.canSeeDept(t.dept) && t.assigneeId !== me.id) throw new ApiError('Задача относится к другому подразделению');
      t.status = status;
      if (status === 'done') t.doneAt = Date.now();
      if (comment?.trim()) t.comments.push({ t: Date.now(), text: comment.trim(), by: me.name });
      t.comments.push({ t: Date.now(), text: `Статус: ${status === 'done' ? 'выполнена' : status === 'in_progress' ? 'в работе' : 'открыта'}`, by: me.name });
      if (t.signalId) {
        const s = ws.signals[t.signalId];
        if (s) {
          s.history.push({ t: Date.now(), text: `${DEPT_LABEL[t.dept]}: «${t.title}» — ${status === 'done' ? 'выполнено' : 'взято в работу'}${comment ? `. ${comment}` : ''}`, by: me.name });
          const all = s.taskIds.map((tid) => ws.tasks.find((x) => x.id === tid)!).filter(Boolean);
          if (all.length && all.every((x) => x.status === 'done') && (s.status === 'in_progress' || s.status === 'new')) {
            s.status = 'monitoring';
            s.monitorUntil = addDays(this.state.today, ws.settings.monitorDays);
            s.history.push({ t: Date.now(), text: `Все задачи выполнены. Контроль результата до ${s.monitorUntil}`, by: SYSTEM });
            pushNotice(ws, { to: { role: 'manager' }, title: 'Задачи по сигналу выполнены', body: s.title, kind: 'task', link: `/signals/${encodeURIComponent(s.id)}` });
          }
        }
      }
      if (status === 'done' && t.createdBy !== SYSTEM && t.createdBy !== me.id) pushNotice(ws, { to: { userId: t.createdBy }, title: 'Задача выполнена', body: t.title, kind: 'task', link: '/tasks' });
    }, `Задача «${this.state.ws!.tasks.find((x) => x.id === id)?.title}»: ${status}`);
  }
  async commentTask(id: string, text: string) {
    const me = this.me();
    await this.mutate((ws) => { ws.tasks.find((x) => x.id === id)!.comments.push({ t: Date.now(), text: text.trim(), by: me.name }); });
  }
  async createTask(p: { title: string; description: string; dept: Dept; storeId?: string; signalId?: string; assigneeId?: string }) {
    const me = this.requireRole('admin', 'manager');
    const t: Task = { id: uid('t_'), title: p.title.trim(), description: p.description.trim(), dept: p.dept, storeId: p.storeId, signalId: p.signalId, assigneeId: p.assigneeId, status: 'open', createdAt: Date.now(), dueAt: Date.now() + ({ warehouse: 24, accounting: 48, manager: 48, rep: 48 } as const)[p.dept] * 3600000, createdBy: me.id, comments: [] };
    if (!t.title) throw new ApiError('Укажите название задачи');
    await this.mutate((ws) => {
      ws.tasks.push(t);
      if (p.signalId && ws.signals[p.signalId]) {
        const s = ws.signals[p.signalId];
        s.taskIds.push(t.id);
        s.status = 'in_progress';
        s.history.push({ t: Date.now(), text: `Задача направлена: ${DEPT_LABEL[p.dept]} — «${t.title}»`, by: me.name });
      }
      pushNotice(ws, { to: p.assigneeId ? { userId: p.assigneeId } : { role: p.dept as Role }, title: 'Новая задача', body: t.title, kind: 'task', link: '/tasks' });
    }, `Создана задача «${t.title}» для подразделения «${DEPT_LABEL[p.dept]}»`);
  }
  async setSignalStatus(id: string, status: SignalStatus, comment: string) {
    const me = this.requireRole('admin', 'manager');
    await this.mutate((ws) => {
      const s: Signal = ws.signals[id];
      s.status = status;
      if (status === 'monitoring') s.monitorUntil = addDays(this.state.today, ws.settings.monitorDays);
      s.history.push({ t: Date.now(), text: `Статус: ${status}${comment ? ` — ${comment}` : ''}`, by: me.name });
      if (status === 'resolved' && s.type === 'temperature' && s.freezerId) {
        const f = ws.freezers.find((x) => x.id === s.freezerId)!;
        f.fault = false;
        ws.temps[f.id]?.push(-18.6);
        f.history.push({ t: Date.now(), text: 'Неисправность устранена, температура в норме' });
      }
    }, `Сигнал «${this.state.ws!.signals[id]?.title}»: ${status}`);
  }

  // ---------- equipment ----------
  async setFreezerStatus(id: string, status: FreezerStatus, note: string) {
    this.requireRole('admin', 'manager', 'warehouse');
    await this.mutate((ws) => {
      const f = ws.freezers.find((x) => x.id === id)!;
      f.status = status;
      if (status === 'warehouse' || status === 'written_off') f.storeId = null;
      if (status === 'installed') f.fault = false;
      f.history.push({ t: Date.now(), text: `${FREEZER_STATUS_LABEL[status]}${note ? `: ${note}` : ''}` });
    }, `Морозильник ${this.state.ws!.freezers.find((x) => x.id === id)?.serial}: ${FREEZER_STATUS_LABEL[status]}`);
  }
  async moveFreezer(id: string, storeId: string, note: string) {
    this.requireRole('admin', 'manager');
    await this.mutate((ws) => {
      const f: Freezer = ws.freezers.find((x) => x.id === id)!;
      const from = ws.stores.find((s) => s.id === f.storeId)?.name ?? 'склад';
      const to = ws.stores.find((s) => s.id === storeId)!;
      f.storeId = storeId;
      f.status = 'installed';
      f.program = undefined;
      f.installedAt = this.state.today;
      f.history.push({ t: Date.now(), text: `Перемещён: ${from} → ${to.name}${note ? `. ${note}` : ''}` });
      for (const s of Object.values(ws.signals)) if (s.freezerId === id && s.type === 'relocation' && s.status !== 'resolved') { s.status = 'resolved'; s.history.push({ t: Date.now(), text: `Решение: перенос в ${to.name}`, by: this.state.user!.name }); }
      ws.tasks.push({ id: uid('t_'), title: `Перевезти морозильник ${f.serial} в ${to.name}`, description: `Решение руководства о переносе. ${note}`, dept: 'warehouse', storeId, status: 'open', createdAt: Date.now(), dueAt: Date.now() + 72 * 3600000, createdBy: this.state.user!.id, comments: [] });
      pushNotice(ws, { to: { role: 'warehouse' }, title: 'Перевозка оборудования', body: `${f.serial}: ${from} → ${to.name}`, kind: 'task', link: '/tasks' });
    }, `Принято решение о переносе морозильника ${this.state.ws!.freezers.find((x) => x.id === id)?.serial}`);
  }
  async programUpdate(id: string, p: { checklist?: Partial<Record<NoSalesCause, boolean>>; advance?: boolean; action?: string }) {
    const me = this.me();
    await this.mutate((ws) => {
      const f = ws.freezers.find((x) => x.id === id)!;
      if (!f.program) f.program = { stage: 1, startedAt: this.state.today, checklist: {}, actions: [] };
      if (p.checklist) f.program.checklist = { ...f.program.checklist, ...p.checklist };
      if (p.action?.trim()) f.program.actions.push({ t: Date.now(), text: p.action.trim(), by: me.name });
      if (p.advance && f.program.stage < 4) {
        f.program.stage = (f.program.stage + 1) as 1 | 2 | 3 | 4;
        f.program.actions.push({ t: Date.now(), text: `Переход к этапу ${f.program.stage}: ${PROGRAM_STAGES[f.program.stage - 1]}`, by: me.name });
      }
    }, `Программа морозильника ${this.state.ws!.freezers.find((x) => x.id === id)?.serial} обновлена`);
  }

  // ---------- notices ----------
  myNotices() {
    const u = this.state.user;
    const ws = this.state.ws;
    if (!u || !ws) return [];
    return ws.notices.filter((n) => n.to.userId === u.id || n.to.role === u.role || (u.role === 'admin' && n.to.role === 'manager'));
  }
  async markRead(ids: string[]) {
    const u = this.me();
    const ws = this.state.ws!;
    let ch = false;
    for (const n of ws.notices) if (ids.includes(n.id) && !n.readBy.includes(u.id)) { n.readBy.push(u.id); ch = true; }
    if (ch) { await this.persist(); this.emit(); }
  }
}

export const hub = new Hub();

export function personName(id?: string) {
  if (!id) return '—';
  return hub.state.people.find((p) => p.id === id)?.name ?? 'Сотрудник';
}
export function repOf(storeId: string) {
  return hub.state.ws?.stores.find((s) => s.id === storeId)?.repId;
}
export function visitsToday(repId: string) {
  const ws = hub.state.ws!;
  const d = hub.state.today;
  return ws.visits.filter((v) => v.repId === repId && v.date === d);
}
export function nextVisitDate(storeId: string) {
  const ws = hub.state.ws!;
  const st = ws.stores.find((s) => s.id === storeId)!;
  for (let i = 0; i < 8; i++) {
    const d = addDays(hub.state.today, i);
    if (st.visitDays.includes(weekday(d))) return d;
  }
  return null;
}
export const daysSince = (d: string) => dayDiff(d, hub.state.today);
export { DEPT_LABEL };
