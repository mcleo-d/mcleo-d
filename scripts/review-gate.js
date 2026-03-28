/**
 * Human Review Gate
 *
 * Mandatory approval step before any content is committed.
 * Shows the complete content of EVERY file that will be written before asking
 * for approval — partial preview is not sufficient given PII risk.
 *
 * Security fixes applied:
 * - All output file content is shown in full before approval is requested.
 * - Files are NOT written to disk before this gate — writing is deferred to
 *   update-profile.js after approval (see channel-writer.js).
 * - No files are staged or committed unless explicit approval is given.
 */

import readline from 'readline';

/**
 * @param {object} options
 * @param {string} options.proposedReadme - The generated README content
 * @param {string} options.currentReadme - The current README content
 * @param {object} options.riskResult - Output from Gate 2
 * @param {object} options.piiResult - Output from Gate 1
 * @param {object} options.exclusionResult - Output from Gate 4
 * @param {object} options.channelOutputs - All channel output content
 * @param {boolean} options.dryRun - If true, skip commit even on approval
 * @returns {Promise<boolean>} true if approved, false if rejected
 */
export async function reviewGate(options) {
  const {
    proposedReadme,
    currentReadme,
    riskResult,
    piiResult,
    exclusionResult,
    channelOutputs,
    dryRun = false,
  } = options;

  const DIVIDER = '─'.repeat(70);
  const HEADER = '═'.repeat(70);

  console.log('\n' + HEADER);
  console.log('  HUMAN REVIEW GATE');
  console.log('  Review all content below before approving. Nothing has been');
  console.log('  written to disk yet. Approval triggers file writes and commit.');
  console.log(HEADER);

  // ── Gate 1: PII summary ──────────────────────────────────────────────────
  const removedCount = piiResult?.removed_items?.length ?? 0;
  const flaggedCount = piiResult?.flagged_items?.length ?? 0;
  console.log(`\n[Gate 1 — PII Scrubber]`);
  console.log(`  Items removed  : ${removedCount}`);
  console.log(`  Items flagged  : ${flaggedCount}`);
  if (removedCount > 0) {
    piiResult.removed_items.forEach((item) => console.log(`    ✂  ${item}`));
  }
  if (flaggedCount > 0) {
    console.log('  Flagged for awareness:');
    piiResult.flagged_items.forEach((item) =>
      console.log(`    ⚠  ${item.item} — ${item.reason}`)
    );
  }

  // ── Gate 2: Risk summary ─────────────────────────────────────────────────
  console.log(`\n[Gate 2 — Risk Reviewer]`);
  console.log(`  Overall risk   : ${riskResult?.overall_risk ?? 'UNKNOWN'}`);
  const riskItems = riskResult?.risk_items ?? [];
  if (riskItems.length > 0) {
    riskItems.forEach((item) =>
      console.log(`    ${item.risk_level === 'HIGH' ? '⛔' : '⚠ '} [${item.risk_level}] ${item.content}`)
    );
  }

  // ── Gate 4: Exclusion summary ────────────────────────────────────────────
  const excludedCount = exclusionResult?.excluded_items?.length ?? 0;
  console.log(`\n[Gate 4 — Exclusion Filter]`);
  console.log(`  Items excluded : ${excludedCount}`);
  if (excludedCount > 0) {
    exclusionResult.excluded_items.forEach((item) => console.log(`    ✂  ${item}`));
  }

  // ── README diff ──────────────────────────────────────────────────────────
  console.log('\n' + DIVIDER);
  console.log('  README.md — PROPOSED CHANGES (- removed  + added)');
  console.log(DIVIDER);
  printDiff(currentReadme, proposedReadme);

  // ── Full content of every output file ───────────────────────────────────
  console.log('\n' + DIVIDER);
  console.log('  FULL CONTENT OF ALL OUTPUT FILES');
  console.log('  (These will be written to outputs/ on approval)');
  console.log(DIVIDER);

  showSection('GitHub Bio (outputs/github-bio.txt)', channelOutputs.githubBio);
  showSection('Speaker Bio (outputs/speaker-bio.md)', channelOutputs.speakerBio);
  showSection('Email Signature (outputs/email-signature.txt)', channelOutputs.emailSignature);
  showSection('dev.to / Hashnode Bio (outputs/devto-bio.md)', channelOutputs.devtoBio);

  console.log('\n' + DIVIDER);

  if (dryRun) {
    console.log('  DRY RUN — no files will be written or committed.');
    console.log(DIVIDER);
  }

  const answer = await prompt(
    '\nApprove? All content shown above will be written and committed.\n[y] Approve  [n] Reject: '
  );

  return answer.trim().toLowerCase() === 'y';
}

function showSection(title, content) {
  console.log(`\n  ── ${title} ──`);
  if (content) {
    content.split('\n').forEach((line) => console.log(`  ${line}`));
  } else {
    console.log('  (empty)');
  }
}

function printDiff(current, proposed) {
  const currentLines = (current ?? '').split('\n');
  const proposedLines = (proposed ?? '').split('\n');
  const maxLines = Math.max(currentLines.length, proposedLines.length);
  let changesShown = 0;

  for (let i = 0; i < maxLines; i++) {
    const curr = currentLines[i] ?? '';
    const prop = proposedLines[i] ?? '';
    if (curr !== prop) {
      if (curr) console.log(`  - ${curr}`);
      if (prop) console.log(`  + ${prop}`);
      changesShown++;
    }
  }

  if (changesShown === 0) {
    console.log('  (No changes to README.md)');
  }
}

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}
