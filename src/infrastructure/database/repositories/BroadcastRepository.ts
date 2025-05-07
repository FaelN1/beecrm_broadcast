import { PrismaClient, Broadcast as PrismaBroadcast } from '@prisma/client';
import { Broadcast } from '../../../domain/entities/Broadcast';
import { IBroadcastRepository } from '../../../domain/repositories/IBroadcastRepository';
import { BroadcastStatus } from '../../../domain/valueObjects/BroadcastStatus';
import { ContactStatus } from '../../../domain/valueObjects/ContactStatus';
import { prisma } from '../prisma/PrismaRepository'; // Garante que estamos usando a instância global do Prisma

export class BroadcastRepository implements IBroadcastRepository {
  private prisma: PrismaClient;

  constructor(prismaClient: PrismaClient = prisma) {
    this.prisma = prismaClient;
  }

  async create(broadcast: Broadcast): Promise<Broadcast> {
    const createdBroadcast = await this.prisma.broadcast.create({
      data: {
        name: broadcast.name,
        description: broadcast.description,
        status: broadcast.status,
        channel: broadcast.channel,
        // templateId: broadcast.templateId, // Removido, pois o template é uma relação
        createdAt: broadcast.createdAt,
        updatedAt: broadcast.updatedAt,
        deletedAt: broadcast.deletedAt,
        startDate: broadcast.startDate,
        timezone: broadcast.timezone,
      },
    });
    return this.mapToDomain(createdBroadcast);
  }

  async findById(id: string): Promise<Broadcast | null> {
    const broadcast = await this.prisma.broadcast.findUnique({
      where: { id },
      include: { templates: true } // Inclui templates para ter acesso ao ID do template mais recente se necessário
    });
    return broadcast ? this.mapToDomain(broadcast) : null;
  }

  async findMany(args: any): Promise<Broadcast[]> {
    const broadcasts = await this.prisma.broadcast.findMany({
        ...args,
        include: { templates: true }
    });
    return broadcasts.map(this.mapToDomain);
  }

  async update(broadcast: Broadcast): Promise<Broadcast> {
    if (!broadcast.id) {
      throw new Error('Broadcast ID is required for update');
    }
    const updatedBroadcast = await this.prisma.broadcast.update({
      where: { id: broadcast.id },
      data: {
        name: broadcast.name,
        description: broadcast.description,
        status: broadcast.status,
        channel: broadcast.channel,
        // templateId: broadcast.templateId, // Removido
        updatedAt: new Date(), 
        deletedAt: broadcast.deletedAt,
        startDate: broadcast.startDate,
        timezone: broadcast.timezone,
      },
      include: { templates: true }
    });
    return this.mapToDomain(updatedBroadcast);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.broadcast.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async findAll(): Promise<Broadcast[]> {
    const broadcasts = await this.prisma.broadcast.findMany({ include: { templates: true } });
    return broadcasts.map(this.mapToDomain);
  }

  async getContactsByStatus(broadcastId: string): Promise<Record<string, any[]>> {
    const broadcast = await this.prisma.broadcast.findUnique({
      where: { id: broadcastId }
    });

    if (!broadcast) {
      throw new Error('Campanha não encontrada');
    }

    const broadcastContacts = await this.prisma.broadcastContact.findMany({
      where: { broadcastId },
      include: {
        contact: true
      }
    });

    const contactsByStatus: Record<string, any[]> = {};
    Object.values(ContactStatus).forEach(status => {
      contactsByStatus[status] = [];
    });

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
      if (contactsByStatus[bc.status]) {
        contactsByStatus[bc.status].push(contactData);
      } else {
        contactsByStatus[ContactStatus.PENDING].push(contactData); 
      }
    });

    return contactsByStatus;
  }

  private mapToDomain(prismaBroadcast: PrismaBroadcast & { templates?: any[] }): Broadcast {
    // Ordena os templates por data de criação para pegar o mais recente
    const latestTemplateId = prismaBroadcast.templates && prismaBroadcast.templates.length > 0
      ? prismaBroadcast.templates.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0].id
      : undefined;

    return new Broadcast({
      id: prismaBroadcast.id,
      name: prismaBroadcast.name,
      description: prismaBroadcast.description || undefined,
      status: prismaBroadcast.status,
      channel: prismaBroadcast.channel || '',
      templateId: latestTemplateId, // Usa o ID do template mais recente
      createdAt: prismaBroadcast.createdAt,
      updatedAt: prismaBroadcast.updatedAt,
      deletedAt: prismaBroadcast.deletedAt,
      startDate: prismaBroadcast.startDate,
      timezone: prismaBroadcast.timezone,
    });
  }
}