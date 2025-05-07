import { BroadcastStatus } from '../../domain/valueObjects/BroadcastStatus';

export interface CreateBroadcastDTO {
  name: string;
  description?: string;
  contacts: ContactDTO[];
  status?: BroadcastStatus;
  channel?: string;
  template?: TemplateDTO; // Template opcional na criação
  startDate?: string; // ISO 8601 date string
  timezone?: string;  // IANA Time Zone
}

export interface ContactDTO {
  id?: string;
  name: string;
  phone: string;
  displayName?: string;
}

export interface TemplateDTO {
  name: string;
  content: string;
  variables?: any;
}

export interface BroadcastResponseDTO {
  id: string;
  name: string;
  description?: string;
  status: string;
  channel?: string;
  contactsCount: number;
  template?: {
    id: string;
    name: string;
    content: string;
  };
  createdAt: Date;
  updatedAt: Date;
  startDate?: Date; // Adicionado para resposta
  timezone?: string; // Adicionado para resposta
}

export interface AddContactsToBroadcastDTO {
  broadcastId: string;
  contacts: ContactDTO[];
}