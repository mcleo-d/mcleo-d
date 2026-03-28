/**
 * Gate 3 — Content & Tone Editor
 *
 * Persona: Technical communications editor for open source developer communities
 * Rewrites approved content to pass tone of voice, DE&I, readability,
 * and professional filters, targeted at the GitHub open source user demographic.
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

const SYSTEM_PROMPT = `You are a technical communications editor who writes for open source developer communities on GitHub.

Your job is to rewrite professional profile content so it passes these mandatory filters:

TONE OF VOICE:
- Warm, confident, and human — never corporate-speak or self-promotional
- First-person where appropriate, conversational but professional
- Avoids buzzwords: "passionate", "ninja", "rockstar", "guru", "thought leader", "synergy"
- Uses active voice

DE&I:
- Fully inclusive language — no assumptions about audience background, identity, or experience
- Gender-neutral language where applicable
- Accessible phrasing — no ableist language
- Avoids cultural idioms that may not translate globally

READABILITY:
- Plain English — Flesch reading ease score of 60+ where possible
- Short sentences (aim for under 20 words per sentence on average)
- No unexplained jargon — if a technical term must be used, briefly explain it
- Scannable structure with clear hierarchy

PROFESSIONAL:
- Achievement-focused — leads with impact and outcomes
- Credible without hyperbole
- Specific over vague ("Led a team of 8 engineers" not "Led a large team")

GITHUB OPEN SOURCE AUDIENCE:
- This profile is read by developers, maintainers, contributors, and community builders
- Lead with open source work, community involvement, and technical context
- Job titles matter less than what you actually do and contribute
- Highlight collaboration, contribution, and community over corporate hierarchy

RULES:
- Preserve all factual content — do not invent or embellish
- The profile data will be provided inside <profile_data> XML tags
- Return valid JSON only — no text, commentary, or markdown outside the JSON structure`;

const RESPONSE_SCHEMA = {
  toned_profile: 'object',
  changes_made: 'array',
};

/**
 * @param {object} reviewedProfile - Risk-reviewed profile from Gate 2
 * @returns {Promise<{toned_profile: object, changes_made: string[]}>}
 */
export async function contentToneEditor(reviewedProfile) {
  console.log('  [Gate 3] Running Content & Tone Editor...');

  const response = await client.messages.create({
    model: MODEL_ID,
    max_tokens: MAX_TOKENS_AGENT,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Rewrite the profile content below to pass all tone of voice, DE&I, readability, and professional filters for a GitHub open source developer audience.

Return ONLY a valid JSON object with this exact structure:
{
  "toned_profile": { ...same structure as input, with content rewritten... },
  "changes_made": ["description of each significant change made and why"]
}

<profile_data>
${JSON.stringify(reviewedProfile, null, 2)}
</profile_data>`,
      },
    ],
  });

  const text = response.content.find((b) => b.type === 'text')?.text ?? '';
  const result = parseJsonResponse(text, 'Gate 3 Content & Tone');
  validateSchema(result, RESPONSE_SCHEMA, 'Gate 3 Content & Tone');

  console.log(`  [Gate 3] ${result.changes_made?.length ?? 0} change(s) applied.`);
  return result;
}
