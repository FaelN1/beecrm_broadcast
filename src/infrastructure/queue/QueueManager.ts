import { BullQueueProvider } from './BullQueueProvider';
import { messageDispatchProcessor } from './jobs/MessageDispatchJob';
import { Worker, Job } from 'bullmq';
import { prisma } from '../database/prisma/PrismaRepository'; // Importar Prisma
import { BroadcastStatus } from '../../domain/valueObjects/BroadcastStatus'; // Importar BroadcastStatus
import { MessageJobData } from '../../application/dtos/MessageDTO'; // Importar MessageJobData
import { BROADCAST_EVENT_TYPES, BroadcastEventData, BroadcastJobFailedData } from '../../domain/events/BroadcastEvents';
import { notificationService } from '../../index'; // Importar o NotificationService

export class QueueManager {
  private queueProvider: BullQueueProvider;
  private workers: Worker[] = [];

  constructor(queueProvider: BullQueueProvider) {
    this.queueProvider = queueProvider;
  }

  async initialize(): Promise<void> {
    console.log('Inicializando gerenciador de filas...');
    
    // Inicializar worker para processamento de mensagens
    this.setupMessageDispatchWorker();
    
    console.log('Gerenciador de filas inicializado com sucesso');
  }

  private setupMessageDispatchWorker(): void {
    const worker = this.queueProvider.createWorker('message-dispatch', messageDispatchProcessor);
    
    worker.on('completed', async (job: Job<MessageJobData>, result: any) => {
      console.log(`Job ${job.id} concluído com sucesso`);
      // Adicionar lógica para verificar se a campanha foi concluída
      if (job.data.broadcastId) {
        try {
          const broadcastId = job.data.broadcastId;
          const messageQueue = this.queueProvider.getQueue('message-dispatch');

          if (messageQueue) {
            const jobCounts = await messageQueue.getJobCounts('wait', 'active', 'delayed');
            const pendingJobsForBroadcast = await messageQueue.getJobs(['waiting', 'active', 'delayed']);
            const jobsForThisBroadcast = pendingJobsForBroadcast.filter(
              (pendingJob) => pendingJob.data.broadcastId === broadcastId
            );

            if (jobsForThisBroadcast.length === 0) {
              // Não há mais jobs pendentes para esta campanha, marcar como concluída
              const broadcast = await prisma.broadcast.findUnique({
                where: { id: broadcastId },
              });

              if (broadcast && broadcast.status === BroadcastStatus.IN_PROGRESS) {
                await prisma.broadcast.update({
                  where: { id: broadcastId },
                  data: { status: BroadcastStatus.COMPLETED },
                });
                console.log(`Campanha ${broadcastId} marcada como COMPLETED.`);
                // Notificar conclusão da campanha
                notificationService.updateBroadcastStatus(broadcastId, BroadcastStatus.COMPLETED, { name: broadcast.name });
              }
            }
          }
        } catch (error) {
          console.error(`Erro ao verificar conclusão da campanha para o job ${job.id}:`, error);
        }
      }
    });

    worker.on('failed', async (job, error) => {
      console.error(`Job ${job?.id} falhou: ${error.message}`);
      if (job?.data.broadcastId) {
        const broadcastId = job.data.broadcastId;
        const broadcast = await prisma.broadcast.findUnique({ where: { id: broadcastId } });
        // Notificar falha do job
        const eventData: BroadcastJobFailedData = {
          broadcastId,
          name: broadcast?.name,
          status: BroadcastStatus.FAILED, // Ou um status específico para job failed
          timestamp: new Date(),
          jobId: job.id,
          error: error.message,
        };
        notificationService.notifyBroadcastJobFailed(eventData);

        // Opcional: Marcar a campanha inteira como falha se um job falhar e não houver retentativas
        // Isso depende da sua lógica de negócios.
        // Considere verificar o número de tentativas restantes antes de fazer isso.
        if (job.attemptsMade >= (job.opts.attempts || 1)) {
            // Aqui você pode decidir se a falha de um job implica na falha da campanha
            // await prisma.broadcast.update({
            //   where: { id: broadcastId },
            //   data: { status: BroadcastStatus.FAILED },
            // });
            // notificationService.updateBroadcastStatus(broadcastId, BroadcastStatus.FAILED, { name: broadcast?.name, error: `Job ${job.id} failed after ${job.attemptsMade} attempts` });
        }
      }

      if (error.message.includes('API de mensagens')) {
        console.error('Detalhes da falha de API:', error);
      }
    });

    worker.on('error', (error) => {
      console.error('Erro no worker de mensagens:', error);
    });
    
    // Adicionar tratamento para outros eventos
    worker.on('stalled', (jobId) => {
      console.warn(`Job ${jobId} está em stalled state.`);
    });

    this.workers.push(worker);
    console.log('Worker de processamento de mensagens inicializado');
  }

  async shutdown(): Promise<void> {
    console.log('Encerrando filas e workers...');
    
    // Encerrar todos os workers
    const closingWorkers = this.workers.map(worker => worker.close());
    await Promise.all(closingWorkers);
    
    // Fechar a conexão do provider
    await this.queueProvider.close();
    
    console.log('Filas e workers encerrados com sucesso');
  }
}
