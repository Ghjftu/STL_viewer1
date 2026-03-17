import { Request, Response } from 'express';
import pool from '../config/db';
import { createProjectPath } from '../utils/fileSystem';
import fs from 'fs';
import path from 'path';

// Вспомогательная функция для безопасного получения строкового параметра
const getParamAsString = (param: string | string[] | undefined): string => {
  if (Array.isArray(param)) return param[0];
  return param || '';
};

// 1. Обновленный метод UPDATE (теперь принимает и файлы)
export const updateProject = async (req: Request, res: Response) => {
  try {
    const id = getParamAsString(req.params.id);
    const { doctor_id, doctor_name, patient_name } = req.body;
    const files = req.files as Express.Multer.File[];

    const projectRes = await pool.query("SELECT file_path_root FROM projects WHERE id = $1", [id]);
    if (projectRes.rows.length === 0) return res.status(404).json({ message: "Проект не найден" });
    const projectPath = projectRes.rows[0].file_path_root;

    await pool.query(
      `UPDATE projects 
       SET doctor_id = $1, doctor_display_name = $2, patient_name = $3
       WHERE id = $4`,
      [doctor_id, doctor_name, patient_name, id]
    );

    if (files && files.length > 0) {
      const stlFolder = path.join(projectPath, 'stl');
      if (!fs.existsSync(stlFolder)) fs.mkdirSync(stlFolder, { recursive: true });
      
      files.forEach(file => {
        const targetPath = path.join(stlFolder, file.originalname);
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
    
    const filePath = path.join(projectRes.rows[0].file_path_root, 'stl', fileName);

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
    const { country, city, clinic, department, doctor_id, doctor_name, patient_name } = req.body;
    const files = req.files as Express.Multer.File[];

    console.log("🔍 [CREATING PROJECT] Data received:", req.body);

    const sCountry = country || 'Unknown_Country';
    const sCity = city || 'Unknown_City';
    const sClinic = clinic || 'Unknown_Clinic';
    const sDept = department || 'Unknown_Department';
    const sDocName = doctor_name || 'Unknown_Doctor';
    const sPatient = patient_name || 'Unknown_Patient';

    const projectPath = createProjectPath(sCountry, sCity, sClinic, sDept, sDocName, sPatient);

    const result = await pool.query(
      `INSERT INTO projects (doctor_id, patient_name, doctor_display_name, file_path_root) 
      VALUES ($1, $2, $3, $4) RETURNING id`,
      [doctor_id, sPatient, sDocName, projectPath] 
    );
    const projectId = result.rows[0].id;

    if (files && files.length > 0) {
      const stlFolder = path.join(projectPath, 'stl');
      
      files.forEach(file => {
        const targetPath = path.join(stlFolder, file.originalname);
        fs.copyFileSync(file.path, targetPath); 
        fs.unlinkSync(file.path); 
      });
      console.log(`✅ ${files.length} STL files copied to ${stlFolder}`);
    }

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
    const { userId, role } = req.query;
    let query = "SELECT * FROM projects ORDER BY created_at DESC";
    let params: any[] = [];

    if (role === 'doctor' && userId) {
      query = "SELECT * FROM projects WHERE doctor_id = $1 ORDER BY created_at DESC";
      params = [userId];
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ message: "Ошибка получения списка" });
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
const stlFolder = path.join(project.file_path_root, 'stl');

// Находим, где начинается /storage/ в полном пути
const storageIndex = project.file_path_root.indexOf('storage/'); 
const relativePath = storageIndex !== -1 ? project.file_path_root.substring(storageIndex) : '';

let stlFiles: any[] = [];
if (fs.existsSync(stlFolder)) {
  const files = fs.readdirSync(stlFolder).filter(f => f.toLowerCase().endsWith('.stl'));
  stlFiles = files.map((file, index) => ({
    id: `stl-${index}`,
    name: file,
    // УБИРАЕМ baseUrl. Путь должен начинаться со слеша /
    url: `/${relativePath}/stl/${file}`, 
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

    await pool.query(
      "UPDATE projects SET scene_state = $1 WHERE id = $2",
      [JSON.stringify(sceneState), id]
    );

    console.log(`💾 Сцена проекта ${id} была сохранена.`);
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
    const { cameraState, canvasData, svgContent, textNotes, modelsState } = req.body; // <--- Добавили modelsState

    const projectRes = await pool.query("SELECT file_path_root FROM projects WHERE id = $1", [id]);
    if (projectRes.rows.length === 0) {
      return res.status(404).json({ message: "Проект не найден" });
    }
    const projectPath = projectRes.rows[0].file_path_root;

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
      JSON.stringify({ cameraState, canvasData, textNotes }, null, 2)
    );
    
    if (svgContent) {
      fs.writeFileSync(path.join(newSketchDirPath, svgFileName), svgContent);
    }
    console.log(`✅ Эскиз сохранен в папку: ${newSketchDirPath}`);

    const sketchRes = await pool.query(
  `INSERT INTO sketches (project_id, camera_state, canvas_data, text_notes, folder_number, models_state) 
   VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
  [
    id, 
    JSON.stringify(cameraState), 
    JSON.stringify(canvasData), 
    JSON.stringify(textNotes || []), 
    nextFolderNumber,
    JSON.stringify(modelsState || []) // <--- Сохраняем в БД
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
      folderId: nextFolderNumber
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
    const result = await pool.query(
  `SELECT id, folder_number, camera_state, canvas_data, text_notes, models_state, created_at 
  FROM sketches 
  WHERE project_id = $1 
  ORDER BY folder_number ASC`,
  [id]
);

const sketches = result.rows.map(row => ({
  id: row.id,
  folderNumber: row.folder_number,
  cameraState: row.camera_state,
  textNotes: row.text_notes,
  modelsState: row.models_state, // <--- Передаем во фронтенд!
  createdAt: row.created_at,
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

    const projectRes = await pool.query("SELECT file_path_root FROM projects WHERE id = $1", [id]);
    if (projectRes.rows.length === 0) {
      return res.status(404).json({ message: "Проект не найден" });
    }
    const projectPath = projectRes.rows[0].file_path_root;
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
const modelsState = parsedData.modelsState || []; // <--- Вытаскиваем modelsState

// Пишем в БД эскиз
const sketchRes = await pool.query(
  `INSERT INTO sketches (project_id, camera_state, canvas_data, text_notes, folder_number, models_state) 
   VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
  [
    id, 
    JSON.stringify(cameraState), 
    JSON.stringify(canvasData), 
    JSON.stringify(textNotes), 
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