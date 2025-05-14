import { ContactStatus } from '../../domain/valueObjects/ContactStatus';
import { SendMessageDTO, MessageResponseDTO } from '../../application/dtos/MessageDTO';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../database/prisma/PrismaRepository';
import { BroadcastStatus } from '../../domain/valueObjects/BroadcastStatus';
import axios from 'axios';

export class MessageService {
  private prisma: PrismaClient;
  private apiEndpoint: string;
  private mockMode: boolean;

  constructor(prismaClient = prisma) {
    this.prisma = prismaClient;
    
    // Obter endpoint da variável de ambiente
    this.apiEndpoint = process.env.MESSAGE_API_ENDPOINT || 'http://localhost:8080/api/messages';
    
    // Verificar se devemos usar modo de simulação
    this.mockMode = process.env.MOCK_MESSAGE_API === 'true';
    
    // Log do endpoint para diagnóstico
    console.log(`MessageService utilizando endpoint: ${this.apiEndpoint} (Modo de simulação: ${this.mockMode ? 'Ativado' : 'Desativado'})`);
  }

  async send(data: SendMessageDTO): Promise<MessageResponseDTO> {
    try {
      console.log(`Enviando mensagem para ${data.recipient}`);
      
      // Verificar se a campanha está ativa antes de enviar
      const broadcast = await this.prisma.broadcast.findUnique({
        where: { id: data.broadcastId }
      });
      
      if (!broadcast) {
        throw new Error('Broadcast não encontrado');
      }
      
      if (broadcast.status === BroadcastStatus.PAUSED) {
        throw new Error('Campanha está pausada');
      }
      
      if (broadcast.status === BroadcastStatus.CANCELED) {
        throw new Error('Campanha foi cancelada');
      }
      
      let response;
      // Se estiver no modo de simulação, não envia realmente para a API
      if (this.mockMode) {
        console.log(`[SIMULAÇÃO] Simulando envio de mensagem para ${data.recipient}`);
        response = {
          data: {
            id: `mock_msg_${Date.now()}`,
            status: 'sent',
            message: 'Mensagem simulada com sucesso'
          },
          status: 200,
          statusText: 'OK'
        };
      } else {
        // Enviar para o serviço externo
        try {
          // Determinar se deve usar a API de templates
          const isTemplate = data.metadata?.messageType === 'template' || 
                             (!data.metadata?.messageType && !data.metadata?.mediaUrl);

          if (isTemplate) {
            // Usar a nova API de templates
            const channel = broadcast.channel || 'whatsapp';
            const templateEndpoint = `https://diogenes.beecrm.io/message/sendTemplate/${channel}`;
            
            // Preparar payload para a API de templates
            const templatePayload = {
              number: data.recipient,
              name: data.metadata?.templateName || "hello_world",
              language: data.metadata?.languageCode || "en_US",
              components: this.buildTemplateComponents(data)
            };
            
            console.log(`Enviando template para ${templateEndpoint}`);
            console.log(`Template payload: ${JSON.stringify(templatePayload, null, 2)}`);
            
            response = await axios.post(templateEndpoint, templatePayload, {
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.MESSAGE_API_TOKEN || 'default-token'}`
              },
              timeout: 10000 // 10 segundos de timeout
            });
            
            console.log(`Template enviado com sucesso para ${data.recipient}, resposta:`, 
              response.status, response.statusText);
          } else {
            // Usar a API padrão para outros tipos de mensagem
            const payload = this.formatPayload(data);
            
            console.log(`Enviando requisição para ${this.apiEndpoint}`);
            console.log(`Payload: ${JSON.stringify(payload, null, 2)}`);
            
            response = await axios.post(this.apiEndpoint, payload, {
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.MESSAGE_API_TOKEN || 'default-token'}`
              },
              timeout: 10000 // 10 segundos de timeout
            });
            
            console.log(`Mensagem enviada com sucesso para ${data.recipient}, resposta:`, 
              response.status, response.statusText);
          }
        } catch (apiError: any) {
          console.error(`Falha ao enviar para API externa: ${apiError.message}`);
          if (apiError.response) {
            console.error(`Status: ${apiError.response.status}`, apiError.response.data);
          } else if (apiError.request) {
            console.error(`Sem resposta recebida - possível problema de conectividade`);
          } else {
            console.error(`Erro na configuração da requisição:`, apiError.message);
          }
          
          if (this.mockMode) {
            // Em modo de simulação, ignorar erro e seguir com resposta simulada
            console.log('[SIMULAÇÃO] Usando resposta simulada devido a erro na API');
            response = {
              data: {
                id: `mock_msg_${Date.now()}`,
                status: 'sent',
                message: 'Mensagem simulada (após falha na API)'
              },
              status: 200,
              statusText: 'OK'
            };
          } else {
            throw new Error(`Falha na API de mensagens: ${apiError.message}`);
          }
        }
      }
      
