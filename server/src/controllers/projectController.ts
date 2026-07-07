import { Request, Response } from 'express';
import { PoolClient } from 'pg';
import pool from '../config/db';
import { randomUUID } from 'crypto';
import { createProjectPath, getSafeFileName, STORAGE_DIR } from '../utils/fileSystem';
import fs from 'fs';
import path from 'path';

type AuthUser = {
  userId: string;
  role: 'admin' | 'doctor';
} | undefined;

type ProjectFolderPayload = {
  id: string;
  name: string;
};

type SketchAuthorRole = 'admin' | 'doctor' | 'guest';

type SketchAuthor = {
  userId: string | null;
  name: string;
  role: SketchAuthorRole;
};

const REMOVED_PROJECT_FOLDER_IDS = new Set(['review', 'surgery']);
const REMOVED_PROJECT_FOLDER_NAMES = new Set(['на проверке', 'хирургия']);

// Вспомогательная функция для безопасного получения строкового параметра
const getParamAsString = (param: string | string[] | undefined): string => {
  if (Array.isArray(param)) return param[0];
  return param || '';
};

const getUploadedFiles = (files: Request['files']): Express.Multer.File[] => {
  return Array.isArray(files) ? files : [];
};

const getStorageRelativePath = (projectPath: string): string => {
  const relativePath = path.relative(STORAGE_DIR, projectPath);
  return relativePath.startsWith('..') || path.isAbsolute(relativePath)
    ? ''
    : path.posix.join('storage', ...relativePath.split(path.sep));
};

const parseFileGroups = (rawValue: unknown): Record<string, string> => {
  if (typeof rawValue !== 'string') return {};

  try {
    const parsed = JSON.parse(rawValue);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const parseBooleanFormValue = (value: unknown): boolean => {
  return value === true || value === 'true' || value === '1' || value === 'on';
};

const isValidFolderId = (value: unknown): value is string => {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
};

const normalizeProjectFoldersPayload = (value: unknown): ProjectFolderPayload[] => {
  if (!Array.isArray(value)) return [];

  const seenIds = new Set<string>();
  return value.reduce<ProjectFolderPayload[]>((folders, item) => {
    if (!item || typeof item !== 'object') return folders;

    const folder = item as Partial<ProjectFolderPayload>;
    const id = typeof folder.id === 'string' ? folder.id.trim() : '';
    const name = typeof folder.name === 'string' ? folder.name.trim() : '';
    const normalizedName = name.toLocaleLowerCase('ru-RU');

    if (
      !isValidFolderId(id) ||
      !name ||
      seenIds.has(id) ||
      REMOVED_PROJECT_FOLDER_IDS.has(id) ||
      REMOVED_PROJECT_FOLDER_NAMES.has(normalizedName)
    ) {
      return folders;
    }

    seenIds.add(id);
    folders.push({ id, name: name.slice(0, 80) });
    return folders;
  }, []);
};

const normalizeFolderAssignmentsPayload = (
  value: unknown,
  availableFolderIds: Set<string>
): Record<string, string> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, string>>(
    (assignments, [projectId, folderId]) => {
      if (typeof folderId !== 'string' || !availableFolderIds.has(folderId)) return assignments;
      const normalizedProjectId = normalizeOptionalUuid(projectId);
      if (!normalizedProjectId) return assignments;

      assignments[normalizedProjectId] = folderId;
      return assignments;
    },
    {}
  );
};

const normalizeOptionalUuid = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null') return null;

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)
    ? trimmed
    : null;
};

const canReadProject = (project: any, authUser: AuthUser): boolean => {
  if (project.is_public) return true;
  if (!authUser) return false;
  if (authUser.role === 'admin') return true;

  return Boolean(project.doctor_id) && String(authUser.userId) === String(project.doctor_id);
};

const canWritePrivateProject = (project: any, authUser: AuthUser): boolean => {
  if (!authUser) return false;
  if (authUser.role === 'admin') return true;

  return Boolean(project.doctor_id) && String(authUser.userId) === String(project.doctor_id);
};

