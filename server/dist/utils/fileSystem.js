"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProjectPath = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const createProjectPath = (country, city, clinic, department, doctor, patient) => {
    // Базовая папка storage лежит в корне сервера
    const basePath = path_1.default.join(__dirname, '../../storage');
    // Создаем путь по ТЗ
    const targetPath = path_1.default.join(basePath, country, city, clinic, department, doctor, patient);
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
