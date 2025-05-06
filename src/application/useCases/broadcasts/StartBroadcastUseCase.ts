import { IBroadcastRepository } from '../../../domain/repositories/IBroadcastRepository';
import { BroadcastStatus } from '../../../domain/valueObjects/BroadcastStatus';
import { BullQueueProvider } from '../../../infrastructure/queue/BullQueueProvider';
import { SendBroadcastMessagesUseCase } from './SendBroadcastMessagesUseCase';
import { TemplateRepository } from '../../../infrastructure/database/repositories/TemplateRepository';
import { prisma } from '../../../infrastructure/database/prisma/PrismaRepository';

export class StartBroadcastUseCase {
  private templateRepository: TemplateRepository;
  
  constructor(
    private broadcastRepository: IBroadcastRepository,
    private queueProvider: BullQueueProvider
  ) {
    this.templateRepository = new TemplateRepository(prisma);
  }

  async execute(broadcastId: string): Promise<{ success: boolean; message: string }> {
    // Verificar se o broadcast existe
    const broadcast = await this.broadcastRepository.findById(broadcastId);
    
    if (!broadcast) {
      throw new Error('Campanha não encontrada');
    }

    // Verificar se o broadcast pode ser iniciado (não está em andamento, completado ou falhou)
    if (broadcast.status === BroadcastStatus.IN_PROGRESS) {
      return { 
        success: false, 
        message: 'A campanha já está em andamento' 
      };
    }

    if (broadcast.status === BroadcastStatus.COMPLETED) {
      return { 
        success: false, 
        message: 'A campanha já foi concluída' 
      };
    }

    if (broadcast.status === BroadcastStatus.CANCELED) {
      return { 
        success: false, 
        message: 'A campanha foi cancelada e não pode ser iniciada' 
      };
    }

    // Encontrar o template mais recente da campanha
    const templates = await this.templateRepository.findByBroadcastId(broadcastId);
    if (templates.length === 0) {
      return {
        success: false,
        message: 'A campanha não possui um template para envio de mensagens'
      };
    }

    const mostRecentTemplate = templates.sort((a, b) => 
      new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime()
    )[0];

    // Atualizar status para em andamento
    await this.broadcastRepository.update({
      ...broadcast,
      status: BroadcastStatus.IN_PROGRESS
    });

    // Iniciar envio de mensagens usando o caso de uso existente
    const sendBroadcastUseCase = new SendBroadcastMessagesUseCase(
      this.broadcastRepository,
      this.templateRepository,
      this.queueProvider
    );

    try {
      const result = await sendBroadcastUseCase.execute({
        broadcastId,
        templateId: mostRecentTemplate.id!
      });

      return {
        success: true,
        message: `Campanha iniciada. ${result.messagesQueued} mensagens colocadas na fila.`
      };
    } catch (error) {
      // Em caso de erro, voltar o status para draft
      await this.broadcastRepository.update({
        ...broadcast,
        status: BroadcastStatus.DRAFT
      });

      throw error;
    }
  }
}
