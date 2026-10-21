import { z } from 'zod';

export interface ParsedRecipient {
  email: string;
  row: number;
  raw: string;
}

export interface ParseResult {
  valid: ParsedRecipient[];
  invalid: Array<{ row: number; email: string; reason: string }>;
  duplicates: string[];
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email) && email.length <= 254;
}

export function parseCsv(content: string): ParseResult {
  const lines = content.split(/\r?\n/);
  if (lines.length === 0) return { valid: [], invalid: [], duplicates: [] };

  // Detect header
  const header = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/^"|"$/g, ''));
  const emailColIndex = header.findIndex(h => h === 'email' || h === 'email address');
  const hasHeader = emailColIndex >= 0;
  const startRow = hasHeader ? 1 : 0;

  const seen = new Set<string>();
  const valid: ParsedRecipient[] = [];
  const invalid: ParseResult['invalid'] = [];
  const duplicates: string[] = [];

  for (let i = startRow; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const rowNum = i + 1;
    let email: string;

    if (hasHeader) {
      const cols = parseCsvLine(line);
      email = cols[emailColIndex]?.trim() ?? '';
    } else {
      email = line;
    }

    const normalized = normalizeEmail(email);

    if (!normalized) {
      invalid.push({ row: rowNum, email, reason: 'EMPTY' });
      continue;
    }

    if (!isValidEmail(normalized)) {
      invalid.push({ row: rowNum, email, reason: 'INVALID_FORMAT' });
      continue;
    }

    if (seen.has(normalized)) {
      duplicates.push(normalized);
      continue;
    }

    seen.add(normalized);
    valid.push({ email: normalized, row: rowNum, raw: email });
  }

  return { valid, invalid, duplicates };
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

export function parseText(content: string): ParseResult {
  const lines = content.split(/\r?\n/);
  const seen = new Set<string>();
  const valid: ParsedRecipient[] = [];
  const invalid: ParseResult['invalid'] = [];
  const duplicates: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const rowNum = i + 1;
    const email = line;
    const normalized = normalizeEmail(email);

    if (!normalized) {
      invalid.push({ row: rowNum, email, reason: 'EMPTY' });
      continue;
    }

    if (!isValidEmail(normalized)) {
      invalid.push({ row: rowNum, email, reason: 'INVALID_FORMAT' });
      continue;
    }

    if (seen.has(normalized)) {
      duplicates.push(normalized);
      continue;
    }

    seen.add(normalized);
    valid.push({ email: normalized, row: rowNum, raw: email });
  }

  return { valid, invalid, duplicates };
}

export function parseRecipients(content: string, mimeType: string): ParseResult {
  if (mimeType === 'text/csv' || content.includes(',')) {
    return parseCsv(content);
  }
  return parseText(content);
}

export const ScheduleEmailsRequestSchema = z.object({
  campaignId: z.string().uuid().optional(),
  senderId: z.string().uuid(),
  subject: z.string().min(1).max(500).optional(),
  body: z.string().min(1).optional(),
  recipients: z.array(z.string().email()).optional(),
  startAt: z.string().datetime(),
  minDelayBetweenEmailsMs: z.coerce.number().int().positive().min(100).max(3600000).default(2000),
  maxEmailsPerHour: z.coerce.number().int().positive().min(1).max(10000).default(200),
});

export type ScheduleEmailsRequest = z.infer<typeof ScheduleEmailsRequestSchema>;