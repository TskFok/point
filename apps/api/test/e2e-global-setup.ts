import { acquireE2eDatabaseLock } from './e2e-database-lock';

export default async function globalSetup(): Promise<void> {
  await acquireE2eDatabaseLock();
}
