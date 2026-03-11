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
    fetch(`${import.meta.env.VITE_API_URL}/api/doctors`)
      .then(res => res.json())
      .then(data => Array.isArray(data) && setDoctors(data));
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!form.login || !form.password || !form.full_name) {
      return alert("Заполните логин, пароль и ФИО");
    }
    const res = await fetch(`${import.meta.env.VITE_API_URL}/api/doctors`, {
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

  const handleDelete = async (id: number) => {
    if (window.confirm("Удалить врача?")) {
      await fetch(`${import.meta.env.VITE_API_URL}/api/doctors/${id}`, { method: 'DELETE' });
      load();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8 text-black">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-2xl font-bold mb-6">Управление врачами</h2>

        {/* Форма добавления */}
        <div className="bg-white p-4 rounded-xl shadow-sm border flex flex-wrap gap-3 mb-8">
          <input
            placeholder="ФИО Врача"
            className="border p-2 rounded flex-1 min-w-[200px]"
            value={form.full_name}
            onChange={e => setForm({...form, full_name: e.target.value})}
          />
          <input
            placeholder="Логин"
            className="border p-2 rounded w-40"
            value={form.login}
            onChange={e => setForm({...form, login: e.target.value})}
          />
          <input
            placeholder="Пароль"
            type="password"
            className="border p-2 rounded w-40"
            value={form.password}
            onChange={e => setForm({...form, password: e.target.value})}
          />
          <input
            placeholder="Страна"
            className="border p-2 rounded w-40"
            value={form.country}
            onChange={e => setForm({...form, country: e.target.value})}
          />
          <input
            placeholder="Город"
            className="border p-2 rounded w-40"
            value={form.city}
            onChange={e => setForm({...form, city: e.target.value})}
          />
          <input
            placeholder="Клиника"
            className="border p-2 rounded w-40"
            value={form.clinic}
            onChange={e => setForm({...form, clinic: e.target.value})}
          />
          <input
            placeholder="Отделение"
            className="border p-2 rounded w-40"
            value={form.department}
            onChange={e => setForm({...form, department: e.target.value})}
          />
          <button
            onClick={handleAdd}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold"
          >
            Добавить
          </button>
        </div>

        {/* Таблица врачей */}
        <table className="w-full bg-white rounded-xl shadow-sm overflow-hidden text-left">
          <thead className="bg-gray-100 border-b">
            <tr>
              <th className="p-4">ФИО</th>
              <th className="p-4">Логин</th>
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
  );
};