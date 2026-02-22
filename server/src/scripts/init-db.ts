import fs from 'fs';
import path from 'path';
import pool from '../config/db';

const initDb = async () => {
  try {
    // Читаем файл init.sql
    const sqlPath = path.join(__dirname, '../../init.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('⏳ Initializing database...');
    
    // Выполняем SQL запрос
    await pool.query(sql);
    
    console.log('✅ Database tables created successfully!');
    
    // (Опционально) Создадим тестового админа, если его нет
    // Пароль пока храним открытым текстом для теста, позже добавим хеширование
    await pool.query(`
      INSERT INTO users (login, password_hash, role, full_name)
      VALUES ('admin', 'admin123', 'admin', 'System Administrator')
      ON CONFLICT (login) DO NOTHING;
    `);
    console.log('👤 Admin user ensured (login: admin, pass: admin123)');

  } catch (err) {
    console.error('❌ Error initializing database:', err);
  } finally {
    await pool.end();
  }
};

initDb();