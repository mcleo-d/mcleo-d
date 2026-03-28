#!/usr/bin/env node
/**
 * update-profile.js — Main Orchestrator
 *
 * Runs the full LinkedIn-to-profile automation pipeline:
 *   CSV Parse → Gate 1 (PII) → Gate 2 (Risk) → Gate 3 (Tone) → Gate 4 (Exclusion)
 *     → Channel Generation → Human Review → Write Files → Commit & Push
 *
 * Usage:
 *   npm run update           — Full pipeline with commit on approval
 *   npm run update:dry-run   — Full pipeline, no files written or committed
 *
 * Prerequisites:
 *   ANTHROPIC_API_KEY must be set in environment
 *   LinkedIn CSV files must be in imports/
 *
 * Security fixes applied:
 * - Shell injection (CRITICAL): all git operations use spawnSync with argument
 *   arrays instead of shell-interpolated strings. Branch name is validated
 *   against an allowlist pattern before use.
 * - API key is trimmed and format-validated before use.
 * - Output files are written ONLY after human approval, not before.
 * - On rejection, no output files exist on disk (nothing to clean up).
 */

import { parseLinkedInCSV } from './csv-parser.js';
import { piiScrubber } from './agents/pii-scrubber.js';
import { riskReviewer } from './agents/risk-reviewer.js';
import { contentToneEditor } from './agents/content-tone.js';
import { exclusionFilter } from './agents/exclusion-filter.js';
import { generateChannelOutputs, writeChannelOutputs } from './channel-writer.js';
import { reviewGate } from './review-gate.js';

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const IMPORTS_DIR = path.join(ROOT_DIR, 'imports');
const OUTPUTS_DIR = path.join(ROOT_DIR, 'outputs');
const README_PATH = path.join(ROOT_DIR, 'README.md');

const isDryRun = process.argv.includes('--dry-run');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Run a git command using an argument array (no shell interpolation).
 * Throws on non-zero exit.
 */
function git(args, cwd = ROOT_DIR) {
  const result = spawnSync('git', args, { cwd, stdio: 'inherit', encoding: 'utf-8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} exited with status ${result.status}`);
  }
  return result;
}

/**
 * Get current branch name and validate it against an allowlist pattern.
 * Rejects any branch name containing shell metacharacters.
 */
function getSafeBranchName(cwd = ROOT_DIR) {
  const result = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd,
    encoding: 'utf-8',
  });

  if (result.status !== 0) {
    throw new Error('Could not determine current git branch.');
  }

  const branch = result.stdout.trim();

  // Allowlist: alphanumeric, slash, hyphen, underscore, dot only
  if (!/^[a-zA-Z0-9/_.\-]+$/.test(branch)) {
    throw new Error(
      `Branch name "${branch}" contains unexpected characters and cannot be used safely.`
    );
  }

  return branch;
}

/**
 * Validate the Anthropic API key format before making any API calls.
 */
function validateApiKey() {
  const raw = process.env.ANTHROPIC_API_KEY;
  const key = raw?.trim();

  if (!key) {
    console.error('Error: ANTHROPIC_API_KEY is not set.');
    console.error('Set it with: export ANTHROPIC_API_KEY=your_api_key_here');
    process.exit(1);
  }

  if (!key.startsWith('sk-ant-')) {
    console.error('Error: ANTHROPIC_API_KEY does not appear to be a valid Anthropic API key.');
    console.error('Expected format: sk-ant-...');
    process.exit(1);
  }

  // Re-export trimmed key so the SDK picks up the clean value
  process.env.ANTHROPIC_API_KEY = key;
}

// ─── Main Pipeline ────────────────────────────────────────────────────────────

