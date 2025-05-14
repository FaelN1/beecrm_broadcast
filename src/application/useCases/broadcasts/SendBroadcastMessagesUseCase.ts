import { PrismaClient } from '@prisma/client';
import { IBroadcastRepository } from '../../../domain/repositories/IBroadcastRepository';
import { ITemplateRepository } from '../../../domain/repositories/ITemplateRepository';
import { BroadcastStatus } from '../../../domain/valueObjects/BroadcastStatus';
import { ContactStatus } from '../../../domain/valueObjects/ContactStatus';
import { BulkSendMessagesDTO, BulkSendMessagesResponseDTO } from '../../dtos/MessageDTO';
import { BullQueueProvider } from '../../../infrastructure/queue/BullQueueProvider';
import { prisma } from '../../../infrastructure/database/prisma/PrismaRepository';
import { notificationService } from '../../../index'; // Importar o NotificationService

export class SendBroadcastMessagesUseCase {
  constructor(
    private broadcastRepository: IBroadcastRepository,
    private templateRepository: ITemplateRepository,
    private queueProvider: BullQueueProvider,
    private prismaClient = prisma
  ) {}

  async execute(data: BulkSendMessagesDTO): Promise<BulkSendMessagesResponseDTO> {
    // Verificar se o broadcast existe
    const broadcast = await this.broadcastRepository.findById(data.broadcastId);
    if (!broadcast) {
      throw new Error('Campanha não encontrada');
    }

    // Verificar se o template existe, se for fornecido
    let template = null;
    if (data.templateId) {
      template = await this.templateRepository.findById(data.templateId);
      if (!template) {
        throw new Error('Template não encontrado');
      }
    }

    // Atualizar o status da campanha para em progresso
    const updatedBroadcast = await this.broadcastRepository.update({
      ...broadcast,
      status: BroadcastStatus.IN_PROGRESS
    });

    // Notificar o início da campanha
    notificationService.updateBroadcastStatus(updatedBroadcast.id!, updatedBroadcast.status, { name: updatedBroadcast.name });

    // Buscar os contatos que serão destinatários das mensagens
    const contactsQuery: {
      where: {
        broadcastId: string;
        status?: { in: string[] };
        contactId?: { in: string[] };
      };
      include: {
        contact: true;
      }
    } = {
      where: {
        broadcastId: data.broadcastId,
      },
      include: {
        contact: true
      }
    };

    // Aplicar filtros se fornecidos
    if (data.filter) {
      if (data.filter.status && data.filter.status.length > 0) {
        contactsQuery.where.status = { in: data.filter.status };
      }

      if (data.filter.contactIds && data.filter.contactIds.length > 0) {
        contactsQuery.where.contactId = { in: data.filter.contactIds };
      }
    }

    const broadcastContacts = await this.prismaClient.broadcastContact.findMany(contactsQuery);

    // Adicionar jobs à fila para cada contato
    const queue = this.queueProvider.getQueue('message-dispatch');
    if (!queue) {
      throw new Error('Fila de envio de mensagens não foi inicializada');
    }

    // Preparar os metadados do template para envio
    const metadata = {
      messageType: 'template',
      templateName: template?.name || data.metadata?.templateName || 'default_template',
      languageCode: template?.language || data.metadata?.languageCode || 'pt_BR',
      // Adicionar variáveis específicas do template
      templateVariables: template?.variables || data.metadata?.templateVariables
    };

    const jobPromises = broadcastContacts.map(async (bc) => {
      const jobData = {
        broadcastId: data.broadcastId,
        contactId: bc.contactId,
        recipient: bc.contact.phone,
        recipientName: bc.displayName || bc.contact.name,
        templateId: data.templateId,
        variables: {
          ...data.variables,
          name: bc.displayName || bc.contact.name
        },
        content: '', // Será definido no job com base no template
        metadata: metadata // Passar os metadados do template
      };

      // Atualizar status do contato para 'pending'
      await this.prismaClient.broadcastContact.update({
        where: {
          broadcastId_contactId: {
            broadcastId: bc.broadcastId,
            contactId: bc.contactId
          }
        },
        data: {
          status: ContactStatus.PENDING
        }
      });

      // Adicionar à fila
      return this.queueProvider.addJob('message-dispatch', jobData);
    });

    // Aguardar a adição de todos os jobs à fila
    const jobResults = await Promise.all(jobPromises);
    const jobId = jobResults[0] || `batch_${Date.now()}`; // ID do primeiro job ou um ID gerado

    return {
      broadcastId: data.broadcastId,
      messagesQueued: broadcastContacts.length,
      jobId,
      status: 'queued'
    };
  }
}
