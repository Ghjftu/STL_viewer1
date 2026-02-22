-- Включаем расширение для генерации UUID
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Таблица пользователей (Врачи и Админы)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    login TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'doctor')),
    full_name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

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
    scene_state JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

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
    camera_state JSONB NOT NULL,
    canvas_data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 6. Техническое задание (Финальный документ)
CREATE TABLE IF NOT EXISTS technical_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id),
    sketch_id UUID REFERENCES sketches(id),
    doctor_signature TEXT,
    final_pdf_path TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);