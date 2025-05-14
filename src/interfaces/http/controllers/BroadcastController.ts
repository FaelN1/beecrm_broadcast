import { Request, Response } from 'express';
import { CreateBroadcastUseCase } from '../../../application/useCases/broadcasts/CreateBroadcastUseCase';
import { AddContactsToBroadcastUseCase } from '../../../application/useCases/broadcasts/AddContactsToBroadcastUseCase';
import { prisma } from '../../../infrastructure/database/prisma/PrismaRepository';
import { BroadcastRepository } from '../../../infrastructure/database/repositories/BroadcastRepository';
import { TemplateRepository } from '../../../infrastructure/database/repositories/TemplateRepository';
import { CreateTemplateUseCase } from '../../../application/useCases/templates/CreateTemplateUseCase';
import { ProcessTemplateUseCase } from '../../../application/useCases/templates/ProcessTemplateUseCase';
import { GetBroadcastContactsByStatusUseCase } from '../../../application/useCases/broadcasts/GetBroadcastContactsByStatusUseCase';
import { StartBroadcastUseCase } from '../../../application/useCases/broadcasts/StartBroadcastUseCase';
import { PauseBroadcastUseCase } from '../../../application/useCases/broadcasts/PauseBroadcastUseCase';
import { RestartBroadcastUseCase } from '../../../application/useCases/broadcasts/RestartBroadcastUseCase';
import { DeleteBroadcastUseCase } from '../../../application/useCases/broadcasts/DeleteBroadcastUseCase';
import { BullQueueProvider } from '../../../infrastructure/queue/BullQueueProvider';
import { queueProvider } from '../routes/messageRoutes';
import { GetBroadcastsByChannelUseCase } from '../../../application/useCases/broadcasts/GetBroadcastsByChannelUseCase';

export class BroadcastController {
  // Utilizamos o queueProvider compartilhado do aplicativo
  private queueProvider: BullQueueProvider;
  
  constructor() {
    this.queueProvider = queueProvider;
  }

  async create(req: Request, res: Response): Promise<Response> {
    try {
      const { name, description, contacts, channel, template, startDate, timezone } = req.body; // Adicionar startDate e timezone
      
      if (!name) {
        return res.status(400).json({ 
          error: 'Nome da campanha é obrigatório' 
        });
      }
      
      // Validar cada contato se a lista de contatos for fornecida
      if (contacts && Array.isArray(contacts)) {
        for (const contact of contacts) {
          if (!contact.name || !contact.phone) {
            return res.status(400).json({ 
              error: 'Cada contato deve ter nome e telefone' 
            });
          }
        }
      } else if (contacts !== undefined && !Array.isArray(contacts)) {
        // Se 'contacts' for fornecido mas não for um array
        return res.status(400).json({
          error: 'A lista de contatos, se fornecida, deve ser um array'
        });
      }
      
      // Validar template se fornecido
      if (template && (!template.name || !template.content)) {
        return res.status(400).json({
          error: 'Template deve ter nome e conteúdo'
        });
      }

      const broadcastRepository = new BroadcastRepository(prisma);
      const createBroadcastUseCase = new CreateBroadcastUseCase(
        broadcastRepository,
        prisma
      );

      const broadcast = await createBroadcastUseCase.execute({
        name,
        description,
        channel,
        contacts,
        template,
        startDate, // Repassar startDate
        timezone   // Repassar timezone
      });

      return res.status(201).json(broadcast);
    } catch (error) {
      console.error('Erro ao criar broadcast:', error);
      return res.status(500).json({ 
        error: 'Erro ao criar a campanha de broadcast' 
      });
    }
  }

  async addContacts(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      const { contacts } = req.body;
      
      if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
        return res.status(400).json({ 
          error: 'Lista de contatos é obrigatória' 
        });
      }
      
      // Validar cada contato
      for (const contact of contacts) {
        if (!contact.name || !contact.phone) {
          return res.status(400).json({ 
            error: 'Cada contato deve ter nome e telefone' 
          });
        }
      }

