import React, { useEffect, useState } from 'react';

export const AdminDashboard: React.FC = () => {
  const [projects, setProjects] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isEditModalOpen, setEditModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<any>(null);

  // New states for file management
  const [existingFiles, setExistingFiles] = useState<any[]>([]);
  const [newFiles, setNewFiles] = useState<FileList | null>(null);
  const [loading, setLoading] = useState(false);

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

  const getAuthHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem('token')}`,
    'Content-Type': 'application/json',
  });

  const fetchProjects = () => {
    fetch(`${import.meta.env.VITE_API_URL}/api/projects/list`, {
      headers: getAuthHeaders(),
    })
      .then((res) => {
        if (res.status === 401) window.location.href = '/';
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data)) setProjects(data);
      })
      .catch(() => console.error('Ошибка загрузки проектов'));
  };

  const fetchDoctors = () => {
    fetch(`${import.meta.env.VITE_API_URL}/api/doctors`, {
      headers: getAuthHeaders(),
    })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setDoctors(data);
      })
      .catch(() => console.error('Ошибка загрузки врачей'));
  };

  // Fetch detailed project info including STL files
  const fetchProjectDetails = (id: string) => {
    fetch(`${import.meta.env.VITE_API_URL}/api/projects/${id}`, {
      headers: getAuthHeaders(),
    })
      .then((res) => res.json())
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
        `${import.meta.env.VITE_API_URL}/api/projects/${editingProject.id}/delete-file`,
        {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ fileName }),
        }
      );
      if (res.ok) {
        setExistingFiles((prev) => prev.filter((f) => f.name !== fileName));
      } else {
        alert('Ошибка при удалении файла');
      }
    } catch {
      alert('Ошибка сети');
    }
  };

  // Updated update handler with file upload support
  const handleUpdateProject = async () => {
    if (!editingProject) return;
    setLoading(true);

    const doc = doctors.find((d) => d.id === editingProject.doctor_id);

    const data = new FormData();
    data.append('doctor_id', editingProject.doctor_id);
    data.append('doctor_name', doc ? doc.full_name : 'Unknown');
    data.append('patient_name', editingProject.patient_name);

    if (newFiles) {
      Array.from(newFiles).forEach((file) => data.append('files', file));
    }

    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/api/projects/${editingProject.id}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
            // No Content-Type for FormData
          },
          body: data,
        }
      );

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
              window.location.href = '/';
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
                      className="bg-orange-500 text-white px-3 py-1.5 rounded text-[10px] font-bold uppercase"
                    >
                      Скетчи
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

            {/* File management section */}
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
                Добавить новые STL-файлы
              </label>
              <input
                type="file"
                multiple
                accept=".stl"
                onChange={(e) => setNewFiles(e.target.files)}
                className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setEditModalOpen(false);
                  setNewFiles(null);
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
                {loading ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};