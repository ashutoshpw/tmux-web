/**
 * @tmux-web/ext-sdk — extension SDK for tmux-web.
 */
import { ExtBridge } from './bridge.js';

export type { ExtContext, ExtMessage } from './types.js';
export { ExtBridge };

let _bridge: ExtBridge | null = null;

export function createExtension(): ExtBridge {
  if (_bridge) throw new Error('[ext-sdk] createExtension() called more than once');
  _bridge = new ExtBridge();
  return _bridge;
}
