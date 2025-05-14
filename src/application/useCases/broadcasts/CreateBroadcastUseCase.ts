import { Broadcast } from '../../../domain/entities/Broadcast';
import { Template } from '../../../domain/entities/Template';
import { IBroadcastRepository } from '../../../domain/repositories/IBroadcastRepository';
import { CreateBroadcastDTO, BroadcastResponseDTO } from '../../dtos/BroadcastDTO';
import { prisma } from '../../../infrastructure/database/prisma/PrismaRepository';

export class CreateBroadcastUseCase {
  constructor(
    private broadcastRepository: IBroadcastRepository,
    private prismaClient = prisma
  ) {}

  async execute(data: CreateBroadcastDTO): Promise<BroadcastResponseDTO> {
    const broadcast = new Broadcast({
      name: data.name,
      description: data.description,
      status: data.status,
      channel: data.channel
    });

    // Usar transação do Prisma para garantir atomicidade
    return this.prismaClient.$transaction(async (prisma) => {
      // Criar o broadcast
      const createdBroadcast = await this.broadcastRepository.create(broadcast);
      
      let contactsCount = 0;
      // Para cada contato no DTO, se houver contatos
      if (data.contacts && Array.isArray(data.contacts)) {
        contactsCount = data.contacts.length;
        const contactPromises = data.contacts.map(async (contactDto) => {
          // Verificar se o contato já existe pelo telefone
          let contact = await prisma.contact.findUnique({
            where: { phone: contactDto.phone }
          });

          // Se não existir, criar um novo contato
          if (!contact) {
            contact = await prisma.contact.create({
              data: {
                name: contactDto.name,
                phone: contactDto.phone
              }
            });
          }

          // Criar relação entre broadcast e contato
          await prisma.broadcastContact.create({
            data: {
              broadcastId: createdBroadcast.id!,
              contactId: contact.id,
              displayName: contactDto.displayName || contactDto.name,
              status: 'pending'
            }
          });
        });

        // Aguardar todas as operações de contato serem concluídas
        await Promise.all(contactPromises);
      }
      
      // Criar template se fornecido
      let templateData: { id: string; name: string; content: string } | undefined = undefined;
      if (data.template) {
        const template = await prisma.template.create({
          data: {
            name: data.template.name,
            content: data.template.content,
            broadcastId: createdBroadcast.id!
          }
        });
        templateData = {
          id: template.id,
          name: template.name,
          content: template.content
        };
      }

      // Retornar resposta formatada
      return {
        id: createdBroadcast.id!,
        name: createdBroadcast.name,
        description: createdBroadcast.description,
        status: createdBroadcast.status,
        channel: createdBroadcast.channel,
        contactsCount: contactsCount, // Usar a contagem atualizada
        template: templateData,
        createdAt: createdBroadcast.createdAt!,
        updatedAt: createdBroadcast.updatedAt!
      };
    });
  }
}