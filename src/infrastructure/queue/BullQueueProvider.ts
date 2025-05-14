import { Queue, Worker, QueueOptions, JobsOptions } from 'bullmq';
import IORedis from 'ioredis';

export class BullQueueProvider {
  private connection: IORedis;
  private queues: Map<string, Queue>;

  constructor() {
    // Criando conexão com Redis para BullMQ
    this.connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });
    
    this.queues = new Map();
    
    // Inicializar as filas padrão
    this.initializeDefaultQueues();
  }

  private initializeDefaultQueues(): void {
    // Criar fila para envio de mensagens
    this.createQueue('message-dispatch');
    
    // Criar fila para geração de relatórios
    this.createQueue('report-generation');

    // Criar fila para verificar campanhas agendadas
    this.createQueue('scheduled-campaign-check');
  }

  /**
   * Cria uma nova fila
   */
  public createQueue(name: string, options?: QueueOptions): Queue {
    const queue = new Queue(name, {
      connection: this.connection,
      ...options
    });
    
    this.queues.set(name, queue);
    console.log(`Fila ${name} criada com sucesso`);
    
    return queue;
  }

  /**
   * Recupera uma fila pelo nome
   */
  public getQueue(name: string): Queue | undefined {
    return this.queues.get(name);
  }

  /**
   * Cria um worker para processar jobs de uma fila
   */
  public createWorker(queueName: string, processor: Function): Worker {
    return new Worker(queueName, async (job) => {
      console.log(`Processando job ${job.id} da fila ${queueName}`);
      return processor(job);
    }, { connection: this.connection });
  }

  /**
   * Adiciona um job à fila
   */
  public async addJob(queueName: string, data: any, options?: any): Promise<string | undefined> {
    const queue = this.getQueue(queueName);
    
    if (!queue) {
      throw new Error(`Fila ${queueName} não encontrada`);
    }
    
    const job = await queue.add(queueName, data, options);
    return job.id;
  }

  /**
   * Pausa jobs em uma fila específica relacionados a um broadcast
   */
  public async pauseJobsInQueue(queueName: string, broadcastId: string): Promise<void> {
    const queue = this.getQueue(queueName);
    
    if (!queue) {
      throw new Error(`Fila ${queueName} não encontrada`);
    }
    
    console.log(`Pausando jobs da campanha ${broadcastId} na fila ${queueName}`);
    
    try {
      // Primeiro, pausar a fila para evitar novos processamentos
      await queue.pause();
      
      // Buscar todos os jobs pendentes
      const waitingJobs = await queue.getJobs(['waiting']);
      const delayedJobs = await queue.getJobs(['delayed']);
      const activeJobs = await queue.getJobs(['active']);
      
      let pausedCount = 0;
      
      // Processa jobs em espera - forma mais segura é remover e recriar com atraso
      for (const job of waitingJobs) {
        if (job.data?.broadcastId === broadcastId) {
          try {
            // Salvar dados do job
            const jobData = {
              ...job.data,
              __pauseState: {
                paused: true,
                originalJobId: job.id,
                pausedAt: new Date().toISOString(),
                originalState: 'waiting'
              }
            };
            
            // Remover job atual
            await job.remove();
            
            // Adicionar novo job com delay longo e um ID personalizado não-numérico
            const customId = `paused_${job.id}_${Date.now()}`;
            await queue.add(job.name, jobData, {
              delay: 365 * 24 * 60 * 60 * 1000, // 1 ano
              jobId: customId
            });
            
            pausedCount++;
          } catch (err) {
            console.error(`Erro ao pausar job em espera ${job.id}:`, err);
          }
        }
      }
      
      // Processa jobs já atrasados
      for (const job of delayedJobs) {
        if (job.data?.broadcastId === broadcastId) {
          try {
            // Apenas atualiza os dados com o estado de pausa
            await job.updateData({
              ...job.data,
              __pauseState: {
                paused: true,
                originalJobId: job.id,
                pausedAt: new Date().toISOString(),
                originalState: 'delayed'
              }
            });
            pausedCount++;
          } catch (err) {
            console.error(`Erro ao pausar job atrasado ${job.id}:`, err);
          }
        }
      }
      
      // Processa jobs ativos - Não podemos movê-los diretamente
      // Apenas marcar como pausados para que quando terminarem não sejam reprocessados
      for (const job of activeJobs) {
        if (job.data?.broadcastId === broadcastId) {
          try {
            // Marcar job como pausado sem tentar movê-lo
            await job.updateData({
              ...job.data,
              __pauseState: {
                paused: true,
                originalJobId: job.id,
                pausedAt: new Date().toISOString(),
                originalState: 'active'
              }
            });
            pausedCount++;
          } catch (err) {
            console.error(`Erro ao marcar job ativo ${job.id}:`, err);
          }
        }
      }
      
      console.log(`${pausedCount} jobs da campanha ${broadcastId} pausados com sucesso`);
    } finally {
      // Certifique-se de retomar a fila para outros broadcasts
      await queue.resume();
    }
  }

  /**
   * Resume jobs pausados em uma fila específica relacionados a um broadcast
   */
  public async resumeJobsInQueue(queueName: string, broadcastId: string): Promise<void> {
    const queue = this.getQueue(queueName);
    
    if (!queue) {
      throw new Error(`Fila ${queueName} não encontrada`);
    }

    console.log(`Retomando jobs da campanha ${broadcastId} na fila ${queueName}`);
    
    // Buscar todos os jobs delayed (pausados)
    const delayedJobs = await queue.getJobs(['delayed']);
    let resumedCount = 0;
    
    for (const job of delayedJobs) {
      const data = job.data;
      // Verificar se o job pertence ao broadcast e está pausado
      if (data && data.broadcastId === broadcastId && data.__pauseState?.paused) {
        try {
          // Remover informações de estado de pausa
          const newData = { ...data };
          delete newData.__pauseState;
          
          // Opções do job: alta prioridade e sem delay
          const options: JobsOptions = {
            priority: 1,
            delay: 0,
            attempts: 5,
            backoff: { type: 'exponential', delay: 5000 }
          };

          // Remover o job atual e criar um novo
          await job.remove();
          await queue.add(job.name, newData, options);
          
          resumedCount++;
        } catch (err) {
          console.error(`Erro ao retomar job ${job.id}:`, err);
        }
      }
    }
    
    console.log(`${resumedCount} jobs da campanha ${broadcastId} retomados com sucesso`);
  }

  /**
   * Remove jobs de uma fila específica relacionados a um broadcast
   */
  public async removeJobsFromQueue(queueName: string, broadcastId: string): Promise<void> {
    const queue = this.getQueue(queueName);
    
    if (!queue) {
      throw new Error(`Fila ${queueName} não encontrada`);
    }

    // Buscar todos os jobs pendentes e removê-los
    const jobs = await queue.getJobs(['waiting', 'delayed', 'active']);
    
    for (const job of jobs) {
      const data = await job.data;
      // Só processa jobs relacionados a este broadcast
      if (data && data.broadcastId === broadcastId) {
        try {
          await job.remove();
          console.log(`Job ${job.id} removido da fila ${queueName}`);
        } catch (err) {
          console.error(`Erro ao remover job ${job.id}:`, err);
        }
      }
    }
  }

  /**
   * Fecha a conexão com o Redis
   */
  public async close(): Promise<void> {
    await Promise.all(Array.from(this.queues.values()).map(queue => queue.close()));
    await this.connection.quit();
  }
}