const sendProjectAccessDenied = (res: Response, authUser: AuthUser) => {
  if (!authUser) {
    return res.status(401).json({ code: 'AUTH_REQUIRED', message: 'Для просмотра проекта требуется вход' });
  }

  return res.status(403).json({ code: 'FORBIDDEN', message: 'Доступ запрещен' });
};

const normalizeAuthorName = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, 80);
};

const resolveSketchAuthor = async (authUser: AuthUser, guestName: unknown): Promise<SketchAuthor | null> => {
  if (!authUser) {
    const name = normalizeAuthorName(guestName);
    return name ? { userId: null, name, role: 'guest' } : null;
  }

  const userResult = await pool.query(
    'SELECT full_name FROM users WHERE id = $1',
    [authUser.userId]
  );
  const fallbackName = authUser.role === 'admin' ? 'Администратор' : 'Врач';
  const name = normalizeAuthorName(userResult.rows[0]?.full_name) || fallbackName;

  return {
    userId: authUser.userId,
    name,
    role: authUser.role,
  };
};

// 1. Обновленный метод UPDATE (теперь принимает и файлы)
export const updateProject = async (req: Request, res: Response) => {
  try {
    const id = getParamAsString(req.params.id);
    const { doctor_id, doctor_name, patient_name, is_public } = req.body;
    const files = getUploadedFiles(req.files);
    const normalizedDoctorId = normalizeOptionalUuid(doctor_id);
    const isPublic = parseBooleanFormValue(is_public);

    const projectRes = await pool.query("SELECT file_path_root FROM projects WHERE id = $1", [id]);
    if (projectRes.rows.length === 0) return res.status(404).json({ message: "Проект не найден" });
    const projectPath = projectRes.rows[0].file_path_root;

    await pool.query(
      `UPDATE projects 
       SET doctor_id = $1, doctor_display_name = $2, patient_name = $3, is_public = $4
       WHERE id = $5`,
      [normalizedDoctorId, doctor_name || null, patient_name || null, isPublic, id]
    );

    if (files.length > 0) {
      const stlFolder = path.join(projectPath, 'stl');
      if (!fs.existsSync(stlFolder)) fs.mkdirSync(stlFolder, { recursive: true });
      
      files.forEach(file => {
        const safeFileName = getSafeFileName(file.originalname);
        if (!safeFileName) return;
        const targetPath = path.join(stlFolder, safeFileName);
        fs.copyFileSync(file.path, targetPath);
        fs.unlinkSync(file.path);
      });
    }

    res.json({ message: "Проект успешно обновлен" });
  } catch (error: any) {
    console.error("❌ Ошибка обновления проекта:", error);
    res.status(500).json({ message: "Ошибка сервера" });
  }
};

// 2. Метод для удаления файла
export const deleteFile = async (req: Request, res: Response) => {
  try {
    const id = getParamAsString(req.params.id);
    const { fileName } = req.body;

    const projectRes = await pool.query("SELECT file_path_root FROM projects WHERE id = $1", [id]);
    if (projectRes.rows.length === 0) return res.status(404).json({ message: "Проект не найден" });
    
    const safeFileName = getSafeFileName(fileName);
    if (!safeFileName || safeFileName !== fileName) {
      return res.status(400).json({ message: "Некорректное имя файла" });
    }

    const filePath = path.join(projectRes.rows[0].file_path_root, 'stl', safeFileName);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      res.json({ message: "Файл удален" });
    } else {
      res.status(404).json({ message: "Файл не найден на диске" });
    }
  } catch (error: any) {
    res.status(500).json({ message: "Ошибка при удалении файла" });
  }
};

