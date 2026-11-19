import { useMemo, useState } from 'react';
import { DEMO_DOMAIN, hub } from '../../api/hub';
import type { Role, Settings, User } from '../../domain/types';
import { ROLE_LABEL } from '../../domain/types';
import { fmtDateTime, relTime } from '../../lib/date';
import { Icon } from '../../ui/Icon';
import { Avatar, Card, Empty, Field, Kpi, Seg, Sheet, useAction, useHub, useToast } from '../../ui/kit';
import { PageHead } from './common';

const ROLES: Role[] = ['admin', 'manager', 'rep', 'warehouse', 'accounting'];

export function Admin() {
  const [tab, setTab] = useState<'users' | 'invites' | 'rules' | 'audit' | 'company'>('users');
  return (
    <>
      <PageHead title="Администрирование" sub="Пользователи компании, роли и доступ, приглашения, параметры правил и журнал аудита" />
      <div style={{ marginBottom: 16 }}>
        <Seg value={tab} onChange={setTab} options={[{ value: 'users', label: 'Пользователи' }, { value: 'invites', label: 'Приглашения' }, { value: 'rules', label: 'Правила' }, { value: 'audit', label: 'Журнал' }, { value: 'company', label: 'Компания' }]} />
      </div>
      {tab === 'users' && <Users />}
      {tab === 'invites' && <Invites />}
      {tab === 'rules' && <Rules />}
      {tab === 'audit' && <Audit />}
      {tab === 'company' && <Company />}
    </>
  );
}

function Users() {
  const s = useHub();
  const [q, setQ] = useState('');
  const [role, setRole] = useState<Role | ''>('');
  const [sel, setSel] = useState<string | null>(null);
  const [create, setCreate] = useState(false);
  const list = useMemo(() => s.people.filter((u) => (!role || u.role === role) && (!q || (u.name + u.email).toLowerCase().includes(q.toLowerCase()))).sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role) || a.name.localeCompare(b.name)), [s.people, q, role]);
  const user = s.people.find((u) => u.id === sel);
  return (
    <>
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <Kpi icon="people" label="Пользователей" value={String(s.people.length)} />
        <Kpi icon="check" color="var(--green)" label="Активны" value={String(s.people.filter((u) => u.status === 'active').length)} />
        <Kpi icon="lock" color="var(--red)" label="Заблокированы" value={String(s.people.filter((u) => u.status === 'blocked').length)} />
        <Kpi icon="person" color="var(--orange)" label="Представителей" value={String(s.people.filter((u) => u.role === 'rep').length)} />
      </div>
      <div className="row gap8 wrap" style={{ marginBottom: 12 }}>
        <div className="search"><Icon name="search" size={16} /><input placeholder="Имя или e-mail" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className="input sm" style={{ width: 'auto' }} value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label="Роль"><option value="">Все роли</option>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>
        <div className="grow" />
        <button className="btn primary" onClick={() => setCreate(true)}><Icon name="plus" size={16} />Добавить пользователя</button>
      </div>
      <Card pad0>
        <div className="table-wrap"><table className="t"><thead><tr><th>Пользователь</th><th>Роль</th><th className="hide-sm">Телефон</th><th className="hide-sm">Последний вход</th><th>Статус</th></tr></thead>
          <tbody>{list.map((u) => (
            <tr key={u.id} className="click" onClick={() => setSel(u.id)}>
              <td><div className="row gap8"><Avatar name={u.name} size="sm" /><div><b>{u.name}</b>{u.id === s.user!.id && <span className="badge blue" style={{ marginLeft: 6 }}>вы</span>}<div className="t-cap sec">{u.email}</div></div></div></td>
              <td>{ROLE_LABEL[u.role]}</td>
              <td className="hide-sm sec">{u.phone ?? '—'}</td>
              <td className="hide-sm sec">{u.lastLoginAt ? relTime(u.lastLoginAt) : 'не входил'}</td>
              <td>{u.status === 'blocked' ? <span className="badge red">Заблокирован</span> : u.lockUntil && u.lockUntil > Date.now() ? <span className="badge orange">Блок 15 мин</span> : u.mustChangePassword ? <span className="badge orange">Временный пароль</span> : <span className="badge green">Активен</span>}</td>
            </tr>
          ))}</tbody></table></div>
      </Card>
      <UserSheet user={user} onClose={() => setSel(null)} />
      <CreateUserSheet open={create} onClose={() => setCreate(false)} />
    </>
  );
}

