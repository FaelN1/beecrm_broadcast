import { Broadcast } from '../entities/Broadcast';

export interface IBroadcastRepository {
  create(broadcast: Broadcast): Promise<Broadcast>;
  findById(id: string): Promise<Broadcast | null>;
  findMany(args: any): Promise<Broadcast[]>; // Adicionada a assinatura do findMany
  update(broadcast: Broadcast): Promise<Broadcast>;
  delete(id: string): Promise<void>;
  findAll(): Promise<Broadcast[]>;
  getContactsByStatus(broadcastId: string): Promise<Record<string, any[]>>;
}