"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.login = void 0;
const db_1 = __importDefault(require("../config/db"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const auth_1 = require("../utils/auth");
const login = async (req, res) => {
    const { login, password } = req.body;
    try {
        const result = await db_1.default.query('SELECT * FROM users WHERE login = $1', [login]);
        const user = result.rows[0];
        if (!user) {
            return res.status(401).json({ message: 'Неверный логин или пароль' });
        }
        // Сравнение хеша пароля через bcrypt
        const isMatch = await bcrypt_1.default.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ message: 'Неверный логин или пароль' });
        }
        const token = (0, auth_1.generateToken)(user.id, user.role);
        res.json({
            token,
            role: user.role,
            userId: user.id,
            name: user.full_name // опционально, для удобства на фронте
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Ошибка сервера' });
    }
};
exports.login = login;
