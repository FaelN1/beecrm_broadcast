import { IBroadcastRepository } from '../../../domain/repositories/IBroadcastRepository';
import { BroadcastStatus } from '../../../domain/valueObjects/BroadcastStatus';
import { BullQueueProvider } from '../../../infrastructure/queue/BullQueueProvider';

export class PauseBroadcastUseCase {
  constructor(
    private broadcastRepository: IBroadcastRepository,
    private queueProvider: BullQueueProvider
  ) {}

  async execute(broadcastId: string): Promise<{ success: boolean; message: string }> {
    // Verificar se o broadcast existe
    const broadcast = await this.broadcastRepository.findById(broadcastId);
    
    if (!broadcast) {
      throw new Error('Campanha não encontrada');
    }

    // Verificar se o broadcast está em andamento
    if (broadcast.status !== BroadcastStatus.IN_PROGRESS) {
      return {
        success: false,
        message: `A campanha não está em andamento (status atual: ${broadcast.status})`
      };
    }

    // Atualizar status para pausado
    await this.broadcastRepository.update({
      ...broadcast,
      status: BroadcastStatus.PAUSED
    });

    // Pausar os jobs associados a esta campanha
    const messageQueue = this.queueProvider.getQueue('message-dispatch');
    if (messageQueue) {
      await this.queueProvider.pauseJobsInQueue('message-dispatch', broadcastId);
    }

    return {
      success: true,
      message: 'Campanha pausada com sucesso'
    };
  }
}
