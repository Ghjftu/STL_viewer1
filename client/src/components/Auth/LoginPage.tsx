import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import logo from '../../assets/logo.jpg';
import { clearSession, consumeReturnUrl, isSafeInternalPath, saveSession, type UserRole } from '../../utils/authSession';
import { useUiTheme } from '../../utils/uiTheme';

interface LoginPageProps {
  onLoginSuccess: (role: string) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { isDarkTheme, currentAccent } = useUiTheme();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, password }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        const returnUrl = consumeReturnUrl();
        const role = data.role as UserRole;

        if (!data.token || !data.userId || (role !== 'admin' && role !== 'doctor')) {
          clearSession();
          setError('Сервер вернул неполные данные входа');
          return;
        }

        clearSession();
        saveSession({
          token: data.token,
          role,
          userId: data.userId,
          name: data.name || '',
        });

        onLoginSuccess(role);

        if (role === 'admin') {
            navigate('/admin', { replace: true });
        } else if (returnUrl && isSafeInternalPath(returnUrl) && returnUrl.includes('/viewer/')) {
            navigate(returnUrl, { replace: true });
        } else {
            navigate('/doctor-dashboard', { replace: true });
        }
      }
      else {
        setError(data.message || 'Ошибка входа');
        clearSession();
      }
    } catch {
      setError('Сервер недоступен');
      clearSession();
    }
  };


  

  return (
    <div
      className={`flex min-h-screen items-center justify-center px-4 py-8 ${
        isDarkTheme ? 'bg-neutral-950 text-neutral-100' : 'bg-[#eef1f3] text-slate-950'
      }`}
      style={{ '--ui-accent': currentAccent.color } as React.CSSProperties}
    >
      <form
        onSubmit={handleSubmit}
        className={`rough-glass w-full max-w-sm rounded-[1.75rem] p-5 sm:p-7 ${isDarkTheme ? 'rough-glass-dark' : ''}`}
      >
        <img
          src={logo}
          alt="MeshBridge"
          className="mb-6 h-28 w-full rounded-2xl bg-white object-contain ring-1 ring-black/5"
        />
        {error && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-600 ring-1 ring-red-100">{error}</p>}
        <div className="mb-4">
          <label className={`mb-2 block text-xs font-black ${isDarkTheme ? 'text-neutral-300' : 'text-slate-600'}`}>Логин</label>
          <input 
            type="text" 
            className={`ui-focus h-11 w-full rounded-full border px-4 text-sm font-bold transition ${
              isDarkTheme ? 'border-neutral-700 bg-neutral-900/75 text-white' : 'border-white/70 bg-white/70 text-slate-950'
            }`}
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            required
          />
        </div>
        <div className="mb-6">
          <label className={`mb-2 block text-xs font-black ${isDarkTheme ? 'text-neutral-300' : 'text-slate-600'}`}>Пароль</label>
          <input 
            type="password" 
            className={`ui-focus h-11 w-full rounded-full border px-4 text-sm font-bold transition ${
              isDarkTheme ? 'border-neutral-700 bg-neutral-900/75 text-white' : 'border-white/70 bg-white/70 text-slate-950'
            }`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button
          type="submit"
          className="h-11 w-full rounded-full text-sm font-black text-white shadow-lg transition hover:brightness-95 active:scale-[0.99]"
          style={{ backgroundColor: currentAccent.color }}
        >
          Войти
        </button>
      </form>
    </div>
  );
};
