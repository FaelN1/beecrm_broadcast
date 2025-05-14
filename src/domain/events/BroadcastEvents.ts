// src/domain/events/BroadcastEvents.ts
export const BROADCAST_EVENT_TYPES = {
  STARTED: 'broadcast:started',
  COMPLETED: 'broadcast:completed',
  FAILED: 'broadcast:failed', // Pode ser usado para falha de job ou falha geral da campanha
  STATUS_UPDATE: 'broadcast:statusUpdate',
};

export interface BroadcastEventData {
  broadcastId: string;
  name?: string;
  status: string; // e.g., IN_PROGRESS, COMPLETED, FAILED
  timestamp: Date;
  details?: any;
}

export interface BroadcastJobFailedData extends BroadcastEventData {
  jobId?: string | number;
  error?: string;
}
