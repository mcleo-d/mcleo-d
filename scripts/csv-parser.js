/**
 * LinkedIn CSV Export Parser
 *
 * Parses the CSV files from a LinkedIn data export into a structured profile object.
 * LinkedIn exports a zip containing multiple CSV files — place them in imports/.
 *
 * Expected files (all optional, pipeline degrades gracefully if missing):
 *   Profile.csv, Positions.csv, Skills.csv, Certifications.csv,
 *   Education.csv, Honors.csv
 *
 * Fixes applied:
 * - totalFields guard replaced with explicit per-section check (was unreliable
 *   due to Object.flat() treating the basics object as a single element).
 * - URLs validated with new URL() — only https:// accepted; http:// is warned
 *   and skipped; malformed URLs are silently dropped.
 */

import { parse } from 'csv-parse/sync';
import fs from 'fs';
import path from 'path';

/**
 * @param {string} importsDir - Path to the directory containing LinkedIn CSV files
 * @returns {object} Structured profile object
 */
export function parseLinkedInCSV(importsDir) {
  console.log(`Parsing LinkedIn CSV files from: ${importsDir}`);

  const profile = {
    basics: {},
    positions: [],
    skills: [],
    certifications: [],
    education: [],
    honors: [],
  };

  // Profile.csv — name, headline, summary, location, industry
  const profilePath = path.join(importsDir, 'Profile.csv');
  if (fs.existsSync(profilePath)) {
    const rows = parseCsv(profilePath);
    if (rows.length > 0) {
      const row = rows[0];
      profile.basics = {
        firstName: row['First Name'] ?? '',
        lastName: row['Last Name'] ?? '',
        headline: row['Headline'] ?? '',
        summary: row['Summary'] ?? '',
        industry: row['Industry'] ?? '',
        location: row['Geo Location'] ?? row['Location'] ?? '',
        websites: extractWebsites(row),
      };
    }
    console.log('  ✓ Profile.csv parsed');
  } else {
    console.log('  ⚠ Profile.csv not found — skipping basics');
  }

  // Positions.csv — work experience
  const positionsPath = path.join(importsDir, 'Positions.csv');
  if (fs.existsSync(positionsPath)) {
    const rows = parseCsv(positionsPath);
    profile.positions = rows
      .map((row) => ({
        title: row['Title'] ?? '',
        company: row['Company Name'] ?? '',
        description: row['Description'] ?? '',
        location: row['Location'] ?? '',
        startDate: row['Started On'] ?? '',
        endDate: row['Finished On'] ?? '',
        isCurrent: !row['Finished On'],
      }))
      .filter((p) => p.title || p.company);
    console.log(`  ✓ Positions.csv parsed — ${profile.positions.length} position(s)`);
  } else {
    console.log('  ⚠ Positions.csv not found — skipping work experience');
  }

  // Skills.csv — skills list
  const skillsPath = path.join(importsDir, 'Skills.csv');
  if (fs.existsSync(skillsPath)) {
    const rows = parseCsv(skillsPath);
    profile.skills = rows.map((row) => row['Name'] ?? '').filter(Boolean);
    console.log(`  ✓ Skills.csv parsed — ${profile.skills.length} skill(s)`);
  } else {
    console.log('  ⚠ Skills.csv not found — skipping skills');
  }

  // Certifications.csv
  const certsPath = path.join(importsDir, 'Certifications.csv');
  if (fs.existsSync(certsPath)) {
    const rows = parseCsv(certsPath);
    profile.certifications = rows
      .map((row) => ({
        name: row['Name'] ?? '',
        authority: row['Authority'] ?? '',
        licenseNumber: row['License Number'] ?? '',
        startDate: row['Started On'] ?? '',
        endDate: row['Finished On'] ?? '',
        url: sanitiseUrl(row['Url'] ?? ''),
      }))
      .filter((c) => c.name);
    console.log(`  ✓ Certifications.csv parsed — ${profile.certifications.length} certification(s)`);
  } else {
    console.log('  ⚠ Certifications.csv not found — skipping certifications');
  }

  // Education.csv
  const educationPath = path.join(importsDir, 'Education.csv');
  if (fs.existsSync(educationPath)) {
    const rows = parseCsv(educationPath);
    profile.education = rows
      .map((row) => ({
        school: row['School Name'] ?? '',
        degree: row['Degree Name'] ?? '',
        field: row['Notes'] ?? '',
        startDate: row['Start Date'] ?? '',
        endDate: row['End Date'] ?? '',
        description: row['Activities'] ?? '',
      }))
      .filter((e) => e.school);
    console.log(`  ✓ Education.csv parsed — ${profile.education.length} entry(ies)`);
  } else {
    console.log('  ⚠ Education.csv not found — skipping education');
  }

  // Honors.csv — awards and recognition
  const honorsPath = path.join(importsDir, 'Honors.csv');
  if (fs.existsSync(honorsPath)) {
    const rows = parseCsv(honorsPath);
    profile.honors = rows
      .map((row) => ({
        title: row['Title'] ?? '',
        issuer: row['Issuer'] ?? '',
        date: row['Issued On'] ?? '',
        description: row['Description'] ?? '',
      }))
      .filter((h) => h.title);
    console.log(`  ✓ Honors.csv parsed — ${profile.honors.length} honor(s)`);
  } else {
    console.log('  ⚠ Honors.csv not found — skipping honors');
  }

  // Validate that at least some data was loaded (explicit per-section check —
  // previously used Object.values().flat() which was unreliable for objects)
  const hasData =
    Object.keys(profile.basics).length > 0 ||
    profile.positions.length > 0 ||
    profile.skills.length > 0 ||
    profile.certifications.length > 0 ||
    profile.education.length > 0 ||
    profile.honors.length > 0;

  if (!hasData) {
    throw new Error(
      'No LinkedIn CSV data found in imports/. ' +
        'Export your LinkedIn data and place the CSV files in the imports/ directory.\n' +
        'LinkedIn → Settings & Privacy → Data Privacy → Get a copy of your data'
    );
  }

  return profile;
}

function parseCsv(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  try {
    return parse(content, {
      columns: true,
      skip_empty_lines: true,
      bom: true,
      relax_column_count: true,
    });
  } catch (err) {
    console.warn(`  ⚠ Failed to parse ${path.basename(filePath)}: ${err.message}`);
    return [];
  }
}

/**
 * Extract website URLs from a Profile.csv row.
 * Only https:// URLs are accepted. http:// URLs are warned and skipped.
 * Malformed values are silently dropped.
 */
function extractWebsites(row) {
  const websites = [];
  for (const key of Object.keys(row)) {
    if (key.toLowerCase().includes('website') || key.toLowerCase().includes('url')) {
      const val = row[key]?.trim();
      if (val) {
        const safe = sanitiseUrl(val);
        if (safe) websites.push(safe);
      }
    }
  }
  return websites;
}

/**
 * Validate and return a URL only if it uses https://.
 * Returns null for invalid URLs or non-https schemes.
 */
function sanitiseUrl(raw) {
  const val = raw?.trim();
  if (!val) return null;

  try {
    const url = new URL(val);
    if (url.protocol === 'https:') {
      return val;
    }
    if (url.protocol === 'http:') {
      console.warn(`  ⚠ Non-HTTPS URL skipped (upgrade to https://): ${val}`);
      return null;
    }
    // Reject any other protocol (javascript:, data:, etc.)
    console.warn(`  ⚠ URL with unsupported protocol skipped: ${val}`);
    return null;
  } catch {
    // Malformed URL — drop silently
    return null;
  }
}
