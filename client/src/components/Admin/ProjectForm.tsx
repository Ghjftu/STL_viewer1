import React, { useState, useEffect } from 'react';
import { clearSession, getAuthHeaders, getAuthToken, getSession } from '../../utils/authSession';
import { useUiTheme } from '../../utils/uiTheme';

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
  const [fileGroups, setFileGroups] = useState<Record<string, string>>({}); // <--- НОВЫЙ СТЕЙТ
  const [openScene, setOpenScene] = useState(false);
  const [loading, setLoading] = useState(false);
  const { isDarkTheme, currentAccent } = useUiTheme();

  useEffect(() => {
    const session = getSession();
    if (!session || session.role !== 'admin') {
      clearSession();
      window.location.href = '/';
      return;
    }

    fetch(`${import.meta.env.VITE_API_URL}/doctors`, {
      headers: getAuthHeaders()
    })
      .then(res => {
        if (res.status === 401 || res.status === 403) {
          clearSession();
          alert("Сессия истекла, перевойдите в систему");
          window.location.href = '/';
          return [];
        }
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

  // Обработка выбора файлов (обновлённая)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    setSelectedFiles(files);
    
    // Инициализируем группы для всех файлов значением по умолчанию "Ткани"
    if (files) {
      const initialGroups: Record<string, string> = {};
      Array.from(files).forEach(f => {
        initialGroups[f.name] = 'Ткани';
      });
      setFileGroups(initialGroups);
    }
  };

  const handleCreate = async () => {
    if (!selectedFiles || !formData.doctor_id) return alert("Выберите файлы и врача");

    const token = getAuthToken();
    // Шаг 1: Проверка наличия токена
    if (!token || token === 'null') {
      alert('Сессия не найдена. Пожалуйста, войдите в систему.');
      window.location.href = '/'; // замени на свой путь до страницы авторизации
      return;
    }

    const data = new FormData();
    Object.entries(formData).forEach(([key, value]) => data.append(key, value));
    data.append('open_scene', String(openScene));

    // Отправляем файлы с транслитерированными именами
    const filesToSend = getTransliteratedFiles(selectedFiles);
    filesToSend.forEach(file => data.append('files', file));

    // НОВОЕ: Передаем словарь групп в JSON
    data.append('file_groups', JSON.stringify(fileGroups));

    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/projects/create`, {
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
      } 
      // Шаг 2: Обработка 401 и 403 ошибок
      else if (res.status === 401 || res.status === 403) {
        clearSession();
        alert("Сессия истекла или недействительна. Перенаправление на логин...");
        window.location.href = '/'; 
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

  const fieldClass = `ui-focus h-11 w-full rounded-full border px-4 text-sm font-bold transition ${
    isDarkTheme ? 'border-neutral-700 bg-neutral-950/65 text-neutral-100' : 'border-white/70 bg-white/72 text-slate-950'
  }`;
  const labelClass = `mb-1.5 ml-1 block text-[0.68rem] font-black uppercase ${
    isDarkTheme ? 'text-neutral-500' : 'text-slate-400'
  }`;

  return (
    <div
      className={`min-h-screen p-4 sm:p-6 lg:p-8 ${isDarkTheme ? 'bg-neutral-950 text-neutral-100' : 'bg-[#eef1f3] text-slate-950'}`}
      style={{ '--ui-accent': currentAccent.color } as React.CSSProperties}
    >
      <div className={`rough-glass mx-auto max-w-2xl rounded-[1.75rem] p-4 sm:p-7 ${isDarkTheme ? 'rough-glass-dark' : ''}`}>
        <div className="mb-6">
          <div className="text-[0.68rem] font-black uppercase" style={{ color: currentAccent.color }}>MeshBridge</div>
          <h1 className="mt-1 text-2xl font-black">Новый проект</h1>
        </div>
        <div className="flex flex-col gap-4">

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Страна</label>
              <input
                placeholder="Russia"
                className={fieldClass}
                value={formData.country}
                onChange={e => setFormData({...formData, country: e.target.value})}
              />
            </div>
            <div>
              <label className={labelClass}>Город</label>
              <input
                placeholder="Moscow"
                className={fieldClass}
                value={formData.city}
                onChange={e => setFormData({...formData, city: e.target.value})}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Клиника</label>
              <input
                placeholder="Dental Clinic"
                className={fieldClass}
                value={formData.clinic}
                onChange={e => setFormData({...formData, clinic: e.target.value})}
              />
            </div>
            <div>
              <label className={labelClass}>Отделение</label>
              <input
                placeholder="Surgery"
                className={fieldClass}
                value={formData.department}
                onChange={e => setFormData({...formData, department: e.target.value})}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>Назначить врача</label>
            <select
              className={`${fieldClass} appearance-none`}
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
            <label className={labelClass}>ФИО пациента</label>
            <input
              placeholder="Иванов Иван Иванович"
              className={fieldClass}
              value={formData.patient_name}
              onChange={e => setFormData({...formData, patient_name: e.target.value})}
            />
          </div>

          <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 text-left ${
            isDarkTheme ? 'border-neutral-700 bg-neutral-950/55' : 'border-white/70 bg-white/58'
          }`}>
            <input
              type="checkbox"
              checked={openScene}
              onChange={(e) => setOpenScene(e.target.checked)}
              className="mt-1 h-5 w-5 rounded"
              style={{ accentColor: currentAccent.color }}
            />
            <span>
              <span className="block text-sm font-black">Открытая сцена</span>
              <span className={`block text-xs leading-5 ${isDarkTheme ? 'text-neutral-400' : 'text-slate-500'}`}>
                Ссылка на просмотр будет открываться без пароля.
              </span>
            </span>
          </label>

          {/* Блок загрузки файлов с выбором группы */}
          <div className={`mt-2 rounded-2xl border border-dashed p-4 text-center sm:p-6 ${
            isDarkTheme ? 'border-neutral-700 bg-neutral-950/45' : 'border-slate-300 bg-white/48'
          }`}>
            <label className="mb-2 block text-sm font-black" style={{ color: currentAccent.color }}>Загрузите STL-файлы (до 10 шт)</label>
            <input
              type="file"
              multiple
              accept=".stl"
              className={`w-full text-sm ${isDarkTheme ? 'text-neutral-400' : 'text-slate-500'} file:mb-2 file:mr-4 file:rounded-full file:border-0 file:bg-[var(--ui-accent)] file:px-4 file:py-2 file:text-sm file:font-black file:text-white sm:file:mb-0`}
              onChange={handleFileChange} // <--- ИСПОЛЬЗУЕМ НОВУЮ ФУНКЦИЮ
            />
            {/* Отображение файлов с селектами групп */}
            {selectedFiles && selectedFiles.length > 0 && (
              <div className={`mt-4 rounded-xl p-3 text-left ${isDarkTheme ? 'bg-neutral-900/75 ring-1 ring-neutral-700' : 'bg-white/75 ring-1 ring-white'}`}>
                <p className="mb-2 text-sm font-black" style={{ color: currentAccent.color }}>Назначьте группы файлам:</p>
                <ul className={`max-h-48 space-y-2 overflow-y-auto text-xs ${isDarkTheme ? 'text-neutral-300' : 'text-slate-700'}`}>
                  {Array.from(selectedFiles).map((file, idx) => (
                    <li key={idx} className={`flex flex-col gap-2 rounded-xl p-2 sm:flex-row sm:items-center sm:justify-between ${isDarkTheme ? 'bg-neutral-950/65' : 'bg-slate-50/80'}`}>
                      <span className="truncate sm:w-1/2" title={file.name}>{file.name}</span>
                      <select 
                        className={`ui-focus w-full rounded-full border px-3 py-2 sm:w-1/3 sm:py-1.5 ${isDarkTheme ? 'border-neutral-700 bg-neutral-900 text-white' : 'border-slate-200 bg-white text-slate-800'}`}
                        value={fileGroups[file.name] || 'Ткани'}
                        onChange={(e) => setFileGroups({...fileGroups, [file.name]: e.target.value})}
                      >
                        <option value="Ткани">Ткани</option>
                        <option value="Импланты">Импланты</option>
                        <option value="Лекала">Лекала</option>
                      </select>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <button
            onClick={handleCreate}
            disabled={loading}
            className={`mt-4 rounded-full p-3.5 text-sm font-black text-white shadow-lg transition ${loading ? 'cursor-not-allowed bg-slate-400' : 'hover:brightness-95'}`}
            style={{ backgroundColor: loading ? undefined : currentAccent.color }}
          >
            {loading ? 'Создание и загрузка...' : 'Создать проект'}
          </button>
        </div>
      </div>
    </div>
  );
};
