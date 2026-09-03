import fs from 'fs';
import path from 'path';

export const STORAGE_DIR = path.join(__dirname, '../../storage');

const sanitizePathSegment = (segment: string, fallback: string): string => {
  const cleaned = String(segment || '')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\.\.+/g, '.')
    .replace(/\s+/g, ' ')
    .slice(0, 120);

  return cleaned && cleaned !== '.' ? cleaned : fallback;
};

export const createProjectPath = (
  country: string, 
  city: string, 
  clinic: string, 
  department: string, 
  doctor: string, 
  patient: string,
  projectId: string
) => {
  const targetPath = path.join(
    STORAGE_DIR,
    sanitizePathSegment(country, 'Unknown_Country'),
    sanitizePathSegment(city, 'Unknown_City'),
    sanitizePathSegment(clinic, 'Unknown_Clinic'),
    sanitizePathSegment(department, 'Unknown_Department'),
    sanitizePathSegment(doctor, 'Unknown_Doctor'),
    sanitizePathSegment(patient, 'Unknown_Patient'),
    sanitizePathSegment(projectId, 'Unknown_Project')
  );
  
  // Создаем подпапки
  const subfolders = [
    'stl',
    'sketches',
    'tz',
    path.join('patterns', 'originals'),
    path.join('patterns', 'processed'),
  ];

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

export const getSafeFileName = (fileName: string): string => {
  return path.basename(fileName || '').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
};
