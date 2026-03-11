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
app.use((0, cors_1.default)({ origin: '*' }));
app.use(express_1.default.json());
app.use('/storage', express_1.default.static(path_1.default.join(__dirname, '../storage')));
app.use('/api/auth', authRoutes_1.default);
app.use('/api/doctors', doctorRoutes_1.default);
app.use('/api/projects', projectRoutes_1.default);
const clientDistPath = path_1.default.join(__dirname, '../../client');
app.use(express_1.default.static(clientDistPath));
app.get(/(.*)/, (req, res) => {
    res.sendFile(path_1.default.join(clientDistPath, 'index.html'));
});
app.listen(PORT, async () => {
    console.log(`🚀 Server started on port ${PORT}`);
    await (0, init_db_1.initDb)();
});
