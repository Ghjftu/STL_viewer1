import { Pool } from 'pg';

console.log("DEBUG: DB_HOST is", process.env.DB_HOST); // Добавь это, чтобы увидеть в логах, что реально приходит

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST || 'stl_postgres', // Явно пропиши имя контейнера
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
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