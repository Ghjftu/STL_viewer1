import { Request, Response } from 'express';
import pool from '../config/db';
import { createProjectPath } from '../utils/fileSystem';
import fs from 'fs';
import path from 'path';

export const createProject = async (req: Request, res: Response) => {
  try {
    // Извлекаем данные из тела запроса
    const { country, city, clinic, department, doctor_id, doctor_name, patient_name } = req.body;
    const files = req.files as Express.Multer.File[];

    console.log("🔍 [CREATING PROJECT] Data received:", req.body);

    // 1. Защита от undefined: если поле пустое, ставим заглушку
    const sCountry = country || 'Unknown_Country';
    const sCity = city || 'Unknown_City';
    const sClinic = clinic || 'Unknown_Clinic';
    const sDept = department || 'Unknown_Department';
    const sDocName = doctor_name || 'Unknown_Doctor';
    const sPatient = patient_name || 'Unknown_Patient';

    // 2. Создаем структуру папок согласно ТЗ: country/city/clinic/department/doctor/patient 
    const projectPath = createProjectPath(sCountry, sCity, sClinic, sDept, sDocName, sPatient);

    // 3. Записываем проект в базу данных
    // 3. Записываем проект в базу данных
    const result = await pool.query(
      `INSERT INTO projects (doctor_id, patient_name, doctor_display_name, file_path_root) 
      VALUES ($1, $2, $3, $4) RETURNING id`,
      [doctor_id, sPatient, sDocName, projectPath] // Записываем sDocName вместо статуса
    );
    const projectId = result.rows[0].id;

    // 4. Перемещаем загруженные STL-файлы из временной папки в целевую папку 'stl' 
    // Найдите цикл перемещения файлов в функции createProject и замените его на этот:
    if (files && files.length > 0) {
      const stlFolder = path.join(projectPath, 'stl');
      
      files.forEach(file => {
        const targetPath = path.join(stlFolder, file.originalname);
        // Вместо fs.renameSync используем:
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

    // Если запрашивает врач, фильтруем только его проекты [cite: 17]
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
    const { id } = req.params;
    const result = await pool.query("SELECT * FROM projects WHERE id = $1", [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Проект не найден" });
    }

    const project = result.rows[0];
    const stlFolder = path.join(project.file_path_root, 'stl');
    
    // Вычисляем относительный путь для URL (например, /storage/Country/...)
    const storageIndex = project.file_path_root.indexOf('storage/'); // ищем начало папки storage
    const relativePath = storageIndex !== -1 ? project.file_path_root.substring(storageIndex) : '';

    // Получаем протокол (http) и хост (ip:port или домен) прямо из запроса
      const baseUrl = `${req.protocol}://${req.get('host')}`;

      let stlFiles: any[] = [];
      if (fs.existsSync(stlFolder)) {
        const files = fs.readdirSync(stlFolder).filter(f => f.toLowerCase().endsWith('.stl'));
        stlFiles = files.map((file, index) => ({
          id: `stl-${index}`,
          name: file,
         
          url: `${baseUrl}/${relativePath}/stl/${file}`, 
          // Дефолтные настройки для сцены:
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

// ... существующие импорты

export const updateProject = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { doctor_id, doctor_name, patient_name } = req.body;

    // Обновляем данные проекта
    await pool.query(
      `UPDATE projects 
       SET doctor_id = $1, doctor_display_name = $2, patient_name = $3
       WHERE id = $4`,
      [doctor_id, doctor_name, patient_name, id]
    );

    res.json({ message: "Проект обновлен" });
  } catch (error: any) {
    console.error("❌ Ошибка обновления:", error);
    res.status(500).json({ message: "Ошибка сервера" });
  }
};

export const saveProjectScene = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { sceneState } = req.body; // Сюда прилетит массив настроек (позиции, цвета)

    // Обновляем поле scene_state в базе
    await pool.query(
      "UPDATE projects SET scene_state = $1 WHERE id = $2",
      [JSON.stringify(sceneState), id]
    );

    console.log(`💾 Сцена проекта ${id} сохранена.`);
    res.json({ message: "Сцена успешно сохранена" });
  } catch (error: any) {
    console.error("❌ Ошибка сохранения сцены:", error);
    res.status(500).json({ message: "Ошибка сервера" });
  }
};


// Добавь этот экспорт в конец projectController.ts

export const saveSketch = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { cameraState, canvasData, svgContent } = req.body;

    // 1. Получаем корневой путь проекта из БД
    const projectRes = await pool.query("SELECT file_path_root FROM projects WHERE id = $1", [id]);
    if (projectRes.rows.length === 0) {
      return res.status(404).json({ message: "Проект не найден" });
    }
    const projectPath = projectRes.rows[0].file_path_root;

    // 2. Убеждаемся, что папка sketches существует
    const sketchesDir = path.join(projectPath, 'sketches');
    if (!fs.existsSync(sketchesDir)) {
      fs.mkdirSync(sketchesDir, { recursive: true });
    }

    // 3. Формируем уникальные имена файлов
    const timestamp = Date.now();
    const jsonFileName = `sketch_${timestamp}.json`;
    const svgFileName = `sketch_${timestamp}.svg`;

    // 4. Сохраняем файлы на диск (Файловая система)
    fs.writeFileSync(path.join(sketchesDir, jsonFileName), JSON.stringify({ cameraState, canvasData }, null, 2));
    if (svgContent) {
      fs.writeFileSync(path.join(sketchesDir, svgFileName), svgContent);
    }
    console.log(`✅ Эскиз сохранен в файлы: ${jsonFileName}, ${svgFileName}`);

    // 5. Записываем эскиз в базу данных
    const sketchRes = await pool.query(
      `INSERT INTO sketches (project_id, camera_state, canvas_data) 
       VALUES ($1, $2, $3) RETURNING id`,
      [id, JSON.stringify(cameraState), JSON.stringify(canvasData)]
    );
    const sketchId = sketchRes.rows[0].id;

    // 6. Формируем "болванку" для ТЗ 
    await pool.query(
      `INSERT INTO technical_tasks (project_id, sketch_id) VALUES ($1, $2)`,
      [id, sketchId]
    );

    res.status(200).json({ 
      message: "Эскиз и ТЗ успешно сохранены", 
      sketchId 
    });

  } catch (error: any) {
    console.error("❌ Ошибка сохранения эскиза:", error);
    res.status(500).json({ message: "Ошибка сервера при сохранении эскиза" });
  }
};