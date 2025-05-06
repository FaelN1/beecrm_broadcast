import { PrismaClient } from '@prisma/client';
import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { router } from './interfaces/http/routes';
import { prisma } from './infrastructure/database/prisma/PrismaRepository';
import cors from 'cors';
import { Redis } from 'ioredis';
import { BullQueueProvider } from './infrastructure/queue/BullQueueProvider';
import { QueueManager } from './infrastructure/queue/QueueManager';
import { queueProvider } from './interfaces/http/routes/messageRoutes';

// Configurações
const PORT = process.env.PORT || 3000;
const app = express();
const httpServer = createServer(app);

// Configuração do Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Middlewares
app.use(cors());
app.use(express.json());

// Conexão com Redis
const redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

redisClient.on('connect', () => {
  console.log('Conexão com Redis estabelecida');
});

redisClient.on('error', (error) => {
  console.error('Erro na conexão com Redis:', error);
});

// Inicialização das filas
let queueManager: QueueManager | null = null;

try {
  // Usamos a mesma instância de queueProvider compartilhada
  queueManager = new QueueManager(queueProvider);
  queueManager.initialize()
    .then(() => console.log('Sistema de filas inicializado'))
    .catch(error => console.error('Erro ao inicializar sistema de filas:', error));
} catch (error) {
  console.error('Erro ao configurar sistema de filas:', error);
}

// Rotas
app.use('/api', router);

// Rota de saúde
app.get('/health', (_, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// WebSocket events
io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);
  
  socket.on('join-broadcast', (broadcastId) => {
    socket.join(`broadcast:${broadcastId}`);
    console.log(`Cliente ${socket.id} entrou na sala broadcast:${broadcastId}`);
  });
  
  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id);
  });
});

// Handler para erros não tratados
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Iniciar servidor
httpServer.listen(PORT, async () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  
  try {
    // Verificar conexão com o banco de dados
    await prisma.$connect();
    console.log('📦 Conexão com o banco de dados estabelecida');
  } catch (error) {
    console.error('❌ Erro ao conectar com o banco de dados:', error);
    process.exit(1);
  }
});

// Limpeza na finalização
process.on('SIGINT', async () => {
  console.log('\nServidor encerrando...');
  
  // Fechar gerenciador de filas
  if (queueManager) {
    await queueManager.shutdown();
  }
  
  // Fechar conexões
  await prisma.$disconnect();
  await redisClient.quit();
  
  console.log('Conexões fechadas. Servidor encerrado.');
  process.exit(0);
});