import { PrismaClient } from '@prisma/client';
import { IBroadcastRepository } from '../../../domain/repositories/IBroadcastRepository';
import { AddContactsToBroadcastDTO, ContactDTO } from '../../dtos/BroadcastDTO';
import { prisma } from '../../../infrastructure/database/prisma/PrismaRepository';

export class AddContactsToBroadcastUseCase {
  constructor(
    private broadcastRepository: IBroadcastRepository,
    private prismaClient = prisma
  ) {}

  async execute(data: AddContactsToBroadcastDTO): Promise<{ success: boolean; contactsAdded: number }> {
    // Verificar se o broadcast existe
    const broadcast = await this.broadcastRepository.findById(data.broadcastId);
    if (!broadcast) {
      throw new Error('Campanha não encontrada');
    }

    // Usar transação do Prisma para garantir atomicidade
    return this.prismaClient.$transaction(async (prisma) => {
      let contactsAdded = 0;

      // Para cada contato no DTO
      const contactPromises = data.contacts.map(async (contactDto: ContactDTO) => {
        try {
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

          // Verificar se o contato já está associado à campanha
          const existingRelation = await prisma.broadcastContact.findUnique({
            where: {
              broadcastId_contactId: {
                broadcastId: data.broadcastId,
                contactId: contact.id
              }
            }
          });

          // Se não estiver associado, criar a relação
          if (!existingRelation) {
            await prisma.broadcastContact.create({
              data: {
                broadcastId: data.broadcastId,
                contactId: contact.id,
                displayName: contactDto.displayName || contactDto.name,
                status: 'pending'
              }
            });
            contactsAdded++;
          }
        } catch (error) {
          console.error('Erro ao adicionar contato:', error);
          // Continuamos com os próximos contatos mesmo se houver erro em um deles
        }
      });

      // Aguardar todas as operações de contato serem concluídas
      await Promise.all(contactPromises);

      return {
        success: true,
        contactsAdded
      };
    });
  }
}
