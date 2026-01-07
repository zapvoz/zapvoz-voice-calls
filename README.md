# ZapVoz Voice Calls v2.0

Biblioteca completa para integração de chamadas de voz com Evolution API e ZapVoz Voice Bridge.

## Novidades v2.0

- 🎤 **CallSignaling** - Sinalização XMPP completa para chamadas
- 🔊 **MediaBridge** - Ponte de áudio bidirecional
- 🔐 **SRTP** - Criptografia de mídia
- 🌐 **WebRTC** - Suporte a navegadores

## Instalação

```bash
npm install github:SEU-USUARIO/zapvoz-voice-calls
```

## Uso Básico

```typescript
const { useZapVozVoiceCalls } = require("zapvoz-voice-calls");

// Na Evolution API, após conectar o Baileys:
useZapVozVoiceCalls(token, baileysSocket, "open", true, {
  serverUrl: "https://seu-vps:3001"
});
```

## Uso Avançado

```typescript
const { ZapVozVoiceCalls, CallSignaling } = require("zapvoz-voice-calls");

const zapvoz = new ZapVozVoiceCalls(token, sock, "open", true, {
  serverUrl: "https://seu-vps:3001",
  enableMediaBridge: true
});

// Fazer chamada
zapvoz.makeCall("+5511999999999");

// Eventos
zapvoz.on('incoming-call', (call) => {
  console.log('Chamada de:', call.from);
});

zapvoz.on('call-accepted', (call) => {
  console.log('Chamada conectada');
});
```

## Arquitetura

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Evolution  │────▶│ Voice Bridge │◀────│   WebPhone  │
│     API     │     │   (VPS)      │     │  (Browser)  │
└─────────────┘     └──────────────┘     └─────────────┘
       │                   │                    │
       │ Baileys/WS        │ Socket.IO          │ WebRTC
       │                   │                    │
       ▼                   ▼                    ▼
┌─────────────────────────────────────────────────────┐
│                   WhatsApp Cloud                     │
└─────────────────────────────────────────────────────┘
```

## Componentes

### ZapVozVoiceCalls
Classe principal que gerencia a conexão com o Voice Bridge.

### CallSignaling  
Implementa sinalização XMPP para chamadas WhatsApp.

### MediaBridge
Ponte de áudio entre WhatsApp (SRTP) e Browser (WebRTC).

## Eventos Suportados

- `CB:call` - Eventos de chamada do WhatsApp
- `CB:ack,class:call` - Confirmações de chamada
- `incoming-call` - Chamada recebida
- `call-accepted` - Chamada atendida
- `call-ended` - Chamada finalizada
- `media-connected` - Áudio conectado

## Licença

MIT
