import { io, Socket } from "socket.io-client";
import type { ZapVozOptions, ConnectionStatus, ZapVozEventMap } from "./transport.type";

const DEFAULT_SERVER_URL = "https://voice.zapvoz.com";

export class ZapVozVoiceCalls {
  private socket: Socket | null = null;
  private token: string;
  private baileysSock: any;
  private status: string;
  private logger: boolean;
  private options: ZapVozOptions;
  private connectionStatus: ConnectionStatus = 'disconnected';

  constructor(
    token: string,
    baileysSock: any,
    status: string,
    logger: boolean = false,
    options: ZapVozOptions = {}
  ) {
    this.token = token;
    this.baileysSock = baileysSock;
    this.status = status;
    this.logger = logger;
    this.options = {
      serverUrl: DEFAULT_SERVER_URL,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 3000,
      timeout: 20000,
      ...options
    };

    if (status === "open") {
      this.connect();
    }
  }

  private log(...args: any[]) {
    if (this.logger) {
      console.log("[ZapVoz]", ...args);
    }
  }

  private connect() {
    const serverUrl = this.options.serverUrl || DEFAULT_SERVER_URL;
    
    this.log("Conectando ao Voice Bridge:", serverUrl);
    this.connectionStatus = 'connecting';

    this.socket = io(`${serverUrl}/baileys`, {
      transports: ["websocket"],
      path: `/${this.token}/websocket`,
      reconnection: this.options.reconnection,
      reconnectionAttempts: this.options.reconnectionAttempts,
      reconnectionDelay: this.options.reconnectionDelay,
      timeout: this.options.timeout
    });

    this.setupSocketEvents();
    this.setupBaileysEvents();
  }

  private setupSocketEvents() {
    if (!this.socket) return;

    this.socket.on("connect", () => {
      this.log("Conectado ao Voice Bridge");
      this.connectionStatus = 'connected';
      
      // Enviar informações iniciais
      const me = this.baileysSock.user;
      this.socket?.emit("init", me, { token: this.token }, this.status);
    });

    this.socket.on("disconnect", (reason) => {
      this.log("Desconectado:", reason);
      this.connectionStatus = 'disconnected';
    });

    this.socket.on("connect_error", (error) => {
      this.log("Erro de conexão:", error.message);
      this.connectionStatus = 'error';
    });

    // Comandos do Voice Bridge para executar no Baileys
    this.socket.on("sendNode", async (stanza: any, callback?: (result: any) => void) => {
      try {
        this.log("sendNode:", stanza);
        await this.baileysSock.sendNode(stanza);
        callback?.({ success: true });
      } catch (error: any) {
        this.log("Erro sendNode:", error);
        callback?.({ success: false, error: error.message });
      }
    });

    this.socket.on("generateMessageTag", (callback: (tag: string) => void) => {
      const tag = this.baileysSock.generateMessageTag();
      callback(tag);
    });

    this.socket.on("signalRepository:decryptMessage", async (data: any, callback: (result: any) => void) => {
      try {
        const result = await this.baileysSock.signalRepository.decryptMessage(data);
        callback({ success: true, data: result });
      } catch (error: any) {
        callback({ success: false, error: error.message });
      }
    });

    this.socket.on("createParticipantNodes", async (data: any, callback: (result: any) => void) => {
      try {
        const result = await this.baileysSock.signalRepository.createParticipantNodes(
          data.jids,
          data.category,
          data.extraAttrs
        );
        callback({ success: true, data: result });
      } catch (error: any) {
        callback({ success: false, error: error.message });
      }
    });

    this.socket.on("assertSessions", async (jids: string[], callback: (result: any) => void) => {
      try {
        await this.baileysSock.assertSessions(jids, false);
        callback({ success: true });
      } catch (error: any) {
        callback({ success: false, error: error.message });
      }
    });

    this.socket.on("onWhatsApp", async (jids: string[], callback: (result: any) => void) => {
      try {
        const result = await this.baileysSock.onWhatsApp(...jids);
        callback({ success: true, data: result });
      } catch (error: any) {
        callback({ success: false, error: error.message });
      }
    });

    this.socket.on("profilePictureUrl", async (jid: string, type: string, callback: (result: any) => void) => {
      try {
        const url = await this.baileysSock.profilePictureUrl(jid, type);
        callback({ success: true, data: url });
      } catch (error: any) {
        callback({ success: false, error: error.message });
      }
    });
  }

  private setupBaileysEvents() {
    // Interceptar eventos de chamada do Baileys
    const originalEventHandler = this.baileysSock.ev?.process?.bind(this.baileysSock.ev);
    
    if (this.baileysSock.ws) {
      const originalOnMessage = this.baileysSock.ws.on?.bind(this.baileysSock.ws);
      
      this.baileysSock.ws.on = (event: string, handler: (...args: any[]) => void) => {
        if (event === "CB:call") {
          const wrappedHandler = (...args: any[]) => {
            this.log("CB:call recebido:", args);
            this.socket?.emit("CB:call", ...args);
            handler(...args);
          };
          return originalOnMessage?.(event, wrappedHandler);
        }
        
        if (event === "CB:ack,class:call") {
          const wrappedHandler = (...args: any[]) => {
            this.log("CB:ack,class:call recebido:", args);
            this.socket?.emit("CB:ack,class:call", ...args);
            handler(...args);
          };
          return originalOnMessage?.(event, wrappedHandler);
        }
        
        return originalOnMessage?.(event, handler);
      };
    }

    // Escutar evento call do Baileys
    this.baileysSock.ev?.on?.("call", (calls: any[]) => {
      this.log("Evento call:", calls);
      this.socket?.emit("call", calls);
    });
  }

  public getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  public disconnect() {
    this.socket?.disconnect();
    this.socket = null;
    this.connectionStatus = 'disconnected';
  }
}

// Função helper para uso simplificado
export function useZapVozVoiceCalls(
  token: string,
  baileysSock: any,
  status: string,
  logger: boolean = false,
  options: ZapVozOptions = {}
): ZapVozVoiceCalls {
  return new ZapVozVoiceCalls(token, baileysSock, status, logger, options);
}
