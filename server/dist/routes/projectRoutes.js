"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const projectController_1 = require("../controllers/projectController");
const projectController_2 = require("../controllers/projectController");
const authMiddleware_1 = require("../middlewares/authMiddleware");
const router = (0, express_1.Router)();
const uploadDir = 'uploads/';
if (!fs_1.default.existsSync(uploadDir))
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path_1.default.extname(file.originalname));
    }
});
const upload = (0, multer_1.default)({ storage, limits: { fileSize: 100 * 1024 * 1024 } });
// --- МАРШРУТЫ ---
router.post('/create', authMiddleware_1.authenticateToken, (0, authMiddleware_1.authorizeRoles)('admin'), upload.array('files', 10), projectController_2.createProject);
// Сохранение эскиза: для публичных проектов допускается без авторизации.
// optionalAuthenticateToken прокидывает пользователя, если токен есть, но не блокирует анонимов.
router.post('/:id/sketch', authMiddleware_1.optionalAuthenticateToken, projectController_2.saveSketch);
router.get('/list', authMiddleware_1.authenticateToken, projectController_2.getProjects);
router.get('/folders', authMiddleware_1.authenticateToken, (0, authMiddleware_1.authorizeRoles)('admin'), projectController_2.getProjectFolders);
router.put('/folders', authMiddleware_1.authenticateToken, (0, authMiddleware_1.authorizeRoles)('admin'), projectController_2.saveProjectFolders);
// 1. ПОЛУЧЕНИЕ ПРОЕКТА
router.get('/:id', authMiddleware_1.optionalAuthenticateToken, (req, res) => {
    (0, projectController_2.getProjectById)(req, res);
});
// GET /api/projects/:id/sketches
router.get('/:id/sketches', authMiddleware_1.optionalAuthenticateToken, projectController_1.getProjectSketches);
// GET /api/projects/:id/sketches/:folder/svg
router.get('/:id/sketches/:folder/svg', authMiddleware_1.optionalAuthenticateToken, projectController_1.getSketchSvg);
// 2. ОБНОВЛЕНИЕ ПРОЕКТА (Текстовые данные + Новые файлы)
// Добавляем upload.array('files'), чтобы multer распарсил новые STL
router.put('/:id', authMiddleware_1.authenticateToken, (0, authMiddleware_1.authorizeRoles)('admin'), upload.array('files', 10), projectController_2.updateProject);
// 3. УДАЛЕНИЕ КОНКРЕТНОГО ФАЙЛА ИЗ ПРОЕКТА
router.post('/:id/delete-file', authMiddleware_1.authenticateToken, (0, authMiddleware_1.authorizeRoles)('admin'), projectController_2.deleteFile);
// 4. СОХРАНЕНИЕ СОСТОЯНИЯ СЦЕНЫ
// router.put('/:id/scene', authenticateToken, saveProjectScene);
router.put('/:id/scene', authMiddleware_1.optionalAuthenticateToken, projectController_2.saveProjectScene);
// 5. ИМПОРТ ГОТОВЫХ ЭСКИЗОВ (.json + .svg)
// Разрешаем загрузку до 50 файлов за раз. Поле называется 'sketchFiles', как мы указали во фронтенде!
router.post('/:id/import-sketches', authMiddleware_1.authenticateToken, (0, authMiddleware_1.authorizeRoles)('admin'), upload.array('sketchFiles', 50), projectController_2.importSketches);
router.post('/sketches/:sketchId/read', authMiddleware_1.authenticateToken, (0, authMiddleware_1.authorizeRoles)('admin'), projectController_1.markSketchAsRead);
exports.default = router;
