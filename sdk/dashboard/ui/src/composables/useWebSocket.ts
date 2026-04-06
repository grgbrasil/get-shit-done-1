import { ref } from 'vue';

type EventHandler = (data: unknown) => void;

const connected = ref(false);
let ws: WebSocket | null = null;
const handlers = new Map<string, Set<EventHandler>>();

export function useWebSocket() {
  function connect(url?: string) {
    const wsUrl = url || `ws://${window.location.host}/ws`;
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      connected.value = true;
    };

    ws.onclose = () => {
      connected.value = false;
      setTimeout(() => connect(url), 3000);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const eventHandlers = handlers.get(msg.event);
        if (eventHandlers) {
          eventHandlers.forEach((handler) => handler(msg.data));
        }
      } catch {
        // ignore malformed messages
      }
    };
  }

  function on(event: string, handler: EventHandler) {
    if (!handlers.has(event)) {
      handlers.set(event, new Set());
    }
    handlers.get(event)!.add(handler);
  }

  function off(event: string, handler: EventHandler) {
    handlers.get(event)?.delete(handler);
  }

  return { connected, connect, on, off };
}
