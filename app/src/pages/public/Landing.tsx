import { Link } from 'react-router-dom';
import { Icon, Logo } from '../../ui/Icon';
import { PlanRings } from '../../ui/charts';
import { useHub } from '../../ui/kit';

export const REPO_URL = 'https://github.com/zhan01/dairyhub';

const PROBLEMS = [
  { ic: 'pin', c: 'var(--red)', t: 'Пропущенные посещения', d: 'GPS-подтверждение визитов, фиксация времени, электронные отчёты, уведомления и анализ нагрузки маршрутов.' },
  { ic: 'target', c: 'var(--orange)', t: 'План выполняется на 50%', d: 'Реалистичный план по каждой точке, потенциал, задолженности, задержки поставок и премии за 80 / 100 / 120%.' },
  { ic: 'trendDown', c: 'var(--indigo)', t: 'Снижение продаж сотрудника', d: 'Сравнение периодов, анализ по товарам, визитам, остаткам, поставкам и конкурентам. Авто-сигнал при падении на 30%.' },
  { ic: 'freezer', c: 'var(--teal)', t: 'Нет оборудования в магазине', d: 'Единая база морозильников, закрепление за точками, фото, GPS и контроль ремонта и замены.' },
  { ic: 'snow', c: 'var(--blue)', t: 'Морозильник без продаж', d: 'Диагностика по 6 причинам, 4 этапа восстановления, уведомление через 3 дня без продаж и оценка переноса.' },
];
const CHAIN = [
  ['Обнаружение', 'Продажи кефира в точке упали на 45%'],
  ['Анализ', 'Визиты, остатки на полке, поставки, долг, цены'],
  ['Причина', 'Две поставки с задержкой и недогрузом'],
  ['Задача', 'Складу — с SLA 24 часа'],
  ['Устранение', 'Внеочередная поставка, отметка в системе'],
  ['Контроль', '14 дней мониторинга восстановления продаж'],
];
const BUDGET: [string, number][] = [
  ['Разработка сайта и приложения', 9], ['GPS и интеграции', 3], ['Датчики и оборудование', 4], ['Серверы и безопасность', 2], ['Тестирование и внедрение', 3], ['Обучение и поддержка', 2], ['Маркетинговые инструменты и стимулирование продаж', 2],
];
const ROADMAP = [
  ['Месяц 1', 'Анализ требований и техническое задание'],
  ['Месяц 2', 'Разработка мобильного сайта и веб-панели'],
  ['Месяц 3', 'База данных, аналитика и уведомления'],
  ['Месяц 4', 'Интеграция GPS и датчиков, тестирование'],
  ['Месяц 5', 'Пилотное внедрение и исправление ошибок'],
  ['Месяц 6', 'Обучение сотрудников и полноценный запуск'],
];

