import { TemplateVariables } from '../../domain/entities/Template';

export interface CreateTemplateDTO {
  name: string;
  content: string;
  variables?: TemplateVariables;
  broadcastId: string;
}

export interface TemplateResponseDTO {
  id: string;
  name: string;
  content: string;
  variables?: TemplateVariables;
  broadcastId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateTemplateDTO {
  id: string;
  name?: string;
  content?: string;
  variables?: TemplateVariables;
}

export interface ProcessTemplateDTO {
  templateId: string;
  variables: Record<string, any>;
}

export interface ProcessedTemplateResponseDTO {
  content: string;
  missingVariables: string[];
  wasFullyProcessed: boolean;
}
