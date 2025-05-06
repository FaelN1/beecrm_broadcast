import { Template } from '../entities/Template';

export interface ITemplateRepository {
  create(template: Template): Promise<Template>;
  findById(id: string): Promise<Template | null>;
  findByBroadcastId(broadcastId: string): Promise<Template[]>;
  update(template: Template): Promise<Template>;
  delete(id: string): Promise<void>;
}
