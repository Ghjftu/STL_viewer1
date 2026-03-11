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
const upload = (0, multer_1.default)({ storage, limits: { fileSize: 50 * 1024 * 1024 } });
// --- МАРШРУТЫ ---
// 1. Создание и список — ТОЖЕ закроем, чтобы только админ/врач могли видеть
router.post('/create', authMiddleware_1.authenticateToken, upload.array('files', 10), projectController_1.createProject);
router.post('/:id/sketch', authMiddleware_1.authenticateToken, projectController_1.saveSketch);
router.get('/list', authMiddleware_1.authenticateToken, projectController_1.getProjects);
// 2. Получение проекта по ID (Самый важный для врача)
router.get('/:id', authMiddleware_1.authenticateToken, (req, res) => {
    console.log(`🔐 [AUTH OK] Юзер ${req.user?.userId} запрашивает проект ${req.params.id}`);
    (0, projectController_1.getProjectById)(req, res);
});
// 3. Сохранение сцены
router.put('/:id/scene', authMiddleware_1.authenticateToken, projectController_1.saveProjectScene);
exports.default = router;
