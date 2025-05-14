import { Job } from 'bullmq';
import { IBroadcastRepository } from '../../../domain/repositories/IBroadcastRepository';
import { BroadcastRepository } from '../../database/repositories/BroadcastRepository';
import { prisma } from '../../database/prisma/PrismaRepository';
import { BroadcastStatus } from '../../../domain/valueObjects/BroadcastStatus';
import { StartBroadcastUseCase } from '../../../application/useCases/broadcasts/StartBroadcastUseCase';
import { queueProvider } from '../../../index'; // Importa a instância global do BullQueueProvider
import { AppError } from '../../../shared/errors/AppError';

export class ScheduledCampaignJob {
  private broadcastRepository: IBroadcastRepository;
  private startBroadcastUseCase: StartBroadcastUseCase;

  constructor() {
    this.broadcastRepository = new BroadcastRepository(prisma);
    this.startBroadcastUseCase = new StartBroadcastUseCase(
      this.broadcastRepository,
      queueProvider 
    );
  }

  async process(job: Job): Promise<void> {
    console.log(`[ScheduledCampaignJob] Verificando campanhas agendadas... Job ID: ${job.id}, Data: ${new Date().toISOString()}`);
    try {
      const nowUtc = new Date();
      console.log(`[ScheduledCampaignJob] Hora atual UTC: ${nowUtc.toISOString()}`);
      // Busca campanhas SCHEDULED cuja startDate é agora ou no passado, e que não foram deletadas
      const campaignsToStart = await this.broadcastRepository.findMany({
        where: {
          status: BroadcastStatus.SCHEDULED,
          startDate: {
            lte: nowUtc,
          },
          deletedAt: null,
        },
      });

      if (campaignsToStart.length === 0) {
        console.log('[ScheduledCampaignJob] Nenhuma campanha agendada para iniciar no momento.');
        return;
      }

      console.log(`[ScheduledCampaignJob] ${campaignsToStart.length} campanha(s) encontrada(s) para iniciar.`);

      for (const campaign of campaignsToStart) {
        if (!campaign.id) {
          console.error(`[ScheduledCampaignJob] Campanha com nome "${campaign.name}" não possui ID, pulando.`);
          continue;
        }
        
        console.log(`[ScheduledCampaignJob] Tentando iniciar campanha ID: ${campaign.id}, Nome: ${campaign.name}, StartDate: ${campaign.startDate}`);
        try {
          // O StartBroadcastUseCase é responsável por mudar o status para IN_PROGRESS
          // e enfileirar as mensagens.
          await this.startBroadcastUseCase.execute(campaign.id);
          console.log(`[ScheduledCampaignJob] Campanha ID: ${campaign.id} processada para início.`);
        } catch (error: any) {
          console.error(`[ScheduledCampaignJob] Erro ao processar início da campanha ID: ${campaign.id}. Erro: ${error.message}`, error.stack);
          // O StartBroadcastUseCase deve tratar a mudança de status para FAILED em caso de erro.
          // Se o erro for uma AppError, ela já pode ter sido tratada e logada.
          if (!(error instanceof AppError)) {
            // Para erros inesperados não tratados pelo StartBroadcastUseCase,
            // podemos tentar marcar a campanha como FAILED aqui para evitar loops.
            try {
                const currentCampaignState = await this.broadcastRepository.findById(campaign.id);
                if (currentCampaignState && currentCampaignState.status === BroadcastStatus.SCHEDULED) {
                    await this.broadcastRepository.update({
                        ...currentCampaignState,
                        status: BroadcastStatus.FAILED,
                        // Adicionar um campo para razão da falha seria útil
                    });
                    console.warn(`[ScheduledCampaignJob] Campanha ID: ${campaign.id} marcada como FAILED devido a erro inesperado no processamento.`);
                }
            } catch (updateError) {
                console.error(`[ScheduledCampaignJob] Erro ao tentar atualizar campanha ID: ${campaign.id} para FAILED:`, updateError);
            }
          }
        }
      }
    } catch (error: any) {
      console.error(`[ScheduledCampaignJob] Erro crítico ao processar job: ${error.message}`, error.stack);
      // Não relançar para não parar o job repetível, a menos que seja uma falha de infraestrutura.
    }
  }
}

export const scheduledCampaignProcessor = async (job: Job) => {
  const jobProcessor = new ScheduledCampaignJob();
  await jobProcessor.process(job);
};