      // Atualizar o status do contato na campanha
      await this.prisma.broadcastContact.update({
        where: {
          broadcastId_contactId: {
            broadcastId: data.broadcastId,
            contactId: data.contactId
          }
        },
        data: {
          status: ContactStatus.SENT
        }
      });
      
      // Extrair o ID da mensagem da resposta ou gerar um
      const messageId = response?.data?.id || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      return {
        id: messageId,
        content: data.content,
        status: ContactStatus.SENT,
        recipient: data.recipient,
        recipientName: data.recipientName,
        broadcastId: data.broadcastId,
        contactId: data.contactId,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {
          ...data.metadata,
          apiResponse: response?.data
        }
      };
    } catch (error: any) {
      console.error('Erro ao enviar mensagem:', error);
      
      // Em caso de falha, atualizar o status do contato
      try {
        await this.prisma.broadcastContact.update({
          where: {
            broadcastId_contactId: {
              broadcastId: data.broadcastId,
              contactId: data.contactId
            }
          },
          data: {
            status: ContactStatus.FAILED
          }
        });
      } catch (updateError) {
        console.error('Erro ao atualizar status do contato:', updateError);
      }
      
      throw error;
    } finally {
      // Reduzir o delay para não atrasar tanto o processamento da fila
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  /**
   * Constrói os componentes para o payload da API de templates
   */
  private buildTemplateComponents(data: SendMessageDTO): Array<any> {
    const components = [];
    
    // Componente de texto (corpo)
    const bodyParams = [];
    
    // Adicionar nome do recipient como primeiro parâmetro se disponível
    if (data.recipientName) {
      bodyParams.push({
        type: "text",
        text: data.recipientName
      });
    }
    
    // Adicionar parâmetros de texto adicionais se disponíveis
    if (data.metadata?.parameters?.text && Array.isArray(data.metadata.parameters.text)) {
      bodyParams.push(...data.metadata.parameters.text);
    }
    
    // Se não houver parâmetros especificados, usar o conteúdo como parâmetro
    if (bodyParams.length === 0 && data.content) {
      bodyParams.push({
        type: "text",
        text: data.content
      });
    }
    
    // Adicionar corpo se tiver parâmetros
    if (bodyParams.length > 0) {
      components.push({
        type: "body",
        parameters: bodyParams
      });
    }
    
    // Componente de botões
    if (data.metadata?.parameters?.buttons && Array.isArray(data.metadata.parameters.buttons)) {
      data.metadata.parameters.buttons.forEach((button, index) => {
        if (button.sub_type === 'URL' || button.type === 'url') {
          components.push({
            type: "button",
            sub_type: "URL",
            index: `${index + 1}`,
            parameters: [
              {
                type: "text",
                text: button.text || button.url || ""
              }
            ]
          });
        }
      });
    }
    
    return components;
  }
  
  /**
   * Formata o payload apropriado baseado no tipo de conteúdo
   */
  private formatPayload(data: SendMessageDTO): any {
    // Verificar se há metadados específicos para determinar o tipo de mensagem
    if (data.metadata?.messageType) {
      switch (data.metadata.messageType) {
        case 'template':
          return this.formatWhatsAppTemplatePayload(data);
        case 'image':
          return this.formatMediaMessagePayload(data, 'image');
        case 'document':
        case 'file':
          return this.formatMediaMessagePayload(data, 'document');
        case 'video':
          return this.formatMediaMessagePayload(data, 'video');
        case 'audio':
          return this.formatMediaMessagePayload(data, 'audio');
        case 'location':
          return this.formatLocationMessagePayload(data);
        case 'interactive':
          return this.formatInteractiveMessagePayload(data);
        default:
          return this.formatTextMessagePayload(data);
      }
    }

    // Se não tiver tipo específico, verificar o conteúdo para tentar determinar
    if (data.metadata?.mediaUrl) {
      // Se tem URL de mídia, determina o tipo pelo mimetype ou extensão
      const mediaType = this.detectMediaTypeFromUrl(data.metadata.mediaUrl);
      return this.formatMediaMessagePayload(data, mediaType);
    }

    // Se não conseguir determinar, usa o formato de template padrão
    return this.formatWhatsAppTemplatePayload(data);
  }
  
  /**
   * Detecta o tipo de mídia baseado na URL ou mimetype
   */
  private detectMediaTypeFromUrl(url: string): 'image' | 'document' | 'video' | 'audio' {
    if (!url) return 'document'; // Tipo padrão
    
    const extension = url.split('.').pop()?.toLowerCase();
    
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension || '')) {
      return 'image';
    } else if (['mp4', 'mov', 'avi', 'webm'].includes(extension || '')) {
      return 'video';
    } else if (['mp3', 'wav', 'ogg'].includes(extension || '')) {
      return 'audio';
    } else {
      return 'document';
    }
  }
  
  /**
   * Formata uma mensagem de texto simples
   */
  private formatTextMessagePayload(data: SendMessageDTO): any {
    return {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: data.recipient,
      type: "text",
      text: {
        preview_url: true,
        body: data.content
      },
      metadata: {
        broadcastId: data.broadcastId,
        contactId: data.contactId,
        ...data.metadata
      }
    };
  }
  
  /**
   * Formata uma mensagem de mídia (imagem, documento, etc)
   */
  private formatMediaMessagePayload(data: SendMessageDTO, mediaType: 'image' | 'document' | 'video' | 'audio'): any {
    const mediaUrl = data.metadata?.mediaUrl;
    
    if (!mediaUrl) {
      // Se não tiver URL de mídia, volta para mensagem de texto
      return this.formatTextMessagePayload(data);
    }
    
    return {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: data.recipient,
      type: mediaType,
      [mediaType]: {
        link: mediaUrl,
        caption: data.content || '',
        filename: data.metadata?.filename || `file-${Date.now()}`
      },
      metadata: {
        broadcastId: data.broadcastId,
        contactId: data.contactId,
        ...data.metadata
      }
    };
  }
  
  /**
   * Formata uma mensagem de localização
   */
  private formatLocationMessagePayload(data: SendMessageDTO): any {
    const { latitude, longitude, name, address } = data.metadata?.location || {};
    
    if (!latitude || !longitude) {
      // Se não tiver coordenadas, volta para mensagem de texto
      return this.formatTextMessagePayload(data);
    }
    
    return {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: data.recipient,
      type: "location",
      location: {
        latitude,
        longitude,
        name: name || '',
        address: address || ''
      },
      metadata: {
        broadcastId: data.broadcastId,
        contactId: data.contactId,
        ...data.metadata
      }
    };
  }
  
  /**
   * Formata uma mensagem interativa (botões, listas)
   */
  private formatInteractiveMessagePayload(data: SendMessageDTO): any {
    const { interactiveType, buttons, listItems } = data.metadata?.interactive || {};
    
    // Se não tiver dados interativos válidos, volta para texto
    if (!interactiveType) {
      return this.formatTextMessagePayload(data);
    }
    
    const interactive: any = {
      type: interactiveType
    };
    
    // Adicionar corpo da mensagem
    if (data.content) {
      interactive.body = {
        text: data.content
      };
    }
    
    // Adicionar cabeçalho se fornecido
    if (data.metadata?.interactive?.header) {
      interactive.header = data.metadata.interactive.header;
    }
    
    // Adicionar rodapé se fornecido
    if (data.metadata?.interactive?.footer) {
      interactive.footer = {
        text: data.metadata.interactive.footer
      };
    }
    
    // Adicionar botões ou itens de lista conforme o tipo
    if (interactiveType === 'button' && buttons && Array.isArray(buttons)) {
      interactive.action = {
        buttons: buttons
      };
    } else if (interactiveType === 'list' && listItems && Array.isArray(listItems)) {
      interactive.action = {
        button: data.metadata?.interactive?.listButton || "Ver opções",
        sections: [
          {
            title: data.metadata?.interactive?.listTitle || "Opções",
            rows: listItems
          }
        ]
      };
    }
    
    return {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: data.recipient,
      type: "interactive",
      interactive,
      metadata: {
        broadcastId: data.broadcastId,
        contactId: data.contactId,
        ...data.metadata
      }
    };
  }
  
  // Renomeado para diferenciar do método genérico
  private formatWhatsAppTemplatePayload(data: SendMessageDTO): any {
    const components = [];
    
    // Componente de texto (corpo)
    const bodyParameters = [];
    
    // Adicionar nome do recipient como primeiro parâmetro se disponível
    if (data.recipientName) {
      bodyParameters.push({
        type: "text",
        text: data.recipientName
      });
    }
    
    // Adicionar parâmetros de texto adicionais se disponíveis
    if (data.metadata?.parameters?.text && Array.isArray(data.metadata.parameters.text)) {
      bodyParameters.push(...data.metadata.parameters.text);
    }
    
    if (bodyParameters.length > 0) {
      components.push({
        type: "body",
        parameters: bodyParameters
      });
    }
    
    // Componente de cabeçalho (header) - suporta texto, imagem, documento, vídeo
    if (data.metadata?.parameters?.header) {
      components.push({
        type: "header",
        parameters: [data.metadata.parameters.header]
      });
    }
    
    // Componente de botões
    if (data.metadata?.parameters?.buttons && Array.isArray(data.metadata.parameters.buttons)) {
      components.push({
        type: "buttons",
        parameters: data.metadata.parameters.buttons
      });
    }
    
    return {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: data.recipient,
      type: "template",
      template: {
        name: data.metadata?.templateName || "default_template",
        language: {
          code: data.metadata?.languageCode || "pt_BR"
        },
        components: components.length > 0 ? components : [
          {
            type: "body",
            parameters: [
              {
                type: "text",
                text: data.content
              }
            ]
          }
        ]
      },
      metadata: {
        broadcastId: data.broadcastId,
        contactId: data.contactId,
        ...data.metadata
      }
    };
  }
  
  // Método para simular mudança de status para entregue
  async simulateDelivered(contactId: string, broadcastId: string): Promise<void> {
    await this.prisma.broadcastContact.update({
      where: {
        broadcastId_contactId: {
          broadcastId,
          contactId
        }
      },
      data: {
        status: ContactStatus.DELIVERED
      }
    });
  }
  
  // Método para simular mudança de status para lido
  async simulateRead(contactId: string, broadcastId: string): Promise<void> {
    await this.prisma.broadcastContact.update({
      where: {
        broadcastId_contactId: {
          broadcastId,
          contactId
        }
      },
      data: {
        status: ContactStatus.READ
      }
    });
  }
}
