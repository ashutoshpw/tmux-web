export interface ExtContext {
  session: string;
  host: string;
}

export type ExtMessage =
  | { type: 'ext:context'; context: ExtContext }
  | { type: 'ext:config';  config: unknown }
  | { type: 'ext:ready' }
  | { type: 'ext:resize';  height: number };
