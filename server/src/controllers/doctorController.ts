import { Request, Response } from 'express';
import { PoolClient } from 'pg';
import pool from '../config/db';
import bcrypt from 'bcryptjs';

export const getDoctors = async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, login, password_plain, full_name, country, city, clinic, department 
       FROM users 
       WHERE role = 'doctor' 
       ORDER BY full_name ASC`
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Ошибка получения списка врачей' });
  }
};

export const addDoctor = async (req: Request, res: Response) => {
  try {
    const { login, password, full_name, country, city, clinic, department } = req.body;

    if (!login || !password || !full_name) {
      return res.status(400).json({ message: "Логин, пароль и ФИО обязательны" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (login, password_hash, password_plain, role, full_name, country, city, clinic, department) 
       VALUES ($1, $2, $3, 'doctor', $4, $5, $6, $7, $8) 
       RETURNING id, login, password_plain, full_name, country, city, clinic, department`,
      [login, hashedPassword, password, full_name, country, city, clinic, department]
    );

    console.log("✅ Врач добавлен:", result.rows[0]);
    res.status(201).json(result.rows[0]);

  } catch (error: any) {
    console.error("❌ Ошибка БД:", error.message);
    res.status(500).json({ message: "Ошибка сервера", error: error.message });
  }
};

export const deleteDoctor = async (req: Request, res: Response) => {
  let client: PoolClient | undefined;

  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query('UPDATE projects SET doctor_id = NULL WHERE doctor_id = $1', [req.params.id]);

    const result = await client.query("DELETE FROM users WHERE id = $1 AND role = 'doctor'", [req.params.id]);

    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Врач не найден' });
    }

    await client.query('COMMIT');
    res.json({ message: 'Врач удален' });
  } catch (error: any) {
    if (client) {
      await client.query('ROLLBACK').catch((rollbackError) => {
        console.error("❌ Ошибка отката удаления врача:", rollbackError.message);
      });
    }
    console.error("❌ Ошибка удаления врача:", error.message);
    res.status(500).json({ message: 'Ошибка при удалении', error: error.message });
  } finally {
    client?.release();
  }
};
