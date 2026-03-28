/**
 * Pipeline configuration — single source of truth for model, token limits,
 * and client construction. All agent files import from here.
 */

import Anthropic from '@anthropic-ai/sdk';

/** Claude model used for all pipeline gates and channel writing. */
export const MODEL_ID = 'claude-opus-4-6';

/** Default max_tokens for agent gate calls. */
export const MAX_TOKENS_AGENT = 8192;

/** Default max_tokens for channel writing calls. */
export const MAX_TOKENS_CHANNEL = 2048;

/**
 * Create an Anthropic client with SDK-level retry configured.
 * The SDK automatically retries 429 (rate limit) and 5xx errors
 * with exponential backoff — no custom retry loop needed.
 */
export function createClient() {
  return new Anthropic({ maxRetries: 4 });
}
