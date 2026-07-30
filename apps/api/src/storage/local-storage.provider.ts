import {
  Inject,
  Injectable,
  InternalServerErrorException,
  type OnModuleInit,
  Optional,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  chmod,
  lstat,
  link,
  mkdir,
  open,
  readdir,
  realpath,
  unlink,
} from 'node:fs/promises';
import { isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { type NormalizedProductImage } from './image-validator';
import { type StoredProductImage, StorageProvider } from './storage.provider';

export const PRODUCT_UPLOAD_ROOT = Symbol('PRODUCT_UPLOAD_ROOT');

const providerArtifactPattern =
  /^\.point-upload-(?:probe-)?[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:tmp|link)$/;

export type PreparedProductUploadRoot = {
  productDirectory: string;
  uploadRoot: string;
};

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

function isContainedDirectory(parent: string, child: string): boolean {
  const pathFromParent = relative(parent, child);
  return (
    pathFromParent.length > 0 &&
    pathFromParent !== '..' &&
    !pathFromParent.startsWith(`..${sep}`) &&
    !isAbsolute(pathFromParent)
  );
}

async function inspectUploadDirectories(
  configuredRoot?: string,
): Promise<PreparedProductUploadRoot> {
  const resolvedRoot = resolveProductUploadRoot(configuredRoot);
  const rootStat = await lstat(resolvedRoot);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new Error('上传根目录类型不安全');
  }
  const canonicalRoot = await realpath(resolvedRoot);
  const productPath = join(resolvedRoot, 'products');
  const productStat = await lstat(productPath);
  if (productStat.isSymbolicLink() || !productStat.isDirectory()) {
    throw new Error('商品图片目录类型不安全');
  }
  const canonicalProductDirectory = await realpath(productPath);
  if (
    !isContainedDirectory(canonicalRoot, canonicalProductDirectory) ||
    relative(canonicalRoot, canonicalProductDirectory) !== 'products'
  ) {
    throw new Error('商品图片目录越界');
  }
  return {
    uploadRoot: canonicalRoot,
    productDirectory: canonicalProductDirectory,
  };
}

async function syncDirectory(directory: string): Promise<void> {
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(directory, 'r');
    await handle.sync();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    // Windows 不支持以普通文件句柄 fsync 目录；仅在那里忽略明确的“不支持”错误。
    if (
      process.platform !== 'win32' ||
      !['EISDIR', 'EINVAL', 'ENOTSUP', 'EPERM'].includes(code ?? '')
    ) {
      throw error;
    }
  } finally {
    if (handle) {
      await handle.close();
    }
  }
}

async function removeProviderArtifacts(
  productDirectory: string,
): Promise<void> {
  const entries = await readdir(productDirectory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && providerArtifactPattern.test(entry.name)) {
      await unlink(join(productDirectory, entry.name));
    }
  }
}

async function probeHardLinkSupport(productDirectory: string): Promise<void> {
  const probeId = randomUUID();
  const source = join(productDirectory, `.point-upload-probe-${probeId}.tmp`);
  const destination = join(
    productDirectory,
    `.point-upload-probe-${probeId}.link`,
  );
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  let sourceExists = false;
  let destinationExists = false;
  try {
    handle = await open(source, 'wx', 0o600);
    sourceExists = true;
    await handle.sync();
    await handle.close();
    handle = undefined;
    await link(source, destination);
    destinationExists = true;
    await syncDirectory(productDirectory);
    await unlink(destination);
    destinationExists = false;
    await unlink(source);
    sourceExists = false;
    await syncDirectory(productDirectory);
  } finally {
    if (handle) {
      await handle.close();
    }
    if (destinationExists) {
      await unlink(destination);
    }
    if (sourceExists) {
      await unlink(source);
    }
  }
}

