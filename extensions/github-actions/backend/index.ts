/**
 * @tmux-web/ext-sdk
 *
 * Extension SDK for tmux-web. Drop this into your extension UI's entry point.
 *
 * @example
 * import { createExtension } from '@tmux-web/ext-sdk';
 *
 * const ext = createExtension('github-actions');
 *
 * ext.onContext(ctx => {
 *   console.log('attached to session:', ctx.session);
 * });
 *
 * ext.onConfig(async cfg => {
 *   const data = await ext.request('/runs?repo=' + cfg.repo);
 *   renderRuns(data.workflow_runs);
 *   ext.resize(document.body.scrollHeight);
 * });
 */
import { ExtBridge } from './bridge';

export type { ExtContext, ExtMessage } from './types';
export { ExtBridge };

let _bridge: ExtBridge | null = null;

/**
 * Initialize the extension. Call exactly once at the top of your entry point.
 * Returns an ExtBridge you use for the lifetime of the extension.
 */
export function createExtension(extensionId: string): ExtBridge {
  if (_bridge) {
    throw new Error('[ext-sdk] createExtension() called more than once');
  }
  _bridge = new ExtBridge(extensionId);
  return _bridge;
}
