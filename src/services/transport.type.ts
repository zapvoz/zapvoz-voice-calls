export interface ZapVozOptions {
  serverUrl?: string;
  reconnection?: boolean;
  reconnectionAttempts?: number;
  reconnectionDelay?: number;
  timeout?: number;
}

export interface CallEvent {
  id: string;
  from: string;
  to: string;
  status: 'offer' | 'accept' | 'reject' | 'terminate' | 'timeout';
  timestamp: number;
  isVideo?: boolean;
  isGroup?: boolean;
  callKey?: string;
  sdp?: string;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export interface ZapVozEventMap {
  'init': (me: any, account: any, status: string) => void;
  'CB:call': (packet: any) => void;
  'CB:ack,class:call': (packet: any) => void;
  'connection.update:status': (status: ConnectionStatus) => void;
  'sendNode': (stanza: any, callback?: (result: any) => void) => void;
  'generateMessageTag': (callback: (tag: string) => void) => void;
  'signalRepository:decryptMessage': (data: any, callback: (result: any) => void) => void;
  'createParticipantNodes': (data: any, callback: (result: any) => void) => void;
  'assertSessions': (jids: string[], callback: (result: any) => void) => void;
  'onWhatsApp': (jids: string[], callback: (result: any) => void) => void;
  'profilePictureUrl': (jid: string, type: string, callback: (result: any) => void) => void;
}