function UserSheet({ user, onClose }: { user?: User; onClose: () => void }) {
  const s = useHub();
  const { run, busy } = useAction();
  const [pw, setPw] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ name: string; phone: string } | null>(null);
  if (!user) return null;
  const me = user.id === s.user!.id;
  const stores = s.ws!.stores.filter((x) => x.repId === user.id).length;
  return (
    <Sheet open={!!user} onClose={() => { setPw(null); setEdit(null); onClose(); }} title="Пользователь">
      <div className="col gap16">
        <div className="row gap16"><Avatar name={user.name} size="lg" /><div><div className="t-title3">{user.name}</div><div className="t-foot sec">{user.email}</div><div className="t-cap ter">создан {fmtDateTime(user.createdAt)}</div></div></div>
        {pw && <div className="ok-box"><div className="t-foot">Временный пароль — передайте сотруднику лично. При входе система попросит его сменить.</div><div className="code-big mt8">{pw}</div></div>}
        {edit ? (
          <div className="col gap12">
            <Field label="Имя"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Телефон"><input className="input" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
            <button className="btn primary block" disabled={busy} onClick={async () => { await run(() => hub.updateUserProfile(user.id, edit), 'Профиль обновлён'); setEdit(null); }}>Сохранить</button>
          </div>
        ) : (
          <div className="list">
            <div className="cell"><span className="cell-main sec">Телефон</span><span>{user.phone ?? '—'}</span></div>
            {user.role === 'rep' && <div className="cell"><span className="cell-main sec">Закреплено точек</span><span>{stores}</span></div>}
            <button className="cell" onClick={() => setEdit({ name: user.name, phone: user.phone ?? '' })}><span className="cell-main c-blue">Редактировать профиль</span></button>
          </div>
        )}
        <Field label="Роль и права доступа">
          <select className="input" value={user.role} disabled={me || busy} onChange={(e) => run(() => hub.setUserRole(user.id, e.target.value as Role), 'Роль изменена')}>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
          </select>
        </Field>
        {user.role === 'rep' && stores > 0 && <div className="hint">При смене роли представителя его точки останутся закреплёнными — передайте их другому сотруднику в карточке точки.</div>}
        {!me && (
          <div className="col gap8">
            <button className="btn lg block" disabled={busy} onClick={async () => { const p = await run(() => hub.resetUserPassword(user.id)); if (p) setPw(p); }}><Icon name="key" size={18} />Сбросить пароль</button>
            {user.status === 'active' && <button className="btn lg block" disabled={busy} onClick={() => run(() => hub.impersonate(user.id), `Просмотр как ${user.name}`)}><Icon name="eye" size={18} />Войти как пользователь (поддержка)</button>}
            <button className={`btn lg block ${user.status === 'active' ? 'danger' : 'success'}`} disabled={busy} onClick={() => run(() => hub.setUserBlocked(user.id, user.status === 'active'), user.status === 'active' ? 'Пользователь заблокирован' : 'Пользователь разблокирован')}>
              <Icon name="lock" size={18} />{user.status === 'active' ? 'Заблокировать доступ' : 'Разблокировать'}
            </button>
          </div>
        )}
        {me && <div className="info-box t-foot">Это ваша учётная запись. Сменить пароль можно в профиле.</div>}
      </div>
    </Sheet>
  );
}

function CreateUserSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { run, busy } = useAction();
  const [f, setF] = useState({ name: '', email: '', phone: '', role: 'rep' as Role });
  const [pw, setPw] = useState<string | null>(null);
  const close = () => { setPw(null); setF({ name: '', email: '', phone: '', role: 'rep' }); onClose(); };
  return (
    <Sheet open={open} onClose={close} title="Новый пользователь">
      {pw ? (
        <div className="col gap16">
          <div className="ok-box">Пользователь {f.name} создан. Временный пароль:</div>
          <div className="code-big">{pw}</div>
          <div className="hint">Логин — {f.email}. При первом входе потребуется сменить пароль.</div>
          <button className="btn primary lg block" onClick={close}>Готово</button>
        </div>
      ) : (
        <div className="col gap16">
          <Field label="Имя и фамилия"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="E-mail (логин)"><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Телефон"><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+7 7__ ___ __ __" /></Field>
          <Field label="Роль"><select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></Field>
          <button className="btn primary lg block" disabled={busy} onClick={async () => { const p = await run(() => hub.createUser(f)); if (p) setPw(p); }}>Создать</button>
        </div>
      )}
    </Sheet>
  );
}

function Invites() {
  const s = useHub();
  const toast = useToast();
  const { run, busy } = useAction();
  const [role, setRole] = useState<Role>('rep');
  const ws = s.ws!;
  const link = (code: string) => `${location.origin}${location.pathname}#/register?invite=1&code=${code}`;
  const copy = async (t: string) => { try { await navigator.clipboard.writeText(t); toast('Скопировано'); } catch { toast('Не удалось скопировать', true); } };
  return (
    <div className="grid g-2-1">
      <Card title="Активные приглашения" pad0>
        {ws.invites.length === 0 ? <Empty icon="link" title="Приглашений нет" text="Создайте код — сотрудник зарегистрируется сам с заданной ролью" /> : ws.invites.map((i) => {
          const used = !!i.usedBy;
          const expired = i.expiresAt < Date.now();
          return (
            <div key={i.code} className="cell">
              <div className="cell-main">
                <div className="cell-title" style={{ fontFamily: 'var(--mono)', letterSpacing: '.06em' }}>{i.code}</div>
                <div className="cell-sub">{ROLE_LABEL[i.role]} · {used ? `использован: ${s.people.find((p) => p.id === i.usedBy)?.name ?? ''}` : expired ? 'истёк' : `действует до ${fmtDateTime(i.expiresAt)}`}</div>
              </div>
              {!used && !expired && <button className="icon-btn" onClick={() => copy(link(i.code))} aria-label="Копировать ссылку"><Icon name="copy" size={16} /></button>}
              {!used && <button className="btn sm danger" disabled={busy} onClick={() => run(() => hub.revokeInvite(i.code), 'Приглашение отозвано')}>Отозвать</button>}
            </div>
          );
        })}
      </Card>
      <Card title="Пригласить сотрудника">
        <div className="col gap16">
          <Field label="Роль нового сотрудника"><select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></Field>
          <button className="btn primary lg block" disabled={busy} onClick={async () => { const i = await run(() => hub.createInvite(role), 'Код создан'); if (i) void copy(link(i.code)); }}>Создать код и скопировать ссылку</button>
          <div className="hint">Код одноразовый и действует 7 дней. Сотрудник открывает ссылку, вводит свои данные и сразу получает доступ с назначенной ролью. Новому представителю автоматически передаются 3 точки самого загруженного коллеги — перераспределите их при необходимости.</div>
          {ws.demo && <div className="info-box t-foot">В демо данные хранятся в этом браузере: зарегистрируйтесь по коду в этом же браузере (например, после выхода).</div>}
        </div>
      </Card>
    </div>
  );
}

const RULES: { k: keyof Settings; label: string; unit: string; step: number; hint: string; scale?: number }[] = [
  { k: 'geofenceM', label: 'Радиус геозоны визита', unit: 'м', step: 10, hint: 'Отметка дальше — визит помечается «вне геозоны» с обязательным комментарием' },
  { k: 'dropThreshold', label: 'Порог снижения продаж', unit: '%', step: 5, scale: 100, hint: '7 дней к средней неделе за 4 недели' },
  { k: 'zeroSalesDays', label: 'Дней без продаж через морозильник', unit: 'дн', step: 1, hint: 'Уведомление представителю и запуск программы' },
  { k: 'tempLimit', label: 'Порог температуры', unit: '°C', step: 1, hint: 'Норма ≤ −18 °C' },
  { k: 'tempHours', label: 'Длительность превышения', unit: 'ч', step: 1, hint: 'До создания сигнала' },
  { k: 'freezerMinRevenue', label: 'Мин. выручка морозильника за 30 дней', unit: '₸', step: 10000, hint: 'Ниже — оценка переноса после 8 недель программы' },
  { k: 'monitorDays', label: 'Контроль результата', unit: 'дн', step: 1, hint: 'Мониторинг после выполнения задач' },
  { k: 'seasonality', label: 'Коэффициент сезонности плана', unit: '×', step: 0.05, hint: 'Применяется к реалистичному плану месяца' },
];

