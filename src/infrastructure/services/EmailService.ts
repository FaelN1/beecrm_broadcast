import nodemailer from 'nodemailer';

export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    // Melhorar logs de inicialização para ajudar na depuração
    console.log('[EmailService] Inicializando com configurações:');
    console.log(`[EmailService] SMTP_HOST: ${process.env.SMTP_HOST}`);
    console.log(`[EmailService] SMTP_PORT: ${process.env.SMTP_PORT}`);
    console.log(`[EmailService] SMTP_USER: ${process.env.SMTP_USER}`);
    console.log(`[EmailService] SMTP_SECURE: ${process.env.SMTP_SECURE}`);
    
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.example.com',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '' // Aqui estava o erro, estava usando SMTP_PASSWORD
      }
    });
  }

  async sendReportEmail(to: string, subject: string, reportUrl: string, reportType: string, broadcastName: string): Promise<boolean> {
    try {
      console.log(`[EmailService] Enviando relatório por email para: ${to}`);
      console.log(`[EmailService] Usando SMTP: ${process.env.SMTP_HOST}:${process.env.SMTP_PORT}`);
      
      const result = await this.transporter.sendMail({
        from: process.env.EMAIL_FROM || 'noreply@beecrm.io',
        to,
        subject,
        html: `
          <h1>Relatório de Campanha</h1>
          <p>Olá,</p>
          <p>O relatório da campanha <strong>${broadcastName}</strong> está disponível.</p>
          <p>Tipo de relatório: ${reportType}</p>
          <p>Você pode baixar o relatório clicando <a href="${reportUrl}" target="_blank">aqui</a>.</p>
          <p>Este link expira em 7 dias.</p>
          <p>Atenciosamente,<br>Equipe BeeCRM</p>
        `
      });

      console.log(`[EmailService] Email enviado com sucesso: ${result.messageId}`);
      return true;
    } catch (error) {
      console.error('[EmailService] Erro ao enviar email:', error);
      
      // Adicionar verificações mais específicas para diagnosticar o problema
      if (error.code === 'EAUTH') {
        console.error('[EmailService] Falha na autenticação SMTP. Verifique usuário e senha.');
      } else if (error.code === 'ESOCKET') {
        console.error('[EmailService] Problema de conexão com servidor SMTP. Verifique host, porta e firewall.');
      }
      
      return false;
    }
  }
}
