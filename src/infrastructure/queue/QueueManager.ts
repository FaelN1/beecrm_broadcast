import { BullQueueProvider } from './BullQueueProvider';
import { messageDispatchProcessor } from './jobs/MessageDispatchJob';
import { Worker } from 'bullmq';

export class QueueManager {
  private queueProvider: BullQueueProvider;
  private workers: Worker[] = [];

  constructor(queueProvider: BullQueueProvider) {
    this.queueProvider = queueProvider;
  }

  async initialize(): Promise<void> {
    console.log('Inicializando gerenciador de filas...');
    
    // Inicializar worker para processamento de mensagens
    this.setupMessageDispatchWorker();
    
    console.log('Gerenciador de filas inicializado com sucesso');
  }

  private setupMessageDispatchWorker(): void {
    const worker = this.queueProvider.createWorker('message-dispatch', messageDispatchProcessor);
    
    worker.on('completed', (job) => {
      console.log(`Job ${job.id} concluído com sucesso`);
    });

    worker.on('failed', (job, error) => {
      console.error(`Job ${job?.id} falhou: ${error.message}`);
      
      // Se o erro for relacionado à API, podemos registrar detalhes adicionais
      if (error.message.includes('API de mensagens')) {
        console.error('Detalhes da falha de API:', error);
      }
    });

    worker.on('error', (error) => {
      console.error('Erro no worker de mensagens:', error);
    });
    
    // Adicionar tratamento para outros eventos
    worker.on('stalled', (jobId) => {
      console.warn(`Job ${jobId} está em stalled state.`);
    });

    this.workers.push(worker);
    console.log('Worker de processamento de mensagens inicializado');
  }

  async shutdown(): Promise<void> {
    console.log('Encerrando filas e workers...');
    
    // Encerrar todos os workers
    const closingWorkers = this.workers.map(worker => worker.close());
    await Promise.all(closingWorkers);
    
    // Fechar a conexão do provider
    await this.queueProvider.close();
    
    console.log('Filas e workers encerrados com sucesso');
  }
}
