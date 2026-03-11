import { Router, Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware'; 
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { getProjectSketches, getSketchSvg } from '../controllers/projectController';
import { 
  createProject, 
  getProjects, 
  getProjectById, 
  saveProjectScene,
  saveSketch,
  // --- ДОБАВЛЯЕМ ИМПОРТ НОВЫХ ФУНКЦИЙ ---
  updateProject, 
  deleteFile      
} from '../controllers/projectController';
import { authenticateToken } from '../middlewares/authMiddleware';

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
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// --- МАРШРУТЫ ---

router.post('/create', authenticateToken, upload.array('files', 10), createProject);
router.post('/:id/sketch', authenticateToken, saveSketch);
router.get('/list', authenticateToken, getProjects);

// 1. ПОЛУЧЕНИЕ ПРОЕКТА
router.get('/:id', authenticateToken, (req: AuthRequest, res: Response) => {
  getProjectById(req, res);
});

// GET /api/projects/:id/sketches
router.get('/:id/sketches', getProjectSketches);
// GET /api/projects/:id/sketches/:folder/svg
router.get('/:id/sketches/:folder/svg', getSketchSvg);

// 2. ОБНОВЛЕНИЕ ПРОЕКТА (Текстовые данные + Новые файлы)
// Добавляем upload.array('files'), чтобы multer распарсил новые STL
router.put('/:id', authenticateToken, upload.array('files', 10), updateProject);

// 3. УДАЛЕНИЕ КОНКРЕТНОГО ФАЙЛА ИЗ ПРОЕКТА
router.post('/:id/delete-file', authenticateToken, deleteFile);

// 4. СОХРАНЕНИЕ СОСТОЯНИЯ СЦЕНЫ
router.put('/:id/scene', authenticateToken, saveProjectScene);



export default router;