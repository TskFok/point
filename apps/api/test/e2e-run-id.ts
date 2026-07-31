import { randomUUID } from 'node:crypto';

export function createE2eRunId(): string {
  return randomUUID().replaceAll('-', '').slice(0, 10);
}
