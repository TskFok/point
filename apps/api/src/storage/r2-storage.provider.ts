import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { type NormalizedProductImage } from './image-validator';
import { type StoredProductImage, StorageProvider } from './storage.provider';
import { type R2StorageSettings } from './storage-config';

class ProductImageStorageException extends InternalServerErrorException {
  readonly code = 'STORAGE_ERROR';

  constructor() {
    super({
      code: 'STORAGE_ERROR',
      message: '商品图片存储失败',
    });
  }
}

function storageError(): ProductImageStorageException {
  return new ProductImageStorageException();
}

export function normalizePublicBaseUrl(publicBaseUrl: string): string {
  return publicBaseUrl.replace(/\/+$/, '');
}

@Injectable()
export class R2StorageProvider extends StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;

  constructor(
    settings: R2StorageSettings,
    client?: Pick<S3Client, 'send'>,
  ) {
    super();
    this.bucket = settings.bucket;
    this.publicBaseUrl = normalizePublicBaseUrl(settings.publicBaseUrl);
    this.client =
      (client as S3Client | undefined) ??
      new S3Client({
        region: 'auto',
        endpoint: `https://${settings.accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: settings.accessKeyId,
          secretAccessKey: settings.secretAccessKey,
        },
        forcePathStyle: true,
      });
  }

  async putProductImage(
    image: NormalizedProductImage,
  ): Promise<StoredProductImage> {
    const fileName = `${randomUUID()}.${image.keyExtension}`;
    const key = `products/${fileName}`;

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: image.buffer,
          ContentType: image.mime,
        }),
      );
    } catch {
      throw storageError();
    }

    return {
      key,
      url: `${this.publicBaseUrl}/${key}`,
    };
  }
}
