import { randomBytes } from 'node:crypto';

const CROCKFORD_BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function generateOrderNumber(): string {
  const bytes = randomBytes(16);
  let value = 0;
  let bits = 0;
  let encoded = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      encoded += CROCKFORD_BASE32[(value >>> bits) & 31];
      value &= (1 << bits) - 1;
    }
  }
  if (bits > 0) {
    encoded += CROCKFORD_BASE32[(value << (5 - bits)) & 31];
  }
  return `PQ-${encoded}`;
}
