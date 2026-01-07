#!/bin/bash
# ZapVoz Voice Calls - Script de instalação para Evolution API
# Versão 2.0

set -e

echo "🚀 ZapVoz Voice Calls - Instalação Evolution API"
echo "=================================================="

# Verificar se está no diretório correto
if [ ! -f "package.json" ]; then
    echo "❌ Execute este script no diretório raiz da Evolution API"
    exit 1
fi

# Verificar se é Evolution API
if ! grep -q "evolution-api" package.json 2>/dev/null; then
    echo "⚠️  Aviso: Este não parece ser o diretório da Evolution API"
    read -p "Continuar mesmo assim? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Configurar GitHub (se necessário)
GITHUB_zapvoz="${GITHUB_zapvoz:-SEU_USUARIO}"
VOICE_BRIDGE_URL="${VOICE_BRIDGE_URL:-https://seu-vps:3001}"

echo ""
echo "📦 Instalando zapvoz-voice-calls..."
npm install github:${GITHUB_zapvoz}/zapvoz-voice-calls --save

echo ""
echo "📝 Criando arquivo de integração..."
mkdir -p ./dist

cat > ./dist/zapvoz-integration.js << 'EOFZAPVOZ'
/**
 * ZapVoz Voice Calls Integration v2.0
 * Integração automática com Evolution API
 */

const { useZapVozVoiceCalls } = require("zapvoz-voice-calls");

const VOICE_BRIDGE_URL = process.env.VOICE_BRIDGE_URL || "PLACEHOLDER_URL";

let activeConnections = new Map();

function initZapVoz(client, instance) {
    const token = instance.token || instance.instanceName;
    
    if (!token) {
        console.log("[ZapVoz] Token não encontrado");
        return null;
    }
    
    if (activeConnections.has(token)) {
        console.log("[ZapVoz] Conexão já existe para:", token);
        return activeConnections.get(token);
    }
    
    console.log("[ZapVoz] Inicializando para:", token);
    
    try {
        const zapvoz = useZapVozVoiceCalls(token, client, "open", true, {
            serverUrl: VOICE_BRIDGE_URL,
            enableMediaBridge: true,
            enableCallSignaling: true
        });
        
        zapvoz.on('incoming-call', (call) => {
            console.log("[ZapVoz] Chamada recebida de:", call.from);
        });
        
        zapvoz.on('call-accepted', (call) => {
            console.log("[ZapVoz] Chamada conectada:", call.id);
        });
        
        zapvoz.on('call-ended', (call) => {
            console.log("[ZapVoz] Chamada finalizada:", call.id);
        });
        
        activeConnections.set(token, zapvoz);
        console.log("[ZapVoz] Conectado ao Voice Bridge:", VOICE_BRIDGE_URL);
        
        return zapvoz;
    } catch (error) {
        console.error("[ZapVoz] Erro ao inicializar:", error.message);
        return null;
    }
}

function disconnectZapVoz(token) {
    const connection = activeConnections.get(token);
    if (connection) {
        connection.disconnect();
        activeConnections.delete(token);
        console.log("[ZapVoz] Desconectado:", token);
    }
}

module.exports = {
    initZapVoz,
    disconnectZapVoz,
    getConnection: (token) => activeConnections.get(token)
};
EOFZAPVOZ

# Substituir placeholder pela URL real
sed -i "s|PLACEHOLDER_URL|${VOICE_BRIDGE_URL}|g" ./dist/zapvoz-integration.js

echo ""
echo "🔧 Criando script de injeção..."

cat > ./inject-zapvoz.sh << 'EOFINJECT'
#!/bin/bash
# Injetar ZapVoz no main.js da Evolution

MAIN_JS="./dist/main.js"
BACKUP="./dist/main.js.backup"

if [ ! -f "$MAIN_JS" ]; then
    echo "❌ main.js não encontrado"
    exit 1
fi

# Backup
cp "$MAIN_JS" "$BACKUP"
echo "✅ Backup criado: $BACKUP"

# Verificar se já foi injetado
if grep -q "zapvoz-integration" "$MAIN_JS"; then
    echo "⚠️  ZapVoz já está injetado"
    exit 0
fi

# Injetar require no início
sed -i '1i const zapvozIntegration = require("./zapvoz-integration");' "$MAIN_JS"

# Injetar inicialização após conexão
# Procurar por padrão comum de conexão estabelecida
sed -i 's/this.instance.wuid=this.client.user.id/zapvozIntegration.initZapVoz(this.client, this.instance); this.instance.wuid=this.client.user.id/' "$MAIN_JS"

echo "✅ ZapVoz injetado com sucesso!"
echo ""
echo "🔄 Reinicie a Evolution API:"
echo "   pm2 restart evolution-api"
EOFINJECT

chmod +x ./inject-zapvoz.sh

echo ""
echo "✅ Instalação concluída!"
echo ""
echo "📋 Próximos passos:"
echo "   1. Configure VOICE_BRIDGE_URL em .env"
echo "   2. Execute: ./inject-zapvoz.sh"
echo "   3. Reinicie: pm2 restart evolution-api"
echo ""
echo "🔗 Voice Bridge URL: ${VOICE_BRIDGE_URL}"