async function main() {
  console.log('\n' + '═'.repeat(67));
  console.log('  LinkedIn → Profile Pipeline');
  console.log('═'.repeat(67) + '\n');

  validateApiKey();

  if (isDryRun) {
    console.log('  Mode: DRY RUN — pipeline will run but nothing will be written or committed.\n');
  }

  // ── Step 1: Parse LinkedIn CSV ──────────────────────────────────────────
  console.log('Step 1/6 — Parsing LinkedIn CSV export...\n');
  let rawProfile;
  try {
    rawProfile = parseLinkedInCSV(IMPORTS_DIR);
  } catch (err) {
    console.error(`\n✗ CSV parsing failed: ${err.message}`);
    process.exit(1);
  }

  // ── Step 2: Gate 1 — PII Scrubber ──────────────────────────────────────
  console.log('\nStep 2/6 — Gate 1: PII Scrubber...\n');
  let piiResult;
  try {
    piiResult = await piiScrubber(rawProfile);
  } catch (err) {
    console.error(`\n✗ Gate 1 failed: ${err.message}`);
    process.exit(1);
  }

  // ── Step 3: Gate 2 — Risk Reviewer ─────────────────────────────────────
  console.log('\nStep 3/6 — Gate 2: Security & Reputational Risk Reviewer...\n');
  let riskResult;
  try {
    riskResult = await riskReviewer(piiResult.scrubbed_profile);
  } catch (err) {
    console.error(`\n✗ Gate 2 failed: ${err.message}`);
    process.exit(1);
  }

  if (riskResult.pipeline_blocked) {
    console.error('\n✗ Pipeline halted by Gate 2 — HIGH risk content detected.');
    console.error('  Review the flagged items above, update your LinkedIn data, and re-run.');
    process.exit(1);
  }

  // ── Step 4: Gate 3 — Content & Tone Editor ─────────────────────────────
  console.log('\nStep 4/6 — Gate 3: Content & Tone Editor...\n');
  let toneResult;
  try {
    toneResult = await contentToneEditor(riskResult.reviewed_profile);
  } catch (err) {
    console.error(`\n✗ Gate 3 failed: ${err.message}`);
    process.exit(1);
  }

  // ── Step 5: Gate 4 — Exclusion Filter ──────────────────────────────────
  console.log('\nStep 5/6 — Gate 4: Exclusion Filter...\n');
  let exclusionResult;
  try {
    exclusionResult = await exclusionFilter(toneResult.toned_profile);
  } catch (err) {
    console.error(`\n✗ Gate 4 failed: ${err.message}`);
    process.exit(1);
  }

  // ── Step 6: Generate Channel Content (no writes yet) ───────────────────
  console.log('\nStep 6/6 — Generating channel content...\n');
  let channelOutputs;
  try {
    channelOutputs = await generateChannelOutputs(exclusionResult.filtered_profile);
  } catch (err) {
    console.error(`\n✗ Channel generation failed: ${err.message}`);
    process.exit(1);
  }

  const proposedReadme = channelOutputs.readme;
  const currentReadme = fs.existsSync(README_PATH)
    ? fs.readFileSync(README_PATH, 'utf-8')
    : '';

  // ── Human Review Gate ───────────────────────────────────────────────────
  // NOTE: No files have been written to disk at this point.
  // Writing is deferred until after approval below.
  const approved = await reviewGate({
    proposedReadme,
    currentReadme,
    riskResult,
    piiResult,
    exclusionResult,
    channelOutputs,
    dryRun: isDryRun,
  });

  if (!approved) {
    console.log('\n✗ Changes rejected. Nothing written. Re-run when ready.');
    process.exit(0);
  }

  if (isDryRun) {
    console.log('\n✓ Dry run complete. Changes approved but not written (--dry-run mode).');
    process.exit(0);
  }

  // ── Write files and commit (only on approval) ───────────────────────────
  console.log('\nWriting output files...');

  try {
    fs.writeFileSync(README_PATH, proposedReadme + '\n', 'utf-8');
    console.log('  ✓ README.md written');

    writeChannelOutputs(channelOutputs, OUTPUTS_DIR);

    const date = new Date().toISOString().split('T')[0];
    const branch = getSafeBranchName();

    git(['add', 'README.md', 'outputs/']);
    git(['commit', '-m', `Update profile from LinkedIn export (${date})`]);
    git(['push', '-u', 'origin', branch]);

    console.log('\n✓ Profile updated and pushed successfully.');
  } catch (err) {
    console.error(`\n✗ Write or git operation failed: ${err.message}`);
    console.error('  Any written files may need manual cleanup. Nothing was committed.');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`\nFatal error: ${err.message}`);
  process.exit(1);
});
