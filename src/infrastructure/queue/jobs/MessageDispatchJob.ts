import { MessageService } from '../../services/MessageService';
import { MessageJobData } from '../../../application/dtos/MessageDTO';
import { TemplateRepository } from '../../database/repositories/TemplateRepository';
import { prisma } from '../../database/prisma/PrismaRepository';
import { Job } from 'bullmq';
import { Template } from '../../../domain/entities/Template';
import { BroadcastRepository } from '../../database/repositories/BroadcastRepository';
import { BroadcastStatus } from '../../../domain/valueObjects/BroadcastStatus';
import { ContactStatus } from '../../../domain/valueObjects/ContactStatus'; // Novo import
import { GenerateReportUseCase } from '../../../application/useCases/reports/GenerateReportUseCase'; // Novo import

export class MessageDispatchJob {
  private messageService: MessageService;
  private templateRepository: TemplateRepository;
  private broadcastRepository: BroadcastRepository;

  constructor() {
    this.messageService = new MessageService();
    this.templateRepository = new TemplateRepository(prisma);
    this.broadcastRepository = new BroadcastRepository(prisma);
  }

  async process(job: Job<MessageJobData>): Promise<any> {
    const data = job.data;
    console.log(`Processando job de envio de mensagem: ${job.id}`);

    try {
      // Verificar se o job foi marcado como pausado
      if (data.__pauseState?.paused) {
        console.log(`Job ${job.id} está marcado como pausado. Adiando processamento.`);
        return { status: 'paused', message: 'Job pausado' };
      }

      // Verificar o status atual da campanha
      const broadcast = await this.broadcastRepository.findById(data.broadcastId);
      if (!broadcast) {
        throw new Error('Broadcast não encontrado');
      }

      // Verificar status da campanha
      if (broadcast.status === BroadcastStatus.PAUSED) {
        console.log(`Campanha ${data.broadcastId} está pausada. Adiando job ${job.id}.`);
        // Não tenta mover o job - retorna status para o worker lidar
        return { status: 'paused', message: 'Campanha pausada' };
      }

      if (broadcast.status === BroadcastStatus.CANCELED) {
        console.log(`Campanha ${data.broadcastId} foi cancelada. Ignorando job ${job.id}.`);
        return { status: 'canceled', message: 'Campanha cancelada' };
      }

      let content = data.content;

      // Se tiver templateId e variáveis, processa o template
      if (data.templateId && data.variables) {
        const templateData = await this.templateRepository.findById(data.templateId);
        
        if (templateData) {
          // Criar uma instância da classe Template para poder usar seus métodos
          const template = new Template({
            id: templateData.id,
            name: templateData.name,
            content: templateData.content,
            variables: templateData.variables,
            broadcastId: templateData.broadcastId,
            createdAt: templateData.createdAt,
            updatedAt: templateData.updatedAt
          });
          
          // Adiciona o nome do recipiente automaticamente se não for fornecido
          if (!data.variables['name'] && data.recipientName) {
            data.variables['name'] = data.recipientName;
          }
          
          content = template.processVariables(data.variables);
        }
      }

      console.log(`Enviando: `, {
        content,
        recipient: data.recipient,
        recipientName: data.recipientName,
        broadcastId: data.broadcastId,
        contactId: data.contactId
      })

      // Garante que metadata sempre será enviado
      const metadata = (data as any).metadata || {};
      const result = await this.messageService.send({
        content,
        recipient: data.recipient,
        recipientName: data.recipientName,
        broadcastId: data.broadcastId,
        contactId: data.contactId,
        metadata // Garante envio correto do metadata
      });

      // Simular entrega após alguns segundos (apenas para fins de demonstração)
      setTimeout(async () => {
        await this.messageService.simulateDelivered(data.contactId, data.broadcastId);
        
        // Simular leitura após mais alguns segundos
        setTimeout(async () => {
          await this.messageService.simulateRead(data.contactId, data.broadcastId);
          await this.checkCampaignCompletion(data.broadcastId); // Verificar conclusão após leitura
        }, Math.random() * 10000 + 5000); // Entre 5 e 15 segundos
        
      }, Math.random() * 3000 + 2000); // Entre 2 e 5 segundos

      // Verificar conclusão também após o envio inicial (caso a simulação de delivered/read falhe ou demore)
      // No entanto, a verificação mais robusta é após os status finais.
      // Se a simulação for removida, a chamada abaixo seria mais crítica.
      // await this.checkCampaignCompletion(data.broadcastId);


      return result;
    } catch (error) {
      console.error(`Erro ao processar mensagem para ${data.recipient}:`, error);
      // Mesmo em caso de erro, o contato pode ter um status final (ex: FAILED)
      // Portanto, verificar a conclusão da campanha aqui também pode ser válido
      // dependendo de como o status do contato é atualizado em caso de falha no envio.
      // Por ora, a verificação principal está após as simulações de status finais.
      // Se o erro for antes da atualização de status do contato, a campanha não será finalizada por este job.
      throw error;
    }
  }

