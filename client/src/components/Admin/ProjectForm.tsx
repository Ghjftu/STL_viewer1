import React, { useState, useEffect } from 'react';

export const ProjectForm: React.FC = () => {
  const [formData, setFormData] = useState({
    country: '', city: '', clinic: '', department: '', doctor_id: '', doctor_name: '', patient_name: ''
  });
  const [doctors, setDoctors] = useState<any[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [loading, setLoading] = useState(false);

  // 1. При загрузке формы тоже нужен токен, чтобы получить список врачей
  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch('http://localhost:8000/api/doctors', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
      .then(res => {
        if (res.status === 401) alert("Сессия истекла, перевойдите в систему");
        return res.json();
      })
      .then(data => Array.isArray(data) && setDoctors(data))
      .catch(err => console.error("Ошибка загрузки врачей:", err));
  }, []);

  const handleCreate = async () => {
    if (!selectedFiles || !formData.doctor_id) return alert("Выберите файлы и врача");
    
    const data = new FormData();
    // Наполняем FormData
    Object.entries(formData).forEach(([key, value]) => data.append(key, value));
    Array.from(selectedFiles).forEach(file => data.append('files', file));

    const token = localStorage.getItem('token'); // ПОЛУЧАЕМ ТОКЕН

    setLoading(true);
    try {
      const res = await fetch('http://localhost:8000/api/projects/create', { 
        method: 'POST', 
        headers: {
          // ВАЖНО: При отправке FormData заголовок Content-Type ставить НЕЛЬЗЯ, 
          // браузер должен сам выставить boundary. Ставим только Authorization.
          'Authorization': `Bearer ${token}`
        },
        body: data 
      });

      if (res.ok) { 
        alert('Проект успешно создан!'); 
        // Если открывали в новой вкладке — закрываем, если нет — редирект
        if (window.opener) {
          window.close();
        } else {
          window.location.href = '/admin';
        }
      } else {
        const errData = await res.json();
        alert(`Ошибка сервера: ${errData.error || errData.message || 'Неизвестная ошибка'}`);
      }
    } catch (err) { 
      console.error(err);
      alert('Ошибка соединения с сервером'); 
    } 
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen p-10 bg-gray-50 text-black">
      <div className="max-w-xl mx-auto bg-white p-8 rounded-xl shadow-lg border">
        <h2 className="text-2xl font-bold mb-6 text-indigo-900 flex items-center gap-2">
          <span className="bg-indigo-100 p-2 rounded-lg text-xl">📁</span> Новый проект
        </h2>
        <div className="flex flex-col gap-4">
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Страна</label>
              <input placeholder="Russia" className="w-full border p-3 rounded bg-gray-50 text-black outline-indigo-500" onChange={e => setFormData({...formData, country: e.target.value})} />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Город</label>
              <input placeholder="Moscow" className="w-full border p-3 rounded bg-gray-50 text-black outline-indigo-500" onChange={e => setFormData({...formData, city: e.target.value})} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
             <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Клиника</label>
              <input placeholder="Dental Clinic" className="w-full border p-3 rounded bg-gray-50 text-black outline-indigo-500" onChange={e => setFormData({...formData, clinic: e.target.value})} />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Отделение</label>
              <input placeholder="Surgery" className="w-full border p-3 rounded bg-gray-50 text-black outline-indigo-500" onChange={e => setFormData({...formData, department: e.target.value})} />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Назначить врача</label>
            <select 
              className="w-full border p-3 rounded bg-gray-50 text-black outline-indigo-500 appearance-none" 
              onChange={e => {
                const doc = doctors.find(d => d.id.toString() === e.target.value);
                setFormData({
                  ...formData, 
                  doctor_id: e.target.value, 
                  doctor_name: doc ? doc.full_name : ''
                });
              }}
            >
              <option value="">Выберите из списка...</option>
              {doctors.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">ФИО Пациента</label>
            <input placeholder="Иванов Иван Иванович" className="w-full border p-3 rounded bg-gray-50 font-bold text-black outline-indigo-500" onChange={e => setFormData({...formData, patient_name: e.target.value})} />
          </div>
          
          <div className="border-2 border-dashed border-indigo-200 p-6 rounded-lg text-center bg-indigo-50 mt-2">
            <label className="block text-sm font-medium text-indigo-700 mb-2">Загрузите STL-файлы (до 10 шт)</label>
            <input type="file" multiple accept=".stl" className="text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-100 file:text-indigo-700 hover:file:bg-indigo-200" onChange={e => setSelectedFiles(e.target.files)} />
          </div>

          <button 
            onClick={handleCreate} 
            disabled={loading} 
            className={`mt-4 p-4 rounded-lg font-bold shadow-md transition ${loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}
          >
            {loading ? 'СОЗДАНИЕ И ЗАГРУЗКА...' : 'ПОДТВЕРДИТЬ И СОЗДАТЬ'}
          </button>
        </div>
      </div>
    </div>
  );
};