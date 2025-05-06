import { Router } from 'express';
import { MessageController } from '../controllers/MessageController';
import { authMiddleware } from '../middlewares/authMiddleware';
import { BullQueueProvider } from '../../../infrastructure/queue/BullQueueProvider';

// Usando a mesma instância do BullQueueProvider
const queueProvider = new BullQueueProvider();
const messageController = new MessageController(queueProvider);
const messageRoutes = Router();

// Todas as rotas de mensagens requerem autenticação
messageRoutes.use(authMiddleware);

// Rota para iniciar o envio de mensagens de uma campanha
messageRoutes.post('/broadcasts/:id/send', messageController.sendBroadcastMessages.bind(messageController));

export { messageRoutes, queueProvider };
