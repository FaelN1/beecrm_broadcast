import { Template } from '../../../domain/entities/Template';
import { IBroadcastRepository } from '../../../domain/repositories/IBroadcastRepository';
import { ITemplateRepository } from '../../../domain/repositories/ITemplateRepository';
import { CreateTemplateDTO, TemplateResponseDTO } from '../../dtos/TemplateDTO';

export class CreateTemplateUseCase {
  constructor(
    private templateRepository: ITemplateRepository,
    private broadcastRepository: IBroadcastRepository
  ) {}

  async execute(data: CreateTemplateDTO): Promise<TemplateResponseDTO> {
    // Verifica se o broadcast existe
    const broadcast = await this.broadcastRepository.findById(data.broadcastId);
    if (!broadcast) {
      throw new Error('Campanha não encontrada');
    }

    // Cria o template
    const template = new Template({
      name: data.name,
      content: data.content,
      broadcastId: data.broadcastId
    });

    // Salva no repositório
    const createdTemplate = await this.templateRepository.create(template);

    return {
      id: createdTemplate.id!,
      name: createdTemplate.name,
      content: createdTemplate.content,
      broadcastId: createdTemplate.broadcastId,
      createdAt: createdTemplate.createdAt!,
      updatedAt: createdTemplate.updatedAt!
    };
  }
}
