import type { CallOffer, OutgoingCallOptions } from "./transport.type";

interface CallSignalingConfig {
  logger?: boolean;
}

type CallEventHandler = (event: any) => void;

export class CallSignaling {
  private sock: any;
  private config: CallSignalingConfig;
  private pendingCalls: Map<string, CallOffer> = new Map();
  private eventHandler: CallEventHandler | null = null;

  constructor(sock: any, config: CallSignalingConfig = {}) {
    this.sock = sock;
    this.config = config;
    this.setupCallListeners();
  }

  private log(...args: any[]) {
    if (this.config.logger) {
      console.log("[CallSignaling]", ...args);
    }
  }

  private setupCallListeners() {
    if (this.sock.ws) {
      this.sock.ws.on?.("CB:call", (node: any) => {
        this.handleCallNode(node);
      });

      this.sock.ws.on?.("CB:ack,class:call", (node: any) => {
        this.handleCallAck(node);
      });
    }

    this.sock.ev?.on?.("call", (calls: any[]) => {
      for (const call of calls) {
        if (call.status === "offer") {
          const offer: CallOffer = {
            callId: call.id,
            from: call.from?.split("@")[0] || call.from,
            fromJid: call.from,
            isVideo: call.isVideo || false,
            isGroup: call.isGroup || false,
            timestamp: Date.now()
          };
          
          this.pendingCalls.set(call.id, offer);
          this.emitEvent({ type: "offer", ...offer });
        }
      }
    });
  }

  private handleCallNode(node: any) {
    this.log("CB:call node:", JSON.stringify(node).substring(0, 500));
    
    if (!node.content || !Array.isArray(node.content)) return;
    
    for (const child of node.content) {
      if (child.tag === "offer") {
        const callId = child.attrs?.["call-id"];
        const from = node.attrs?.from;
        
        if (callId && from) {
          const offer = this.parseCallOffer(callId, from, child);
          if (offer) {
            this.pendingCalls.set(callId, offer);
            this.emitEvent({ type: "offer", ...offer });
          }
        }
      } else if (child.tag === "accept") {
        const callId = child.attrs?.["call-id"];
        this.log("Call accepted:", callId);
        this.emitEvent({ type: "accept", callId });
      } else if (child.tag === "terminate") {
        const callId = child.attrs?.["call-id"];
        this.log("Call terminated:", callId);
        this.pendingCalls.delete(callId);
        this.emitEvent({ type: "terminate", callId });
      }
    }
  }

  private parseCallOffer(callId: string, from: string, offerNode: any): CallOffer | null {
    try {
      let isVideo = false;
      let callKey: Buffer | undefined;
      
      if (offerNode.content && Array.isArray(offerNode.content)) {
        for (const child of offerNode.content) {
          if (child.tag === "video") {
            isVideo = true;
          }
          if (child.tag === "enc" && child.content) {
            // Encrypted call key - would need Signal decryption
            this.log("Encrypted call data found");
          }
        }
      }

      return {
        callId,
        from: from.split("@")[0],
        fromJid: from,
        isVideo,
        isGroup: from.includes("@g.us"),
        callKey,
        timestamp: Date.now()
      };
    } catch (e: any) {
      this.log("Error parsing offer:", e.message);
      return null;
    }
  }

  private handleCallAck(node: any) {
    this.log("Call ACK:", JSON.stringify(node).substring(0, 200));
  }

  private generateCallId(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  }

  private generateMessageTag(): string {
    return `${Date.now()}.${Math.floor(Math.random() * 1000000)}`;
  }

  private formatToJid(phoneNumber: string): string {
    let clean = phoneNumber.replace(/\D/g, '');
    if (!clean.startsWith('55') && clean.length >= 10 && clean.length <= 11) {
      clean = '55' + clean;
    }
    return `${clean}@s.whatsapp.net`;
  }

