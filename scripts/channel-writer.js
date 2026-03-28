/**
 * Channel Writer
 *
 * Generates tailored output for each publication channel from the filtered profile.
 * Each channel has its own format constraints and audience considerations.
 *
 * Channels:
 *   1. GitHub profile README.md
 *   2. GitHub bio (160 chars max)
 *   3. Speaker bio (3rd-person, 100–150 words)
 *   4. Email signature (plain text)
 *   5. dev.to / Hashnode bio
 *
 * Security fixes applied:
 * - System prompt added to all Claude calls (was missing previously, maximum
 *   prompt injection exposure in the original version).
 * - Profile data wrapped in <profile_data> XML tags to separate data from
 *   structural instructions.
 * - generateChannelOutputs() returns content WITHOUT writing to disk.
 *   Writing is deferred to writeChannelOutputs(), called only AFTER human approval
 *   in update-profile.js. This ensures no files exist on disk that the human
 *   has not reviewed and approved.
 * - SDK-level retry (maxRetries: 4).
 */

import { createClient, MODEL_ID, MAX_TOKENS_CHANNEL } from './config.js';
import fs from 'fs';
import path from 'path';

const client = createClient();

const CHANNEL_SYSTEM_PROMPT = `You are a professional profile writer for open source developer communities.

You write content that is:
- Warm, human, and community-focused — not corporate
- Inclusive and accessible to a global developer audience
- Factually accurate — never invent or embellish
- Appropriate for the specific channel format and word limits given

You will receive profile data inside <profile_data> XML tags. Use only the information provided.
Return only the requested content, nothing else.`;

const CHANNEL_PROMPTS = {
  readme: {
    label: 'GitHub Profile README',
    instruction: `Write a GitHub profile README.md in Markdown.

FORMAT:
- Opening: one warm, human greeting sentence (maximum 2 emojis total, optional)
- Include a LinkedIn badge (use: https://img.shields.io/badge/-jamesmcleod-blue?style=flat-square&logo=Linkedin&logoColor=white&link=https://www.linkedin.com/in/jamesmcleod/)
- Sections with ## headings: what I do, community involvement, talks/articles/podcasts, connect
- Each section uses a short bullet list — no paragraph walls
- End with a connect section with GitHub and LinkedIn links
- Maximum 300 words of body text
- Tone: warm, open-source-community-first, contribution-focused

AUDIENCE: GitHub users who visit this profile — developers, maintainers, open source contributors.

Return only the Markdown content.`,
  },

  githubBio: {
    label: 'GitHub Bio (160 chars)',
    instruction: `Write a GitHub profile bio — maximum 160 characters including spaces.

FORMAT:
- Single line, no markdown
- Lead with role and community focus, not company name
- Conversational and human
- No hashtags

Return only the bio text, nothing else.`,
  },

  speakerBio: {
    label: 'Speaker Bio',
    instruction: `Write a professional speaker bio in plain Markdown.

FORMAT:
- 3rd person ("James McLeod is...")
- 100–150 words
- Opens with current role and what makes it relevant to an open source or tech conference audience
- Includes 2–3 notable community contributions or speaking highlights
- Ends with a forward-looking sentence about current focus
- No bullet points — flowing prose
- Tone: professional but human, not corporate

Return only the bio text.`,
  },

  emailSignature: {
    label: 'Email Signature',
    instruction: `Write a plain text email signature.

FORMAT:
- Name on first line
- Role and organisation on second line
- One or two community roles/affiliations on third line (most relevant only)
- LinkedIn URL on its own line
- GitHub profile URL on its own line
- No images, no HTML, no decorative characters
- Maximum 6 lines total

Return only the signature text, nothing else.`,
  },

  devtoBio: {
    label: 'dev.to / Hashnode Bio',
    instruction: `Write a short bio for a developer blogging platform (dev.to / Hashnode).

FORMAT:
- 2–3 sentences, plain text
- Open source and community-first framing
- Mention current role briefly, then pivot to what you actually do in the community
- Warm, developer-friendly tone
- No markdown, no bullet points
- Maximum 100 words

Return only the bio text, nothing else.`,
  },
};

/**
 * Generate content for all output channels. Does NOT write files to disk.
 * Call writeChannelOutputs() after human approval to persist.
 *
 * @param {object} filteredProfile - Fully filtered profile from Gate 4
 * @returns {Promise<object>} Map of channel name to generated content string
 */
export async function generateChannelOutputs(filteredProfile) {
  console.log('\nGenerating channel outputs...');

  const profileContext = JSON.stringify(filteredProfile, null, 2);
  const outputs = {};

  for (const [channelKey, channel] of Object.entries(CHANNEL_PROMPTS)) {
    console.log(`  Generating: ${channel.label}...`);

    const response = await client.messages.create({
      model: MODEL_ID,
      max_tokens: MAX_TOKENS_CHANNEL,
      system: CHANNEL_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Generate content for the following channel using the profile data provided.

CHANNEL INSTRUCTIONS:
${channel.instruction}

<profile_data>
${profileContext}
</profile_data>`,
        },
      ],
    });

    const content = response.content.find((b) => b.type === 'text')?.text ?? '';
    outputs[channelKey] = content.trim();
  }

  console.log('  ✓ Channel content generated (not yet written to disk)');
  return outputs;
}

/**
 * Write approved channel outputs to disk. Called only after human approval.
 *
 * @param {object} outputs - Map of channel name to content string
 * @param {string} outputsDir - Path to the outputs directory
 */
export function writeChannelOutputs(outputs, outputsDir) {
  fs.mkdirSync(outputsDir, { recursive: true });
  writeOutput(outputsDir, 'github-bio.txt', outputs.githubBio);
  writeOutput(outputsDir, 'speaker-bio.md', outputs.speakerBio);
  writeOutput(outputsDir, 'email-signature.txt', outputs.emailSignature);
  writeOutput(outputsDir, 'devto-bio.md', outputs.devtoBio);
  console.log(`  ✓ Output files written to ${outputsDir}`);
}

function writeOutput(dir, filename, content) {
  if (content) {
    fs.writeFileSync(path.join(dir, filename), content + '\n', 'utf-8');
  }
}
