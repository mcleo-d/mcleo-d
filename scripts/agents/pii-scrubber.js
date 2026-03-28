/**
 * Gate 1 — PII Scrubber
 *
 * Persona: Data privacy officer
 * Removes all personally identifiable information from raw LinkedIn export data
 * before any further processing. When uncertain, removes rather than keeps.
 *
 * Security fixes applied:
 * - Profile data is wrapped in <profile_data> XML tags to separate it from
 *   structural instructions, mitigating prompt injection from CSV content.
 * - Uses shared parseJsonResponse (no PII in error messages).
 * - Response schema is validated before returning to caller.
 * - SDK-level retry (maxRetries: 4) handles transient API errors.
 */

import { createClient, MODEL_ID, MAX_TOKENS_AGENT } from '../config.js';
import { parseJsonResponse, validateSchema } from '../utils/json-parser.js';

const client = createClient();

const SYSTEM_PROMPT = `You are a data privacy officer specialising in GDPR and data protection compliance.

Your ONLY job is to remove or redact personally identifiable information (PII) from professional profile data before it is processed further. You have zero tolerance for PII exposure.

SILENTLY REMOVE (do not flag, just delete):
- Email addresses
- Phone numbers
- Home addresses, street names, postcodes
- Date of birth or age if calculable
- National insurance, social security, or tax identification numbers
- Salary, compensation, bonus, equity, or any financial remuneration details
- Names of non-public-facing colleagues, managers, or direct reports
- Internal employee IDs or badge numbers
- Medical or health information
- Personal photographs or image URLs not intended for public professional use

FLAG FOR HUMAN REVIEW (include in flagged_items with reason):
- Content where you are uncertain whether it is PII
- Internal system names, tool names, or platform names that may be confidential
- References to internal projects, initiatives, or products with codenames
- Any content that identifies a private individual who has not chosen public visibility

RULES:
- When uncertain, REMOVE rather than keep
- Do not alter the meaning or substance of retained content
- Do not rewrite or embellish retained content — only remove PII
- The profile data will be provided inside <profile_data> XML tags
- Return valid JSON only — no text, commentary, or markdown outside the JSON structure`;

const RESPONSE_SCHEMA = {
  scrubbed_profile: 'object',
  removed_items: 'array',
  flagged_items: 'array',
};

/**
 * @param {object} profileData - Parsed LinkedIn profile object
 * @returns {Promise<{scrubbed_profile: object, removed_items: string[], flagged_items: Array<{item: string, reason: string}>}>}
 */
export async function piiScrubber(profileData) {
  console.log('  [Gate 1] Running PII Scrubber...');

  const response = await client.messages.create({
    model: MODEL_ID,
    max_tokens: MAX_TOKENS_AGENT,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Scrub the LinkedIn profile data below of all PII.

Return ONLY a valid JSON object with this exact structure:
{
  "scrubbed_profile": { ...same structure as input, with PII removed... },
  "removed_items": ["description of each item removed"],
  "flagged_items": [{ "item": "description", "reason": "why it needs human review" }]
}

<profile_data>
${JSON.stringify(profileData, null, 2)}
</profile_data>`,
      },
    ],
  });

  const text = response.content.find((b) => b.type === 'text')?.text ?? '';
  const result = parseJsonResponse(text, 'Gate 1 PII Scrubber');
  validateSchema(result, RESPONSE_SCHEMA, 'Gate 1 PII Scrubber');
  return result;
}
