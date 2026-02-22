import React, { useState } from 'react';

interface LoginPageProps {
  onLoginSuccess: (role: string) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    


    try {
      const response = await fetch('http://localhost:8000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, password }),
      });

      const data = await response.json();

      if (response.ok) {
        // 1. Сохраняем данные авторизации
        localStorage.setItem('token', data.token);
        localStorage.setItem('role', data.role); // Обязательно сохраняем роль!
        
        // 2. Уведомляем приложение
        onLoginSuccess(data.role);

        // 3. Редирект в зависимости от роли
        const returnUrl = localStorage.getItem('returnUrl');
        
        if (returnUrl) {
            // Если была сохранена ссылка (например, /viewer/123), идем туда и чистим память
            localStorage.removeItem('returnUrl');
            window.location.href = returnUrl;
        } else {
            // Иначе стандартное распределение
            if (data.role === 'admin') {
              window.location.href = '/admin';
            } else {
              window.location.href = '/doctor-dashboard'; 
            }
        }
      } else {
        setError(data.message || 'Ошибка входа');
      }
    } catch (err) {
      setError('Сервер недоступен');
    }
  };


  

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded-lg shadow-xl w-96">
        <h2 className="text-2xl font-bold mb-6 text-gray-800 text-center">STL Viewer Pro</h2>
        {error && <p className="text-red-500 mb-4 text-sm bg-red-50 p-2 rounded">{error}</p>}
        <div className="mb-4">
          <label className="block text-gray-700 text-sm font-bold mb-2">Логин</label>
          <input 
            type="text" 
            className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            required
          />
        </div>
        <div className="mb-6">
          <label className="block text-gray-700 text-sm font-bold mb-2">Пароль</label>
          <input 
            type="password" 
            className="w-full p-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded font-bold hover:bg-blue-700 transition">
          Войти
        </button>
      </form>
    </div>
  );
};