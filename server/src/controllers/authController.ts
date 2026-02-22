import { Request, Response } from 'express';
import pool from '../config/db';
import bcrypt from 'bcrypt';
import { generateToken } from '../utils/auth';

export const login = async (req: Request, res: Response) => {
  const { login, password } = req.body;

  try {
    const result = await pool.query('SELECT * FROM users WHERE login = $1', [login]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ message: 'Неверный логин или пароль' });
    }

    // Сравнение хеша пароля через bcrypt
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Неверный логин или пароль' });
    }

    const token = generateToken(user.id, user.role);
    res.json({
      token,
      role: user.role,
      userId: user.id,
      name: user.full_name // опционально, для удобства на фронте
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};