export async function prepareProductUploadRoot(
  configuredRoot?: string,
): Promise<PreparedProductUploadRoot> {
  try {
    const resolvedRoot = resolveProductUploadRoot(configuredRoot);
    await mkdir(resolvedRoot, { recursive: true, mode: 0o700 });
    const rootStat = await lstat(resolvedRoot);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
      throw new Error('上传根目录类型不安全');
    }
    await chmod(resolvedRoot, 0o700);

    const productPath = join(resolvedRoot, 'products');
    await mkdir(productPath, { recursive: true, mode: 0o700 });
    const productStat = await lstat(productPath);
    if (productStat.isSymbolicLink() || !productStat.isDirectory()) {
      throw new Error('商品图片目录类型不安全');
    }
    await chmod(productPath, 0o700);

    const prepared = await inspectUploadDirectories(resolvedRoot);
    await removeProviderArtifacts(prepared.productDirectory);
    await probeHardLinkSupport(prepared.productDirectory);
    return prepared;
  } catch {
    throw new Error('本地图片存储初始化失败');
  }
}

async function cleanupFailedPublish(
  handle: Awaited<ReturnType<typeof open>> | undefined,
  temporary: string,
  destination: string,
  productDirectory: string,
  temporaryExists: boolean,
  destinationExists: boolean,
): Promise<void> {
  let cleanupFailed = false;
  if (handle) {
    try {
      await handle.close();
    } catch {
      cleanupFailed = true;
    }
  }
  if (destinationExists) {
    try {
      await unlink(destination);
    } catch {
      cleanupFailed = true;
    }
  }
  if (temporaryExists) {
    try {
      await unlink(temporary);
    } catch {
      cleanupFailed = true;
    }
  }
  if (temporaryExists || destinationExists) {
    try {
      await syncDirectory(productDirectory);
    } catch {
      cleanupFailed = true;
    }
  }
  if (cleanupFailed) {
    throw storageError();
  }
}

@Injectable()
export class LocalStorageProvider
  extends StorageProvider
  implements OnModuleInit
{
  private readonly configuredRoot: string;
  private preparation?: Promise<PreparedProductUploadRoot>;

  constructor(@Optional() @Inject(PRODUCT_UPLOAD_ROOT) uploadRoot?: string) {
    super();
    this.configuredRoot = resolveProductUploadRoot(uploadRoot);
  }

  async onModuleInit(): Promise<void> {
    await this.ensurePrepared();
  }

  private ensurePrepared(): Promise<PreparedProductUploadRoot> {
    this.preparation ??= prepareProductUploadRoot(this.configuredRoot).catch(
      () => {
        throw storageError();
      },
    );
    return this.preparation;
  }

  async putProductImage(
    image: NormalizedProductImage,
  ): Promise<StoredProductImage> {
    const prepared = await this.ensurePrepared();

    const fileName = `${randomUUID()}.${image.keyExtension}`;
    const key = `products/${fileName}`;
    const destination = join(prepared.productDirectory, fileName);
    const temporary = join(
      prepared.productDirectory,
      `.point-upload-${randomUUID()}.tmp`,
    );
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    let temporaryExists = false;
    let destinationExists = false;
    try {
      const current = await inspectUploadDirectories(this.configuredRoot);
      if (current.productDirectory !== prepared.productDirectory) {
        throw new Error('商品图片目录已变化');
      }
      handle = await open(temporary, 'wx', 0o600);
      temporaryExists = true;
      await handle.writeFile(image.buffer);
      await handle.sync();
      await handle.close();
      handle = undefined;

      const beforePublish = await inspectUploadDirectories(this.configuredRoot);
      if (beforePublish.productDirectory !== prepared.productDirectory) {
        throw new Error('商品图片目录已变化');
      }
      await link(temporary, destination);
      destinationExists = true;
      await syncDirectory(prepared.productDirectory);
      await unlink(temporary);
      temporaryExists = false;
      await syncDirectory(prepared.productDirectory);
    } catch {
      await cleanupFailedPublish(
        handle,
        temporary,
        destination,
        prepared.productDirectory,
        temporaryExists,
        destinationExists,
      );
      throw storageError();
    }

    return {
      key,
      url: `/uploads/${key}`,
    };
  }
}
