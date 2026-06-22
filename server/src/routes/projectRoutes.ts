import { Router, Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware'; 
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { getProjectSketches, getSketchSvg, markSketchAsRead} from '../controllers/projectController';
import { 
  createProject, 
  getProjects, 
  getProjectFolders,
  saveProjectFolders,
  getProjectById, 
  saveProjectScene,
  saveSketch,
  updateProject, 
  deleteFile,      
  importSketches
} from '../controllers/projectController';
import { authenticateToken, authorizeRoles, optionalAuthenticateToken } from '../middlewares/authMiddleware';

const router = Router();
const uploadDir = 'uploads/';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

// --- МАРШРУТЫ ---

router.post('/create', authenticateToken, authorizeRoles('admin'), upload.array('files', 10), createProject);
// Сохранение эскиза: для публичных проектов допускается без авторизации.
// optionalAuthenticateToken прокидывает пользователя, если токен есть, но не блокирует анонимов.
router.post('/:id/sketch', optionalAuthenticateToken, saveSketch);
router.get('/list', authenticateToken, getProjects);
router.get('/folders', authenticateToken, authorizeRoles('admin'), getProjectFolders);
router.put('/folders', authenticateToken, authorizeRoles('admin'), saveProjectFolders);

// 1. ПОЛУЧЕНИЕ ПРОЕКТА
router.get('/:id', optionalAuthenticateToken, (req: AuthRequest, res: Response) => {
  getProjectById(req, res);
});

// GET /api/projects/:id/sketches
router.get('/:id/sketches', optionalAuthenticateToken, getProjectSketches);
// GET /api/projects/:id/sketches/:folder/svg
router.get('/:id/sketches/:folder/svg', optionalAuthenticateToken, getSketchSvg);

// 2. ОБНОВЛЕНИЕ ПРОЕКТА (Текстовые данные + Новые файлы)
// Добавляем upload.array('files'), чтобы multer распарсил новые STL
router.put('/:id', authenticateToken, authorizeRoles('admin'), upload.array('files', 10), updateProject);

// 3. УДАЛЕНИЕ КОНКРЕТНОГО ФАЙЛА ИЗ ПРОЕКТА
router.post('/:id/delete-file', authenticateToken, authorizeRoles('admin'), deleteFile);

// 4. СОХРАНЕНИЕ СОСТОЯНИЯ СЦЕНЫ
// router.put('/:id/scene', authenticateToken, saveProjectScene);
router.put('/:id/scene', optionalAuthenticateToken, saveProjectScene);

// 5. ИМПОРТ ГОТОВЫХ ЭСКИЗОВ (.json + .svg)
// Разрешаем загрузку до 50 файлов за раз. Поле называется 'sketchFiles', как мы указали во фронтенде!
router.post('/:id/import-sketches', authenticateToken, authorizeRoles('admin'), upload.array('sketchFiles', 50), importSketches);
router.post('/sketches/:sketchId/read', authenticateToken, authorizeRoles('admin'), markSketchAsRead)


export default router;
