import { BroadcastStatus } from '../../domain/valueObjects/BroadcastStatus';

export interface CreateBroadcastDTO {
  name: string;
  description?: string;
  contacts: ContactDTO[];
  status?: BroadcastStatus;
  channel?: string;
  template?: TemplateDTO; // Template opcional na criação
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
}

export interface AddContactsToBroadcastDTO {
  broadcastId: string;
  contacts: ContactDTO[];
}