import { Request, Response } from 'express';
import pool from '../config/db';
import bcrypt from 'bcrypt';

export const getDoctors = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      "SELECT id, login, full_name FROM users WHERE role = 'doctor' ORDER BY full_name ASC"
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Ошибка получения списка врачей' });
  }
};

export const addDoctor = async (req: Request, res: Response) => {
  try {
    const { login, password, full_name } = req.body;

    if (!login || !password || !full_name) {
      return res.status(400).json({ message: "Все поля обязательны" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Используем ПРАВИЛЬНОЕ имя колонки: password_hash
    const result = await pool.query(
      `INSERT INTO users (login, password_hash, role, full_name) 
       VALUES ($1, $2, 'doctor', $3) 
       RETURNING id, login, full_name`,
      [login, hashedPassword, full_name]
    );

    console.log("✅ Врач добавлен:", result.rows[0]);
    res.status(201).json(result.rows[0]);

  } catch (error: any) {
    console.error("❌ Ошибка БД:", error.message);
    res.status(500).json({ message: "Ошибка сервера", error: error.message });
  }
};

export const deleteDoctor = async (req: Request, res: Response) => {
  try {
    await pool.query("DELETE FROM users WHERE id = $1 AND role = 'doctor'", [req.params.id]);
    res.json({ message: 'Врач удален' });
  } catch (error) {
    res.status(500).json({ message: 'Ошибка при удалении' });
  }
};