import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import authRoutes from './routes/authRoutes';
import projectRoutes from './routes/projectRoutes';
import doctorRoutes from './routes/doctorRoutes';
import { initDb } from './scripts/init-db';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

// 1. Настройки безопасности и парсинга
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// 2. Раздача папки с 3D-моделями (это оставляем, это нужно!)
app.use('/storage', express.static(path.join(__dirname, '../storage')));

// 3. API Маршруты
app.use('/api/auth', authRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/projects', projectRoutes);

// Если запрос пришел на /api/..., но маршрут не найден
app.use('/api', (req, res) => {
  res.status(404).json({ message: "API route not found" });
});

app.listen(PORT, async () => {
  console.log(`🚀 Server started on port ${PORT}`);
  await initDb(); 
});