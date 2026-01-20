declare module "react-native-sse" {
  interface EventSourceOptions {
    method?: string;
    headers?: Record<string, string>;
    body?: any;
    withCredentials?: boolean;
    timeout?: number;
    debug?: boolean;
  }

  interface MessageEvent {
    data: string;
  }

  type EventHandler = (event: MessageEvent) => void;

  class EventSource {
    constructor(url: string, options?: EventSourceOptions);
    addEventListener(type: string, listener: EventHandler): void;
    removeAllEventListeners?(type?: string): void;
    close(): void;
  }

  export default EventSource;
}