export function Rules() {
  const s = useHub();
  const { run, busy } = useAction();
  const [v, setV] = useState<Settings>({ ...s.ws!.settings });
  return (
    <Card title="Параметры правил DairyHub">
      <div className="grid g2">
        {RULES.map((r) => (
          <Field key={r.k} label={`${r.label}, ${r.unit}`} hint={r.hint}>
            <input className="input" type="number" step={r.step} value={Math.round(v[r.k] * (r.scale ?? 1) * 100) / 100} onChange={(e) => setV({ ...v, [r.k]: Number(e.target.value) / (r.scale ?? 1) })} />
          </Field>
        ))}
      </div>
      <div className="row gap8 mt16"><button className="btn primary" disabled={busy} onClick={() => run(() => hub.updateSettings(v), 'Параметры сохранены, правила пересчитаны')}>Сохранить</button><button className="btn" onClick={() => setV({ ...s.ws!.settings })}>Отменить</button></div>
    </Card>
  );
}

function Audit() {
  const s = useHub();
  const [q, setQ] = useState('');
  const list = s.ws!.audit.filter((a) => !q || (a.text + a.by).toLowerCase().includes(q.toLowerCase())).slice(0, 200);
  return (
    <>
      <div className="search" style={{ marginBottom: 12 }}><Icon name="search" size={16} /><input placeholder="Поиск по журналу" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <Card pad0><div className="table-wrap"><table className="t"><thead><tr><th>Время</th><th>Пользователь</th><th>Действие</th></tr></thead><tbody>{list.map((a, i) => <tr key={i}><td className="sec" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(a.t)}</td><td style={{ whiteSpace: 'nowrap' }}>{a.by}</td><td>{a.text}</td></tr>)}</tbody></table></div></Card>
    </>
  );
}

function Company() {
  const s = useHub();
  const { run, busy } = useAction();
  const [name, setName] = useState(s.ws!.company);
  return (
    <div className="grid g2">
      <Card title="Компания">
        <div className="col gap16">
          <Field label="Название"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <button className="btn primary" disabled={busy || name === s.ws!.company} onClick={() => run(() => hub.updateCompany(name), 'Сохранено')}>Сохранить</button>
          <div className="t-foot sec">Точек: {s.ws!.stores.length} · морозильников: {s.ws!.freezers.length} · пользователей: {s.people.length}</div>
        </div>
      </Card>
      <Card title="Безопасность">
        <div className="col gap8 t-foot">
          <div className="row gap8"><Icon name="shield" size={16} className="c-green" />Пароли хранятся только в виде хеша PBKDF2-SHA256 (120 000 итераций, соль)</div>
          <div className="row gap8"><Icon name="lock" size={16} className="c-green" />5 неудачных попыток — блокировка входа на 15 минут</div>
          <div className="row gap8"><Icon name="clock" size={16} className="c-green" />Сессия 12 часов, «Запомнить меня» — 30 дней</div>
          <div className="row gap8"><Icon name="history" size={16} className="c-green" />Все административные действия и режим «войти как» пишутся в журнал</div>
        </div>
        {s.ws!.demo && s.user!.email.endsWith(DEMO_DOMAIN) && (
          <button className="btn danger block mt16" onClick={() => { if (confirm('Пересоздать демо-данные? Все изменения в демо будут потеряны.')) void hub.resetDemoWorkspace(); }}>Сбросить демо-данные</button>
        )}
      </Card>
    </div>
  );
}
