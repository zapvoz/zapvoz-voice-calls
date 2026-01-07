export interface ZapVozOptions {
  serverUrl?: string;
  reconnection?: boolean;
  reconnectionAttempts?: number;
  reconnectionDelay?: number;
  timeout?: number;
  enableMediaBridge?: boolean;
  enableCallSignaling?: boolean;
}

export interface CallEvent {
  id: string;
  from: string;
  to: string;
  status: 'offer' | 'accept' | 'reject' | 'terminate' | 'timeout' | 'ringing' | 'connected';
  timestamp: number;
  isVideo?: boolean;
  isGroup?: boolean;
  callKey?: string;
  sdp?: string;
  relayData?: RelayData;
}

export interface RelayData {
  ip?: string;
  port?: string;
  token?: string;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface CallOffer {
  callId: string;
  from: string;
  fromJid: string;
  isVideo: boolean;
  isGroup: boolean;
  callKey?: Buffer;
  sdp?: string;
  timestamp: number;
}

export interface OutgoingCallOptions {
  phoneNumber: string;
  isVideo?: boolean;
}

export interface ZapVozEventMap {
  'init': (me: any, account: any, status: string) => void;
  'CB:call': (packet: any) => void;
  'CB:ack,class:call': (packet: any) => void;
  'connection.update:status': (status: ConnectionStatus) => void;
  'incoming-call': (call: CallEvent) => void;
  'call-accepted': (call: CallEvent) => void;
  'call-ended': (call: CallEvent) => void;
  'media-connected': (callId: string) => void;
  'sendNode': (stanza: any, callback?: (result: any) => void) => void;
  'generateMessageTag': (callback: (tag: string) => void) => void;
  'signalRepository:decryptMessage': (data: any, callback: (result: any) => void) => void;
  'createParticipantNodes': (data: any, callback: (result: any) => void) => void;
  'assertSessions': (jids: string[], callback: (result: any) => void) => void;
  'onWhatsApp': (jids: string[], callback: (result: any) => void) => void;
  'profilePictureUrl': (jid: string, type: string, callback: (result: any) => void) => void;
}
