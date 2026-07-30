import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
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
    openSpy.mockImplementationOnce(async (path, flags, mode) => {
      const handle = await realOpen(path, flags, mode);
      jest.spyOn(handle, 'writeFile').mockImplementationOnce(async () => {
        await handle.write(Buffer.from('partial'));
        throw new Error('模拟磁盘写入失败');
      });
      return handle;
    });

    await expect(
      provider.putProductImage({
        buffer: validPng,
        originalname: 'image.png',
        mimetype: 'image/png',
      }),
    ).rejects.toThrow('模拟磁盘写入失败');
    openSpy.mockRestore();

    await expect(readdir(join(uploadRoot, 'products'))).resolves.toEqual([]);
  });
});
