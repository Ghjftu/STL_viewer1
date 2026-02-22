import { Router } from 'express';
import { getDoctors, addDoctor, deleteDoctor } from '../controllers/doctorController';

const router = Router();

router.get('/', getDoctors);
router.post('/', addDoctor);
router.delete('/:id', deleteDoctor);

export default router;