export const createProject = async (req: Request, res: Response) => {
  try {
    const { country, city, clinic, department, doctor_id, doctor_name, patient_name, open_scene, is_public } = req.body;
    const files = getUploadedFiles(req.files);
    const normalizedDoctorId = normalizeOptionalUuid(doctor_id);

    console.log("🔍 [CREATING PROJECT] Data received:", req.body);

    const sCountry = country || 'Unknown_Country';
    const sCity = city || 'Unknown_City';
    const sClinic = clinic || 'Unknown_Clinic';
    const sDept = department || 'Unknown_Department';
    const sDocName = doctor_name || 'Unknown_Doctor';
    const sPatient = patient_name || 'Unknown_Patient';

    const isPublic = parseBooleanFormValue(open_scene) || parseBooleanFormValue(is_public);

    const projectId = randomUUID();
    const projectPath = createProjectPath(sCountry, sCity, sClinic, sDept, sDocName, sPatient, projectId);

    await pool.query(
      `INSERT INTO projects (id, doctor_id, patient_name, doctor_display_name, file_path_root, is_public) 
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [projectId, normalizedDoctorId, sPatient, sDocName, projectPath, isPublic]
    );

    if (files.length > 0) {
      const stlFolder = path.join(projectPath, 'stl');
      
      files.forEach(file => {
        const safeFileName = getSafeFileName(file.originalname);
        if (!safeFileName) return;
        const targetPath = path.join(stlFolder, safeFileName);
        fs.copyFileSync(file.path, targetPath); 
        fs.unlinkSync(file.path); 
      });
      console.log(`✅ ${files.length} STL files copied to ${stlFolder}`);
    }


    const fileGroups = parseFileGroups(req.body.file_groups);
    const initialSceneState = files.map((file, index) => ({
      id: `stl-${index}`,
      group: fileGroups[file.originalname] || 'Ткани',
      visible: true,
      color: '#cccccc',
      opacity: 1,
      position: [0, 0, 0],
      rotation: [0, 0, 0]
    }));

    await pool.query(
      "UPDATE projects SET scene_state = $1 WHERE id = $2",
      [JSON.stringify(initialSceneState), projectId]
    );

    res.status(201).json({ 
      message: "Проект успешно создан", 
      projectId,
      path: projectPath 
    });

  } catch (error: any) {
    console.error("❌ Ошибка в projectController:", error);
    res.status(500).json({ 
      message: "Ошибка при создании проекта на сервере", 
      error: error.message 
    });
  }
};

// Получение списка проектов (оставляем для админки)
export const getProjects = async (req: Request, res: Response) => {
  try {
    const authUser = (req as any).user as AuthUser;

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
    let params: any[] = [];

    if (authUser.role === 'doctor') {
      query += ` WHERE p.doctor_id = $1`;
      params = [authUser.userId];
    }

    query += ` ORDER BY p.created_at DESC`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ message: "Ошибка получения списка" });
  }
};

export const getProjectFolders = async (_req: Request, res: Response) => {
  try {
    const foldersResult = await pool.query(
      `SELECT id, name
       FROM project_folders
       WHERE id <> ALL($1)
       ORDER BY sort_order ASC, created_at ASC`
      ,
      [Array.from(REMOVED_PROJECT_FOLDER_IDS)]
    );
    const assignmentsResult = await pool.query(
      `SELECT project_id, folder_id
       FROM project_folder_assignments
       WHERE folder_id <> ALL($1)`,
      [Array.from(REMOVED_PROJECT_FOLDER_IDS)]
    );

    res.json({
      folders: foldersResult.rows,
      projectFolders: assignmentsResult.rows.reduce<Record<string, string>>((map, row) => {
        map[String(row.project_id)] = String(row.folder_id);
        return map;
      }, {}),
    });
  } catch (error: any) {
    console.error('❌ Ошибка получения папок проектов:', error);
    res.status(500).json({ message: 'Ошибка получения папок проектов' });
  }
};

export const saveProjectFolders = async (req: Request, res: Response) => {
  let client: PoolClient | undefined;

  try {
    client = await pool.connect();
    const folders = normalizeProjectFoldersPayload(req.body?.folders);
    const folderIds = new Set(folders.map((folder) => folder.id));
    const projectFolders = normalizeFolderAssignmentsPayload(req.body?.projectFolders, folderIds);

    await client.query('BEGIN');
    await client.query('DELETE FROM project_folder_assignments');
    await client.query('DELETE FROM project_folders');

    for (const [index, folder] of folders.entries()) {
      await client.query(
        `INSERT INTO project_folders (id, name, sort_order)
         VALUES ($1, $2, $3)`,
        [folder.id, folder.name, index]
      );
    }

    for (const [projectId, folderId] of Object.entries(projectFolders)) {
      await client.query(
        `INSERT INTO project_folder_assignments (project_id, folder_id)
         VALUES ($1, $2)`,
        [projectId, folderId]
      );
    }

    await client.query('COMMIT');
    res.json({ folders, projectFolders });
  } catch (error: any) {
    if (client) {
      await client.query('ROLLBACK').catch((rollbackError) => {
        console.error('❌ Ошибка отката сохранения папок проектов:', rollbackError.message);
      });
    }
    console.error('❌ Ошибка сохранения папок проектов:', error);
    res.status(500).json({ message: 'Ошибка сохранения папок проектов' });
  } finally {
    client?.release();
  }
};

export const markSketchAsRead = async (req: Request, res: Response) => {
  try {
    const { sketchId } = req.params;
    await pool.query('UPDATE sketches SET is_read = true WHERE id = $1', [sketchId]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
};

export const getProjectById = async (req: Request, res: Response) => {
  try {
    const id = getParamAsString(req.params.id);
    const result = await pool.query("SELECT * FROM projects WHERE id = $1", [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Проект не найден" });
    }

    // server/src/controllers/projectController.ts

const project = result.rows[0];
const authUser = (req as any).user as AuthUser;

if (!canReadProject(project, authUser)) {
  return sendProjectAccessDenied(res, authUser);
}

const stlFolder = path.join(project.file_path_root, 'stl');

const relativePath = getStorageRelativePath(project.file_path_root);

let stlFiles: any[] = [];
if (fs.existsSync(stlFolder)) {
  const files = fs.readdirSync(stlFolder).filter(f => f.toLowerCase().endsWith('.stl'));
  stlFiles = files.map((file, index) => ({
    id: `stl-${index}`,
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

    res.json({ project, stlFiles });
  } catch (error: any) {
    console.error("❌ Ошибка при получении проекта:", error);
    res.status(500).json({ message: "Ошибка сервера" });
  }
};

export const saveProjectScene = async (req: Request, res: Response) => {
  try {
    const id = getParamAsString(req.params.id);
    const { sceneState } = req.body;
    const authUser = (req as any).user as AuthUser;

    // Получаем информацию о проекте
    const projectRes = await pool.query("SELECT is_public, doctor_id FROM projects WHERE id = $1", [id]);
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

    await pool.query(
      "UPDATE projects SET scene_state = $1 WHERE id = $2",
      [JSON.stringify(sceneState), id]
    );

    res.json({ message: "Сцена успешно сохранена" });
  } catch (error: any) {
    console.error("❌ Ошибка сохранения сцены:", error);
    res.status(500).json({ message: "Ошибка сервера" });
  }
};

// НОВЫЙ МЕТОД СОХРАНЕНИЯ ЭСКИЗА В ПОДПАПКИ
export const saveSketch = async (req: Request, res: Response) => {
  try {
    const id = getParamAsString(req.params.id);
    const { cameraState, canvasData, svgContent, textNotes, audioNotes, modelsState, guestName } = req.body;
    const authUser = (req as any).user as AuthUser;

    // 1. Получаем информацию о проекте (включая is_public и doctor_id)
    const projectRes = await pool.query(
      "SELECT file_path_root, is_public, doctor_id FROM projects WHERE id = $1",
      [id]
    );
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

    const sketchesBasePath = path.join(projectPath, 'sketches');
    if (!fs.existsSync(sketchesBasePath)) {
      fs.mkdirSync(sketchesBasePath, { recursive: true });
    }

    const existingFolders = fs.readdirSync(sketchesBasePath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory()) 
      .map(dirent => parseInt(dirent.name))   
      .filter(num => !isNaN(num));            

    const nextFolderNumber = existingFolders.length > 0 
      ? Math.max(...existingFolders) + 1 
      : 1;

    const newSketchDirPath = path.join(sketchesBasePath, nextFolderNumber.toString());
    fs.mkdirSync(newSketchDirPath, { recursive: true });

    const jsonFileName = 'data.json';
    const svgFileName = 'sketch.svg';

    fs.writeFileSync(
      path.join(newSketchDirPath, jsonFileName), 
      JSON.stringify({
        cameraState,
        canvasData,
        textNotes,
        audioNotes,
        modelsState,
        authorName: author.name,
        authorRole: author.role,
      }, null, 2)
    );
    
    if (svgContent) {
      fs.writeFileSync(path.join(newSketchDirPath, svgFileName), svgContent);
    }
    console.log(`✅ Эскиз сохранен в папку: ${newSketchDirPath}`);

    const sketchRes = await pool.query(
      `INSERT INTO sketches (
         project_id, author_user_id, author_name, author_role, camera_state, canvas_data,
         text_notes, audio_notes, folder_number, models_state
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [
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
      ]
    );
    const sketchId = sketchRes.rows[0].id;

    await pool.query(
      `INSERT INTO technical_tasks (project_id, sketch_id) VALUES ($1, $2)`,
      [id, sketchId]
    );

    res.status(200).json({ 
      message: "Эскиз и ТЗ успешно сохранены в новую папку", 
      sketchId,
      folderId: nextFolderNumber,
      authorName: author.name,
      authorRole: author.role,
    });

  } catch (error: any) {
    console.error("❌ Ошибка сохранения эскиза:", error);
    res.status(500).json({ message: "Ошибка сервера при сохранении эскиза" });
  }
};

// Получение списка эскизов проекта
export const getProjectSketches = async (req: Request, res: Response) => {
  try {
    const id = getParamAsString(req.params.id);
    const authUser = (req as any).user as AuthUser;
    const projectRes = await pool.query("SELECT is_public, doctor_id FROM projects WHERE id = $1", [id]);

    if (projectRes.rows.length === 0) {
      return res.status(404).json({ message: "Проект не найден" });
    }

    if (!canReadProject(projectRes.rows[0], authUser)) {
      return sendProjectAccessDenied(res, authUser);
    }

    const result = await pool.query(
  `SELECT id, folder_number, camera_state, canvas_data, text_notes, audio_notes, models_state,
          author_user_id, author_name, author_role, created_at, is_read
  FROM sketches 
  WHERE project_id = $1 
  ORDER BY folder_number ASC`,
  [id]
);

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
  } catch (error: any) {
    console.error("❌ Ошибка получения списка эскизов:", error);
    res.status(500).json({ message: "Ошибка сервера" });
  }
};

// Получение SVG-файла эскиза
export const getSketchSvg = async (req: Request, res: Response) => {
  try {
    const id = getParamAsString(req.params.id);
    const folder = getParamAsString(req.params.folder);
    const authUser = (req as any).user as AuthUser;

    const projectRes = await pool.query("SELECT file_path_root, is_public, doctor_id FROM projects WHERE id = $1", [id]);
    if (projectRes.rows.length === 0) {
      return res.status(404).json({ message: "Проект не найден" });
    }
    const project = projectRes.rows[0];

    if (!canReadProject(project, authUser)) {
      return sendProjectAccessDenied(res, authUser);
    }

    const projectPath = project.file_path_root;
    const svgPath = path.join(projectPath, 'sketches', folder, 'sketch.svg');

    if (!fs.existsSync(svgPath)) {
      return res.status(404).json({ message: "SVG файл не найден" });
    }

    const svgContent = fs.readFileSync(svgPath, 'utf-8');
    res.type('image/svg+xml').send(svgContent);
  } catch (error: any) {
    console.error("❌ Ошибка получения SVG:", error);
    res.status(500).json({ message: "Ошибка сервера" });
  }
};

// НОВЫЙ МЕТОД ДЛЯ ИМПОРТА СТАРЫХ ЭСКИЗОВ
export const importSketches = async (req: Request, res: Response) => {
  const files = req.files as Express.Multer.File[];
  try {
    const id = getParamAsString(req.params.id);
    const authUser = (req as any).user as AuthUser;
    const importingAuthor = await resolveSketchAuthor(authUser, null);

    // 1. Проверяем существование проекта и находим его путь
    const projectRes = await pool.query("SELECT file_path_root FROM projects WHERE id = $1", [id]);
    if (projectRes.rows.length === 0) {
      return res.status(404).json({ message: "Проект не найден" });
    }
    
    const projectPath = projectRes.rows[0].file_path_root;
    const sketchesBasePath = path.join(projectPath, 'sketches');

    if (!fs.existsSync(sketchesBasePath)) {
      fs.mkdirSync(sketchesBasePath, { recursive: true });
    }

    // 2. Находим текущий максимальный номер папки, чтобы продолжить нумерацию
    let currentMaxFolder = 0;
    const existingFolders = fs.readdirSync(sketchesBasePath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => parseInt(dirent.name))
      .filter(num => !isNaN(num));

    if (existingFolders.length > 0) {
      currentMaxFolder = Math.max(...existingFolders);
    }

    // 3. Группируем файлы по базовому имени (например "sketch-1")
    const fileGroups: Record<string, { json?: Express.Multer.File, svg?: Express.Multer.File }> = {};

    if (files) {
      files.forEach(file => {
        const ext = path.extname(file.originalname).toLowerCase();
        const baseName = path.basename(file.originalname, ext);
        if (!fileGroups[baseName]) fileGroups[baseName] = {};
        if (ext === '.json') fileGroups[baseName].json = file;
        if (ext === '.svg') fileGroups[baseName].svg = file;
      });
    }

    let importedCount = 0;

    // 4. Обрабатываем каждую пару (или одиночный JSON)
    for (const [baseName, group] of Object.entries(fileGroups)) {
      if (!group.json) continue; // Без JSON файла не можем восстановить данные, пропускаем

      try {
        // Читаем JSON
        const jsonContent = fs.readFileSync(group.json.path, 'utf-8');
        const parsedData = JSON.parse(jsonContent);

        // Увеличиваем номер папки
        currentMaxFolder += 1;
        const nextFolderNumber = currentMaxFolder;

        // Создаем папку для эскиза
        const newSketchDirPath = path.join(sketchesBasePath, nextFolderNumber.toString());
        fs.mkdirSync(newSketchDirPath, { recursive: true });

        // Если есть SVG, копируем его туда
        if (group.svg) {
          fs.copyFileSync(group.svg.path, path.join(newSketchDirPath, 'sketch.svg'));
        }

        const cameraState = parsedData.cameraState || null;
const canvasData = parsedData.canvasData || null; // <--- Здесь только canvasData
const textNotes = parsedData.textNotes || [];
const audioNotes = parsedData.audioNotes || [];
const modelsState = parsedData.modelsState || []; // <--- Вытаскиваем modelsState
const importedAuthorName = normalizeAuthorName(parsedData.authorName);
const importedAuthorRole = ['admin', 'doctor', 'guest'].includes(parsedData.authorRole)
  ? parsedData.authorRole as SketchAuthorRole
  : null;
const hasImportedAuthor = Boolean(importedAuthorName && importedAuthorRole);
const authorName = hasImportedAuthor ? importedAuthorName : importingAuthor?.name || 'Администратор';
const authorRole = hasImportedAuthor ? importedAuthorRole! : importingAuthor?.role || 'admin';
const authorUserId = hasImportedAuthor ? null : importingAuthor?.userId || null;

// Пишем в БД эскиз
const sketchRes = await pool.query(
  `INSERT INTO sketches (
     project_id, author_user_id, author_name, author_role, camera_state, canvas_data,
     text_notes, audio_notes, folder_number, models_state
   )
   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
  [
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
  ]
);

        // Привязываем к ТЗ (как это делает обычное сохранение)
        await pool.query(
          `INSERT INTO technical_tasks (project_id, sketch_id) VALUES ($1, $2)`,
          [id, sketchRes.rows[0].id]
        );

        importedCount++;
      } catch (err) {
        console.error(`❌ Ошибка при обработке группы файлов ${baseName}:`, err);
      }
    }

    res.json({ message: `Успешно импортировано эскизов: ${importedCount}` });

  } catch (error: any) {
    console.error("❌ Ошибка импорта эскизов:", error);
    res.status(500).json({ message: "Ошибка сервера при импорте" });
  } finally {
    // 5. Очистка: обязательно удаляем временные файлы загруженные multer из папки uploads/
    if (files) {
      files.forEach(file => {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      });
    }
  }
};
