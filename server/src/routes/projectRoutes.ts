import { Router, Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware'; // Импортируем тип
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { 
  createProject, 
  getProjects, 
  getProjectById, 
  saveProjectScene,
  saveSketch
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

// 1. Создание и список — ТОЖЕ закроем, чтобы только админ/врач могли видеть
router.post('/create', authenticateToken, upload.array('files', 10), createProject);
router.post('/:id/sketch', authenticateToken, saveSketch);
router.get('/list', authenticateToken, getProjects);

// 2. Получение проекта по ID (Самый важный для врача)
router.get('/:id', authenticateToken, (req: AuthRequest, res: Response) => {
  console.log(`🔐 [AUTH OK] Юзер ${req.user?.userId} запрашивает проект ${req.params.id}`);
  getProjectById(req, res);
});

// 3. Сохранение сцены
router.put('/:id/scene', authenticateToken, saveProjectScene);

export default router;