"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.query = void 0;
const pg_1 = require("pg");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const pool = new pg_1.Pool({
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
const query = (text, params) => pool.query(text, params);
exports.query = query;
exports.default = pool;