export function Landing() {
  const s = useHub();
  const appLink = s.user ? (s.user.role === 'rep' ? '/rep' : '/app') : '/login';
  return (
    <div className="landing">
      <nav className="l-nav glass">
        <Link to="/" className="row gap8" style={{ color: 'var(--label)' }}><Logo size={28} /><b className="t-headline">DairyHub</b></Link>
        <div className="row gap8">
          <a className="btn plain hide-sm" href="#problems">Проблемы</a>
          <a className="btn plain hide-sm" href="#how">Как работает</a>
          <a className="btn plain hide-sm" href="#finance">Бюджет</a>
          {s.user ? <Link className="btn primary sm" to={appLink}>Открыть DairyHub</Link> : <><Link className="btn sm" to="/login">Войти</Link><Link className="btn primary sm" to="/register">Регистрация</Link></>}
        </div>
      </nav>

      <header className="l-hero fade-in">
        <div className="badge blue" style={{ marginBottom: 20 }}>Платформа управления торговой командой</div>
        <h1>Не просто контроль.<br /><span className="grad">Причины и решения.</span></h1>
        <p>DairyHub объединяет торговых представителей, руководителей, склад и бухгалтерию молочной компании. Система находит отклонения, анализирует их возможные причины и направляет задачу тому, кто может решить проблему.</p>
        <div className="row gap8 mt32" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link className="btn primary lg" to={appLink}>Открыть демо</Link>
          <a className="btn lg" href="./DairyHub-presentation.pdf" target="_blank" rel="noreferrer"><Icon name="doc" size={18} />Презентация (PDF)</a>
        </div>
        <div className="row gap8 mt16" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link className="btn sm" to="/login?demo=manager">Демо: руководитель</Link>
          <Link className="btn sm" to="/login?demo=rep">Демо: представитель</Link>
          <Link className="btn sm" to="/login?demo=warehouse">Демо: склад</Link>
          <Link className="btn sm" to="/login?demo=admin">Демо: администратор</Link>
        </div>
      </header>

      <section style={{ padding: '24px 20px 0', maxWidth: 1160, margin: '0 auto' }}>
        <div className="row gap24" style={{ justifyContent: 'center', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="mac hide-sm" style={{ flex: '1 1 600px', maxWidth: 760 }}>
            <div className="mac-screen" style={{ padding: 18, display: 'grid', gap: 12, gridTemplateColumns: '150px 1fr' }}>
              <div className="col gap8">
                {['Обзор', 'Сигналы', 'Задачи', 'Команда', 'Точки', 'Оборудование'].map((x, i) => <div key={x} className="nav-item" style={{ height: 30, fontSize: 13, ...(i === 1 ? { background: 'var(--blue)', color: '#fff' } : {}) }}>{x}</div>)}
              </div>
              <div className="col gap8">
                <div className="grid g3" style={{ gap: 8 }}>
                  {[['Выполнение плана', '93%', 'var(--green)'], ['Визиты сегодня', '18 / 27', 'var(--blue)'], ['Открытые сигналы', '12', 'var(--red)']].map(([a, b, c]) => <div key={a} className="card" style={{ padding: 12 }}><div className="t-cap sec">{a}</div><div className="t-title3" style={{ color: c }}>{b}</div></div>)}
                </div>
                {[['high', 'Маркет «Береке»: продажи −76%', 'Бухгалтерия · отгрузки заблокированы'], ['high', 'Супермаркет «Самал»: кефир −50%', 'Склад · задержки поставок'], ['medium', 'Нет продаж мороженого 4 дня', 'Представитель · диагностика']].map(([sv, t, d]) => (
                  <div key={t} className="card row gap8" style={{ padding: 12 }}><span className={`sev ${sv}`} style={{ width: 26, height: 26 }}><Icon name="alert" size={14} /></span><div><div className="t-foot bold">{t}</div><div className="t-cap sec">{d}</div></div></div>
                ))}
              </div>
            </div>
          </div>
          <div className="device">
            <div className="device-screen" style={{ padding: '36px 14px 14px' }}>
              <div className="t-title2">Сегодня</div>
              <div className="t-foot sec">Маршрут · 6 точек</div>
              <div className="card row gap16 mt12" style={{ padding: 14 }}>
                <PlanRings value={0.93} size={84} />
                <div className="t-foot"><div className="sec">План месяца</div><div className="t-title2">93%</div><div className="sec">до уровня 2: 7%</div></div>
              </div>
              <div className="list mt12">
                {[['Супермаркет «Самал»', 'Выполнен · 09:41', 'var(--green)'], ['Минимаркет «Таң»', 'Следующий · 0,4 км', 'var(--blue)'], ['Магазин «Арай»', 'По плану · 12:00', 'var(--gray)']].map(([a, b, c]) => (
                  <div key={a} className="cell"><span className="dot" style={{ background: c, width: 10, height: 10 }} /><div className="cell-main"><div className="t-foot bold">{a}</div><div className="t-cap sec">{b}</div></div></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="l-sec" id="problems">
        <h2 className="l-h2">Пять проблем — одна платформа.</h2>
        <p className="l-lead">Каждое решение опирается на данные, которые компания уже собирает: визиты, заказы, поставки, задолженность и оборудование.</p>
        <div className="grid g3 mt32">
          {PROBLEMS.map((p, i) => (
            <div key={p.t} className="tile">
              <div className="tile-ic" style={{ background: p.c }}><Icon name={p.ic} size={22} /></div>
              <div className="t-cap sec mt12">Проблема {i + 1}</div>
              <h3 style={{ marginTop: 2 }}>{p.t}</h3>
              <p>{p.d}</p>
            </div>
          ))}
          <div className="tile" style={{ background: 'linear-gradient(135deg, #0a84ff, #5e5ce6)', color: '#fff' }}>
            <div className="tile-ic" style={{ background: 'rgba(255,255,255,.2)' }}><Icon name="sparkles" size={22} /></div>
            <h3>Помогает решать, а не обвиняет</h3>
            <p style={{ color: 'rgba(255,255,255,.85)' }}>Система показывает «возможные причины» с доказательствами и учитывает внешние факторы (поставки, долг) в оценке сотрудника.</p>
          </div>
        </div>
      </section>

      <section style={{ background: 'var(--bg)' }}>
        <div className="l-sec" id="how">
          <h2 className="l-h2">Главная особенность — связка подразделений.</h2>
          <p className="l-lead">Пример реального сценария из демо-данных: отклонение обнаружено, причина найдена, задача ушла на склад, результат под контролем.</p>
          <div className="chain mt32">
            {CHAIN.map(([t, d], i) => (
              <div key={t} className="chain-step"><div className="n">{i + 1}</div><div className="t-headline">{t}</div><div className="t-foot sec mt4">{d}</div></div>
            ))}
          </div>
          <div className="grid g2 mt32">
            <div className="tile" style={{ background: 'var(--bg-2)' }}>
              <div className="tile-ic" style={{ background: 'var(--green)' }}><Icon name="location" size={22} /></div>
              <h3>Мобильный сайт представителя</h3>
              <p>Маршрут дня, GPS-отметка с геозоной 150 м, время визита, наличие продукции, проверка морозильника с фото, конкуренты, заказ, напоминания о незаполненных отчётах и задачи.</p>
            </div>
            <div className="tile" style={{ background: 'var(--bg-2)' }}>
              <div className="tile-ic" style={{ background: 'var(--blue)' }}><Icon name="chart" size={22} /></div>
              <h3>Веб-панель руководителя</h3>
              <p>Мониторинг команды, планы и премии, аналитика по дням, неделям и месяцам, пропущенные визиты, оборудование и датчики, сигналы с причинами и контроль задач склада и бухгалтерии.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="l-sec" id="finance">
        <h2 className="l-h2">30 млн ₸ и 6 месяцев.</h2>
        <p className="l-lead">Финансовая модель предварительная и требует подтверждения коммерческими предложениями поставщиков.</p>
        <div className="grid g-2-1 mt32">
          <div className="list">
            {BUDGET.map(([t, v]) => (
              <div key={t} className="cell"><div className="cell-main">{t}<div className="bar mt4"><i style={{ width: `${(v / 9) * 100}%` }} /></div></div><b className="num" style={{ width: 70, textAlign: 'right' }}>{v} млн ₸</b></div>
            ))}
            <div className="cell"><div className="cell-main bold">Запланированные расходы</div><b>25 млн ₸</b></div>
            <div className="cell"><div className="cell-main">Резервный фонд <span className="sec">· 16,7%</span></div><b>5 млн ₸</b></div>
            <div className="cell" style={{ background: 'var(--fill-4)' }}><div className="cell-main t-headline">Итого</div><b className="t-headline">30 млн ₸</b></div>
          </div>
          <div className="col">
            <div className="tile">
              <div className="t-cap sec">Внутри общего бюджета</div>
              <div className="t-title1 mt4">2,05 млн ₸</div>
              <p className="mt8">Направление «Морозильник без продаж»: датчики для выбранных морозильников, материалы для выкладки и промо, обучение представителей. Не добавляется к 30 млн.</p>
            </div>
            <div className="list">
              {ROADMAP.map(([m, t]) => <div key={m} className="cell"><span className="badge blue">{m}</span><div className="cell-main t-foot">{t}</div></div>)}
            </div>
          </div>
        </div>
      </section>

      <section style={{ background: 'var(--bg)' }}>
        <div className="l-sec">
          <h2 className="l-h2">Ожидаемые результаты.</h2>
          <p className="l-lead">Качественные цели проекта. Количественный эффект будет измерен на пилоте (месяц 5) — без заранее обещанных процентов роста.</p>
          <div className="grid g4 mt32">
            {['Контроль посещений', 'Объективная оценка сотрудников', 'Раннее обнаружение проблем', 'Взаимодействие подразделений', 'Меньше потерь от задержек поставок', 'Контроль оборудования', 'Эффективность торговых точек', 'Обоснованные решения'].map((t) => (
              <div key={t} className="card row gap8"><Icon name="check" size={18} className="c-green" /><span className="t-sub bold">{t}</span></div>
            ))}
          </div>
          <div className="row gap8 mt32 wrap">
            <a className="btn" href={`${REPO_URL}/tree/main/docs`} target="_blank" rel="noreferrer"><Icon name="doc" size={16} />Техническое задание и архитектура</a>
            <a className="btn" href={REPO_URL} target="_blank" rel="noreferrer"><Icon name="link" size={16} />Исходный код</a>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="row gap8" style={{ justifyContent: 'center' }}><Logo size={20} /> <b style={{ color: 'var(--label)' }}>DairyHub</b></div>
        <div className="mt8">Демонстрационная версия. Все данные в демо сгенерированы и не являются данными реальной компании.</div>
      </footer>
    </div>
  );
}
