import { Response } from 'express';
import pool from '../config/db';
import { createProjectPath } from '../utils/fileSystem';
import fs from 'fs';
import path from 'path';
import { AuthRequest } from '../middlewares/authMiddleware';

// Вспомогательная функция для безопасного получения строкового параметра
const getParamAsString = (param: any): string => {
  if (Array.isArray(param)) return param[0];
  return param || '';
};

// 1. ПОЛУЧЕНИЕ СПИСКА ПРОЕКТОВ (Главное исправление здесь)
export const getProjects = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Не авторизован" });
    
    const { userId, role } = req.user;

    let query = "SELECT * FROM projects ORDER BY created_at DESC";
    let params: any[] = [];

    // Если это доктор, показываем только ЕГО проекты, используя ID из ТОКЕНА
    if (role === 'doctor') {
      query = "SELECT * FROM projects WHERE doctor_id = $1 ORDER BY created_at DESC";
      params = [userId];
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error: any) {
    console.error("❌ Ошибка получения списка проектов:", error);
    res.status(500).json({ message: "Ошибка сервера при загрузке списка" });
  }
};

// 2. СОЗДАНИЕ ПРОЕКТА
export const createProject = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: "Не авторизован" });
    
    const { country, city, clinic, department, doctor_name, patient_name } = req.body;
    const files = req.files as Express.Multer.File[];
    
    // Привязываем проект к ID того, кто сейчас залогинен
    const doctor_id = req.user.userId;

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
      if (!fs.existsSync(stlFolder)) fs.mkdirSync(stlFolder, { recursive: true });
      
      files.forEach(file => {
        const targetPath = path.join(stlFolder, file.originalname);
        fs.copyFileSync(file.path, targetPath); 
        fs.unlinkSync(file.path); 
      });
    }

    res.status(201).json({ message: "Проект успешно создан", projectId });
  } catch (error: any) {
    console.error("❌ Ошибка создания проекта:", error);
    res.status(500).json({ message: "Ошибка сервера" });
  }
};

