-- Включаем расширение для генерации UUID
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Таблица пользователей (Врачи и Админы)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    login TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    password_plain TEXT,
    role TEXT NOT NULL CHECK (role IN ('admin', 'doctor')),
    full_name TEXT NOT NULL,
    country TEXT,
    city TEXT,
    clinic TEXT,
    department TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_plain TEXT;

-- 2. Таблица пациентов
CREATE TABLE IF NOT EXISTS patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    external_id TEXT, 
    created_at TIMESTAMP DEFAULT NOW()
);

-- 3. Проекты (Кейсы)
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES users(id),
    doctor_id UUID REFERENCES users(id),
    patient_id UUID REFERENCES patients(id),
    file_path_root TEXT NOT NULL,
    patient_name TEXT,
    doctor_display_name TEXT,
    is_public BOOLEAN DEFAULT FALSE,
    scene_state JSONB,
    pattern_state JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pattern_state JSONB DEFAULT '[]';

CREATE TABLE IF NOT EXISTS project_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    original_name TEXT NOT NULL,
    source_file_name TEXT NOT NULL,
    processed_file_name TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_patterns_project_id_idx ON project_patterns(project_id);

CREATE TABLE IF NOT EXISTS project_folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_folder_assignments (
    project_id UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    folder_id TEXT NOT NULL REFERENCES project_folders(id) ON DELETE CASCADE,
    updated_at TIMESTAMP DEFAULT NOW()
);

DELETE FROM project_folder_assignments WHERE folder_id IN ('review', 'surgery');
DELETE FROM project_folders WHERE id IN ('review', 'surgery') OR LOWER(name) IN ('на проверке', 'хирургия');

-- 4. Элементы 3D сцены (STL файлы)
CREATE TABLE IF NOT EXISTS scene_elements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    visible BOOLEAN DEFAULT TRUE,
    color TEXT DEFAULT '#ffffff',
    opacity DOUBLE PRECISION DEFAULT 1.0,
    transform_matrix JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 5. Эскизы (Результат работы врача)
CREATE TABLE IF NOT EXISTS sketches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    author_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    author_name TEXT,
    author_role TEXT CHECK (author_role IN ('admin', 'doctor', 'guest')),
    camera_state JSONB NOT NULL,
    canvas_data JSONB NOT NULL,
    text_notes JSONB DEFAULT '[]',       -- Массив текстовых заметок
    audio_notes JSONB DEFAULT '[]',      -- Массив голосовых заметок
    models_state JSONB,                  -- НОВОЕ ПОЛЕ: Состояние прозрачности и цвета моделей
    folder_number INTEGER,               -- Номер папки для привязки к файловой структуре
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(project_id, folder_number),    -- Гарантирует уникальность папок в рамках проекта
    is_read BOOLEAN DEFAULT FALSE
);

ALTER TABLE sketches ADD COLUMN IF NOT EXISTS audio_notes JSONB DEFAULT '[]';
ALTER TABLE sketches ADD COLUMN IF NOT EXISTS author_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE sketches ADD COLUMN IF NOT EXISTS author_name TEXT;
ALTER TABLE sketches ADD COLUMN IF NOT EXISTS author_role TEXT;

-- 6. Техническое задание (Финальный документ)
CREATE TABLE IF NOT EXISTS technical_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id),
    sketch_id UUID REFERENCES sketches(id),
    doctor_signature TEXT,
    final_pdf_path TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
