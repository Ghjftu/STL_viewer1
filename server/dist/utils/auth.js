"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateToken = exports.comparePassword = exports.hashPassword = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const hashPassword = (password) => bcryptjs_1.default.hash(password, 10);
exports.hashPassword = hashPassword;
const comparePassword = (password, hash) => bcryptjs_1.default.compare(password, hash);
exports.comparePassword = comparePassword;
const generateToken = (userId, role) => {
    return jsonwebtoken_1.default.sign({ userId, role }, JWT_SECRET, { expiresIn: '24h' });
};
exports.generateToken = generateToken;
