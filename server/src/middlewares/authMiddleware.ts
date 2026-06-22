// server/src/middlewares/authMiddleware.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_change_me_in_prod';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    role: 'admin' | 'doctor';
  };
}

const getBearerToken = (req: Request): string | null => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || Array.isArray(authHeader)) return null;

  const [scheme, token] = authHeader.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== 'bearer') return null;
  if (!token || token === 'null' || token === 'undefined') return null;

  return token;
};

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = getBearerToken(req);

  if (!token) {
    console.log("❌ [AUTH] Токен отсутствует в запросе к:", req.originalUrl);
    return res.status(401).json({ code: 'AUTH_REQUIRED', message: 'Требуется вход в систему' }); 
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET) as AuthRequest['user'];
    next();
  } catch (err) {
    console.log("❌ [AUTH] Токен невалиден");
    return res.status(401).json({ code: 'INVALID_TOKEN', message: 'Сессия истекла. Войдите снова.' });
  }
};

export const optionalAuthenticateToken = (req: AuthRequest, _res: Response, next: NextFunction) => {
  const token = getBearerToken(req);

  if (!token) {
    next();
    return;
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET) as AuthRequest['user'];
  } catch {
    req.user = undefined;
  }

  next();
};

export const authorizeRoles = (...roles: Array<'admin' | 'doctor'>) => (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return res.status(401).json({ code: 'AUTH_REQUIRED', message: 'Требуется вход в систему' });
  }

  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ code: 'FORBIDDEN', message: 'Доступ запрещен' });
  }

  next();
};
