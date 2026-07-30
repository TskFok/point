import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalStorageProvider } from './local-storage.provider';

const fsPromises = process.getBuiltinModule('node:fs/promises');
const validPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

describe('LocalStorageProvider', () => {
  let uploadRoot: string;

  beforeEach(async () => {
    uploadRoot = await mkdtemp(join(tmpdir(), 'point-task7-storage-'));
  });

  afterEach(async () => {
    await rm(uploadRoot, { recursive: true, force: true });
  });

  it('忽略原始文件名并以检测出的扩展名非覆盖写入商品目录', async () => {
    const provider = new LocalStorageProvider(uploadRoot);

    const stored = await provider.putProductImage({
      buffer: validPng,
      originalname: '../../秘密.svg',
      mimetype: 'text/plain',
    });

    expect(stored.key).toMatch(
      /^products\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png$/,
    );
    expect(stored.url).toBe(`/uploads/${stored.key}`);
    await expect(readFile(join(uploadRoot, stored.key))).resolves.toEqual(
      validPng,
    );
    expect(stored.key).not.toContain('秘密');
    expect(stored.key).not.toContain('svg');
  });

  it('无效图片不创建商品目录也不写入文件', async () => {
    const provider = new LocalStorageProvider(uploadRoot);

    await expect(
      provider.putProductImage({
        buffer: Buffer.from('<svg></svg>'),
        originalname: 'image.png',
        mimetype: 'image/png',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    await expect(readdir(uploadRoot)).resolves.toEqual([]);
  });

  it('写入中途失败时不留下可公开的部分文件或临时文件', async () => {
    const provider = new LocalStorageProvider(uploadRoot);
    const realOpen = fsPromises.open;
    const openSpy = jest.spyOn(fsPromises, 'open');
    openSpy.mockImplementation(async (path, flags, mode) => {
      const handle = await realOpen(path, flags, mode);
      if (
        String(path).includes('.point-upload-') &&
        !String(path).includes('.point-upload-probe-') &&
        String(path).endsWith('.tmp')
      ) {
        jest.spyOn(handle, 'writeFile').mockImplementationOnce(async () => {
          await handle.write(Buffer.from('partial'));
          throw new Error('模拟磁盘写入失败');
        });
      }
      return handle;
    });

    await expect(
      provider.putProductImage({
        buffer: validPng,
        originalname: 'image.png',
        mimetype: 'image/png',
      }),
    ).rejects.toMatchObject({ code: 'STORAGE_ERROR' });
    openSpy.mockRestore();

    await expect(readdir(join(uploadRoot, 'products'))).resolves.toEqual([]);
  });

  it('拒绝指向外部目录的上传根目录符号链接且不向外部写入', async () => {
    const external = await mkdtemp(join(tmpdir(), 'point-task7-external-'));
    const linkedRoot = join(uploadRoot, 'linked-root');
    await symlink(external, linkedRoot, 'dir');
    const provider = new LocalStorageProvider(linkedRoot);

    try {
      await expect(
        provider.putProductImage({
          buffer: validPng,
          originalname: 'image.png',
          mimetype: 'image/png',
        }),
      ).rejects.toMatchObject({ code: 'STORAGE_ERROR' });
      await expect(readdir(external)).resolves.toEqual([]);
    } finally {
      await rm(external, { recursive: true, force: true });
    }
  });

  it('拒绝上传根目录内指向外部的 products 符号链接', async () => {
    const external = await mkdtemp(join(tmpdir(), 'point-task7-products-'));
    await symlink(external, join(uploadRoot, 'products'), 'dir');
    const provider = new LocalStorageProvider(uploadRoot);

    try {
      await expect(
        provider.putProductImage({
          buffer: validPng,
          originalname: 'image.png',
          mimetype: 'image/png',
        }),
      ).rejects.toMatchObject({ code: 'STORAGE_ERROR' });
      await expect(readdir(external)).resolves.toEqual([]);
    } finally {
      await rm(external, { recursive: true, force: true });
    }
  });

  it('首次初始化清理仅属于 provider 的陈旧隐藏临时文件并保留其他文件', async () => {
    const products = join(uploadRoot, 'products');
    await mkdir(products, { mode: 0o700 });
    const stale = join(
      products,
      '.point-upload-123e4567-e89b-42d3-a456-426614174000.tmp',
    );
    const unrelated = join(products, '.keep-me');
    await writeFile(stale, 'stale');
    await writeFile(unrelated, 'keep');
    const provider = new LocalStorageProvider(uploadRoot);

    await provider.putProductImage({
      buffer: validPng,
      originalname: 'image.png',
      mimetype: 'image/png',
    });

    await expect(lstat(stale)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(unrelated, 'utf8')).resolves.toBe('keep');
  });

  it('临时文件删除失败不会被静默吞掉或返回成功结果', async () => {
    const provider = new LocalStorageProvider(uploadRoot);
    const realUnlink = fsPromises.unlink;
    const unlinkSpy = jest.spyOn(fsPromises, 'unlink');
    unlinkSpy.mockImplementation(async (path) => {
      if (
        String(path).includes('.point-upload-') &&
        !String(path).includes('.point-upload-probe-') &&
        String(path).endsWith('.tmp')
      ) {
        throw new Error(`敏感路径：${String(path)}`);
      }
      return realUnlink(path);
    });

    try {
      const thrown: unknown = await provider
        .putProductImage({
          buffer: validPng,
          originalname: 'image.png',
          mimetype: 'image/png',
        })
        .catch((error: unknown) => error);
      expect(thrown).toMatchObject({ code: 'STORAGE_ERROR' });
      expect(thrown).toBeInstanceOf(Error);
      if (thrown instanceof Error) {
        expect(thrown.message).not.toContain(uploadRoot);
      }
    } finally {
      unlinkSpy.mockRestore();
    }
  });

  it('将上传根、products 与发布文件权限分别限制为 0700、0700、0600', async () => {
    const provider = new LocalStorageProvider(uploadRoot);
    const stored = await provider.putProductImage({
      buffer: validPng,
      originalname: 'image.png',
      mimetype: 'image/png',
    });

    expect((await stat(uploadRoot)).mode & 0o777).toBe(0o700);
    expect((await stat(join(uploadRoot, 'products'))).mode & 0o777).toBe(0o700);
    expect((await stat(join(uploadRoot, stored.key))).mode & 0o777).toBe(0o600);
  });

  it('启动时显式探测 hardlink 能力并以无路径错误拒绝不支持的文件系统', async () => {
    const provider = new LocalStorageProvider(uploadRoot);
    const realLink = fsPromises.link;
    const linkSpy = jest.spyOn(fsPromises, 'link');
    linkSpy.mockImplementation(async (source, destination) => {
      if (String(source).includes('.point-upload-probe-')) {
        const error = new Error('不支持 hardlink') as NodeJS.ErrnoException;
        error.code = 'ENOTSUP';
        throw error;
      }
      return realLink(source, destination);
    });

    try {
      const thrown: unknown = await provider
        .putProductImage({
          buffer: validPng,
          originalname: 'image.png',
          mimetype: 'image/png',
        })
        .catch((error: unknown) => error);
      expect(thrown).toMatchObject({ code: 'STORAGE_ERROR' });
      expect(thrown).toBeInstanceOf(Error);
      if (thrown instanceof Error) {
        expect(thrown.message).not.toContain(uploadRoot);
      }
      await expect(readdir(join(uploadRoot, 'products'))).resolves.toEqual([]);
    } finally {
      linkSpy.mockRestore();
    }
  });

  it('hardlink 发布与临时名删除后均 fsync 商品目录', async () => {
    const provider = new LocalStorageProvider(uploadRoot);
    const openSpy = jest.spyOn(fsPromises, 'open');

    try {
      await provider.putProductImage({
        buffer: validPng,
        originalname: 'image.png',
        mimetype: 'image/png',
      });
      const directorySyncOpens = openSpy.mock.calls.filter(
        ([path, flags]) => String(path).endsWith('/products') && flags === 'r',
      );
      expect(directorySyncOpens.length).toBeGreaterThanOrEqual(4);
    } finally {
      openSpy.mockRestore();
    }
  });
});
