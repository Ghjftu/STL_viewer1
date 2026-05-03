import React, { useEffect, useState } from 'react';

export const DoctorDashboard: React.FC = () => {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [doctorName, setDoctorName] = useState('');

  useEffect(() => {
    // 1. Защита и получение данных авторизации
    const role = localStorage.getItem('role');
    const name = localStorage.getItem('name');
    const userId = localStorage.getItem('userId'); // Извлекаем ID врача
    
    if (role !== 'doctor') {
      window.location.href = '/';
      return;
    }

    if (name) setDoctorName(name);

    // 2. Загружаем проекты только для этого врача
    // Передаем параметры в URL для фильтрации на бэкенде
    fetch(`${import.meta.env.VITE_API_URL}/projects/list?userId=${userId}&role=${role}`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setProjects(data);
        }
      })
      .catch(err => console.error("Ошибка загрузки проектов:", err))
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = () => {
    localStorage.clear();
    window.location.href = '/';
  };

  if (loading) return <div className="p-10 text-center text-black font-bold">Загрузка данных...</div>;

  return (
    <div className="min-h-screen bg-gray-50 text-black font-sans">
      <nav className="flex items-center justify-between gap-3 bg-indigo-900 p-3 text-white shadow-lg sm:p-4">
        <div className="flex items-center space-x-3">
          <div className="bg-indigo-500 p-2 rounded-lg">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-bold leading-none sm:text-lg">STL VIEWER</h1>
            <p className="text-[10px] text-indigo-300 uppercase tracking-widest mt-1">Кабинет врача</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 sm:gap-6">
          <span className="text-sm font-medium border-r border-indigo-700 pr-6 hidden md:block">
            Врач: <span className="text-indigo-200">{doctorName || 'Загрузка...'}</span>
          </span>
          <button 
            onClick={handleLogout}
            className="rounded-lg bg-indigo-700 px-3 py-2 text-xs font-bold uppercase transition-colors hover:bg-red-600 sm:px-4"
          >
            Выход
          </button>
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        <header className="mb-6 sm:mb-8">
          <h2 className="text-2xl font-extrabold text-gray-900 sm:text-3xl">Мои кейсы</h2>
          <p className="mt-2 text-sm text-gray-500 sm:text-base">Проекты, назначенные вам администратором</p>
        </header>

        <div className="grid gap-4">
          {projects.length > 0 ? projects.map((p) => (
            <div 
              key={p.id} 
              className="group flex flex-col items-start justify-between rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:border-indigo-300 md:flex-row md:items-center sm:p-5"
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                   <span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                     {p.status || 'В работе'}
                   </span>
                   <span className="text-xs text-gray-400 font-medium font-mono">{p.id.slice(0,8)}</span>
                </div>
                <h3 className="break-words text-lg font-bold text-gray-800 transition-colors group-hover:text-indigo-900 sm:text-xl">
                  {p.patient_name}
                </h3>
                <p className="flex items-center text-sm text-gray-500">
                  <svg className="w-4 h-4 mr-1 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Создан: {new Date(p.created_at).toLocaleDateString()}
                </p>
              </div>

              <div className="mt-4 md:mt-0 w-full md:w-auto">
                <button 
                  onClick={() => alert('Запуск 3D для: ' + p.patient_name)}
                  className="w-full rounded-xl border-2 border-indigo-600 bg-white px-8 py-3 font-bold text-indigo-600 shadow-sm transition-all hover:bg-indigo-600 hover:text-white active:scale-95 md:w-auto"
                >
                  ОТКРЫТЬ 3D
                </button>
              </div>
            </div>
          )) : (
            <div className="rounded-3xl border-2 border-dashed border-gray-200 bg-white p-8 text-center sm:p-20">
              <p className="text-gray-400 font-medium">У вас пока нет назначенных проектов</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
