import React, { useState, useEffect } from 'react';

export const ProjectForm: React.FC = () => {
  const [formData, setFormData] = useState({
    country: '',
    city: '',
    clinic: '',
    department: '',
    doctor_id: '',
    doctor_name: '',
    patient_name: ''
  });
  const [doctors, setDoctors] = useState<any[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch(`${import.meta.env.VITE_API_URL}/api/doctors`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => {
        if (res.status === 401) alert("Сессия истекла, перевойдите в систему");
        return res.json();
      })
      .then(data => Array.isArray(data) && setDoctors(data))
      .catch(err => console.error("Ошибка загрузки врачей:", err));
  }, []);

  // При выборе врача заполняем страну, город, клинику, отделение
  const handleDoctorChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const doctorId = e.target.value;
    const selectedDoctor = doctors.find(d => d.id.toString() === doctorId);
    if (selectedDoctor) {
      setFormData({
        ...formData,
        doctor_id: doctorId,
        doctor_name: selectedDoctor.full_name,
        country: selectedDoctor.country || '',
        city: selectedDoctor.city || '',
        clinic: selectedDoctor.clinic || '',
        department: selectedDoctor.department || ''
      });
    } else {
      // Если сбросили выбор
      setFormData({
        ...formData,
        doctor_id: '',
        doctor_name: '',
        country: '',
        city: '',
        clinic: '',
        department: ''
      });
    }
  };

  // Функция транслитерации кириллицы в латиницу
  const transliterate = (text: string): string => {
    const map: Record<string, string> = {
      'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
      'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
      'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
      'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
      'ъ': '', 'ы': 'y', 'ь': "'", 'э': 'e', 'ю': 'yu', 'я': 'ya',
      'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'Yo',
      'Ж': 'Zh', 'З': 'Z', 'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M',
      'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U',
      'Ф': 'F', 'Х': 'H', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Sch',
      'Ъ': '', 'Ы': 'Y', 'Ь': "'", 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya'
    };
    return text.replace(/[а-яА-ЯёЁ]/g, (ch) => map[ch] || ch);
  };

  // Создаёт новые файлы с транслитерированными именами
  const getTransliteratedFiles = (files: FileList): File[] => {
    return Array.from(files).map(file => {
      const lastDotIndex = file.name.lastIndexOf('.');
      const baseName = lastDotIndex !== -1 ? file.name.substring(0, lastDotIndex) : file.name;
      const ext = lastDotIndex !== -1 ? file.name.substring(lastDotIndex) : '';
      const newBaseName = transliterate(baseName);
      const newName = newBaseName + ext;
      return new File([file], newName, { type: file.type });
    });
  };

  const handleCreate = async () => {
    if (!selectedFiles || !formData.doctor_id) return alert("Выберите файлы и врача");

    const data = new FormData();
    Object.entries(formData).forEach(([key, value]) => data.append(key, value));

    // Отправляем файлы с транслитерированными именами
    const filesToSend = getTransliteratedFiles(selectedFiles);
    filesToSend.forEach(file => data.append('files', file));

    const token = localStorage.getItem('token');
    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/projects/create`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: data
      });

      if (res.ok) {
        alert('Проект успешно создан!');
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
    } finally {
      setLoading(false);
    }
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
              <input
                placeholder="Russia"
                className="w-full border p-3 rounded bg-gray-50 text-black outline-indigo-500"
                value={formData.country}
                onChange={e => setFormData({...formData, country: e.target.value})}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Город</label>
              <input
                placeholder="Moscow"
                className="w-full border p-3 rounded bg-gray-50 text-black outline-indigo-500"
                value={formData.city}
                onChange={e => setFormData({...formData, city: e.target.value})}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Клиника</label>
              <input
                placeholder="Dental Clinic"
                className="w-full border p-3 rounded bg-gray-50 text-black outline-indigo-500"
                value={formData.clinic}
                onChange={e => setFormData({...formData, clinic: e.target.value})}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Отделение</label>
              <input
                placeholder="Surgery"
                className="w-full border p-3 rounded bg-gray-50 text-black outline-indigo-500"
                value={formData.department}
                onChange={e => setFormData({...formData, department: e.target.value})}
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Назначить врача</label>
            <select
              className="w-full border p-3 rounded bg-gray-50 text-black outline-indigo-500 appearance-none"
              value={formData.doctor_id}
              onChange={handleDoctorChange}
            >
              <option value="">Выберите из списка...</option>
              {doctors.map(d => (
                <option key={d.id} value={d.id}>
                  {d.full_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">ФИО Пациента</label>
            <input
              placeholder="Иванов Иван Иванович"
              className="w-full border p-3 rounded bg-gray-50 font-bold text-black outline-indigo-500"
              value={formData.patient_name}
              onChange={e => setFormData({...formData, patient_name: e.target.value})}
            />
          </div>

          <div className="border-2 border-dashed border-indigo-200 p-6 rounded-lg text-center bg-indigo-50 mt-2">
            <label className="block text-sm font-medium text-indigo-700 mb-2">Загрузите STL-файлы (до 10 шт)</label>
            <input
              type="file"
              multiple
              accept=".stl"
              className="text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-100 file:text-indigo-700 hover:file:bg-indigo-200"
              onChange={e => setSelectedFiles(e.target.files)}
            />
            {/* Отображение выбранных файлов (оригинальные имена) */}
            {selectedFiles && selectedFiles.length > 0 && (
              <div className="mt-4 text-left bg-white p-3 rounded border border-indigo-100">
                <p className="text-sm font-semibold text-indigo-800 mb-2">Выбрано файлов: {selectedFiles.length}</p>
                <ul className="text-xs text-gray-700 space-y-1 max-h-32 overflow-y-auto">
                  {Array.from(selectedFiles).map((file, idx) => (
                    <li key={idx} className="truncate" title={file.name}>
                      📄 {file.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <button
            onClick={handleCreate}
            disabled={loading}
            className={`mt-4 p-4 rounded-lg font-bold shadow-md transition ${
              loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 text-white'
            }`}
          >
            {loading ? 'СОЗДАНИЕ И ЗАГРУЗКА...' : 'ПОДТВЕРДИТЬ И СОЗДАТЬ'}
          </button>
        </div>
      </div>
    </div>
  );
};