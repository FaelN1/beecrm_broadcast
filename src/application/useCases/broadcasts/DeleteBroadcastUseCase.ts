import { IBroadcastRepository } from '../../../domain/repositories/IBroadcastRepository';
import { BroadcastStatus } from '../../../domain/valueObjects/BroadcastStatus';
import { BullQueueProvider } from '../../../infrastructure/queue/BullQueueProvider';
import { prisma } from '../../../infrastructure/database/prisma/PrismaRepository';

export class DeleteBroadcastUseCase {
  constructor(
    private broadcastRepository: IBroadcastRepository,
    private queueProvider: BullQueueProvider
  ) {}

  async execute(broadcastId: string, hardDelete: boolean = false): Promise<{ success: boolean; message: string }> {
    // Verificar se o broadcast existe
    const broadcast = await this.broadcastRepository.findById(broadcastId);
    
    if (!broadcast) {
      throw new Error('Campanha não encontrada');
    }

    // Remover todos os jobs associados da fila
    const messageQueue = this.queueProvider.getQueue('message-dispatch');
    if (messageQueue) {
      await this.queueProvider.removeJobsFromQueue('message-dispatch', broadcastId);
    }

    if (hardDelete) {
      // Hard delete: remover permanentemente do banco de dados
      try {
        await prisma.$transaction(async (tx) => {
          // Primeiro remover todas as relações
          await tx.broadcastContact.deleteMany({
            where: { broadcastId }
          });
          
          // Remover templates
          await tx.template.deleteMany({
            where: { broadcastId }
          });
          
          // Por fim, remover o broadcast
          await tx.broadcast.delete({
            where: { id: broadcastId }
          });
        });
        
        return {
          success: true,
          message: 'Campanha excluída permanentemente do banco de dados'
        };
      } catch (error) {
        console.error('Erro ao excluir campanha:', error);
        throw new Error('Não foi possível excluir a campanha permanentemente');
      }
    } else {
      // Soft delete: apenas marcar como cancelada
      await this.broadcastRepository.update({
        ...broadcast,
        status: BroadcastStatus.CANCELED
      });
      
      return {
        success: true,
        message: 'Campanha cancelada com sucesso'
      };
    }
  }
}
