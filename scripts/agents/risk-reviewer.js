/**
 * Gate 2 — Security & Reputational Risk Reviewer
 *
 * Persona: Corporate communications security reviewer for a regulated financial institution
 * Scores content for legal, reputational, and competitive risk.
 * Does NOT rewrite — only flags and scores.
 * Pipeline halts on any HIGH risk finding.
 *
 * Security fixes applied:
 * - Profile data wrapped in <profile_data> XML tags (prompt injection mitigation).
 * - Uses shared parseJsonResponse (no PII in error messages).
 * - Response schema validated before use.
 * - pipeline_blocked is ENFORCED DETERMINISTICALLY IN CODE by checking whether
 *   any risk_items entry has risk_level === 'HIGH'. The LLM's own pipeline_blocked
 *   value is ignored — it cannot override the code-side check.
 * - SDK-level retry (maxRetries: 4).
 */

import { createClient, MODEL_ID, MAX_TOKENS_AGENT } from '../config.js';
import { parseJsonResponse, validateSchema } from '../utils/json-parser.js';

const client = createClient();

const SYSTEM_PROMPT = `You are a corporate communications security reviewer for a regulated financial institution (NatWest Group).

Your job is to identify any content that poses legal, reputational, or competitive risk to the individual (James McLeod) or their employer (NatWest Group). You do NOT rewrite content — you only score and flag it.

RISK SCORING:
- LOW: No concern. Content is safe to publish.
- MEDIUM: Minor concern. Recommend rephrasing but not blocking.
- HIGH: Serious concern. Must be removed before publication.

FLAG AS HIGH RISK:
- References to unannounced NatWest Group initiatives, strategies, products, or internal roadmaps
- Confidential internal project names, codenames, or product identifiers
- Content that reveals internal organisational structure, headcount, or reporting lines
- Claims about competitors that could be used in legal or PR disputes
- Statements that could embarrass NatWest Group if quoted in the press or on social media
- Content that implies criticism of the employer, regulators, or industry peers
- Any statement that is legally ambiguous or creates compliance risk for a regulated financial institution
- Content that could be used adversarially against James McLeod or his followers

FLAG AS MEDIUM RISK:
- Statements that are loosely worded and could be misquoted or taken out of context
- References to internal tools or platforms that are not publicly known
- Opinions stated as fact that could attract controversy

RULES:
- Evaluate every section of the profile
- The profile data will be provided inside <profile_data> XML tags
- Return valid JSON only — no text, commentary, or markdown outside the JSON structure`;

const RESPONSE_SCHEMA = {
  reviewed_profile: 'object',
  overall_risk: 'string',
  risk_items: 'array',
};

/**
 * @param {object} scrubbedProfile - PII-scrubbed profile from Gate 1
 * @returns {Promise<{reviewed_profile: object, overall_risk: string, risk_items: Array<{content: string, risk_level: string, reason: string}>, pipeline_blocked: boolean}>}
 */
export async function riskReviewer(scrubbedProfile) {
  console.log('  [Gate 2] Running Security & Reputational Risk Reviewer...');

  const response = await client.messages.create({
    model: MODEL_ID,
    max_tokens: MAX_TOKENS_AGENT,
    thinking: { type: 'adaptive' },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Review the profile data below for security and reputational risk.

Return ONLY a valid JSON object with this exact structure:
{
  "reviewed_profile": { ...the profile with HIGH risk items removed... },
  "overall_risk": "LOW" | "MEDIUM" | "HIGH",
  "risk_items": [
    {
      "content": "the specific content flagged",
      "risk_level": "LOW" | "MEDIUM" | "HIGH",
      "reason": "explanation of the risk"
    }
  ]
}

Remove ALL HIGH risk items from "reviewed_profile".
Keep MEDIUM risk items in "reviewed_profile" but include them in "risk_items".

<profile_data>
${JSON.stringify(scrubbedProfile, null, 2)}
</profile_data>`,
      },
    ],
  });

  const text = response.content.find((b) => b.type === 'text')?.text ?? '';
  const result = parseJsonResponse(text, 'Gate 2 Risk Reviewer');
  validateSchema(result, RESPONSE_SCHEMA, 'Gate 2 Risk Reviewer');

  // DETERMINISTIC ENFORCEMENT: pipeline_blocked is computed in code, never trusted
  // from LLM output. This prevents prompt injection from manipulating the gate.
  const highRiskItems = (result.risk_items ?? []).filter((i) => i.risk_level === 'HIGH');
  result.pipeline_blocked = highRiskItems.length > 0;

  if (result.pipeline_blocked) {
    console.log('\n  [Gate 2] ⛔ Pipeline BLOCKED — HIGH risk content found:\n');
    highRiskItems.forEach((item) => {
      console.log(`    • ${item.content}`);
      console.log(`      Reason: ${item.reason}\n`);
    });
  } else {
    console.log(`  [Gate 2] Overall risk: ${result.overall_risk}`);
    if (result.risk_items?.length > 0) {
      console.log(`  [Gate 2] ${result.risk_items.length} item(s) flagged for awareness.`);
    }
  }

  return result;
}
