export type StorageDriver = 'local' | 'r2';

export type R2StorageSettings = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
};

export type LocalStorageConfig = {
  driver: 'local';
};

export type R2StorageConfig = {
  driver: 'r2';
} & R2StorageSettings;

export type StorageConfig = LocalStorageConfig | R2StorageConfig;

function requiredEnv(
  env: NodeJS.ProcessEnv,
  key: string,
): string {
  const value = env[key]?.trim();
  if (!value) {
    throw new Error(`缺少必需的环境变量 ${key}`);
  }
  return value;
}

export function resolveStorageConfig(
  env: NodeJS.ProcessEnv = process.env,
): StorageConfig {
  const raw = env.STORAGE_DRIVER?.trim().toLowerCase();
  const driver = (raw || 'local') as string;

  if (driver === 'local') {
    return { driver: 'local' };
  }

  if (driver !== 'r2') {
    throw new Error(
      `无效的 STORAGE_DRIVER="${env.STORAGE_DRIVER}"，仅支持 local 或 r2`,
    );
  }

  return {
    driver: 'r2',
    accountId: requiredEnv(env, 'R2_ACCOUNT_ID'),
    accessKeyId: requiredEnv(env, 'R2_ACCESS_KEY_ID'),
    secretAccessKey: requiredEnv(env, 'R2_SECRET_ACCESS_KEY'),
    bucket: requiredEnv(env, 'R2_BUCKET'),
    publicBaseUrl: requiredEnv(env, 'R2_PUBLIC_BASE_URL'),
  };
}
