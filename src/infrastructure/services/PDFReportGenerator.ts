import PDFDocument from 'pdfkit';
import { PassThrough } from 'stream';
import { S3StorageProvider } from '../storage/S3StorageProvider';
import { createCanvas } from 'canvas';
import { PrismaClient } from '@prisma/client';
import { ContactStatus } from '../../domain/valueObjects/ContactStatus';
import { BroadcastStatus } from '../../domain/valueObjects/BroadcastStatus';

export class PDFReportGenerator {
  private storageProvider: S3StorageProvider;
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.storageProvider = new S3StorageProvider();
    this.prisma = prisma;
  }

  async generateBroadcastReport(broadcastId: string): Promise<{ key: string }> {
    // Buscar dados da campanha
    const broadcast = await this.prisma.broadcast.findUnique({
      where: { id: broadcastId }
    });

    if (!broadcast) {
      throw new Error('Campanha não encontrada');
    }

    // Buscar contatos da campanha agrupados por status
    const contactsByStatus = await this.prisma.broadcastContact.groupBy({
      by: ['status'],
      where: { broadcastId },
      _count: {
        contactId: true
      }
    });

    // Criar um mapeamento de status para contagem
    const statusCounts: Record<string, number> = {};
    let totalMessages = 0;

    contactsByStatus.forEach(item => {
      statusCounts[item.status] = item._count.contactId;
      totalMessages += item._count.contactId;
    });

    // Dados para o gráfico (cores para cada status)
    const statusColors = {
      [ContactStatus.PENDING]: '#acacac',
      [ContactStatus.SENT]: '#4b77a9',
      [ContactStatus.DELIVERED]: '#45b7d1',
      [ContactStatus.READ]: '#5cb85c',
      [ContactStatus.FAILED]: '#d9534f'
    };

    // Gerar o PDF com o gráfico de pizza
    const doc = new PDFDocument({
      margin: 50,
      size: 'A4'
    });

    // Stream para coletar o conteúdo do PDF
    const pdfStream = new PassThrough();
    doc.pipe(pdfStream);

    // Cabeçalho do relatório
    doc.fontSize(25)
      .text('Relatório de Campanha', { align: 'center' })
      .moveDown(0.5);

    // Informações da campanha
    doc.fontSize(14)
      .text(`Nome: ${broadcast.name}`)
      .text(`Status: ${broadcast.status}`)
      .text(`Data de criação: ${broadcast.createdAt.toLocaleDateString()}`)
      .text(`Total de contatos: ${totalMessages}`)
      .moveDown(1.5);

    // Gerar um gráfico de pizza usando canvas
    const canvasWidth = 500;
    const canvasHeight = 300;
    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;
    const radius = Math.min(centerX, centerY) - 10;

    const canvas = createCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext('2d');

    // Função para desenhar o gráfico de pizza
    let startAngle = 0;
    Object.entries(statusCounts).forEach(([status, count]) => {
      const sliceAngle = (count / totalMessages) * 2 * Math.PI;
      
      // Desenhar a fatia
      ctx.beginPath();
      ctx.fillStyle = statusColors[status as ContactStatus] || '#999999';
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
      ctx.closePath();
      ctx.fill();
      
      startAngle += sliceAngle;
    });

    // Adicionar gráfico ao PDF
    doc.image(canvas.toBuffer(), {
      fit: [400, 300],
      align: 'center'
    });
    doc.moveDown(0.5);

    // Adicionar legenda
    doc.fontSize(12).text('Legenda:', { underline: true }).moveDown(0.5);
    
    Object.entries(statusCounts).forEach(([status, count]) => {
      const percentage = ((count / totalMessages) * 100).toFixed(1);
      
      doc.fillColor(statusColors[status as ContactStatus] || '#999999')
        .rect(doc.x, doc.y, 15, 15)
        .fill();
      
      doc.fillColor('black')
        .text(`  ${status}: ${count} (${percentage}%)`, { continued: true })
        .moveDown(0.5);
    });

    // Detalhes adicionais
    doc.moveDown(1)
      .fontSize(14)
      .text('Detalhes da Campanha', { underline: true })
      .moveDown(0.5)
      .fontSize(12)
      .text(`ID: ${broadcast.id}`)
      .text(`Descrição: ${broadcast.description || 'N/A'}`)
      .text(`Canal: ${broadcast.channel || 'N/A'}`)
      .text(`Data do relatório: ${new Date().toLocaleString()}`);

    // Finalizar o documento
    doc.end();

    // Gerar nome do arquivo baseado na data e ID da campanha
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const key = `reports/${broadcastId}/${timestamp}_report.pdf`;

    // Fazer upload do PDF para o S3
    const chunks: Buffer[] = [];
    for await (const chunk of pdfStream) {
      chunks.push(Buffer.from(chunk));
    }
    const pdfBuffer = Buffer.concat(chunks);
    
    await this.storageProvider.uploadBuffer(
      pdfBuffer, 
      key, 
      'application/pdf'
    );

    return { key };
  }
}
