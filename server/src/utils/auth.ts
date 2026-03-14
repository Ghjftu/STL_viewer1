import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Оставляем ТОЛЬКО переменную из окружения. 
// Она ДОЛЖНА совпадать с тем, что в middleware
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_change_me_in_prod'; 

export const hashPassword = (password: string) => bcrypt.hash(password, 10);
export const comparePassword = (password: string, hash: string) => bcrypt.compare(password, hash);

export const generateToken = (userId: string, role: string) => {
  return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: '24h' });
};