import {
  decryptSecret,
  encryptSecret,
  maskApiKey,
  resolveEncryptionKey,
} from './secret-crypto';

describe('secret-crypto', () => {
  const key = resolveEncryptionKey({
    AI_CONFIG_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  });

  it('往返加密', () => {
    const { ciphertext, last4 } = encryptSecret('sk-test-key-1234', key);
    expect(last4).toBe('1234');
    expect(ciphertext).not.toContain('sk-test');
    expect(decryptSecret(ciphertext, key)).toBe('sk-test-key-1234');
  });

  it('脱敏', () => {
    expect(maskApiKey('abcd')).toBe('••••abcd');
  });

  it('缺少密钥时报错', () => {
    expect(() => resolveEncryptionKey({})).toThrow(/AI_CONFIG_ENCRYPTION_KEY/);
  });
});
