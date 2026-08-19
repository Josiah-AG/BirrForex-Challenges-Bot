import crypto from 'crypto';

/**
 * AES-256-GCM Encryption Utility
 * 
 * Used to encrypt/decrypt sensitive broker credentials (email, password, API key).
 * Master key is stored as BROKER_ENCRYPTION_KEY environment variable (Railway).
 * Each host gets a unique IV stored alongside the encrypted data.
 * 
 * Security:
 * - AES-256-GCM provides authenticated encryption (confidentiality + integrity)
 * - Unique IV per host prevents pattern analysis across hosts
 * - Master key never stored in code or database
 * - Decrypted values never logged or returned via API
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits

function getMasterKey(): Buffer {
  const key = process.env.BROKER_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('BROKER_ENCRYPTION_KEY environment variable is not set');
  }
  // Key must be exactly 32 bytes for AES-256
  // If the env var is a hex string (64 chars), decode it
  // If it's a plain string, hash it to get 32 bytes
  if (key.length === 64 && /^[0-9a-fA-F]+$/.test(key)) {
    return Buffer.from(key, 'hex');
  }
  return crypto.createHash('sha256').update(key).digest();
}

/**
 * Generate a random IV for a new host
 * Store this in the host record (hosts.encryption_iv)
 */
export function generateIV(): string {
  return crypto.randomBytes(IV_LENGTH).toString('hex');
}

/**
 * Encrypt a plaintext value using the master key and host's IV
 * Returns: base64-encoded string containing [authTag (16 bytes) + ciphertext]
 */
export function encrypt(plaintext: string, ivHex: string): string {
  const key = getMasterKey();
  const iv = Buffer.from(ivHex, 'hex');

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  // Prepend auth tag to ciphertext for storage
  return authTag.toString('base64') + ':' + encrypted;
}

/**
 * Decrypt an encrypted value using the master key and host's IV
 * Input: base64 string in format [authTag:ciphertext]
 */
export function decrypt(encryptedData: string, ivHex: string): string {
  const key = getMasterKey();
  const iv = Buffer.from(ivHex, 'hex');

  const parts = encryptedData.split(':');
  if (parts.length !== 2) {
    throw new Error('Invalid encrypted data format');
  }

  const authTag = Buffer.from(parts[0], 'base64');
  const ciphertext = parts[1];

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Generate a secure random encryption key (for initial setup)
 * Run this once to generate the BROKER_ENCRYPTION_KEY value for Railway env
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}