// 3. ПОЛУЧЕНИЕ ПРОЕКТА ПО ID
export const getProjectById = async (req: AuthRequest, res: Response) => {
  try {
    const id = getParamAsString(req.params.id);
    const result = await pool.query("SELECT * FROM projects WHERE id = $1", [id]);
    
    if (result.rows.length === 0) return res.status(404).json({ message: "Проект не найден" });

    const project = result.rows[0];
    const stlFolder = path.join(project.file_path_root, 'stl');

    const storageIndex = project.file_path_root.indexOf('storage/'); 
    const relativePath = storageIndex !== -1 ? project.file_path_root.substring(storageIndex) : '';

    let stlFiles: any[] = [];
    if (fs.existsSync(stlFolder)) {
      const files = fs.readdirSync(stlFolder).filter(f => f.toLowerCase().endsWith('.stl'));
      stlFiles = files.map((file, index) => ({
        id: `stl-${index}`,
        name: file,
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

// 4. ОБНОВЛЕНИЕ ПРОЕКТА
export const updateProject = async (req: AuthRequest, res: Response) => {
  try {
    const id = getParamAsString(req.params.id);
    const { doctor_name, patient_name } = req.body;
    const files = req.files as Express.Multer.File[];

    const projectRes = await pool.query("SELECT file_path_root FROM projects WHERE id = $1", [id]);
    if (projectRes.rows.length === 0) return res.status(404).json({ message: "Проект не найден" });
    const projectPath = projectRes.rows[0].file_path_root;

    await pool.query(
      `UPDATE projects SET doctor_display_name = $1, patient_name = $2 WHERE id = $3`,
      [doctor_name, patient_name, id]
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

// 5. УДАЛЕНИЕ ФАЙЛА
export const deleteFile = async (req: AuthRequest, res: Response) => {
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

// 6. СОХРАНЕНИЕ СОСТОЯНИЯ СЦЕНЫ
export const saveProjectScene = async (req: AuthRequest, res: Response) => {
  try {
    const id = getParamAsString(req.params.id);
    const { sceneState } = req.body; 

    await pool.query(
      "UPDATE projects SET scene_state = $1 WHERE id = $2",
      [JSON.stringify(sceneState), id]
    );
    res.json({ message: "Сцена успешно сохранена" });
  } catch (error: any) {
    res.status(500).json({ message: "Ошибка сервера" });
  }
};

// 7. СОХРАНЕНИЕ ЭСКИЗА
export const saveSketch = async (req: AuthRequest, res: Response) => {
  try {
    const id = getParamAsString(req.params.id);
    const { cameraState, canvasData, svgContent, textNotes } = req.body;

    const projectRes = await pool.query("SELECT file_path_root FROM projects WHERE id = $1", [id]);
    if (projectRes.rows.length === 0) return res.status(404).json({ message: "Проект не найден" });
    
    const projectPath = projectRes.rows[0].file_path_root;
    const sketchesBasePath = path.join(projectPath, 'sketches');
    if (!fs.existsSync(sketchesBasePath)) fs.mkdirSync(sketchesBasePath, { recursive: true });

    const existingFolders = fs.readdirSync(sketchesBasePath, { withFileTypes: true })
      .filter(d => d.isDirectory()).map(d => parseInt(d.name)).filter(n => !isNaN(n));            

    const nextFolderNumber = existingFolders.length > 0 ? Math.max(...existingFolders) + 1 : 1;
    const newSketchDirPath = path.join(sketchesBasePath, nextFolderNumber.toString());
    fs.mkdirSync(newSketchDirPath, { recursive: true });

    fs.writeFileSync(path.join(newSketchDirPath, 'data.json'), JSON.stringify({ cameraState, canvasData, textNotes }, null, 2));
    if (svgContent) fs.writeFileSync(path.join(newSketchDirPath, 'sketch.svg'), svgContent);

    const sketchRes = await pool.query(
      `INSERT INTO sketches (project_id, camera_state, canvas_data, text_notes, folder_number) 
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [id, JSON.stringify(cameraState), JSON.stringify(canvasData), JSON.stringify(textNotes || []), nextFolderNumber]
    );

    await pool.query(`INSERT INTO technical_tasks (project_id, sketch_id) VALUES ($1, $2)`, [id, sketchRes.rows[0].id]);

    res.status(200).json({ message: "Эскиз сохранен", folderId: nextFolderNumber });
  } catch (error: any) {
    console.error("❌ Ошибка сохранения эскиза:", error);
    res.status(500).json({ message: "Ошибка сервера" });
  }
};

// 8. СПИСОК ЭСКИЗОВ
export const getProjectSketches = async (req: AuthRequest, res: Response) => {
  try {
    const id = getParamAsString(req.params.id);
    const result = await pool.query(
      `SELECT id, folder_number, camera_state, canvas_data, text_notes, created_at 
      FROM sketches WHERE project_id = $1 ORDER BY folder_number ASC`,
      [id]
    );

    const sketches = result.rows.map(row => ({
      id: row.id,
      folderNumber: row.folder_number,
      cameraState: row.camera_state,
      textNotes: row.text_notes,
      createdAt: row.created_at,
      svgUrl: `/api/projects/${id}/sketches/${row.folder_number}/svg`
    }));

    res.json(sketches);
  } catch (error: any) {
    res.status(500).json({ message: "Ошибка сервера" });
  }
};

// 9. ПОЛУЧЕНИЕ SVG ЭСКИЗА
export const getSketchSvg = async (req: AuthRequest, res: Response) => {
  try {
    const id = getParamAsString(req.params.id);
    const folder = getParamAsString(req.params.folder);

    const projectRes = await pool.query("SELECT file_path_root FROM projects WHERE id = $1", [id]);
    if (projectRes.rows.length === 0) return res.status(404).json({ message: "Проект не найден" });
    
    const svgPath = path.join(projectRes.rows[0].file_path_root, 'sketches', folder, 'sketch.svg');
    if (!fs.existsSync(svgPath)) return res.status(404).json({ message: "SVG не найден" });

    res.type('image/svg+xml').send(fs.readFileSync(svgPath, 'utf-8'));
  } catch (error: any) {
    res.status(500).json({ message: "Ошибка сервера" });
  }
};