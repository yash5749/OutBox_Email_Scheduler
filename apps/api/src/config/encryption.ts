import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { getEnv } from './env';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const TAG_LENGTH = 16;
const VERSION = 'v1';

function getKey(): Buffer {
  const env = getEnv();
  const hexKey = env.TOKEN_ENCRYPTION_KEY;
  if (hexKey.length !== 64) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
  }
  return Buffer.from(hexKey, 'hex');
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, ciphertext, authTag]);
  return `${VERSION}:${combined.toString('base64')}`;
}

export function decrypt(ciphertext: string): string {
  if (!ciphertext.startsWith(`${VERSION}:`)) {
    throw new Error('Unsupported encryption version or invalid ciphertext');
  }
  const key = getKey();
  const combined = Buffer.from(ciphertext.slice(VERSION.length + 1), 'base64');
  if (combined.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error('Ciphertext too short');
  }
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(combined.length - TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH, combined.length - TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return plaintext.toString('utf8');
}

export function encryptObject<T extends Record<string, unknown>>(obj: T): T {
  const result = { ...obj } as Record<string, unknown>;
  for (const [key, value] of Object.entries(result)) {
    if (typeof value === 'string' && (key.toLowerCase().includes('password') || key.toLowerCase().includes('token') || key.toLowerCase().includes('secret') || key.toLowerCase().includes('key'))) {
      result[key] = encrypt(value);
    }
  }
  return result as T;
}