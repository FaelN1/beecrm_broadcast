import { BroadcastStatus } from '../valueObjects/BroadcastStatus';

export class Broadcast {
  id?: string;
  name: string;
  description?: string;
  status: BroadcastStatus;
  channel?: string;
  createdAt?: Date;
  updatedAt?: Date;

  constructor(props: {
    id?: string;
    name: string;
    description?: string;
    status?: BroadcastStatus;
    channel?: string;
    createdAt?: Date;
    updatedAt?: Date;
  }) {
    this.id = props.id;
    this.name = props.name;
    this.description = props.description;
    this.status = props.status || BroadcastStatus.DRAFT;
    this.channel = props.channel;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}