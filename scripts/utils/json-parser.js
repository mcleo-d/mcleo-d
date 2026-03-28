/**
 * Shared JSON response parser and schema validator for all agent gates.
 *
 * Security notes:
 * - Raw LLM responses are NEVER included in thrown error messages (prevents PII
 *   exposure if Gate 1 fails before scrubbing is complete).
 * - When DEBUG=1 is set, the raw response is written to a local temp file
 *   (gitignored path) for developer diagnostics only.
 * - Schema validation is applied after parsing so downstream code never receives
 *   unexpected types or missing fields from a hallucinated or injected response.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Parse a JSON response from the Claude API, stripping markdown fences if present.
 * Does NOT include raw response text in thrown errors to prevent PII leakage.
 *
 * @param {string} text - Raw text content from Claude API response
 * @param {string} gateName - Name of the calling gate (used in error messages)
 * @returns {object} Parsed JSON object
 */
export function parseJsonResponse(text, gateName) {
  const cleaned = text
    .replace(/^```(?:json)?\n?/m, '')
    .replace(/\n?```$/m, '')
    .trim();

  // Attempt 1: direct parse
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    // Attempt 2: extract outermost {...} block
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (_) {}
    }
  }

  // Write raw response to a debug temp file if DEBUG is set
  if (process.env.DEBUG) {
    const debugPath = path.join(os.tmpdir(), `pipeline-debug-${gateName}-${Date.now()}.txt`);
    try {
      fs.writeFileSync(debugPath, text, 'utf-8');
      console.error(`  [DEBUG] Raw response written to ${debugPath}`);
    } catch (_) {}
  }

  throw new Error(
    `${gateName} returned invalid JSON. ` +
    `Run with DEBUG=1 for diagnostic output (written to a temp file, not stdout).`
  );
}

/**
 * Validate that a parsed JSON object has required fields of the expected types.
 * Throws a descriptive error if validation fails.
 *
 * @param {object} obj - The parsed object to validate
 * @param {Object.<string, 'string'|'boolean'|'array'|'object'>} schema
 * @param {string} gateName
 */
export function validateSchema(obj, schema, gateName) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new Error(`${gateName}: Response must be a JSON object.`);
  }

  for (const [field, expectedType] of Object.entries(schema)) {
    if (!(field in obj)) {
      throw new Error(`${gateName}: Missing required field "${field}" in response.`);
    }

    const value = obj[field];

    if (expectedType === 'array') {
      if (!Array.isArray(value)) {
        throw new Error(`${gateName}: Field "${field}" must be an array, got ${typeof value}.`);
      }
    } else if (typeof value !== expectedType) {
      throw new Error(
        `${gateName}: Field "${field}" must be of type ${expectedType}, got ${typeof value}.`
      );
    }
  }
}
