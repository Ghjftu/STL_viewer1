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

app.use(cors({ origin: '*' }));
app.use(express.json());

app.use('/storage', express.static(path.join(__dirname, '../storage')));
app.use('/api/auth', authRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/projects', projectRoutes);

const clientDistPath = path.join(__dirname, '../../client');
app.use(express.static(clientDistPath));

app.get(/(.*)/, (req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

app.listen(PORT, async () => {
  console.log(`🚀 Server started on port ${PORT}`);
  await initDb(); 
});