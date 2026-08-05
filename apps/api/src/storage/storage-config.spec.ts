import { resolveStorageConfig } from './storage-config';

describe('resolveStorageConfig', () => {
  it('未设置时默认 local', () => {
    expect(resolveStorageConfig({})).toEqual({ driver: 'local' });
  });

  it('显式 local', () => {
    expect(resolveStorageConfig({ STORAGE_DRIVER: 'local' })).toEqual({
      driver: 'local',
    });
  });

  it('非法 driver 抛错', () => {
    expect(() =>
      resolveStorageConfig({ STORAGE_DRIVER: 'gcs' }),
    ).toThrow(/STORAGE_DRIVER/);
  });

  it('r2 配置齐全时返回设置', () => {
    expect(
      resolveStorageConfig({
        STORAGE_DRIVER: 'r2',
        R2_ACCOUNT_ID: 'acct',
        R2_ACCESS_KEY_ID: 'key',
        R2_SECRET_ACCESS_KEY: 'secret',
        R2_BUCKET: 'bucket',
        R2_PUBLIC_BASE_URL: 'https://cdn.example.com',
      }),
    ).toEqual({
      driver: 'r2',
      accountId: 'acct',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
      bucket: 'bucket',
      publicBaseUrl: 'https://cdn.example.com',
    });
  });

  it('r2 缺少字段时抛错', () => {
    expect(() =>
      resolveStorageConfig({
        STORAGE_DRIVER: 'r2',
        R2_ACCOUNT_ID: 'acct',
      }),
    ).toThrow(/R2_/);
  });
});
