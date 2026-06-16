import type { TelemetrySnapshot } from './types';

const WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/telemetry`;

export type WsStatus = 'connecting' | 'connected' | 'disconnected';

export class TelemetryWebSocket {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = true;
  private onSnapshot: (snapshot: TelemetrySnapshot) => void;
  private onStatusChange: (status: WsStatus) => void;

  constructor(
    onSnapshot: (snapshot: TelemetrySnapshot) => void,
    onStatusChange: (status: WsStatus) => void,
  ) {
    this.onSnapshot = onSnapshot;
    this.onStatusChange = onStatusChange;
  }

  connect(): void {
    this.shouldReconnect = true;
    this.onStatusChange('connecting');
    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      this.onStatusChange('connected');
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const snapshot = JSON.parse(event.data) as TelemetrySnapshot;
        this.onSnapshot(snapshot);
      } catch {
        // ignore malformed messages
      }
    };

    this.ws.onclose = () => {
      this.onStatusChange('disconnected');
      if (this.shouldReconnect) {
        this.reconnectTimer = setTimeout(() => this.connect(), 2000);
      }
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }
}
