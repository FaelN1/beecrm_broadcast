import { PrismaClient } from '@prisma/client';
import { S3StorageProvider } from '../storage/S3StorageProvider';
import { createObjectCsvWriter } from 'csv-writer';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export class CSVReportGenerator {
  private storageProvider: S3StorageProvider;
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.storageProvider = new S3StorageProvider();
    this.prisma = prisma;
  }

  async generateBroadcastContactsReport(broadcastId: string): Promise<{ key: string }> {
    // Buscar dados da campanha
    const broadcast = await this.prisma.broadcast.findUnique({
      where: { id: broadcastId }
    });

    if (!broadcast) {
      throw new Error('Campanha não encontrada');
    }

    // Buscar todos os contatos relacionados à campanha com seus status
    const contactData = await this.prisma.broadcastContact.findMany({
      where: { broadcastId },
      include: {
        contact: true
      },
      orderBy: {
        status: 'asc'
      }
    });

    // Preparar os dados para o CSV
    const records = contactData.map(bc => ({
      contactId: bc.contactId,
      name: bc.contact.name,
      phone: bc.contact.phone,
      displayName: bc.displayName || bc.contact.name,
      status: bc.status,
      createdAt: bc.createdAt.toISOString(),
      updatedAt: bc.updatedAt.toISOString()
    }));

    // Criar um arquivo temporário para o CSV
    const tmpDir = os.tmpdir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const tmpFilePath = path.join(tmpDir, `broadcast_${broadcastId}_${timestamp}.csv`);

    // Definir o writer do CSV
    const csvWriter = createObjectCsvWriter({
      path: tmpFilePath,
      header: [
        { id: 'contactId', title: 'ID do Contato' },
        { id: 'name', title: 'Nome' },
        { id: 'phone', title: 'Telefone' },
        { id: 'displayName', title: 'Nome de Exibição' },
        { id: 'status', title: 'Status' },
        { id: 'createdAt', title: 'Data de Criação' },
        { id: 'updatedAt', title: 'Data de Atualização' }
      ]
    });

    // Escrever os dados no CSV
    await csvWriter.writeRecords(records);

    // Definir o caminho no S3
    const key = `reports/${broadcastId}/${timestamp}_contacts.csv`;

    // Fazer upload do CSV para o S3
    await this.storageProvider.uploadFile(
      tmpFilePath,
      key,
      'text/csv'
    );

    // Limpar o arquivo temporário
    fs.unlinkSync(tmpFilePath);

    return { key };
  }
}
