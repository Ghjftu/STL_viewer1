"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.query = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const pg_1 = require("pg");
dotenv_1.default.config();
const requiredEnv = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const getRequiredEnv = (name) => {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`Missing required database environment variable ${name}. ` +
            'Configure DB_* explicitly so pg does not fall back to USER/PGUSER.');
    }
    return value;
};
const parsePort = (value = '5432') => {
    const port = Number.parseInt(value, 10);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`Invalid DB_PORT value: ${value}`);
    }
    return port;
};
const dbConfig = {
    user: getRequiredEnv('DB_USER'),
    password: getRequiredEnv('DB_PASSWORD'),
    host: getRequiredEnv('DB_HOST'),
    port: parsePort(process.env.DB_PORT),
    database: getRequiredEnv('DB_NAME'),
    application_name: 'stl_server',
    connectionTimeoutMillis: 5000,
    query_timeout: 30000,
};
console.log(`[DB] PostgreSQL config: host=${dbConfig.host} port=${dbConfig.port} ` +
    `database=${dbConfig.database} user=${dbConfig.user}`);
const pool = new pg_1.Pool(dbConfig);
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
