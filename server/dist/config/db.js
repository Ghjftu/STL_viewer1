"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.query = void 0;
const pg_1 = require("pg");
console.log("DEBUG: DB_HOST is", process.env.DB_HOST); // Добавь это, чтобы увидеть в логах, что реально приходит
const pool = new pg_1.Pool({
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
const query = (text, params) => pool.query(text, params);
exports.query = query;
exports.default = pool;
