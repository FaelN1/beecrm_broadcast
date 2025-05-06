FROM node:18-alpine

# Instalar dependências necessárias para compilação de pacotes nativos
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    jpeg-dev \
    cairo-dev \
    giflib-dev \
    pango-dev \
    libtool \
    autoconf \
    automake \
    curl

# Configurar python para node-gyp
RUN ln -sf python3 /usr/bin/python

WORKDIR /app

# Copiar arquivos de dependências primeiro para aproveitar cache de camadas
COPY package*.json ./

# Instalar TODAS as dependências, incluindo as de desenvolvimento
RUN npm install --force

# Copiar o restante dos arquivos
COPY . .

# Gerar o cliente do Prisma
RUN npx prisma generate

# Construir a aplicação com npx para garantir o uso do TypeScript correto
RUN npx tsc

# Expor porta da aplicação
EXPOSE 3000

# Comando para iniciar a aplicação
CMD ["npm", "start"]