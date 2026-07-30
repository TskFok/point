import { type INestApplication } from '@nestjs/common';
import { link, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  configureLocalStaticFiles,
  isSafeProductUploadFile,
} from './local-static-files';

const fileName = '123e4567-e89b-42d3-a456-426614174000.png';
const validPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

describe('configureLocalStaticFiles', () => {
  let uploadRoot: string;

  beforeEach(async () => {
    uploadRoot = await mkdtemp(join(tmpdir(), 'point-task7-static-'));
  });

  afterEach(async () => {
    await rm(uploadRoot, { recursive: true, force: true });
  });

  it('只公开 canonical products 目录内的普通文件', async () => {
    const products = join(uploadRoot, 'products');
    await mkdir(products, { mode: 0o700 });
    await writeFile(join(products, fileName), validPng, { mode: 0o600 });
    const use = jest.fn();
    const app = { use } as unknown as INestApplication;

    await configureLocalStaticFiles(app, uploadRoot);

    await expect(
      isSafeProductUploadFile(uploadRoot, `/products/${fileName}`),
    ).resolves.toBe(true);
    expect(use).toHaveBeenCalledWith(
      '/uploads',
      expect.any(Function),
      expect.any(Function),
    );
  });

  it('拒绝配置为指向外部目录的上传根符号链接', async () => {
    const external = await mkdtemp(join(tmpdir(), 'point-task7-static-out-'));
    const linkedRoot = join(uploadRoot, 'linked-root');
    await symlink(external, linkedRoot, 'dir');
    const app = { use: jest.fn() } as unknown as INestApplication;

    try {
      await expect(
        Promise.resolve().then(() =>
          configureLocalStaticFiles(app, linkedRoot),
        ),
      ).rejects.toThrow('本地图片存储初始化失败');
    } finally {
      await rm(external, { recursive: true, force: true });
    }
  });

  it('不读取 products 目录内指向外部文件的符号链接', async () => {
    const products = join(uploadRoot, 'products');
    const external = await mkdtemp(join(tmpdir(), 'point-task7-static-file-'));
    const secret = join(external, 'secret.png');
    await mkdir(products, { mode: 0o700 });
    await writeFile(secret, validPng);
    await symlink(secret, join(products, fileName));
    const app = { use: jest.fn() } as unknown as INestApplication;

    try {
      await configureLocalStaticFiles(app, uploadRoot);
      await expect(
        isSafeProductUploadFile(uploadRoot, `/products/${fileName}`),
      ).resolves.toBe(false);
    } finally {
      await rm(external, { recursive: true, force: true });
    }
  });

  it('不公开链接计数大于一的商品图片文件', async () => {
    const products = join(uploadRoot, 'products');
    const productImage = join(products, fileName);
    await mkdir(products, { mode: 0o700 });
    await writeFile(productImage, validPng, { mode: 0o600 });
    await link(productImage, join(uploadRoot, 'shared-copy.png'));
    const app = { use: jest.fn() } as unknown as INestApplication;

    await configureLocalStaticFiles(app, uploadRoot);

    await expect(
      isSafeProductUploadFile(uploadRoot, `/products/${fileName}`),
    ).resolves.toBe(false);
  });

  it('拒绝配置 root 内指向外部目录的 products 符号链接', async () => {
    const external = await mkdtemp(join(tmpdir(), 'point-task7-static-dir-'));
    await symlink(external, join(uploadRoot, 'products'), 'dir');
    const app = { use: jest.fn() } as unknown as INestApplication;

    try {
      await expect(configureLocalStaticFiles(app, uploadRoot)).rejects.toThrow(
        '本地图片存储初始化失败',
      );
    } finally {
      await rm(external, { recursive: true, force: true });
    }
  });
});
