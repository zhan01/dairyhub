import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { hub, personName } from '../../api/hub';
import type { Dept, Task } from '../../domain/types';
import { DEPT_LABEL } from '../../domain/types';
import { fmtDateTime, relTime } from '../../lib/date';
import { Icon } from '../../ui/Icon';
import { Card, Empty, Field, Seg, Sheet, useAction, useHub } from '../../ui/kit';
import { PageHead, TaskLine, storeName, taskState } from './common';
import { NewTaskSheet } from './Signals';
import { exportTable } from '../../lib/exporter';
import { compressImage, photoStore } from '../../api/storage';
import { useEffect, useRef } from 'react';

export function Tasks() {
  const s = useHub();
  const ws = s.ws!;
  const role = s.user!.role;
  const isMgr = role === 'admin' || role === 'manager';
  const [dept, setDept] = useState<Dept | 'all'>(isMgr ? 'all' : (role as Dept));
  const [view, setView] = useState<'open' | 'done'>('open');
  const [task, setTask] = useState<string | null>(null);
  const [create, setCreate] = useState(false);
  const list = useMemo(() => ws.tasks
    .filter((t) => (isMgr ? dept === 'all' || t.dept === dept : t.dept === role))
    .filter((t) => (view === 'open' ? t.status !== 'done' : t.status === 'done'))
    .sort((a, b) => (view === 'open' ? a.dueAt - b.dueAt : (b.doneAt ?? 0) - (a.doneAt ?? 0))), [ws, dept, view, role, isMgr, s.version]);
  const groups = view === 'open' ? [
    { k: 'overdue', t: 'Просрочено', items: list.filter((t) => t.dueAt < Date.now()) },
    { k: 'progress', t: 'В работе', items: list.filter((t) => t.dueAt >= Date.now() && t.status === 'in_progress') },
    { k: 'open', t: 'Новые', items: list.filter((t) => t.dueAt >= Date.now() && t.status === 'open') },
  ] : [{ k: 'done', t: 'Выполнено', items: list }];

  return (
    <>
      <PageHead title="Задачи" sub={isMgr ? 'Межотдельные задачи, созданные DairyHub и руководителями, с контролем SLA' : `Задачи подразделения «${DEPT_LABEL[role as Dept]}»`} actions={<><button className="btn" onClick={() => exportTable('dairyhub-zadachi', ['Создана', 'Задача', 'Подразделение', 'Исполнитель', 'Точка', 'Срок', 'Статус', 'Выполнена', 'Последний комментарий'], list.map((t) => [fmtDateTime(t.createdAt), t.title, DEPT_LABEL[t.dept], t.assigneeId ? personName(t.assigneeId) : '', t.storeId ? storeName(t.storeId) : '', fmtDateTime(t.dueAt), t.rejected ? 'Гипотеза отклонена' : taskState(t).label, t.doneAt ? fmtDateTime(t.doneAt) : '', t.comments[t.comments.length - 1]?.text ?? '']))}><Icon name="doc" size={16} />Excel</button>{isMgr && <button className="btn primary" onClick={() => setCreate(true)}><Icon name="plus" size={16} />Новая задача</button>}</>} />
      <div className="row gap8 wrap" style={{ marginBottom: 16 }}>
        <Seg value={view} onChange={setView} options={[{ value: 'open', label: 'Открытые' }, { value: 'done', label: 'Выполненные' }]} />
        {isMgr && <Seg value={dept} onChange={setDept} options={[{ value: 'all', label: 'Все' }, { value: 'warehouse', label: 'Склад' }, { value: 'accounting', label: 'Бухгалтерия' }, { value: 'manager', label: 'Руководитель' }, { value: 'rep', label: 'Представители' }]} />}
      </div>
      {list.length === 0 ? <Card><Empty icon="checklist" title={view === 'open' ? 'Открытых задач нет' : 'Пока ничего не выполнено'} /></Card> : groups.filter((g) => g.items.length).map((g) => (
        <div key={g.k}>
          <div className="group-title">{g.t} · {g.items.length}</div>
          <div className="list">{g.items.map((t) => <TaskLine key={t.id} t={t} onClick={() => setTask(t.id)} />)}</div>
        </div>
      ))}
      <TaskSheet id={task} onClose={() => setTask(null)} />
      <NewTaskSheet open={create} onClose={() => setCreate(false)} />
    </>
  );
}

