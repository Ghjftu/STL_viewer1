import fs from 'fs';
import path from 'path';
import pool from '../config/db';
import bcrypt from 'bcryptjs';

export const initDb = async () => {
  try {
    const sqlPath = path.join(process.cwd(), 'init.sql'); // Исправленный путь для Docker
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('⏳ Initializing database...');
    await pool.query(sql);
    
    const hashedPassword = await bcrypt.hash('admin123', 10);

    // ВНИМАНИЕ: Здесь теперь DO UPDATE, чтобы затереть старый текст хешем
    await pool.query(`
      INSERT INTO users (login, password_hash, role, full_name)
      VALUES ('admin', $1, 'admin', 'System Administrator')
      ON CONFLICT (login) 
      DO UPDATE SET password_hash = EXCLUDED.password_hash;
    `, [hashedPassword]);

    console.log('✅ Database initialized. Admin updated with hash.');
  } catch (err) {
    console.error('❌ Init DB Error:', err);
  }
};

if (require.main === module) {
  initDb();
}