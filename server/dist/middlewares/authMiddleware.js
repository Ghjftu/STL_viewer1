"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authorizeRoles = exports.optionalAuthenticateToken = exports.authenticateToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_change_me_in_prod';
const getBearerToken = (req) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || Array.isArray(authHeader))
        return null;
    const [scheme, token] = authHeader.trim().split(/\s+/);
    if (scheme?.toLowerCase() !== 'bearer')
        return null;
    if (!token || token === 'null' || token === 'undefined')
        return null;
    return token;
};
const authenticateToken = (req, res, next) => {
    const token = getBearerToken(req);
    if (!token) {
        console.log("❌ [AUTH] Токен отсутствует в запросе к:", req.originalUrl);
        return res.status(401).json({ code: 'AUTH_REQUIRED', message: 'Требуется вход в систему' });
    }
    try {
        req.user = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        next();
    }
    catch (err) {
        console.log("❌ [AUTH] Токен невалиден");
        return res.status(401).json({ code: 'INVALID_TOKEN', message: 'Сессия истекла. Войдите снова.' });
    }
};
exports.authenticateToken = authenticateToken;
const optionalAuthenticateToken = (req, _res, next) => {
    const token = getBearerToken(req);
    if (!token) {
        next();
        return;
    }
    try {
        req.user = jsonwebtoken_1.default.verify(token, JWT_SECRET);
    }
    catch {
        req.user = undefined;
    }
    next();
};
exports.optionalAuthenticateToken = optionalAuthenticateToken;
const authorizeRoles = (...roles) => (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ code: 'AUTH_REQUIRED', message: 'Требуется вход в систему' });
    }
    if (!roles.includes(req.user.role)) {
        return res.status(403).json({ code: 'FORBIDDEN', message: 'Доступ запрещен' });
    }
    next();
};
exports.authorizeRoles = authorizeRoles;
