"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const projectRoutes_1 = __importDefault(require("./routes/projectRoutes"));
const doctorRoutes_1 = __importDefault(require("./routes/doctorRoutes"));
const init_db_1 = require("./scripts/init-db");
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 8000;
// 1. Настройки безопасности и парсинга
app.use((0, cors_1.default)({ origin: '*' }));
app.use(express_1.default.json({ limit: '100mb' }));
app.use(express_1.default.urlencoded({ limit: '100mb', extended: true }));
// 2. Раздача папки с 3D-моделями (это оставляем, это нужно!)
app.use('/storage', express_1.default.static(path_1.default.join(__dirname, '../storage')));
// 3. API Маршруты
app.use('/api/auth', authRoutes_1.default);
app.use('/api/doctors', doctorRoutes_1.default);
app.use('/api/projects', projectRoutes_1.default);
// Если запрос пришел на /api/..., но маршрут не найден
app.use('/api', (req, res) => {
    res.status(404).json({ message: "API route not found" });
});
const startServer = async () => {
    try {
        await (0, init_db_1.initDb)();
        app.listen(PORT, () => {
            console.log(`🚀 Server started on port ${PORT}`);
        });
    }
    catch (err) {
        console.error('❌ Server startup failed. Database is not ready:', err);
        process.exit(1);
    }
};
startServer();
