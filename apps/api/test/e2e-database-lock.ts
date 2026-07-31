import { Client } from 'pg';

const defaultTestDatabaseUrl =
  'postgresql://point:point@localhost:5433/point_test';
const advisoryLockId = 72_456_390;
const lockClientKey = '__pointQuestE2eDatabaseLockClient';

type GlobalWithLockClient = typeof globalThis & {
  [lockClientKey]?: Client;
};

function authorizedTestDatabaseUrl(): string {
  const databaseUrl =
    process.env.TEST_DATABASE_URL ??
    process.env.DATABASE_URL ??
    defaultTestDatabaseUrl;
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('E2E 数据库 URL 无效');
  }
  if (
    !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
    !['localhost', '127.0.0.1'].includes(parsed.hostname) ||
    parsed.port !== '5433' ||
    parsed.pathname !== '/point_test' ||
    parsed.search !== '' ||
    parsed.hash !== ''
  ) {
    throw new Error('E2E 只允许锁定 localhost:5433/point_test 测试数据库');
  }
  return databaseUrl;
}

export async function acquireE2eDatabaseLock(): Promise<void> {
  const globalWithLock = globalThis as GlobalWithLockClient;
  if (globalWithLock[lockClientKey]) {
    throw new Error('E2E 数据库锁已经持有');
  }
  const client = new Client({
    connectionString: authorizedTestDatabaseUrl(),
    application_name: `point-quest-e2e-${process.pid}`,
    connectionTimeoutMillis: 5_000,
  });
  await client.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [advisoryLockId]);
  } catch (error) {
    await client.end();
    throw error;
  }
  globalWithLock[lockClientKey] = client;
}

export async function releaseE2eDatabaseLock(): Promise<void> {
  const globalWithLock = globalThis as GlobalWithLockClient;
  const client = globalWithLock[lockClientKey];
  if (!client) {
    return;
  }
  delete globalWithLock[lockClientKey];
  let unlockError: unknown;
  try {
    await client.query('SELECT pg_advisory_unlock($1)', [advisoryLockId]);
  } catch (error) {
    unlockError = error;
  }
  try {
    await client.end();
  } catch (closeError) {
    if (unlockError) {
      throw new AggregateError(
        [unlockError, closeError],
        'E2E 数据库解锁与连接关闭均失败',
      );
    }
    throw closeError;
  }
  if (unlockError) {
    throw unlockError instanceof Error
      ? unlockError
      : new Error('E2E 数据库解锁失败', { cause: unlockError });
  }
}
