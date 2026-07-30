import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { disposeE2eResources } from './e2e-resource-lifecycle';

describe('商品 E2E 生命周期清理', () => {
  it('初始化失败且 app/prisma 未赋值时仍删除精确临时目录并恢复环境', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'point-task7-lifecycle-'));
    const uploadRoot = join(parent, 'upload-root');
    const sibling = join(parent, 'must-remain');
    await mkdir(uploadRoot);
    await writeFile(join(uploadRoot, 'temporary'), 'temporary');
    await writeFile(sibling, 'keep');
    const previousUploadRoot = process.env.PRODUCT_UPLOAD_ROOT;
    process.env.PRODUCT_UPLOAD_ROOT = uploadRoot;
    let app: { close: () => Promise<void> } | undefined;
    let prisma: { cleanup: () => Promise<void> } | undefined;

    try {
      await expect(
        disposeE2eResources({
          cleanupDatabase: async () => {
            await prisma?.cleanup();
          },
          closeApplication: async () => {
            await app?.close();
          },
          removeUploadRoot: async () => {
            await rm(uploadRoot, { recursive: true, force: true });
          },
          restoreEnvironment: () => {
            if (previousUploadRoot === undefined) {
              delete process.env.PRODUCT_UPLOAD_ROOT;
            } else {
              process.env.PRODUCT_UPLOAD_ROOT = previousUploadRoot;
            }
          },
        }),
      ).resolves.toBeUndefined();
      await expect(access(uploadRoot)).rejects.toMatchObject({
        code: 'ENOENT',
      });
      await expect(access(sibling)).resolves.toBeUndefined();
      expect(process.env.PRODUCT_UPLOAD_ROOT).toBe(previousUploadRoot);
    } finally {
      await rm(parent, { recursive: true, force: true });
      if (previousUploadRoot === undefined) {
        delete process.env.PRODUCT_UPLOAD_ROOT;
      } else {
        process.env.PRODUCT_UPLOAD_ROOT = previousUploadRoot;
      }
    }
  });

  it('前序清理失败时仍执行应用、目录和环境清理', async () => {
    const calls: string[] = [];

    await expect(
      disposeE2eResources({
        cleanupDatabase: async () => {
          await Promise.resolve();
          calls.push('database');
          throw new Error('database failed');
        },
        closeApplication: async () => {
          await Promise.resolve();
          calls.push('application');
        },
        removeUploadRoot: async () => {
          await Promise.resolve();
          calls.push('upload-root');
        },
        restoreEnvironment: () => {
          calls.push('environment');
        },
      }),
    ).rejects.toBeInstanceOf(AggregateError);
    expect(calls).toEqual([
      'database',
      'application',
      'upload-root',
      'environment',
    ]);
  });
});
