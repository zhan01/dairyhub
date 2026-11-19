import { useState } from 'react';
import { Link } from 'react-router-dom';
import { hub } from '../../api/hub';
import { ROLE_LABEL } from '../../domain/types';
import { Icon } from '../../ui/Icon';
import { Avatar, Card, Field, useAction, useHub } from '../../ui/kit';
import { PageHead } from './common';
import { NotificationSettings } from '../../ui/system';

export function PasswordForm() {
  const { run, busy } = useAction();
  const [f, setF] = useState({ old: '', n1: '', n2: '' });
  const [err, setErr] = useState('');
  return (
    <div className="col gap12">
      {err && <div className="error-box">{err}</div>}
      <Field label="Текущий пароль"><input className="input" type="password" autoComplete="current-password" value={f.old} onChange={(e) => setF({ ...f, old: e.target.value })} /></Field>
      <Field label="Новый пароль" hint="Не менее 8 символов, буквы и цифры"><input className="input" type="password" autoComplete="new-password" value={f.n1} onChange={(e) => setF({ ...f, n1: e.target.value })} /></Field>
      <Field label="Повторите новый пароль"><input className="input" type="password" autoComplete="new-password" value={f.n2} onChange={(e) => setF({ ...f, n2: e.target.value })} /></Field>
      <button className="btn primary" disabled={busy} onClick={async () => {
        setErr('');
        if (f.n1 !== f.n2) { setErr('Пароли не совпадают'); return; }
        const ok = await run(() => hub.changePassword(f.old, f.n1).then(() => true), 'Пароль изменён');
        if (ok) setF({ old: '', n1: '', n2: '' });
      }}>Сменить пароль</button>
    </div>
  );
}

export function Profile() {
  const s = useHub();
  const u = s.user!;
  return (
    <>
      <PageHead title="Профиль" />
      {u.mustChangePassword && <div className="error-box" style={{ marginBottom: 16 }}>Вы вошли с временным паролем. Установите собственный пароль.</div>}
      <div className="grid g2">
        <Card>
          <div className="row gap16"><Avatar name={u.name} size="lg" /><div><div className="t-title2">{u.name}</div><div className="t-sub sec">{ROLE_LABEL[u.role]} · {s.ws!.company}</div><div className="t-foot sec">{u.email}</div></div></div>
          <div className="col gap8 mt16">
            {u.role === 'admin' && <Link to="/app/admin" className="btn block"><Icon name="shield" size={16} />Администрирование</Link>}
            <Link to="/" className="btn block"><Icon name="info" size={16} />О проекте DairyHub</Link>
            <button className="btn danger block" onClick={() => hub.logout()}><Icon name="logout" size={16} />Выйти</button>
          </div>
        </Card>
        <Card title="Смена пароля"><PasswordForm /></Card>
        <Card title="Каналы уведомлений" pad0><div style={{ padding: '0 0 4px' }}><NotificationSettings /></div></Card>
      </div>
    </>
  );
}
