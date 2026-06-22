import React, { useEffect, useState } from 'react';
import { clearSession, getAuthHeaders, getSession } from '../../utils/authSession';
import { useUiTheme } from '../../utils/uiTheme';

export const DoctorDashboard: React.FC = () => {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [doctorName] = useState(() => getSession()?.name || '');
  const { isDarkTheme, currentAccent } = useUiTheme();

  useEffect(() => {
    // 1. Защита и получение данных авторизации
    const session = getSession();
    
    if (!session || session.role !== 'doctor') {
      clearSession();
      window.location.href = '/';
      return;
    }

    // 2. Загружаем проекты только для этого врача
    fetch(`${import.meta.env.VITE_API_URL}/projects/list`, {
      headers: getAuthHeaders(),
    })
      .then(res => {
        if (res.status === 401 || res.status === 403) {
          clearSession();
          window.location.href = '/';
          return [];
        }

        return res.json();
      })
      .then(data => {
        if (Array.isArray(data)) {
          setProjects(data);
        }
      })
      .catch(err => console.error("Ошибка загрузки проектов:", err))
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = () => {
    clearSession();
    window.location.href = '/';
  };

  if (loading) return <div className={`flex min-h-screen items-center justify-center font-bold ${isDarkTheme ? 'bg-neutral-950 text-neutral-300' : 'bg-[#eef1f3] text-slate-700'}`}>Загрузка данных...</div>;

  return (
    <div
      className={`min-h-screen font-sans ${isDarkTheme ? 'bg-neutral-950 text-neutral-100' : 'bg-[#eef1f3] text-slate-950'}`}
      style={{ '--ui-accent': currentAccent.color } as React.CSSProperties}
    >
      <header className={`sticky top-0 z-30 border-b px-4 py-3 backdrop-blur-xl sm:px-6 ${
        isDarkTheme ? 'border-neutral-800 bg-neutral-950/78' : 'border-white/70 bg-white/72'
      }`}>
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-black leading-none" style={{ color: currentAccent.color }}>MeshBridge</h1>
            <p className={`mt-1 text-[0.68rem] font-bold uppercase ${isDarkTheme ? 'text-neutral-500' : 'text-slate-400'}`}>Кабинет врача</p>
          </div>
          <span className={`hidden text-sm font-bold md:block ${isDarkTheme ? 'text-neutral-300' : 'text-slate-600'}`}>
            {doctorName || 'Врач'}
          </span>
          <button 
            onClick={handleLogout}
            className={`rounded-full px-4 py-2 text-xs font-black transition ${isDarkTheme ? 'bg-neutral-900 text-neutral-200 ring-1 ring-neutral-700 hover:bg-neutral-800' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'}`}
          >
            Выйти
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <header className="mb-6 sm:mb-8">
          <h2 className="text-2xl font-black">Мои проекты</h2>
          <p className={`mt-1 text-sm ${isDarkTheme ? 'text-neutral-400' : 'text-slate-500'}`}>Проекты, назначенные администратором</p>
        </header>

        <div className="grid gap-3">
          {projects.length > 0 ? projects.map((p) => (
            <div 
              key={p.id} 
              className={`rough-glass group flex flex-col items-start justify-between rounded-2xl p-4 transition md:flex-row md:items-center sm:p-5 ${isDarkTheme ? 'rough-glass-dark' : ''}`}
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                   <span className="rounded-full px-2.5 py-1 text-[10px] font-black uppercase" style={{ backgroundColor: currentAccent.soft, color: currentAccent.color }}>
                     {p.status || 'В работе'}
                   </span>
                   <span className={`font-mono text-xs ${isDarkTheme ? 'text-neutral-500' : 'text-slate-400'}`}>{p.id.slice(0,8)}</span>
                </div>
                <h3 className="break-words text-lg font-black sm:text-xl">
                  {p.patient_name}
                </h3>
                <p className={`flex items-center text-sm ${isDarkTheme ? 'text-neutral-400' : 'text-slate-500'}`}>
                  <svg className="mr-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Создан: {new Date(p.created_at).toLocaleDateString()}
                </p>
              </div>

              <div className="mt-4 md:mt-0 w-full md:w-auto">
                <button 
                  onClick={() => window.open(`/viewer/${p.id}`, '_blank')}
                  className="w-full rounded-full px-7 py-2.5 text-sm font-black text-white shadow-lg transition hover:brightness-95 active:scale-[0.98] md:w-auto"
                  style={{ backgroundColor: currentAccent.color }}
                >
                  Открыть 3D
                </button>
              </div>
            </div>
          )) : (
            <div className={`rounded-2xl border border-dashed p-8 text-center sm:p-16 ${isDarkTheme ? 'border-neutral-700 bg-neutral-900 text-neutral-400' : 'border-slate-300 bg-white/55 text-slate-500'}`}>
              <p className="font-medium">У вас пока нет назначенных проектов</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
