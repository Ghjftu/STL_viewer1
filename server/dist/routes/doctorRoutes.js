"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const doctorController_1 = require("../controllers/doctorController");
const router = (0, express_1.Router)();
router.get('/', doctorController_1.getDoctors);
router.post('/', doctorController_1.addDoctor);
router.delete('/:id', doctorController_1.deleteDoctor);
exports.default = router;
