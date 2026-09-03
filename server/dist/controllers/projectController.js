"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.importSketches = exports.getSketchSvg = exports.getProjectSketches = exports.saveSketch = exports.saveProjectScene = exports.getProjectById = exports.markSketchAsRead = exports.saveProjectFolders = exports.getProjectFolders = exports.getProjects = exports.createProject = exports.deletePattern = exports.deleteFile = exports.updateProject = void 0;
const db_1 = __importDefault(require("../config/db"));
const crypto_1 = require("crypto");
const fileSystem_1 = require("../utils/fileSystem");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const sharp_1 = __importDefault(require("sharp"));
const REMOVED_PROJECT_FOLDER_IDS = new Set(['review', 'surgery']);
const REMOVED_PROJECT_FOLDER_NAMES = new Set(['на проверке', 'хирургия']);
// Вспомогательная функция для безопасного получения строкового параметра
const getParamAsString = (param) => {
    if (Array.isArray(param))
        return param[0];
    return param || '';
};
const getUploadedFiles = (files, fieldName = 'files') => {
    if (Array.isArray(files))
        return fieldName === 'files' ? files : [];
    return files?.[fieldName] || [];
};
const PATTERN_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg']);
const MAX_PATTERN_EDGE = 4096;
const getMedian = (values) => {
    if (values.length === 0)
        return 255;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
};
const makePatternBackgroundTransparent = async (sourcePath, outputPath) => {
    const { data, info } = await (0, sharp_1.default)(sourcePath, {
        density: 300,
        limitInputPixels: 40000000,
        failOn: 'error',
    })
        .rotate()
        .resize({
        width: MAX_PATTERN_EDGE,
        height: MAX_PATTERN_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
    })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    const borderR = [];
    const borderG = [];
    const borderB = [];
    let transparentBorderPixels = 0;
    let sampledBorderPixels = 0;
    const step = Math.max(1, Math.floor(Math.max(info.width, info.height) / 600));
    const samplePixel = (x, y) => {
        const offset = (y * info.width + x) * 4;
        sampledBorderPixels += 1;
        if (data[offset + 3] < 32) {
            transparentBorderPixels += 1;
            return;
        }
        borderR.push(data[offset]);
        borderG.push(data[offset + 1]);
        borderB.push(data[offset + 2]);
    };
    for (let x = 0; x < info.width; x += step) {
        samplePixel(x, 0);
        if (info.height > 1)
            samplePixel(x, info.height - 1);
    }
    for (let y = step; y < info.height - 1; y += step) {
        samplePixel(0, y);
        if (info.width > 1)
            samplePixel(info.width - 1, y);
    }
    const borderIsAlreadyTransparent = sampledBorderPixels > 0 && transparentBorderPixels / sampledBorderPixels > 0.45;
    if (!borderIsAlreadyTransparent && borderR.length > 0) {
        const background = [getMedian(borderR), getMedian(borderG), getMedian(borderB)];
        // A tighter transition keeps JPEG contour edges opaque instead of making
        // compression-softened pixels look washed out.
        const lowThreshold = 6;
        const highThreshold = 46;
        for (let offset = 0; offset < data.length; offset += 4) {
            const redDifference = data[offset] - background[0];
            const greenDifference = data[offset + 1] - background[1];
            const blueDifference = data[offset + 2] - background[2];
            const distance = Math.sqrt(redDifference * redDifference +
                greenDifference * greenDifference +
                blueDifference * blueDifference);
            const normalized = Math.min(1, Math.max(0, (distance - lowThreshold) / (highThreshold - lowThreshold)));
            const backgroundMask = normalized * normalized * (3 - 2 * normalized);
            const originalAlpha = data[offset + 3] / 255;
            const nextAlpha = originalAlpha * backgroundMask;
            if (nextAlpha > 0.01 && backgroundMask < 0.999) {
                for (let channel = 0; channel < 3; channel += 1) {
                    const recovered = (data[offset + channel] - background[channel] * (1 - backgroundMask)) / backgroundMask;
                    data[offset + channel] = Math.round(Math.min(255, Math.max(0, recovered)));
                }
            }
            data[offset + 3] = Math.round(nextAlpha * 255);
        }
    }
    await (0, sharp_1.default)(data, {
        raw: {
            width: info.width,
            height: info.height,
            channels: 4,
        },
    })
        .png({ compressionLevel: 9, adaptiveFiltering: true })
        .toFile(outputPath);
    return { width: info.width, height: info.height };
};
const preparePatternFiles = async (projectPath, files) => {
    if (files.length === 0)
        return [];
    const originalsPath = path_1.default.join(projectPath, 'patterns', 'originals');
    const processedPath = path_1.default.join(projectPath, 'patterns', 'processed');
    fs_1.default.mkdirSync(originalsPath, { recursive: true });
    fs_1.default.mkdirSync(processedPath, { recursive: true });
    const prepared = [];
    for (const file of files) {
        const extension = path_1.default.extname(file.originalname).toLowerCase();
        if (!PATTERN_EXTENSIONS.has(extension)) {
            fs_1.default.unlinkSync(file.path);
            throw new Error(`Неподдерживаемый формат лекала: ${file.originalname}`);
        }
        const id = (0, crypto_1.randomUUID)();
        const sourceFileName = `${id}${extension}`;
        const processedFileName = `${id}.png`;
        const sourcePath = path_1.default.join(originalsPath, sourceFileName);
        const outputPath = path_1.default.join(processedPath, processedFileName);
        fs_1.default.copyFileSync(file.path, sourcePath);
        fs_1.default.unlinkSync(file.path);
        try {
            const dimensions = await makePatternBackgroundTransparent(sourcePath, outputPath);
            prepared.push({
                id,
                originalName: (0, fileSystem_1.getSafeFileName)(file.originalname) || `Лекало ${prepared.length + 1}`,
                sourceFileName,
                processedFileName,
                ...dimensions,
            });
        }
        catch (error) {
            fs_1.default.rmSync(sourcePath, { force: true });
            fs_1.default.rmSync(outputPath, { force: true });
            throw new Error(`Не удалось обработать лекало ${file.originalname}: ${error.message}`);
        }
    }
    return prepared;
};
const insertPreparedPatterns = async (projectId, patterns) => {
    for (const pattern of patterns) {
        await db_1.default.query(`INSERT INTO project_patterns (
        id, project_id, original_name, source_file_name, processed_file_name, width, height
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
            pattern.id,
            projectId,
            pattern.originalName,
            pattern.sourceFileName,
            pattern.processedFileName,
            pattern.width,
            pattern.height,
        ]);
    }
};
const getStorageRelativePath = (projectPath) => {
    const relativePath = path_1.default.relative(fileSystem_1.STORAGE_DIR, projectPath);
    return relativePath.startsWith('..') || path_1.default.isAbsolute(relativePath)
        ? ''
        : path_1.default.posix.join('storage', ...relativePath.split(path_1.default.sep));
};
const parseFileGroups = (rawValue) => {
    if (typeof rawValue !== 'string')
        return {};
    try {
        const parsed = JSON.parse(rawValue);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    }
    catch {
        return {};
    }
};
const parseBooleanFormValue = (value) => {
    return value === true || value === 'true' || value === '1' || value === 'on';
};
const normalizePatternState = (value) => {
    if (!Array.isArray(value))
        return null;
    return value.reduce((items, item) => {
        if (!item || typeof item !== 'object')
            return items;
        const candidate = item;
        const id = normalizeOptionalUuid(candidate.id);
        if (!id)
            return items;
        const clamp = (input, min, max, fallback) => {
            const numeric = Number(input);
            return Number.isFinite(numeric) ? Math.min(max, Math.max(min, numeric)) : fallback;
        };
        const color = typeof candidate.color === 'string' && /^#[0-9a-f]{6}$/i.test(candidate.color)
            ? candidate.color
            : '#ffffff';
        items.push({
            id,
            visible: candidate.visible !== false,
            opacity: clamp(candidate.opacity, 0, 1, 1),
            x: clamp(candidate.x, 0, 1, 0.5),
            y: clamp(candidate.y, 0, 1, 0.5),
            scale: clamp(candidate.scale, 0.1, 5, 1),
            contrast: clamp(candidate.contrast, 0.5, 3, 1.15),
            color,
        });
        return items;
    }, []);
};
const isValidFolderId = (value) => {
    return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
};
const normalizeProjectFoldersPayload = (value) => {
    if (!Array.isArray(value))
        return [];
    const seenIds = new Set();
    return value.reduce((folders, item) => {
        if (!item || typeof item !== 'object')
            return folders;
        const folder = item;
        const id = typeof folder.id === 'string' ? folder.id.trim() : '';
        const name = typeof folder.name === 'string' ? folder.name.trim() : '';
        const normalizedName = name.toLocaleLowerCase('ru-RU');
        if (!isValidFolderId(id) ||
            !name ||
            seenIds.has(id) ||
            REMOVED_PROJECT_FOLDER_IDS.has(id) ||
            REMOVED_PROJECT_FOLDER_NAMES.has(normalizedName)) {
            return folders;
        }
        seenIds.add(id);
        folders.push({ id, name: name.slice(0, 80) });
        return folders;
    }, []);
};
const normalizeFolderAssignmentsPayload = (value, availableFolderIds) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return {};
    return Object.entries(value).reduce((assignments, [projectId, folderId]) => {
        if (typeof folderId !== 'string' || !availableFolderIds.has(folderId))
            return assignments;
        const normalizedProjectId = normalizeOptionalUuid(projectId);
        if (!normalizedProjectId)
            return assignments;
        assignments[normalizedProjectId] = folderId;
        return assignments;
    }, {});
};
const normalizeOptionalUuid = (value) => {
    if (typeof value !== 'string')
        return null;
    const trimmed = value.trim();
    if (!trimmed || trimmed === 'undefined' || trimmed === 'null')
        return null;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)
        ? trimmed
        : null;
};
const canReadProject = (project, authUser) => {
    if (project.is_public)
        return true;
    if (!authUser)
        return false;
    if (authUser.role === 'admin')
        return true;
    return Boolean(project.doctor_id) && String(authUser.userId) === String(project.doctor_id);
};
const canWritePrivateProject = (project, authUser) => {
    if (!authUser)
        return false;
    if (authUser.role === 'admin')
        return true;
    return Boolean(project.doctor_id) && String(authUser.userId) === String(project.doctor_id);
};
const sendProjectAccessDenied = (res, authUser) => {
    if (!authUser) {
        return res.status(401).json({ code: 'AUTH_REQUIRED', message: 'Для просмотра проекта требуется вход' });
    }
    return res.status(403).json({ code: 'FORBIDDEN', message: 'Доступ запрещен' });
};
const normalizeAuthorName = (value) => {
    if (typeof value !== 'string')
        return '';
    return value.replace(/\s+/g, ' ').trim().slice(0, 80);
};
const resolveSketchAuthor = async (authUser, guestName) => {
    if (!authUser) {
        const name = normalizeAuthorName(guestName);
        return name ? { userId: null, name, role: 'guest' } : null;
    }
    const userResult = await db_1.default.query('SELECT full_name FROM users WHERE id = $1', [authUser.userId]);
    const fallbackName = authUser.role === 'admin' ? 'Администратор' : 'Врач';
    const name = normalizeAuthorName(userResult.rows[0]?.full_name) || fallbackName;
    return {
        userId: authUser.userId,
        name,
        role: authUser.role,
    };
};
// 1. Обновленный метод UPDATE (теперь принимает и файлы)
const updateProject = async (req, res) => {
    try {
        const id = getParamAsString(req.params.id);
        const { doctor_id, doctor_name, patient_name, is_public } = req.body;
        const files = getUploadedFiles(req.files, 'files');
        const patternFiles = getUploadedFiles(req.files, 'patterns');
        const normalizedDoctorId = normalizeOptionalUuid(doctor_id);
        const isPublic = parseBooleanFormValue(is_public);
        const projectRes = await db_1.default.query("SELECT file_path_root FROM projects WHERE id = $1", [id]);
        if (projectRes.rows.length === 0)
            return res.status(404).json({ message: "Проект не найден" });
        const projectPath = projectRes.rows[0].file_path_root;
        await db_1.default.query(`UPDATE projects 
       SET doctor_id = $1, doctor_display_name = $2, patient_name = $3, is_public = $4
       WHERE id = $5`, [normalizedDoctorId, doctor_name || null, patient_name || null, isPublic, id]);
        if (files.length > 0) {
            const stlFolder = path_1.default.join(projectPath, 'stl');
            if (!fs_1.default.existsSync(stlFolder))
                fs_1.default.mkdirSync(stlFolder, { recursive: true });
            files.forEach(file => {
                const safeFileName = (0, fileSystem_1.getSafeFileName)(file.originalname);
                if (!safeFileName)
                    return;
                const targetPath = path_1.default.join(stlFolder, safeFileName);
                fs_1.default.copyFileSync(file.path, targetPath);
                fs_1.default.unlinkSync(file.path);
            });
        }
        if (patternFiles.length > 0) {
            const preparedPatterns = await preparePatternFiles(projectPath, patternFiles);
            await insertPreparedPatterns(id, preparedPatterns);
        }
        res.json({ message: "Проект успешно обновлен" });
    }
    catch (error) {
        console.error("❌ Ошибка обновления проекта:", error);
        res.status(500).json({ message: "Ошибка сервера" });
    }
};
exports.updateProject = updateProject;
// 2. Метод для удаления файла
const deleteFile = async (req, res) => {
    try {
        const id = getParamAsString(req.params.id);
        const { fileName } = req.body;
        const projectRes = await db_1.default.query("SELECT file_path_root FROM projects WHERE id = $1", [id]);
        if (projectRes.rows.length === 0)
            return res.status(404).json({ message: "Проект не найден" });
        const safeFileName = (0, fileSystem_1.getSafeFileName)(fileName);
        if (!safeFileName || safeFileName !== fileName) {
            return res.status(400).json({ message: "Некорректное имя файла" });
        }
        const filePath = path_1.default.join(projectRes.rows[0].file_path_root, 'stl', safeFileName);
        if (fs_1.default.existsSync(filePath)) {
            fs_1.default.unlinkSync(filePath);
            res.json({ message: "Файл удален" });
        }
        else {
            res.status(404).json({ message: "Файл не найден на диске" });
        }
    }
    catch (error) {
        res.status(500).json({ message: "Ошибка при удалении файла" });
    }
};
exports.deleteFile = deleteFile;
const deletePattern = async (req, res) => {
    try {
        const id = getParamAsString(req.params.id);
        const patternId = normalizeOptionalUuid(req.body?.patternId);
        if (!patternId) {
            return res.status(400).json({ message: 'Некорректный идентификатор лекала' });
        }
        const result = await db_1.default.query(`SELECT p.file_path_root, pp.source_file_name, pp.processed_file_name
       FROM project_patterns pp
       JOIN projects p ON p.id = pp.project_id
       WHERE pp.id = $1 AND pp.project_id = $2`, [patternId, id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Лекало не найдено' });
        }
        const pattern = result.rows[0];
        fs_1.default.rmSync(path_1.default.join(pattern.file_path_root, 'patterns', 'originals', pattern.source_file_name), { force: true });
        fs_1.default.rmSync(path_1.default.join(pattern.file_path_root, 'patterns', 'processed', pattern.processed_file_name), { force: true });
        await db_1.default.query('DELETE FROM project_patterns WHERE id = $1 AND project_id = $2', [patternId, id]);
        await db_1.default.query(`UPDATE projects
       SET pattern_state = COALESCE(
         (SELECT jsonb_agg(item) FROM jsonb_array_elements(COALESCE(pattern_state, '[]'::jsonb)) AS items(item) WHERE item->>'id' <> $2),
         '[]'::jsonb
       )
       WHERE id = $1`, [id, patternId]);
        res.json({ message: 'Лекало удалено' });
    }
    catch (error) {
        console.error('❌ Ошибка удаления лекала:', error);
        res.status(500).json({ message: 'Ошибка при удалении лекала' });
    }
};
exports.deletePattern = deletePattern;
const createProject = async (req, res) => {
    try {
        const { country, city, clinic, department, doctor_id, doctor_name, patient_name, open_scene, is_public } = req.body;
        const files = getUploadedFiles(req.files, 'files');
        const patternFiles = getUploadedFiles(req.files, 'patterns');
        const normalizedDoctorId = normalizeOptionalUuid(doctor_id);
        console.log("🔍 [CREATING PROJECT] Data received:", req.body);
        const sCountry = country || 'Unknown_Country';
        const sCity = city || 'Unknown_City';
        const sClinic = clinic || 'Unknown_Clinic';
        const sDept = department || 'Unknown_Department';
        const sDocName = doctor_name || 'Unknown_Doctor';
        const sPatient = patient_name || 'Unknown_Patient';
        const isPublic = parseBooleanFormValue(open_scene) || parseBooleanFormValue(is_public);
        const projectId = (0, crypto_1.randomUUID)();
        const projectPath = (0, fileSystem_1.createProjectPath)(sCountry, sCity, sClinic, sDept, sDocName, sPatient, projectId);
        await db_1.default.query(`INSERT INTO projects (id, doctor_id, patient_name, doctor_display_name, file_path_root, is_public) 
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`, [projectId, normalizedDoctorId, sPatient, sDocName, projectPath, isPublic]);
        if (files.length > 0) {
            const stlFolder = path_1.default.join(projectPath, 'stl');
            files.forEach(file => {
                const safeFileName = (0, fileSystem_1.getSafeFileName)(file.originalname);
                if (!safeFileName)
                    return;
                const targetPath = path_1.default.join(stlFolder, safeFileName);
                fs_1.default.copyFileSync(file.path, targetPath);
                fs_1.default.unlinkSync(file.path);
            });
            console.log(`✅ ${files.length} STL files copied to ${stlFolder}`);
        }
        const preparedPatterns = await preparePatternFiles(projectPath, patternFiles);
        await insertPreparedPatterns(projectId, preparedPatterns);
        const fileGroups = parseFileGroups(req.body.file_groups);
        const initialSceneState = files.map((file, index) => ({
            id: `stl:${(0, fileSystem_1.getSafeFileName)(file.originalname)}`,
            group: fileGroups[file.originalname] || 'Ткани',
            visible: true,
            color: '#cccccc',
            opacity: 1,
            position: [0, 0, 0],
            rotation: [0, 0, 0]
        }));
        await db_1.default.query("UPDATE projects SET scene_state = $1, pattern_state = $2 WHERE id = $3", [
            JSON.stringify(initialSceneState),
            JSON.stringify(preparedPatterns.map((pattern, index) => ({
                id: pattern.id,
                visible: true,
                opacity: 1,
                x: Math.min(0.8, 0.5 + index * 0.025),
                y: Math.min(0.8, 0.5 + index * 0.025),
                scale: 1,
                contrast: 1.15,
                color: '#ffffff',
            }))),
            projectId,
        ]);
        res.status(201).json({
            message: "Проект успешно создан",
            projectId,
            path: projectPath
        });
    }
    catch (error) {
        console.error("❌ Ошибка в projectController:", error);
        res.status(500).json({
            message: "Ошибка при создании проекта на сервере",
            error: error.message
        });
    }
};
exports.createProject = createProject;
// Получение списка проектов (оставляем для админки)
const getProjects = async (req, res) => {
    try {
        const authUser = req.user;
        if (!authUser) {
            return res.status(401).json({ code: 'AUTH_REQUIRED', message: 'Требуется вход в систему' });
        }
        let query = `
  SELECT 
    p.*, 
    u.full_name as doctor_display_name,
    (SELECT COUNT(*) FROM sketches s WHERE s.project_id = p.id) as sketches_count,
    (SELECT COUNT(*) FROM sketches s WHERE s.project_id = p.id AND s.is_read = false) as unread_sketches_count
  FROM projects p
  LEFT JOIN users u ON p.doctor_id = u.id
`;
        let params = [];
        if (authUser.role === 'doctor') {
            query += ` WHERE p.doctor_id = $1`;
            params = [authUser.userId];
        }
        query += ` ORDER BY p.created_at DESC`;
        const result = await db_1.default.query(query, params);
        res.json(result.rows);
    }
    catch (error) {
        res.status(500).json({ message: "Ошибка получения списка" });
    }
};
exports.getProjects = getProjects;
const getProjectFolders = async (_req, res) => {
    try {
        const foldersResult = await db_1.default.query(`SELECT id, name
       FROM project_folders
       WHERE id <> ALL($1)
       ORDER BY sort_order ASC, created_at ASC`, [Array.from(REMOVED_PROJECT_FOLDER_IDS)]);
        const assignmentsResult = await db_1.default.query(`SELECT project_id, folder_id
       FROM project_folder_assignments
       WHERE folder_id <> ALL($1)`, [Array.from(REMOVED_PROJECT_FOLDER_IDS)]);
        res.json({
            folders: foldersResult.rows,
            projectFolders: assignmentsResult.rows.reduce((map, row) => {
                map[String(row.project_id)] = String(row.folder_id);
                return map;
            }, {}),
        });
    }
    catch (error) {
        console.error('❌ Ошибка получения папок проектов:', error);
        res.status(500).json({ message: 'Ошибка получения папок проектов' });
    }
};
exports.getProjectFolders = getProjectFolders;
const saveProjectFolders = async (req, res) => {
    let client;
    try {
        client = await db_1.default.connect();
        const folders = normalizeProjectFoldersPayload(req.body?.folders);
        const folderIds = new Set(folders.map((folder) => folder.id));
        const projectFolders = normalizeFolderAssignmentsPayload(req.body?.projectFolders, folderIds);
        await client.query('BEGIN');
        await client.query('DELETE FROM project_folder_assignments');
        await client.query('DELETE FROM project_folders');
        for (const [index, folder] of folders.entries()) {
            await client.query(`INSERT INTO project_folders (id, name, sort_order)
         VALUES ($1, $2, $3)`, [folder.id, folder.name, index]);
        }
        for (const [projectId, folderId] of Object.entries(projectFolders)) {
            await client.query(`INSERT INTO project_folder_assignments (project_id, folder_id)
         VALUES ($1, $2)`, [projectId, folderId]);
        }
        await client.query('COMMIT');
        res.json({ folders, projectFolders });
    }
    catch (error) {
        if (client) {
            await client.query('ROLLBACK').catch((rollbackError) => {
                console.error('❌ Ошибка отката сохранения папок проектов:', rollbackError.message);
            });
        }
        console.error('❌ Ошибка сохранения папок проектов:', error);
        res.status(500).json({ message: 'Ошибка сохранения папок проектов' });
    }
    finally {
        client?.release();
    }
};
exports.saveProjectFolders = saveProjectFolders;
const markSketchAsRead = async (req, res) => {
    try {
        const { sketchId } = req.params;
        await db_1.default.query('UPDATE sketches SET is_read = true WHERE id = $1', [sketchId]);
        res.json({ success: true });
    }
    catch (error) {
        res.status(500).json({ error: 'Ошибка сервера' });
    }
};
exports.markSketchAsRead = markSketchAsRead;
const getProjectById = async (req, res) => {
    try {
        const id = getParamAsString(req.params.id);
        const result = await db_1.default.query("SELECT * FROM projects WHERE id = $1", [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Проект не найден" });
        }
        // server/src/controllers/projectController.ts
        const project = result.rows[0];
        const authUser = req.user;
        if (!canReadProject(project, authUser)) {
            return sendProjectAccessDenied(res, authUser);
        }
        const stlFolder = path_1.default.join(project.file_path_root, 'stl');
        const relativePath = getStorageRelativePath(project.file_path_root);
        let stlFiles = [];
        if (fs_1.default.existsSync(stlFolder)) {
            const files = fs_1.default.readdirSync(stlFolder).filter(f => f.toLowerCase().endsWith('.stl'));
            stlFiles = files.map((file, index) => ({
                id: `stl:${file}`,
                legacyId: `stl-${index}`,
                name: file,
                // УБИРАЕМ baseUrl. Путь должен начинаться со слеша /
                url: `/${relativePath}/stl/${encodeURIComponent(file)}`,
                position: [0, 0, 0],
                rotation: [0, 0, 0],
                color: '#cccccc',
                opacity: 1,
                visible: true
            }));
        }
        const patternsResult = await db_1.default.query(`SELECT id, original_name, processed_file_name, width, height
   FROM project_patterns
   WHERE project_id = $1
   ORDER BY created_at ASC, id ASC`, [id]);
        const patterns = patternsResult.rows.map((pattern) => ({
            id: pattern.id,
            name: pattern.original_name,
            url: `/${relativePath}/patterns/processed/${encodeURIComponent(pattern.processed_file_name)}`,
            width: pattern.width,
            height: pattern.height,
        }));
        res.json({ project, stlFiles, patterns });
    }
    catch (error) {
        console.error("❌ Ошибка при получении проекта:", error);
        res.status(500).json({ message: "Ошибка сервера" });
    }
};
exports.getProjectById = getProjectById;
const saveProjectScene = async (req, res) => {
    try {
        const id = getParamAsString(req.params.id);
        const { sceneState, patternState } = req.body;
        const authUser = req.user;
        // Получаем информацию о проекте
        const projectRes = await db_1.default.query("SELECT is_public, doctor_id FROM projects WHERE id = $1", [id]);
        if (projectRes.rows.length === 0) {
            return res.status(404).json({ message: "Проект не найден" });
        }
        const project = projectRes.rows[0];
        // Если проект НЕ публичный, проверяем авторизацию и права
        if (!project.is_public) {
            if (!authUser) {
                return res.status(401).json({ code: 'AUTH_REQUIRED', message: "Требуется авторизация для редактирования приватного проекта" });
            }
            if (!canWritePrivateProject(project, authUser)) {
                return res.status(403).json({ code: 'FORBIDDEN', message: "Нет прав на редактирование этого проекта" });
            }
        }
        const normalizedPatternState = patternState === undefined ? null : normalizePatternState(patternState);
        if (patternState !== undefined && normalizedPatternState === null) {
            return res.status(400).json({ message: 'Некорректное состояние лекал' });
        }
        await db_1.default.query(`UPDATE projects
       SET scene_state = $1,
           pattern_state = CASE WHEN $2::jsonb IS NULL THEN pattern_state ELSE $2::jsonb END
       WHERE id = $3`, [JSON.stringify(Array.isArray(sceneState) ? sceneState : []), normalizedPatternState ? JSON.stringify(normalizedPatternState) : null, id]);
        res.json({ message: "Сцена успешно сохранена" });
    }
    catch (error) {
        console.error("❌ Ошибка сохранения сцены:", error);
        res.status(500).json({ message: "Ошибка сервера" });
    }
};
exports.saveProjectScene = saveProjectScene;
// НОВЫЙ МЕТОД СОХРАНЕНИЯ ЭСКИЗА В ПОДПАПКИ
const saveSketch = async (req, res) => {
    try {
        const id = getParamAsString(req.params.id);
        const { cameraState, canvasData, svgContent, textNotes, audioNotes, modelsState, guestName } = req.body;
        const authUser = req.user;
        // 1. Получаем информацию о проекте (включая is_public и doctor_id)
        const projectRes = await db_1.default.query("SELECT file_path_root, is_public, doctor_id FROM projects WHERE id = $1", [id]);
        if (projectRes.rows.length === 0) {
            return res.status(404).json({ message: "Проект не найден" });
        }
        const project = projectRes.rows[0];
        // 2. Проверка прав доступа
        if (!project.is_public) {
            // Приватный проект — нужна авторизация и права владельца
            if (!authUser) {
                return res.status(401).json({ code: 'AUTH_REQUIRED', message: "Требуется авторизация для сохранения эскиза в приватном проекте" });
            }
            if (!canWritePrivateProject(project, authUser)) {
                return res.status(403).json({ code: 'FORBIDDEN', message: "Нет прав на сохранение эскиза в этом проекте" });
            }
        }
        // Если проект публичный — анонимный пользователь может сохранять (authUser может быть undefined)
        const author = await resolveSketchAuthor(authUser, guestName);
        if (!author) {
            return res.status(400).json({
                code: 'GUEST_NAME_REQUIRED',
                message: 'Укажите имя автора эскиза',
            });
        }
        const projectPath = project.file_path_root;
        const sketchesBasePath = path_1.default.join(projectPath, 'sketches');
        if (!fs_1.default.existsSync(sketchesBasePath)) {
            fs_1.default.mkdirSync(sketchesBasePath, { recursive: true });
        }
        const existingFolders = fs_1.default.readdirSync(sketchesBasePath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => parseInt(dirent.name))
            .filter(num => !isNaN(num));
        const nextFolderNumber = existingFolders.length > 0
            ? Math.max(...existingFolders) + 1
            : 1;
        const newSketchDirPath = path_1.default.join(sketchesBasePath, nextFolderNumber.toString());
        fs_1.default.mkdirSync(newSketchDirPath, { recursive: true });
        const jsonFileName = 'data.json';
        const svgFileName = 'sketch.svg';
        fs_1.default.writeFileSync(path_1.default.join(newSketchDirPath, jsonFileName), JSON.stringify({
            cameraState,
            canvasData,
            textNotes,
            audioNotes,
            modelsState,
            authorName: author.name,
            authorRole: author.role,
        }, null, 2));
        if (svgContent) {
            fs_1.default.writeFileSync(path_1.default.join(newSketchDirPath, svgFileName), svgContent);
        }
        console.log(`✅ Эскиз сохранен в папку: ${newSketchDirPath}`);
        const sketchRes = await db_1.default.query(`INSERT INTO sketches (
         project_id, author_user_id, author_name, author_role, camera_state, canvas_data,
         text_notes, audio_notes, folder_number, models_state
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`, [
            id,
            author.userId,
            author.name,
            author.role,
            JSON.stringify(cameraState),
            JSON.stringify(canvasData),
            JSON.stringify(textNotes || []),
            JSON.stringify(audioNotes || []),
            nextFolderNumber,
            JSON.stringify(modelsState || [])
        ]);
        const sketchId = sketchRes.rows[0].id;
        await db_1.default.query(`INSERT INTO technical_tasks (project_id, sketch_id) VALUES ($1, $2)`, [id, sketchId]);
        res.status(200).json({
            message: "Эскиз и ТЗ успешно сохранены в новую папку",
            sketchId,
            folderId: nextFolderNumber,
            authorName: author.name,
            authorRole: author.role,
        });
    }
    catch (error) {
        console.error("❌ Ошибка сохранения эскиза:", error);
        res.status(500).json({ message: "Ошибка сервера при сохранении эскиза" });
    }
};
exports.saveSketch = saveSketch;
// Получение списка эскизов проекта
const getProjectSketches = async (req, res) => {
    try {
        const id = getParamAsString(req.params.id);
        const authUser = req.user;
        const projectRes = await db_1.default.query("SELECT is_public, doctor_id FROM projects WHERE id = $1", [id]);
        if (projectRes.rows.length === 0) {
            return res.status(404).json({ message: "Проект не найден" });
        }
        if (!canReadProject(projectRes.rows[0], authUser)) {
            return sendProjectAccessDenied(res, authUser);
        }
        const result = await db_1.default.query(`SELECT id, folder_number, camera_state, canvas_data, text_notes, audio_notes, models_state,
          author_user_id, author_name, author_role, created_at, is_read
  FROM sketches 
  WHERE project_id = $1 
  ORDER BY folder_number ASC`, [id]);
        const sketches = result.rows.map(row => ({
            id: row.id,
            folderNumber: row.folder_number,
            cameraState: row.camera_state,
            canvasData: row.canvas_data,
            textNotes: row.text_notes,
            audioNotes: row.audio_notes || [],
            modelsState: row.models_state, // <--- Передаем во фронтенд!
            authorUserId: row.author_user_id,
            authorName: row.author_name,
            authorRole: row.author_role,
            createdAt: row.created_at,
            is_read: row.is_read,
            svgUrl: `/api/projects/${id}/sketches/${row.folder_number}/svg`
        }));
        res.json(sketches);
    }
    catch (error) {
        console.error("❌ Ошибка получения списка эскизов:", error);
        res.status(500).json({ message: "Ошибка сервера" });
    }
};
exports.getProjectSketches = getProjectSketches;
// Получение SVG-файла эскиза
const getSketchSvg = async (req, res) => {
    try {
        const id = getParamAsString(req.params.id);
        const folder = getParamAsString(req.params.folder);
        const authUser = req.user;
        const projectRes = await db_1.default.query("SELECT file_path_root, is_public, doctor_id FROM projects WHERE id = $1", [id]);
        if (projectRes.rows.length === 0) {
            return res.status(404).json({ message: "Проект не найден" });
        }
        const project = projectRes.rows[0];
        if (!canReadProject(project, authUser)) {
            return sendProjectAccessDenied(res, authUser);
        }
        const projectPath = project.file_path_root;
        const svgPath = path_1.default.join(projectPath, 'sketches', folder, 'sketch.svg');
        if (!fs_1.default.existsSync(svgPath)) {
            return res.status(404).json({ message: "SVG файл не найден" });
        }
        const svgContent = fs_1.default.readFileSync(svgPath, 'utf-8');
        res.type('image/svg+xml').send(svgContent);
    }
    catch (error) {
        console.error("❌ Ошибка получения SVG:", error);
        res.status(500).json({ message: "Ошибка сервера" });
    }
};
exports.getSketchSvg = getSketchSvg;
// НОВЫЙ МЕТОД ДЛЯ ИМПОРТА СТАРЫХ ЭСКИЗОВ
const importSketches = async (req, res) => {
    const files = req.files;
    try {
        const id = getParamAsString(req.params.id);
        const authUser = req.user;
        const importingAuthor = await resolveSketchAuthor(authUser, null);
        // 1. Проверяем существование проекта и находим его путь
        const projectRes = await db_1.default.query("SELECT file_path_root FROM projects WHERE id = $1", [id]);
        if (projectRes.rows.length === 0) {
            return res.status(404).json({ message: "Проект не найден" });
        }
        const projectPath = projectRes.rows[0].file_path_root;
        const sketchesBasePath = path_1.default.join(projectPath, 'sketches');
        if (!fs_1.default.existsSync(sketchesBasePath)) {
            fs_1.default.mkdirSync(sketchesBasePath, { recursive: true });
        }
        // 2. Находим текущий максимальный номер папки, чтобы продолжить нумерацию
        let currentMaxFolder = 0;
        const existingFolders = fs_1.default.readdirSync(sketchesBasePath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => parseInt(dirent.name))
            .filter(num => !isNaN(num));
        if (existingFolders.length > 0) {
            currentMaxFolder = Math.max(...existingFolders);
        }
        // 3. Группируем файлы по базовому имени (например "sketch-1")
        const fileGroups = {};
        if (files) {
            files.forEach(file => {
                const ext = path_1.default.extname(file.originalname).toLowerCase();
                const baseName = path_1.default.basename(file.originalname, ext);
                if (!fileGroups[baseName])
                    fileGroups[baseName] = {};
                if (ext === '.json')
                    fileGroups[baseName].json = file;
                if (ext === '.svg')
                    fileGroups[baseName].svg = file;
            });
        }
        let importedCount = 0;
        // 4. Обрабатываем каждую пару (или одиночный JSON)
        for (const [baseName, group] of Object.entries(fileGroups)) {
            if (!group.json)
                continue; // Без JSON файла не можем восстановить данные, пропускаем
            try {
                // Читаем JSON
                const jsonContent = fs_1.default.readFileSync(group.json.path, 'utf-8');
                const parsedData = JSON.parse(jsonContent);
                // Увеличиваем номер папки
                currentMaxFolder += 1;
                const nextFolderNumber = currentMaxFolder;
                // Создаем папку для эскиза
                const newSketchDirPath = path_1.default.join(sketchesBasePath, nextFolderNumber.toString());
                fs_1.default.mkdirSync(newSketchDirPath, { recursive: true });
                // Если есть SVG, копируем его туда
                if (group.svg) {
                    fs_1.default.copyFileSync(group.svg.path, path_1.default.join(newSketchDirPath, 'sketch.svg'));
                }
                const cameraState = parsedData.cameraState || null;
                const canvasData = parsedData.canvasData || null; // <--- Здесь только canvasData
                const textNotes = parsedData.textNotes || [];
                const audioNotes = parsedData.audioNotes || [];
                const modelsState = parsedData.modelsState || []; // <--- Вытаскиваем modelsState
                const importedAuthorName = normalizeAuthorName(parsedData.authorName);
                const importedAuthorRole = ['admin', 'doctor', 'guest'].includes(parsedData.authorRole)
                    ? parsedData.authorRole
                    : null;
                const hasImportedAuthor = Boolean(importedAuthorName && importedAuthorRole);
                const authorName = hasImportedAuthor ? importedAuthorName : importingAuthor?.name || 'Администратор';
                const authorRole = hasImportedAuthor ? importedAuthorRole : importingAuthor?.role || 'admin';
                const authorUserId = hasImportedAuthor ? null : importingAuthor?.userId || null;
                // Пишем в БД эскиз
                const sketchRes = await db_1.default.query(`INSERT INTO sketches (
     project_id, author_user_id, author_name, author_role, camera_state, canvas_data,
     text_notes, audio_notes, folder_number, models_state
   )
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`, [
                    id,
                    authorUserId,
                    authorName,
                    authorRole,
                    JSON.stringify(cameraState),
                    JSON.stringify(canvasData),
                    JSON.stringify(textNotes),
                    JSON.stringify(audioNotes),
                    nextFolderNumber,
                    JSON.stringify(modelsState) // <--- Сохраняем настройки прозрачности и цвета
                ]);
                // Привязываем к ТЗ (как это делает обычное сохранение)
                await db_1.default.query(`INSERT INTO technical_tasks (project_id, sketch_id) VALUES ($1, $2)`, [id, sketchRes.rows[0].id]);
                importedCount++;
            }
            catch (err) {
                console.error(`❌ Ошибка при обработке группы файлов ${baseName}:`, err);
            }
        }
        res.json({ message: `Успешно импортировано эскизов: ${importedCount}` });
    }
    catch (error) {
        console.error("❌ Ошибка импорта эскизов:", error);
        res.status(500).json({ message: "Ошибка сервера при импорте" });
    }
    finally {
        // 5. Очистка: обязательно удаляем временные файлы загруженные multer из папки uploads/
        if (files) {
            files.forEach(file => {
                if (fs_1.default.existsSync(file.path))
                    fs_1.default.unlinkSync(file.path);
            });
        }
    }
};
exports.importSketches = importSketches;
