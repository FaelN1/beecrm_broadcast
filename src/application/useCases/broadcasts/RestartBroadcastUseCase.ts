import { IBroadcastRepository } from '../../../domain/repositories/IBroadcastRepository';
import { BroadcastStatus } from '../../../domain/valueObjects/BroadcastStatus';
import { BullQueueProvider } from '../../../infrastructure/queue/BullQueueProvider';

export class RestartBroadcastUseCase {
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

    // Verificar se o broadcast está pausado
    if (broadcast.status !== BroadcastStatus.PAUSED) {
      return {
        success: false,
        message: `A campanha não está pausada (status atual: ${broadcast.status})`
      };
    }

    // Atualizar status para em andamento
    await this.broadcastRepository.update({
      ...broadcast,
      status: BroadcastStatus.IN_PROGRESS
    });

    // Retomar os jobs pausados
    const messageQueue = this.queueProvider.getQueue('message-dispatch');
    if (messageQueue) {
      await this.queueProvider.resumeJobsInQueue('message-dispatch', broadcastId);
    }

    return {
      success: true,
      message: 'Campanha reiniciada com sucesso'
    };
  }
}
