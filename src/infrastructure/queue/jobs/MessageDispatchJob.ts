import { MessageService } from '../../services/MessageService';
import { MessageJobData } from '../../../application/dtos/MessageDTO';
import { TemplateRepository } from '../../database/repositories/TemplateRepository';
import { prisma } from '../../database/prisma/PrismaRepository';
import { Job } from 'bullmq';
import { Template } from '../../../domain/entities/Template';
import { BroadcastRepository } from '../../database/repositories/BroadcastRepository';
import { BroadcastStatus } from '../../../domain/valueObjects/BroadcastStatus';

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

      // Enviar a mensagem
      const result = await this.messageService.send({
        content,
        recipient: data.recipient,
        recipientName: data.recipientName,
        broadcastId: data.broadcastId,
        contactId: data.contactId
      });

      // Simular entrega após alguns segundos (apenas para fins de demonstração)
      setTimeout(async () => {
        await this.messageService.simulateDelivered(data.contactId, data.broadcastId);
        
        // Simular leitura após mais alguns segundos
        setTimeout(async () => {
          await this.messageService.simulateRead(data.contactId, data.broadcastId);
        }, Math.random() * 10000 + 5000); // Entre 5 e 15 segundos
        
      }, Math.random() * 3000 + 2000); // Entre 2 e 5 segundos

      return result;
    } catch (error) {
      console.error(`Erro ao processar mensagem para ${data.recipient}:`, error);
      // Relança o erro para que o BullMQ possa lidar com a tentativa de reenvio
      throw error;
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
