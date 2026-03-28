# AGENTS.md

## Project: LinkedIn-to-Profile Automation Pipeline

This repository contains James McLeod's GitHub profile (`README.md`) alongside an automated pipeline for keeping it accurate and up-to-date using LinkedIn export data as the source of truth.

---

## Purpose

Transform LinkedIn CSV export data into polished, filtered, multi-channel professional profile content through a secure, multi-gate AI pipeline powered by the Claude API (`claude-opus-4-6`).

The pipeline ensures all published content passes mandatory filters before any human review is requested and before anything is committed to the repository.

---

## Security Model

- LinkedIn CSV imports are **never committed** to this repository (gitignored)
- All intermediate processing files are gitignored
- Generated output files (`outputs/*.txt`, `outputs/*.md`) are gitignored by default — treated as local artefacts, not tracked in the repo
- Output files are written to disk **only after human approval** — nothing is on disk before the review gate runs
- The human review gate shows the **complete content of every file** before asking for approval — no partial previews
- The human review gate is **mandatory and cannot be bypassed**
- Sensitive content is blocked at Gate 1 before it reaches any other agent
- `pipeline_blocked` in Gate 2 is **enforced deterministically in code**, not trusted from LLM output — prevents prompt injection from bypassing the risk gate
- All profile data passed to agent calls is wrapped in `<profile_data>` XML tags to separate data from structural instructions, mitigating prompt injection from CSV content
- All LLM JSON responses are schema-validated before use — unexpected types or missing fields raise explicit errors
- Raw LLM responses are never included in error messages (prevents PII leakage if Gate 1 fails)
- All git operations use `spawnSync` with argument arrays — no shell interpolation; branch names are validated against an allowlist pattern
- The Anthropic API key is format-validated at startup before any API call is made

---

## Agent Pipeline

The pipeline runs four sequential gates. Each gate has a single, clearly scoped persona. A gate failure or high-risk flag halts the pipeline.

### Gate 1 — PII Scrubber (`scripts/agents/pii-scrubber.js`)

**Persona:** Data privacy officer
**Role:** Remove or redact any personally identifiable information from the raw LinkedIn export before any other processing occurs.

Silently removes:
- Email addresses, phone numbers, home addresses
- Date of birth, national insurance / tax numbers
- Salary, compensation, bonus, equity details
- Names of non-public-facing colleagues or managers
- Internal employee IDs

Flags for human review:
- Ambiguous content that may be PII
- Internal system or tool names
- References to confidential internal projects

**Rule:** When uncertain, remove rather than keep.

---

### Gate 2 — Security & Reputational Risk Reviewer (`scripts/agents/risk-reviewer.js`)

**Persona:** Corporate communications security reviewer for a regulated financial institution
**Role:** Identify any content that poses legal, reputational, or competitive risk to the individual or their employer (NatWest Group).

Assigns a risk score: `LOW`, `MEDIUM`, or `HIGH`.

Flags and blocks on `HIGH`:
- References to unannounced NatWest initiatives or internal strategy
- Confidential project names or product codenames
- Statements about competitors that could be used adversarially
- Anything legally ambiguous or open to misinterpretation
- Content that could embarrass the employer if quoted out of context

**Rule:** Does not rewrite content — only scores and flags. Pipeline halts if any `HIGH` risk item is found.

---

### Gate 3 — Content & Tone Editor (`scripts/agents/content-tone.js`)

**Persona:** Technical communications editor writing for open source developer communities
**Role:** Rewrite approved content to pass tone of voice, DE&I, readability, and professional filters, targeted at the GitHub open source user demographic.

Applies:
- **Tone of voice:** Warm, confident, human — not corporate or self-promotional
- **DE&I:** Inclusive language, no assumptions about audience, accessible phrasing
- **Readability:** Plain English, short sentences, no unexplained jargon
- **Professional:** Credible, achievement-focused, avoids hyperbole
- **GitHub audience:** Leads with open source contribution, community, and technical context — not job titles

---

### Gate 4 — Exclusion Filter (`scripts/agents/exclusion-filter.js`)

**Persona:** Content exclusion specialist
**Role:** Remove any negative content entirely. This gate **only excludes** — it never reframes, softens, or transforms negative content into positive.

Removes entirely:
- Negative comments or opinions expressed by the profile owner
- Negative comments made by others about any person, company, or topic
- Content that is critical, pessimistic, or controversial in tone
- Ambiguous statements that could be misread as negative
- Reposts or shared content that originated from someone else and is not owned by the profile owner
- Any loose comments that carry PR risk even if originally well-intentioned

**Rule:** When in doubt, exclude. Output only what is confidently positive and wholly original.

---

## Output Channels

Each channel receives a tailored version of the filtered profile content:

| File | Channel | Format | Notes |
|---|---|---|---|
| `README.md` | GitHub profile | Markdown | Committed to repo |
| `outputs/github-bio.txt` | GitHub profile bio | Plain text, 160 chars max | Manual update |
| `outputs/speaker-bio.md` | Conference / events | 3rd-person, 100–150 words | Manual use |
| `outputs/email-signature.txt` | Email signature | Plain text | Manual update |
| `outputs/devto-bio.md` | dev.to / Hashnode | Short bio + links | Manual update |

---

## Usage

### Prerequisites

1. Set your Anthropic API key:
   ```bash
   export ANTHROPIC_API_KEY=your_api_key_here
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

### Running the Pipeline

1. Export your LinkedIn data:
   - LinkedIn → Settings & Privacy → Data Privacy → Get a copy of your data
   - Select: Profile, Positions, Skills, Certifications, Education, Honors
   - Wait for the export email (up to 24 hours)

2. Unzip the LinkedIn export and place the CSV files in the `imports/` directory:
   ```
   imports/
   ├── Profile.csv
   ├── Positions.csv
   ├── Skills.csv
   ├── Certifications.csv
   ├── Education.csv
   └── Honors.csv
   ```

3. Run the pipeline:
   ```bash
   npm run update
   ```

4. Review the proposed changes and risk report in the terminal.

5. Approve to write outputs and commit, or reject to abort.

### Dry Run

To run the full pipeline without committing:
```bash
npm run update:dry-run
```

---

## Repository Structure

```
mcleo-d/
├── README.md                          # Auto-updated GitHub profile
├── AGENTS.md                          # This file
├── package.json
├── package-lock.json
├── .gitignore                         # Protects imports/, CSVs, outputs/, scratch files
├── imports/                           # Gitignored — drop LinkedIn CSVs here
│   └── .gitkeep
├── outputs/                           # Gitignored — generated artifacts (local only)
│   └── .gitkeep
└── scripts/
    ├── update-profile.js              # Main orchestrator
    ├── config.js                      # Centralised model ID, token limits, client factory
    ├── csv-parser.js                  # LinkedIn CSV parser
    ├── channel-writer.js              # Multi-channel content generator
    ├── review-gate.js                 # Human approval CLI
    ├── utils/
    │   └── json-parser.js             # Shared JSON parsing + schema validation
    └── agents/
        ├── pii-scrubber.js            # Gate 1
        ├── risk-reviewer.js           # Gate 2
        ├── content-tone.js            # Gate 3
        └── exclusion-filter.js        # Gate 4
```

---

## AI Model

All gates use `claude-opus-4-6` via the Anthropic API. Gate 2 uses adaptive thinking for nuanced reputational risk assessment.

API key is read from the `ANTHROPIC_API_KEY` environment variable. Never hardcode API keys.
