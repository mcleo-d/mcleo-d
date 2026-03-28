/**
 * Gate 4 — Exclusion Filter
 *
 * Persona: Content exclusion specialist
 *
 * This gate ONLY excludes — it never reframes, softens, or transforms.
 * Negative content is deleted entirely, not converted into positive language.
 *
 * Also excludes:
 * - Negative comments by the profile owner or by others
 * - Reposts or shared content that did not originate with the profile owner
 * - Any loose comments or ambiguous statements that carry PR risk
 *
 * Security fixes applied:
 * - Profile data wrapped in <profile_data> XML tags (prompt injection mitigation).
 * - Uses shared parseJsonResponse (no PII in error messages).
 * - Response schema validated before use.
 * - SDK-level retry (maxRetries: 4).
 */

import { createClient, MODEL_ID, MAX_TOKENS_AGENT } from '../config.js';
import { parseJsonResponse, validateSchema } from '../utils/json-parser.js';

const client = createClient();

const SYSTEM_PROMPT = `You are a content exclusion specialist.

Your ONLY job is to REMOVE content that should not appear in a public professional profile. You do not reframe, soften, or transform content — you delete it entirely.

ALWAYS REMOVE (entirely, with no replacement):
- Any negative comment or opinion expressed by the profile owner about any person, company, product, technology, or situation
- Any negative comment made by others that has been included (e.g. quotes, testimonials with negative elements)
- Reposts, shares, or content that did not originate with the profile owner — if it is not their own original work or statement, remove it
- Any content perceived as critical, pessimistic, or controversial in tone
- Ambiguous statements that could be read as negative, passive-aggressive, or critical depending on context
- Complaints, frustrations, grievances, or expressions of dissatisfaction — even if mild
- Content that implies comparison unfavourable to others
- Sarcasm, irony, or self-deprecation that could be misread
- Any loose comment that could be quoted out of context to cause PR harm
- References to failures, setbacks, or problems — even if framed as learning experiences

KEEP:
- Positive achievements, roles, and contributions that are wholly original to the profile owner
- Forward-looking statements about goals, community, and growth
- Facts about organisations, events, and projects where the tone is neutral or positive
- Content that celebrates others without implicit criticism of anyone else

RULES:
- When in doubt, EXCLUDE
- Do not add any new content — only remove
- Do not rewrite negative content into positive content — delete it entirely
- The profile data will be provided inside <profile_data> XML tags
- Return valid JSON only — no text, commentary, or markdown outside the JSON structure`;

const RESPONSE_SCHEMA = {
  filtered_profile: 'object',
  excluded_items: 'array',
};

/**
 * @param {object} tonedProfile - Content-toned profile from Gate 3
 * @returns {Promise<{filtered_profile: object, excluded_items: string[]}>}
 */
export async function exclusionFilter(tonedProfile) {
  console.log('  [Gate 4] Running Exclusion Filter...');

  const response = await client.messages.create({
    model: MODEL_ID,
    max_tokens: MAX_TOKENS_AGENT,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Apply the exclusion filter to the profile content below.

Remove ALL negative content, reposts, others' comments, and ambiguous statements entirely. Do not reframe — delete.

Return ONLY a valid JSON object with this exact structure:
{
  "filtered_profile": { ...same structure as input, with excluded items removed... },
  "excluded_items": ["description of each item excluded and why"]
}

<profile_data>
${JSON.stringify(tonedProfile, null, 2)}
</profile_data>`,
      },
    ],
  });

  const text = response.content.find((b) => b.type === 'text')?.text ?? '';
  const result = parseJsonResponse(text, 'Gate 4 Exclusion Filter');
  validateSchema(result, RESPONSE_SCHEMA, 'Gate 4 Exclusion Filter');

  console.log(`  [Gate 4] ${result.excluded_items?.length ?? 0} item(s) excluded.`);
  return result;
}
