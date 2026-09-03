import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clearSession, getAuthHeaders as buildAuthHeaders, getSession } from '../../utils/authSession';
import {
  ACCENT_COLORS,
  ADMIN_ACCENT_STORAGE_KEY,
  ADMIN_THEME_STORAGE_KEY,
  isAccentColor,
  readStoredValue,
  type AccentColor,
  type AdminTheme,
} from '../../utils/uiTheme';
import { DoctorIcon, FolderIcon, SettingsIcon } from '../ui/AppIcons';

type AdminView = 'projects' | 'doctors' | 'settings';

type ProjectFolder = {
  id: string;
  name: string;
};

const DEFAULT_PROJECT_FOLDERS: ProjectFolder[] = [
  { id: 'archive', name: 'Архив' },
];

const isFolderList = (value: unknown): value is ProjectFolder[] => {
  return Array.isArray(value) && value.every((item) => {
    if (!item || typeof item !== 'object') return false;
    const folder = item as Partial<ProjectFolder>;
    return typeof folder.id === 'string' && typeof folder.name === 'string';
  });
};

export const AdminDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isEditModalOpen, setEditModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<any>(null);
  const [toastMessage, setToastMessage] = useState('');
  const [linkCopiedNotice, setLinkCopiedNotice] = useState(false);
  const [emptySketchNotice, setEmptySketchNotice] = useState(false);
  const [activeView, setActiveView] = useState<AdminView>(() => (
    new URLSearchParams(window.location.search).get('view') === 'settings' ? 'settings' : 'projects'
  ));
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFolderId, setActiveFolderId] = useState('all');
  const [newFolderName, setNewFolderName] = useState('');
  const [menuProjectId, setMenuProjectId] = useState<string | null>(null);
  const [isHeaderMenuOpen, setHeaderMenuOpen] = useState(false);
  const [isCreateButtonVisible, setCreateButtonVisible] = useState(true);
  const lastContentScrollTopRef = useRef(0);
  const [theme, setTheme] = useState<AdminTheme>(() => (
    readStoredValue<AdminTheme>(ADMIN_THEME_STORAGE_KEY, 'light')
  ));
  const [accent, setAccent] = useState<AccentColor>(() => {
    const storedAccent = readStoredValue<unknown>(ADMIN_ACCENT_STORAGE_KEY, 'rose');
    return isAccentColor(storedAccent) ? storedAccent : 'rose';
  });
  const [folders, setFolders] = useState<ProjectFolder[]>(DEFAULT_PROJECT_FOLDERS);
  const [projectFolders, setProjectFolders] = useState<Record<string, string>>({});
  const [isFolderLayoutLoaded, setFolderLayoutLoaded] = useState(false);

  // States for file management (STL)
  const [existingFiles, setExistingFiles] = useState<any[]>([]);
  const [existingPatterns, setExistingPatterns] = useState<any[]>([]);
  const [newFiles, setNewFiles] = useState<FileList | null>(null);
  const [newPatternFiles, setNewPatternFiles] = useState<FileList | null>(null);
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
    clearSession();
    alert('Сессия истекла. Пожалуйста, войдите снова.');
    window.location.href = '/';
  };

  // Получение заголовков авторизации
  const getAuthHeaders = (contentType = true) => {
    return buildAuthHeaders(contentType);
  };

  useEffect(() => {
    const session = getSession();

    if (!session || session.role !== 'admin') {
      clearSession();
      alert('Доступ запрещен!');
      window.location.href = '/';
      return;
    }
    setIsAuthorized(true);

    fetchProjects();
    fetchDoctors();
    fetchProjectFolders();

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

  useEffect(() => {
    if (!linkCopiedNotice) return;

    const timeoutId = window.setTimeout(() => setLinkCopiedNotice(false), 1700);
    return () => window.clearTimeout(timeoutId);
  }, [linkCopiedNotice]);

  useEffect(() => {
    if (!emptySketchNotice) return;

    const timeoutId = window.setTimeout(() => setEmptySketchNotice(false), 1700);
    return () => window.clearTimeout(timeoutId);
  }, [emptySketchNotice]);

  useEffect(() => {
    window.localStorage.setItem(ADMIN_THEME_STORAGE_KEY, JSON.stringify(theme));
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem(ADMIN_ACCENT_STORAGE_KEY, JSON.stringify(accent));
  }, [accent]);

  useEffect(() => {
    setMenuProjectId(null);
    setHeaderMenuOpen(false);
    setCreateButtonVisible(true);
    lastContentScrollTopRef.current = 0;

    if (activeView !== 'projects') {
      setSearchQuery('');
    }
  }, [activeView]);

  const handleContentScroll = (event: React.UIEvent<HTMLElement>) => {
    const nextScrollTop = event.currentTarget.scrollTop;
    const previousScrollTop = lastContentScrollTopRef.current;

    setMenuProjectId(null);

    if (activeView === 'projects') {
      if (nextScrollTop < 12 || nextScrollTop < previousScrollTop - 1) {
        setCreateButtonVisible(true);
      } else if (nextScrollTop > previousScrollTop + 1) {
        setCreateButtonVisible(false);
      }
    }

    lastContentScrollTopRef.current = nextScrollTop;
  };

  useEffect(() => {
    if (!menuProjectId && !isHeaderMenuOpen) return;

    const closeOpenMenus = () => {
      setMenuProjectId(null);
      setHeaderMenuOpen(false);
    };

    document.addEventListener('click', closeOpenMenus);
    return () => document.removeEventListener('click', closeOpenMenus);
  }, [isHeaderMenuOpen, menuProjectId]);

  useEffect(() => {
    if (!isFolderLayoutLoaded) return;

    const timeoutId = window.setTimeout(() => {
      saveProjectFolders(folders, projectFolders);
    }, 350);

    return () => window.clearTimeout(timeoutId);
  }, [folders, isFolderLayoutLoaded, projectFolders]);

  useEffect(() => {
    if (activeFolderId === 'all') return;
    if (!folders.some((folder) => folder.id === activeFolderId)) {
      setActiveFolderId('all');
    }
  }, [activeFolderId, folders]);

  useEffect(() => {
    if (projects.length === 0) return;

    setProjectFolders((current) => {
      const availableProjects = new Set(projects.map((project) => String(project.id)));
      const availableFolders = new Set(folders.map((folder) => folder.id));
      let changed = false;
      const next: Record<string, string> = {};

      Object.entries(current).forEach(([projectId, folderId]) => {
        if (availableProjects.has(projectId) && availableFolders.has(folderId)) {
          next[projectId] = folderId;
        } else {
          changed = true;
        }
      });

      return changed ? next : current;
    });
  }, [folders, projects]);

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

  const fetchProjectFolders = () => {
    fetch(`${import.meta.env.VITE_API_URL}/projects/folders`, {
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
        if (!data || typeof data !== 'object') return;

        if (isFolderList(data.folders)) {
          setFolders(data.folders.length > 0 ? data.folders : DEFAULT_PROJECT_FOLDERS);
        }

        if (
          data.projectFolders &&
          typeof data.projectFolders === 'object' &&
          !Array.isArray(data.projectFolders)
        ) {
          setProjectFolders(data.projectFolders);
        }
      })
      .catch(() => console.error('Ошибка загрузки папок проектов'))
      .finally(() => setFolderLayoutLoaded(true));
  };

  const saveProjectFolders = (
    nextFolders: ProjectFolder[],
    nextProjectFolders: Record<string, string>
  ) => {
    fetch(`${import.meta.env.VITE_API_URL}/projects/folders`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        folders: nextFolders,
        projectFolders: nextProjectFolders,
      }),
    })
      .then((res) => {
        if (res.status === 401 || res.status === 403) {
          handleUnauthorized();
          return;
        }

        if (!res.ok) {
          throw new Error('Не удалось сохранить папки');
        }
      })
      .catch(() => setToastMessage('Не удалось сохранить папки'));
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
        if (data.patterns) setExistingPatterns(data.patterns);
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
        .then(() => setLinkCopiedNotice(true))
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
          setLinkCopiedNotice(true);
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

  const handleDeletePattern = async (patternId: string, patternName: string) => {
    if (!editingProject || !window.confirm(`Удалить лекало ${patternName}?`)) return;

    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/projects/${editingProject.id}/delete-pattern`,
        {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ patternId }),
        }
      );

      if (res.status === 401 || res.status === 403) {
        handleUnauthorized();
        return;
      }

      if (res.ok) {
        setExistingPatterns((previous) => previous.filter((pattern) => pattern.id !== patternId));
      } else {
        alert('Ошибка при удалении лекала');
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

    if (newPatternFiles) {
      Array.from(newPatternFiles).forEach((file) => data.append('patterns', file));
    }

    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/projects/${editingProject.id}`,
        {
          method: 'PUT',
          headers: getAuthHeaders(false),
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
        setNewPatternFiles(null);
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
          headers: getAuthHeaders(false),
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

  const getProjectFolderId = (project: any): string => (
    projectFolders[String(project.id)] || ''
  );

  const getFolderName = (folderId: string): string => {
    if (!folderId) return '';
    return folders.find((folder) => folder.id === folderId)?.name || '';
  };

  const formatProjectDate = (value: string | number | Date | null | undefined) => {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return '';

    return date.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: 'short',
    });
  };

  const formatProjectTime = (value: string | number | Date | null | undefined) => {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return '';

    return date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const searchText = searchQuery.trim().toLocaleLowerCase('ru-RU');

  const projectMatchesSearch = (project: any) => {
    if (!searchText) return true;

    const fields = [
      project.patient_name,
      project.doctor_display_name,
      getClinicName(project),
      getFolderName(getProjectFolderId(project)),
      formatProjectDate(project.created_at),
    ];

    return fields.some((field) => (
      String(field || '').toLocaleLowerCase('ru-RU').includes(searchText)
    ));
  };

  const getFolderCount = (folderId: string) => {
    if (folderId === 'all') return projects.length;

    return projects.filter((project) => getProjectFolderId(project) === folderId).length;
  };

  const searchedProjects = projects.filter(projectMatchesSearch);
  const visibleProjects = searchedProjects.filter((project) => {
    if (activeFolderId === 'all') return true;
    return getProjectFolderId(project) === activeFolderId;
  });
  const folderTabs = [
    { id: 'all', name: 'Все', count: getFolderCount('all') },
    ...folders.map((folder) => ({
      ...folder,
      count: getFolderCount(folder.id),
    })),
  ];

  const openSketches = (project: any) => {
    setMenuProjectId(null);

    if (Number(project.sketches_count) === 0) {
      setEmptySketchNotice(false);
      window.requestAnimationFrame(() => setEmptySketchNotice(true));
      return;
    }

    window.open(`/viewer/${project.id}?mode=sketches`, '_blank', 'noopener,noreferrer');
  };

  const openEditProject = (project: any) => {
    setMenuProjectId(null);
    setEditingProject(project);
    setExistingFiles([]);
    setExistingPatterns([]);
    setNewFiles(null);
    setNewPatternFiles(null);
    fetchProjectDetails(project.id);
    setEditModalOpen(true);
  };

  const addFolder = () => {
    const folderName = newFolderName.trim();
    if (!folderName) return;

    const normalizedName = folderName.toLocaleLowerCase('ru-RU');
    if (folders.some((folder) => folder.name.toLocaleLowerCase('ru-RU') === normalizedName)) {
      setToastMessage('Такая папка уже есть');
      return;
    }

    const folderId = `folder-${Date.now()}`;
    setFolders((current) => [...current, { id: folderId, name: folderName }]);
    setNewFolderName('');
    setActiveFolderId(folderId);
    setToastMessage('Папка создана');
  };

  const deleteFolder = (folderId: string) => {
    const folderName = getFolderName(folderId);
    if (!window.confirm(`Удалить папку "${folderName}"? Проекты останутся без папки.`)) return;

    setFolders((current) => current.filter((folder) => folder.id !== folderId));
    setProjectFolders((current) => {
      const next = { ...current };
      Object.entries(next).forEach(([projectId, currentFolderId]) => {
        if (currentFolderId === folderId) delete next[projectId];
      });
      return next;
    });
    setActiveFolderId((current) => (current === folderId ? 'all' : current));
    setToastMessage('Папка удалена');
  };

  const assignProjectToFolder = (projectId: string | number, folderId: string) => {
    setProjectFolders((current) => {
      const next = { ...current };
      if (folderId) {
        next[String(projectId)] = folderId;
      } else {
        delete next[String(projectId)];
      }
      return next;
    });
  };

  const handleLogout = () => {
    clearSession();
    navigate('/', { replace: true });
  };

  const toggleTheme = () => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
    setHeaderMenuOpen(false);
  };

  const openCreateProject = () => {
    window.open('/admin/create-project', '_blank', 'noopener,noreferrer');
  };

  const openDoctorsManagement = () => {
    navigate('/admin/doctors');
  };

  const isDarkTheme = theme === 'dark';
  const currentAccent = ACCENT_COLORS[accent];
  const pageClass = isDarkTheme
    ? 'min-h-screen bg-neutral-950 text-neutral-100 font-sans'
    : 'min-h-screen bg-[#eef1f3] text-slate-950 font-sans';
  const shellClass = isDarkTheme
    ? 'mx-auto flex h-screen w-full max-w-[1180px] flex-col overflow-hidden bg-neutral-950 shadow-[0_18px_60px_rgba(0,0,0,0.35)]'
    : 'mx-auto flex h-screen w-full max-w-[1180px] flex-col overflow-hidden bg-white shadow-[0_18px_60px_rgba(15,23,42,0.12)]';
  const headerClass = isDarkTheme
    ? 'shrink-0 bg-neutral-950 px-4 pb-5 pt-4 lg:px-6'
    : 'shrink-0 bg-white px-4 pb-5 pt-4 lg:px-6';
  const primaryTextClass = isDarkTheme ? 'text-neutral-100' : 'text-slate-950';
  const secondaryTextClass = isDarkTheme ? 'text-neutral-400' : 'text-slate-500';
  const mutedTextClass = isDarkTheme ? 'text-neutral-500' : 'text-slate-400';
  const searchClass = isDarkTheme
    ? 'mt-4 flex h-11 items-center gap-2 rounded-full bg-neutral-900 px-4 text-neutral-400 shadow-inner ring-1 ring-neutral-800'
    : 'mt-4 flex h-11 items-center gap-2 rounded-full bg-[#f1f1f3] px-4 text-slate-500 shadow-inner';
  const pillPanelClass = isDarkTheme
    ? 'rounded-full bg-neutral-900 p-1 shadow-[0_3px_14px_rgba(0,0,0,0.25)] ring-1 ring-neutral-800'
    : 'rounded-full bg-white p-1 shadow-[0_3px_14px_rgba(15,23,42,0.13)] ring-1 ring-slate-100';
  const menuClass = isDarkTheme
    ? 'absolute right-2 top-0 z-20 w-44 overflow-hidden rounded-2xl bg-neutral-900 py-1.5 text-left shadow-2xl ring-1 ring-neutral-700'
    : 'absolute right-2 top-0 z-20 w-44 overflow-hidden rounded-2xl bg-white py-1.5 text-left shadow-2xl ring-1 ring-slate-100';
  const menuButtonClass = isDarkTheme
    ? 'block w-full px-3.5 py-2.5 text-left text-xs font-bold text-neutral-100 transition hover:bg-neutral-800'
    : 'block w-full px-3.5 py-2.5 text-left text-xs font-bold text-slate-800 transition hover:bg-slate-50';
