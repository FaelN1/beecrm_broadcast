import axios from 'axios';

interface CampaignReportPayload {
    event: string;
    link?: string;
    status: number;
}

export class WebhookService {
  constructor() {
    // Configurações podem ser adicionadas aqui se necessário, como timeouts, headers padrão, etc.
  }

  async sendCampaignReportNotification(targetUrl: string, payload: CampaignReportPayload): Promise<void> {
    if (!targetUrl) {
      console.warn('[WebhookService] URL de destino do webhook não fornecida.');
      return;
    }

    console.log(`[WebhookService] Enviando notificação de relatório de campanha para: ${targetUrl}`);
    console.log(`[WebhookService] Payload: ${JSON.stringify(payload)}`);

    try {
      const response = await axios.post(targetUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 10000, // Timeout de 10 segundos
      });

      console.log(`[WebhookService] Webhook enviado com sucesso. Status: ${response.status}`);
    } catch (error: any) {
      let errorMessage = error.message;
      if (error.response) {
        errorMessage = `Status: ${error.response.status}, Data: ${JSON.stringify(error.response.data)}`;
      } else if (error.request) {
        errorMessage = 'Nenhuma resposta recebida do servidor de webhook.';
      }
      console.error(`[WebhookService] Erro ao enviar webhook para ${targetUrl}: ${errorMessage}`);
      // Lançar o erro permite que o chamador decida como lidar com falhas de webhook
      // No GenerateReportUseCase, optamos por não falhar o processo principal.
      throw new Error(`Falha ao enviar webhook: ${errorMessage}`);
    }
  }
}
