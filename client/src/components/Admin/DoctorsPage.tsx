import React, { useState, useEffect } from 'react';

export const DoctorsPage: React.FC = () => {
  const [doctors, setDoctors] = useState<any[]>([]);
  const [form, setForm] = useState({
    login: '',
    password: '',
    full_name: '',
    country: '',
    city: '',
    clinic: '',
    department: ''
  });

  const load = () => {
    fetch(`${import.meta.env.VITE_API_URL}/doctors`)
      .then(res => res.json())
      .then(data => Array.isArray(data) && setDoctors(data));
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!form.login || !form.password || !form.full_name) {
      return alert("Заполните логин, пароль и ФИО");
    }
    const res = await fetch(`${import.meta.env.VITE_API_URL}/doctors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });
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

    const res = await fetch(`${import.meta.env.VITE_API_URL}/doctors/${id}`, { method: 'DELETE' });

    if (!res.ok) {
      const error = await res.json().catch(() => null);
      alert(error?.message || "Ошибка при удалении");
      return;
    }

    load();
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 text-black sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <h2 className="mb-6 text-2xl font-bold">Управление врачами</h2>

        {/* Форма добавления */}
        <div className="mb-8 flex flex-col gap-3 rounded-xl border bg-white p-4 shadow-sm sm:flex-row sm:flex-wrap">
          <input
            placeholder="ФИО Врача"
            className="w-full min-w-[200px] flex-1 rounded border p-3 sm:p-2"
            value={form.full_name}
            onChange={e => setForm({...form, full_name: e.target.value})}
          />
          <input
            placeholder="Логин"
            className="w-full rounded border p-3 sm:w-40 sm:p-2"
            value={form.login}
            onChange={e => setForm({...form, login: e.target.value})}
          />
          <input
            placeholder="Пароль"
            type="password"
            className="w-full rounded border p-3 sm:w-40 sm:p-2"
            value={form.password}
            onChange={e => setForm({...form, password: e.target.value})}
          />
          <input
            placeholder="Страна"
            className="w-full rounded border p-3 sm:w-40 sm:p-2"
            value={form.country}
            onChange={e => setForm({...form, country: e.target.value})}
          />
          <input
            placeholder="Город"
            className="w-full rounded border p-3 sm:w-40 sm:p-2"
            value={form.city}
            onChange={e => setForm({...form, city: e.target.value})}
          />
          <input
            placeholder="Клиника"
            className="w-full rounded border p-3 sm:w-40 sm:p-2"
            value={form.clinic}
            onChange={e => setForm({...form, clinic: e.target.value})}
          />
          <input
            placeholder="Отделение"
            className="w-full rounded border p-3 sm:w-40 sm:p-2"
            value={form.department}
            onChange={e => setForm({...form, department: e.target.value})}
          />
          <button
            onClick={handleAdd}
            className="w-full rounded-lg bg-blue-600 px-6 py-3 font-bold text-white sm:w-auto sm:py-2"
          >
            Добавить
          </button>
        </div>

        <div className="grid gap-3 md:hidden">
          {doctors.map(d => (
            <div key={d.id} className="rounded-xl bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <div className="font-bold">{d.full_name}</div>
                  <div className="text-sm text-gray-500">{d.login}</div>
                </div>
                <button
                  onClick={() => handleDelete(d.id)}
                  className="shrink-0 rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-600"
                >
                  Удалить
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-gray-400">Пароль:</span> <span className="font-mono">{d.password_plain || '—'}</span></div>
                <div><span className="text-gray-400">Страна:</span> {d.country || '—'}</div>
                <div><span className="text-gray-400">Город:</span> {d.city || '—'}</div>
                <div><span className="text-gray-400">Клиника:</span> {d.clinic || '—'}</div>
                <div className="col-span-2"><span className="text-gray-400">Отделение:</span> {d.department || '—'}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Таблица врачей */}
        <div className="hidden overflow-x-auto rounded-xl bg-white shadow-sm md:block">
          <table className="w-full min-w-[980px] overflow-hidden text-left">
            <thead className="bg-gray-100 border-b">
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
              {doctors.map(d => (
                <tr key={d.id} className="border-b hover:bg-gray-50">
                  <td className="p-4 font-medium">{d.full_name}</td>
                  <td className="p-4 text-gray-500">{d.login}</td>
                  <td className="p-4 font-mono text-sm text-gray-700">{d.password_plain || '—'}</td>
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
      </div>
    </div>
  );
};
