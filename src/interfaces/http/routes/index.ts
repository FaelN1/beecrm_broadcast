import { Router } from 'express';
import { broadcastRoutes } from './broadcastRoutes';
import { messageRoutes } from './messageRoutes';
import { reportRoutes } from './reportRoutes';

const router = Router();

router.use('/broadcasts', broadcastRoutes);
router.use('/messages', messageRoutes);
router.use('/reports', reportRoutes);

export { router };