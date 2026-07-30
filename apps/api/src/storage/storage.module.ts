import { Module } from '@nestjs/common';
import {
  LocalStorageProvider,
  PRODUCT_UPLOAD_ROOT,
  resolveProductUploadRoot,
} from './local-storage.provider';
import { StorageProvider } from './storage.provider';

@Module({
  providers: [
    {
      provide: PRODUCT_UPLOAD_ROOT,
      useFactory: () =>
        resolveProductUploadRoot(process.env.PRODUCT_UPLOAD_ROOT),
    },
    {
      provide: StorageProvider,
      useClass: LocalStorageProvider,
    },
  ],
  exports: [StorageProvider, PRODUCT_UPLOAD_ROOT],
})
export class StorageModule {}
