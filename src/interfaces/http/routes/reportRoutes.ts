import { Router } from 'express';
import { ReportController } from '../controllers/ReportController';
import { authMiddleware } from '../middlewares/authMiddleware';

const reportController = new ReportController();
const reportRoutes = Router();

// Todas as rotas de relatórios requerem autenticação
reportRoutes.use(authMiddleware);

// Rota para gerar um novo relatório
reportRoutes.post('/broadcasts/:broadcastId', reportController.generateReport.bind(reportController));

// Rota para listar todos os relatórios de uma campanha
reportRoutes.get('/broadcasts/:broadcastId', reportController.getReports.bind(reportController));

// Rota para obter um relatório específico
reportRoutes.get('/:id', reportController.getReportById.bind(reportController));

// Nova rota para download de relatórios
reportRoutes.get('/:id/download', reportController.downloadReport.bind(reportController));

export { reportRoutes };
