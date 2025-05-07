import { BroadcastStatus } from '../valueObjects/BroadcastStatus';

export interface BroadcastProps {
  id?: string;
  name: string;
  description?: string;
  status: string; // Usar BroadcastStatus
  channel: string; // Ex: "whatsapp", "sms", "email"
  contactsCount?: number;
  templateId?: string;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date | null;
  startDate?: Date | null; // Data de início agendada (UTC)
  timezone?: string | null;  // Timezone original para startDate
}

export class Broadcast {
  id?: string;
  name: string;
  description?: string;
  status: string;
  channel: string;
  contactsCount?: number;
  templateId?: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  startDate: Date | null;
  timezone: string | null;

  constructor(props: BroadcastProps) {
    this.id = props.id;
    this.name = props.name;
    this.description = props.description;
    this.status = props.status || BroadcastStatus.DRAFT;
    this.channel = props.channel;
    this.contactsCount = props.contactsCount || 0;
    this.templateId = props.templateId;
    this.createdAt = props.createdAt || new Date();
    this.updatedAt = props.updatedAt || new Date();
    this.deletedAt = props.deletedAt || null;
    this.startDate = props.startDate || null;
    this.timezone = props.timezone || null;
  }
}