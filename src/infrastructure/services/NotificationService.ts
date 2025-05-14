// src/infrastructure/services/NotificationService.ts
import axios from 'axios';
import { Server } from 'socket.io';
import { BROADCAST_EVENT_TYPES, BroadcastEventData, BroadcastJobFailedData } from '../../domain/events/BroadcastEvents';

export class NotificationService {
  private io: Server;
  private webhookUrl?: string;

  constructor(io: Server) {
    this.io = io;
    this.webhookUrl = process.env.BROADCAST_WEBHOOK_URL;
    if (this.webhookUrl) {
      console.log(`[NotificationService] Webhook URL configurado: ${this.webhookUrl}`);
    } else {
      console.log('[NotificationService] Webhook URL não configurado. Notificações HTTP não serão enviadas.');
    }
  }

  private async sendWebhook(event: string, data: BroadcastEventData | BroadcastJobFailedData): Promise<void> {
    if (!this.webhookUrl) {
        console.warn('[NotificationService] Webhook URL não configurado. Ignorando envio de webhook.');
      return;
    }

    try {
      console.log(`[NotificationService] Enviando webhook para ${this.webhookUrl} - Evento: ${event}`);
      await axios.post(this.webhookUrl, {
        event,
        data,
      }, {
        headers: {
          'Content-Type': 'application/json',
          // Poderia adicionar um token de autenticação aqui se necessário
          // 'Authorization': `Bearer ${process.env.WEBHOOK_TOKEN}`
        },
        timeout: 5000, // Timeout de 5 segundos
      });
      console.log(`[NotificationService] Webhook enviado com sucesso para o evento ${event}`);
    } catch (error: any) {
      console.error(`[NotificationService] Erro ao enviar webhook para ${this.webhookUrl}:`, error.message);
      if (error.response) {
        console.error('[NotificationService] Detalhes do erro do webhook:', error.response.data);
      }
    }
  }

  public notifyBroadcastEvent(event: string, data: BroadcastEventData): void {
    const room = `broadcast:${data.broadcastId}`;
    console.log(`[NotificationService] Emitindo evento websocket '${event}' para a sala ${room}`);
    this.io.to(room).emit(event, data);
    
    // Enviar também para um canal geral de admin, se necessário
    this.io.to('admin-notifications').emit(event, data);

    this.sendWebhook(event, data).catch(err => console.error('[NotificationService] Erro não tratado ao enviar webhook no notifyBroadcastEvent:', err));
  }

  // Método específico para falhas de job, que pode ter dados adicionais
  public notifyBroadcastJobFailed(data: BroadcastJobFailedData): void {
    const event = BROADCAST_EVENT_TYPES.FAILED; // Ou um tipo de evento mais específico para job
    const room = `broadcast:${data.broadcastId}`;
    console.log(`[NotificationService] Emitindo evento de falha de job '${event}' para a sala ${room}`);
    this.io.to(room).emit(event, data);
    this.io.to('admin-notifications').emit(event, data);

    this.sendWebhook(event, data).catch(err => console.error('[NotificationService] Erro não tratado ao enviar webhook no notifyBroadcastJobFailed:', err));
  }

  // Método genérico para atualizar status, pode ser usado por vários casos de uso
  public async updateBroadcastStatus(
    broadcastId: string,
    status: string, // Usar BroadcastStatus enum aqui seria ideal
    details?: any
  ): Promise<void> {
    const eventData: BroadcastEventData = {
      broadcastId,
      status,
      timestamp: new Date(),
      details,
    };
    this.notifyBroadcastEvent(BROADCAST_EVENT_TYPES.STATUS_UPDATE, eventData);
    
    // Lógica adicional se o status for "STARTED", "COMPLETED", "FAILED"
    if (status === 'IN_PROGRESS') { // Mapear para o seu enum BroadcastStatus.IN_PROGRESS
      this.notifyBroadcastEvent(BROADCAST_EVENT_TYPES.STARTED, eventData);
    } else if (status === 'COMPLETED') { // Mapear para BroadcastStatus.COMPLETED
      this.notifyBroadcastEvent(BROADCAST_EVENT_TYPES.COMPLETED, eventData);
    } else if (status === 'FAILED') { // Mapear para BroadcastStatus.FAILED
       this.notifyBroadcastEvent(BROADCAST_EVENT_TYPES.FAILED, eventData);
    }
  }
}

// Exemplo de como obter a instância do io e criar o NotificationService
// Isso normalmente seria feito no seu arquivo principal (index.ts)
// import { io } from '../../index'; // Supondo que io seja exportado de lá
// export const notificationService = new NotificationService(io);
