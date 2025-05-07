// src/application/useCases/broadcasts/GetBroadcastsByChannelUseCase.ts
import { IBroadcastRepository } from '../../../domain/repositories/IBroadcastRepository';
import { BroadcastResponseDTO } from '../../dtos/BroadcastDTO';
import { Broadcast } from '../../../domain/entities/Broadcast';

export class GetBroadcastsByChannelUseCase {
  constructor(private broadcastRepository: IBroadcastRepository) {}

  async execute(channelQuery: string): Promise<BroadcastResponseDTO[]> {
    if (!channelQuery || channelQuery.trim() === '') {
      throw new Error('O parâmetro channel é obrigatório para a busca.');
    }

    const broadcasts = await this.broadcastRepository.findMany({
      where: {
        channel: {
          contains: channelQuery,
          mode: 'insensitive', // Para busca case-insensitive, se suportado e desejado
        },
        deletedAt: null, // Opcional: para não retornar campanhas deletadas (soft delete)
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return broadcasts.map((broadcast: Broadcast) => ({
      id: broadcast.id!,
      name: broadcast.name,
      description: broadcast.description,
      status: broadcast.status,
      channel: broadcast.channel,
      contactsCount: broadcast.contactsCount || 0, // Assumindo que contactsCount pode não estar sempre presente
      template: broadcast.templateId ? { id: broadcast.templateId, name: '', content: '' } : undefined, // Simplificado, idealmente buscaria nome/conteúdo do template
      createdAt: broadcast.createdAt!,
      updatedAt: broadcast.updatedAt!,
      startDate: broadcast.startDate || undefined,
      timezone: broadcast.timezone || undefined,
    }));
  }
}
