import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes';
import projectRoutes from './routes/projectRoutes';
import doctorRoutes from './routes/doctorRoutes';
import path from 'path';

dotenv.config(); // Должно быть в самом верху!

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());


// Если мы в /app/dist/index.js, то путь к /app/storage это ../storage
app.use('/storage', express.static(path.join(__dirname, '../storage')));

// Роуты
app.use('/api/auth', authRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/projects', projectRoutes);
// Укажи путь к папке, где лежит index.html после билда клиента (обычно client/dist)
const clientDistPath = path.join(__dirname, '../../client');
app.use(express.static(clientDistPath));

app.get(/(.*)/, (req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
});




app.listen(PORT, () => {
  console.log(`🚀 Server on port ${PORT}`);
});