  async checkCampaignCompletion(broadcastId: string): Promise<void> {
    try {
      const broadcast = await this.broadcastRepository.findById(broadcastId);
      // Só prosseguir se a campanha ainda não estiver COMPLETED ou CANCELED
      if (!broadcast || broadcast.status === BroadcastStatus.COMPLETED || broadcast.status === BroadcastStatus.CANCELED) {
        return;
      }

      const pendingContactsCount = await prisma.broadcastContact.count({
        where: {
          broadcastId: broadcastId,
          status: {
            in: [ContactStatus.PENDING, ContactStatus.SENT], // Status que indicam não finalizado
          },
        },
      });

      console.log(`[MessageDispatchJob] Verificando conclusão da campanha ${broadcastId}. Contatos pendentes/enviados: ${pendingContactsCount}`);

      if (pendingContactsCount === 0) {
        // Verificar novamente o status da campanha para evitar race conditions
        const currentBroadcast = await this.broadcastRepository.findById(broadcastId);
        if (currentBroadcast && currentBroadcast.status !== BroadcastStatus.COMPLETED && currentBroadcast.status !== BroadcastStatus.CANCELED) {
          await this.broadcastRepository.update({
            ...currentBroadcast,
            status: BroadcastStatus.COMPLETED,
          });
          console.log(`[MessageDispatchJob] Campanha ${broadcastId} marcada como COMPLETED.`);

          // Disparar geração de relatório PDF summary
          const generateReportUseCase = new GenerateReportUseCase(prisma);
          console.log(`[MessageDispatchJob] Iniciando geração de relatório PDF para campanha ${broadcastId}.`);
          
          // Executar em segundo plano para não bloquear o job, mas logar erros.
          generateReportUseCase.execute({
            broadcastId: broadcastId,
            type: 'summary',
            format: 'pdf',
            email: currentBroadcast.email, // Usar o email da campanha, se houver
          }).then(reportInfo => {
            console.log(`[MessageDispatchJob] Geração de relatório para ${broadcastId} concluída (ou iniciada e processando). ID do Relatório: ${reportInfo.id}`);
          }).catch(reportError => {
            console.error(`[MessageDispatchJob] Erro ao gerar relatório para campanha ${broadcastId}:`, reportError);
          });
        }
      }
    } catch (error) {
      console.error(`[MessageDispatchJob] Erro ao verificar conclusão da campanha ${broadcastId}:`, error);
    }
  }
}

export const messageDispatchProcessor = async (job: Job<MessageJobData>) => {
  const dispatcher = new MessageDispatchJob();
  try {
    const result = await dispatcher.process(job);
    
    // Se o resultado indicar que o job está pausado ou cancelado
    // vamos lidar com isso sem lançar exceção
    if (result?.status === 'paused' || result?.status === 'canceled') {
      console.log(`Job ${job.id} ${result.status}: ${result.message}`);
      return result;
    }
    
    return result;
  } catch (error) {
    console.error(`Erro no processamento do job ${job.id}:`, error);
    throw error;
  }
};
