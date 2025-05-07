import { Router, Request, Response, NextFunction } from 'express';
import { BroadcastController } from '../controllers/BroadcastController';
import { authMiddleware } from '../middlewares/authMiddleware';

const broadcastController = new BroadcastController();
const broadcastRoutes = Router();

// Aplicar authMiddleware a todas as rotas deste router
broadcastRoutes.use(authMiddleware as any); // Usando "as any" temporariamente para contornar o problema de tipagem complexo

// Rota para criar uma nova campanha
broadcastRoutes.post('/', broadcastController.create.bind(broadcastController));

// Rota para adicionar contatos a uma campanha existente
broadcastRoutes.post('/:id/contacts', broadcastController.addContacts.bind(broadcastController));

// Rota para adicionar template a uma campanha existente
broadcastRoutes.post('/:id/templates', broadcastController.addTemplate.bind(broadcastController));

// Nova rota para obter contatos por status
broadcastRoutes.get('/:id/contacts/status', broadcastController.getContactsByStatus.bind(broadcastController));

// Rota para processar um template com suas variáveis
broadcastRoutes.post('/templates/:templateId/process', broadcastController.processTemplate.bind(broadcastController));

// Novas rotas para controle do ciclo de vida da campanha
broadcastRoutes.post('/:id/start', broadcastController.start.bind(broadcastController));
broadcastRoutes.post('/:id/pause', broadcastController.pause.bind(broadcastController));
broadcastRoutes.post('/:id/restart', broadcastController.restart.bind(broadcastController));
broadcastRoutes.delete('/:id', broadcastController.delete.bind(broadcastController));

// Rota para buscar campanhas por canal (query param: channel)
broadcastRoutes.get('/channel', broadcastController.getBroadcastsByChannel.bind(broadcastController));

export { broadcastRoutes };