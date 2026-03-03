import React, { useEffect, useState } from 'react';

export const AdminDashboard: React.FC = () => {
  const [projects, setProjects] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isEditModalOpen, setEditModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<any>(null);

  useEffect(() => {
    const role = localStorage.getItem('role');
    const token = localStorage.getItem('token');

    // Если нет токена или роль не админ — выкидываем
    if (!token || role !== 'admin') {
      alert("Доступ запрещен!");
      window.location.href = '/'; 
      return;
    }
    setIsAuthorized(true);

    fetchProjects();
    fetchDoctors();
    
    const handleFocus = () => {
      if (document.visibilityState === 'visible') fetchProjects();
    };
    document.addEventListener('visibilitychange', handleFocus);
    return () => document.removeEventListener('visibilitychange', handleFocus);
  }, []);

  // ФУНКЦИЯ ДЛЯ ПОЛУЧЕНИЯ ЗАГОЛОВКОВ С ТОКЕНОМ
  const getAuthHeaders = () => ({
    'Authorization': `Bearer ${localStorage.getItem('token')}`,
    'Content-Type': 'application/json'
  });

  const fetchProjects = () => {
    fetch(`${import.meta.env.VITE_API_URL}/api/projects/list`, {
      headers: getAuthHeaders() // ДОБАВИЛИ ТОКЕН
    })
      .then(res => {
        if (res.status === 401) window.location.href = '/';
        return res.json();
      })
      .then(data => {
        if (Array.isArray(data)) setProjects(data);
      })
      .catch(() => console.error("Ошибка загрузки проектов"));
  };

  const fetchDoctors = () => {
    fetch(`${import.meta.env.VITE_API_URL}/api/doctors`, {
      headers: getAuthHeaders() // ДОБАВИЛИ ТОКЕН
    })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setDoctors(data);
      })
      .catch(() => console.error("Ошибка загрузки врачей"));
  };

  const copyLink = (projectId: string) => {
  const viewerLink = `${window.location.origin}/viewer/${projectId}`;

      // Проверяем, доступно ли современное API и находимся ли мы в защищенном контексте
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(viewerLink)
          .then(() => alert('Ссылка скопирована!'))
          .catch(() => alert('Ошибка при копировании'));
      } else {
        // Старый добрый способ для HTTP и IP-адресов
        const textArea = document.createElement("textarea");
        textArea.value = viewerLink;
        
        // Делаем элемент невидимым
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "0";
        document.body.appendChild(textArea);
        
        textArea.focus();
        textArea.select();
        
        try {
          const successful = document.execCommand('copy');
          if (successful) {
            alert('Ссылка скопирована!');
          } else {
            alert('Не удалось скопировать ссылку');
          }
        } catch (err) {
          alert('Ошибка при копировании');
        }
        
        document.body.removeChild(textArea);
      }
    };
      

  const handleUpdateProject = async () => {
    if (!editingProject) return;

    const doc = doctors.find(d => d.id === editingProject.doctor_id);
    const body = {
        doctor_id: editingProject.doctor_id,
        doctor_name: doc ? doc.full_name : 'Unknown', 
        patient_name: editingProject.patient_name
    };

    try {
      // ВАЖНО: Проверь, чтобы в контроллере был роут на обновление. 
      // Если ты используешь стандартный путь, то обычно это PUT /api/projects/:id
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/projects/${editingProject.id}`, {
          method: 'PUT',
          headers: getAuthHeaders(), // ДОБАВИЛИ ТОКЕН
          body: JSON.stringify(body)
      });

      if (res.ok) {
        setEditModalOpen(false);
        fetchProjects();
        alert("Проект обновлен!");
      } else {
        alert("Ошибка при обновлении");
      }
    } catch (e) {
      console.error(e);
      alert("Ошибка сети");
    }
  };

  if (!isAuthorized) return null;

  return (
    <div className="min-h-screen bg-gray-100 text-black font-sans relative">
      <nav className="bg-slate-800 text-white p-4 flex justify-between items-center shadow-md">
        <h1 className="text-xl font-bold tracking-tight">STL_Viewer <span className="text-blue-400">ADMIN</span></h1>
        <div className="flex items-center gap-4">
            
            <button onClick={() => { localStorage.clear(); window.location.href='/'; }} className="bg-gray-600 hover:bg-gray-700 px-4 py-1 rounded text-sm transition">Выйти</button>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto py-8 px-4">
        <div className="flex space-x-4 mb-8">
          <a href="/admin/create-project" 
            target="_blank" 
            rel="noopener noreferrer"
            className="bg-blue-600 text-white px-6 py-3 rounded-lg font-bold shadow-lg hover:bg-blue-700 transition">
            
            + Добавить проект
          </a>
          <a href="/admin/doctors" 
            target="_blank" 
            rel="noopener noreferrer"
            className="bg-emerald-600 text-white px-6 py-3 rounded-lg font-bold shadow-lg hover:bg-emerald-700 transition">
            👥 Управление врачами
          </a>
        </div>

        <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="p-4 font-bold text-gray-600 text-xs uppercase">Дата</th>
                <th className="p-4 font-bold text-gray-600 text-xs uppercase">Пациент</th>
                <th className="p-4 font-bold text-gray-600 text-xs uppercase">Врач</th>
                <th className="p-4 font-bold text-gray-600 text-xs uppercase text-center">Управление</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className="border-b hover:bg-blue-50/30 transition">
                  <td className="p-4 text-sm text-gray-500">{new Date(p.created_at).toLocaleDateString()}</td>
                  <td className="p-4 font-semibold text-gray-800">{p.patient_name}</td>
                  <td className="p-4">
                    <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-[10px] font-black uppercase">
                        {p.doctor_display_name || 'Не указан'}
                    </span>
                  </td>
                  <td className="p-4 flex justify-center gap-2">
                    <button onClick={() => copyLink(p.id)} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-[10px] font-bold uppercase">🔗 Ссылка</button>
                    <button onClick={() => window.open(`/viewer/${p.id}?mode=admin`, '_blank')} className="bg-orange-500 text-white px-3 py-1.5 rounded text-[10px] font-bold uppercase">Сцена</button>
                    <button onClick={() => { setEditingProject(p); setEditModalOpen(true); }} className="bg-gray-500 text-white px-3 py-1.5 rounded text-[10px] font-bold uppercase">Ред.</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isEditModalOpen && editingProject && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-2xl w-96 shadow-2xl border border-gray-200">
                <h3 className="text-xl font-bold mb-6 text-gray-800 border-b pb-2">Редактирование</h3>
                <div className="mb-4">
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">ФИО Пациента</label>
                    <input className="w-full border border-gray-300 p-3 rounded-lg text-black" value={editingProject.patient_name} onChange={e => setEditingProject({...editingProject, patient_name: e.target.value})}/>
                </div>
                <div className="mb-6">
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Назначенный врач</label>
                    <select className="w-full border border-gray-300 p-3 rounded-lg text-black bg-white" value={editingProject.doctor_id} onChange={e => setEditingProject({...editingProject, doctor_id: e.target.value})}>
                        {doctors.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
                    </select>
                </div>
                <div className="flex gap-3 justify-end">
                    <button onClick={() => setEditModalOpen(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg">Отмена</button>
                    <button onClick={handleUpdateProject} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold">Сохранить</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};