  public async makeCall(options: OutgoingCallOptions): Promise<{ callId: string; success: boolean }> {
    const { phoneNumber, isVideo = false } = options;
    const callId = this.generateCallId();
    const toJid = this.formatToJid(phoneNumber);
    const me = this.sock.user?.id;

    if (!me) {
      throw new Error("Usuário não autenticado");
    }

    this.log(`Iniciando chamada para ${toJid}`);

    // Get device JIDs
    let deviceJids = [toJid];
    try {
      if (this.sock.getUSyncDevices) {
        const devices = await this.sock.getUSyncDevices([toJid], true, false);
        if (devices?.length) {
          deviceJids = devices.map((d: any) => d.jid || `${d.user}:${d.device || 0}@s.whatsapp.net`);
        }
      }
    } catch (e) {
      this.log("Using primary JID only");
    }

    // Assert E2E sessions
    try {
      await this.sock.assertSessions(deviceJids, false);
    } catch (e) {
      this.log("Session assertion warning:", (e as Error).message);
    }

    // Generate call key
    const callKey = new Uint8Array(32);
    crypto.getRandomValues(callKey);

    // Build offer content
    const offerContent: any[] = [
      { tag: "audio", attrs: { enc: "opus", rate: "16000" } },
      { tag: "audio", attrs: { enc: "opus", rate: "8000" } },
      { tag: "net", attrs: { medium: "3" } },
      { tag: "capability", attrs: { ver: "1" }, content: Buffer.from([1, 4, 255, 131, 207, 4]) },
      { tag: "encopt", attrs: { keygen: "2" } }
    ];

    if (isVideo) {
      offerContent.push({ tag: "video", attrs: { enc: "vp8" } });
    }

    // Build call node
    const callNode = {
      tag: "call",
      attrs: {
        to: toJid,
        id: this.generateMessageTag()
      },
      content: [{
        tag: "offer",
        attrs: {
          "call-id": callId,
          "call-creator": me
        },
        content: offerContent
      }]
    };

    // Send call
    try {
      if (this.sock.query) {
        await this.sock.query(callNode);
      } else if (this.sock.sendNode) {
        await this.sock.sendNode(callNode);
      } else {
        throw new Error("Nenhum método de envio disponível");
      }

      this.log(`Chamada ${callId} enviada`);
      return { callId, success: true };
    } catch (e: any) {
      this.log("Erro ao enviar chamada:", e.message);
      throw e;
    }
  }

  public async acceptCall(callId: string): Promise<void> {
    const pending = this.pendingCalls.get(callId);
    if (!pending) {
      throw new Error("Chamada não encontrada");
    }

    const me = this.sock.user?.id;
    if (!me) {
      throw new Error("Usuário não autenticado");
    }

    const acceptNode = {
      tag: "call",
      attrs: {
        to: pending.fromJid,
        id: this.generateMessageTag()
      },
      content: [{
        tag: "accept",
        attrs: {
          "call-id": callId,
          "call-creator": pending.fromJid
        },
        content: [
          { tag: "audio", attrs: { enc: "opus", rate: "16000" } },
          { tag: "audio", attrs: { enc: "opus", rate: "8000" } }
        ]
      }]
    };

    try {
      if (this.sock.query) {
        await this.sock.query(acceptNode);
      } else if (this.sock.sendNode) {
        await this.sock.sendNode(acceptNode);
      }

      this.log(`Chamada ${callId} aceita`);
      this.pendingCalls.delete(callId);
    } catch (e: any) {
      this.log("Erro ao aceitar chamada:", e.message);
      throw e;
    }
  }

  public async rejectCall(callId: string, reason: string = "busy"): Promise<void> {
    const pending = this.pendingCalls.get(callId);
    if (!pending) {
      throw new Error("Chamada não encontrada");
    }

    const me = this.sock.user?.id;
    if (!me) {
      throw new Error("Usuário não autenticado");
    }

    const rejectNode = {
      tag: "call",
      attrs: {
        to: pending.fromJid,
        id: this.generateMessageTag()
      },
      content: [{
        tag: "reject",
        attrs: {
          "call-id": callId,
          "call-creator": pending.fromJid,
          reason
        }
      }]
    };

    try {
      if (this.sock.query) {
        await this.sock.query(rejectNode);
      } else if (this.sock.sendNode) {
        await this.sock.sendNode(rejectNode);
      }

      this.log(`Chamada ${callId} rejeitada`);
      this.pendingCalls.delete(callId);
    } catch (e: any) {
      this.log("Erro ao rejeitar chamada:", e.message);
      throw e;
    }
  }

  public async terminateCall(callId: string, toJid: string): Promise<void> {
    const me = this.sock.user?.id;
    if (!me) {
      throw new Error("Usuário não autenticado");
    }

    const terminateNode = {
      tag: "call",
      attrs: {
        to: toJid,
        id: this.generateMessageTag()
      },
      content: [{
        tag: "terminate",
        attrs: {
          "call-id": callId,
          "call-creator": me
        }
      }]
    };

    try {
      if (this.sock.query) {
        await this.sock.query(terminateNode);
      } else if (this.sock.sendNode) {
        await this.sock.sendNode(terminateNode);
      }

      this.log(`Chamada ${callId} terminada`);
      this.pendingCalls.delete(callId);
    } catch (e: any) {
      this.log("Erro ao terminar chamada:", e.message);
      throw e;
    }
  }

  public onCallEvent(handler: CallEventHandler) {
    this.eventHandler = handler;
  }

  private emitEvent(event: any) {
    if (this.eventHandler) {
      this.eventHandler(event);
    }
  }

  public getPendingCall(callId: string): CallOffer | undefined {
    return this.pendingCalls.get(callId);
  }

  public getPendingCalls(): CallOffer[] {
    return Array.from(this.pendingCalls.values());
  }
}
