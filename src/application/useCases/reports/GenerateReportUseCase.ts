import { PrismaClient } from '@prisma/client';
import { GenerateReportDTO, ReportResponseDTO } from '../../dtos/ReportDTO';
import { PDFReportGenerator } from '../../../infrastructure/services/PDFReportGenerator';
import { CSVReportGenerator } from '../../../infrastructure/services/CSVReportGenerator';
import { S3StorageProvider } from '../../../infrastructure/storage/S3StorageProvider';
import { BullQueueProvider } from '../../../infrastructure/queue/BullQueueProvider';
import { EmailService } from '../../../infrastructure/services/EmailService';
import { WebhookService } from '../../../infrastructure/services/WebhookService'; // Novo import

export class GenerateReportUseCase {
  private prisma: PrismaClient;
  private storageProvider: S3StorageProvider;
  private pdfReportGenerator: PDFReportGenerator;
  private csvReportGenerator: CSVReportGenerator;
  private emailService: EmailService;
  private webhookService: WebhookService; // Novo serviço
  private queueProvider?: BullQueueProvider;

  constructor(
    prisma: PrismaClient,
    queueProvider?: BullQueueProvider
  ) {
    this.prisma = prisma;
    this.storageProvider = new S3StorageProvider();
    this.pdfReportGenerator = new PDFReportGenerator(prisma);
    this.csvReportGenerator = new CSVReportGenerator(prisma);
    this.emailService = new EmailService();
    this.webhookService = new WebhookService(); // Instanciar novo serviço
    this.queueProvider = queueProvider;
  }

  async execute(data: GenerateReportDTO): Promise<ReportResponseDTO> {
    console.log(`[GenerateReportUseCase] Iniciando geração de relatório: ${JSON.stringify(data)}`);

    // Verificar se o broadcast existe
    const broadcast = await this.prisma.broadcast.findUnique({
      where: { id: data.broadcastId }
    });

    if (!broadcast) {
      console.log(`[GenerateReportUseCase] Campanha não encontrada: ${data.broadcastId}`);
      throw new Error('Campanha não encontrada');
    }

    // Se tiver email no DTO, atualizar o broadcast
    if (data.email && data.email !== broadcast.email) {
      console.log(`[GenerateReportUseCase] Atualizando email da campanha: ${data.email}`);
      await this.prisma.broadcast.update({
        where: { id: data.broadcastId },
        data: { email: data.email }
      });
    }

    // Verificar se já existe um relatório em processamento
    const existingReport = await this.prisma.report.findFirst({
      where: {
        broadcastId: data.broadcastId,
        type: `broadcast_${data.type}`,
        format: data.format,
        status: 'processing'
      }
    });

    // Se encontrou um relatório existente, usamos ele
    const report = existingReport || await this.prisma.report.create({
      data: {
        type: `broadcast_${data.type}`,
        format: data.format,
        status: 'processing',
        broadcastId: data.broadcastId
      }
    });

    console.log(`[GenerateReportUseCase] Relatório registrado: ${report.id}, iniciando processamento`);

    // Para relatórios pequenos, podemos gerar diretamente
    // Para relatórios grandes, seria melhor colocar na fila
    let key = '';

    try {
      if (data.format === 'pdf') {
        console.log(`[GenerateReportUseCase] Gerando relatório PDF: ${data.type}`);
        // Gerar relatório PDF com gráficos
        if (data.type === 'summary') {
          const result = await this.pdfReportGenerator.generateBroadcastReport(data.broadcastId);
          key = result.key;
        } else {
          throw new Error(`Tipo de relatório '${data.type}' não suportado para formato PDF`);
        }
      } else if (data.format === 'csv') {
        console.log(`[GenerateReportUseCase] Gerando relatório CSV: ${data.type}`);
        // Gerar relatório CSV
        if (data.type === 'contacts') {
          const result = await this.csvReportGenerator.generateBroadcastContactsReport(data.broadcastId);
          key = result.key;
        } else {
          throw new Error(`Tipo de relatório '${data.type}' não suportado para formato CSV`);
        }
      } else {
        throw new Error(`Formato de relatório '${data.format}' não suportado`);
      }

      console.log(`[GenerateReportUseCase] Relatório gerado com sucesso: ${report.id}, key=${key}`);

      // Atualizar o relatório com o caminho do arquivo
      const updatedReport = await this.prisma.report.update({
        where: { id: report.id },
        data: {
          filePath: key,
          status: 'completed'
        }
      });

      console.log(`[GenerateReportUseCase] Status do relatório atualizado para 'completed': ${report.id}`);

      // Gerar URL temporária para download com validade de 7 dias
      const downloadUrl = this.storageProvider.getSignedUrl(key, 604800); // 7 dias em segundos

      // Verificar se deve enviar o relatório por email
      const emailToSend = data.email || broadcast.email;
      let emailSent = false;

      if (emailToSend) {
        console.log(`[GenerateReportUseCase] Enviando relatório por email para: ${emailToSend}`);

        try {
          emailSent = await this.emailService.sendReportEmail(
            emailToSend,
            `Relatório da Campanha: ${broadcast.name}`,
            downloadUrl,
            `${data.type}`,
            broadcast.name
          );

          if (emailSent) {
            console.log(`[GenerateReportUseCase] Email enviado com sucesso para: ${emailToSend}`);
          } else {
            console.error(`[GenerateReportUseCase] Falha ao enviar email para: ${emailToSend}`);
          }
        } catch (emailError: any) {
          console.error(`[GenerateReportUseCase] Erro ao enviar email: ${emailError.message}`);
          // Não falhar o processo principal se o email falhar
        }
      }

      // Enviar webhook se a URL estiver configurada na campanha
      if (broadcast.channel) {
        try {
          console.log(`[GenerateReportUseCase] Enviando webhook para: https://${broadcast.channel.split("-")[1]}/api/v1/webhooks/campaign-webhook`);
          await this.webhookService.sendCampaignReportNotification(`https://${broadcast.channel.split("-")[1]}/api/v1/webhooks/campaign-webhook`,
            {
              "event": "update_status",
              "link": downloadUrl,
              "status": 1
            });
          console.log(`[GenerateReportUseCase] Webhook enviado com sucesso para campanha ${broadcast.id}`);
        } catch (webhookError: any) {
          console.error(`[GenerateReportUseCase] Erro ao enviar webhook para ${broadcast.id}: ${webhookError.message}`);
          // Não falhar o processo principal se o webhook falhar
        }
      } else {
        console.log(`[GenerateReportUseCase] Webhook URL não configurada para a campanha ${broadcast.id}. Webhook não enviado.`);
      }

      return {
        id: updatedReport.id,
        url: downloadUrl,
        key: key,
        type: updatedReport.type,
        format: updatedReport.format,
        status: updatedReport.status,
        createdAt: updatedReport.createdAt,
        emailSent: emailSent
      };

    } catch (error: any) {
      // Em caso de erro, atualizar o status do relatório
      console.error(`[GenerateReportUseCase] Erro ao gerar relatório: ${error.message}`, error);

      await this.prisma.report.update({
        where: { id: report.id },
        data: {
          status: 'failed'
        }
      });

      console.log(`[GenerateReportUseCase] Status do relatório atualizado para 'failed': ${report.id}`);
      throw error;
    }
  }
}
