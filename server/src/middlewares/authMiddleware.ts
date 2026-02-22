// server/src/middlewares/authMiddleware.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    role: string;
  };
}

export const authenticateToken = (req: any, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    console.log("❌ [AUTH] Токен отсутствует в запросе к:", req.originalUrl);
    return res.status(401).json({ error: 'Access Denied' }); 
  }

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET || 'super_secret_key_change_me_in_prod');
    req.user = verified;
    next();
  } catch (err) {
    console.log("❌ [AUTH] Токен невалиден");
    res.status(403).json({ error: 'Invalid Token' });
  }
};