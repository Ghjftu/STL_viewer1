import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  user: process.env.DB_USER || 'admin',
  password: process.env.DB_PASSWORD || 'rootpassword',
  host: process.env.DB_HOST || 'db', // 'db' как запасной вариант для Docker
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'stl_viewer_db',
});

// Обработчик событий подключения
pool.on('connect', () => {
  console.log('✅ Database connected successfully');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client', err);
  process.exit(-1);
});

export const query = (text: string, params?: any[]) => pool.query(text, params);
export default pool;