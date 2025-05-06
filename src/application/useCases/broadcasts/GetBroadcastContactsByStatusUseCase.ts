import { IBroadcastRepository } from '../../../domain/repositories/IBroadcastRepository';
import { ContactStatus } from '../../../domain/valueObjects/ContactStatus';

export interface ContactsByStatusResponse {
  broadcastId: string;
  statusCounts: {
    [key: string]: number;
  };
  contacts: {
    [key: string]: Array<{
      id: string;
      name: string;
      phone: string;
      displayName: string;
      status: string;
      createdAt: Date;
      updatedAt: Date;
    }>;
  }
}

export class GetBroadcastContactsByStatusUseCase {
  constructor(
    private broadcastRepository: IBroadcastRepository
  ) {}

  async execute(broadcastId: string): Promise<ContactsByStatusResponse> {
    try {
      const contactsByStatus = await this.broadcastRepository.getContactsByStatus(broadcastId);
      
      // Calcular contagens por status
      const statusCounts: Record<string, number> = {};
      
      Object.keys(contactsByStatus).forEach(status => {
        statusCounts[status] = contactsByStatus[status].length;
      });

      return {
        broadcastId,
        statusCounts,
        contacts: contactsByStatus
      };
    } catch (error) {
      throw error;
    }
  }
}
