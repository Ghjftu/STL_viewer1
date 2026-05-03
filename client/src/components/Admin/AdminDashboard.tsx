import React, { useEffect, useState } from 'react';

export const AdminDashboard: React.FC = () => {
  const [projects, setProjects] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isEditModalOpen, setEditModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<any>(null);
  const [toastMessage, setToastMessage] = useState('');

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
    window.location.href = '/';
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

  useEffect(() => {
    if (!toastMessage) return;

    const timeoutId = window.setTimeout(() => setToastMessage(''), 2200);
    return () => window.clearTimeout(timeoutId);
  }, [toastMessage]);

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

  // Функция для получения названия клиники по проекту
  const getClinicName = (project: any): string => {
    const doctor = doctors.find((d) => String(d.id) === String(project.doctor_id));
    return doctor?.clinic || 'Не указана';
  };

  const getProjectSlug = (project: any): string => {
    const patientName = String(project?.patient_name || 'project');
    const slug = patientName
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '');

    return encodeURIComponent(slug || 'project');
  };

  const copyLink = (project: any) => {
    const viewerLink = `${window.location.origin}/viewer/${getProjectSlug(project)}/${project.id}`;

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard
        .writeText(viewerLink)
        .then(() => setToastMessage('Ссылка скопирована!'))
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
          setToastMessage('Ссылка скопирована!');
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
    data.append('doctor_id', editingProject.doctor_id ? String(editingProject.doctor_id) : '');
    data.append('doctor_name', doc ? doc.full_name : editingProject.doctor_display_name || '');
    data.append('patient_name', editingProject.patient_name || '');
    data.append('is_public', String(Boolean(editingProject.is_public)));

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
      {toastMessage && (
        <div className="fixed right-4 top-4 z-[60] rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white shadow-lg">
          {toastMessage}
        </div>
      )}

      <nav className="flex items-center justify-between gap-3 bg-slate-800 p-3 text-white shadow-md sm:p-4">
        <h1 className="rounded-lg bg-white px-3 py-2 text-lg font-bold tracking-tight shadow-sm sm:px-4 sm:text-xl">
          <span style={{ color: '#003550' }}>Mesh</span>
          <span style={{ color: '#0a6925' }}>Bridge</span>
          <span style={{ color: '#0a6925' }}> ADMIN</span>
        </h1>
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              localStorage.clear();
              window.location.href = '/';
            }}
            className="rounded bg-gray-600 px-3 py-2 text-sm transition hover:bg-gray-700 sm:px-4 sm:py-1"
          >
            Выйти
          </button>
        </div>
      </nav>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
        <div className="mb-6 grid grid-cols-1 gap-3 sm:mb-8 sm:grid-cols-2 sm:gap-4 md:flex">
          <a
            href="/admin/create-project"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-blue-600 px-5 py-3 text-center font-bold text-white shadow-lg transition hover:bg-blue-700 sm:px-6"
          >
            + Добавить проект
          </a>
          <a
            href="/admin/doctors"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-emerald-600 px-5 py-3 text-center font-bold text-white shadow-lg transition hover:bg-emerald-700 sm:px-6"
          >
            Управление врачами
          </a>
        </div>

        <div className="grid gap-3 md:hidden">
          {projects.map((p) => (
            <div key={p.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-bold uppercase text-gray-400">{new Date(p.created_at).toLocaleDateString()}</div>
                  <div className="break-words text-lg font-bold text-gray-800">{p.patient_name}</div>
                </div>
                {p.unread_sketches_count > 0 && (
                  <span className="shrink-0 rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
                    +{p.unread_sketches_count}
                  </span>
                )}
              </div>
              <div className="mb-4 grid gap-2 text-sm">
                <div>
                  <span className="text-gray-400">Врач:</span>{' '}
                  <span className="font-semibold text-blue-700">{p.doctor_display_name || 'Не указан'}</span>
                </div>
                <div>
                  <span className="text-gray-400">Клиника:</span>{' '}
                  <span className="font-semibold text-green-700">{getClinicName(p)}</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => copyLink(p)}
                    className="flex-1 rounded bg-indigo-600 px-2 py-2 text-xs font-bold uppercase text-white"
                  >
                    Ссылка
                  </button>
                  {p.is_public && (
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-emerald-200 bg-emerald-50 text-sm text-emerald-700"
                      title="Открытая сцена"
                    >
                      🔓
                    </span>
                  )}
                </div>
                <button
                  onClick={() => window.open(`/viewer/${p.id}?mode=sketches`, '_blank')}
                  className="rounded bg-orange-500 px-2 py-2 text-xs font-bold uppercase text-white"
                >
                  Скетчи
                </button>
                <button
                  onClick={() => {
                    setEditingProject(p);
                    fetchProjectDetails(p.id);
                    setEditModalOpen(true);
                  }}
                  className="rounded bg-gray-500 px-2 py-2 text-xs font-bold uppercase text-white"
                >
                  Ред.
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="hidden overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg md:block">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="p-4 font-bold text-gray-600 text-xs uppercase">Дата</th>
                <th className="p-4 font-bold text-gray-600 text-xs uppercase">Пациент</th>
                <th className="p-4 font-bold text-gray-600 text-xs uppercase">Врач</th>
                <th className="p-4 font-bold text-gray-600 text-xs uppercase">Клиника</th>
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
                  <td className="p-4">
                    <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-[10px] font-black uppercase">
                      {getClinicName(p)}
                    </span>
                  </td>
                  <td className="p-4 flex justify-center gap-2">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => copyLink(p)}
                        className="bg-indigo-600 text-white px-3 py-1.5 rounded text-[10px] font-bold uppercase"
                      >
                        Ссылка
                      </button>
                      {p.is_public && (
                        <span
                          className="flex h-7 w-7 items-center justify-center rounded border border-emerald-200 bg-emerald-50 text-sm text-emerald-700"
                          title="Открытая сцена"
                        >
                          🔓
                        </span>
                      )}
                    </div>
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
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-gray-200 bg-white p-4 shadow-2xl sm:max-w-[32rem] sm:rounded-2xl sm:p-6">
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

            <label className="mb-6 flex cursor-pointer items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-left">
              <input
                type="checkbox"
                checked={Boolean(editingProject.is_public)}
                onChange={(e) =>
                  setEditingProject({ ...editingProject, is_public: e.target.checked })
                }
                className="mt-1 h-5 w-5 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span>
                <span className="block text-sm font-bold text-emerald-900">
                  Сделать проект открытым
                </span>
                <span className="block text-xs leading-5 text-emerald-800">
                  Ссылка на просмотр будет открываться без входа и пароля.
                </span>
              </span>
            </label>

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
                      className="flex items-center justify-between gap-2 rounded bg-gray-50 p-2"
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
                className="w-full text-sm text-gray-500 file:mb-2 file:mr-4 file:rounded file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100 sm:file:mb-0"
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
                className="mb-3 w-full cursor-pointer text-sm text-gray-500 file:mb-2 file:mr-4 file:rounded file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-blue-700 sm:file:mb-0"
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

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                onClick={() => {
                  setEditModalOpen(false);
                  setNewFiles(null);
                  setSketchFiles(null);
                }}
                className="rounded-lg bg-gray-100 px-4 py-3 text-gray-700 hover:bg-gray-200 sm:py-2"
              >
                Отмена
              </button>
              <button
                onClick={handleUpdateProject}
                disabled={loading}
                className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 font-bold text-white hover:bg-blue-700 disabled:bg-blue-300 sm:py-2"
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
