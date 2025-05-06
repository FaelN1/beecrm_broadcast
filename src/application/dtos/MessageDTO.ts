import { ContactStatus } from '../../domain/valueObjects/ContactStatus';

export interface SendMessageDTO {
  content: string;
  recipient: string;
  recipientName?: string;
  broadcastId: string;
  contactId: string;
  templateId?: string;
  metadata?: {
    // Tipo de mensagem: template, text, image, document, video, audio, location, interactive
    messageType?: string;
    // Nome do template para mensagens de template
    templateName?: string;
    // Código de linguagem para templates
    languageCode?: string;
    // URL de mídia para mensagens com mídia
    mediaUrl?: string;
    // Nome do arquivo para mídia
    filename?: string;
    // Dados de localização
    location?: {
      latitude: number;
      longitude: number;
      name?: string;
      address?: string;
    };
    // Configurações para mensagens interativas
    interactive?: {
      interactiveType: 'button' | 'list' | 'product' | 'product_list';
      header?: any;
      footer?: string;
      buttons?: Array<{id: string, title: string}>;
      listTitle?: string;
      listButton?: string;
      listItems?: Array<{id: string, title: string, description?: string}>;
    };
    // Parâmetros para templates  
    parameters?: {
      text?: Array<{type: string, text: string}>;
      header?: {
        type: 'text' | 'image' | 'document' | 'video',
        [key: string]: any
      };
      buttons?: Array<any>;
    };
    // Outros metadados
    [key: string]: any;
  };
}

export interface MessageResponseDTO {
  id: string;
  content: string;
  status: ContactStatus;
  recipient: string;
  recipientName?: string;
  broadcastId: string;
  contactId: string;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
}

export interface BulkSendMessagesDTO {
  broadcastId: string;
  templateId?: string;
  variables?: Record<string, any>;
  filter?: {
    status?: ContactStatus[];
    contactIds?: string[];
  };
}

export interface BulkSendMessagesResponseDTO {
  broadcastId: string;
  messagesQueued: number;
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
}

export interface MessageJobData {
  broadcastId: string;
  contactId: string; 
  content: string;
  recipient: string;
  recipientName?: string;
  templateId?: string;
  variables?: Record<string, any>;
  __pauseState?: {
    paused: boolean;
    originalJobId: string;
    pausedAt: string;
    originalState: string;
  };
}
