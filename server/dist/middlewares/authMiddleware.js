"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        console.log("❌ [AUTH] Токен отсутствует в запросе к:", req.originalUrl);
        return res.status(401).json({ error: 'Access Denied' });
    }
    try {
        const verified = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || 'super_secret_key_change_me_in_prod');
        req.user = verified;
        next();
    }
    catch (err) {
        console.log("❌ [AUTH] Токен невалиден");
        res.status(403).json({ error: 'Invalid Token' });
    }
};
exports.authenticateToken = authenticateToken;
