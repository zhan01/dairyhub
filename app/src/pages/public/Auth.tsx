import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { DEMO_ACCOUNTS, DEMO_PASSWORD, hub, passwordProblems } from '../../api/hub';
import { ROLE_LABEL } from '../../domain/types';
import { Icon, Logo } from '../../ui/Icon';
import { Avatar, Field, Seg, Switch, useHub } from '../../ui/kit';

function useRedirectIfLogged() {
  const s = useHub();
  const nav = useNavigate();
  useEffect(() => {
    if (s.ready && s.user) nav(s.user.role === 'rep' ? '/rep' : '/app', { replace: true });
  }, [s.ready, s.user, nav]);
}

function Brand() {
  return (
    <Link to="/" className="row gap8" style={{ justifyContent: 'center', color: 'var(--label)', marginBottom: 24 }}>
      <Logo size={44} />
      <span className="t-title1">DairyHub</span>
    </Link>
  );
}

export function Login() {
  const [sp] = useSearchParams();
  const auto = sp.get('demo');
  const to = sp.get('to');
  const s = useHub();
  const navTo = useNavigate();
  useEffect(() => {
    if (!s.ready) return;
    if (s.user) { navTo(to && /^\/(app|rep)(\/|$)/.test(to) ? to : s.user.role === 'rep' ? '/rep' : '/app', { replace: true }); return; }
    const acc = DEMO_ACCOUNTS.find((a) => a.role === auto);
    if (acc) void hub.login(acc.email, DEMO_PASSWORD, false).catch(() => undefined);
  }, [s.ready, s.user, auto, to, navTo]);
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const go = async (e?: FormEvent, em = email, p = pw) => {
    e?.preventDefault();
    setErr('');
    if (!em.trim() || !p) { setErr('Введите e-mail и пароль'); return; }
    setBusy(true);
    try { await hub.login(em, p, remember); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card fade-in">
        <Brand />
        <form className="card col gap16" onSubmit={go} noValidate>
          <div>
            <div className="t-title2">Вход</div>
            <div className="t-foot sec mt4">Корпоративная учётная запись сотрудника</div>
          </div>
          {err && <div className="error-box" role="alert">{err}</div>}
          <Field label="E-mail">
            <input className="input" type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.kz" />
          </Field>
          <Field label="Пароль">
            <div style={{ position: 'relative' }}>
              <input className="input" type={show ? 'text' : 'password'} autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} style={{ paddingRight: 48 }} />
              <button type="button" className="icon-btn" style={{ position: 'absolute', right: 6, top: 6, background: 'none' }} onClick={() => setShow(!show)} aria-label="Показать пароль"><Icon name="eye" size={18} /></button>
            </div>
          </Field>
          <div className="row between">
            <span className="t-sub">Запомнить меня на 30 дней</span>
            <Switch checked={remember} onChange={setRemember} label="Запомнить меня" />
          </div>
          <button className="btn primary lg block" disabled={busy || !s.ready}>{busy ? 'Проверка…' : 'Войти'}</button>
          <div className="t-foot sec" style={{ textAlign: 'center' }}>
            Забыли пароль? Обратитесь к администратору компании — он выдаст временный пароль.
          </div>
        </form>

        <div className="group-title" style={{ marginTop: 28 }}>Демо-доступ для экспертов · пароль <span className="kbd">{DEMO_PASSWORD}</span></div>
        <div className="demo-acc">
          {DEMO_ACCOUNTS.map((a) => (
            <button key={a.email} type="button" disabled={busy || !s.ready} onClick={() => { setEmail(a.email); setPw(DEMO_PASSWORD); void go(undefined, a.email, DEMO_PASSWORD); }}>
              <Avatar name={a.name} size="sm" />
              <span style={{ minWidth: 0 }}>
                <div className="t-foot bold">{ROLE_LABEL[a.role]}</div>
                <div className="t-cap sec ellipsis">{a.role === 'rep' ? 'мобильное приложение' : a.name}</div>
              </span>
            </button>
          ))}
        </div>
        <div className="t-foot sec mt16" style={{ textAlign: 'center' }}>
          Нет аккаунта? <Link to="/register">Зарегистрировать компанию</Link> или <Link to="/register?invite=1">войти по приглашению</Link>
        </div>
      </div>
    </div>
  );
}

