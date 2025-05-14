import { Request, Response } from 'express';
import { SendBroadcastMessagesUseCase } from '../../../application/useCases/broadcasts/SendBroadcastMessagesUseCase';
import { prisma } from '../../../infrastructure/database/prisma/PrismaRepository';
import { BroadcastRepository } from '../../../infrastructure/database/repositories/BroadcastRepository';
import { TemplateRepository } from '../../../infrastructure/database/repositories/TemplateRepository';
import { BullQueueProvider } from '../../../infrastructure/queue/BullQueueProvider';

export class MessageController {
  private queueProvider: BullQueueProvider;

  constructor(queueProvider: BullQueueProvider) {
    this.queueProvider = queueProvider;
  }

  async sendBroadcastMessages(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params; // broadcastId
      const { templateId, variables, filter } = req.body;
      
      if (!id) {
        return res.status(400).json({
          error: 'ID da campanha é obrigatório'
        });
      }

      const broadcastRepository = new BroadcastRepository(prisma);
      const templateRepository = new TemplateRepository(prisma);
      
      // Buscar dados do template para garantir que tenhamos todas as informações
      let templateData = null;
      if (templateId) {
        templateData = await templateRepository.findById(templateId);
        if (!templateData) {
          return res.status(404).json({ error: 'Template não encontrado' });
        }
      } else {
        // Se não foi especificado um templateId, buscar o template mais recente do broadcast
        const templates = await templateRepository.findByBroadcastId(id);
        if (templates.length > 0) {
          // Pegar o template mais recente
          templateData = templates.sort((a, b) => 
            new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime()
          )[0];
        }
      }
      
      const sendBroadcastUseCase = new SendBroadcastMessagesUseCase(
        broadcastRepository,
        templateRepository,
        this.queueProvider
      );

      const result = await sendBroadcastUseCase.execute({
        broadcastId: id,
        templateId: templateData?.id,
        variables,
        filter,
        // Passar os metadados do template para uso no envio
        metadata: templateData ? {
          templateName: templateData.name,
          templateVariables: templateData.variables,
          languageCode: templateData.language || 'pt_BR'
        } : undefined
      });

      return res.status(202).json({
        message: `Enviando ${result.messagesQueued} mensagens. Processo iniciado.`,
        ...result
      });
    } catch (error: any) {
      console.error('Erro ao iniciar envio de mensagens:', error);
      
      if (error.message === 'Campanha não encontrada' || 
          error.message === 'Template não encontrado') {
        return res.status(404).json({ error: error.message });
      }
      
      return res.status(500).json({
        error: 'Erro ao iniciar envio de mensagens'
      });
    }
  }
}
