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
    fetch(`http://localhost:8000/api/projects/list?userId=${userId}&role=${role}`)
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
      <nav className="bg-indigo-900 text-white p-4 flex justify-between items-center shadow-lg">
        <div className="flex items-center space-x-3">
          <div className="bg-indigo-500 p-2 rounded-lg">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold leading-none">STL VIEWER</h1>
            <p className="text-[10px] text-indigo-300 uppercase tracking-widest mt-1">Кабинет врача</p>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <span className="text-sm font-medium border-r border-indigo-700 pr-6 hidden md:block">
            Врач: <span className="text-indigo-200">{doctorName || 'Загрузка...'}</span>
          </span>
          <button 
            onClick={handleLogout}
            className="bg-indigo-700 hover:bg-red-600 px-4 py-2 rounded-lg text-xs font-bold transition-colors uppercase"
          >
            Выход
          </button>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto py-10 px-6">
        <header className="mb-8">
          <h2 className="text-3xl font-extrabold text-gray-900">Мои кейсы</h2>
          <p className="text-gray-500 mt-2">Проекты, назначенные вам администратором</p>
        </header>

        <div className="grid gap-4">
          {projects.length > 0 ? projects.map((p) => (
            <div 
              key={p.id} 
              className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center hover:border-indigo-300 transition-all group"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                   <span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                     {p.status || 'В работе'}
                   </span>
                   <span className="text-xs text-gray-400 font-medium font-mono">{p.id.slice(0,8)}</span>
                </div>
                <h3 className="text-xl font-bold text-gray-800 group-hover:text-indigo-900 transition-colors">
                  {p.patient_name}
                </h3>
                <p className="text-sm text-gray-500 flex items-center">
                  <svg className="w-4 h-4 mr-1 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Создан: {new Date(p.created_at).toLocaleDateString()}
                </p>
              </div>

              <div className="mt-4 md:mt-0 w-full md:w-auto">
                <button 
                  onClick={() => alert('Запуск 3D для: ' + p.patient_name)}
                  className="w-full md:w-auto bg-white border-2 border-indigo-600 text-indigo-600 hover:bg-indigo-600 hover:text-white px-8 py-3 rounded-xl font-bold transition-all shadow-sm active:scale-95"
                >
                  ОТКРЫТЬ 3D
                </button>
              </div>
            </div>
          )) : (
            <div className="bg-white border-2 border-dashed border-gray-200 rounded-3xl p-20 text-center">
              <p className="text-gray-400 font-medium">У вас пока нет назначенных проектов</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};