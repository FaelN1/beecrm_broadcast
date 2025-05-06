import { ITemplateRepository } from '../../../domain/repositories/ITemplateRepository';
import { ProcessTemplateDTO, ProcessedTemplateResponseDTO } from '../../dtos/TemplateDTO';

export class ProcessTemplateUseCase {
  constructor(
    private templateRepository: ITemplateRepository
  ) {}

  async execute(data: ProcessTemplateDTO): Promise<ProcessedTemplateResponseDTO> {
    // Buscar o template
    const template = await this.templateRepository.findById(data.templateId);
    if (!template) {
      throw new Error('Template não encontrado');
    }

    // Validar se todas as variáveis necessárias foram fornecidas
    const validation = template.validateVariables(data.variables);

    // Processar o template com as variáveis fornecidas
    const processedContent = template.processVariables(data.variables);

    return {
      content: processedContent,
      missingVariables: validation.missing,
      wasFullyProcessed: validation.valid
    };
  }
}
