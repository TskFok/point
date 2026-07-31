import { releaseE2eDatabaseLock } from './e2e-database-lock';

export default async function globalTeardown(): Promise<void> {
  await releaseE2eDatabaseLock();
}
