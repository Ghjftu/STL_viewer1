"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSafeFileName = exports.createProjectPath = exports.STORAGE_DIR = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
exports.STORAGE_DIR = path_1.default.join(__dirname, '../../storage');
const sanitizePathSegment = (segment, fallback) => {
    const cleaned = String(segment || '')
        .trim()
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
        .replace(/\.\.+/g, '.')
        .replace(/\s+/g, ' ')
        .slice(0, 120);
    return cleaned && cleaned !== '.' ? cleaned : fallback;
};
const createProjectPath = (country, city, clinic, department, doctor, patient, projectId) => {
    const targetPath = path_1.default.join(exports.STORAGE_DIR, sanitizePathSegment(country, 'Unknown_Country'), sanitizePathSegment(city, 'Unknown_City'), sanitizePathSegment(clinic, 'Unknown_Clinic'), sanitizePathSegment(department, 'Unknown_Department'), sanitizePathSegment(doctor, 'Unknown_Doctor'), sanitizePathSegment(patient, 'Unknown_Patient'), sanitizePathSegment(projectId, 'Unknown_Project'));
    // Создаем подпапки
    const subfolders = ['stl', 'sketches', 'tz'];
    if (!fs_1.default.existsSync(targetPath)) {
        fs_1.default.mkdirSync(targetPath, { recursive: true });
    }
    subfolders.forEach(folder => {
        const folderPath = path_1.default.join(targetPath, folder);
        if (!fs_1.default.existsSync(folderPath)) {
            fs_1.default.mkdirSync(folderPath);
        }
    });
    return targetPath; // Возвращаем путь, чтобы контроллер мог закинуть туда файлы
};
exports.createProjectPath = createProjectPath;
const getSafeFileName = (fileName) => {
    return path_1.default.basename(fileName || '').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
};
exports.getSafeFileName = getSafeFileName;
