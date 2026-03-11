"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initDb = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const db_1 = __importDefault(require("../config/db"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const initDb = async () => {
    try {
        const sqlPath = path_1.default.join(process.cwd(), 'init.sql'); // Исправленный путь для Docker
        const sql = fs_1.default.readFileSync(sqlPath, 'utf8');
        console.log('⏳ Initializing database...');
        await db_1.default.query(sql);
        const hashedPassword = await bcrypt_1.default.hash('admin123', 10);
        // ВНИМАНИЕ: Здесь теперь DO UPDATE, чтобы затереть старый текст хешем
        await db_1.default.query(`
      INSERT INTO users (login, password_hash, role, full_name)
      VALUES ('admin', $1, 'admin', 'System Administrator')
      ON CONFLICT (login) 
      DO UPDATE SET password_hash = EXCLUDED.password_hash;
    `, [hashedPassword]);
        console.log('✅ Database initialized. Admin updated with hash.');
    }
    catch (err) {
        console.error('❌ Init DB Error:', err);
    }
};
exports.initDb = initDb;
if (require.main === module) {
    (0, exports.initDb)();
}
