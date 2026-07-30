import { Inject, Injectable, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { link, mkdir, open, unlink } from 'node:fs/promises';
import { isAbsolute, join, parse, resolve } from 'node:path';
import {
  MAX_PRODUCT_IMAGE_SIZE,
  validateProductImage,
} from './image-validator';
import {
  type ProductImageFile,
  type StoredProductImage,
  StorageProvider,
} from './storage.provider';

export const PRODUCT_UPLOAD_ROOT = Symbol('PRODUCT_UPLOAD_ROOT');

export function resolveProductUploadRoot(configuredRoot?: string): string {
  const candidate = configuredRoot?.trim();
  const resolved = resolve(
    candidate && candidate.length > 0
      ? candidate
      : join(process.cwd(), 'uploads'),
  );
  if (!isAbsolute(resolved) || resolved === parse(resolved).root) {
    throw new Error('PRODUCT_UPLOAD_ROOT 必须是安全的绝对目录');
  }
  return resolved;
}

@Injectable()
export class LocalStorageProvider extends StorageProvider {
  private readonly uploadRoot: string;

  constructor(@Optional() @Inject(PRODUCT_UPLOAD_ROOT) uploadRoot?: string) {
    super();
    this.uploadRoot = resolveProductUploadRoot(uploadRoot);
  }

  async putProductImage(file: ProductImageFile): Promise<StoredProductImage> {
    const validated = await validateProductImage(
      file.buffer,
      MAX_PRODUCT_IMAGE_SIZE,
    );
    const productDirectory = join(this.uploadRoot, 'products');
    await mkdir(productDirectory, { recursive: true, mode: 0o700 });

    const fileName = `${randomUUID()}.${validated.extension}`;
    const key = `products/${fileName}`;
    const destination = join(productDirectory, fileName);
    const temporary = join(productDirectory, `.${randomUUID()}.upload`);
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(temporary, 'wx', 0o600);
      await handle.writeFile(file.buffer);
      await handle.sync();
      await handle.close();
      handle = undefined;
      await link(temporary, destination);
    } finally {
      if (handle) {
        await handle.close().catch(() => undefined);
      }
      await unlink(temporary).catch(() => undefined);
    }

    return {
      key,
      url: `/uploads/${key}`,
    };
  }
}
