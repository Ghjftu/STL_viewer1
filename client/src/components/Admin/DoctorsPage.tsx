import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { clearSession, getAuthHeaders, getSession } from '../../utils/authSession';
import {
  ACCENT_COLORS,
  ADMIN_THEME_STORAGE_KEY,
  getStoredUiTheme,
  type AdminTheme,
} from '../../utils/uiTheme';
import { DoctorIcon, FolderIcon, SettingsIcon } from '../ui/AppIcons';

export const DoctorsPage: React.FC = () => {
  const navigate = useNavigate();
  const [doctors, setDoctors] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isHeaderMenuOpen, setHeaderMenuOpen] = useState(false);
  const initialUiTheme = getStoredUiTheme();
  const [theme, setTheme] = useState<AdminTheme>(initialUiTheme.theme);
  const [form, setForm] = useState({
    login: '',
    password: '',
    full_name: '',
    country: '',
    city: '',
    clinic: '',
    department: ''
  });
  const currentAccent = ACCENT_COLORS[initialUiTheme.accent];
  const isDarkTheme = theme === 'dark';

  const handleUnauthorized = () => {
    clearSession();
    alert('Сессия истекла. Пожалуйста, войдите снова.');
    window.location.href = '/';
  };

  const load = () => {
    fetch(`${import.meta.env.VITE_API_URL}/doctors`, {
      headers: getAuthHeaders(),
    })
      .then(res => {
        if (res.status === 401 || res.status === 403) {
          handleUnauthorized();
          return [];
        }

        return res.json();
      })
      .then(data => Array.isArray(data) && setDoctors(data));
  };

  useEffect(() => {
    const session = getSession();
    if (!session || session.role !== 'admin') {
      handleUnauthorized();
      return;
    }

    load();
  }, []);

  useEffect(() => {
    window.localStorage.setItem(ADMIN_THEME_STORAGE_KEY, JSON.stringify(theme));
  }, [theme]);

  useEffect(() => {
    if (!isHeaderMenuOpen) return;
    const closeMenu = () => setHeaderMenuOpen(false);
    document.addEventListener('click', closeMenu);
    return () => document.removeEventListener('click', closeMenu);
  }, [isHeaderMenuOpen]);

  const handleAdd = async () => {
    if (!form.login || !form.password || !form.full_name) {
      return alert("Заполните логин, пароль и ФИО");
    }
    const res = await fetch(`${import.meta.env.VITE_API_URL}/doctors`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(form)
    });
    if (res.status === 401 || res.status === 403) {
      handleUnauthorized();
      return;
    }

    if (res.ok) {
      setForm({
        login: '',
        password: '',
        full_name: '',
        country: '',
        city: '',
        clinic: '',
        department: ''
      });
      load();
    } else {
      alert("Ошибка при добавлении");
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Удалить врача?")) return;

    const res = await fetch(`${import.meta.env.VITE_API_URL}/doctors/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(false),
    });
    if (res.status === 401 || res.status === 403) {
      handleUnauthorized();
      return;
    }

    if (!res.ok) {
      const error = await res.json().catch(() => null);
      alert(error?.message || "Ошибка при удалении");
      return;
    }

    load();
  };

  const fieldClass = `ui-focus h-10 min-w-0 rounded-full border px-3 text-sm font-bold ${
    isDarkTheme ? 'border-neutral-700 bg-neutral-950/65 text-neutral-100' : 'border-white/70 bg-white/72 text-slate-950'
  }`;

  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase('ru');
  const visibleDoctors = normalizedSearchQuery
    ? doctors.filter((doctor) => Object.values(doctor).some((value) => (
        value != null && String(value).toLocaleLowerCase('ru').includes(normalizedSearchQuery)
      )))
    : doctors;

  const handleLogout = () => {
    clearSession();
    navigate('/', { replace: true });
  };

  const navClass = isDarkTheme
    ? 'rough-glass rough-glass-dark liquid-nav liquid-nav-dark fixed bottom-4 left-1/2 z-40 grid w-[calc(100%-2rem)] max-w-[390px] -translate-x-1/2 grid-cols-3 gap-1.5 rounded-full p-1.5'
    : 'rough-glass liquid-nav fixed bottom-4 left-1/2 z-40 grid w-[calc(100%-2rem)] max-w-[390px] -translate-x-1/2 grid-cols-3 gap-1.5 rounded-full p-1.5';

  return (
    <div
      className={`min-h-screen ${isDarkTheme ? 'bg-neutral-950 text-neutral-100' : 'bg-[#eef1f3] text-slate-950'}`}
      style={{ '--ui-accent': currentAccent.color } as React.CSSProperties}
    >
      <div className={`mx-auto flex h-screen w-full max-w-[1180px] flex-col overflow-hidden shadow-[0_18px_60px_rgba(15,23,42,0.12)] ${
        isDarkTheme ? 'bg-neutral-950' : 'bg-white'
      }`}>
        <header className={`shrink-0 px-4 pb-5 pt-4 lg:px-6 ${isDarkTheme ? 'bg-neutral-950' : 'bg-white'}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-[1.35rem] font-black leading-tight lg:text-[1.55rem]" style={{ color: currentAccent.color }}>
                MeshBridge
              </h1>
              <div className={`mt-1 text-[0.68rem] font-bold uppercase ${isDarkTheme ? 'text-neutral-500' : 'text-slate-400'}`}>
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
                className={`flex h-9 w-9 items-center justify-center rounded-full text-2xl font-black transition ${
                  isDarkTheme ? 'text-neutral-100 hover:bg-neutral-800' : 'text-slate-950 hover:bg-slate-100'
                }`}
              >
                ⋮
              </button>
              {isHeaderMenuOpen && (
                <div
                  onClick={(event) => event.stopPropagation()}
                  className={`absolute right-0 top-10 z-30 w-52 overflow-hidden rounded-2xl py-1.5 shadow-2xl ring-1 ${
                    isDarkTheme ? 'bg-neutral-900 ring-neutral-700' : 'bg-white ring-slate-100'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setTheme((current) => current === 'dark' ? 'light' : 'dark');
                      setHeaderMenuOpen(false);
                    }}
                    className={`block w-full px-3.5 py-2.5 text-left text-xs font-bold transition ${
                      isDarkTheme ? 'text-neutral-100 hover:bg-neutral-800' : 'text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    {isDarkTheme ? 'Светлая тема' : 'Темная тема'}
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className={`block w-full px-3.5 py-2.5 text-left text-xs font-bold transition ${
                      isDarkTheme ? 'text-neutral-100 hover:bg-neutral-800' : 'text-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    Выйти
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-36 pt-1 lg:px-6 lg:pb-32">
          <h2 className="mb-4 text-xl font-black">Управление врачами</h2>

        {/* Форма добавления */}
        <div className={`rough-glass mb-6 grid gap-2 rounded-[1.5rem] p-4 sm:grid-cols-2 lg:grid-cols-4 ${isDarkTheme ? 'rough-glass-dark' : ''}`}>
          <input
            placeholder="ФИО Врача"
            className={`${fieldClass} sm:col-span-2`}
            value={form.full_name}
            onChange={e => setForm({...form, full_name: e.target.value})}
          />
          <input
            placeholder="Логин"
            className={fieldClass}
            value={form.login}
            onChange={e => setForm({...form, login: e.target.value})}
          />
          <input
            placeholder="Пароль"
            type="password"
            className={fieldClass}
            value={form.password}
            onChange={e => setForm({...form, password: e.target.value})}
          />
          <input
            placeholder="Страна"
            className={fieldClass}
            value={form.country}
            onChange={e => setForm({...form, country: e.target.value})}
          />
          <input
            placeholder="Город"
            className={fieldClass}
            value={form.city}
            onChange={e => setForm({...form, city: e.target.value})}
          />
          <input
            placeholder="Клиника"
            className={fieldClass}
            value={form.clinic}
            onChange={e => setForm({...form, clinic: e.target.value})}
          />
          <input
            placeholder="Отделение"
            className={fieldClass}
            value={form.department}
            onChange={e => setForm({...form, department: e.target.value})}
          />
          <button
            onClick={handleAdd}
            className="h-10 rounded-full px-6 text-sm font-black text-white shadow-md transition hover:brightness-95"
            style={{ backgroundColor: currentAccent.color }}
          >
            Добавить
          </button>
        </div>

        <label className={`mb-6 flex h-11 items-center gap-2 rounded-full px-4 shadow-inner ring-1 ${
          isDarkTheme
            ? 'bg-neutral-900 text-neutral-400 ring-neutral-800'
            : 'bg-[#f1f1f3] text-slate-500 ring-transparent'
        }`}>
          <span className="text-xl leading-none">⌕</span>
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Поиск по всем данным врачей"
            className={`min-w-0 flex-1 bg-transparent text-base font-medium outline-none placeholder:text-slate-400 ${
              isDarkTheme ? 'text-neutral-100' : 'text-slate-900'
            }`}
          />
          {searchQuery && (
            <button type="button" onClick={() => setSearchQuery('')} aria-label="Очистить поиск" className="px-1 text-lg">
              ×
            </button>
          )}
        </label>

        {visibleDoctors.length === 0 && (
          <div className={`mb-4 rounded-[1.25rem] border border-dashed px-4 py-7 text-center text-sm font-bold ${
            isDarkTheme ? 'border-neutral-700 bg-neutral-900 text-neutral-400' : 'border-slate-200 bg-slate-50 text-slate-500'
          }`}>
            {searchQuery ? 'Врачи по вашему запросу не найдены' : 'Врачи ещё не добавлены'}
          </div>
        )}

        <div className="grid gap-3 md:hidden">
          {visibleDoctors.map(d => (
            <div key={d.id} className={`rough-glass rounded-2xl p-4 ${isDarkTheme ? 'rough-glass-dark' : ''}`}>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <div className="font-bold">{d.full_name}</div>
                  <div className={`text-sm ${isDarkTheme ? 'text-neutral-400' : 'text-slate-500'}`}>{d.login}</div>
                </div>
                <button
                  onClick={() => handleDelete(d.id)}
                  className="shrink-0 rounded-full bg-red-50 px-3 py-2 text-xs font-black text-red-600 ring-1 ring-red-100"
                >
                  Удалить
                </button>
              </div>
              <div className={`grid grid-cols-2 gap-2 text-sm ${isDarkTheme ? 'text-neutral-300' : 'text-slate-700'}`}>
                <div><span className="text-slate-400">Пароль:</span> <span className="font-mono">{d.password_plain || '—'}</span></div>
                <div><span className="text-slate-400">Страна:</span> {d.country || '—'}</div>
                <div><span className="text-slate-400">Город:</span> {d.city || '—'}</div>
                <div><span className="text-slate-400">Клиника:</span> {d.clinic || '—'}</div>
                <div className="col-span-2"><span className="text-slate-400">Отделение:</span> {d.department || '—'}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Таблица врачей */}
        <div className={`rough-glass hidden overflow-x-auto rounded-[1.5rem] md:block ${isDarkTheme ? 'rough-glass-dark' : ''}`}>
          <table className="w-full min-w-[980px] overflow-hidden text-left">
            <thead className={isDarkTheme ? 'border-b border-neutral-700 bg-neutral-900/70' : 'border-b border-white/70 bg-white/45'}>
              <tr>
                <th className="p-4">ФИО</th>
                <th className="p-4">Логин</th>
                <th className="p-4">Пароль</th>
                <th className="p-4">Страна</th>
                <th className="p-4">Город</th>
                <th className="p-4">Клиника</th>
                <th className="p-4">Отделение</th>
                <th className="p-4 text-center">Действие</th>
              </tr>
            </thead>
            <tbody>
              {visibleDoctors.map(d => (
                <tr key={d.id} className={`border-b transition ${isDarkTheme ? 'border-neutral-800 hover:bg-neutral-800/55' : 'border-white/70 hover:bg-white/55'}`}>
                  <td className="p-4 font-medium">{d.full_name}</td>
                  <td className={`p-4 ${isDarkTheme ? 'text-neutral-400' : 'text-slate-500'}`}>{d.login}</td>
                  <td className={`p-4 font-mono text-sm ${isDarkTheme ? 'text-neutral-300' : 'text-slate-700'}`}>{d.password_plain || '—'}</td>
                  <td className="p-4">{d.country || '—'}</td>
                  <td className="p-4">{d.city || '—'}</td>
                  <td className="p-4">{d.clinic || '—'}</td>
                  <td className="p-4">{d.department || '—'}</td>
                  <td className="p-4 text-center">
                    <button
                      onClick={() => handleDelete(d.id)}
                      className="text-red-500 font-bold"
                    >
                      Удалить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </main>
      </div>

      <nav className={navClass}>
        {([
          { id: 'projects', label: 'Проекты', icon: <FolderIcon className="h-5 w-5" />, path: '/admin' },
          { id: 'doctors', label: 'Врачи', icon: <DoctorIcon className="h-5 w-5" />, path: '/admin/doctors' },
          { id: 'settings', label: 'Настройки', icon: <SettingsIcon className="h-5 w-5" />, path: '/admin?view=settings' },
        ] as Array<{ id: string; label: string; icon: React.ReactNode; path: string }>).map((item) => {
          const isActive = item.id === 'doctors';
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => navigate(item.path)}
              className={`flex min-h-12 flex-col items-center justify-center rounded-full px-2 text-[0.72rem] font-black ring-1 ring-transparent transition ${
                !isActive && (isDarkTheme
                  ? 'text-neutral-200 hover:bg-neutral-800/80 hover:ring-neutral-600'
                  : 'text-slate-800 hover:bg-white/65 hover:ring-slate-300')
              }`}
              style={isActive ? { backgroundColor: currentAccent.soft, color: currentAccent.color } : undefined}
            >
              <span className="flex h-5 items-center justify-center leading-none">{item.icon}</span>
              <span className="mt-0.5 truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
