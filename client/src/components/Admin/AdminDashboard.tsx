import React, { useEffect, useState } from 'react';

export const AdminDashboard: React.FC = () => {
  const [projects, setProjects] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isEditModalOpen, setEditModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<any>(null);

  // States for file management (STL)
  const [existingFiles, setExistingFiles] = useState<any[]>([]);
  const [newFiles, setNewFiles] = useState<FileList | null>(null);
  const [loading, setLoading] = useState(false);

  // NEW: States for sketch import
  const [sketchFiles, setSketchFiles] = useState<FileList | null>(null);
  const [isImportingSketches, setIsImportingSketches] = useState(false);

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

  // Функция для обработки неавторизованных запросов (401/403)
  const handleUnauthorized = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    alert('Сессия истекла. Пожалуйста, войдите снова.');
    window.location.href = '/login';
  };

  // Получение заголовков авторизации
  const getAuthHeaders = (contentType = true) => {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${localStorage.getItem('token')}`,
    };
    if (contentType) {
      headers['Content-Type'] = 'application/json';
    }
    return headers;
  };

  useEffect(() => {
    const role = localStorage.getItem('role');
    const token = localStorage.getItem('token');

    if (!token || role !== 'admin') {
      alert('Доступ запрещен!');
      window.location.href = '/login';
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

  const fetchProjects = () => {
    fetch(`${import.meta.env.VITE_API_URL}/projects/list`, {
      headers: getAuthHeaders(),
    })
      .then((res) => {
        if (res.status === 401 || res.status === 403) {
          handleUnauthorized();
          return;
        }
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data)) setProjects(data);
      })
      .catch(() => console.error('Ошибка загрузки проектов'));
  };

  const fetchDoctors = () => {
    fetch(`${import.meta.env.VITE_API_URL}/doctors`, {
      headers: getAuthHeaders(),
    })
      .then((res) => {
        if (res.status === 401 || res.status === 403) {
          handleUnauthorized();
          return;
        }
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data)) setDoctors(data);
      })
      .catch(() => console.error('Ошибка загрузки врачей'));
  };

  // Fetch detailed project info including STL files
  const fetchProjectDetails = (id: string) => {
    fetch(`${import.meta.env.VITE_API_URL}/projects/${id}`, {
      headers: getAuthHeaders(),
    })
      .then((res) => {
        if (res.status === 401 || res.status === 403) {
          handleUnauthorized();
          return;
        }
        return res.json();
      })
      .then((data) => {
        if (data.stlFiles) setExistingFiles(data.stlFiles);
      })
      .catch(() => console.error('Ошибка загрузки деталей проекта'));
  };

  const copyLink = (projectId: string) => {
    const viewerLink = `${window.location.origin}/viewer/${projectId}`;

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard
        .writeText(viewerLink)
        .then(() => alert('Ссылка скопирована!'))
        .catch(() => alert('Ошибка при копировании'));
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = viewerLink;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      textArea.style.top = '0';
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
      } catch {
        alert('Ошибка при копировании');
      }

      document.body.removeChild(textArea);
    }
  };

  // Delete a specific STL file from the project
  const handleDeleteFile = async (fileName: string) => {
    if (!window.confirm(`Удалить файл ${fileName}?`)) return;

    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/projects/${editingProject.id}/delete-file`,
        {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ fileName }),
        }
      );

      if (res.status === 401 || res.status === 403) {
        handleUnauthorized();
        return;
      }

      if (res.ok) {
        setExistingFiles((prev) => prev.filter((f) => f.name !== fileName));
      } else {
        alert('Ошибка при удалении файла');
      }
    } catch {
      alert('Ошибка сети');
    }
  };

  // Updated update handler with file upload support and transliteration
  const handleUpdateProject = async () => {
    if (!editingProject) return;
    setLoading(true);

    const doc = doctors.find((d) => String(d.id) === String(editingProject.doctor_id));

    const data = new FormData();
    data.append('doctor_id', editingProject.doctor_id);
    data.append('doctor_name', doc ? doc.full_name : 'Unknown');
    data.append('patient_name', editingProject.patient_name);

    // Добавляем новые файлы с транслитерированными именами
    if (newFiles) {
      const filesToSend = getTransliteratedFiles(newFiles);
      filesToSend.forEach((file) => data.append('files', file));
    }

    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/projects/${editingProject.id}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
            // No Content-Type for FormData
          },
          body: data,
        }
      );

      if (res.status === 401 || res.status === 403) {
        handleUnauthorized();
        return;
      }

      if (res.ok) {
        setEditModalOpen(false);
        setNewFiles(null);
        fetchProjects();
        alert('Проект успешно обновлен!');
      } else {
        alert('Ошибка при обновлении');
      }
    } catch {
      alert('Ошибка сети');
    } finally {
      setLoading(false);
    }
  };

  // NEW: Function to import old sketches (JSON + SVG files)
  const handleImportSketches = async () => {
    if (!editingProject || !sketchFiles || sketchFiles.length === 0) return;

    setIsImportingSketches(true);
    const data = new FormData();

    // Append all selected files
    Array.from(sketchFiles).forEach((file) => {
      data.append('sketchFiles', file);
    });

    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/projects/${editingProject.id}/import-sketches`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
            // Content-Type is automatically set to multipart/form-data
          },
          body: data,
        }
      );

      if (res.status === 401 || res.status === 403) {
        handleUnauthorized();
        return;
      }

      if (res.ok) {
        alert('Эскизы успешно импортированы!');
        setSketchFiles(null);
      } else {
        alert('Ошибка при импорте эскизов');
      }
    } catch {
      alert('Ошибка сети при импорте');
    } finally {
      setIsImportingSketches(false);
    }
  };

  if (!isAuthorized) return null;

  return (
    <div className="min-h-screen bg-gray-100 text-black font-sans relative">
      <nav className="bg-slate-800 text-white p-4 flex justify-between items-center shadow-md">
        <h1 className="text-xl font-bold tracking-tight">
          STL_Viewer <span className="text-blue-400">ADMIN</span>
        </h1>
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              localStorage.clear();
              window.location.href = '/login';
            }}
            className="bg-gray-600 hover:bg-gray-700 px-4 py-1 rounded text-sm transition"
          >
            Выйти
          </button>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto py-8 px-4">
        <div className="flex space-x-4 mb-8">
          <a
            href="/admin/create-project"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-blue-600 text-white px-6 py-3 rounded-lg font-bold shadow-lg hover:bg-blue-700 transition"
          >
            + Добавить проект
          </a>
          <a
            href="/admin/doctors"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-emerald-600 text-white px-6 py-3 rounded-lg font-bold shadow-lg hover:bg-emerald-700 transition"
          >
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
                  <td className="p-4 text-sm text-gray-500">
                    {new Date(p.created_at).toLocaleDateString()}
                  </td>
                  <td className="p-4 font-semibold text-gray-800">{p.patient_name}</td>
                  <td className="p-4">
                    <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-[10px] font-black uppercase">
                      {p.doctor_display_name || 'Не указан'}
                    </span>
                  </td>
                  <td className="p-4 flex justify-center gap-2">
                    <button
                      onClick={() => copyLink(p.id)}
                      className="bg-indigo-600 text-white px-3 py-1.5 rounded text-[10px] font-bold uppercase"
                    >
                      🔗 Ссылка
                    </button>
                    <button
                      onClick={() => window.open(`/viewer/${p.id}?mode=sketches`, '_blank')}
                      className="bg-orange-500 text-white px-3 py-1.5 rounded text-[10px] font-bold uppercase flex items-center gap-1"
                    >
                      Скетчи
                      {p.unread_sketches_count > 0 && (
  <span className="ml-2 bg-red-500 text-white rounded-full px-2 py-0.5 text-[10px] font-bold animate-pulse shadow-sm">
    +{p.unread_sketches_count}
  </span>
)}
                    </button>
                    <button
                      onClick={() => {
                        setEditingProject(p);
                        fetchProjectDetails(p.id);
                        setEditModalOpen(true);
                      }}
                      className="bg-gray-500 text-white px-3 py-1.5 rounded text-[10px] font-bold uppercase"
                    >
                      Ред.
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isEditModalOpen && editingProject && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-2xl w-[32rem] shadow-2xl border border-gray-200 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-bold mb-6 text-gray-800 border-b pb-2">Редактирование проекта</h3>

            <div className="mb-4">
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                ФИО Пациента
              </label>
              <input
                className="w-full border border-gray-300 p-3 rounded-lg text-black"
                value={editingProject.patient_name}
                onChange={(e) =>
                  setEditingProject({ ...editingProject, patient_name: e.target.value })
                }
              />
            </div>

            {/* File management section (STL) */}
            <div className="mb-6">
              <label className="block text-xs font-bold text-gray-500 uppercase mb-2">
                Текущие STL-файлы
              </label>
              {existingFiles.length === 0 ? (
                <p className="text-sm text-gray-400 italic">Нет загруженных файлов</p>
              ) : (
                <ul className="space-y-2 max-h-40 overflow-y-auto border rounded-lg p-2">
                  {existingFiles.map((file) => (
                    <li
                      key={file.name}
                      className="flex items-center justify-between bg-gray-50 p-2 rounded"
                    >
                      <span className="text-sm truncate">{file.name}</span>
                      <button
                        onClick={() => handleDeleteFile(file.name)}
                        className="text-red-600 hover:text-red-800 text-xs font-bold"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mb-6">
              <label className="block text-xs font-bold text-gray-500 uppercase mb-2">
                Добавить новые STL-файлы (имена будут транслитерированы)
              </label>
              <input
                type="file"
                multiple
                accept=".stl"
                onChange={(e) => setNewFiles(e.target.files)}
                className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              {newFiles && newFiles.length > 0 && (
                <div className="mt-2 text-xs text-gray-600">
                  Будет загружено файлов: {newFiles.length} (с транслитерированными именами)
                </div>
              )}
            </div>

            {/* NEW: Sketch import section */}
            <div className="mb-6 p-4 bg-blue-50 border border-blue-100 rounded-lg">
              <label className="block text-xs font-bold text-blue-800 uppercase mb-2">
                Импорт старых эскизов (выберите пары .json и .svg)
              </label>
              <input
                type="file"
                multiple
                accept=".json,.svg"
                onChange={(e) => setSketchFiles(e.target.files)}
                className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 mb-3 cursor-pointer"
              />

              {sketchFiles && sketchFiles.length > 0 && (
                <div className="flex flex-col gap-2 mt-2">
                  <span className="text-xs text-blue-700 font-medium">
                    Выбрано файлов: {sketchFiles.length}
                  </span>
                  <button
                    onClick={handleImportSketches}
                    disabled={isImportingSketches}
                    className="w-full py-2 bg-blue-600 text-white rounded font-bold hover:bg-blue-700 disabled:bg-blue-300 transition flex justify-center items-center"
                  >
                    {isImportingSketches ? 'Загрузка...' : 'Загрузить эскизы в проект'}
                  </button>
                </div>
              )}
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setEditModalOpen(false);
                  setNewFiles(null);
                  setSketchFiles(null); // also clear sketch files
                }}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                Отмена
              </button>
              <button
                onClick={handleUpdateProject}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 disabled:bg-blue-300 flex items-center gap-2"
              >
                {loading ? 'Сохранение...' : 'Сохранить изменения STL'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};