import { io, Socket } from "socket.io-client";
import type { ZapVozOptions, ConnectionStatus, CallEvent, ZapVozEventMap } from "./transport.type";
import { CallSignaling } from "./call-signaling";

const DEFAULT_SERVER_URL = "https://voice.zapvoz.com";

type EventHandler = (...args: any[]) => void;

export class ZapVozVoiceCalls {
  private socket: Socket | null = null;
  private token: string;
  private baileysSock: any;
  private status: string;
  private logger: boolean;
  private options: ZapVozOptions;
  private connectionStatus: ConnectionStatus = 'disconnected';
  private callSignaling: CallSignaling | null = null;
  private eventHandlers: Map<string, EventHandler[]> = new Map();
  private activeCalls: Map<string, CallEvent> = new Map();

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
      enableMediaBridge: true,
      enableCallSignaling: true,
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
    
    if (this.options.enableCallSignaling) {
      this.initializeCallSignaling();
    }
  }

  private initializeCallSignaling() {
    try {
      this.callSignaling = new CallSignaling(this.baileysSock, {
        logger: this.logger
      });
      
      this.callSignaling.onCallEvent((event) => {
        this.log("CallSignaling event:", event.type);
        
        if (event.type === 'offer') {
          const callEvent: CallEvent = {
            id: event.callId,
            from: event.from,
            to: this.baileysSock.user?.id || '',
            status: 'offer',
            timestamp: Date.now(),
            isVideo: event.isVideo,
            callKey: event.callKey?.toString('hex')
          };
          
          this.activeCalls.set(event.callId, callEvent);
          this.socket?.emit('CB:call', event);
          this.emit('incoming-call', callEvent);
        }
      });
      
      this.log("CallSignaling inicializado");
    } catch (e: any) {
      this.log("Erro ao inicializar CallSignaling:", e.message);
    }
  }

  private setupSocketEvents() {
    if (!this.socket) return;

    this.socket.on("connect", () => {
      this.log("Conectado ao Voice Bridge");
      this.connectionStatus = 'connected';
      
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

    this.socket.on("makeCall", async (data: { phoneNumber: string, isVideo?: boolean }, callback?: (result: any) => void) => {
      try {
        if (this.callSignaling) {
          const result = await this.callSignaling.makeCall({
            phoneNumber: data.phoneNumber,
            isVideo: data.isVideo
          });
          callback?.({ success: true, ...result });
        } else {
          callback?.({ success: false, error: "CallSignaling não disponível" });
        }
      } catch (error: any) {
        callback?.({ success: false, error: error.message });
      }
    });

    this.socket.on("acceptCall", async (callId: string, callback?: (result: any) => void) => {
      try {
        if (this.callSignaling) {
          await this.callSignaling.acceptCall(callId);
          
          const call = this.activeCalls.get(callId);
          if (call) {
            call.status = 'connected';
            this.emit('call-accepted', call);
          }
          
          callback?.({ success: true });
        } else {
          callback?.({ success: false, error: "CallSignaling não disponível" });
        }
      } catch (error: any) {
        callback?.({ success: false, error: error.message });
      }
    });

    this.socket.on("rejectCall", async (callId: string, callback?: (result: any) => void) => {
      try {
        if (this.callSignaling) {
          await this.callSignaling.rejectCall(callId);
          
          const call = this.activeCalls.get(callId);
          if (call) {
            call.status = 'reject';
            this.emit('call-ended', call);
            this.activeCalls.delete(callId);
          }
          
          callback?.({ success: true });
        } else {
          callback?.({ success: false, error: "CallSignaling não disponível" });
        }
      } catch (error: any) {
        callback?.({ success: false, error: error.message });
      }
    });

    this.socket.on("generateMessageTag", (callback: (tag: string) => void) => {
      const tag = this.baileysSock.generateMessageTag?.() || `${Date.now()}.${Math.random()}`;
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

    this.baileysSock.ev?.on?.("call", (calls: any[]) => {
      this.log("Evento call:", calls);
      this.socket?.emit("call", calls);
      
      for (const call of calls) {
        if (call.status === 'offer') {
          const callEvent: CallEvent = {
            id: call.id,
            from: call.from?.split('@')[0] || call.from,
            to: call.chatId || '',
            status: call.status,
            timestamp: Date.now(),
            isVideo: call.isVideo,
            isGroup: call.isGroup
          };
          this.activeCalls.set(call.id, callEvent);
          this.emit('incoming-call', callEvent);
        } else if (call.status === 'accept') {
          const existing = this.activeCalls.get(call.id);
          if (existing) {
            existing.status = 'connected';
            this.emit('call-accepted', existing);
          }
        } else if (call.status === 'reject' || call.status === 'timeout') {
          const existing = this.activeCalls.get(call.id);
          if (existing) {
            existing.status = call.status;
            this.emit('call-ended', existing);
            this.activeCalls.delete(call.id);
          }
        }
      }
    });
  }

  // Event emitter methods
  public on(event: string, handler: EventHandler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  public off(event: string, handler: EventHandler) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) handlers.splice(index, 1);
    }
  }

  private emit(event: string, ...args: any[]) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(h => h(...args));
    }
  }

  // Public API
  public async makeCall(phoneNumber: string, isVideo: boolean = false): Promise<any> {
    if (this.callSignaling) {
      return this.callSignaling.makeCall({ phoneNumber, isVideo });
    }
    throw new Error("CallSignaling não disponível");
  }

  public async acceptCall(callId: string): Promise<void> {
    if (this.callSignaling) {
      await this.callSignaling.acceptCall(callId);
    } else {
      throw new Error("CallSignaling não disponível");
    }
  }

  public async rejectCall(callId: string): Promise<void> {
    if (this.callSignaling) {
      await this.callSignaling.rejectCall(callId);
    } else {
      throw new Error("CallSignaling não disponível");
    }
  }

  public getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  public getActiveCalls(): CallEvent[] {
    return Array.from(this.activeCalls.values());
  }

  public disconnect() {
    this.socket?.disconnect();
    this.socket = null;
    this.connectionStatus = 'disconnected';
    this.activeCalls.clear();
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
