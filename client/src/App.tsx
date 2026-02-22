import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './components/Auth/LoginPage';
import { AdminDashboard } from './components/Admin/AdminDashboard';
import { ProjectForm } from './components/Admin/ProjectForm';
import { DoctorsPage } from './components/Admin/DoctorsPage';
import { DoctorDashboard } from './components/Doctor/DoctorDashboard.tsx';
import { Viewer3D } from './components/Viewer/Viewer3D';

export default function App() {
  // Функция теперь используется для определения начального пути
  const getRedirectPath = () => {
    const role = localStorage.getItem('role');
    if (role === 'admin') return '/admin';
    if (role === 'doctor') return '/doctor-dashboard';
    return null; // Если роли нет, остаемся на странице логина
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
              <LoginPage onLoginSuccess={(role) => {
                // После успешного логина обновляем страницу для срабатывания редиректа
                window.location.href = role === 'admin' ? '/admin' : '/doctor-dashboard';
              }} />
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
        <Route path="/viewer/:id" element={<Viewer3D />} />

        {/* 404 - Страница не найдена */}
        <Route path="*" element={<div className="p-10 text-black">404 - Страница не найдена</div>} />
      </Routes>
    </BrowserRouter>
  );
}