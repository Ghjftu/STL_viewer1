import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './components/Auth/LoginPage';
import { AdminDashboard } from './components/Admin/AdminDashboard';
import { ProjectForm } from './components/Admin/ProjectForm';
import { DoctorsPage } from './components/Admin/DoctorsPage';
import { DoctorDashboard } from './components/Doctor/DoctorDashboard.tsx';
import { Viewer3D } from './components/Viewer/Viewer3D';
import { getSession } from './utils/authSession';
import { useUiTheme } from './utils/uiTheme';

const NotFoundPage = () => {
  const { isDarkTheme, currentAccent } = useUiTheme();
  return (
    <div className={`flex min-h-screen items-center justify-center px-4 ${isDarkTheme ? 'bg-neutral-950 text-neutral-100' : 'bg-[#eef1f3] text-slate-950'}`}>
      <div className={`rough-glass w-full max-w-sm rounded-[1.75rem] p-7 text-center ${isDarkTheme ? 'rough-glass-dark' : ''}`}>
        <div className="text-5xl font-black" style={{ color: currentAccent.color }}>404</div>
        <div className="mt-2 text-sm font-bold">Страница не найдена</div>
      </div>
    </div>
  );
};


export default function App() {
  // Функция теперь используется для определения начального пути
  const getRedirectPath = () => {
    const session = getSession();
    if (!session) return null;
    if (session.role === 'admin') return '/admin';
    if (session.role === 'doctor') return '/doctor-dashboard';
    return null;
  };

  const redirectPath = getRedirectPath();

  return (
    <BrowserRouter>
      <Routes>
        {/* Если функция getRedirectPath вернула путь (пользователь залогинен), 
          при заходе на "/" мы его сразу перенаправляем (Navigate).
          Если не залогинен — показываемLoginPage.
        */}
        <Route 
          path="/" 
          element={
            redirectPath ? (
              <Navigate to={redirectPath} replace />
            ) : (
              <LoginPage onLoginSuccess={() => undefined} />
            )
          } 
        />
        
        {/* Админские роуты */}
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/create-project" element={<ProjectForm />} />
        <Route path="/admin/doctors" element={<DoctorsPage />} />
        
        {/* Роут для врача */}
        <Route path="/doctor-dashboard" element={<DoctorDashboard />} />
        
        {/* Просмотрщик 3D */}
        <Route path="/viewer/:patientSlug/:id" element={<Viewer3D />} />
        <Route path="/viewer/:id" element={<Viewer3D />} />

        {/* 404 - Страница не найдена */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
