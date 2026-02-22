import fs from 'fs';
import path from 'path';

export const createProjectPath = (
  country: string, 
  city: string, 
  clinic: string, 
  department: string, 
  doctor: string, 
  patient: string
) => {
  // Базовая папка storage лежит в корне сервера
  const basePath = path.join(__dirname, '../../storage');
  
  // Создаем путь по ТЗ
  const targetPath = path.join(basePath, country, city, clinic, department, doctor, patient);
  
  // Создаем подпапки
  const subfolders = ['stl', 'sketches', 'tz'];

  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(targetPath, { recursive: true });
  }

  subfolders.forEach(folder => {
    const folderPath = path.join(targetPath, folder);
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath);
    }
  });

  return targetPath; // Возвращаем путь, чтобы контроллер мог закинуть туда файлы
};