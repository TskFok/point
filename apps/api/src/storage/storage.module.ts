import { Module } from '@nestjs/common';
import {
  LocalStorageProvider,
  PRODUCT_UPLOAD_ROOT,
  resolveProductUploadRoot,
} from './local-storage.provider';
import { R2StorageProvider } from './r2-storage.provider';
import {
  resolveStorageConfig,
  type StorageConfig,
} from './storage-config';
import { StorageProvider } from './storage.provider';

export function createStorageProvider(
  config: StorageConfig,
  uploadRoot: string,
): StorageProvider {
  if (config.driver === 'r2') {
    return new R2StorageProvider(config);
  }
  return new LocalStorageProvider(uploadRoot);
}

@Module({
  providers: [
    {
      provide: PRODUCT_UPLOAD_ROOT,
      useFactory: () =>
        resolveProductUploadRoot(process.env.PRODUCT_UPLOAD_ROOT),
    },
    {
      provide: StorageProvider,
      inject: [PRODUCT_UPLOAD_ROOT],
      useFactory: (uploadRoot: string) =>
        createStorageProvider(resolveStorageConfig(), uploadRoot),
    },
  ],
  exports: [StorageProvider, PRODUCT_UPLOAD_ROOT],
})
export class StorageModule {}