function PwMeter({ pw }: { pw: string }) {
  if (!pw) return null;
  const probs = passwordProblems(pw);
  const strong = !probs.length && pw.length >= 12 && /[^A-Za-zА-Яа-я0-9]/.test(pw);
  const level = probs.length ? 1 : strong ? 3 : 2;
  const color = ['', 'var(--red)', 'var(--orange)', 'var(--green)'][level];
  return (
    <div className="col gap4">
      <div className="steps">{[1, 2, 3].map((i) => <i key={i} style={{ background: i <= level ? color : undefined }} />)}</div>
      <div className="hint" style={{ color: probs.length ? 'var(--red)' : undefined }}>{probs.length ? `Нужно: ${probs.join(', ')}` : strong ? 'Надёжный пароль' : 'Допустимый пароль — для надёжности 12+ символов и спецсимвол'}</div>
    </div>
  );
}

export function Register() {
  useRedirectIfLogged();
  const [sp] = useSearchParams();
  const [mode, setMode] = useState<'company' | 'invite'>(sp.get('invite') ? 'invite' : 'company');
  const [f, setF] = useState({ company: '', name: '', email: '', password: '', password2: '', code: sp.get('code') ?? '' });
  const [agree, setAgree] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    if (f.password !== f.password2) { setErr('Пароли не совпадают'); return; }
    if (!agree) { setErr('Необходимо согласие на обработку персональных данных'); return; }
    setBusy(true);
    try {
      if (mode === 'company') await hub.registerCompany(f);
      else {
        if (!f.code.trim()) throw new Error('Введите код приглашения');
        await hub.joinByInvite(f);
      }
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card fade-in" style={{ maxWidth: 460 }}>
        <Brand />
        <form className="card col gap16" onSubmit={submit} noValidate>
          <div>
            <div className="t-title2">Регистрация</div>
            <div className="t-foot sec mt4">{mode === 'company' ? 'Создайте рабочее пространство компании — вы станете его администратором.' : 'Присоединитесь к компании по коду, который выдал администратор.'}</div>
          </div>
          <Seg full value={mode} onChange={setMode} options={[{ value: 'company', label: 'Новая компания' }, { value: 'invite', label: 'По приглашению' }]} />
          {err && <div className="error-box" role="alert">{err}</div>}
          {mode === 'company' ? (
            <Field label="Название компании"><input className="input" value={f.company} onChange={set('company')} placeholder="ТОО «Молочная компания»" autoComplete="organization" /></Field>
          ) : (
            <Field label="Код приглашения" hint="Формат XXXX-XXXX, действует 7 дней"><input className="input" value={f.code} onChange={set('code')} placeholder="ABCD-1234" style={{ fontFamily: 'var(--mono)', letterSpacing: '.08em', textTransform: 'uppercase' }} /></Field>
          )}
          <Field label="Имя и фамилия"><input className="input" value={f.name} onChange={set('name')} autoComplete="name" /></Field>
          <Field label="Рабочий e-mail"><input className="input" type="email" value={f.email} onChange={set('email')} autoComplete="email" inputMode="email" /></Field>
          <Field label="Пароль"><input className="input" type="password" value={f.password} onChange={set('password')} autoComplete="new-password" /></Field>
          <PwMeter pw={f.password} />
          <Field label="Повторите пароль"><input className="input" type="password" value={f.password2} onChange={set('password2')} autoComplete="new-password" /></Field>
          <label className="check t-foot">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ width: 20, height: 20, accentColor: 'var(--blue)' }} />
            <span>Согласен на сбор и обработку персональных данных в соответствии с Законом РК «О персональных данных и их защите»</span>
          </label>
          <button className="btn primary lg block" disabled={busy}>{busy ? 'Создаём пространство…' : mode === 'company' ? 'Создать компанию' : 'Присоединиться'}</button>
          {mode === 'company' && <div className="info-box t-foot">Пространство будет заполнено демонстрационными данными (60 точек, 6 представителей, морозильники, поставки), чтобы вы сразу увидели работу аналитики. Данные помечены как демо.</div>}
        </form>
        <div className="t-foot sec mt16" style={{ textAlign: 'center' }}>Уже есть аккаунт? <Link to="/login">Войти</Link></div>
      </div>
    </div>
  );
}
