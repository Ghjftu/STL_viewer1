import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export const authenticateToken = (req: any, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access Denied' });

  console.log(`DEBUG AUTH: Использую секрет (первые 3 символа): ${process.env.JWT_SECRET?.substring(0,3)}...`);
  // Используем только переменную окружения
  const secret = process.env.JWT_SECRET;
  
  if (!secret) {
    console.error("JWT_SECRET IS MISSING IN ENV");
    return res.status(500).json({ error: "Server configuration error" });
  }

  try {
    const verified = jwt.verify(token, secret);
    req.user = verified;
    next();
  } catch (err) {
    if (err instanceof Error) {
      console.log("❌ [AUTH] Ошибка валидации:", err.message);
    } else {
      console.log("❌ [AUTH] Ошибка валидации:", err);
    }
    res.status(403).json({ error: 'Invalid Token' });
  }
};