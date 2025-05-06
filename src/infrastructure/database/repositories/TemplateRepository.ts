import { PrismaClient } from '@prisma/client';
import { Template, TemplateVariables } from '../../../domain/entities/Template';
import { ITemplateRepository } from '../../../domain/repositories/ITemplateRepository';

export class TemplateRepository implements ITemplateRepository {
  constructor(private prisma: PrismaClient) {}

  async create(template: Template): Promise<Template> {
    const data = await this.prisma.template.create({
      data: {
        name: template.name,
        content: template.content,
        variables: template.variables ? JSON.stringify(template.variables) as any : null,
        broadcastId: template.broadcastId
      }
    });

    return new Template({
      id: data.id,
      name: data.name,
      content: data.content,
      variables: data.variables ? JSON.parse(data.variables as string) as TemplateVariables : undefined,
      broadcastId: data.broadcastId,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    });
  }

  async findById(id: string): Promise<Template | null> {
    const data = await this.prisma.template.findUnique({
      where: { id }
    });

    if (!data) return null;

    return {
      id: data.id,
      name: data.name,
      content: data.content,
      variables: data.variables ? JSON.parse(data.variables as string) as TemplateVariables : undefined,
      broadcastId: data.broadcastId,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    };
  }

  async findByBroadcastId(broadcastId: string): Promise<Template[]> {
    const templates = await this.prisma.template.findMany({
      where: { broadcastId }
    });

    return templates.map(data => ({
      id: data.id,
      name: data.name,
      content: data.content,
      variables: data.variables ? JSON.parse(data.variables as string) as TemplateVariables : undefined,
      broadcastId: data.broadcastId,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    }));
  }

  async update(template: Template): Promise<Template> {
    const data = await this.prisma.template.update({
      where: { id: template.id },
      data: {
        name: template.name,
        content: template.content,
        variables: template.variables ? JSON.stringify(template.variables) : null,
      }
    });

    return {
      id: data.id,
      name: data.name,
      content: data.content,
      variables: data.variables ? JSON.parse(data.variables as string) as TemplateVariables : undefined,
      broadcastId: data.broadcastId,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    };
  }

  async delete(id: string): Promise<void> {
    await this.prisma.template.delete({
      where: { id }
    });
  }
}
