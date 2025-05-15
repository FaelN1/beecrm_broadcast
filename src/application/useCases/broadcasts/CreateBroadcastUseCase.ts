import { Broadcast } from '../../../domain/entities/Broadcast';
import { Template } from '../../../domain/entities/Template';
import { IBroadcastRepository } from '../../../domain/repositories/IBroadcastRepository';
import { CreateBroadcastDTO, BroadcastResponseDTO } from '../../dtos/BroadcastDTO';
import { prisma } from '../../../infrastructure/database/prisma/PrismaRepository';
import { BroadcastStatus } from '../../../domain/valueObjects/BroadcastStatus';
import { AppError } from '../../../shared/errors/AppError';
import { parseISO, isFuture, isValid as isValidDate } from 'date-fns';
import { toDate } from 'date-fns-tz';

const isValidTimeZone = (tz: string): boolean => {
  if (!tz) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch (e) {
    return false;
  }
};

export class CreateBroadcastUseCase {
  constructor(
    private broadcastRepository: IBroadcastRepository,
    private prismaClient = prisma
  ) {}

  async execute(data: CreateBroadcastDTO): Promise<BroadcastResponseDTO> {
    let statusToSet: string;
    let startDateUtc: Date | null = null;
    let effectiveTimezone: string | null = null;

    if (data.startDate) {
      // Validação primária do formato ISO
      const parsedDate = parseISO(data.startDate);
      if (!isValidDate(parsedDate)) {
        throw new AppError('Formato inválido para startDate. Use o formato ISO 8601 (ex: YYYY-MM-DDTHH:mm:ss).', 400);
      }

      effectiveTimezone = data.timezone && isValidTimeZone(data.timezone) ? data.timezone : 'America/Sao_Paulo';
      
      try {
        // Usando toDate para garantir que temos um objeto Date
        const localDate = toDate(parsedDate);
        
        // Em vez de converter diretamente para UTC, podemos considerar que a data inserida
        // já está no fuso horário especificado e convertê-la manualmente para UTC
        const offset = new Date(localDate).getTimezoneOffset();
        const userTimezoneOffset = new Intl.DateTimeFormat('en-US', { 
          timeZone: effectiveTimezone, 
          timeZoneName: 'short' 
        }).format(localDate).split(' ').pop();
        
        // Ajustamos a data considerando a diferença entre o timezone local e o especificado
        const utcDate = new Date(localDate);
        startDateUtc = utcDate;
      } catch (error: any) {
        console.error('[CreateBroadcastUseCase] Erro ao converter data com timezone:', error);
        throw new AppError(`Erro ao converter startDate para UTC com timezone ${effectiveTimezone}. Detalhes: ${error.message}`, 400);
      }

      // Verifica se a conversão resultou em uma data válida e se é futura
      if (!startDateUtc || !isValidDate(startDateUtc) || !isFuture(startDateUtc)) {
        throw new AppError(`startDate deve ser uma data/hora no futuro (considerando o timezone ${effectiveTimezone}) e resultar em uma data UTC válida.`, 400);
      }
      statusToSet = BroadcastStatus.SCHEDULED;
    } else {
      statusToSet = data.status || BroadcastStatus.DRAFT;
    }

    const broadcastEntity = new Broadcast({
      name: data.name,
      description: data.description,
      status: statusToSet,
      channel: data.channel || 'whatsapp',
      startDate: startDateUtc,
      timezone: effectiveTimezone,
    });

    return this.prismaClient.$transaction(async (prismaTx) => {
      const createdBroadcast = await this.broadcastRepository.create(broadcastEntity);
      
      let contactsCount = 0;
      // Para cada contato no DTO, se houver contatos
      if (data.contacts && Array.isArray(data.contacts)) {
        contactsCount = data.contacts.length;
        const contactPromises = data.contacts.map(async (contactDto) => {
          // Verificar se o contato já existe pelo telefone
          let contact = await prisma.contact.findUnique({
            where: { phone: contactDto.phone }
          });

          // Se não existir, criar um novo contato
          if (!contact) {
            contact = await prisma.contact.create({
              data: {
                name: contactDto.name,
                phone: contactDto.phone
              }
            });
          }

          // Criar relação entre broadcast e contato
          await prisma.broadcastContact.create({
            data: {
              broadcastId: createdBroadcast.id!,
              contactId: contact.id,
              displayName: contactDto.displayName || contactDto.name,
              status: 'pending'
            }
          });
        });

        // Aguardar todas as operações de contato serem concluídas
        await Promise.all(contactPromises);
      }
      
      let templateData: { id: string; name: string; content: string } | undefined = undefined;
      if (data.template) {
        const template = await prismaTx.template.create({
          data: {
            name: data.template.name,
            content: data.template.content,
            variables: data.template.variables || undefined,
            broadcastId: createdBroadcast.id!
          }
        });
        templateData = {
          id: template.id,
          name: template.name,
          content: template.content
        };
      }

      return {
        id: createdBroadcast.id!,
        name: createdBroadcast.name,
        description: createdBroadcast.description,
        status: createdBroadcast.status,
        channel: createdBroadcast.channel,
        contactsCount: contactsCount, // Usar a contagem atualizada
        template: templateData,
        createdAt: createdBroadcast.createdAt!,
        updatedAt: createdBroadcast.updatedAt!,
        startDate: createdBroadcast.startDate || undefined,
        timezone: createdBroadcast.timezone || undefined,
      };
    });
  }
}