import { Component, StrictMode, Suspense, lazy, useEffect, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import './styles/app.css';
import { hub } from './api/hub';
import { ToastProvider, useHub, Spinner } from './ui/kit';
import { Landing } from './pages/public/Landing';
import { Login, Register } from './pages/public/Auth';
import { BrowserNotifier, OfflineBanner } from './ui/system';

const DeskApp = lazy(() => import('./pages/desk/DeskApp'));
const RepApp = lazy(() => import('./pages/rep/RepApp'));

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function Guard({ area }: { area: 'desk' | 'rep' }) {
  const s = useHub();
  if (!s.ready) return <div className="skeleton"><Spinner /></div>;
  if (!s.user) return <Navigate to="/login" replace />;
  if (area === 'desk' && s.user.role === 'rep') return <Navigate to="/rep" replace />;
  if (area === 'rep' && s.user.role !== 'rep') return <Navigate to="/app" replace />;
  return (
    <Suspense fallback={<div className="skeleton"><Spinner /></div>}>
      {area === 'desk' ? <DeskApp /> : <RepApp />}
    </Suspense>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) {
    return { err };
  }
  componentDidCatch(err: Error) {
    console.error(err);
  }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="auth-wrap">
        <div className="card auth-card col gap12" style={{ textAlign: 'center' }}>
          <div className="t-title2">Что-то пошло не так</div>
          <div className="t-sub sec">Ошибка зафиксирована. Обновите страницу — данные сохранены.</div>
          <button className="btn primary lg" onClick={() => { location.hash = '#/'; location.reload(); }}>Обновить</button>
        </div>
      </div>
    );
  }
}

function App() {
  return (
    <HashRouter>
      <OfflineBanner />
      <BrowserNotifier />
      <ScrollTop />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/app/*" element={<Guard area="desk" />} />
        <Route path="/rep/*" element={<Guard area="rep" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}

void hub.init();
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => undefined); });
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ErrorBoundary>
  </StrictMode>,
);