      const broadcastRepository = new BroadcastRepository(prisma);
      const addContactsUseCase = new AddContactsToBroadcastUseCase(
        broadcastRepository,
        prisma
      );

      const result = await addContactsUseCase.execute({
        broadcastId: id,
        contacts
      });

      return res.status(200).json({
        message: `${result.contactsAdded} contatos adicionados com sucesso à campanha`,
        ...result
      });
    } catch (error: any) {
      console.error('Erro ao adicionar contatos à campanha:', error);
      
      if (error.message === 'Campanha não encontrada') {
        return res.status(404).json({ error: error.message });
      }
      
      return res.status(500).json({ 
        error: 'Erro ao adicionar contatos à campanha' 
      });
    }
  }

  // Novo método para adicionar template a uma campanha
  async addTemplate(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      const { name, content, variables } = req.body;
      
      if (!name || !content) {
        return res.status(400).json({
          error: 'Nome e conteúdo do template são obrigatórios'
        });
      }
      
      // Validação básica do formato das variáveis
      if (variables) {
        for (const [key, meta] of Object.entries(variables)) {
          if (meta === null || typeof meta !== 'object' || !('type' in meta) || !(meta as any).type) {
            return res.status(400).json({
              error: `Formato inválido para a variável ${key}. Cada variável deve ter pelo menos o campo 'type'`
            });
          }
          
          const validTypes = ['text', 'number', 'date', 'image', 'file', 'url', 'boolean'];
          if (!validTypes.includes((meta as any).type)) {
            return res.status(400).json({
              error: `Tipo '${(meta as any).type}' inválido para a variável ${key}. Tipos válidos: ${validTypes.join(', ')}`
            });
          }
        }
      }

      const broadcastRepository = new BroadcastRepository(prisma);
      const templateRepository = new TemplateRepository(prisma);
      const createTemplateUseCase = new CreateTemplateUseCase(
        templateRepository,
        broadcastRepository
      );

      const template = await createTemplateUseCase.execute({
        name,
        content,
        variables,
        broadcastId: id
      });

      return res.status(201).json(template);
    } catch (error: any) {
      console.error('Erro ao adicionar template à campanha:', error);
      
      if (error.message === 'Campanha não encontrada') {
        return res.status(404).json({ error: error.message });
      }
      
      return res.status(500).json({
        error: 'Erro ao adicionar template à campanha'
      });
    }
  }

  // Novo método para processar um template com variáveis
  async processTemplate(req: Request, res: Response): Promise<Response> {
    try {
      const { templateId } = req.params;
      const { variables } = req.body;
      
      if (!variables || typeof variables !== 'object') {
        return res.status(400).json({
          error: 'Variáveis do template são obrigatórias e devem ser um objeto'
        });
      }

      const templateRepository = new TemplateRepository(prisma);
      const processTemplateUseCase = new ProcessTemplateUseCase(templateRepository);

      const result = await processTemplateUseCase.execute({
        templateId,
        variables
      });

      if (result.missingVariables.length > 0) {
        return res.status(200).json({
          warning: `Algumas variáveis não foram fornecidas: ${result.missingVariables.join(', ')}`,
          ...result
        });
      }

      return res.status(200).json(result);
    } catch (error: any) {
      console.error('Erro ao processar template:', error);
      
      if (error.message === 'Template não encontrado') {
        return res.status(404).json({ error: error.message });
      }
      
      return res.status(500).json({
        error: 'Erro ao processar template'
      });
    }
  }

  // Nova função para obter contatos por status
  async getContactsByStatus(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      
      const broadcastRepository = new BroadcastRepository(prisma);
      const getContactsUseCase = new GetBroadcastContactsByStatusUseCase(broadcastRepository);

      const result = await getContactsUseCase.execute(id);

      return res.status(200).json(result);
    } catch (error: any) {
      console.error('Erro ao obter contatos por status:', error);
      
      if (error.message === 'Campanha não encontrada') {
        return res.status(404).json({ error: error.message });
      }
      
      return res.status(500).json({
        error: 'Erro ao obter contatos da campanha'
      });
    }
  }

  // Novo método para iniciar uma campanha
  async start(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      
      const broadcastRepository = new BroadcastRepository(prisma);
      const startBroadcastUseCase = new StartBroadcastUseCase(
        broadcastRepository,
        this.queueProvider
      );

      const result = await startBroadcastUseCase.execute(id);
      
      if (!result.success) {
        return res.status(400).json({ message: result.message });
      }

      return res.status(200).json({
        message: result.message,
        broadcastId: id
      });
    } catch (error: any) {
      console.error('Erro ao iniciar campanha:', error);
      
      if (error.message === 'Campanha não encontrada') {
        return res.status(404).json({ error: error.message });
      }
      
      return res.status(500).json({
        error: 'Erro ao iniciar campanha'
      });
    }
  }

  // Novo método para pausar uma campanha
  async pause(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      
      const broadcastRepository = new BroadcastRepository(prisma);
      const pauseBroadcastUseCase = new PauseBroadcastUseCase(
        broadcastRepository,
        this.queueProvider
      );

      const result = await pauseBroadcastUseCase.execute(id);
      
      if (!result.success) {
        return res.status(400).json({ message: result.message });
      }

      return res.status(200).json({
        message: result.message,
        broadcastId: id
      });
    } catch (error: any) {
      console.error('Erro ao pausar campanha:', error);
      
      if (error.message === 'Campanha não encontrada') {
        return res.status(404).json({ error: error.message });
      }
      
      return res.status(500).json({
        error: 'Erro ao pausar campanha'
      });
    }
  }

  // Novo método para reiniciar uma campanha
  async restart(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      
      const broadcastRepository = new BroadcastRepository(prisma);
      const restartBroadcastUseCase = new RestartBroadcastUseCase(
        broadcastRepository,
        this.queueProvider
      );

      const result = await restartBroadcastUseCase.execute(id);
      
      if (!result.success) {
        return res.status(400).json({ message: result.message });
      }

      return res.status(200).json({
        message: result.message,
        broadcastId: id
      });
    } catch (error: any) {
      console.error('Erro ao reiniciar campanha:', error);
      
      if (error.message === 'Campanha não encontrada') {
        return res.status(404).json({ error: error.message });
      }
      
      return res.status(500).json({
        error: 'Erro ao reiniciar campanha'
      });
    }
  }

  // Novo método para excluir uma campanha
  async delete(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      const { hardDelete = false } = req.query;
      
      const broadcastRepository = new BroadcastRepository(prisma);
      const deleteBroadcastUseCase = new DeleteBroadcastUseCase(
        broadcastRepository,
        this.queueProvider
      );

      const result = await deleteBroadcastUseCase.execute(
        id, 
        hardDelete === 'true'
      );
      
      if (!result.success) {
        return res.status(400).json({ message: result.message });
      }

      return res.status(200).json({
        message: result.message,
        broadcastId: id
      });
    } catch (error: any) {
      console.error('Erro ao excluir campanha:', error);
      
      if (error.message === 'Campanha não encontrada') {
        return res.status(404).json({ error: error.message });
      }
      
      return res.status(500).json({
        error: 'Erro ao excluir campanha'
      });
    }
  }

  // Novo método para buscar campanhas por canal
  async getBroadcastsByChannel(req: Request, res: Response): Promise<Response> {
    try {
      const { channel } = req.query;

      if (!channel || typeof channel !== 'string') {
        return res.status(400).json({
          error: 'O parâmetro \'channel\' é obrigatório na query string.'
        });
      }

      const broadcastRepository = new BroadcastRepository(prisma);
      const getBroadcastsByChannelUseCase = new GetBroadcastsByChannelUseCase(broadcastRepository);

      const broadcasts = await getBroadcastsByChannelUseCase.execute(channel);

      return res.status(200).json(broadcasts);
    } catch (error: any) {
      console.error('Erro ao buscar campanhas por canal:', error);
      if (error.message.includes('obrigatório para a busca')) {
        return res.status(400).json({ error: error.message });
      }
      return res.status(500).json({
        error: 'Erro ao buscar campanhas por canal'
      });
    }
  }
}