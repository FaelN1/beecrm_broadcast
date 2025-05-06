import { PrismaClient } from '@prisma/client';
import { Broadcast } from '../../../domain/entities/Broadcast';
import { IBroadcastRepository } from '../../../domain/repositories/IBroadcastRepository';
import { BroadcastStatus } from '../../../domain/valueObjects/BroadcastStatus';
import { ContactStatus } from '../../../domain/valueObjects/ContactStatus';

export class BroadcastRepository implements IBroadcastRepository {
  constructor(private prisma: PrismaClient) {}

  async create(broadcast: Broadcast): Promise<Broadcast> {
    const data = await this.prisma.broadcast.create({
      data: {
        name: broadcast.name,
        description: broadcast.description,
        status: broadcast.status,
        channel: broadcast.channel
      }
    });

    return {
      id: data.id,
      name: data.name,
      description: data.description || undefined,
      status: data.status as BroadcastStatus,
      channel: data.channel || undefined,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    };
  }

  async findById(id: string): Promise<Broadcast | null> {
    const data = await this.prisma.broadcast.findUnique({
      where: { id }
    });

    if (!data) return null;

    return {
      id: data.id,
      name: data.name,
      description: data.description ?? undefined,
      status: data.status as BroadcastStatus,
      channel: data.channel ?? undefined,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    };
  }

  async update(broadcast: Broadcast): Promise<Broadcast> {
    const data = await this.prisma.broadcast.update({
      where: { id: broadcast.id },
      data: {
        name: broadcast.name,
        description: broadcast.description,
        status: broadcast.status,
        channel: broadcast.channel
      }
    });

    return {
      id: data.id,
      name: data.name,
      description: data.description ?? undefined,
      status: data.status as BroadcastStatus,
      channel: data.channel ?? undefined,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    };
  }

  async delete(id: string): Promise<void> {
    await this.prisma.broadcast.delete({
      where: { id }
    });
  }

  async findAll(): Promise<Broadcast[]> {
    const broadcasts = await this.prisma.broadcast.findMany();
    
    return broadcasts.map(data => ({
      id: data.id,
      name: data.name,
      description: data.description ?? undefined,
      status: data.status as BroadcastStatus,
      channel: data.channel ?? undefined,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    }));
  }

  async getContactsByStatus(broadcastId: string): Promise<Record<string, any[]>> {
    // Verificar se o broadcast existe
    const broadcast = await this.prisma.broadcast.findUnique({
      where: { id: broadcastId }
    });

    if (!broadcast) {
      throw new Error('Campanha não encontrada');
    }

    // Buscar todos os contatos associados ao broadcast
    const broadcastContacts = await this.prisma.broadcastContact.findMany({
      where: { broadcastId },
      include: {
        contact: true
      }
    });

    // Organizar contatos por status
    const contactsByStatus: Record<string, any[]> = {
      [ContactStatus.PENDING]: [],
      [ContactStatus.SENT]: [],
      [ContactStatus.DELIVERED]: [],
      [ContactStatus.READ]: [],
      [ContactStatus.FAILED]: []
    };

    broadcastContacts.forEach(bc => {
      const contactData = {
        id: bc.contact.id,
        name: bc.contact.name,
        phone: bc.contact.phone,
        displayName: bc.displayName || bc.contact.name,
        status: bc.status,
        createdAt: bc.createdAt,
        updatedAt: bc.updatedAt
      };

      // Adicionar o contato ao array correspondente ao seu status
      if (contactsByStatus[bc.status]) {
        contactsByStatus[bc.status].push(contactData);
      } else {
        // Se o status não for um dos predefinidos, colocamos em 'pending'
        contactsByStatus[ContactStatus.PENDING].push(contactData);
      }
    });

    return contactsByStatus;
  }
}