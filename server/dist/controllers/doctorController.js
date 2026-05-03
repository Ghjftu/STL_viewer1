"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteDoctor = exports.addDoctor = exports.getDoctors = void 0;
const db_1 = __importDefault(require("../config/db"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const getDoctors = async (req, res) => {
    try {
        const result = await db_1.default.query(`SELECT id, login, password_plain, full_name, country, city, clinic, department 
       FROM users 
       WHERE role = 'doctor' 
       ORDER BY full_name ASC`);
        res.json(result.rows);
    }
    catch (error) {
        res.status(500).json({ message: 'Ошибка получения списка врачей' });
    }
};
exports.getDoctors = getDoctors;
const addDoctor = async (req, res) => {
    try {
        const { login, password, full_name, country, city, clinic, department } = req.body;
        if (!login || !password || !full_name) {
            return res.status(400).json({ message: "Логин, пароль и ФИО обязательны" });
        }
        const hashedPassword = await bcryptjs_1.default.hash(password, 10);
        const result = await db_1.default.query(`INSERT INTO users (login, password_hash, password_plain, role, full_name, country, city, clinic, department) 
       VALUES ($1, $2, $3, 'doctor', $4, $5, $6, $7, $8) 
       RETURNING id, login, password_plain, full_name, country, city, clinic, department`, [login, hashedPassword, password, full_name, country, city, clinic, department]);
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
    const client = await db_1.default.connect();
    try {
        await client.query('BEGIN');
        await client.query('UPDATE projects SET doctor_id = NULL WHERE doctor_id = $1', [req.params.id]);
        const result = await client.query("DELETE FROM users WHERE id = $1 AND role = 'doctor'", [req.params.id]);
        if (result.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Врач не найден' });
        }
        await client.query('COMMIT');
        res.json({ message: 'Врач удален' });
    }
    catch (error) {
        await client.query('ROLLBACK');
        console.error("❌ Ошибка удаления врача:", error.message);
        res.status(500).json({ message: 'Ошибка при удалении', error: error.message });
    }
    finally {
        client.release();
    }
};
exports.deleteDoctor = deleteDoctor;
