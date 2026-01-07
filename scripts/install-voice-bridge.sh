#!/bin/bash
# ZapVoz Voice Bridge - Script de instalação
# Versão 2.0

set -e

echo "🚀 ZapVoz Voice Bridge - Instalação"
echo "===================================="

INSTALL_DIR="/opt/zapvoz/voice-bridge"

# Criar diretório
echo "📁 Criando diretório..."
mkdir -p $INSTALL_DIR
cd $INSTALL_DIR

# Verificar Node.js
if ! command -v node &> /dev/null; then
    echo "📦 Instalando Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

echo "📝 Node.js version: $(node -v)"
echo "📝 npm version: $(npm -v)"

# Criar package.json
echo "📦 Criando package.json..."
cat > package.json << 'EOFPKG'
{
  "name": "zapvoz-voice-bridge",
  "version": "2.0.0",
  "description": "ZapVoz Voice Bridge Server",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "node --watch index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "socket.io": "^4.7.5",
    "cors": "^2.8.5",
    "wrtc": "^0.4.7"
  }
}
EOFPKG

# Instalar dependências
echo "📦 Instalando dependências..."
npm install

# Baixar arquivos do servidor
echo "📥 Baixando arquivos do servidor..."
# Os arquivos serão copiados do repositório ou baixados

cat > index.js << 'EOFINDEX'
/**
 * ZapVoz Voice Bridge v2.0
 * Servidor central de sinalização e mídia
 */

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json());

// Estado
const connections = {
  baileys: new Map(),
  webphone: new Map(),
  calls: new Map()
};

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '2.0.0',
    connections: {
      baileys: connections.baileys.size,
      webphone: connections.webphone.size,
      activeCalls: connections.calls.size
    }
  });
});

// Status detalhado
app.get('/status', (req, res) => {
  res.json({
    baileys: Array.from(connections.baileys.keys()).map(k => ({ token: k.substring(0, 8) + '...' })),
    webphone: Array.from(connections.webphone.keys()).map(k => ({ token: k.substring(0, 8) + '...' })),
    calls: Array.from(connections.calls.values())
  });
});

// Namespace: Baileys (Evolution API)
io.of('/baileys').on('connection', (socket) => {
  const token = socket.handshake.query.token || socket.handshake.auth.token;
  console.log('[Baileys] Conectado:', token?.substring(0, 8) + '...');
  
  connections.baileys.set(token, { socket, connectedAt: new Date() });
  
  socket.on('init', (me, account, status) => {
    console.log('[Baileys] Init:', me?.id);
    const conn = connections.baileys.get(token);
    if (conn) {
      conn.user = me;
      conn.status = status;
    }
    notifyWebphone(token, 'baileys-status', { connected: true, user: me });
  });
  
  socket.on('CB:call', (packet) => {
    console.log('[Baileys] CB:call');
    notifyWebphone(token, 'incoming-call', packet);
  });
  
  socket.on('call', (calls) => {
    for (const call of calls) {
      if (call.status === 'offer') {
        connections.calls.set(call.id, { ...call, token, startedAt: new Date() });
        notifyWebphone(token, 'incoming-call', call);
      }
    }
  });
  
  socket.on('disconnect', () => {
    console.log('[Baileys] Desconectado:', token?.substring(0, 8) + '...');
    connections.baileys.delete(token);
    notifyWebphone(token, 'baileys-status', { connected: false });
  });
});

// Namespace: WebPhone (Frontend)
io.of('/webphone').on('connection', (socket) => {
  const token = socket.handshake.query.token || socket.handshake.auth.token;
  console.log('[WebPhone] Conectado:', token?.substring(0, 8) + '...');
  
  connections.webphone.set(token, { socket, connectedAt: new Date() });
  
  // Verificar se Baileys está conectado
  const baileys = connections.baileys.get(token);
  socket.emit('baileys-status', { connected: !!baileys });
  
  socket.on('startCall', (data, callback) => {
    console.log('[WebPhone] startCall:', data.to);
    sendToBaileys(token, 'makeCall', data, callback);
  });
  
  socket.on('acceptCall', (callId, callback) => {
    console.log('[WebPhone] acceptCall:', callId);
    sendToBaileys(token, 'acceptCall', callId, callback);
  });
  
  socket.on('rejectCall', (callId, callback) => {
    console.log('[WebPhone] rejectCall:', callId);
    sendToBaileys(token, 'rejectCall', callId, callback);
  });
  
  socket.on('disconnect', () => {
    console.log('[WebPhone] Desconectado:', token?.substring(0, 8) + '...');
    connections.webphone.delete(token);
  });
});

function notifyWebphone(token, event, data) {
  const webphone = connections.webphone.get(token);
  if (webphone?.socket) {
    webphone.socket.emit(event, data);
  }
}

function sendToBaileys(token, event, data, callback) {
  const baileys = connections.baileys.get(token);
  if (baileys?.socket) {
    baileys.socket.emit(event, data, callback);
  } else {
    callback?.({ success: false, error: 'Baileys não conectado' });
  }
}

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`🚀 ZapVoz Voice Bridge v2.0 rodando na porta ${PORT}`);
});
EOFINDEX

# Configurar PM2
echo "🔧 Configurando PM2..."
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
fi

pm2 delete voice-bridge 2>/dev/null || true
pm2 start index.js --name voice-bridge
pm2 save
pm2 startup

echo ""
echo "✅ Instalação concluída!"
echo ""
echo "📋 Status:"
pm2 status voice-bridge
echo ""
echo "🔗 Voice Bridge: http://localhost:3001"
echo "📊 Health: http://localhost:3001/health"
