import { Router, Request, Response } from 'express';
import { BroadcastController } from '../controllers/BroadcastController';
import { authMiddleware } from '../middlewares/authMiddleware';

const broadcastController = new BroadcastController();
const broadcastRoutes = Router();

// Todas as rotas de broadcast requerem autenticação
broadcastRoutes.use(authMiddleware);

// Rota para criar uma nova campanha
broadcastRoutes.post('/', (req: Request, res: Response) => broadcastController.create(req, res));

// Rota para adicionar contatos a uma campanha existente
broadcastRoutes.post('/:id/contacts', (req: Request, res: Response) => broadcastController.addContacts(req, res));

// Rota para adicionar template a uma campanha existente
broadcastRoutes.post('/:id/templates', (req: Request, res: Response) => broadcastController.addTemplate(req, res));

// Nova rota para obter contatos por status
broadcastRoutes.get('/:id/contacts/status', (req: Request, res: Response) => broadcastController.getContactsByStatus(req, res));

// Rota para processar um template com suas variáveis
broadcastRoutes.post('/templates/:templateId/process', (req: Request, res: Response) => broadcastController.processTemplate(req, res));

// Novas rotas para controle do ciclo de vida da campanha
broadcastRoutes.post('/:id/start', (req: Request, res: Response) => broadcastController.start(req, res));
broadcastRoutes.post('/:id/pause', (req: Request, res: Response) => broadcastController.pause(req, res));
broadcastRoutes.post('/:id/restart', (req: Request, res: Response) => broadcastController.restart(req, res));
broadcastRoutes.delete('/:id', (req: Request, res: Response) => broadcastController.delete(req, res));

export { broadcastRoutes };