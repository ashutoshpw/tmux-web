import type { ExtContext, ExtMessage } from './types.js';

type ContextCallback = (ctx: ExtContext) => void;
type ConfigCallback  = (cfg: unknown) => void | Promise<void>;
type VoidCallback    = () => void | Promise<void>;

export class ExtBridge {
  private readonly extId: string;
  private contextCb: ContextCallback | null = null;
  private configCb:  ConfigCallback  | null = null;
  private openCb:    VoidCallback    | null = null;
  private closeCb:   VoidCallback    | null = null;
  private _config:   unknown = null;

  constructor() {
    const m = window.location.pathname.match(/^\/ext\/([^/]+)\//);
    if (!m) throw new Error('[ext-sdk] cannot detect extension id from iframe URL');
    this.extId = m[1];
    window.addEventListener('message', this._onMessage.bind(this));
    window.parent.postMessage({ type: 'ext:ready' } satisfies ExtMessage, '*');
  }

  private _onMessage(event: MessageEvent) {
    const msg = event.data as ExtMessage;
    if (!msg?.type) return;

    if (msg.type === 'ext:context' && this.contextCb) {
      this.contextCb(msg.context);
    } else if (msg.type === 'ext:config') {
      this._config = msg.config;
      if (this.configCb) this.configCb(msg.config);
    } else if (msg.type === 'ext:open' && this.openCb) {
      void this.openCb();
    } else if (msg.type === 'ext:close' && this.closeCb) {
      void this.closeCb();
    }
  }

  onContext(cb: ContextCallback): void {
    this.contextCb = cb;
  }

  onConfig(cb: ConfigCallback): void {
    this.configCb = cb;
  }

  onOpen(cb: VoidCallback): void {
    this.openCb = cb;
  }

  onClose(cb: VoidCallback): void {
    this.closeCb = cb;
  }

  getConfig(): unknown {
    return this._config;
  }

  async request<T = unknown>(
    path: string,
    options?: { method?: string; body?: unknown },
  ): Promise<T> {
    const url = `/ext/${this.extId}/api${path}`;
    const init: RequestInit = { method: options?.method ?? 'GET' };

    if (options?.body !== undefined) {
      init.body    = JSON.stringify(options.body);
      init.headers = { 'Content-Type': 'application/json' };
    }

    const res = await fetch(url, init);
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`[ext-sdk] ${url} → ${res.status}: ${text}`);
    }
    return res.json() as Promise<T>;
  }

  resize(height: number): void {
    const msg: ExtMessage = { type: 'ext:resize', height };
    window.parent.postMessage(msg, '*');
  }
}