const tableClass = isDarkTheme
  ? 'hidden overflow-visible rounded-[1.35rem] bg-neutral-900 shadow-sm ring-1 ring-neutral-800 lg:block'
  : 'hidden overflow-visible rounded-[1.35rem] bg-white shadow-sm ring-1 ring-slate-100 lg:block';
  const tableHeadClass = isDarkTheme
    ? 'bg-neutral-900/80 text-neutral-400'
    : 'bg-slate-50 text-slate-500';
  const tableRowClass = isDarkTheme
    ? 'cursor-pointer border-t border-neutral-800 transition hover:bg-neutral-800/65'
    : 'cursor-pointer border-t border-slate-100 transition hover:bg-slate-50';
  const navClass = isDarkTheme
    ? 'rough-glass rough-glass-dark liquid-nav liquid-nav-dark fixed bottom-4 left-1/2 z-40 grid w-[calc(100%-2rem)] max-w-[390px] -translate-x-1/2 grid-cols-3 gap-1.5 rounded-full p-1.5'
    : 'rough-glass liquid-nav fixed bottom-4 left-1/2 z-40 grid w-[calc(100%-2rem)] max-w-[390px] -translate-x-1/2 grid-cols-3 gap-1.5 rounded-full p-1.5';

  if (!isAuthorized) return null;

  return (
    <div className={pageClass}>
      {toastMessage && (
        <div className="fixed left-1/2 top-4 z-[70] w-[calc(100%-2rem)] max-w-[320px] -translate-x-1/2 rounded-full bg-slate-950 px-4 py-2 text-center text-xs font-bold text-white shadow-xl">
          {toastMessage}
        </div>
      )}

      {emptySketchNotice && (
        <div
          role="status"
          aria-live="polite"
          className={`quick-glass-notice rough-glass pointer-events-none fixed left-1/2 top-1/2 z-[70] w-[calc(100%-3rem)] max-w-[280px] -translate-x-1/2 -translate-y-1/2 rounded-2xl px-5 py-4 text-center ${
            isDarkTheme ? 'rough-glass-dark text-neutral-100' : 'text-slate-900'
          }`}
        >
          <div className="text-2xl font-light leading-none" style={{ color: currentAccent.color }}>×</div>
          <div className="mt-2 text-sm font-black leading-5">
            У этого проекта ещё нет комментариев
          </div>
        </div>
      )}

      {linkCopiedNotice && (
        <div
          role="status"
          aria-live="polite"
          className={`quick-glass-notice rough-glass pointer-events-none fixed left-1/2 top-1/2 z-[70] w-[calc(100%-3rem)] max-w-[280px] -translate-x-1/2 -translate-y-1/2 rounded-2xl px-5 py-4 text-center ${
            isDarkTheme ? 'rough-glass-dark text-neutral-100' : 'text-slate-900'
          }`}
        >
          <div className="text-2xl font-black leading-none text-emerald-500">✓</div>
          <div className="mt-2 text-sm font-black leading-5">Ссылка скопирована</div>
        </div>
      )}

      <div className={shellClass}>
        <header className={headerClass}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1
                className="truncate text-[1.35rem] font-black leading-tight tracking-normal lg:text-[1.55rem]"
                style={{ color: currentAccent.color }}
              >
                MeshBridge
              </h1>
              <div className={`mt-1 text-[0.68rem] font-bold uppercase tracking-normal ${mutedTextClass}`}>
                ADMIN
              </div>
            </div>
            <div className="relative">
              <button
                type="button"
                aria-label="Меню аккаунта"
                title="Меню аккаунта"
                onClick={(event) => {
                  event.stopPropagation();
                  setHeaderMenuOpen((current) => !current);
                }}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-2xl font-black leading-none transition ${
                  isDarkTheme ? 'text-neutral-100 hover:bg-neutral-800' : 'text-slate-950 hover:bg-slate-100'
                }`}
              >
                ⋮
              </button>
              {isHeaderMenuOpen && (
                <div
                  onClick={(event) => event.stopPropagation()}
                  className={isDarkTheme
                    ? 'absolute right-0 top-10 z-30 w-52 overflow-hidden rounded-2xl bg-neutral-900 py-1.5 shadow-2xl ring-1 ring-neutral-700'
                    : 'absolute right-0 top-10 z-30 w-52 overflow-hidden rounded-2xl bg-white py-1.5 shadow-2xl ring-1 ring-slate-100'}
                >
                  <button
                    type="button"
                    onClick={toggleTheme}
                    className={menuButtonClass}
                  >
                    {isDarkTheme ? 'Светлая тема' : 'Темная тема'}
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className={menuButtonClass}
                  >
                    Выйти
                  </button>
                </div>
              )}
            </div>
          </div>

          {activeView === 'projects' && (
            <label className={searchClass}>
              <span className={`text-xl leading-none ${secondaryTextClass}`}>⌕</span>
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Поиск проектов"
                className={`min-w-0 flex-1 bg-transparent text-base font-medium tracking-normal outline-none placeholder:text-slate-400 ${
                  isDarkTheme ? 'text-neutral-100' : 'text-slate-900'
                }`}
              />
            </label>
          )}
        </header>

        <main
          className="min-h-0 flex-1 overflow-y-auto px-4 pb-36 pt-1 lg:px-6 lg:pb-32"
          onScroll={handleContentScroll}
        >
          {activeView === 'projects' && (
            <>
              <div className={pillPanelClass}>
                <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {folderTabs.map((folder) => {
                    const isActive = activeFolderId === folder.id;
                    return (
                      <button
                        key={folder.id}
                        type="button"
                        onClick={() => setActiveFolderId(folder.id)}
                        className={`flex min-w-max items-center gap-1.5 rounded-full px-3 py-2 text-sm font-bold ring-1 ring-transparent transition ${
                          isActive
                            ? ''
                            : `${secondaryTextClass} ${isDarkTheme ? 'hover:bg-neutral-800 hover:ring-neutral-700' : 'hover:bg-slate-50 hover:ring-slate-200'}`
                        }`}
                        style={isActive ? { backgroundColor: currentAccent.soft, color: currentAccent.color } : undefined}
                      >
                        <span>{folder.name}</span>
                        <span
                          className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[0.68rem] ${
                            isActive ? 'text-white' : isDarkTheme ? 'bg-neutral-700 text-neutral-300' : 'bg-slate-200 text-slate-500'
                          }`}
                          style={isActive ? { backgroundColor: currentAccent.color } : undefined}
                        >
                          {folder.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <section className="mt-5 lg:mt-6">
                {visibleProjects.length === 0 ? (
                  <div className={`rounded-[1.25rem] border border-dashed px-4 py-7 text-center ${
                    isDarkTheme ? 'border-neutral-700 bg-neutral-900' : 'border-slate-200 bg-slate-50'
                  }`}>
                    <div className={`text-base font-bold ${primaryTextClass}`}>Проекты не найдены</div>
                    <div className={`mt-1.5 text-xs leading-5 ${secondaryTextClass}`}>
                      Проверьте поиск или выберите другую папку.
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="lg:hidden">
                      {visibleProjects.map((project) => (
                        <div
                          key={project.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => openSketches(project)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              openSketches(project);
                            }
                          }}
                          className={`relative mb-2 cursor-pointer rounded-2xl px-3.5 py-3 outline-none ring-1 transition ${
                            isDarkTheme
                              ? 'bg-neutral-900 ring-neutral-800 hover:bg-neutral-800/80 focus-visible:bg-neutral-800/80'
                              : 'bg-white ring-slate-100 hover:bg-slate-50 focus-visible:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <h2 className={`min-w-0 flex-1 truncate text-base font-black leading-tight ${primaryTextClass}`}>
                              {project.patient_name || 'Без имени'}
                            </h2>
                            <div className="flex shrink-0 flex-col items-end gap-1.5">
                              <div className="flex items-start gap-1">
                                <div className={`pt-0.5 text-right text-xs font-medium ${mutedTextClass}`}>
                                  <div>{formatProjectDate(project.created_at)}</div>
                                  <div className="mt-0.5">{formatProjectTime(project.created_at)}</div>
                                </div>
                                <button
                                  type="button"
                                  aria-label="Действия проекта"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setMenuProjectId((current) => (
                                      current === String(project.id) ? null : String(project.id)
                                    ));
                                  }}
                                  className={`flex h-8 w-7 items-center justify-center rounded-full text-xl font-black leading-none transition ${
                                    isDarkTheme ? 'text-neutral-300 hover:bg-neutral-800' : 'text-slate-500 hover:bg-slate-100'
                                  }`}
                                >
                                  ⋮
                                </button>
                              </div>
                              {Number(project.unread_sketches_count) > 0 && (
                                <span
                                  className="flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[0.68rem] font-black text-white shadow-sm"
                                  style={{ backgroundColor: currentAccent.color }}
                                >
                                  +{project.unread_sketches_count}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="mt-2 space-y-1">
                            <div className={`truncate text-sm ${secondaryTextClass}`}>
                              <span className={mutedTextClass}>Врач:</span>{' '}
                              <span className="font-bold">{project.doctor_display_name || 'не указан'}</span>
                            </div>
                            <div className={`truncate text-sm ${secondaryTextClass}`}>
                              <span className={mutedTextClass}>Клиника:</span>{' '}
                              <span className="font-bold">{getClinicName(project)}</span>
                            </div>
                          </div>

                          <div className="mt-3 flex min-w-0 flex-wrap items-center gap-1.5">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  copyLink(project);
                                }}
                                className="rounded-full px-2.5 py-1 text-xs font-black transition"
                                style={{ backgroundColor: currentAccent.soft, color: currentAccent.color }}
                              >
                                Ссылка
                              </button>
                              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                                isDarkTheme ? 'bg-neutral-800 text-neutral-300' : 'bg-slate-100 text-slate-500'
                              }`}>
                                {getFolderName(getProjectFolderId(project)) || 'Без папки'}
                              </span>
                              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${
                                project.is_public
                                  ? isDarkTheme
                                    ? 'bg-emerald-950/70 text-emerald-300 ring-emerald-800'
                                    : 'bg-emerald-50 text-emerald-700 ring-emerald-100'
                                  : isDarkTheme
                                    ? 'bg-rose-950/70 text-rose-300 ring-rose-800'
                                    : 'bg-rose-50 text-rose-700 ring-rose-100'
                              }`}>
                                {project.is_public ? 'Открыт' : 'Закрыт'}
                              </span>
                          </div>

                          {menuProjectId === String(project.id) && (
                            <div onClick={(event) => event.stopPropagation()} className={menuClass}>
                              <button type="button" onClick={() => openEditProject(project)} className={menuButtonClass}>
                                Редактировать
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setMenuProjectId(null);
                                  copyLink(project);
                                }}
                                className={menuButtonClass}
                              >
                                Копировать ссылку
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className={tableClass}>
                      <table className="w-full table-fixed text-left">
                        <thead className={tableHeadClass}>
                          <tr className="text-[0.68rem] font-black uppercase">
                            <th className="w-[13%] px-4 py-3">Дата</th>
                            <th className="w-[22%] px-4 py-3">Проект</th>
                            <th className="w-[18%] px-4 py-3">Врач</th>
                            <th className="w-[18%] px-4 py-3">Клиника</th>
                            <th className="w-[12%] px-4 py-3">Сцена</th>
                            <th className="w-[10%] px-4 py-3">Папка</th>
                            <th className="w-[7%] px-4 py-3 text-right">Еще</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleProjects.map((project) => (
                            <tr
                              key={project.id}
                              onClick={() => openSketches(project)}
                              className={tableRowClass}
                            >
                              <td className={`px-4 py-3 text-xs ${secondaryTextClass}`}>
                                <div>{formatProjectDate(project.created_at)}</div>
                                <div className={mutedTextClass}>{formatProjectTime(project.created_at)}</div>
                              </td>
                              <td className={`truncate px-4 py-3 text-sm font-black ${primaryTextClass}`}>
                                {project.patient_name || 'Без имени'}
                              </td>
                              <td className={`truncate px-4 py-3 text-sm ${secondaryTextClass}`}>
                                {project.doctor_display_name || 'Не указан'}
                              </td>
                              <td className={`truncate px-4 py-3 text-sm ${secondaryTextClass}`}>
                                {getClinicName(project)}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-black ring-1 ${
                                  project.is_public
                                    ? isDarkTheme
                                      ? 'bg-emerald-950/70 text-emerald-300 ring-emerald-800'
                                      : 'bg-emerald-50 text-emerald-700 ring-emerald-100'
                                    : isDarkTheme
                                      ? 'bg-rose-950/70 text-rose-300 ring-rose-800'
                                      : 'bg-rose-50 text-rose-700 ring-rose-100'
                                }`}>
                                  {project.is_public ? 'Открыта' : 'Закрыта'}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                                  isDarkTheme ? 'bg-neutral-800 text-neutral-300' : 'bg-slate-100 text-slate-600'
                                }`}>
                                  {getFolderName(getProjectFolderId(project)) || '—'}
                                </span>
                              </td>
                              <td className="relative px-4 py-3 text-right">
                                <div className="relative inline-flex">
                                  {Number(project.unread_sketches_count) > 0 && (
                                    <span
                                      className={`absolute left-[calc(100%+0.25rem)] top-1/2 z-10 flex h-6 min-w-6 -translate-y-1/2 items-center justify-center rounded-full px-1 text-[0.65rem] font-black text-white shadow-sm ring-2 ${
                                        isDarkTheme ? 'ring-neutral-900' : 'ring-white'
                                      }`}
                                      style={{ backgroundColor: currentAccent.color }}
                                      title={`Новых заметок: ${project.unread_sketches_count}`}
                                    >
                                      +{project.unread_sketches_count}
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    aria-label="Действия проекта"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setMenuProjectId((current) => (
                                        current === String(project.id) ? null : String(project.id)
                                      ));
                                    }}
                                    className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-xl font-black leading-none transition ${
                                      isDarkTheme ? 'text-neutral-300 hover:bg-neutral-800' : 'text-slate-500 hover:bg-slate-100'
                                    }`}
                                  >
                                    ⋮
                                  </button>
                                </div>
                                {menuProjectId === String(project.id) && (
                                  <div onClick={(event) => event.stopPropagation()} className={menuClass}>
                                    <button type="button" onClick={() => openEditProject(project)} className={menuButtonClass}>
                                      Редактировать
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setMenuProjectId(null);
                                        copyLink(project);
                                      }}
                                      className={menuButtonClass}
                                    >
                                      Копировать ссылку
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </section>
            </>
          )}

          {activeView === 'doctors' && (
            <section>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className={`text-xl font-black tracking-normal ${primaryTextClass}`}>Врачи</h2>
                  <div className={`mt-1 text-xs font-bold ${mutedTextClass}`}>
                    {doctors.length} в сервисе
                  </div>
                </div>
                <button
                  type="button"
                  onClick={openDoctorsManagement}
                  className="rounded-full px-3.5 py-2 text-xs font-black text-white shadow-sm transition"
                  style={{ backgroundColor: currentAccent.color }}
                >
                  Управление
                </button>
              </div>

              <div className={`mt-4 divide-y ${isDarkTheme ? 'divide-neutral-800' : 'divide-slate-100'}`}>
                {doctors.length === 0 ? (
                  <div className={`rounded-[1.25rem] border border-dashed px-4 py-7 text-center text-sm ${
                    isDarkTheme ? 'border-neutral-700 bg-neutral-900 text-neutral-400' : 'border-slate-200 bg-slate-50 text-slate-500'
                  }`}>
                    Врачи не загружены
                  </div>
                ) : (
                  doctors.map((doctor) => (
                    <div key={doctor.id} className="py-3">
                      <div className={`truncate text-base font-black ${primaryTextClass}`}>
                        {doctor.full_name}
                      </div>
                      <div className={`mt-1 truncate text-sm font-medium ${secondaryTextClass}`}>
                        {[doctor.clinic, doctor.city].filter(Boolean).join(', ') || doctor.login}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}

          {activeView === 'settings' && (
            <section className="space-y-6">
              <div>
                <h2 className={`text-xl font-black tracking-normal ${primaryTextClass}`}>Настройки</h2>
                <div className={`mt-1 text-xs font-bold ${mutedTextClass}`}>
                  Папки и распределение проектов
                </div>

                <div className="mt-4">
                  <div className={`mb-2 text-xs font-black uppercase ${mutedTextClass}`}>
                    Цвет контраста
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(Object.entries(ACCENT_COLORS) as Array<[AccentColor, { name: string; color: string; soft: string }]>).map(([colorId, color]) => {
                      const isSelected = accent === colorId;
                      return (
                        <button
                          key={colorId}
                          type="button"
                          onClick={() => setAccent(colorId)}
                          className={`flex items-center gap-2 rounded-full px-3 py-2 text-xs font-black transition ${
                            isDarkTheme ? 'bg-neutral-900 text-neutral-100 ring-1 ring-neutral-800' : 'bg-white text-slate-800 ring-1 ring-slate-100'
                          }`}
                          style={isSelected ? { boxShadow: `0 0 0 2px ${color.color}` } : undefined}
                        >
                          <span
                            className="h-4 w-4 rounded-full"
                            style={{ backgroundColor: color.color }}
                          />
                          {color.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <form
                  className={`mt-4 flex gap-1.5 rounded-full p-1 ${
                    isDarkTheme ? 'bg-neutral-900 ring-1 ring-neutral-800' : 'bg-[#f1f1f3]'
                  }`}
                  onSubmit={(event) => {
                    event.preventDefault();
                    addFolder();
                  }}
                >
                  <input
                    value={newFolderName}
                    onChange={(event) => setNewFolderName(event.target.value)}
                    placeholder="Новая папка"
                    className={`min-w-0 flex-1 rounded-full bg-transparent px-3 text-sm font-bold outline-none placeholder:text-slate-400 ${
                      isDarkTheme ? 'text-neutral-100' : 'text-slate-900'
                    }`}
                  />
                  <button
                    type="submit"
                    disabled={!newFolderName.trim()}
                    className="rounded-full px-4 py-2 text-xs font-black text-white shadow-sm transition disabled:bg-slate-300"
                    style={{ backgroundColor: newFolderName.trim() ? currentAccent.color : undefined }}
                  >
                    Создать
                  </button>
                </form>

                <div className="mt-3 grid gap-2 lg:grid-cols-3">
                  {folders.length === 0 ? (
                    <div className={`rounded-2xl px-4 py-4 text-sm font-medium ${
                      isDarkTheme ? 'bg-neutral-900 text-neutral-400' : 'bg-slate-50 text-slate-500'
                    }`}>
                      Папок пока нет
                    </div>
                  ) : (
                    folders.map((folder) => (
                      <div
                        key={folder.id}
                        className={`flex items-center justify-between gap-3 rounded-2xl px-3.5 py-3 ${
                          isDarkTheme ? 'bg-neutral-900 ring-1 ring-neutral-800' : 'bg-slate-50'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className={`truncate text-sm font-black ${primaryTextClass}`}>
                            {folder.name}
                          </div>
                          <div className={`mt-0.5 text-xs font-bold ${mutedTextClass}`}>
                            {getFolderCount(folder.id)} проектов
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteFolder(folder.id)}
                          className={`rounded-full px-3 py-1.5 text-xs font-black text-rose-600 shadow-sm transition ${
                            isDarkTheme ? 'bg-neutral-950 ring-1 ring-rose-900/60 hover:bg-rose-950/30' : 'bg-white ring-1 ring-rose-100 hover:bg-rose-50'
                          }`}
                        >
                          Удалить
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <h3 className={`text-lg font-black tracking-normal ${primaryTextClass}`}>
                  Проекты в папках
                </h3>
                <div className="mt-3 grid gap-2 lg:grid-cols-2">
                  {projects.length === 0 ? (
                    <div className={`rounded-2xl border border-dashed px-4 py-5 text-center text-sm font-medium ${
                      isDarkTheme ? 'border-neutral-700 bg-neutral-900 text-neutral-400' : 'border-slate-200 bg-slate-50 text-slate-500'
                    }`}>
                      Нет проектов для распределения
                    </div>
                  ) : (
                    projects.map((project) => (
                      <div
                        key={project.id}
                        className={`rounded-2xl px-3.5 py-3 shadow-sm ${
                          isDarkTheme ? 'bg-neutral-900 ring-1 ring-neutral-800' : 'bg-white ring-1 ring-slate-100'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className={`truncate text-sm font-black ${primaryTextClass}`}>
                            {project.patient_name || 'Без имени'}
                          </div>
                          <div className={`mt-1 truncate text-xs font-medium ${secondaryTextClass}`}>
                            {project.doctor_display_name || getClinicName(project)}
                          </div>
                        </div>

                        <select
                          value={getProjectFolderId(project)}
                          onChange={(event) => assignProjectToFolder(project.id, event.target.value)}
                          className={`mt-2 w-full rounded-full border px-3 py-2 text-xs font-bold outline-none ${
                            isDarkTheme
                              ? 'border-neutral-700 bg-neutral-950 text-neutral-100'
                              : 'border-slate-200 bg-slate-50 text-slate-800'
                          }`}
                          style={{ borderColor: getProjectFolderId(project) ? currentAccent.color : undefined }}
                        >
                          <option value="">Убрать из папки</option>
                          {folders.map((folder) => (
                            <option key={folder.id} value={folder.id}>
                              {folder.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>
          )}
        </main>
      </div>

      {activeView === 'projects' && (
        <button
          type="button"
          onClick={openCreateProject}
          className={`fixed bottom-[5.7rem] left-1/2 z-40 flex h-11 w-[calc(100%-5.5rem)] max-w-[270px] -translate-x-1/2 items-center justify-center rounded-full text-sm font-black text-white shadow-[0_16px_30px_rgba(15,23,42,0.22)] transition-all duration-200 ${
            isCreateButtonVisible ? 'scale-100 opacity-100' : 'pointer-events-none scale-95 opacity-0'
          }`}
          style={{ backgroundColor: currentAccent.color }}
        >
          + Добавить проект
        </button>
      )}

      <nav className={navClass}>
        {([
          { id: 'projects', label: 'Проекты', icon: <FolderIcon className="h-5 w-5" /> },
          { id: 'doctors', label: 'Врачи', icon: <DoctorIcon className="h-5 w-5" /> },
          { id: 'settings', label: 'Настройки', icon: <SettingsIcon className="h-5 w-5" /> },
        ] as Array<{ id: AdminView; label: string; icon: React.ReactNode }>).map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (item.id === 'doctors') {
                  openDoctorsManagement();
                  return;
                }
                setActiveView(item.id);
              }}
              className={`flex min-h-12 flex-col items-center justify-center rounded-full px-2 text-[0.72rem] font-black ring-1 ring-transparent transition ${
                isActive
                  ? ''
                  : `${isDarkTheme ? 'text-neutral-200 hover:bg-neutral-800/80 hover:ring-neutral-600' : 'text-slate-800 hover:bg-white/65 hover:ring-slate-300'}`
              }`}
              style={isActive ? { backgroundColor: currentAccent.soft, color: currentAccent.color } : undefined}
            >
              <span className="flex h-5 items-center justify-center leading-none">{item.icon}</span>
              <span className="mt-0.5 truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {isEditModalOpen && editingProject && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className={`max-h-[92vh] w-full overflow-y-auto rounded-t-[1.75rem] p-4 shadow-2xl ring-1 sm:max-w-[32rem] sm:rounded-[1.75rem] sm:p-6 ${
            isDarkTheme ? 'bg-neutral-900 text-neutral-100 ring-neutral-700' : 'bg-white text-slate-950 ring-slate-100'
          }`}>
            <div className={`mb-5 border-b pb-4 ${isDarkTheme ? 'border-neutral-800' : 'border-slate-100'}`}>
              <div className="text-[0.68rem] font-black uppercase" style={{ color: currentAccent.color }}>MeshBridge</div>
              <h3 className="mt-1 text-xl font-black">Редактирование проекта</h3>
            </div>

            <div className="mb-4">
              <label className={`mb-2 block text-xs font-black ${secondaryTextClass}`}>
                ФИО Пациента
              </label>
              <input
                className={`ui-focus h-11 w-full rounded-full border px-4 text-sm font-bold ${
                  isDarkTheme ? 'border-neutral-700 bg-neutral-950 text-neutral-100' : 'border-slate-200 bg-slate-50 text-slate-950'
                }`}
                value={editingProject.patient_name}
                onChange={(e) =>
                  setEditingProject({ ...editingProject, patient_name: e.target.value })
                }
              />
            </div>

            <label className={`mb-6 flex cursor-pointer items-start gap-3 rounded-2xl border p-3 text-left ${
              isDarkTheme ? 'border-emerald-900 bg-emerald-950/45' : 'border-emerald-100 bg-emerald-50'
            }`}>
              <input
                type="checkbox"
                checked={Boolean(editingProject.is_public)}
                onChange={(e) =>
                  setEditingProject({ ...editingProject, is_public: e.target.checked })
                }
                className="mt-0.5 h-5 w-5 rounded border-emerald-300 accent-emerald-600"
              />
              <span>
                <span className={`block text-sm font-black ${isDarkTheme ? 'text-emerald-300' : 'text-emerald-900'}`}>
                  Сделать проект открытым
                </span>
                <span className={`block text-xs leading-5 ${isDarkTheme ? 'text-emerald-400' : 'text-emerald-800'}`}>
                  Ссылка на просмотр будет открываться без входа и пароля.
                </span>
              </span>
            </label>

            {/* File management section (STL) */}
            <div className="mb-6">
              <label className={`mb-2 block text-xs font-black ${secondaryTextClass}`}>
                Текущие STL-файлы
              </label>
              {existingFiles.length === 0 ? (
                <p className={`text-sm ${mutedTextClass}`}>Нет загруженных файлов</p>
              ) : (
                <ul className={`max-h-40 space-y-2 overflow-y-auto rounded-2xl border p-2 ${
                  isDarkTheme ? 'border-neutral-700 bg-neutral-950/60' : 'border-slate-200 bg-slate-50'
                }`}>
                  {existingFiles.map((file) => (
                    <li
                      key={file.name}
                      className={`flex items-center justify-between gap-2 rounded-xl p-2 ${isDarkTheme ? 'bg-neutral-800' : 'bg-white'}`}
                    >
                      <span className="text-sm truncate">{file.name}</span>
                      <button
                        onClick={() => handleDeleteFile(file.name)}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-50 text-xs font-black text-rose-600 transition hover:bg-rose-100"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mb-6">
              <label className={`mb-2 block text-xs font-black ${secondaryTextClass}`}>
                Добавить новые STL-файлы (имена будут транслитерированы)
              </label>
              <input
                type="file"
                multiple
                accept=".stl"
                onChange={(e) => setNewFiles(e.target.files)}
                className={`w-full text-sm ${secondaryTextClass} file:mb-2 file:mr-4 file:rounded-full file:border-0 file:px-4 file:py-2 file:text-sm file:font-black sm:file:mb-0 ${
                  isDarkTheme ? 'file:bg-neutral-800 file:text-neutral-100' : 'file:bg-slate-100 file:text-slate-700'
                }`}
              />
              {newFiles && newFiles.length > 0 && (
                <div className={`mt-2 text-xs ${secondaryTextClass}`}>
                  Будет загружено файлов: {newFiles.length} (с транслитерированными именами)
                </div>
              )}
            </div>

            <div className={`mb-6 rounded-2xl border p-4 ${
              isDarkTheme ? 'border-neutral-700 bg-neutral-950/60' : 'border-slate-200 bg-slate-50'
            }`}>
              <label className={`mb-2 block text-xs font-black ${secondaryTextClass}`}>
                Лекала
              </label>
              {existingPatterns.length === 0 ? (
                <p className={`mb-3 text-sm ${mutedTextClass}`}>Нет загруженных лекал</p>
              ) : (
                <ul className="mb-3 max-h-40 space-y-2 overflow-y-auto">
                  {existingPatterns.map((pattern) => (
                    <li key={pattern.id} className={`flex items-center gap-3 rounded-xl p-2 ${isDarkTheme ? 'bg-neutral-800' : 'bg-white'}`}>
                      <img src={pattern.url} alt="" className="h-10 w-10 shrink-0 rounded-lg bg-black/30 object-contain" />
                      <span className="min-w-0 flex-1 truncate text-sm" title={pattern.name}>{pattern.name}</span>
                      <button
                        type="button"
                        onClick={() => handleDeletePattern(pattern.id, pattern.name)}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-50 text-xs font-black text-rose-600 transition hover:bg-rose-100"
                        title="Удалить лекало"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <input
                type="file"
                multiple
                accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={(event) => setNewPatternFiles(event.target.files)}
                className={`w-full text-sm ${secondaryTextClass} file:mb-2 file:mr-4 file:rounded-full file:border-0 file:px-4 file:py-2 file:text-sm file:font-black file:text-white sm:file:mb-0 ${
                  isDarkTheme ? 'file:bg-neutral-700' : 'file:bg-slate-800'
                }`}
              />
              <p className={`mt-2 text-xs ${mutedTextClass}`}>
                PNG, JPG, WebP или SVG. Фон будет удалён автоматически.
              </p>
            </div>

            {/* NEW: Sketch import section */}
            <div className={`mb-6 rounded-2xl border p-4 ${
              isDarkTheme ? 'border-neutral-700 bg-neutral-950/60' : 'border-slate-200 bg-slate-50'
            }`}>
              <label className={`mb-2 block text-xs font-black ${secondaryTextClass}`}>
                Импорт старых эскизов (выберите пары .json и .svg)
              </label>
              <input
                type="file"
                multiple
                accept=".json,.svg"
                onChange={(e) => setSketchFiles(e.target.files)}
                className={`mb-3 w-full cursor-pointer text-sm ${secondaryTextClass} file:mb-2 file:mr-4 file:rounded-full file:border-0 file:px-4 file:py-2 file:text-sm file:font-black file:text-white sm:file:mb-0 ${
                  isDarkTheme ? 'file:bg-neutral-700' : 'file:bg-slate-800'
                }`}
              />

              {sketchFiles && sketchFiles.length > 0 && (
                <div className="flex flex-col gap-2 mt-2">
                  <span className={`text-xs font-bold ${secondaryTextClass}`}>
                    Выбрано файлов: {sketchFiles.length}
                  </span>
                  <button
                    onClick={handleImportSketches}
                    disabled={isImportingSketches}
                    className="flex w-full items-center justify-center rounded-full py-2 text-sm font-black text-white transition hover:brightness-95 disabled:opacity-50"
                    style={{ backgroundColor: currentAccent.color }}
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
                  setNewPatternFiles(null);
                  setSketchFiles(null);
                }}
                className={`rounded-full px-4 py-3 text-sm font-black transition sm:py-2 ${
                  isDarkTheme ? 'bg-neutral-800 text-neutral-200 hover:bg-neutral-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Отмена
              </button>
              <button
                onClick={handleUpdateProject}
                disabled={loading}
                className="flex items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-black text-white transition hover:brightness-95 disabled:opacity-50 sm:py-2"
                style={{ backgroundColor: currentAccent.color }}
              >
                {loading ? 'Сохранение...' : 'Сохранить изменения'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
