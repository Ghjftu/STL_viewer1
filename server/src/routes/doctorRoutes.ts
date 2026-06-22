import { Router } from 'express';
import { getDoctors, addDoctor, deleteDoctor } from '../controllers/doctorController';
import { authenticateToken, authorizeRoles } from '../middlewares/authMiddleware';

const router = Router();

router.use(authenticateToken, authorizeRoles('admin'));

router.get('/', getDoctors);
router.post('/', addDoctor);
router.delete('/:id', deleteDoctor);

export default router;
