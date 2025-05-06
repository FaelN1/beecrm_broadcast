import { Request, Response } from 'express';
import { prisma } from '../../../infrastructure/database/prisma/PrismaRepository';
import { GenerateReportUseCase } from '../../../application/useCases/reports/GenerateReportUseCase';
import { S3StorageProvider } from '../../../infrastructure/storage/S3StorageProvider';

export class ReportController {
  private storageProvider: S3StorageProvider;
  
  constructor() {
    this.storageProvider = new S3StorageProvider();
  }

  async generateReport(req: Request, res: Response): Promise<Response> {
    try {
      const { broadcastId } = req.params;
      const { type = 'summary', format = 'pdf', email } = req.body;

      console.log(`[ReportController] Iniciando geração de relatório: tipo=${type}, formato=${format}, broadcastId=${broadcastId}, email=${email || 'não informado'}`);

      // Verificar se broadcast existe
      const broadcast = await prisma.broadcast.findUnique({
        where: { id: broadcastId }
      });

      if (!broadcast) {
        console.log(`[ReportController] Campanha não encontrada: ${broadcastId}`);
        return res.status(404).json({ error: 'Campanha não encontrada' });
      }
      
      // Buscar estatísticas básicas da campanha para resposta imediata
      const contactStats = await prisma.broadcastContact.groupBy({
        by: ['status'],
        where: { broadcastId },
        _count: true
      });

      // Utilizar o caso de uso para gerar o relatório de forma assíncrona
      const generateReportUseCase = new GenerateReportUseCase(prisma);
      
      // Iniciar geração do relatório em segundo plano
      generateReportUseCase.execute({
        broadcastId,
        type: type,
        format: format,
        email: email // Passando o email (se existir) para o caso de uso
      })
      .then(report => {
        console.log(`[ReportController] Relatório gerado com sucesso: ${report.id}, URL: ${report.url}`);
        if (report.emailSent) {
          console.log(`[ReportController] Relatório enviado por email`);
        }
      })
      .catch(error => {
        console.error(`[ReportController] Erro ao gerar relatório: ${error.message}`);
      });

      // Criar entrada no banco para o relatório (será atualizada pelo caso de uso)
      const report = await prisma.report.create({
        data: {
          type: `broadcast_${type}`,
          format: format,
          status: 'processing',
          broadcastId
        }
      });

      console.log(`[ReportController] Relatório registrado com ID: ${report.id}, processamento iniciado`);

      // Se o email foi fornecido, atualizar a resposta para indicar que ele será utilizado
      const responseMessage = email 
        ? 'Relatório sendo processado e será enviado por email quando concluído' 
        : 'Relatório sendo processado';

      return res.status(200).json({
        message: responseMessage,
        reportId: report.id,
        broadcast: {
          id: broadcast.id,
          name: broadcast.name,
          status: broadcast.status,
          createdAt: broadcast.createdAt,
          email: email || broadcast.email // Incluindo o email na resposta
        },
        stats: contactStats,
        downloadUrl: `/api/reports/${report.id}/download`
      });
    } catch (error: any) {
      console.error(`[ReportController] Erro ao iniciar geração de relatório: ${error.message}`, error);
      return res.status(500).json({
        error: 'Erro ao gerar relatório'
      });
    }
  }

  async getReports(req: Request, res: Response): Promise<Response> {
    try {
      const { broadcastId } = req.params;
      
      const reports = await prisma.report.findMany({
        where: { broadcastId }
      });
      
      return res.status(200).json({ reports });
    } catch (error) {
      console.error('Erro ao buscar relatórios:', error);
      return res.status(500).json({
        error: 'Erro ao buscar relatórios'
      });
    }
  }

  async getReportById(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      
      const report = await prisma.report.findUnique({
        where: { id }
      });
      
      if (!report) {
        return res.status(404).json({ error: 'Relatório não encontrado' });
      }

      return res.status(200).json(report);
    } catch (error) {
      console.error('Erro ao buscar relatório:', error);
      return res.status(500).json({
        error: 'Erro ao buscar relatório'
      });
    }
  }

  async downloadReport(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      
      console.log(`[ReportController] Solicitação de download para relatório: ${id}`);
      
      const report = await prisma.report.findUnique({
        where: { id }
      });
      
      if (!report) {
        console.log(`[ReportController] Relatório não encontrado para download: ${id}`);
        return res.status(404).json({ error: 'Relatório não encontrado' });
      }

      if (report.status !== 'completed') {
        console.log(`[ReportController] Relatório ainda não está pronto: ${id}, status: ${report.status}`);
        return res.status(400).json({ 
          error: 'Relatório ainda não está pronto para download',
          status: report.status 
        });
      }

      if (!report.filePath) {
        console.log(`[ReportController] Relatório sem arquivo associado: ${id}`);
        return res.status(400).json({ error: 'Relatório não possui arquivo para download' });
      }

      // Gerar URL assinada para download direto do S3
      const downloadUrl = this.storageProvider.getSignedUrl(report.filePath, 86400); // 1 hora de validade
      
      console.log(`[ReportController] URL de download gerada para relatório ${id}: ${downloadUrl}`);
      
      // Redirecionar para a URL de download ou retornar a URL
      return res.status(200).json({
        downloadUrl,
        report: {
          id: report.id,
          type: report.type,
          format: report.format,
          status: report.status,
          createdAt: report.createdAt
        }
      });
    } catch (error: any) {
      console.error(`[ReportController] Erro ao processar download do relatório: ${error.message}`);
      return res.status(500).json({
        error: 'Erro ao processar download do relatório'
      });
    }
  }
}