export function TaskSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const s = useHub();
  const t: Task | undefined = s.ws?.tasks.find((x) => x.id === id);
  const [c, setC] = useState('');
  const { run, busy } = useAction();
  if (!t) return null;
  const st = taskState(t);
  const sig = t.signalId ? s.ws!.signals[t.signalId] : undefined;
  const can = hub.canSeeDept(t.dept) || t.assigneeId === s.user!.id;
  const base = s.user!.role === 'rep' ? '/rep' : '/app';
  const act = async (status: Task['status']) => {
    if (status === 'done' && !c.trim() && t.dept !== 'rep') { await run(() => Promise.reject(new Error('Опишите, что сделано — это увидит руководитель'))); return; }
    const r = await run(() => hub.setTaskStatus(t.id, status, c).then(() => true), status === 'done' ? 'Задача выполнена' : 'Задача в работе');
    if (r) { setC(''); if (status === 'done') onClose(); }
  };
  return (
    <Sheet open={!!id} onClose={onClose} title="Задача">
      <div className="col gap16">
        <div>
          <div className="row gap4 wrap"><span className={`badge ${st.cls}`}>{st.label}</span><span className="badge blue">{DEPT_LABEL[t.dept]}</span></div>
          <div className="t-title3 mt8">{t.title}</div>
          <div className="t-sub sec mt8" style={{ whiteSpace: 'pre-wrap' }}>{t.description}</div>
        </div>
        <div className="list">
          {t.storeId && <div className="cell"><span className="cell-main sec">Точка</span><span>{storeName(t.storeId)}</span></div>}
          <div className="cell"><span className="cell-main sec">Исполнитель</span><span>{t.assigneeId ? personName(t.assigneeId) : DEPT_LABEL[t.dept]}</span></div>
          <div className="cell"><span className="cell-main sec">Создана</span><span>{t.createdBy === 'DairyHub' ? 'DairyHub, автоматически' : personName(t.createdBy)} · {relTime(t.createdAt)}</span></div>
          <div className="cell"><span className="cell-main sec">Срок (SLA)</span><span>{fmtDateTime(t.dueAt)}</span></div>
          {sig && s.user!.role !== 'rep' && <Link className="cell" to={`${base}/signals/${encodeURIComponent(sig.id)}`} onClick={onClose}><span className="cell-main sec">Основание</span><span className="c-blue ellipsis" style={{ maxWidth: 260 }}>{sig.title}</span><Icon name="chevR" size={16} className="chev" /></Link>}
        </div>
        {t.comments.length > 0 && (
          <div className="col gap8">
            {t.comments.map((x, i) => <div key={i} className="t-foot"><b>{x.by}</b> <span className="ter">· {relTime(x.t)}</span><div>{x.text}</div></div>)}
          </div>
        )}
        {can && t.status !== 'done' && (
          <>
            <Field label="Комментарий / результат"><textarea className="input" value={c} onChange={(e) => setC(e.target.value)} placeholder="Например: внеочередная поставка отгружена, машина 14:30" /></Field>
            <div className="row gap8">
              {t.status === 'open' && <button className="btn lg grow" disabled={busy} onClick={() => act('in_progress')}>Взять в работу</button>}
              <button className="btn success lg grow" disabled={busy} onClick={() => act('done')}>Выполнено</button>
            </div>
          </>
        )}
        {can && t.status !== 'done' && c.trim() && <button className="btn plain" onClick={async () => { await run(() => hub.commentTask(t.id, c), 'Комментарий добавлен'); setC(''); }}>Только добавить комментарий</button>}
        {can && t.status !== 'done' && t.signalId && <button className="btn danger block" disabled={busy} onClick={async () => { const r = await run(() => hub.rejectTask(t.id, c).then(() => true), 'Гипотеза отклонена, руководитель уведомлён'); if (r) { setC(''); onClose(); } }}>Причина не подтвердилась</button>}
        {can && t.status !== 'done' && t.signalId && <div className="hint" style={{ marginTop: -8 }}>Опишите в комментарии, что проверили — руководитель увидит это в сигнале.</div>}
        <Attachments task={t} can={can} />
        {!can && <div className="info-box t-foot">Задача относится к другому подразделению — доступен только просмотр.</div>}
      </div>
    </Sheet>
  );
}

function Thumb({ id }: { id: string }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => { void photoStore.get(id).then(setSrc); }, [id]);
  return src ? <a href={src} target="_blank" rel="noreferrer"><img src={src} alt="Вложение" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 12 }} /></a> : null;
}

function Attachments({ task, can }: { task: Task; can: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const { run, busy } = useAction();
  const list = task.attachments ?? [];
  if (!list.length && !can) return null;
  return (
    <div>
      <div className="field-label" style={{ marginBottom: 6 }}>Вложения</div>
      <div className="row gap8 wrap">
        {list.map((id) => <Thumb key={id} id={id} />)}
        {can && (
          <>
            <input ref={input} type="file" accept="image/*" hidden onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) await run(async () => hub.addTaskAttachment(task.id, await compressImage(f)), 'Вложение добавлено');
            }} />
            <button className="photo-add" style={{ width: 72, height: 72 }} disabled={busy} onClick={() => input.current?.click()} aria-label="Добавить фото"><Icon name="camera" size={22} /></button>
          </>
        )}
      </div>
    </div>
  );
}
