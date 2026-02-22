import React, { useState, useEffect } from 'react';

export const DoctorsPage: React.FC = () => {
  const [doctors, setDoctors] = useState<any[]>([]);
  const [form, setForm] = useState({ login: '', password: '', full_name: '' });

  const load = () => {
    fetch('http://localhost:8000/api/doctors')
      .then(res => res.json())
      .then(data => Array.isArray(data) && setDoctors(data));
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!form.login || !form.password || !form.full_name) return alert("Заполните все поля");
    const res = await fetch('http://localhost:8000/api/doctors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });
    if (res.ok) {
      setForm({ login: '', password: '', full_name: '' });
      load();
    } else {
      alert("Ошибка при добавлении");
    }
  };

  const handleDelete = async (id: number) => {
    if (window.confirm("Удалить врача?")) {
      await fetch(`http://localhost:8000/api/doctors/${id}`, { method: 'DELETE' });
      load();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8 text-black">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-2xl font-bold mb-6">Управление врачами</h2>
        
        <div className="bg-white p-4 rounded-xl shadow-sm border flex gap-3 mb-8">
          <input placeholder="ФИО Врача" className="border p-2 rounded flex-1" value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})} />
          <input placeholder="Логин" className="border p-2 rounded w-40" value={form.login} onChange={e => setForm({...form, login: e.target.value})} />
          <input placeholder="Пароль" type="password" className="border p-2 rounded w-40" value={form.password} onChange={e => setForm({...form, password: e.target.value})} />
          <button onClick={handleAdd} className="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold">Добавить</button>
        </div>

        <table className="w-full bg-white rounded-xl shadow-sm overflow-hidden text-left">
          <thead className="bg-gray-100 border-b">
            <tr>
              <th className="p-4">ФИО</th>
              <th className="p-4">Логин</th>
              <th className="p-4 text-center">Действие</th>
            </tr>
          </thead>
          <tbody>
            {doctors.map(d => (
              <tr key={d.id} className="border-b hover:bg-gray-50">
                <td className="p-4 font-medium">{d.full_name}</td>
                <td className="p-4 text-gray-500">{d.login}</td>
                <td className="p-4 text-center">
                  <button onClick={() => handleDelete(d.id)} className="text-red-500 font-bold">Удалить</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};