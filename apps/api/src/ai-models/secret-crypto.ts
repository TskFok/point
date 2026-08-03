import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';

const KEY_ENV = 'AI_CONFIG_ENCRYPTION_KEY';

export function resolveEncryptionKey(
  env: NodeJS.ProcessEnv = process.env,
): Buffer {
  const raw = env[KEY_ENV]?.trim();
  if (!raw) {
    throw new Error(`${KEY_ENV} is required`);
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(`${KEY_ENV} must decode to 32 bytes`);
  }
  return key;
}

/** 格式：base64(iv).base64(tag).base64(ciphertext) */
export function encryptSecret(
  plaintext: string,
  key: Buffer,
): { ciphertext: string; last4: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const last4 = plaintext.length <= 4 ? plaintext : plaintext.slice(-4);
  return {
    ciphertext: `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted.toString('base64')}`,
    last4,
  };
}

export function decryptSecret(ciphertext: string, key: Buffer): string {
  const [ivB64, tagB64, dataB64] = ciphertext.split('.');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Invalid ciphertext format');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(ivB64, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

export function maskApiKey(last4: string): string {
  return `••••${last4}`;
}
