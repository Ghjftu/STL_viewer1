"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteDoctor = exports.addDoctor = exports.getDoctors = void 0;
const db_1 = __importDefault(require("../config/db"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const getDoctors = async (req, res) => {
    try {
        const result = await db_1.default.query("SELECT id, login, full_name FROM users WHERE role = 'doctor' ORDER BY full_name ASC");
        res.json(result.rows);
    }
    catch (error) {
        res.status(500).json({ message: 'Ошибка получения списка врачей' });
    }
};
exports.getDoctors = getDoctors;
const addDoctor = async (req, res) => {
    try {
        const { login, password, full_name } = req.body;
        if (!login || !password || !full_name) {
            return res.status(400).json({ message: "Все поля обязательны" });
        }
        const hashedPassword = await bcrypt_1.default.hash(password, 10);
        // Используем ПРАВИЛЬНОЕ имя колонки: password_hash
        const result = await db_1.default.query(`INSERT INTO users (login, password_hash, role, full_name) 
       VALUES ($1, $2, 'doctor', $3) 
       RETURNING id, login, full_name`, [login, hashedPassword, full_name]);
        console.log("✅ Врач добавлен:", result.rows[0]);
        res.status(201).json(result.rows[0]);
    }
    catch (error) {
        console.error("❌ Ошибка БД:", error.message);
        res.status(500).json({ message: "Ошибка сервера", error: error.message });
    }
};
exports.addDoctor = addDoctor;
const deleteDoctor = async (req, res) => {
    try {
        await db_1.default.query("DELETE FROM users WHERE id = $1 AND role = 'doctor'", [req.params.id]);
        res.json({ message: 'Врач удален' });
    }
    catch (error) {
        res.status(500).json({ message: 'Ошибка при удалении' });
    }
};
exports.deleteDoctor = deleteDoctor;
