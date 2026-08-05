import { LocalStorageProvider } from './local-storage.provider';
import { R2StorageProvider } from './r2-storage.provider';
import { createStorageProvider } from './storage.module';

describe('createStorageProvider', () => {
  it('local 返回 LocalStorageProvider', () => {
    const provider = createStorageProvider({ driver: 'local' }, '/tmp/uploads');
    expect(provider).toBeInstanceOf(LocalStorageProvider);
  });

  it('r2 返回 R2StorageProvider', () => {
    const provider = createStorageProvider(
      {
        driver: 'r2',
        accountId: 'acct',
        accessKeyId: 'key',
        secretAccessKey: 'secret',
        bucket: 'bucket',
        publicBaseUrl: 'https://cdn.example.com',
      },
      '/tmp/uploads',
    );
    expect(provider).toBeInstanceOf(R2StorageProvider);
  });
});
