# ZapVoz Voice Calls

Biblioteca para integração de chamadas de voz com Evolution API e ZapVoz Voice Bridge.

## Instalação

```bash
npm install github:SEU-USUARIO/zapvoz-voice-calls
```

## Uso

```typescript
const { useZapVozVoiceCalls } = require("zapvoz-voice-calls");

// Na Evolution API, após conectar o Baileys:
useZapVozVoiceCalls(token, baileysSocket, "open", true, {
  serverUrl: "https://seu-vps:3001"
});
```

## Configuração

### Evolution API

1. Instale a biblioteca no diretório da Evolution API
2. Crie o arquivo de integração (zapvoz.js)
3. Injete no main.js da Evolution

### Voice Bridge Server

1. Configure o servidor Voice Bridge no seu VPS
2. Defina a URL do servidor na opção `serverUrl`

## Eventos Suportados

- `CB:call` - Eventos de chamada do WhatsApp
- `CB:ack,class:call` - Confirmações de chamada
- `connection.update:status` - Status da conexão

## Licença

MIT
